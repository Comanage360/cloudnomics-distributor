import type { Request, Response, NextFunction } from "express";
import { logAuthEvent } from "../repositories/authEvents.js";

/** In-memory sliding-window buckets: key -> hit timestamps (ms). */
const store = new Map<string, number[]>();

export interface RateLimitOpts {
  name: string;                    // used in the audit detail
  windowMs: number;
  max: number;                     // allowed hits per window
  keyFn: (req: Request) => string; // what to bucket by (e.g. ip, ip+email)
}

/**
 * Lightweight in-memory rate limiter for auth endpoints. Blocks with 429 once a
 * key exceeds `max` hits within `windowMs`. State is per-process and resets on
 * restart — acceptable at this volume; enough to blunt brute-force attempts.
 */
export function rateLimit(opts: RateLimitOpts) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${opts.name}:${opts.keyFn(req)}`;
    const hits = (store.get(key) || []).filter((t) => now - t < opts.windowMs);

    if (hits.length >= opts.max) {
      store.set(key, hits);
      res.setHeader("Retry-After", Math.ceil((opts.windowMs - (now - hits[0])) / 1000));
      logAuthEvent({ event: "rate_limited", ip: req.ip ?? null, userAgent: (req.headers["user-agent"] as string) || null, detail: opts.name });
      return res.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    }
    hits.push(now);
    store.set(key, hits);
    next();
  };
}

// Bound memory: drop entries with no hits in the last hour.
const prune = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    const kept = v.filter((t) => now - t < 60 * 60 * 1000);
    if (kept.length) store.set(k, kept);
    else store.delete(k);
  }
}, 10 * 60 * 1000);
prune.unref?.();
