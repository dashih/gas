'use strict';

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
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

const app = express();

app.use(express.static('client'));
app.use(bodyParser.json());

app.get('/getVersion', async (req, res) => {
    let fullOsVersion = await fsAsync.readFile('/etc/centos-release', 'utf8');
    let osVersion = fullOsVersion.match(/[0-9,\.]+/)[0];
    let packageJson = JSON.parse(await fsAsync.readFile('package.json', 'utf8'));
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
        res.send({
            osVersion: osVersion,
            appVersion: packageJson['version'],
            nodeVersion: process.version,
            mongoVersion: mongoInfo.version,
            mongoClientVersion: packageJson['dependencies']['mongodb'],
            expressVersion: packageJson['dependencies']['express']
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    } finally {
        client.close();
    }
});

async function retrieveData(res) {
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
        }

        res.send(data);
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

        // Trigger another full retrieve.
        await retrieveData(res);
    } catch (err) {
        res.send(err);
    } finally {
        client.close();
    }
});

https.createServer(httpsOptions, app).listen(httpsPort);
