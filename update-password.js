"use strict";

const prompt = require("prompt-sync")();
const crypto = require("crypto");
const fs = require("fs");

const configFile = "config.json";

var config = JSON.parse(fs.readFileSync(configFile, "utf8"));
var password = prompt("New password: ");
config["password"] = crypto.createHash("sha512").update(password).digest("hex");
fs.writeFileSync(configFile, JSON.stringify(config, null, 4));
