'use strict';

const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsAsync = require('fs').promises;
const MongoClient = require('mongodb').MongoClient;
const moment = require('moment');
const os = require('os');
const axios = require('axios');

// Parse config
const config = JSON.parse(fs.readFileSync(process.env.GAS_CONFIG, 'utf8'));
const port = config['port'];
const db = Object.freeze(config['db']);
const dbUser = Object.freeze(config['dbUser']);
const dbPassword = Object.freeze(config['dbPassword']);
const openExchangeRatesUrl = Object.freeze(`https://openexchangerates.org/api/latest.json?app_id=${config['openExchangeRatesAppId']}`);

// Maintenance mode
const maintenanceModeFile = Object.freeze('maintenance.lock');

const dbCollection = Object.freeze('transactions');

// Setup express
const app = express();
app.use(bodyParser.json());

// Serve the client application (index.html/js/css).
app.use(express.static('client'));

function checkMaintenanceMode(res) {
    if (fs.existsSync(maintenanceModeFile)) {
        res.status(503).send('Routine maintenance. Please try again later!');
        return true;
    }

    return false;
}

async function getMongoClient() {
    return await MongoClient.connect(
        `mongodb://${dbUser}:${encodeURIComponent(dbPassword)}@${process.env.GAS_DB_HOST}`,
        { useNewUrlParser: true, useUnifiedTopology: true })
        .catch(connErr => {
            console.error(connErr);
        });
}

app.get('/api/getVersion', async (req, res) => {
    const packageJson = JSON.parse(await fsAsync.readFile('package.json', 'utf8'));
    const client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        const mongoInfo = await client.db(db).admin().serverInfo();
        res.send({
            osVersion: `${os.type()} ${os.release().replace('-generic', '')}`,
            appVersion: packageJson['version'],
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

app.get('/api/getCADRate', async (req, res) => {
    try {
        const openExchangeReq = await axios.get(openExchangeRatesUrl);
        console.log(`retrieved CAD rate ${openExchangeReq.data.rates.CAD}`);
        res.send({
            cadPerUsd: openExchangeReq.data.rates.CAD
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving currency exchange rates.');
    }
});

/*
 * Aggregate data is calculated for both the current car and lifetime.
 */
async function populateAggregateData(client, data, carCondition) {
    await client.db(db).collection(dbCollection).aggregate([
        {
            $match: carCondition
        },
        {
            $group: {
                _id: null,
                numTransactions: { $sum: 1 },
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
        for (const k in doc) {
            if (k !== '_id') {
                data[k] = doc[k] === null ? 0.0 : doc[k];
            }
        }
    });

    // Dividing the difference between the last and first dates, and the 
    // number of transactions gives the average time between fills.
    const firstDate = moment((await client.db(db).collection(dbCollection)
        .find(carCondition).sort({ date: +1 }).limit(1).toArray())[0].date);
    const lastDate = moment((await client.db(db).collection(dbCollection)
        .find(carCondition).sort({ date: -1 }).limit(1).toArray())[0].date);
    const firstLastDiff = lastDate.diff(firstDate);
    data['avgTimeBetween'] = moment.duration(firstLastDiff / data.numTransactions).asDays();
    data['dateRange'] =
        `${moment.duration(firstLastDiff).asYears().toFixed(1)} years | ${firstDate.format('YYYY')}-${lastDate.format('YYYY')}`;
}

app.post('/api/getCarData', async (req, res) => {
    if (checkMaintenanceMode(res)) {
        return;
    }

    const car = req.body.car;
    const startTime = moment();

    const client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        const data = {};
        const lifetimeData = {};
        data['transactions'] = new Array();

        // Populate raw transaction data and calculate basic aggregate fields.
        await client.db(db).collection(dbCollection).find({car: car}).sort({ date: -1 }).forEach(doc => {
            // mpg and munny are generated (not stored in db)
            doc['mpg'] = doc['miles'] / doc['gallons'];
            doc['munny'] = doc['gallons'] * doc['pricePerGallon'];

            data['transactions'].push(doc);
        });

        if (data['transactions'].length > 0) {
            await populateAggregateData(client, data, { car: car });
            await populateAggregateData(client, lifetimeData, {});
        }

        console.log(`retrieved data for ${car}`);
        res.send({
            carData: data,
            lifetimeData: lifetimeData,
            duration: moment().diff(startTime, 'milliseconds')
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    } finally {
        client.close();
    }
});

app.post('/api/submit', async (req, res) => {
    const startTime = moment();

    if (checkMaintenanceMode(res)) {
        return;
    }

    const nonce = req.body.nonce;
    const transaction = req.body;

    // Set the date field to now.
    transaction['date'] = new Date().toISOString();

    // Write to db.
    const client = await getMongoClient();
    if (client == null) {
        res.status(500).send("Error connecting to MongoDB. See logs.");
        return;
    }

    try {
        // Check the nonce.
        const nonceRecord = await client.db(db).collection(dbCollection).findOne({ nonce: nonce });
        if (nonceRecord !== null) {
            throw 'Nonce exists!';
        }
        
        const insertResult = await client.db(db).collection(dbCollection).insertOne(transaction);
        if (insertResult.result.ok) {
            console.log(`inserted ${insertResult.insertedId} into the db`);
            res.send({ duration: moment().diff(startTime, "milliseconds") });
        }
    } catch (err) {
        if (err === 'Nonce exists!') {
            res.status(401).send(err);
        } else {
            console.error(err);
            res.status(500).send(err);
        }
    } finally {
        client.close();
    }
});

console.log(`Listening on port ${port}`);
http.createServer(app).listen(port);
