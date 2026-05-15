import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.FRONTEND_PORT || 5173);

  return {
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          viewer: path.resolve(__dirname, "viewer.html")
        }
      }
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true
    },
    preview: {
      host: "0.0.0.0",
      port,
      strictPort: true
    }
  };
});
