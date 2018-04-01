const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const crypto = require('crypto');
const carDataProcessor = require('./car-data-processor');

const httpsPort = 8080;
const httpsOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/dannyshih.net/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/dannyshih.net/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/dannyshih.net/fullchain.pem')
};

const password = Object.freeze('expelliarmus');
const dataDir = Object.freeze('data/');

const app = express();

var cachedRawData = {};
var cachedData = {};

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/request', (req, res) => {
    res.send(cachedData);
});

app.post('/submit', (req, res) => {
    if (req.body.password !== password) {
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
    let file;
    do {
        file = crypto.randomBytes(16).toString('hex') + '.json';
    }
    while (fs.existsSync(file));

    fs.writeFile(dataDir + file, JSON.stringify(transaction, null, 4), 'utf8', err => {
        if (err) {
            let errMsg = 'error recording transaction: ' + err;
            console.log(errMsg);
            res.status(500).send(errMsg);
            return;
        }

        console.log('wrote ' + file);

        // Update cached data.
        cachedRawData[transaction.car].push(transaction);
        cachedData = carDataProcessor.getProcessedData(cachedRawData);
        res.send(cachedData);
    });
});

// Load data from disk.
let numFiles = 0;
fs.readdirSync(dataDir).forEach(file => {
    let data = JSON.parse(fs.readFileSync(dataDir + file));
    if (cachedRawData[data.car] == null) {
        cachedRawData[data.car] = new Array();
    }

    cachedRawData[data.car].push(data);
    numFiles++;
});

cachedData = carDataProcessor.getProcessedData(cachedRawData);
console.log('processed ' + numFiles + ' records');
https.createServer(httpsOptions, app).listen(httpsPort);
