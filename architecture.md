# Pygame Local POC Architecture

## System Overview
The POC has three runtime parts:
- `frontend/`: browser UI running locally on the host
- `backend/`: Express API server running locally on the host
- `runtime/`: Dockerized Pygame execution environment

Only the Pygame execution environment runs inside Docker. The frontend and backend stay on the host machine for simplicity during development.

## Fixed Ports And Defaults

| Component | Port | Notes |
| --- | ---: | --- |
| Frontend | `5173` | Vite dev server |
| Backend | `3001` | Express API server |
| noVNC / websockify | `6080` | Exposed from runtime container for browser viewing |
| VNC internal | `5900` | Used internally by x11vnc |

Default config values to support:
- `FRONTEND_PORT=5173`
- `BACKEND_PORT=3001`
- `NOVNC_PORT=6080`
- `VNC_PORT=5900`
- `RUNTIME_IMAGE=pygame-poc-runtime`
- `RUNTIME_CONTAINER_NAME=pygame-poc-active`

## Public Interfaces

### `POST /run`
Request body:

```json
{
  "code": "import pygame\nprint('hello')\n"
}
```

Behavior:
- reject empty or whitespace-only code with `400`
- stop and remove any active runtime container before starting a new run
- write request code to the generated runtime path at `.runtime-generated/workdir/main.py`
- ensure the runtime image is available
- start a fresh runtime container
- create a new `runId`

Response shape:

```json
{
  "runId": "run_20260514_001",
  "status": "starting",
  "viewerUrl": "http://localhost:6080/vnc_lite.html?autoconnect=true&path=websockify",
  "wsUrl": "ws://localhost:6080/websockify"
}
```

Expected status code:
- `202 Accepted` for a valid run request

### `POST /stop`
Behavior:
- stop the active runtime container if one exists
- close associated stream listeners
- return a stopped-state response even if the runtime already exited

Response shape:

```json
{
  "status": "stopped",
  "runId": "run_20260514_001"
}
```

### `GET /health`
Behavior:
- report whether the backend is running
- report whether a runtime session is active

Response shape:

```json
{
  "status": "ok",
  "activeRunId": null,
  "runtimeState": "idle"
}
```

Possible `runtimeState` values:
- `idle`
- `starting`
- `running`
- `stopping`
- `exited`
- `error`

### `GET /runs/:runId/stream`
Transport:
- Server-Sent Events

Purpose:
- stream one-way logs and lifecycle state updates from backend to browser

SSE event types:
- `status`
- `stdout`
- `stderr`
- `exit`

Example event payloads:

```text
event: status
data: {"runId":"run_20260514_001","status":"starting"}
```

```text
event: stdout
data: {"runId":"run_20260514_001","message":"pygame 2.x initialized"}
```

```text
event: stderr
data: {"runId":"run_20260514_001","message":"Traceback ..."}
```

```text
event: exit
data: {"runId":"run_20260514_001","code":0}
```

## Runtime Lifecycle
1. Frontend sends `POST /run` with the current textarea contents.
2. Backend validates the payload.
3. Backend stops the existing active run if present.
4. Backend writes submitted code to `.runtime-generated/workdir/main.py`.
5. Backend verifies the runtime image exists, or builds it before first use.
6. Backend launches a fresh container with a known container name and port mapping.
7. Backend attaches to container logs and relays them into the SSE stream.
8. Backend marks the run as `running` only after the viewer websocket is reachable.
9. Frontend opens the local viewer page with the websocket URL and subscribes to the run stream.
10. User sees both terminal output and the pygame display.
11. On Stop, rerun, or process exit, backend terminates the container, emits terminal events, and resets active state.

## Runtime Container Responsibilities
The runtime image must contain:
- Python
- Pygame
- Xvfb
- x11vnc
- websockify

The launcher script must:
- start `Xvfb` on display `:99`
- start `x11vnc` bound to the virtual display
- start `websockify` so the browser can connect to VNC through websocket
- export `DISPLAY=:99`
- run `python main.py`

The container should:
- mount generated runtime code into `/opt/runtime/workdir/main.py` for live runs
- keep the checked-in `runtime/workdir/main.py` sample as a bootstrap/example
- expose host port `6080`
- be removable after stop or exit

## Frontend Architecture
The frontend is intentionally minimal:
- plain textarea for code input
- Run and Stop buttons
- terminal output panel backed by SSE
- iframe region for a local noVNC wrapper page

Frontend state to track:
- current code value
- current `runId`
- current backend request state
- current viewer URL
- log lines grouped by type

Frontend behavior:
- disable or debounce Run during transition states
- clear prior logs when a new run starts
- reconnect or recreate the SSE stream per run
- keep the iframe in standby until the backend marks the viewer websocket ready
- keep the iframe pointed at the current local viewer page for the active run once ready

## Backend Architecture
Recommended backend modules:
- route layer for HTTP endpoints
- runtime service for container start/stop and state tracking
- stream manager for SSE subscribers
- file writer utility for `.runtime-generated/workdir/main.py`

Backend invariants:
- at most one active run at a time
- each run has one `runId`
- active state is authoritative in memory for the POC
- `running` means the viewer websocket is reachable, not only that the container exists
- stopping is idempotent

## Non-Goals For This POC
- authentication
- multiple concurrent users
- persistent project storage
- version history
- sandbox hardening beyond normal local Docker isolation
- websocket proxying through the backend
- production deployment setup

## Failure Modes To Handle
- empty code submission
- Docker daemon unavailable
- image build failure
- container startup failure
- noVNC cannot connect to `6080`
- viewer websocket is not ready immediately after container start
- Python process exits immediately
- stale active container blocks rerun

Required handling principle:
- backend must surface readable errors both in HTTP responses and SSE events so the UI does not fail silently

## Current Status
- target architecture is implemented
- API, SSE, and runtime lifecycle contracts are live
- the browser iframe now points at a frontend-served noVNC wrapper page
- final validation is centered on end-to-end behavior, not missing scaffolding

## Open Issues
- docs must stay aligned with the local viewer page and `/websockify` websocket path if ports or URLs change

## Next Action
Finish the end-to-end validation pass, record the final troubleshooting notes, and keep the runbook aligned with the working local flow.
