import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.backendPort, "0.0.0.0", () => {
  console.log(
    `pygame-poc backend listening on http://localhost:${config.backendPort}`,
  );
});
