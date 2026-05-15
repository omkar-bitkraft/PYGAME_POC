# Frontend

This folder contains the Vite + vanilla JavaScript frontend for the local
Pygame POC.

## Current Scope

The current app provides:

- the Vite frontend shell
- a single-screen layout with code editor, Run, Stop, terminal panel, and
  viewer iframe region
- frontend config helpers for the backend origin, websocket target, and
  viewer page URL
- a frontend-served noVNC wrapper page that connects directly to the runtime
  websocket endpoint on port `6080`
- SSE-backed runtime log and lifecycle updates

## Local Commands

Use `npm.cmd` in PowerShell on this machine.

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

The frontend defaults to port `5173`.

## Environment

Copy `frontend/.env.example` to `frontend/.env` when you need local overrides.

- `VITE_BACKEND_BASE_URL`: full backend origin override
- `VITE_BACKEND_PORT`: fallback backend port when deriving from the current host
- `VITE_NOVNC_VIEWER_URL`: full viewer page override
- `VITE_NOVNC_PORT`: fallback noVNC port when deriving from the current host
- `VITE_NOVNC_WS_PATH`: websocket path override, default `/websockify`
- `VITE_NOVNC_VIEWER_PATH`: local viewer page path, default `/viewer.html`
