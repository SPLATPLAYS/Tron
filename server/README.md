# Minimal PeerJS server for Railway

This folder contains a minimal Express-based PeerJS signaling server suitable for deployment to Railway or any container host.

Environment variables
- `PORT` — port to listen on (Railway sets this automatically)
- `PEER_PATH` — path to mount the PeerJS server (default `/peerjs`)
- `PEER_KEY` — peerjs key (default `peerjs`)
- `PEER_DEBUG` — set to `1` or `2` for more verbose PeerJS logs

TURN credentials
This server only provides signaling. For reliable connectivity across restrictive NATs you must provide TURN servers in your clients' `RTCIceServer` list. Use Railway's environment variables to store TURN URL, username, and password and reference them in your client code.

Deploy
1. Push this repo to GitHub and connect to Railway.
2. Set `PEER_PATH` and `PEER_KEY` if you want non-default values.
3. Deploy; Railway will expose a TLS domain you can use in your clients (`secure: true`).
