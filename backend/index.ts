import "dotenv/config";

import express, { Router } from "express";

import cors from "cors";

import type { NextFunction, Request, Response } from "express";
import { ConnectRouter } from "./routes/connect";
import { InterviewsRouter } from "./routes/interviews";
import { logError } from "./utils/logger";

const app = express();

const router = Router();

// Azure App Service assigns its own port and injects it via process.env.PORT —
// the app must bind to that or the platform's reverse proxy can't reach it.
const PORT: number = Number(process.env.PORT) || 8000;

const allowedOrigins = process.env.ALLOWED_ORIGINS?.replace(/^\[|\]$/g, "")
  ?.split(",")
  ?.map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json()); // to handle json payload

app.use("/api/connect", ConnectRouter);
app.use("/api/connect/interviews", InterviewsRouter);

app.get("/", (req: Request, res: Response) => {
  res.status(200).send({
    message: "Home Route of Application",
  });
});

// Catch-all safety net: anything a route didn't handle itself (a thrown
// error, or an async handler's rejected promise — Express 5 forwards those
// here automatically) lands here instead of Express's default HTML error
// page, so API clients always get JSON and the terminal always gets a log.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logError(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`App is up and running: http://localhost:${PORT}`);
});
