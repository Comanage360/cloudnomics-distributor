import { query } from "../db.js";

export interface ResellerRow {
  email: string;
  company: string | null;
  logo_url: string | null;
}

export interface ResellerCredentials {
  email: string;
  company: string | null;
  passwordHash: string | null;
  role: string;
  emailVerified: boolean;
  approved: boolean;
}

/** Fetch a reseller's login credentials (password hash + role + verified + approved). */
export async function getResellerCredentials(email: string): Promise<ResellerCredentials | null> {
  const r = await query<{ email: string; company: string | null; password_hash: string | null; role: string; email_verified: boolean; approved: boolean }>(
    "SELECT email, company, password_hash, role, email_verified, approved FROM resellers WHERE email = $1",
    [email]
  );
  const row = r.rows[0];
  return row
    ? { email: row.email, company: row.company, passwordHash: row.password_hash, role: row.role || "reseller", emailVerified: !!row.email_verified, approved: !!row.approved }
    : null;
}

/** Promote/demote a reseller. */
export async function setResellerRole(email: string, role: "admin" | "reseller"): Promise<void> {
  await query("UPDATE resellers SET role = $2 WHERE email = $1", [email, role]);
}

/** Mark a reseller's email as verified. */
export async function setEmailVerified(email: string): Promise<void> {
  await query("UPDATE resellers SET email_verified = true WHERE email = $1", [email]);
}

/** Approve (or un-approve) a reseller's portal access. */
export async function setApproved(email: string, approved: boolean): Promise<void> {
  await query("UPDATE resellers SET approved = $2 WHERE email = $1", [email, approved]);
}

/** Remove a reseller account (used to reject a pending signup). */
export async function deleteReseller(email: string): Promise<void> {
  await query("DELETE FROM resellers WHERE email = $1", [email]);
}

export interface ResellerSummary {
  email: string;
  company: string | null;
  role: string;
  quote_count: number;
  total_value: string;
  last_quote_at: string | null;
  ai_cost: string;
  monthly_cost_limit: string | null; // per-reseller $ override; null = inherit default
  cost_30d: string;                  // rolling-30d AI spend (USD)
  approved: boolean;                 // false = pending admin approval
}

/** All resellers with quote aggregates + AI spend + spend limit/usage — admin dashboard. */
export async function listResellers(): Promise<ResellerSummary[]> {
  const r = await query<ResellerSummary>(
    `SELECT r.email, r.company, r.role, r.approved,
            r.monthly_cost_limit,
            COUNT(q.number)::int AS quote_count,
            COALESCE(SUM(q.customer_total), 0) AS total_value,
            MAX(q.created_at) AS last_quote_at,
            COALESCE((SELECT SUM(cost_usd) FROM ai_usage a WHERE a.reseller_email = r.email), 0) AS ai_cost,
            COALESCE((SELECT SUM(cost_usd) FROM ai_usage a
                       WHERE a.reseller_email = r.email AND a.created_at >= now() - interval '30 days'), 0) AS cost_30d
       FROM resellers r
       LEFT JOIN quotes q ON q.reseller_email = r.email
      GROUP BY r.email, r.company, r.role, r.approved, r.monthly_cost_limit
      ORDER BY (r.approved) ASC, total_value DESC`
  );
  return r.rows;
}

export interface ResellerLimitsRow {
  monthly_cost_limit: string | null;
}

/** A reseller's per-account $ override (null = inherit the global default). */
export async function getResellerLimits(email: string): Promise<ResellerLimitsRow | null> {
  const r = await query<ResellerLimitsRow>(
    "SELECT monthly_cost_limit FROM resellers WHERE email = $1",
    [email]
  );
  return r.rows[0] || null;
}

/** Set a reseller's $ override. null clears the override (inherit default). */
export async function setResellerLimits(email: string, monthly: number | null): Promise<void> {
  await query(
    "UPDATE resellers SET monthly_cost_limit = $2 WHERE email = $1",
    [email, monthly]
  );
}

/** Create a reseller account with a hashed password. No-op if the email exists. */
export async function createReseller(
  email: string,
  company: string,
  passwordHash: string
): Promise<void> {
  await query(
    `INSERT INTO resellers (email, company, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [email, company, passwordHash]
  );
}

export async function getReseller(email: string): Promise<ResellerRow | null> {
  const r = await query<ResellerRow>(
    "SELECT email, company, logo_url FROM resellers WHERE email = $1",
    [email]
  );
  return r.rows[0] || null;
}

/** Save (or clear) the reseller's default white-label logo. */
export async function setResellerLogo(email: string, logo: string | null): Promise<void> {
  await query("UPDATE resellers SET logo_url = $2 WHERE email = $1", [email, logo]);
}

/** Save the reseller's display company name. */
export async function setResellerCompany(email: string, company: string): Promise<void> {
  await query("UPDATE resellers SET company = $2 WHERE email = $1", [email, company]);
}

/** Set (or reset) a reseller's password hash, creating the account if missing. */
export async function setResellerPassword(
  email: string,
  company: string,
  passwordHash: string
): Promise<void> {
  await query(
    `INSERT INTO resellers (email, company, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, company, passwordHash]
  );
}
