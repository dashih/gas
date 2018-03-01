var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(express.static('client'));
app.use(bodyParser.json());

app.post('/', function(req, res) {
    setTimeout(function() {
        //res.send(req.body);
        res.status(500).send("very bad!!!!");
    }, 1000);
});

app.listen(5000);
