var car;
var Status = Object.freeze({
    'None': 0,
    'Success': 1,
    'Processing': 2,
    'Error': 3
});

function reportStatus(status, msg) {
    $('#successFooter').hide();
    $('#processingFooter').hide();
    $('#errorFooter').hide();
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
        data: JSON.stringify({ car: car }),
        success: requestSuccessHandler,
        error: errorHandler
    });
}

function requestSuccessHandler(jsonData) {
    if (jsonData.numTransactions == 0) {
        reportStatus(Status.Success, "No transactions yet!");
        return;
    }

    reportStatus(Status.Success, 'Successfully retrieved data.');

    // Clear the table.
    $('#transactionsTable > tbody:last').children().remove();
    $('#summary').children().remove();

    // Populate the table.
    for (let i = 0; i < jsonData.transactions.length; i++) {
        let cur = jsonData.transactions[i];
        let curMpg = jsonData.mpgList[i].toFixed(2);
        let curMunny = jsonData.munnyList[i].toFixed(2);
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
        .append($('<p>', { 'text': `You have hit the pumps ${jsonData.numTransactions} times.` }))
        .append($('<p>', { 'text': `$${jsonData.totalMunny.toFixed(2)} and ${jsonData.totalGallons.toFixed(2)} gallons of gas have taken you ${jsonData.totalMiles.toFixed(2)} miles.` }))
        .append($('<p>', { 'text': `Your MPG has been ${jsonData.avgMpg.toFixed(2)} \xB1 ${jsonData.stdDevMpg.toFixed(2)}.` }))
        .append($('<p>', { 'text': `Your avg pump fillup is $${jsonData.avgMunny.toFixed(2)} \xB1 $${jsonData.stdDevMunny.toFixed(2)}.` }))
        .append($('<p>', { 'text': `Your avg time between fillups is ${jsonData.avgTimeBetween.toFixed(2)} \xB1 ${jsonData.stdDevTimeBetween.toFixed(2)} days, traveling ${jsonData.avgMiles.toFixed(2)} \xB1 ${jsonData.stdDevMiles.toFixed(2)} miles.` }))
        .append($('<p>', { 'text': `Avg gas price has been $${jsonData.avgPricePerGallon.toFixed(2)} \xB1 $${jsonData.stdDevPricePerGallon.toFixed(2)}.` }));

    showCarData(true);
}

function carSelectorChanged() {
    updateCar();
    requestCarData();
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
        'date': null,
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
    setTimeout(() => {
        requestCarData();
    }, 2000);
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
