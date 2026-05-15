import RFB from "@novnc/novnc";
import "./viewer.css";

const root = document.querySelector("#viewer-app");

root.innerHTML = `
  <div class="viewer-shell">
    <div class="viewer-shell__bar">
      <strong>Live Viewer</strong>
      <span id="viewer-connection-status">Connecting...</span>
    </div>
    <div id="viewer-canvas" class="viewer-canvas"></div>
  </div>
`;

const canvasHost = document.querySelector("#viewer-canvas");
const statusNode = document.querySelector("#viewer-connection-status");
const params = new URLSearchParams(window.location.search);
const wsUrl = params.get("wsUrl") || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:6080/websockify`;
const INITIAL_RETRY_WINDOW_MS = 6000;
const RETRY_DELAY_MS = 350;

let rfb = null;
let disposed = false;
let hasConnectedOnce = false;
let connectWindowStartedAt = Date.now();
let reconnectTimer = null;
let rfbDisconnected = true;

function setStatus(message) {
  statusNode.textContent = message;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (disposed || hasConnectedOnce) {
    return;
  }

  const elapsed = Date.now() - connectWindowStartedAt;
  if (elapsed >= INITIAL_RETRY_WINDOW_MS) {
    setStatus("Connection unavailable");
    return;
  }

  setStatus("Viewer is starting. Retrying...");
  clearReconnectTimer();
  reconnectTimer = window.setTimeout(() => {
    if (!disposed) {
      connect();
    }
  }, RETRY_DELAY_MS);
}

function connect() {
  clearReconnectTimer();

  try {
    rfbDisconnected = false;
    rfb = new RFB(canvasHost, wsUrl);
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.background = "#101826";
    rfb.qualityLevel = 6;
    rfb.compressionLevel = 2;
    rfb.focusOnClick = true;

    rfb.addEventListener("connect", () => {
      hasConnectedOnce = true;
      setStatus("Connected");
    });

    rfb.addEventListener("disconnect", (event) => {
      rfbDisconnected = true;
      rfb = null;

      if (!hasConnectedOnce) {
        scheduleReconnect();
        return;
      }

      setStatus(event.detail.clean ? "Disconnected" : "Connection lost");
    });

    rfb.addEventListener("credentialsrequired", () => {
      setStatus("Password required");
    });

    rfb.addEventListener("securityfailure", () => {
      setStatus("Security failure");
    });
  } catch (error) {
    rfbDisconnected = true;
    rfb = null;

    if (!hasConnectedOnce) {
      scheduleReconnect();
      return;
    }

    setStatus(`Viewer error: ${error.message}`);
  }
}

connect();

window.addEventListener("beforeunload", () => {
  disposed = true;
  clearReconnectTimer();

  if (rfb && !rfbDisconnected) {
    rfb.disconnect();
  }
});
