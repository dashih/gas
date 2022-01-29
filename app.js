'use strict';

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
const argon2 = require('argon2');
const util = require('util');
const moment = require('moment');
const axios = require('axios');

// Parse config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const httpsPort = config['port'];
const httpsOptions = {
    key: fs.readFileSync(config['sslKeyFile']),
    cert: fs.readFileSync(config['sslCertFile']),
    ca: fs.readFileSync(config['sslCaFile'])
};
const submitPassword = Object.freeze(config['submitPassword'].normalize());
const db = Object.freeze(config['db']);
const dbUser = Object.freeze(config['dbUser']);
const dbPassword = Object.freeze(config['dbPassword']);
const dbFormat = Object.freeze(util.format('mongodb://%%s:%%s@%s/%s', config['dbHost'], db));
const openExchangeRatesUrl = Object.freeze(
    util.format(
        'https://openexchangerates.org/api/latest.json?app_id=%s',
        config['openExchangeRatesAppId']));

// Maintenance mode
const maintenanceModeFile = Object.freeze('maintenance.lock');

const nonceCollection = Object.freeze('nonces');

// Setup express
const app = express();
app.use(express.static('client'));
app.use(bodyParser.json());

function checkMaintenanceMode(res) {
    if (fs.existsSync(maintenanceModeFile)) {
        res.status(503).send('Routine maintenance. Please try again later!');
        return true;
    }

    return false;
}

async function getMongoClient() {
    return await MongoClient.connect(
        util.format(dbFormat, dbUser, encodeURIComponent(dbPassword)),
        { useNewUrlParser: true, useUnifiedTopology: true })
        .catch(connErr => {
            console.error(connErr);
        });
}

app.get('/getVersion', async (req, res) => {
    let packageJson = JSON.parse(await fsAsync.readFile('package.json', 'utf8'));
    let appVersion = packageJson['version'];
    let osInfo = await fsAsync.readFile('/etc/lsb-release', 'utf8');
    let osVersion = osInfo.match(/DISTRIB_DESCRIPTION=\"(?<vers>.+)\"/).groups['vers'];
    let client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        let mongoInfo = await client.db(db).admin().serverInfo();
        res.send({
            osVersion: osVersion,
            appVersion: appVersion,
            nodeVersion: process.version,
            mongoVersion: mongoInfo.version,
            expressVersion: packageJson['dependencies']['express']
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    } finally {
        client.close();
    }
});

app.get('/getCADRate', async (req, res) => {
    try {
        const openExchangeReq = await axios.get(openExchangeRatesUrl);
        res.send({
            cadPerUsd: openExchangeReq.data.rates.CAD
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving currency exchange rates.');
    }
});

async function retrieveData(res) {
    let startTime = moment();

    let client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        let data = {};
        let gasDb = client.db(db);
        let collections = await gasDb.listCollections().toArray();
        collections = collections.filter(collection => collection !== 'nonces');
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

                let firstLastDiff = lastDate.diff(firstDate);

                // Dividing the difference between the last and first dates and the
                // number of transactions gives the average time between fills.
                data[car]['avgTimeBetween'] = moment.duration(firstLastDiff / doc['numTransactions']).asDays();

                // Populate date range string.
                data[car]['dateRange'] = util.format(
                    "%s years (%s to %s)",
                    moment.duration(firstLastDiff).asYears().toFixed(1),
                    firstDate.format("MMM YYYY"),
                    lastDate.format("MMM YYYY"));
            });
        }

        let duration = moment().diff(startTime, "milliseconds");
        res.send({
            "data": data,
            "duration": duration
        });
    } catch (err) {
        res.status(500).send(err);
    } finally {
        client.close();
    }
}

app.post('/request', async (req, res) => {
    if (checkMaintenanceMode(res)) {
        return;
    }

    await retrieveData(res);
});

app.post('/submit', async (req, res) => {
    if (checkMaintenanceMode(res)) {
        return;
    }

    // Check the password.
    let nonce = req.body.nonce;
    let passwordPlusNonce = util.format('%s.%s', submitPassword, nonce);
    let passwordHash = req.body.passwordHash.normalize("NFC");
    if (!await argon2.verify(passwordHash, passwordPlusNonce)) {
        res.status(401).send("Wrong password");
        return;
    }

    let car = req.body.car;

    // Delete the passwordHash field.
    // Delete the car field, because we use a MongoDB collection for each car.
    let transaction = JSON.parse(JSON.stringify(req.body));
    delete transaction.passwordHash;
    delete transaction.car;

    // Set the date field to now.
    transaction['date'] = new Date();

    // Write to db.
    let client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        // Check the nonce.
        let nonceRecord = await client.db(db).collection(nonceCollection).findOne({ nonce: nonce });
        if (nonceRecord !== null) {
            throw 'Nonce exists!';
        }
        
        await client.db(db).collection(nonceCollection).insertOne({ nonce: nonce });
        await client.db(db).collection(req.body.car).insertOne(transaction);

        // Trigger another full retrieve.
        await retrieveData(res);
    } catch (err) {
        if (err === 'Nonce exists!') {
            res.status(401).send(err);
        } else {
            res.status(500).send(err);
        }
    } finally {
        client.close();
    }
});

https.createServer(httpsOptions, app).listen(httpsPort);
