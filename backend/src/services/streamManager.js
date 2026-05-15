const RUN_HISTORY_LIMIT = 250;

const runStreams = new Map();

function getOrCreateEntry(runId) {
  if (!runStreams.has(runId)) {
    runStreams.set(runId, {
      history: [],
      clients: new Set(),
      closed: false
    });
  }

  return runStreams.get(runId);
}

function formatEvent(type, payload) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function createRunStream(runId) {
  return getOrCreateEntry(runId);
}

export function hasRunStream(runId) {
  return runStreams.has(runId);
}

export function subscribeToRunStream(runId, response) {
  const entry = runStreams.get(runId);

  if (!entry) {
    return false;
  }

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();
  response.write("retry: 1000\n\n");

  for (const event of entry.history) {
    response.write(formatEvent(event.type, event.payload));
  }

  if (entry.closed) {
    response.end();
    return true;
  }

  entry.clients.add(response);
  return true;
}

export function detachRunStreamClient(runId, response) {
  const entry = runStreams.get(runId);
  entry?.clients.delete(response);
}

export function emitRunEvent(runId, type, payload) {
  const entry = getOrCreateEntry(runId);
  const event = { type, payload };

  entry.history.push(event);
  if (entry.history.length > RUN_HISTORY_LIMIT) {
    entry.history.shift();
  }

  const formatted = formatEvent(type, payload);
  for (const client of entry.clients) {
    client.write(formatted);
  }
}

export function closeRunStream(runId) {
  const entry = runStreams.get(runId);
  if (!entry || entry.closed) {
    return;
  }

  entry.closed = true;

  for (const client of entry.clients) {
    client.end();
  }

  entry.clients.clear();
}
