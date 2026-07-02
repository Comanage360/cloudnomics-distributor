import { query } from "../db.js";
import type { LimitRequest } from "../types.js";

/** Record a reseller's request to raise their AI token limit. */
export async function insertLimitRequest(input: {
  resellerEmail: string;
  period: "monthly" | "yearly" | null;
  used: number | null;
  limitValue: number | null;
  reason: string | null;
}): Promise<LimitRequest> {
  const r = await query<LimitRequest>(
    `INSERT INTO limit_requests (reseller_email, period, used, limit_value, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, reseller_email, period, used, limit_value, reason, status, created_at, resolved_at`,
    [input.resellerEmail, input.period, input.used, input.limitValue, input.reason]
  );
  return r.rows[0];
}

/** All limit requests, pending first then most recent — admin queue. */
export async function listLimitRequests(): Promise<LimitRequest[]> {
  const r = await query<LimitRequest>(
    `SELECT id, reseller_email, period, used, limit_value, reason, status, created_at, resolved_at
       FROM limit_requests
      ORDER BY (status = 'pending') DESC, created_at DESC`
  );
  return r.rows;
}

/** Whether a reseller currently has an unresolved (pending) request. */
export async function hasPendingRequest(email: string): Promise<boolean> {
  const r = await query<{ n: string }>(
    "SELECT COUNT(*)::int AS n FROM limit_requests WHERE reseller_email = $1 AND status = 'pending'",
    [email]
  );
  return Number(r.rows[0]?.n ?? 0) > 0;
}

/** Mark a request approved or dismissed. */
export async function resolveLimitRequest(id: number, status: "approved" | "dismissed"): Promise<void> {
  await query(
    "UPDATE limit_requests SET status = $2, resolved_at = now() WHERE id = $1",
    [id, status]
  );
}
