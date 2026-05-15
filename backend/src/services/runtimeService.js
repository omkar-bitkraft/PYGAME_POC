import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { closeRunStream, createRunStream, emitRunEvent } from "./streamManager.js";
import { getRuntimeState, setRuntimeState } from "./runtimeState.js";

const activeRuntime = {
  currentRun: null
};

function createError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function buildViewerUrl(runId = "") {
  const target = new URL(`http://localhost:${config.runtime.novncPort}/vnc_lite.html`);
  target.searchParams.set("autoconnect", "true");
  target.searchParams.set("resize", "remote");
  target.searchParams.set("path", "websockify");

  if (runId) {
    target.searchParams.set("runId", runId);
  }

  return target.toString();
}

export function buildWsUrl() {
  return `ws://localhost:${config.runtime.novncPort}/websockify`;
}

function buildRunId() {
  const now = new Date();
  const safe = now.toISOString().replace(/[-:TZ.]/g, "");
  return `run_${safe}`;
}

function safeKill(processHandle) {
  try {
    if (processHandle && !processHandle.killed) {
      processHandle.kill();
    }
  } catch {
    // Ignore cleanup failures for local helper processes.
  }
}

function runDockerCommand(args, options = {}) {
  const {
    cwd = config.runtime.repoRootPath,
    allowFailure = false
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(createError(`Failed to start docker command: ${error.message}`));
    });

    child.on("close", (code) => {
      const result = {
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (code !== 0 && !allowFailure) {
        reject(
          createError(
            result.stderr || `Docker command failed: docker ${args.join(" ")}`,
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}

async function ensureRuntimeWorkdir() {
  await fs.mkdir(config.runtime.workdirHostPath, { recursive: true });
}

async function writeRuntimeCode(code) {
  await ensureRuntimeWorkdir();
  const mainFilePath = path.join(config.runtime.workdirHostPath, "main.py");
  await fs.writeFile(mainFilePath, code, "utf8");
}

async function ensureRuntimeImage(run) {
  const inspectResult = await runDockerCommand(
    ["image", "inspect", config.runtime.image],
    { allowFailure: true },
  );

  if (inspectResult.code === 0) {
    emitRunEvent(run.runId, "status", {
      runId: run.runId,
      status: "image_ready",
      message: `Using existing image ${config.runtime.image}`
    });
    return;
  }

  emitRunEvent(run.runId, "status", {
    runId: run.runId,
    status: "building_image",
    message: `Building image ${config.runtime.image}`
  });

  await runDockerCommand(
    ["build", "-t", config.runtime.image, config.runtime.runtimeRootPath],
    { cwd: config.runtime.repoRootPath },
  );
}

async function removeManagedContainer() {
  await runDockerCommand(
    ["rm", "-f", config.runtime.containerName],
    { allowFailure: true },
  );
}

function attachContainerLogs(run) {
  const logProcess = spawn(
    "docker",
    ["logs", "-f", config.runtime.containerName],
    {
      cwd: config.runtime.repoRootPath,
      stdio: ["ignore", "pipe", "pipe"]
    },
  );

  run.logProcess = logProcess;

  logProcess.stdout.on("data", (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      emitRunEvent(run.runId, "stdout", {
        runId: run.runId,
        message: line
      });
    }
  });

  logProcess.stderr.on("data", (chunk) => {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      emitRunEvent(run.runId, "stderr", {
        runId: run.runId,
        message: line
      });
    }
  });
}

function scheduleStreamClose(runId) {
  setTimeout(() => {
    closeRunStream(runId);
  }, 250);
}

function finalizeRun(run, details) {
  if (!run || run.finalized) {
    return;
  }

  run.finalized = true;
  safeKill(run.logProcess);
  safeKill(run.waitProcess);

  if (activeRuntime.currentRun?.runId === run.runId) {
    activeRuntime.currentRun = null;
  }

  setRuntimeState({
    activeRunId: null,
    runtimeState: details.runtimeState
  });

  emitRunEvent(run.runId, "status", {
    runId: run.runId,
    status: details.status,
    message: details.message
  });

  emitRunEvent(run.runId, "exit", {
    runId: run.runId,
    code: details.code,
    reason: details.reason
  });

  scheduleStreamClose(run.runId);
}

function watchContainerExit(run) {
  const waitProcess = spawn(
    "docker",
    ["wait", config.runtime.containerName],
    {
      cwd: config.runtime.repoRootPath,
      stdio: ["ignore", "pipe", "pipe"]
    },
  );

  run.waitProcess = waitProcess;

  let stdout = "";
  let stderr = "";

  waitProcess.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  waitProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  waitProcess.on("close", () => {
    if (run.finalized) {
      return;
    }

    const parsedExitCode = Number.parseInt(stdout.trim(), 10);
    const exitCode = Number.isFinite(parsedExitCode) ? parsedExitCode : null;

    if (run.cancelled) {
      finalizeRun(run, {
        runtimeState: "idle",
        status: "stopped",
        message:
          run.stopReason === "replaced"
            ? "Previous run stopped for rerun."
            : "Run stopped.",
        code: exitCode,
        reason: run.stopReason || "stopped"
      });
      return;
    }

    const runtimeState = exitCode === 0 ? "exited" : "error";
    const status = exitCode === 0 ? "exited" : "error";
    const message =
      exitCode === 0
        ? "Runtime container exited cleanly."
        : stderr.trim() || "Runtime container exited with an error.";

    finalizeRun(run, {
      runtimeState,
      status,
      message,
      code: exitCode,
      reason: exitCode === 0 ? "completed" : "error"
    });
  });
}

async function launchRun(run) {
  try {
    emitRunEvent(run.runId, "status", {
      runId: run.runId,
      status: "preparing",
      message: "Preparing runtime image and container."
    });

    await ensureRuntimeImage(run);
    if (run.cancelled) {
      return;
    }

    await removeManagedContainer();
    if (run.cancelled) {
      return;
    }

    emitRunEvent(run.runId, "status", {
      runId: run.runId,
      status: "starting_container",
      message: "Starting the runtime container."
    });

    const runArgs = [
      "run",
      "-d",
      "--rm",
      "--name",
      config.runtime.containerName,
      "--mount",
      `type=bind,source=${config.runtime.workdirHostPath},target=${config.runtime.workdirContainerPath}`,
      "-p",
      `${config.runtime.novncPort}:${config.runtime.novncPort}`,
      "-e",
      "DISPLAY=:99",
      "-e",
      `VNC_PORT=${config.runtime.vncPort}`,
      "-e",
      `NOVNC_PORT=${config.runtime.novncPort}`,
      config.runtime.image
    ];

    const result = await runDockerCommand(runArgs);
    if (run.cancelled) {
      await removeManagedContainer();
      return;
    }

    run.containerId = result.stdout;
    attachContainerLogs(run);
    watchContainerExit(run);

    setRuntimeState({
      activeRunId: run.runId,
      runtimeState: "running"
    });

    emitRunEvent(run.runId, "status", {
      runId: run.runId,
      status: "running",
      message: `Container ${run.containerId || config.runtime.containerName} is running.`
    });
  } catch (error) {
    finalizeRun(run, {
      runtimeState: "error",
      status: "error",
      message: error.message,
      code: 1,
      reason: "startup_failed"
    });
  }
}

export async function stopActiveRun(reason = "stopped") {
  const currentRun = activeRuntime.currentRun;

  if (!currentRun) {
    setRuntimeState({
      activeRunId: null,
      runtimeState: "idle"
    });

    return {
      status: "stopped",
      runId: null
    };
  }

  currentRun.cancelled = true;
  currentRun.stopReason = reason;

  emitRunEvent(currentRun.runId, "status", {
    runId: currentRun.runId,
    status: "stopping",
    message: reason === "replaced" ? "Stopping previous run before rerun." : "Stopping active run."
  });

  setRuntimeState({
    activeRunId: currentRun.runId,
    runtimeState: "stopping"
  });

  await removeManagedContainer();

  finalizeRun(currentRun, {
    runtimeState: "idle",
    status: "stopped",
    message: reason === "replaced" ? "Previous run stopped for rerun." : "Run stopped.",
    code: null,
    reason
  });

  return {
    status: "stopped",
    runId: currentRun.runId
  };
}

export async function startRun(code) {
  if (typeof code !== "string") {
    throw createError("Code must be provided as a string.", 400);
  }

  if (!code.trim()) {
    throw createError("Code is required and cannot be empty.", 400);
  }

  const existingState = getRuntimeState();
  if (existingState.activeRunId) {
    await stopActiveRun("replaced");
  }

  await writeRuntimeCode(code);

  const runId = buildRunId();
  const run = {
    runId,
    cancelled: false,
    finalized: false,
    logProcess: null,
    waitProcess: null,
    containerId: null
  };

  activeRuntime.currentRun = run;
  createRunStream(runId);
  setRuntimeState({
    activeRunId: runId,
    runtimeState: "starting"
  });

  emitRunEvent(runId, "status", {
    runId,
    status: "starting",
    message: "Run accepted. Backend is starting the runtime."
  });

  void launchRun(run);

  return {
    runId,
    status: "starting",
    viewerUrl: buildViewerUrl(runId),
    wsUrl: buildWsUrl()
  };
}
