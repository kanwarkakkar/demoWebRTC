

function randomString(strLength) {
    var result = [];
    strLength = strLength || 5;
    var charSet = '0123456789';
    while (strLength--) {
        result.push(charSet.charAt(Math.floor(Math.random() * charSet.length)));
    }
    return result.join('');
}



$('#room-id-input').val(randomString());

$('#join-button').on('click',function () {
    let value = $('#room-id-input').val();
    window.location.href = `/app/${value}`;
})