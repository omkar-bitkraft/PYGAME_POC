#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUMBER="${DISPLAY:-:99}"
VNC_PORT="${VNC_PORT:-5900}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
WORKDIR_PATH="${RUNTIME_WORKDIR:-/opt/runtime/workdir}"
MAIN_FILE="${WORKDIR_PATH}/main.py"

cleanup() {
  if [[ -n "${PYTHON_PID:-}" ]]; then
    kill "${PYTHON_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEBSOCKIFY_PID:-}" ]]; then
    kill "${WEBSOCKIFY_PID}" 2>/dev/null || true
  fi

  if [[ -n "${X11VNC_PID:-}" ]]; then
    kill "${X11VNC_PID}" 2>/dev/null || true
  fi

  if [[ -n "${XVFB_PID:-}" ]]; then
    kill "${XVFB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ ! -f "${MAIN_FILE}" ]]; then
  echo "launcher: missing runtime entrypoint at ${MAIN_FILE}" >&2
  exit 1
fi

echo "launcher: starting Xvfb on ${DISPLAY_NUMBER}"
Xvfb "${DISPLAY_NUMBER}" -screen 0 1280x720x24 &
XVFB_PID=$!

sleep 1

echo "launcher: starting x11vnc on port ${VNC_PORT}"
x11vnc \
  -display "${DISPLAY_NUMBER}" \
  -forever \
  -shared \
  -nopw \
  -listen 0.0.0.0 \
  -rfbport "${VNC_PORT}" &
X11VNC_PID=$!

echo "launcher: starting websockify on port ${NOVNC_PORT}"
websockify \
  --web /usr/share/novnc \
  --heartbeat 30 \
  "${NOVNC_PORT}" \
  "127.0.0.1:${VNC_PORT}" &
WEBSOCKIFY_PID=$!

echo "launcher: running ${MAIN_FILE}"
cd "${WORKDIR_PATH}"
python -u "${MAIN_FILE}" &
PYTHON_PID=$!

wait "${PYTHON_PID}"
