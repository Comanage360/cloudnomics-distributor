import { query } from "../db.js";

export type AuthEvent =
  | "signup" | "login" | "login_failed"
  | "verify_sent" | "verify_ok" | "reset_requested" | "reset_ok" | "rate_limited"
  | "approved" | "rejected";

export interface AuthEventInput {
  email?: string | null;
  event: AuthEvent;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
}

/** Record an auth/account event for the audit log. Best-effort — never throws. */
export async function logAuthEvent(e: AuthEventInput): Promise<void> {
  try {
    await query(
      "INSERT INTO auth_events (email, event, ip, user_agent, detail) VALUES ($1, $2, $3, $4, $5)",
      [e.email ?? null, e.event, e.ip ?? null, e.userAgent?.slice(0, 400) ?? null, e.detail ?? null]
    );
  } catch (err) {
    console.error("[auth_events]", err);
  }
}

export interface AuthEventRow {
  id: number;
  email: string | null;
  event: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
}

/** Recent auth events, newest first — admin activity log. */
export async function listAuthEvents(limit = 200, email?: string): Promise<AuthEventRow[]> {
  const lim = Math.min(Math.max(1, limit), 1000);
  const cols = "id, email, event, ip, user_agent, detail, created_at";
  if (email) {
    const r = await query<AuthEventRow>(
      `SELECT ${cols} FROM auth_events WHERE email = $1 ORDER BY created_at DESC LIMIT $2`,
      [email, lim]
    );
    return r.rows;
  }
  const r = await query<AuthEventRow>(
    `SELECT ${cols} FROM auth_events ORDER BY created_at DESC LIMIT $1`,
    [lim]
  );
  return r.rows;
}
