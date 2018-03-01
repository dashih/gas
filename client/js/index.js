function submitButtonClick() {
    var payload = { name: '' };
    payload.name = $('#text0').val();
    $.ajax({
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        url: '/',
        data: JSON.stringify(payload),
        success: successHandler
    });
}

function successHandler(jsonData) {
    $('#output').text(jsonData.name);
    $('#output').fadeIn();
}

$(document).ready(function() {
    $('#output').hide();
    $('#submitButton').click(submitButtonClick);
});
