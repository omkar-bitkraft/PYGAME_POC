import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const generatedRuntimeRoot = path.join(repoRoot, ".runtime-generated");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env"), override: true });

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  backendPort: asNumber(process.env.BACKEND_PORT, 3001),
  runtime: {
    image: process.env.RUNTIME_IMAGE || "pygame-poc-runtime",
    containerName: process.env.RUNTIME_CONTAINER_NAME || "pygame-poc-active",
    novncPort: asNumber(process.env.NOVNC_PORT, 6080),
    vncPort: asNumber(process.env.VNC_PORT, 5900),
    repoRootPath: repoRoot,
    generatedRootPath: generatedRuntimeRoot,
    runtimeRootPath: path.join(repoRoot, "runtime"),
    workdirHostPath: path.join(generatedRuntimeRoot, "workdir"),
    workdirContainerPath: "/opt/runtime/workdir"
  }
};
