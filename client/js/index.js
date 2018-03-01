function submitButtonClick() {
    var payload = { name: '' };
    payload.name = $('#miles').val();
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
    $('#summary').text(jsonData.name);
    $('#summary').fadeIn();
}

$(document).ready(function() {
    $('#summary').hide();
    $('#submitButton').click(submitButtonClick);
});
