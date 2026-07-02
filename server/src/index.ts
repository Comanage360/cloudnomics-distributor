import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { pricelistRouter, recommendRouter } from "./routes/pricelist.js";
import { quotesRouter } from "./routes/quotes.js";
import { chatRouter } from "./routes/chat.js";
import { calendarRouter } from "./routes/calendar.js";
import { brandingRouter } from "./routes/branding.js";
import { ratesRouter } from "./routes/rates.js";
import { limitsRouter } from "./routes/limits.js";
import { adminRouter } from "./routes/admin.js";

const app = express();

app.use(cors({ origin: config.corsOrigin.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "5mb" })); // headroom for base64 logos

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/pricelist", pricelistRouter);
app.use("/api/recommend", recommendRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/chat", chatRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/branding", brandingRouter);
app.use("/api/rates", ratesRouter);
app.use("/api/limits", limitsRouter);
app.use("/api/admin", adminRouter);

// Single-service deploy (Cloud Run): if a built SPA is present, serve it from
// the same origin as the API. Static assets are served directly; any other
// non-/api path falls back to index.html for client-side routing. When no build
// is present (local `npm run dev`, where Vite serves the SPA on :5173) this is
// a no-op, so the dev split-origin setup is unaffected.
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = process.env.WEB_DIST || join(__dirname, "..", "web-dist");
if (existsSync(join(webDist, "index.html"))) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  console.log(`[server] serving SPA from ${webDist}`);
}

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
