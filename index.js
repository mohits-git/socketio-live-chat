const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//Socket io handler
io.on('connection', (socket) => {
    console.log('A new user connected', socket.id);
    socket.on('user-message', (message)=> {
        console.log('A new user message', message);
        io.emit('message', message);
    });
});

app.use(express.static(path.resolve('./public')));

app.get('/', (req, res) => {
    res.sendFile('index.html');
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
