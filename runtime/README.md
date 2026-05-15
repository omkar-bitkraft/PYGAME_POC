# Runtime

This folder contains the Dockerized Pygame runtime.

## Current Scope

The current implementation includes:

- a Dockerfile based on `python:3.11-slim-bookworm`
- system packages for `Xvfb` and `x11vnc`
- Python packages for `pygame` and `websockify`
- a launcher script that starts the virtual display stack and then runs
  `main.py`

The noVNC static asset delivery decision is still deferred to the dedicated
frontend integration phase.

## Local Commands

```powershell
cd runtime
docker build -t pygame-poc-runtime .
```

Or from the repo root:

```powershell
docker compose build runtime
```

## Runtime Conventions

- Container workdir path: `/opt/runtime/workdir`
- Python entrypoint: `/opt/runtime/workdir/main.py`
- Internal VNC port: `5900`
- Websockify port: `6080`
- Display: `:99`
