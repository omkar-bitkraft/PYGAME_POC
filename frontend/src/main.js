import "./style.css";
import { appConfig } from "./config.js";
import { sampleCode } from "./sampleCode.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="shell">
    <div class="shell__glow shell__glow--left"></div>
    <div class="shell__glow shell__glow--right"></div>
    <header class="hero">
      <div>
        <p class="eyebrow">Pygame Local POC</p>
        <h1>Browser shell for quick code-run-debug loops</h1>
        <p class="hero__copy">
          Phase 2 brings the frontend online with a focused editor, control bar,
          terminal panel, and viewer frame so the backend and runtime can plug
          into a stable UI.
        </p>
      </div>
      <div class="status-card">
        <span class="status-card__label">Backend</span>
        <strong id="backend-status">Checking...</strong>
        <span id="runtime-status" class="status-pill">idle</span>
      </div>
    </header>

    <main class="workspace">
      <section class="panel panel--editor">
        <div class="panel__header">
          <div>
            <p class="panel__eyebrow">Code</p>
            <h2>Python editor</h2>
          </div>
          <div class="button-row">
            <button id="run-button" class="button button--primary" type="button">Run</button>
            <button id="stop-button" class="button button--secondary" type="button">Stop</button>
          </div>
        </div>
        <textarea
          id="code-input"
          class="code-input"
          spellcheck="false"
          aria-label="Pygame source code"
        ></textarea>
      </section>

      <section class="panel panel--viewer">
        <div class="panel__header">
          <div>
            <p class="panel__eyebrow">Display</p>
            <h2>Viewer frame</h2>
          </div>
          <span class="status-pill" id="viewer-status">waiting for run</span>
        </div>
        <iframe
          id="viewer-frame"
          class="viewer-frame"
          title="Pygame noVNC viewer"
        ></iframe>
        <dl class="connection-grid">
          <div>
            <dt>Backend</dt>
            <dd id="backend-url"></dd>
          </div>
          <div>
            <dt>Viewer</dt>
            <dd id="viewer-url"></dd>
          </div>
          <div>
            <dt>Run ID</dt>
            <dd id="run-id">not started</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd id="transport-status">HTTP + SSE</dd>
          </div>
        </dl>
      </section>

      <section class="panel panel--terminal">
        <div class="panel__header">
          <div>
            <p class="panel__eyebrow">Terminal</p>
            <h2>Request and runtime notes</h2>
          </div>
        </div>
        <div id="terminal-output" class="terminal-output" aria-live="polite"></div>
      </section>
    </main>
  </div>
`;

const codeInput = document.querySelector("#code-input");
const runButton = document.querySelector("#run-button");
const stopButton = document.querySelector("#stop-button");
const backendStatus = document.querySelector("#backend-status");
const runtimeStatus = document.querySelector("#runtime-status");
const viewerStatus = document.querySelector("#viewer-status");
const viewerFrame = document.querySelector("#viewer-frame");
const terminalOutput = document.querySelector("#terminal-output");
const backendUrl = document.querySelector("#backend-url");
const viewerUrl = document.querySelector("#viewer-url");
const runId = document.querySelector("#run-id");
const transportStatus = document.querySelector("#transport-status");

const state = {
  currentRunId: null,
  viewerUrl: null,
  viewerWsUrl: null,
  viewerMountedRunId: null,
  isSubmitting: false,
  stream: null,
  streamRunId: null
};

codeInput.value = sampleCode;
backendUrl.textContent = appConfig.backendBaseUrl;
viewerUrl.textContent = "not connected";

function appendLog(type, message) {
  const line = document.createElement("div");
  line.className = `terminal-line terminal-line--${type}`;

  const timestamp = new Date().toLocaleTimeString();
  line.textContent = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  terminalOutput.append(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function clearLogs() {
  terminalOutput.innerHTML = "";
}

function closeStream(nextTransportStatus = "SSE idle") {
  if (state.stream) {
    state.stream.close();
    state.stream = null;
  }

  state.streamRunId = null;
  transportStatus.textContent = nextTransportStatus;
}

function setViewerPlaceholder(message) {
  viewerFrame.removeAttribute("src");
  viewerFrame.srcdoc = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: radial-gradient(circle at top, #17324c, #0a1220 70%);
            color: #dce7f4;
            font-family: "Trebuchet MS", "Segoe UI", sans-serif;
          }
          main {
            max-width: 28rem;
            padding: 1.5rem;
            text-align: center;
            line-height: 1.5;
          }
          strong {
            display: block;
            margin-bottom: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #ffd36e;
          }
        </style>
      </head>
      <body>
        <main>
          <strong>Viewer Standby</strong>
          <div>${message}</div>
        </main>
      </body>
    </html>
  `;
}

function buildViewerUrl(runWsUrl, nextRunId = "") {
  const viewerTarget = new URL(appConfig.defaultViewerPageUrl);
  viewerTarget.searchParams.set("wsUrl", runWsUrl || appConfig.defaultViewerWsUrl);

  if (nextRunId) {
    viewerTarget.searchParams.set("runId", nextRunId);
  }

  return viewerTarget.toString();
}

function clearViewer() {
  state.viewerUrl = null;
  state.viewerWsUrl = null;
  state.viewerMountedRunId = null;
  viewerUrl.textContent = "not connected";
  viewerStatus.textContent = "waiting for run";
  setViewerPlaceholder(
    "The iframe region is idle. Start a run to attach the local noVNC viewer."
  );
}

function prepareViewer(runWsUrl, nextRunId = "") {
  if (!runWsUrl) {
    clearViewer();
    return;
  }

  state.viewerWsUrl = runWsUrl;
  state.viewerUrl = buildViewerUrl(runWsUrl, nextRunId);
  state.viewerMountedRunId = null;
  viewerUrl.textContent = `${state.viewerWsUrl} (pending)`;
  viewerStatus.textContent = "waiting for viewer";
  setViewerPlaceholder(
    "Runtime is starting. The viewer will attach when the websocket is ready."
  );
}

function mountViewer(nextRunId = state.currentRunId) {
  if (!state.viewerWsUrl) {
    clearViewer();
    return;
  }

  const nextViewerUrl = buildViewerUrl(state.viewerWsUrl, nextRunId || "");
  if (
    state.viewerMountedRunId === (nextRunId || null) &&
    state.viewerUrl === nextViewerUrl &&
    viewerFrame.getAttribute("src") === nextViewerUrl
  ) {
    return;
  }

  state.viewerUrl = nextViewerUrl;
  state.viewerMountedRunId = nextRunId || null;
  viewerUrl.textContent = state.viewerWsUrl;
  viewerFrame.removeAttribute("srcdoc");
  viewerFrame.src = nextViewerUrl;
  viewerStatus.textContent = "viewer connecting";
  appendLog("status", `Viewer websocket target set to ${state.viewerWsUrl}`);
}

function setBusy(isBusy) {
  state.isSubmitting = isBusy;
  runButton.disabled = isBusy;
  stopButton.disabled = isBusy;
}

function handleStreamEvent(type, rawPayload) {
  let payload;

  try {
    payload = JSON.parse(rawPayload.data);
  } catch {
    appendLog("stderr", `Failed to parse ${type} event payload.`);
    return;
  }

  if (
    payload.runId &&
    state.streamRunId &&
    payload.runId !== state.streamRunId
  ) {
    return;
  }

  if (type === "status") {
    runtimeStatus.textContent = payload.status || "unknown";

    if (payload.message) {
      appendLog("status", payload.message);
    }

    if (payload.runId) {
      runId.textContent = payload.runId;
      state.currentRunId = payload.runId;
    }

    if (payload.status === "running") {
      mountViewer(payload.runId || state.currentRunId);
      return;
    }

    if (state.viewerWsUrl && !state.viewerMountedRunId) {
      viewerStatus.textContent = "waiting for viewer";
    } else {
      viewerStatus.textContent = payload.status || "unknown";
    }

    return;
  }

  if (type === "stdout" || type === "stderr") {
    appendLog(type, payload.message || "");
    return;
  }

  if (type === "exit") {
    appendLog(
      "status",
      `Run finished with reason=${payload.reason || "unknown"} code=${payload.code ?? "n/a"}`
    );
    viewerStatus.textContent = payload.reason === "completed" ? "completed" : "stopped";
    runtimeStatus.textContent =
      payload.reason === "completed" ? "exited" : payload.reason || "stopped";
    clearViewer();
    state.currentRunId = null;
    runId.textContent = "not started";
    closeStream("SSE idle");
  }
}

function connectStream(nextRunId) {
  closeStream("SSE idle");
  transportStatus.textContent = "SSE connecting";

  const stream = new EventSource(
    `${appConfig.backendBaseUrl}/runs/${nextRunId}/stream`
  );

  stream.onopen = () => {
    if (state.stream !== stream) {
      return;
    }

    transportStatus.textContent = "SSE connected";
  };

  stream.addEventListener("status", (event) => {
    handleStreamEvent("status", event);
  });

  stream.addEventListener("stdout", (event) => {
    handleStreamEvent("stdout", event);
  });

  stream.addEventListener("stderr", (event) => {
    handleStreamEvent("stderr", event);
  });

  stream.addEventListener("exit", (event) => {
    handleStreamEvent("exit", event);
  });

  stream.onerror = () => {
    if (state.stream !== stream) {
      return;
    }

    appendLog(
      "status",
      "SSE connection closed."
    );
    closeStream(state.currentRunId ? "SSE reconnect needed" : "SSE idle");
  };

  state.stream = stream;
  state.streamRunId = nextRunId;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${appConfig.backendBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error || body?.message || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return body;
}

async function loadHealth() {
  try {
    const payload = await requestJson("/health", { method: "GET" });
    backendStatus.textContent = "Reachable";
    runtimeStatus.textContent = payload.runtimeState || "idle";
    appendLog(
      "status",
      `Health check ok. runtimeState=${payload.runtimeState || "idle"}`
    );

    if (payload.activeRunId) {
      state.currentRunId = payload.activeRunId;
      runId.textContent = payload.activeRunId;
      connectStream(payload.activeRunId);
      prepareViewer(payload.wsUrl || appConfig.defaultViewerWsUrl, payload.activeRunId);
      if (payload.runtimeState === "running") {
        mountViewer(payload.activeRunId);
      }
      return;
    }

    state.currentRunId = null;
    runId.textContent = "not started";
    clearViewer();
  } catch (error) {
    backendStatus.textContent = "Unavailable";
    runtimeStatus.textContent = "unknown";
    appendLog(
      "stderr",
      `Health check failed. ${error.message}`
    );
  }
}

async function handleRun() {
  if (state.currentRunId) {
    closeStream("SSE switching");
  }

  clearLogs();
  appendLog("status", "Submitting code to /run");
  setBusy(true);

  try {
    const payload = await requestJson("/run", {
      method: "POST",
      body: JSON.stringify({ code: codeInput.value })
    });

    state.currentRunId = payload.runId || null;
    runId.textContent = state.currentRunId || "unknown";
    runtimeStatus.textContent = payload.status || "starting";
    backendStatus.textContent = "Reachable";
    prepareViewer(payload.wsUrl || appConfig.defaultViewerWsUrl, state.currentRunId);
    transportStatus.textContent = "SSE connecting";
    appendLog(
      "stdout",
      `Run accepted with status=${payload.status || "starting"}`
    );
    if (payload.wsUrl) {
      appendLog("status", `noVNC websocket target: ${payload.wsUrl}`);
    }
    if (state.currentRunId) {
      connectStream(state.currentRunId);
    }
  } catch (error) {
    backendStatus.textContent = "Reachable";
    runtimeStatus.textContent = "error";
    runId.textContent = "not started";
    clearViewer();
    appendLog("stderr", `Run failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function handleStop() {
  appendLog("status", "Sending stop request to /stop");
  setBusy(true);

  try {
    const payload = await requestJson("/stop", { method: "POST" });
    state.currentRunId = null;
    runId.textContent = "not started";
    runtimeStatus.textContent = payload.status || "stopped";
    viewerStatus.textContent = "stopped";
    clearViewer();
    appendLog("stdout", `Stop acknowledged with status=${payload.status || "stopped"}`);
  } catch (error) {
    runtimeStatus.textContent = "error";
    appendLog("stderr", `Stop failed: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

runButton.addEventListener("click", handleRun);
stopButton.addEventListener("click", handleStop);
viewerFrame.addEventListener("load", () => {
  if (state.viewerUrl && state.viewerMountedRunId) {
    viewerStatus.textContent = "viewer loaded";
  }
});

clearViewer();
loadHealth();
