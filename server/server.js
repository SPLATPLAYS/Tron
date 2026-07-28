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

// Proxy endpoint to fetch TURN credentials from a provider using a server-side API key.
// Store the provider API key in Railway as `METERED_API_KEY` or `TURN_API_KEY`.
app.get('/turn', async (req, res) => {
    const key = process.env.METERED_API_KEY || process.env.TURN_API_KEY;
    if (!key) return res.status(500).json({ error: 'TURN API key not configured on server' });
    try {
        const url = `https://trongithub.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`;
        const r = await fetch(url);
        if (!r.ok) return res.status(r.status).json({ error: 'TURN provider returned ' + r.status });
        const data = await r.json();
        // short cache to reduce provider calls
        res.set('Cache-Control', 'public, max-age=60');
        return res.json(data);
    } catch (e) {
        console.error('turn proxy error', e);
        return res.status(500).json({ error: 'Turn proxy error' });
    }
});

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
