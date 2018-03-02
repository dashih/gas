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
        } else {
            $('#errorMsg').text(msg);
            $('#errorMsgDiv').fadeIn();
        }
    }
}

function showFormButtonClick() {
    setFormState(FormState.Showing, null);
}

function submitButtonClick() {
    var miles = parseFloat($('#miles').val());
    var gallons = parseFloat($('#gallons').val());
    var pricePerGallon = parseFloat($('#pricePerGallon').val());
    if (isNaN(miles) || isNaN(gallons) || isNaN(pricePerGallon)) {
        alert('Invalid input!');
        return;
    }
    
    var payload = {
        'car': '1997-BMW-M3',
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

function successHandler(msg) {
    setFormState(FormState.Hidden, 'OK');
}

function errorHandler(xhr, ajaxOptions, thrownError) {
    setFormState(FormState.Hidden, thrownError + ': ' + xhr.responseText);
}

$(document).ready(function() {
    setFormState(FormState.Hidden);
    $('#showFormButton').click(showFormButtonClick);
    $('#submitButton').click(submitButtonClick);
});
