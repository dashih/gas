var car = null;
var cachedData = null;
var Status = Object.freeze({
    'None': 0,
    'Success': 1,
    'Processing': 2,
    'Error': 3
});
var submitStart = null;

function reportStatus(status, msg) {
    $('#errorFooter').hide();
    $('#successFooter').hide();
    $('#processingFooter').hide();
    switch (status) {
        case Status.Success:
            $('#successMsg').text(msg);
            $('#successFooter').fadeIn();
            setTimeout(() => {
                $('#successFooter').fadeOut();
            }, 2000);
            break;
        case Status.Processing:
            $('#processingFooter').show();
            break;
        case Status.Error:
            $('#errorMsg').text(msg);
            $('#errorFooter').show();
            break;
        default:
            break;
    }

    currentStatus = status;
}

function updateCar() {
    car = $('#carSelector').find(":selected").val();
    $('#currentCar').text($('#carSelector').find(":selected").text());
}

function showForm(show) {
    reportStatus(Status.None, null);
    if (show) {
        $('#showFormDiv').hide();
        $('#formDiv').fadeIn();
    } else {
        $('#formDiv').hide();
        $('#showFormDiv').show();
    }
}

function showCarData(show) {
    if (show) {
        $('#summaryDiv').fadeIn();
        $('#transactionsDiv').fadeIn();
    } else {
        $('#summaryDiv').hide();
        $('#transactionsDiv').hide();
    }
}

function requestVersion() {
    $.get('/getVersion', (data, status) => {
        $('#version').html(
            'v' + data.appVersion +
            '<br />' +
            'CentOS ' + data.osVersion + ' | ' +
            'Node.js ' + data.nodeVersion +
            '<br />' +
            'MongoDB ' + data.mongoVersion + ' | ' +
            'Redis ' + data.redisVersion +
            '<br />' +
            'Express ' + data.expressVersion +
            '<br />' +
            'jQuery ' + jQuery().jquery + ' | ' +
            'Bootstrap 4.5.2')
    });
}

function requestCarData() {
    reportStatus(Status.Processing, null);
    $.ajax({
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        url: '/request',
        data: JSON.stringify({}),
        success: requestSuccessHandler,
        error: errorHandler
    });
}

function requestSuccessHandler(jsonData) {
    cachedData = jsonData["data"];
    let numCars = Object.keys(cachedData).length;
    if (numCars === 0) {
        reportStatus(Status.Success, "No transactions yet!");
        return;
    }

    let totalTransactions = 0;
    Object.keys(cachedData).forEach(k => {
        totalTransactions += cachedData[k].transactions.length;
    });

    reportStatus(Status.Success, 'Retrieved ' + totalTransactions + ' entries for ' + numCars + ' cars (' + jsonData["duration"] + ' ms)');
    refresh();
}

function refresh() {
    showCarData(false);

    let carData = cachedData[car];

    // Show car date range.
    $('#currentCarDateRange').text(carData['dateRange']);

    // Clear the table.
    $('#transactionsTable > tbody:last').children().remove();
    $('#summary').children().remove();

    // Populate the table.
    for (let i = 0; i < carData.transactions.length; i++) {
        let cur = carData.transactions[i];
        let dateTime = new Date(cur.date);
        let shortDateTime =
            (dateTime.getMonth() + 1) + '/' +
            dateTime.getDate() + '/' +
            dateTime.getFullYear() + ' ' +
            (dateTime.getHours() == 0 ? '00' : dateTime.getHours()) + ':' +
            dateTime.getMinutes();
        $('#transactionsTable tbody').append(
            $('<tr>')
                .append($('<td>', { 'text': shortDateTime }))
                .append($('<td>', { 'text': cur.miles }))
                .append($('<td>', { 'text': cur.gallons }))
                .append($('<td>', { 'text': cur.mpg.toFixed(2) }))
                .append($('<td>', { 'text': '$' + cur.pricePerGallon.toFixed(2) }))
                .append($('<td>', { 'text': '$' + cur.munny.toFixed(2) }))
                .append($('<td>', { 'text': cur.comments })));
    }

    // Summary.
    $('#numFillups').text(carData.numTransactions);
    $('#mpg').text(`${carData.avgMpg.toFixed(2)} \xB1 ${carData.stdDevMpg.toFixed(2)}`);
    $('#mpgMaxMin').text(`${carData.minMpg.toFixed(2)} - ${carData.maxMpg.toFixed(2)}`);
    $('#totalMiles').text(carData.totalMiles.toFixed(2));
    $('#totalGallons').text(carData.totalGallons.toFixed(2));
    $('#totalMunny').text(`$${carData.totalMunny.toFixed(2)}`);
    $('#timeBetween').text(`${carData.avgTimeBetween.toFixed(2)} days`);
    $('#munnyPerFillup').text(`$${carData.avgMunny.toFixed(2)} \xB1 $${carData.stdDevMunny.toFixed(2)}`);
    $('#milesPerFillup').text(`${carData.avgMiles.toFixed(2)} \xB1 ${carData.stdDevMiles.toFixed(2)}`);
    $('#gallonsPerFillup').text(`${carData.avgGallons.toFixed(2)} \xB1 ${carData.stdDevGallons.toFixed(2)}`);
    $('#gasPrice').text(`$${carData.avgPricePerGallon.toFixed(2)} \xB1 $${carData.stdDevPricePerGallon.toFixed(2)}`);

    showCarData(true);
}

function carSelectorChanged() {
    updateCar();
    refresh();
}

function showFormButtonClick() {
    showForm(true);
}

function hideFormButtonClick() {
    showForm(false);
}

async function submitButtonClick() {
    submitStart = new Date();

    let password = $('#password').val();
    let miles = parseFloat($('#miles').val());
    let gallons = parseFloat($('#gallons').val());
    let pricePerGallon = parseFloat($('#pricePerGallon').val());
    if (isNaN(miles) || isNaN(gallons) || isNaN(pricePerGallon)) {
        alert('Invalid input!');
        return;
    }

    showForm(false);
    reportStatus(Status.Processing, null);

    // Hash the password using argon2. Parameters require ~10s on iPhone X.
    let passwordNormalized = password.normalize("NFC");
    let salt = new Uint32Array(16);
    window.crypto.getRandomValues(salt);
    let passwordHash = await argon2.hash({
        pass: passwordNormalized,
        salt: salt,
        mem: 131072, // 128 MB                                                                                                                             
        time: 16,
        hashLen: 128,
        parallelism: 4,
        type: argon2.ArgonType.Argon2d
    });

    let payload = {
        'passwordHash': passwordHash.encoded,
        'car': car,
        'miles': miles,
        'gallons': gallons,
        'pricePerGallon': pricePerGallon,
        'comments': $('#comments').val()
    };

    $.ajax({
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        url: '/submit',
        data: JSON.stringify(payload),
        success: submitSuccessHandler,
        error: errorHandler
    });
}

function submitSuccessHandler(jsonData) {
    let durationMs = new Date() - submitStart;
    cachedData = jsonData["data"];
    reportStatus(Status.Success, 'Successfully posted transaction (' + durationMs + ' ms)');
    refresh();
}

function errorHandler(xhr, ajaxOptions, thrownError) {
    reportStatus(Status.Error, thrownError + ': ' + xhr.responseText);
}

$(document).ready(() => {
    requestVersion();
    $('#showFormButton').click(showFormButtonClick);
    $('#hideFormButton').click(hideFormButtonClick);
    $('#submitButton').click(submitButtonClick);
    $('#carSelector').change(carSelectorChanged);
    showForm(false);
    showCarData(false);
    reportStatus(Status.None, null);
    updateCar();
    requestCarData();
});
