var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var util = require('util');
var lockFile = require('lockfile');

var app = express();

function unlockCar(carLock, res) {
    lockFile.unlock(carLock, err => {
        if (err) {
            res.status(500).send(err);
            throw err;
        }
    });
}

function writeCarFile(carLock, carFile, data, req, res) {
    fs.writeFile(carFile, JSON.stringify(data), 'utf8', err => {
        if (err) {
            res.status(500).send(err);
            throw err;
        }

        res.send(req.body);
        unlockCar(carLock, res);
    });
}

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/submit', function(req, res) {
    var carFile = util.format('data/%s.json', req.body.car);
    var carLock = util.format('data/%s.lock', req.body.car);
    lockFile.lock(carLock, { wait: 3000 }, err => {
        if (err) {
            if (err.code == 'EEXIST') {
                res.status(500).send('Could not acquire lock for car file in time. Try again later.');
            } else {
                res.status(500).send(err);
            }

            console.log(err);
            return;
        }

        req.body.date = new Date();
        setTimeout(() => {
            if (fs.existsSync(carFile)) {
                fs.readFile(carFile, 'utf8', (err, data) => {
                    if (err) {
                        res.status(500).send(err);
                        throw err;
                    }

                    var carData = JSON.parse(data);
                    carData.push(req.body);
                    writeCarFile(carLock, carFile, carData, req, res);
                });
            } else {
                writeCarFile(carLock, carFile, [ req.body ], req, res);
            }
        }, 10000);
    });
});

app.listen(5000);
