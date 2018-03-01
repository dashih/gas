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
    setFormState(FormState.Processing, null);
    
    var payload = { name: '' };
    payload.name = $('#miles').val();
    $.ajax({
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        url: '/',
        data: JSON.stringify(payload),
        success: successHandler,
        error: errorHandler
    });
}

function successHandler(jsonData) {
    $('#summary').text(jsonData.name);
    $('#summary').fadeIn();
    setFormState(FormState.Hidden, 'something went badly wrong');
}

function errorHandler(xhr, ajaxOptions, thrownError) {
    setFormState(FormState.Hidden, thrownError + ': ' + xhr.responseText);
}

$(document).ready(function() {
    setFormState(FormState.Hidden);
    $('#showFormButton').click(showFormButtonClick);
    $('#submitButton').click(submitButtonClick);
});
