import cors from "cors";
import express from "express";
import { runtimeRoutes } from "./routes/runtimeRoutes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_request, response) => {
  response.json({
    name: "pygame-poc-backend",
    status: "ok"
  });
});

app.use(runtimeRoutes);

export { app };
