# Pygame Local POC Context

## Purpose
This repository is for a local proof of concept that lets a user paste or edit Pygame code in a browser UI, run it inside a Dockerized runtime, view the game window through noVNC, and inspect stdout or stderr in a terminal panel.

The goal is a full working local demo, not a production platform. The docs in this repository are intended to be resumable handoff material so another context window can continue implementation without re-discovering architecture or scope.

## Current State
- The frontend, backend, and runtime implementations now exist in this repo.
- The local POC can accept code, start a Dockerized runtime, stream logs over SSE, and expose a noVNC viewer on port `6080`.
- The workbook remains the original scope source of truth, but the repo has moved from planning into validation and polish.

## Workbook-Derived Scope
The workbook defines these implementation items:

| Task | Hours | Notes |
| --- | ---: | --- |
| Minimal project scaffold | 1 | Create simple frontend, backend, and runtime folders with basic local commands |
| Simple frontend UI | 2 | One screen with textarea/code editor, Run, Stop, terminal output area, and game display iframe |
| noVNC display integration | 2 | Use existing noVNC client and connect directly to local websockify URL exposed from Docker. No custom proxy |
| Node backend basic setup | 2 | Create Express backend with `/run` and `/stop` endpoints |
| Code write and run orchestration | 2 | Backend writes submitted code to `main.py` and starts the Docker runtime command |
| Terminal stdout/stderr streaming | 2 | Stream Python process output back to frontend using a simple server push flow |
| Docker pygame runtime | 3 | Build Docker image with Python, pygame, Xvfb, x11vnc, and websockify |
| Runtime launcher script | 1 | Start Xvfb, x11vnc, websockify, set `DISPLAY`, and run `python main.py` |
| End-to-end demo testing | 1 | Validate Run, visual streaming, terminal output, Stop, and rerun |
| Total | 16 | Baseline estimate |

## Required Practical Additions Beyond The Workbook
The workbook gives the core POC features, but a locally runnable implementation also needs these details locked:
- Prerequisites: Windows 11, Docker Desktop, Node.js, `npm.cmd`, browser access to local host ports.
- Fixed ports: frontend `5173`, backend `3001`, noVNC/websockify `6080`, VNC internal `5900`.
- Environment strategy: frontend reads backend base URL from Vite env, backend reads runtime image and port values from `.env` or defaults.
- Session policy: single user, single active run, no persistence, no auth.
- Cleanup behavior: a new Run stops and removes any existing active container before starting a fresh one.
- Failure behavior: backend returns clear validation errors for empty code and pushes readable startup or runtime failures into the UI stream.
- Smoke-test flow: sample script, first run, visual verification, stop, rerun.

## Fixed Implementation Decisions

### Repo Layout
Use three top-level implementation folders:
- `frontend/`
- `backend/`
- `runtime/`

Planned supporting files:
- `docker-compose.yml` for local orchestration convenience
- root `.env.example`
- root docs in this folder

### Frontend
- Stack: minimal Vite app with vanilla JavaScript.
- UI: one screen with:
  - plain textarea for code input
  - Run button
  - Stop button
  - terminal/log output panel
  - iframe area for noVNC viewer
- Do not use Monaco in the first pass.
- Frontend runs on the host, not in Docker.

### Backend
- Stack: Express server on the host.
- Endpoints:
  - `POST /run`
  - `POST /stop`
  - `GET /health`
  - `GET /runs/:runId/stream`
- Runtime ownership:
  - write submitted code to `runtime/workdir/main.py`
  - ensure Docker runtime image exists
  - start a fresh runtime container per run
  - stream logs and lifecycle events to the browser

### Runtime
- Docker image contains Python, Pygame, Xvfb, x11vnc, and websockify.
- Runtime container is the only Dockerized part of the system.
- Launcher script responsibilities:
  - start Xvfb
  - start x11vnc
  - start websockify
  - export `DISPLAY=:99`
  - run `python main.py`

### Streaming Model
- Use SSE, not WebSocket, for backend-to-browser log and lifecycle events.
- Event types must cover:
  - `status`
  - `stdout`
  - `stderr`
  - `exit`

### Viewer Model
- Frontend embeds a local `viewer.html` noVNC wrapper in an iframe.
- The local viewer connects directly to the Docker-exposed websockify URL.
- No custom backend proxy is part of the POC.

## Planned Local Flow
1. User opens the frontend UI.
2. User edits code in the textarea.
3. Frontend sends `POST /run` with the code payload.
4. Backend stops any existing active run.
5. Backend writes code to `runtime/workdir/main.py`.
6. Backend starts a fresh runtime container.
7. Frontend subscribes to `GET /runs/:runId/stream`.
8. User sees logs in the terminal panel and visuals through the noVNC iframe.
9. User clicks Stop or triggers another Run.
10. Backend terminates the active container and closes the stream cleanly.

## Local Machine Findings
- Docker is installed.
- `docker compose` is available.
- Node.js is installed.
- `npm.ps1` is blocked by PowerShell execution policy on this machine, so commands should use `npm.cmd`.
- Docker emitted a warning about access to `C:\Users\OmkarGaikwad\.docker\config.json`; treat that as a troubleshooting note, not as a current blocker.

## Resumption Guidance
Another context window should assume:
- the workbook has already been analyzed
- architecture decisions above are locked for the first implementation pass
- the main remaining work is validating and polishing the live local flow, especially browser-visible viewer behavior and documentation accuracy

## Current Status
- Scope extracted from workbook
- local prerequisites verified at a high level
- frontend, backend, runtime, SSE, and noVNC integration are implemented
- the project is in the final validation and troubleshooting phase

## Open Issues
- Docs and troubleshooting notes need to stay aligned with the local `viewer.html` wrapper and `/websockify` websocket path
- Additional small UI polish may still be needed if new local viewer edge cases appear

## Next Action
Run the local POC end to end, confirm the viewer and rerun flow stay stable after refresh, and then close out the remaining validation tasks.
