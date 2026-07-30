const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
const server = http.createServer(app);

const PORT = process.env.PORT || 9000;
const PATH = process.env.PEER_PATH || '/peerjs';
const KEY = process.env.PEER_KEY || 'peerjs';

// ===================================================================
// RATE LIMITING
// ===================================================================
const turnLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many TURN credential requests, please wait' },
});

const roomRegisterLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});

// ===================================================================
// ROOM LISTING -- clients POST /rooms to register, GET /rooms to list.
// Rooms expire after 90s if not refreshed (clients should POST every 60s).
// ===================================================================
const rooms = new Map();
const ROOM_TTL_MS = 30_000;
const ROOM_CLEAN_INTERVAL_MS = 10_000;

function cleanRooms() {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.lastSeen > ROOM_TTL_MS) rooms.delete(code);
    }
}

setInterval(cleanRooms, ROOM_CLEAN_INTERVAL_MS);

app.post('/rooms', roomRegisterLimiter, express.json(), (req, res) => {
    const { code, playerCount, maxPlayers, hasBots, wallMode, speed, gameMode } = req.body || {};
    if (!code || typeof code !== 'string' || code.length < 4 || code.length > 32) {
        return res.status(400).json({ error: 'Invalid room code' });
    }
    const existing = rooms.get(code);
    rooms.set(code, {
        code,
        playerCount: typeof playerCount === 'number' ? playerCount : (existing ? existing.playerCount : 1),
        maxPlayers: typeof maxPlayers === 'number' ? maxPlayers : (existing ? existing.maxPlayers : 8),
        wallMode: wallMode || (existing ? existing.wallMode : 'solid'),
        speed: speed || (existing ? existing.speed : 'normal'),
        gameMode: gameMode || (existing ? existing.gameMode : 'standard'),
        hasBots: !!hasBots,
        created: existing ? existing.created : Date.now(),
        lastSeen: Date.now(),
    });
    return res.json({ ok: true, roomCount: rooms.size });
});

app.get('/rooms', (_req, res) => {
    cleanRooms();
    const list = Array.from(rooms.values()).map(r => ({
        code: r.code,
        playerCount: r.playerCount,
        maxPlayers: r.maxPlayers,
        wallMode: r.wallMode,
        speed: r.speed,
        gameMode: r.gameMode || 'standard',
        hasBots: r.hasBots,
        age: Math.round((Date.now() - r.created) / 1000),
    }));
    res.set('Cache-Control', 'public, max-age=10');
    return res.json(list);
});

app.delete('/rooms/:code', (req, res) => {
    const code = req.params.code;
    if (rooms.has(code)) {
        rooms.delete(code);
        return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'Room not found' });
});

// ===================================================================
// HEALTH & METRICS
// ===================================================================
const startTime = Date.now();
let requestCount = 0;
let turnRequestCount = 0;

app.use((_req, _res, next) => { requestCount++; next(); });

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.round((Date.now() - startTime) / 1000),
        rooms: rooms.size,
    });
});

app.get('/metrics', (_req, res) => {
    res.json({
        uptime: Math.round((Date.now() - startTime) / 1000),
        totalRequests: requestCount,
        turnRequests: turnRequestCount,
        activeRooms: rooms.size,
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
});

// ===================================================================
// ROOT
// ===================================================================
app.get('/', (_req, res) => res.send('peerjs-server'));

// ===================================================================
// TURN PROXY
// ===================================================================
app.get('/turn', turnLimiter, async (req, res) => {
    turnRequestCount++;
    const key = process.env.METERED_API_KEY || process.env.TURN_API_KEY;
    if (!key) return res.status(500).json({ error: 'TURN API key not configured on server' });
    try {
        const url = `https://trongithub.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`;
        const r = await fetch(url);
        if (!r.ok) return res.status(r.status).json({ error: 'TURN provider returned ' + r.status });
        const data = await r.json();
        res.set('Cache-Control', 'public, max-age=60');
        return res.json(data);
    } catch (e) {
        console.error('turn proxy error', e);
        return res.status(500).json({ error: 'Turn proxy error' });
    }
});

// ===================================================================
// PEERJS
// ===================================================================
const options = {
    debug: process.env.PEER_DEBUG ? parseInt(process.env.PEER_DEBUG, 10) : 0,
    path: '/',
    allow_discovery: false,
    key: KEY,
};

const peerServer = ExpressPeerServer(server, options);
app.use(PATH, peerServer);

server.listen(PORT, () => {
    console.log(`peerjs-server listening on port ${PORT} path ${PATH} key ${KEY}`);
});

// ===================================================================
// GRACEFUL SHUTDOWN
// ===================================================================
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
