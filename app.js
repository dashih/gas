var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var util = require('util');
var lockFile = require('lockfile');
var carDataProcessor = require('./car-data-processor');

var PORT = 81;
var CAR_FILE = Object.freeze('data/cars.json');
var CAR_LOCK = Object.freeze('data/cars.lock');

var app = express();
var cachedData = { 'numTransactions': 0 };

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/request', (req, res) => {
    res.send(cachedData);
});

function check(err, res, msg) {
    if (err) {
        res.status(500).send('Fatal error :: ' + msg + ' :: ' + err);
        throw err;
    }
}

app.post('/submit', (req, res) => {
    lockFile.lock(CAR_LOCK, { 'wait': 3000 }, errLock => {
        if (errLock) {
            // Though unexpected, don't throw here since it could just be a bad case of lock contention.
            res.status(500).send(
                errLock.code === 'EEXIST' ?
                    'Car lock is taken. Try again later.' :
                    'Error acquiring car lock:' + errLock);
            return;
        }

        // Open for read/write.
        fs.open(CAR_FILE, 'r+', (errOpen, fd) => {
            check(errOpen, res, 'Error opening car file.');

            // Read existing data.
            fs.readFile(fd, (errRead, dataRead) => {
                check(errRead, res, 'Error reading existing data from car file.');

                // Prepare the write payload.
                let payload = JSON.parse(dataRead);
                if (payload[req.body.car] == null) {
                    payload[req.body.car] = [];
                }

                // Remove the car property since the master file groups by car.
                let transaction = JSON.parse(JSON.stringify(req.body));
                delete transaction.car;
                transaction['date'] = new Date();
                payload[req.body.car].push(transaction);

                // Persist to disk.
                fs.writeFile(fd, JSON.stringify(payload, null, 4), 'utf8', errWrite => {
                    check(errWrite, res, 'Error writing car file.');

                    // Update the cache and cleanup.
                    cachedData = carDataProcessor.getProcessedData(payload);
                    fs.close(fd, errClose => {
                        check(errClose, res, 'Error closing car file.');
                        lockFile.unlock(CAR_LOCK, errUnlock => {
                            check(errUnlock, res, 'Error release car lock.');
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

app.listen(PORT);
