var CAR = Object.freeze('1997-BMW-M3');
var FormState = Object.freeze({
    'Hidden':0,
    'Showing':1,
    'Processing':2});

function setFormState(formState, msg) {
    $('#successMsgDiv').hide();
    $('#errorMsgDiv').hide();
    $('#formDiv').hide();
    $('#showFormDiv').hide();
    $('#progressDiv').hide();
    switch (formState) {
        case FormState.Hidden:
            $('#showFormDiv').show();
            break;
        case FormState.Showing:
            $('#formDiv').fadeIn();
            break;
        case FormState.Processing:
            $('#progressDiv').show();
            break;
        default:
            break;
    }

    if (msg != null) {
        if (msg == 'OK') {
            $('#successMsgDiv').fadeIn();
            setTimeout(() => {
                $('#successMsgDiv').fadeOut();
            }, 3000);
        } else {
            $('#errorMsg').text(msg);
            $('#errorMsgDiv').fadeIn();
        }
    }
}

function requestCarData() {
    setFormState(FormState.Processing, null);
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
    setFormState(FormState.Hidden, 'OK');
    $('#summary').text(jsonData);
    $('#summary').fadeIn();
}

function showFormButtonClick() {
    setFormState(FormState.Showing, null);
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

    setFormState(FormState.Processing, null);
    $.ajax({
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        url: '/submit',
        data: JSON.stringify(payload),
        success: successHandler,
        error: errorHandler
    });
}

function successHandler(jsonData) {
    setFormState(FormState.Hidden, 'OK');
}

function errorHandler(xhr, ajaxOptions, thrownError) {
    setFormState(FormState.Hidden, thrownError + ': ' + xhr.responseText);
}

$(document).ready(() => {
    requestCarData();
    $('#showFormButton').click(showFormButtonClick);
    $('#submitButton').click(submitButtonClick);
});
