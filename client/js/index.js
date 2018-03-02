var car = null;
var cachedData = null;
var Status = Object.freeze({
    'None': 0,
    'Success': 1,
    'Processing': 2,
    'Error': 3
});

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
            }, 3000);
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
    cachedData = jsonData;
    if (Object.keys(cachedData).length == 0) {
        reportStatus(Status.Success, "No transactions yet!");
        return;
    }

    reportStatus(Status.Success, 'Successfully retrieved data.');
    refresh();
}

function refresh() {
    showCarData(false);

    let carData = cachedData[car];

    // Clear the table.
    $('#transactionsTable > tbody:last').children().remove();
    $('#summary').children().remove();

    // Populate the table.
    for (let i = 0; i < carData.transactions.length; i++) {
        let cur = carData.transactions[i];
        let curMpg = carData.mpgList[i].toFixed(2);
        let curMunny = carData.munnyList[i].toFixed(2);
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
                .append($('<td>', { 'text': curMpg }))
                .append($('<td>', { 'text': '$' + cur.pricePerGallon.toFixed(2) }))
                .append($('<td>', { 'text': '$' + curMunny }))
                .append($('<td>', { 'text': cur.comments })));
    }

    // Summary.
    $('#summary')
        .append($('<p>', { 'text': `You have hit the pumps ${carData.numTransactions} times.` }))
        .append($('<p>', { 'text': `$${carData.totalMunny.toFixed(2)} and ${carData.totalGallons.toFixed(2)} gallons of gas have taken you ${carData.totalMiles.toFixed(2)} miles.` }))
        .append($('<p>', { 'text': `Your MPG has been ${carData.avgMpg.toFixed(2)} \xB1 ${carData.stdDevMpg.toFixed(2)}.` }))
        .append($('<p>', { 'text': `Your avg pump fillup is $${carData.avgMunny.toFixed(2)} \xB1 $${carData.stdDevMunny.toFixed(2)}.` }))
        .append($('<p>', { 'text': `Your avg time between fillups is ${carData.avgTimeBetween.toFixed(2)} \xB1 ${carData.stdDevTimeBetween.toFixed(2)} days, traveling ${carData.avgMiles.toFixed(2)} \xB1 ${carData.stdDevMiles.toFixed(2)} miles.` }))
        .append($('<p>', { 'text': `Avg gas price has been $${carData.avgPricePerGallon.toFixed(2)} \xB1 $${carData.stdDevPricePerGallon.toFixed(2)}.` }));

    showCarData(true);
}

function carSelectorChanged() {
    updateCar();
    refresh();
}

function showFormButtonClick() {
    showForm(true);
}

function submitButtonClick() {
    let miles = parseFloat($('#miles').val());
    let gallons = parseFloat($('#gallons').val());
    let pricePerGallon = parseFloat($('#pricePerGallon').val());
    if (isNaN(miles) || isNaN(gallons) || isNaN(pricePerGallon)) {
        alert('Invalid input!');
        return;
    }

    let payload = {
        'car': car,
        'miles': miles,
        'gallons': gallons,
        'pricePerGallon': pricePerGallon,
        'comments': $('#comments').val()
    };

    showForm(false);
    reportStatus(Status.Processing, null);
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
    reportStatus(Status.Success, 'Successfully posted transaction.');
    cachedData = jsonData;
    refresh();
}

function errorHandler(xhr, ajaxOptions, thrownError) {
    reportStatus(Status.Error, thrownError + ': ' + xhr.responseText);
}

$(document).ready(() => {
    $('#showFormButton').click(showFormButtonClick);
    $('#submitButton').click(submitButtonClick);
    $('#carSelector').change(carSelectorChanged);
    showForm(false);
    showCarData(false);
    reportStatus(Status.None, null);
    updateCar();
    requestCarData();
});
