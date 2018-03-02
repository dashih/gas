var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var util = require('util');

var app = express();

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/request', (req, res) => {
    let carFile = util.format('data/%s.json', req.body.car);
    if (fs.existsSync(carFile)) {
        res.send(JSON.parse(fs.readFileSync(carFile, 'utf8')));
    } else {
        res.send(JSON.stringify([]));
    }
});

app.post('/submit', (req, res) => {
    let carFile = util.format('data/%s.json', req.body.car);
    setTimeout(() => {
        if (fs.existsSync(carFile)) {
            let carData = JSON.parse(fs.readFileSync(carFile, 'utf8'));
            carData.push(req.body);
            fs.writeFileSync(carFile, JSON.stringify(carData), 'utf8');
            res.send({});
        } else {
            fs.writeFileSync(carFile, JSON.stringify([ req.body ], 'utf8'));
            res.send({});
        }
    }, 1000);
});

app.listen(5000);
