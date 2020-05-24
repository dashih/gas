'use strict';

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const carDataProcessor = require('./car-data-processor');

// Parse config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const dataDir = Object.freeze(config['dataDir']);
const password = Object.freeze(config['password']);

const httpsPort = 8080;
const httpsOptions = {
    key: fs.readFileSync(config['sslKeyFile']),
    cert: fs.readFileSync(config['sslCertFile']),
    ca: fs.readFileSync(config['sslCaFile'])
};

const app = express();

var cachedRawData = {};
var cachedData = {};

app.use(express.static('client'));
app.use(bodyParser.json());

app.get('/getNodeVersion', (req, res) => {
    res.send(process.version);
});

app.post('/request', (req, res) => {
    res.send(cachedData);
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

// Load data from disk.
let numFiles = 0;
fs.ensureDirSync(dataDir);
fs.readdirSync(dataDir).forEach(file => {
    let data = JSON.parse(fs.readFileSync(path.join(dataDir, file)));
    if (cachedRawData[data.car] == null) {
        cachedRawData[data.car] = new Array();
    }

    cachedRawData[data.car].push(data);
    numFiles++;
});

cachedData = carDataProcessor.getProcessedData(cachedRawData);
console.log('processed ' + numFiles + ' records');
https.createServer(httpsOptions, app).listen(httpsPort);
