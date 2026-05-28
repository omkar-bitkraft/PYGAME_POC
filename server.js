/**
 * server.js  —  Pygame POC Server
 *
 * Three WebSocket endpoints per session:
 *   /control/:id   two-way: run/stop/input cmds in, stdout/stderr/status out
 *   /video/:id     one-way: binary JPEG frames from pygame runner
 *   /audio/:id     one-way: raw PCM audio chunks from PulseAudio
 */

'use strict';

const express    = require('express');
const http       = require('http');
const path       = require('path');
const { spawn }  = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const net        = require('net');

const PORT            = process.env.PORT  || 3000;
const CONTAINER_IMAGE = process.env.IMAGE || 'pygame-poc:latest';
const RUNNER_WS_PORT  = 7777;
const MAX_SESSIONS    = 55;
const DOCKER_HOST     = '127.0.0.1';
const CONTAINER_MEMORY = process.env.CONTAINER_MEMORY || '512m';
const CONTAINER_CPUS = process.env.CONTAINER_CPUS || '1.5';
const CONTAINER_PIDS_LIMIT = process.env.CONTAINER_PIDS_LIMIT || '100';
const HOST_ASSETS_DIR = path.resolve(__dirname, 'assets');
const CONTAINER_WORKDIR = '/workspace';
const CONTAINER_CODE_PATH = `${CONTAINER_WORKDIR}/main.py`;

// ── App ───────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// app.use(express.static(path.join(__dirname, '../client')));
app.use(express.static(__dirname));
app.get('/health', (_, res) => res.json({ sessions: sessions.size, max: MAX_SESSIONS }));

// ── WS servers ────────────────────────────────────────────────────
const wssControl = new WebSocketServer({ noServer: true });
const wssVideo   = new WebSocketServer({ noServer: true });
const wssAudio   = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const [, type, sessionId] = req.url.split('/');
  if (!sessionId) return socket.destroy();
  if (type === 'control') wssControl.handleUpgrade(req, socket, head, ws => onControl(ws, sessionId));
  else if (type === 'video')   wssVideo.handleUpgrade(req, socket, head, ws => onVideo(ws, sessionId));
  else if (type === 'audio')   wssAudio.handleUpgrade(req, socket, head, ws => onAudio(ws, sessionId));
  else socket.destroy();
});

// ── Sessions ──────────────────────────────────────────────────────
const sessions = new Map();

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      id, containerId: null, runnerPort: null,
      runnerWs: null, audioProc: null, procs: [],
      controlWs: null, videoWs: null, audioWs: null,
    });
  }
  return sessions.get(id);
}

function activeSessionCount() {
  let count = 0;
  for (const s of sessions.values()) {
    if (s.containerId) count += 1;
  }
  return count;
}

function maybeDisposeSession(s) {
  if (!s.containerId && !s.runnerWs && s.procs.length === 0 &&
      !s.controlWs && !s.videoWs && !s.audioWs) {
    sessions.delete(s.id);
  }
}

// ── WS handlers ───────────────────────────────────────────────────
function onControl(ws, sessionId) {
  const s = getSession(sessionId);
  s.controlWs = ws;
  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if      (msg.type === 'run')   await runSession(s, msg.code);
    else if (msg.type === 'stop')  { stopSession(s); send(ws, { type: 'stopped' }); }
    else if (msg.type === 'input') {
      if (s.runnerWs?.readyState === WebSocket.OPEN)
        s.runnerWs.send(JSON.stringify(msg.event));
    }
  });
  ws.on('close', () => {
    s.controlWs = null;
    stopSession(s);
  });
}

function onVideo(ws, sessionId) {
  const s = getSession(sessionId); s.videoWs = ws;
  ws.on('close', () => {
    s.videoWs = null;
    maybeDisposeSession(s);
  });
}

function onAudio(ws, sessionId) {
  const s = getSession(sessionId); s.audioWs = ws;
  ws.on('close', () => {
    s.audioWs = null;
    maybeDisposeSession(s);
  });
}

// ── Run session ───────────────────────────────────────────────────
async function runSession(s, code) {
  stopSession(s);
  if (activeSessionCount() >= MAX_SESSIONS)
    return send(s.controlWs, { type: 'error', message: 'Server at capacity' });

  try {
    status(s, 'Starting container...');
    s.containerId = await startContainer();
    s.runnerPort = await getPublishedPort(s.containerId, RUNNER_WS_PORT);

    // Write student code (base64 encoded to preserve newlines)
    const codeB64 = Buffer.from(code).toString('base64');
    await dockerExec(
      s.containerId,
      `mkdir -p ${CONTAINER_WORKDIR} && printf '%s' '${codeB64}' | base64 -d > ${CONTAINER_CODE_PATH}`
    );
    await stageWorkspaceAssets(s);

    // Start PulseAudio
    status(s, 'Starting audio subsystem...');
    await dockerExec(s.containerId, '/opt/start_pulse.sh');

    // Launch pygame runner
    status(s, 'Launching pygame...');
    const runner = spawn('docker', [
      'exec',
      s.containerId,
      'bash',
      '-lc',
      `cd ${CONTAINER_WORKDIR} && python3 -u /opt/pygame_runner.py ${CONTAINER_CODE_PATH}`
    ]);
    s.procs.push(runner);
    runner.stdout.on('data', d => send(s.controlWs, { type: 'stdout', data: d.toString() }));
    runner.stderr.on('data', d => send(s.controlWs, { type: 'stderr', data: d.toString() }));
    runner.on('close', code => { send(s.controlWs, { type: 'exit', code }); stopSession(s); });

    // Wait for runner WS then proxy it
    await waitForPort(DOCKER_HOST, s.runnerPort, 10_000);
    await connectRunnerWs(s);

    // Start audio pipeline
    startAudioCapture(s);

    send(s.controlWs, { type: 'ready', sessionId: s.id });

  } catch (err) {
    send(s.controlWs, { type: 'error', message: err.message });
    stopSession(s);
  }
}

// ── Runner WS proxy ───────────────────────────────────────────────
async function connectRunnerWs(s, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    try {
      await connectRunnerWsOnce(s);
      return;
    } catch (err) {
      lastErr = err;
      await delay(200);
    }
  }

  throw lastErr || new Error('Runner WebSocket did not become ready');
}

function connectRunnerWsOnce(s) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${DOCKER_HOST}:${s.runnerPort}`);
    let opened = false;
    const fail = (err) => {
      if (opened) return;
      try { ws.close(); } catch {}
      reject(err);
    };
    ws.on('open', () => {
      opened = true;
      s.runnerWs = ws;
      resolve();
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary && s.videoWs?.readyState === WebSocket.OPEN)
        s.videoWs.send(data, { binary: true });
    });
    ws.on('error', fail);
    ws.on('close', () => {
      if (!opened) {
        fail(new Error('Runner WebSocket closed before handshake completed'));
        return;
      }
      s.runnerWs = null;
    });
  });
}

// ── Audio capture ─────────────────────────────────────────────────
function startAudioCapture(s) {
  const proc = spawn('docker', ['exec', s.containerId, 'bash', '-c',
    'parec --device=game_audio.monitor --latency-msec=5 --process-time-msec=5 --format=s16le --rate=44100 --channels=2'
  ]);
  s.procs.push(proc);
  s.audioProc = proc;
  proc.stdout.on('data', chunk => {
    if (s.audioWs?.readyState === WebSocket.OPEN)
      s.audioWs.send(chunk, { binary: true });
  });
}

// ── Stop session ──────────────────────────────────────────────────
function stopSession(s) {
  for (const p of s.procs) try { p.kill(); } catch {}
  s.procs = [];
  try { s.runnerWs?.close(); } catch {}
  s.runnerWs = null;
  s.audioProc = null;
  if (s.containerId) {
    spawn('docker', ['rm', '-f', s.containerId]).unref();
    s.containerId = null;
  }
  s.runnerPort = null;
  maybeDisposeSession(s);
}

// ── Docker helpers ────────────────────────────────────────────────
function startContainer() {
  return new Promise((resolve, reject) => {
    const dockerArgs = [
      'run', '-d',
      '-p', `127.0.0.1::${RUNNER_WS_PORT}`,
      '--mount', `type=bind,source=${HOST_ASSETS_DIR},target=${CONTAINER_WORKDIR}/assets,readonly`,
      '--cap-drop=ALL', '--security-opt=no-new-privileges',
    ];

    if (CONTAINER_MEMORY) dockerArgs.push(`--memory=${CONTAINER_MEMORY}`);
    if (CONTAINER_CPUS) dockerArgs.push(`--cpus=${CONTAINER_CPUS}`);
    if (CONTAINER_PIDS_LIMIT) dockerArgs.push(`--pids-limit=${CONTAINER_PIDS_LIMIT}`);

    dockerArgs.push(CONTAINER_IMAGE, 'sleep', 'infinity');

    const p = spawn('docker', dockerArgs);
    let id = '', err = '';
    p.stdout.on('data', d => id += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', c => c === 0
      ? resolve(id.trim())
      : reject(new Error(err.trim() || 'docker run failed')));
  });
}

function getPublishedPort(id, containerPort) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['port', id, `${containerPort}/tcp`]);
    let output = '', err = '';
    p.stdout.on('data', d => output += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', c => {
      if (c !== 0) {
        reject(new Error(err.trim() || `Could not inspect port ${containerPort}`));
        return;
      }
      const match = output.trim().match(/:(\d+)$/);
      if (!match) {
        reject(new Error(`No published port found for ${containerPort}/tcp`));
        return;
      }
      resolve(Number(match[1]));
    });
  });
}

function dockerExec(id, cmd) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec', id, 'bash', '-c', cmd]);
    let err = '';
    p.stderr.on('data', d => err += d.toString());
    p.on('close', c => c === 0 ? resolve() : reject(new Error(err.trim() || `exec exit ${c}`)));
  });
}

function stageWorkspaceAssets(s) {
  return dockerExec(
    s.containerId,
    `if [ -d ${CONTAINER_WORKDIR}/assets ]; then cp -a ${CONTAINER_WORKDIR}/assets/. ${CONTAINER_WORKDIR}/; fi`
  );
}

function waitForPort(host, port, ms = 8000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const try_ = () => {
      const s = net.createConnection(port, host);
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => Date.now() > deadline
        ? reject(new Error(`${host}:${port} not ready after ${ms}ms`))
        : setTimeout(try_, 100));
    };
    try_();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Util ──────────────────────────────────────────────────────────
function send(ws, obj) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function status(s, msg) { console.log(`[${s.id}] ${msg}`); send(s.controlWs, { type: 'status', message: msg }); }

// ── Boot ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Pygame POC → http://localhost:${PORT}`);
  console.log(`Image: ${CONTAINER_IMAGE}`);
});
