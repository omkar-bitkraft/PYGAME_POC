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

let rfb = null;

function setStatus(message) {
  statusNode.textContent = message;
}

function connect() {
  try {
    rfb = new RFB(canvasHost, wsUrl);
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.background = "#101826";
    rfb.qualityLevel = 6;
    rfb.compressionLevel = 2;
    rfb.focusOnClick = true;

    rfb.addEventListener("connect", () => {
      setStatus("Connected");
    });

    rfb.addEventListener("disconnect", (event) => {
      setStatus(event.detail.clean ? "Disconnected" : "Connection lost");
    });

    rfb.addEventListener("credentialsrequired", () => {
      setStatus("Password required");
    });

    rfb.addEventListener("securityfailure", () => {
      setStatus("Security failure");
    });
  } catch (error) {
    setStatus(`Viewer error: ${error.message}`);
  }
}

connect();

window.addEventListener("beforeunload", () => {
  if (rfb) {
    rfb.disconnect();
  }
});
