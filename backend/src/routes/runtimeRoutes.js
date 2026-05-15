import { Router } from "express";
import { config } from "../config.js";
import { getRuntimeState } from "../services/runtimeState.js";
import {
  detachRunStreamClient,
  hasRunStream,
  subscribeToRunStream
} from "../services/streamManager.js";
import {
  buildViewerUrl,
  buildWsUrl,
  startRun,
  stopActiveRun
} from "../services/runtimeService.js";

const router = Router();

router.get("/health", (_request, response) => {
  const runtimeState = getRuntimeState();

  response.json({
    status: "ok",
    activeRunId: runtimeState.activeRunId,
    runtimeState: runtimeState.runtimeState,
    viewerUrl: buildViewerUrl(runtimeState.activeRunId || ""),
    wsUrl: buildWsUrl()
  });
});

router.post("/run", async (request, response) => {
  try {
    const payload = await startRun(request.body?.code);
    response.status(202).json(payload);
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message,
      status: "error",
      viewerUrl: buildViewerUrl(),
      wsUrl: buildWsUrl()
    });
  }
});

router.post("/stop", async (_request, response) => {
  try {
    const payload = await stopActiveRun("stopped");
    response.json(payload);
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message,
      status: "error"
    });
  }
});

router.get("/runs/:runId/stream", (request, response) => {
  const { runId } = request.params;

  if (!hasRunStream(runId)) {
    response.status(404).json({
      error: `Unknown runId ${runId}.`,
      status: "not_found"
    });
    return;
  }

  subscribeToRunStream(runId, response);

  request.on("close", () => {
    detachRunStreamClient(runId, response);
  });
});

export { router as runtimeRoutes };
