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

## Local Frontend To Remote EC2 Backend

Serve the frontend locally and point it at your EC2 backend with the `backend` query parameter:

```bash
python -m http.server 5500
```

Open:

```text
http://127.0.0.1:5500/index.html?backend=http://<EC2_PUBLIC_IP>:3000
```

If `backend` is omitted, the UI falls back to same-origin mode, so local `npm start` behavior stays unchanged.

## EC2 Deployment

This POC runs the Node server directly on the EC2 host and uses host Docker to create per-session pygame containers.

### 1. Prepare the instance

- Use Amazon Linux 2.
- Attach an Elastic IP if you want a stable backend address during the POC.
- In the security group, allow `22/tcp` from your admin IP and `3000/tcp` from the laptop or CIDR that will use the frontend.

### 2. Install dependencies on EC2

```bash
sudo yum update -y
sudo amazon-linux-extras install docker -y
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git
```

### 3. Clone the repo

```bash
sudo mkdir -p /opt/pygame-poc
sudo chown ec2-user:ec2-user /opt/pygame-poc
git clone <your-repo-url> /opt/pygame-poc
cd /opt/pygame-poc
npm ci
```

### 4. Install the systemd service

Copy `deploy/pygame-poc.service` to `/etc/systemd/system/pygame-poc.service`, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pygame-poc
```

The service rebuilds the `pygame-poc:latest` image before each start, so `sudo systemctl restart pygame-poc` is enough after backend changes.

### 5. Verify the backend

```bash
sudo systemctl status pygame-poc
journalctl -u pygame-poc -n 100 --no-pager
curl http://127.0.0.1:3000/health
```

### 6. Ongoing updates

```bash
ssh ec2-user@<EC2_PUBLIC_IP>
cd /opt/pygame-poc
git pull
npm ci
sudo systemctl restart pygame-poc
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
