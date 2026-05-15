# Pygame Local POC Runbook

## Purpose
This runbook defines the Windows-first local setup and execution flow for the Pygame POC. It is written for this machine profile and should be kept updated as implementation progresses.

## Target Environment
- OS: Windows 11
- Shell: PowerShell
- Container runtime: Docker Desktop
- Node runtime: installed locally

## Verified Local Findings
- Docker is present.
- Docker Compose is present through `docker compose`.
- Node.js is present.
- `npm.ps1` is blocked by PowerShell execution policy on this machine.
- `npm.cmd` works and should be used in documented commands.
- Docker emitted a warning that it could not open `C:\Users\OmkarGaikwad\.docker\config.json` because access was denied.

## Prerequisites
Before implementation or local testing, confirm:
- Docker Desktop is installed and running
- Docker daemon is healthy
- Node.js is installed
- local ports `5173`, `3001`, and `6080` are free
- a browser can access `http://localhost:*`

## Planned Repo Layout

```text
/
  frontend/
  backend/
  runtime/
    workdir/
  context.md
  tasks.md
  architecture.md
  local-runbook.md
  docker-compose.yml
  .env.example
```

## Default Local Commands
Use `npm.cmd` rather than `npm` in PowerShell on this machine.

### Install dependencies

```powershell
cd frontend
npm.cmd install
cd ..\backend
npm.cmd install
```

### Build runtime image

```powershell
cd runtime
docker build -t pygame-poc-runtime .
```

Alternative root-level command if `docker-compose.yml` is added:

```powershell
docker compose build runtime
```

### Start backend

```powershell
cd backend
npm.cmd run dev
```

Expected result:
- backend listens on `http://localhost:3001`
- `GET /health` responds successfully

### Start frontend

```powershell
cd frontend
npm.cmd run dev
```

Expected result:
- frontend listens on `http://localhost:5173`

### Open the app
Open:

```text
http://localhost:5173
```

### Run sample Pygame code
Use the repo sample bootstrap first. The first-pass sample should:
- initialize pygame
- create a visible window
- render a solid background or simple moving shape
- print one or more stdout lines for terminal verification
- stay alive long enough to confirm noVNC rendering

### Verify the full flow
Confirm all of the following:
- frontend page loads
- backend is reachable
- clicking Run creates a new run
- logs appear in the terminal panel
- noVNC iframe loads the viewer
- pygame window is visible
- clicking Stop terminates the run
- clicking Run again starts a fresh clean rerun

## Validation Findings On May 15, 2026
- Frontend dependencies install successfully with `npm.cmd install`.
- Backend dependencies install successfully with `npm.cmd install`.
- The runtime image builds successfully with `docker compose build runtime`.
- Backend validation passed for `GET /health`, `POST /run`, `POST /stop`, and rerun behavior.
- During validation, the first rerun/reload issue came from the frontend trying to load the viewer while the app was idle, which caused misleading `connection lost` states on refresh.
- The viewer lifecycle was adjusted so the iframe stays idle until a run is active, and a page reload now rehydrates the viewer from `/health` when a run is already active.
- The frontend viewer flow now uses a local `viewer.html` wrapper again, but it connects explicitly to `ws://localhost:6080/websockify` instead of the ambiguous root websocket URL.
- The frontend rerun flow now closes the previous SSE stream before issuing a rerun and ignores stale events from older runs, which prevents old exit events from clearing the new viewer state.
- Runtime validation also confirmed that the upgraded runtime launches `websockify 0.13.0`, serves noVNC content, and reaches a real VNC client session with framebuffer updates in the x11vnc logs.

## Expected Local Workflow
1. Start Docker Desktop.
2. Build the runtime image if not already built.
3. Start the backend.
4. Start the frontend.
5. Open the frontend in the browser.
6. Paste or load sample code.
7. Click Run.
8. Watch SSE logs in the terminal panel.
9. Watch the pygame window through noVNC.
10. Click Stop.
11. Run again to verify cleanup and rerun behavior.

## Health And Smoke Checks

### Backend health
Expected request:

```text
GET http://localhost:3001/health
```

Expected response shape:

```json
{
  "status": "ok",
  "activeRunId": null,
  "runtimeState": "idle"
}
```

### Run request
Expected request:

```json
POST /run
{
  "code": "..."
}
```

Expected response:
- `202 Accepted`
- includes `runId`
- includes `viewerUrl`
- includes `wsUrl`

### Stop request
Expected request:

```text
POST http://localhost:3001/stop
```

Expected result:
- active container stops
- SSE stream closes or emits exit state

## Troubleshooting

### Port already in use
Symptoms:
- frontend or backend refuses to start
- runtime viewer fails to bind on `6080`

Actions:
- check which process is using `5173`, `3001`, or `6080`
- stop the conflicting process or change the configured port
- keep docs and env values aligned if a port changes

### Docker daemon unavailable
Symptoms:
- build or run commands fail immediately
- backend cannot start a runtime container

Actions:
- open Docker Desktop
- confirm Docker engine is running
- rerun `docker --version` and `docker compose version`

### noVNC cannot connect
Symptoms:
- iframe loads but viewer cannot connect
- blank or error viewer screen

Actions:
- confirm runtime container is running
- confirm port `6080` is mapped and reachable
- confirm launcher started `x11vnc` and `websockify`
- confirm frontend is using the correct websocket target `ws://localhost:6080/websockify`
- if the page was loaded before the May 15, 2026 viewer-path fix, hard refresh the browser so the updated frontend bundle is used
- confirm the app is idle before refresh; the viewer should not attempt to connect until an active run exists

### Blank canvas or no visible game
Symptoms:
- noVNC connects but the pygame window is missing or frozen

Actions:
- confirm `DISPLAY=:99` is set inside the runtime
- confirm Xvfb started successfully
- confirm sample script creates a window and pumps an event loop
- inspect stdout and stderr stream for pygame initialization errors

### Stuck prior container blocks rerun
Symptoms:
- second Run fails or reuses stale state

Actions:
- confirm backend stop logic removes the active container before starting a new one
- make stop handling idempotent
- log container IDs and exit states to simplify diagnosis
- confirm `/health` returns the second run's `activeRunId` after rerun
- confirm the frontend reconnects SSE and the viewer using the new run metadata after rerun

### PowerShell `npm` policy issue
Symptoms:
- `npm` fails with an execution policy error referencing `npm.ps1`

Actions:
- use `npm.cmd` instead of `npm`
- keep all PowerShell-focused docs and scripts aligned to that convention

### Docker config permission warning
Symptoms:
- Docker commands print an access warning for `C:\Users\OmkarGaikwad\.docker\config.json`

Actions:
- note the warning but do not treat it as a blocker unless authenticated registry access becomes necessary
- revisit only if Docker commands begin failing for credential-related reasons

## Current Status
- Runbook created from actual machine checks and planned architecture
- commands are documented for the current implementation layout
- runtime image, backend run/stop flow, viewer websocket path, and rerun behavior have been validated locally
- the local validation phase is complete for the current POC scope

## Open Issues
- Exact start scripts may still evolve as the project is polished
- Additional troubleshooting notes may be added if browser-side viewer issues remain

## Next Action
Use the standard browser smoke test on `http://localhost:5173` when changing runtime or viewer code, and extend this runbook only if a new reproducible viewer issue appears.
