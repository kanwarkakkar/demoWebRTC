var os = require('os');
const express = require('express'), http = require('http');
const app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);

server.listen(3000);


io.on('connection', function (socket) {

    // convenience function to log server messages on the client
    function log() {
        var array = ['Message from server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    socket.on('message', function (message,room) {
        log('Client said: ', message,room);
        // for a real app, would be room-only (not broadcast)
        socket.to(room).emit('message', message);
    });

    socket.on('create or join', function (room) {
        log('Received request to create or join room ' + room);

        var numClients = 0;
        if(!io.sockets.adapter.rooms[room])
            numClients=1;
        else
            numClients = io.sockets.adapter.rooms[room].length  + 1;

        log('Room ' + room + ' now has ' + numClients + ' client(s)');

        if (numClients === 1) {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);

        } else if (numClients === 2) {
            log('Client ID ' + socket.id + ' joined room ' + room);
            io.in(room).emit('join', room);
            socket.join(room);
            socket.emit('joined', room, socket.id);
            io.in(room).emit('ready');
        } else { // max two clients
            socket.emit('full', room);
        }
    });


});


app.use(express.static('public'));

app.get('/', (err, res) => {
    res.sendFile(__dirname+'/app/app.html')
});


app.get('/app/:id?', (req, res,next) => {
    res.sendFile(__dirname + '/app/index.html');
});
