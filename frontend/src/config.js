const DEFAULTS = {
  backendPort: 3001,
  novncPort: 6080,
  viewerPath: "/viewer.html"
};

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function resolveHostOrigin(port) {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${port}`;
}

function resolveBackendBaseUrl() {
  const explicitBase = import.meta.env.VITE_BACKEND_BASE_URL?.trim();
  if (explicitBase) {
    return trimTrailingSlash(explicitBase);
  }

  const backendPort = Number(
    import.meta.env.VITE_BACKEND_PORT || DEFAULTS.backendPort
  );

  return resolveHostOrigin(backendPort);
}

function buildViewerWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const novncPort = Number(import.meta.env.VITE_NOVNC_PORT || DEFAULTS.novncPort);
  const configuredPath = import.meta.env.VITE_NOVNC_WS_PATH || "/websockify";
  const path = configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`;
  return `${protocol}//${window.location.hostname}:${novncPort}${path}`;
}

function buildViewerPageUrl() {
  const explicitViewerUrl = import.meta.env.VITE_NOVNC_VIEWER_URL?.trim();
  if (explicitViewerUrl) {
    return explicitViewerUrl;
  }

  const configuredPath = import.meta.env.VITE_NOVNC_VIEWER_PATH || DEFAULTS.viewerPath;
  const target = new URL(
    configuredPath.startsWith("/") ? configuredPath : `/${configuredPath}`,
    window.location.origin
  );
  return target.toString();
}

export const appConfig = {
  backendBaseUrl: resolveBackendBaseUrl(),
  defaultViewerPageUrl: buildViewerPageUrl(),
  defaultViewerWsUrl: buildViewerWsUrl()
};
