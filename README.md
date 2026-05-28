# Pygame Web IDE - POC

Browser-based pygame IDE that streams Pygame frames and audio to the browser without VNC or X11.

## Architecture

```text
Browser
  WS /control/:id  - run/stop/input out | stdout/status in
  WS /video/:id    - binary JPEG frames -> painted to <canvas>
  WS /audio/:id    - binary WebM/Opus -> MediaSource API

Node.js
  proxies /video   <-> container pygame_runner.py WS :7777
  proxies /audio   <-  docker exec parec | ffmpeg
  forwards input   ->  container WS :7777

Container (per session)
  PulseAudio null sink  - virtual speaker
  pygame_runner.py      - WS server + frame capture + event injection
  student main.py       - executed inside runner context
```

## Quick Start

```bash
# 1. Build the container image
docker build -t pygame-poc:latest .

# 2. Install Node dependencies
npm install

# 3. Start the local server
npm start

# 4. Open the UI
# http://localhost:3000
```

## Key Files

| File | Purpose |
|---|---|
| `Dockerfile` | Pygame + PulseAudio + ffmpeg image |
| `pygame_runner.py` | Frame capture, event injection, WebSocket server |
| `start_pulse.sh` | Starts the virtual audio sink |
| `server.js` | Session manager, WebSocket routing, Docker lifecycle |
| `index.html` | Editor, canvas renderer, browser audio client |

## Local Notes

- The Node server publishes each container's runner port onto localhost, which is important for Docker Desktop on Windows.
- Docker Desktop must be running before you start the Node server.

## Per-container Limits

- RAM: 256 MB
- CPU: 0.5 cores
- PIDs: 100
