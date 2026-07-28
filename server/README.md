# Minimal PeerJS server for Railway

This folder contains a minimal Express-based PeerJS signaling server suitable for deployment to Railway or any container host.

Environment variables
- `PORT` — port to listen on (Railway sets this automatically)
- `PEER_PATH` — path to mount the PeerJS server (default `/peerjs`)
- `PEER_KEY` — peerjs key (default `peerjs`)
- `PEER_DEBUG` — set to `1` or `2` for more verbose PeerJS logs

TURN credentials
TURN credentials
This server only provides signaling. For reliable connectivity across restrictive NATs you must provide TURN servers in your clients' `RTCIceServer` list. Store the TURN provider API key in Railway (recommended env var names: `METERED_API_KEY` or `TURN_API_KEY`) and use the built-in proxy endpoint below so the key is never exposed to browsers.

Server proxy endpoint
- `GET /turn` — returns the JSON from the TURN provider (an `iceServers` array). The server reads `METERED_API_KEY` or `TURN_API_KEY` from env and forwards the provider response. The result is cached for 60s.

Client usage example
```js
// Request iceServers from your PeerServer host (same origin)
const resp = await fetch('/turn');
if (!resp.ok) throw new Error('Could not fetch TURN creds');
const iceServers = await resp.json();

const pc = new RTCPeerConnection({ iceServers });
```

Environment variable
- `METERED_API_KEY` (or `TURN_API_KEY`) — the API key for the TURN provider (store this in Railway's Environment variables UI).

Deploy
1. Push this repo to GitHub and connect to Railway.
2. Set `PEER_PATH` and `PEER_KEY` if you want non-default values.
3. Deploy; Railway will expose a TLS domain you can use in your clients (`secure: true`).
