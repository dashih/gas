var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/', function(req, res) {
    res.send(req.body);
});

app.listen(5000);
