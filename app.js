var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var util = require('util');
var lockfile = require('lockfile');
var carDataProcessor = require('./car-data-processor');

var CAR_FILE = Object.freeze('data/cars.json');
var CAR_LOCK = Object.freeze('data/cars.lock');

var app = express();
var cachedData = { 'numTransactions': 0 };

app.post('/request', (req, res) => {
    res.send(cachedData);
});

function check(err, res, msg) {
    if (err) {
        res.status(500).send('Fatal error :: ' msg + ' :: ' + err);
        throw err;
    }
}

app.post('/submit', (req, res) => {
    lockFile.lock(CAR_LOCK, { 'wait': 3000 }, err => {
        if (err) {
            // Though unexpected, don't throw here since it could just be a bad case of lock contention.
            res.status(500).send(
                err.code === 'EEXIST' ?
                    'Car lock is taken. Try again later.' :
                    'Error acquiring car lock:' + err);
        }

        // Open for read/write.
        fs.open(CAR_FILE, 'r+', (err, fd) => {
            check(err, res, 'Error opening car file.');

            // Read existing data.
            fs.readFile(fd, (err, data) => {
                check(err, res, 'Error reading existing data from car file.');

                // Prepare the write payload.
                let payload = JSON.parse(data);
                if (payload[req.body.car] == null) {
                    payload[req.body.car] = [];
                }

                // Remove the car property since the master file groups by car.
                let transaction = JSON.parse(JSON.stringify(req.body));
                delete transaction.car;
                transaction['date'] = new Date();
                payload[req.body.car].push(transaction);

                // Persist to disk.
                fs.writeFile(file, JSON.stringify(payload, null, 4), 'utf8', err => {
                    check(err, res, 'Error writing car file.');

                    // Read again to update the cache.
                    fs.readFile(fd, (err, data) => {
                        check(err, res, 'Error refreshing cache.');
                        cachedData = JSON.parse(data);
                        fs.close(fd, err => {
                            check(err, res, 'Error closing car file.');
                            res.send(cachedData);
                        });
                    });
                });
            });
        });
    });
});

// Initial synchronous creation or load of data from disk.
if (fs.existsSync(CAR_FILE)) {
    let rawData = JSON.parse(fs.readFileSync(CAR_FILE, 'utf8'));
    cachedData = carDataProcessor.getProcessedData(rawData);
} else {
    fs.writeFileSync(CAR_FILE, JSON.stringify({}), 'utf8');
}

app.use(express.static('client'));
app.use(bodyParser.json());

app.listen(5000);
