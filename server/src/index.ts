import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { pricelistRouter, recommendRouter } from "./routes/pricelist.js";
import { quotesRouter } from "./routes/quotes.js";
import { calendarRouter } from "./routes/calendar.js";
import { brandingRouter } from "./routes/branding.js";
import { ratesRouter } from "./routes/rates.js";

const app = express();

app.use(cors({ origin: config.corsOrigin.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "5mb" })); // headroom for base64 logos

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/pricelist", pricelistRouter);
app.use("/api/recommend", recommendRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/branding", brandingRouter);
app.use("/api/rates", ratesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await migrate();
  } catch (e) {
    console.warn("[db] migrate skipped/failed (is DATABASE_URL set?):", (e as Error).message);
  }
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
    console.log(`[server] Claude recommendation: ${config.anthropic.apiKey ? "live API" : "local fallback (no key)"}`);
  });
}

start();
