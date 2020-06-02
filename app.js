'use strict';

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const carDataProcessor = require('./car-data-processor');
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
const dbFormat = Object.freeze(util.format('mongodb://%%s:%%s@%s/%s', config['dbHost'], config['db']));
const dbReadOnlyUser = Object.freeze(config['dbReadOnlyUser']);
const dbReadOnlyPassword = Object.freeze(config['dbReadOnlyPassword']);

const app = express();

var cachedRawData = {};
var cachedData = {};

app.use(express.static('client'));
app.use(bodyParser.json());

app.get('/getNodeVersion', (req, res) => {
    res.send(process.version);
});

app.post('/request', async (req, res) => {
    let client = await MongoClient.connect(
        util.format(dbFormat, dbReadOnlyUser, encodeURIComponent(dbReadOnlyPassword)),
        { useNewUrlParser: true, useUnifiedTopology: true })
        .catch(connErr => { console.log(connErr); });
    try {
        let data = {};
        let gasDb = client.db('gas');
        let collections = await gasDb.listCollections().toArray();
        for (let collection of collections) {
            let car = collection['name'];

            // Record the first and last fillup date to calculate average time between fills.
            let firstDate = null;
            let lastDate = null;

            await gasDb.collection(car).find({}).sort({ date: -1 }).forEach(doc => {
                if (data[car] == null) {
                    data[car] = {};
                    data[car]['transactions'] = new Array();
                }

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
});

app.post('/submit', async (req, res) => {
    let providedPassword = crypto.createHash("sha512").update(req.body.password).digest("hex");
    if (providedPassword !== password) {
        res.status(403).send('Wrong password');
        return;
    }

    // Delete the password property.
    let transaction = JSON.parse(JSON.stringify(req.body));
    delete transaction.password;
    transaction['date'] = new Date();

    if (cachedRawData[transaction.car] == null) {
        cachedRawData[transaction.car] = new Array();
    }

    // Persist to disk.
    try {
        let file;
        do {
            file = path.join(dataDir, crypto.randomBytes(16).toString('hex')) + '.json';
        } while (await fs.pathExists(file));

        await fs.writeFile(file, JSON.stringify(transaction, null, 4));
        await fs.chown(file, uid, gid);
        console.log('wrote ' + file);

        // Update cached data.
        cachedRawData[transaction.car].push(transaction);
        cachedData = carDataProcessor.getProcessedData(cachedRawData);
        res.send(cachedData);
    } catch (err) {
        let errMsg = 'error recording transaction: ' + err;
        console.log(errMsg);
        res.status(500).send(errMsg);
    }
});

https.createServer(httpsOptions, app).listen(httpsPort);
