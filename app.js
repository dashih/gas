'use strict';

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
const redis = require('redis');
const util = require('util');
const moment = require('moment');

// Parse config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const httpsPort = config['port'];
const httpsOptions = {
    key: fs.readFileSync(config['sslKeyFile']),
    cert: fs.readFileSync(config['sslCertFile']),
    ca: fs.readFileSync(config['sslCaFile'])
};
const db = config['db'];
const dbReadWriteUser = config['dbReadWriteUser'];
const dbFormat = Object.freeze(util.format('mongodb://%%s:%%s@%s/%s', config['dbHost'], db));
const dbReadOnlyUser = Object.freeze(config['dbReadOnlyUser']);
const dbReadOnlyPassword = Object.freeze(config['dbReadOnlyPassword']);
const redisHost = Object.freeze(config['redisHost']);
const redisPassword = Object.freeze(config['redisPassword']);
const redisDb = config['redisDb'];

// Setup express
const app = express();
app.use(express.static('client'));
app.use(bodyParser.json());

// Setup redis. The redis module manages connections automatically and we do not
// need multiple users, so we can just create one global client.
const redisClient = redis.createClient(redisHost);
redisClient.auth(redisPassword);
const redisSelect = util.promisify(redisClient.select).bind(redisClient);
const redisGet = util.promisify(redisClient.get).bind(redisClient);
const redisSet = util.promisify(redisClient.set).bind(redisClient);
const redisDel = util.promisify(redisClient.del).bind(redisClient);
redisClient.on("error", redisErr => {
    console.warn("Redis error. There may be problems with stale data. " + redisErr);
});

app.get('/getVersion', async (req, res) => {
    let packageJson = JSON.parse(await fsAsync.readFile('package.json', 'utf8'));
    let appVersion = packageJson['version'];

    // Check redis with app version as the key.
    let versions = null;
    try {
        await redisSelect(redisDb);
        versions = JSON.parse(await redisGet(appVersion));

        // If there is no versions string cached for this app version, generate.
        if (versions === null) {
            console.log("No versions string found in cache");

            let fullOsVersion = await fsAsync.readFile('/etc/centos-release', 'utf8');
            let osVersion = fullOsVersion.match(/[0-9,\.]+/)[0];
            let client = await MongoClient.connect(
                util.format(dbFormat, dbReadOnlyUser, encodeURIComponent(dbReadOnlyPassword)),
                { useNewUrlParser: true, useUnifiedTopology: true })
                .catch(connErr => {
                    console.error(connErr);
                    res.status(500).send(connErr);
                });
            if (client == null) {
                return;
            }

            try {
                let mongoInfo = await client.db(db).admin().serverInfo();
                versions = {
                    osVersion: osVersion,
                    appVersion: appVersion,
                    nodeVersion: process.version,
                    mongoVersion: mongoInfo.version,
                    mongoClientVersion: packageJson['dependencies']['mongodb'],
                    redisVersion: redisClient.server_info.redis_version,
                    redisClientVersion: packageJson['dependencies']['redis'],
                    expressVersion: packageJson['dependencies']['express']
                };

                await redisSet(appVersion, JSON.stringify(versions));
            } catch (err) {
                console.error(err);
                res.status(500).send(err);
            } finally {
                client.close();
            }
        }

        res.send(versions);
    } catch (redisErr) {
        console.error(redisErr);
        res.status(500).send(redisErr);
    }
});

async function retrieveData(res) {
    let startTime = moment();

    let client = await MongoClient.connect(
        util.format(dbFormat, dbReadOnlyUser, encodeURIComponent(dbReadOnlyPassword)),
        { useNewUrlParser: true, useUnifiedTopology: true })
        .catch(connErr => {
            console.error(connErr);
            res.status(500).send(connErr);
        });
    if (client == null) {
        return;
    }

    try {
        let data = {};
        let gasDb = client.db(db);
        let collections = await gasDb.listCollections().toArray();
        for (let collection of collections) {
            let car = collection['name'];
            data[car] = null;

            // Check Redis for cached data
            await redisSelect(redisDb);
            data[car] = JSON.parse(await redisGet(car));

            if (data[car] === null) {
                console.log("No cached data for " + car);

                data[car] = {};
                data[car]['transactions'] = new Array();

                // Record the first and last fillup date to calculate average time between fills.
                let firstDate = null;
                let lastDate = null;

                // Populate raw transaction data and calculate basic aggregate fields.
                await gasDb.collection(car).find({}).sort({ date: -1 }).forEach(doc => {
                    // mpg and munny are generated (not stored in db)
                    doc['mpg'] = doc['miles'] / doc['gallons'];
                    doc['munny'] = doc['gallons'] * doc['pricePerGallon'];

                    // The data is sorted most recent to least.
                    if (lastDate === null) {
                        lastDate = moment(doc['date']);
                    }
                    firstDate = moment(doc['date']);

                    data[car]['transactions'].push(doc);
                });

                // Populate complex aggregate fields using MongoDB.
                await gasDb.collection(car).aggregate([
                    {
                        $group: {
                            _id: null,
                            numTransactions: { $sum: 1},
                            avgMpg: { $avg: { $divide: ['$miles', '$gallons'] } },
                            stdDevMpg: { $stdDevSamp: { $divide: ['$miles', '$gallons'] } },
                            minMpg: { $min: { $divide: ['$miles', '$gallons'] } },
                            maxMpg: { $max: { $divide: ['$miles', '$gallons'] } },
                            totalMunny: { $sum: { $multiply: ['$gallons', '$pricePerGallon'] } },
                            avgMunny: { $avg: { $multiply: ['$gallons', '$pricePerGallon'] } },
                            stdDevMunny: { $stdDevSamp: { $multiply: ['$gallons', '$pricePerGallon'] } },
                            totalGallons: { $sum: '$gallons' },
                            avgGallons: { $avg: '$gallons' },
                            stdDevGallons: { $stdDevSamp: '$gallons' },
                            totalMiles: { $sum: '$miles' },
                            avgMiles: { $avg: '$miles' },
                            stdDevMiles: { $stdDevSamp: '$miles' },
                            avgPricePerGallon: { $avg: '$pricePerGallon' },
                            stdDevPricePerGallon: { $stdDevSamp: '$pricePerGallon' }
                        }
                    }
                ]).forEach(doc => {
                    for (let k in doc) {
                        if (k !== '_id') {
                            data[car][k] = doc[k];
                        }
                    }

                    // Dividing the difference between the last and first dates and the
                    // number of transactions gives the average time between fills.
                    data[car]['avgTimeBetween'] = moment.duration(lastDate.diff(firstDate) / doc['numTransactions']).asDays();
                });

                // Cache data in redis
                await redisSet(car, JSON.stringify(data[car]));
            }
        }

        let duration = moment().diff(startTime, "milliseconds");
        res.send({
            "data": data,
            "duration": duration
        });
    } catch (err) {
        res.send(err);
    } finally {
        client.close();
    }
}

app.post('/request', async (req, res) => {
    await retrieveData(res);
});

app.post('/submit', async (req, res) => {
    let dbRwPassword = req.body.password;
    let car = req.body.car;

    // Delete the password field since we only use that to auth with the db.
    // Delete the car field, because we use a MongoDB collection for each car.
    let transaction = JSON.parse(JSON.stringify(req.body));
    delete transaction.password;
    delete transaction.car;

    // Set the date field to now.
    transaction['date'] = new Date();

    // Write to db.
    let client = await MongoClient.connect(
        util.format(dbFormat, dbReadWriteUser, encodeURIComponent(dbRwPassword)),
        { useNewUrlParser: true, useUnifiedTopology: true })
        .catch(connErr => {
            console.error(connErr);
            if (connErr.message.includes("Authentication failed")) {
                res.status(403).send('Wrong password!');
            } else {
                res.status(500).send(connErr);
            }
        });
    if (client == null) {
        return;
    }

    try {
        await client.db(db).collection(req.body.car).insertOne(transaction);

        // Invalidate redis cache for car
        try {
            await redisSelect(redisDb);
            await redisDel(req.body.car);
        } catch (redisErr) {
            console.warn("Failed to delete entry from redis. Presented data could be stale!");
        }

        // Trigger another full retrieve.
        await retrieveData(res);
    } catch (err) {
        res.send(err);
    } finally {
        client.close();
    }
});

https.createServer(httpsOptions, app).listen(httpsPort);
