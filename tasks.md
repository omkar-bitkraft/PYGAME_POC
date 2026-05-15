# Pygame Local POC Tasks

This checklist converts the workbook into an implementation sequence that can be executed linearly. Status values are:
- `todo`
- `in_progress`
- `blocked`
- `done`

## Phase 1: Project Scaffold

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T1 | `done` | Create `frontend/`, `backend/`, and `runtime/` directories | None | All three folders exist with minimal starter files and local start/build commands |
| T2 | `done` | Add root-level orchestration files such as `.env.example` and `docker-compose.yml` | T1 | Shared config documents ports, image name, and local startup assumptions |
| T3 | `done` | Add a deterministic sample `runtime/workdir/main.py` bootstrap script | T1 | A known Pygame sample exists for smoke tests and rerun validation |

## Phase 2: Frontend Shell And Editor/Output Layout

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T4 | `done` | Scaffold a minimal Vite + vanilla JS frontend in `frontend/` | T1 | Frontend installs and starts locally on port `5173` |
| T5 | `done` | Build the single-screen UI layout | T4 | Screen includes textarea, Run, Stop, terminal area, and viewer iframe region |
| T6 | `done` | Wire frontend config for backend base URL and viewer URL handling | T4 | Frontend can call backend and derive or consume the viewer connection info without hardcoded dev-only edits |

## Phase 3: noVNC Embedding

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T7 | `done` | Decide and implement how noVNC static assets are served in the frontend flow | T4 | noVNC client assets load locally without a custom websocket proxy |
| T8 | `done` | Embed noVNC viewer in the iframe area and point it at `websockify` on port `6080` | T7, T13 | Viewer loads and attempts a real websocket connection to the runtime endpoint |

## Phase 4: Backend API And Runtime Orchestration

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T9 | `done` | Scaffold Express backend in `backend/` | T1 | Backend installs and starts locally on port `3001` |
| T10 | `done` | Implement `POST /run` request validation and run creation | T9 | Empty code is rejected with `400`; valid requests produce a `runId` and startup metadata |
| T11 | `done` | Implement `POST /stop` for the active run | T9 | Active runtime container can be stopped cleanly and repeat calls are handled safely |
| T12 | `done` | Implement `GET /health` for readiness and active-run reporting | T9 | Health endpoint reports backend availability and whether a run is active |
| T13 | `done` | Implement code write and Docker start orchestration | T10, T15 | Backend writes code to a generated runtime workdir, starts a fresh container, and tracks container lifecycle |
| T14 | `done` | Enforce single active session semantics | T10, T11, T13 | Starting a new run stops and removes the prior active runtime before launching the next one |

## Phase 5: Log/Event Streaming

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T15 | `done` | Implement `GET /runs/:runId/stream` as SSE | T9 | Client can subscribe to one-way event updates for a run |
| T16 | `done` | Stream `status`, `stdout`, `stderr`, and `exit` events from backend runtime handling | T13, T15 | Logs and lifecycle events appear in the browser terminal panel during and after execution |
| T17 | `done` | Connect frontend terminal UI to SSE stream lifecycle | T5, T15, T16 | Run state, log output, and exit status are visible and reset appropriately between runs |

## Phase 6: Docker Runtime And Launcher

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T18 | `done` | Create runtime Dockerfile with Python, Pygame, Xvfb, x11vnc, and websockify | T1 | Docker image builds locally and contains all required packages |
| T19 | `done` | Create runtime launcher script | T18 | Launcher starts Xvfb, x11vnc, websockify, sets `DISPLAY=:99`, and runs `python main.py` |
| T20 | `done` | Expose runtime ports and container naming/config conventions | T18 | Host can reach noVNC/websockify on `6080` and backend can manage container lifecycle consistently |

## Phase 7: Local Validation And Troubleshooting

| ID | Status | Task | Depends On | Definition Of Done |
| --- | --- | --- | --- | --- |
| T21 | `done` | Validate first-run local flow end to end | T6, T8, T14, T17, T19, T20 | Frontend loads, backend accepts code, runtime starts, noVNC displays output, and logs stream live |
| T22 | `done` | Validate Stop behavior and rerun behavior | T21 | Stop ends the active run and a second Run starts cleanly without manual cleanup |
| T23 | `done` | Document local troubleshooting findings during implementation | T21, T22 | Known issues and fixes are added back into `local-runbook.md` with concrete symptoms and actions |

## Critical Path
Follow this order unless a blocker requires a small local reorder:
1. T1
2. T2
3. T3
4. T4
5. T9
6. T18
7. T19
8. T10
9. T11
10. T12
11. T15
12. T13
13. T14
14. T16
15. T5
16. T6
17. T7
18. T8
19. T17
20. T20
21. T21
22. T22
23. T23

## Acceptance Checklist
- `POST /run` writes code to `.runtime-generated/workdir/main.py`
- runtime container starts successfully
- pygame window is visible through noVNC
- stdout and stderr appear in the terminal panel
- `POST /stop` terminates the active run
- rerun works without manual cleanup
- empty code returns clear `400`
- failed container startup produces readable UI feedback
- health endpoint shows idle versus active state

## Current Status
- Task breakdown created from workbook scope
- dependency ordering locked
- Phase 1 scaffold created
- T1 through T3 completed
- Phase 2 frontend shell created
- T4 through T6 completed
- Backend scaffold created with a live health endpoint
- Runtime Docker and launcher foundations created
- T9, T12, and T18 through T20 completed
- Executable backend run/stop/SSE flow created
- T10, T11, T13, T14, T15, T16, and T17 completed
- noVNC viewer assets are now served locally from the frontend
- T7 and T8 completed
- Reload/rerun lifecycle fixes are complete
- T21 through T23 are complete and the local validation phase is closed

## Open Issues
- Exact dependency versions will be chosen during scaffolding
- Real runtime validation may add small troubleshooting sub-tasks

## Next Action
Use the refreshed local viewer flow for regular smoke tests, and only open a new task if a newly reproduced browser-specific viewer issue appears.
