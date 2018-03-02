var CAR = Object.freeze('1997-BMW-M3');
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
        data: JSON.stringify({ car: CAR }),
        success: requestSuccessHandler,
        error: errorHandler
    });
}

function requestSuccessHandler(jsonData) {
    reportStatus(Status.Success, 'Successfully retrieved data.');
    //$('#summary').text(jsonData);
    //$('#summary').fadeIn();

    // Clear the table.
    $('#transactionsTable > tbody:last').children().remove();

    // Populate the table.
    for (let i = 0; i < jsonData.length; i++) {
        let cur = jsonData[i];
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
                .append($('<td>', { 'text': 'todo' }))
                .append($('<td>', { 'text': 'todo' }))
                .append($('<td>', { 'text': cur.pricePerGallon }))
                .append($('<td>', { 'text': cur.comments })));
    }

    showCarData(true);
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
        'car': CAR,
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
    showForm(false);
    showCarData(false);
    reportStatus(Status.None, null);
    requestCarData();
});
