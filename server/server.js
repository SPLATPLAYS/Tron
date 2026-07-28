const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 9000;
const PATH = process.env.PEER_PATH || '/peerjs';
const KEY = process.env.PEER_KEY || 'peerjs';

const options = {
    debug: process.env.PEER_DEBUG ? parseInt(process.env.PEER_DEBUG, 10) : 0,
    path: PATH,
    allow_discovery: false,
    key: KEY,
};

app.get('/', (req, res) => res.send('peerjs-server'));

const peerServer = ExpressPeerServer(server, options);
app.use(PATH, peerServer);

server.listen(PORT, () => {
    console.log(`peerjs-server listening on port ${PORT} path ${PATH} key ${KEY}`);
});

// Graceful shutdown
function shutdown() {
    try {
        server.close(() => process.exit(0));
    } catch (e) {
        console.error('shutdown error', e);
        process.exit(1);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
