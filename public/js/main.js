'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var dataChannel;

var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};

/////////////////////////////////////////////


var room = window.location.href.split('/').pop()

var socket = io.connect();

if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or  join room', room);
}

socket.on('created', function (room) {
    console.log('Created room ' + room);
    isInitiator = true;
});

socket.on('full', function (room) {
    alert('Room ' + room + ' is full');
});

socket.on('join', function (room) {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function (room) {
    console.log('joined: ' + room);
    isChannelReady = true;
});

socket.on('log', function (array) {
    console.log.apply(console, array);
});
$('form').submit(function () {
    var file = fileInput.files[0];
    if (!file) {
        dataChannel.send($('#m').val());
        showMessage('You: ', $('#m').val());
        $('#m').val('');
    } else {

        sendData();
    }

    return false;
});

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message, room);
}


// This client receives a message
socket.on('message', function (message) {
    console.log('Client received message:', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));

        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var sendChannel;
var receiveChannel;
var pcConstraint;
var bitrateDiv = document.querySelector('div#bitrate');
var fileInput = document.querySelector('input#fileInput');
var downloadAnchor = document.querySelector('a#download');
var sendProgress = document.querySelector('progress#sendProgress');
var receiveProgress = document.querySelector('progress#receiveProgress');
var statusMessage = document.querySelector('span#status');

var receiveBuffer = [];
var receivedSize = 0;

var bytesPrev = 0;
var timestampPrev = 0;
var timestampStart;
var statsInterval = null;
var bitrateMax = 0;
var fileInput = document.querySelector('input#fileInput')


function getUserMedia() {

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    })
        .then(gotStream)
        .catch(function (e) {
            alert('getUserMedia() error: ' + e.name);
        });

}

getUserMedia()


function gotStream(stream) {
    console.log('Adding local stream.');
    localVideo.src = window.URL.createObjectURL(stream);
    localStream = stream;
    sendMessage('got user media');
    if (isInitiator) {
        maybeStart();
    }
}

var constraints = {
    video: true
};

console.log('Getting user media with constraints', constraints);

// if (location.hostname !== 'localhost') {
//     requestTurn(
//         'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
//     );
// }

function sendData() {
    var file = fileInput.files[0];
    console.log('File is ' + [file.name, file.size, file.type,
        file.lastModifiedDate
    ].join(' '));

    // Handle 0 size files.
    statusMessage.textContent = '';
    downloadAnchor.textContent = '';
    if (file.size === 0) {
        bitrateDiv.innerHTML = '';
        statusMessage.textContent = 'File is empty, please select a non-empty file';
        return;
    }
    sendProgress.max = file.size;
    receiveProgress.max = file.size;
    var chunkSize = 16384;
    var sliceFile = function (offset) {
        var reader = new window.FileReader();
        reader.onload = (function () {
            return function (e) {
                sendChannel.send(e.target.result);
                if (file.size > offset + e.target.result.byteLength) {
                    window.setTimeout(sliceFile, 0, offset + chunkSize);
                }
                sendProgress.value = offset + e.target.result.byteLength;
            };
        })(file);
        var slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
        if(sendProgress.value == sendProgress.max){

            alert('File Sent');
        }
    };
    sliceFile(0);

    $('#fileInput').val('');
}


function onReceiveMessageCallback(event) {
    showMessage('Other: ', event.data)
}


function onReceiveFileCallback(event) {
    console.log(event)
    console.log('Received Message ' + event.data.byteLength);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;

    receiveProgress.value = receivedSize;

    // we are assuming that our signaling protocol told
    // about the expected file size (and name, hash, etc).
    // var file = fileInput.files[0];
    var file = {
        name: 'IMG_0896.jpg',
        size: 2468649
    }
    if (receivedSize === file.size) {

        var received = new window.Blob(receiveBuffer);
        receiveBuffer = [];

        downloadAnchor.href = URL.createObjectURL(received);
        downloadAnchor.download = file.name;
        downloadAnchor.textContent =
            'Click to download \'' + file.name + '\' (' + receivedSize + ' bytes)';
        downloadAnchor.style.display = 'block';


        if (statsInterval) {
            window.clearInterval(statsInterval);
            statsInterval = null;
        }

        alert('File Received');

    }
}

function receiveChannelCallback(event) {

    console.log('Receive Channel Callback');
    if (event && event.channel) {
        if (event.channel.label === "DataChannel") {
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        } else if (event.channel.label === "sendDataChannel") {
            sendChannel = event.channel;
            sendChannel.binaryType = 'arraybuffer';
            sendChannel.onmessage = onReceiveFileCallback;
            sendChannel.onopen = onReceiveChannelStateChange;
            sendChannel.onclose = onReceiveChannelStateChange;

            receivedSize = 0;
            bitrateMax = 0;
            downloadAnchor.textContent = '';
            downloadAnchor.removeAttribute('download');
            if (downloadAnchor.href) {
                URL.revokeObjectURL(downloadAnchor.href);
                downloadAnchor.removeAttribute('href');
            }

        }
    }

}

function onSendChannelStateChange() {
    var readyState = sendChannel.readyState;
    console.log('Send channel state is: ' + readyState);
}

function onReceiveChannelStateChange() {
    var readyState = sendChannel.readyState;
    console.log('Receive channel state is: ' + readyState);
    if (readyState === 'open') {
        timestampStart = (new Date()).getTime();
        timestampPrev = timestampStart;
    }
}


function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>>> creating peer connection');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            dataChannel = pc.createDataChannel('DataChannel', null);
            sendChannel = pc.createDataChannel('sendDataChannel');
            sendChannel.binaryType = 'arraybuffer';
            sendChannel.onopen = onSendChannelStateChange;
            sendChannel.onclose = onSendChannelStateChange;
            onDataChannelCreated(dataChannel);
            onFileSharingDataChannelCreated(sendChannel);
            doCall();

        } else {
            pc.ondatachannel = receiveChannelCallback;
        }
    }
}


/////////////////////////////////////////////////////////
function onDataChannelCreated(dataChannel, sendChannel) {
    dataChannel.onopen = function () {
        console.log('CHANNEL opened!!!');
    };

    dataChannel.onmessage = onReceiveMessageCallback;
}

function onFileSharingDataChannelCreated(channel) {
    sendChannel.onopen = function () {
        console.log('Channel Opened');
    }
    sendChannel.onmessage = onReceiveFileCallback;
}


function showMessage(person, data) {

    $('#messages').append(`<li><span><b>${person } </b></span>${data}</li>`);
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;

        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}


function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    console.log('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteVideo.classList.remove("remoteVideoClass");
    remoteVideo.className += "localVideoClass";
    localVideo.classList.remove("localVideoClass");
    localVideo.className += "remoteVideoClass";
    remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
    // isAudioMuted = false;
    // isVideoMuted = false;
    pc.close();
    pc = null;
}

window.onbeforeunload = function () {
    sendMessage('bye');
};

//
//
// function requestTurn(turnURL) {
//     var turnExists = false;
//     for (var i in pcConfig.iceServers) {
//         if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
//             turnExists = true;
//             turnReady = true;
//             break;
//         }
//     }
//     if (!turnExists) {
//         console.log('Getting TURN server from ', turnURL);
//         // No TURN server. Get one from computeengineondemand.appspot.com:
//         var xhr = new XMLHttpRequest();
//         xhr.onreadystatechange = function () {
//             if (xhr.readyState === 4 && xhr.status === 200) {
//                 var turnServer = JSON.parse(xhr.responseText);
//                 console.log('Got TURN server: ', turnServer);
//                 pcConfig.iceServers.push({
//                     'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
//                     'credential': turnServer.password
//                 });
//                 turnReady = true;
//             }
//         };
//         xhr.open('GET', turnURL, true);
//         xhr.send();
//     }
// }


///////////////////////////////////////////
//
// // Set Opus as the default audio codec if it's present.
// function preferOpus(sdp) {
//     var sdpLines = sdp.split('\r\n');
//     var mLineIndex;
//     // Search for m line.
//     for (var i = 0; i < sdpLines.length; i++) {
//         if (sdpLines[i].search('m=audio') !== -1) {
//             mLineIndex = i;
//             break;
//         }
//     }
//     if (mLineIndex === null) {
//         return sdp;
//     }
//
//     // If Opus is available, set it as the default in m line.
//     for (i = 0; i < sdpLines.length; i++) {
//         if (sdpLines[i].search('opus/48000') !== -1) {
//             var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
//             if (opusPayload) {
//                 sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
//                     opusPayload);
//             }
//             break;
//         }
//     }
//
//     // Remove CN in m line and sdp.
//     sdpLines = removeCN(sdpLines, mLineIndex);
//
//     sdp = sdpLines.join('\r\n');
//     return sdp;
// }
//
// function extractSdp(sdpLine, pattern) {
//     var result = sdpLine.match(pattern);
//     return result && result.length === 2 ? result[1] : null;
// }
//
// // Set the selected codec to the first in m line.
// function setDefaultCodec(mLine, payload) {
//     var elements = mLine.split(' ');
//     var newLine = [];
//     var index = 0;
//     for (var i = 0; i < elements.length; i++) {
//         if (index === 3) { // Format of media starts from the fourth.
//             newLine[index++] = payload; // Put target payload to the first.
//         }
//         if (elements[i] !== payload) {
//             newLine[index++] = elements[i];
//         }
//     }
//     return newLine.join(' ');
// }
//
// // Strip CN from sdp before CN constraints is ready.
// function removeCN(sdpLines, mLineIndex) {
//     var mLineElements = sdpLines[mLineIndex].split(' ');
//     // Scan from end for the convenience of removing an item.
//     for (var i = sdpLines.length - 1; i >= 0; i--) {
//         var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
//         if (payload) {
//             var cnPos = mLineElements.indexOf(payload);
//             if (cnPos !== -1) {
//                 // Remove CN payload from m line.
//                 mLineElements.splice(cnPos, 1);
//             }
//             // Remove CN line in sdp
//             sdpLines.splice(i, 1);
//         }
//     }
//
//     sdpLines[mLineIndex] = mLineElements.join(' ');
//     return sdpLines;
// }


$(document).ready(function () {

    $("#room-link-href").attr("href", window.location.href);
    $('#room-link-href').text(window.location.href);


});
