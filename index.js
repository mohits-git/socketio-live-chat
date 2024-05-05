const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { availableParallelism } = require('node:os');
const cluster = require('node:cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter')

if(cluster.isPrimary) {
    const totalCPUs = availableParallelism();

    for(let i = 0; i < totalCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }

    return setupPrimary();
}

async function main() {

    const db = await open({
        filename: "chat.db",
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            content TEXT
         );
        `)

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {},
        adapter: createAdapter()
    });

    io.on('connection', async (socket) => {
        console.log('A new user connected', socket.id);
        socket.on('disconnect', () => console.log("User disconnected."));

        socket.on('chat message', async (message, clientOffset, callback) => {
            let result;
            try {
                result = await db.run(`INSERT INTO messages (content, client_offset) VALUES (?, ?)`, message, clientOffset);
            } catch (error) {
                if (error.errno === 19) {
                    callback();
                } else {
                    io.to(socket.id).emit('error', "Could not send your message");
                    console.log(error);
                }
                return;
            }
            io.emit('chat message', message, result.lastID);
            callback();
        });

        if (!socket.recovered) {
            try {
                await db.each(`SELECT id, content FROM messages WHERE id > ?`,
                    [socket.handshake.auth.serverOffset || 0],
                    (_err, row) => {
                        socket.emit('chat message', row.content, row.id);
                    }
                );
            } catch (error) {
                io.to(socket.id).emit('error', "Could not get the message");
                return;
            }
        }
    });

    app.use(express.static(path.resolve('./public')));

    app.get('/', (req, res) => {
        res.sendFile('index.html');
    });

    const port = process.env.PORT;
    server.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

main();
