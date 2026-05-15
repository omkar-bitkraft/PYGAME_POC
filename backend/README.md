# Backend

This folder contains the Express API host for the local Pygame POC.

## Current Scope

The current implementation includes:

- an Express scaffold with JSON and CORS middleware
- environment loading from the root `.env` file when present
- a real `GET /health` endpoint
- placeholder route shapes for `POST /run`, `POST /stop`, and
  `GET /runs/:runId/stream` until the runtime orchestration phase lands

## Local Commands

Use `npm.cmd` in PowerShell on this machine.

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

The backend defaults to port `3001`.

## Config Notes

The backend reads runtime-related defaults from environment variables so later
phases can wire Docker orchestration without changing route contracts:

- `BACKEND_PORT`
- `RUNTIME_IMAGE`
- `RUNTIME_CONTAINER_NAME`
- `NOVNC_PORT`
- `VNC_PORT`
