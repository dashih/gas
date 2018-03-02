var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var util = require('util');

var app = express();

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/request', (req, res) => {
    let carFile = util.format('data/%s.json', req.body.car);
    try {
        if (fs.existsSync(carFile)) {
            let carData = JSON.parse(fs.readFileSync(carFile, 'utf8'));

            // Sort in inverse.
            carData.sort((x, y) => {
                let d0 = new Date(x.date).getTime();
                let d1 = new Date(y.date).getTime();
                if (d0 < d1) {
                    return 1;
                } else if (d0 > d1) {
                    return -1;
                } else {
                    return 0;
                }
            });

            res.send(carData);
        } else {
            res.send(JSON.stringify([]));
        }
    } catch (err) {
        res.status(500).send(err.message);
        throw err;
    }
});

app.post('/submit', (req, res) => {
    let carFile = util.format('data/%s.json', req.body.car);
    try {
        req.body.date = new Date();
        if (fs.existsSync(carFile)) {
            let carData = JSON.parse(fs.readFileSync(carFile, 'utf8'));
            carData.push(req.body);
            fs.writeFileSync(carFile, JSON.stringify(carData), 'utf8');
            res.send({});
        } else {
            fs.mkdirSync('data');
            fs.writeFileSync(carFile, JSON.stringify([ req.body ], 'utf8'));
            res.send({});
        }
    } catch (err) {
        res.status(500).send(err.message);
        throw err;
    }
});

app.listen(5000);
