import { query } from "../db.js";

export interface ResellerRow {
  email: string;
  company: string | null;
  logo_url: string | null;
}

/**
 * Ensure a reseller row exists. The derived company is only used to seed a NEW
 * row — an existing (possibly user-edited) company is preserved across logins.
 */
export async function upsertReseller(email: string, company: string): Promise<void> {
  await query(
    `INSERT INTO resellers (email, company)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email, company]
  );
}

export interface ResellerCredentials {
  email: string;
  company: string | null;
  passwordHash: string | null;
  role: string;
}

/** Fetch a reseller's login credentials (includes the password hash + role). */
export async function getResellerCredentials(email: string): Promise<ResellerCredentials | null> {
  const r = await query<{ email: string; company: string | null; password_hash: string | null; role: string }>(
    "SELECT email, company, password_hash, role FROM resellers WHERE email = $1",
    [email]
  );
  const row = r.rows[0];
  return row ? { email: row.email, company: row.company, passwordHash: row.password_hash, role: row.role || "reseller" } : null;
}

/** Promote/demote a reseller. */
export async function setResellerRole(email: string, role: "admin" | "reseller"): Promise<void> {
  await query("UPDATE resellers SET role = $2 WHERE email = $1", [email, role]);
}

export interface ResellerSummary {
  email: string;
  company: string | null;
  role: string;
  quote_count: number;
  total_value: string;
  last_quote_at: string | null;
  ai_cost: string;
}

/** All resellers with quote aggregates + AI spend — admin dashboard. */
export async function listResellers(): Promise<ResellerSummary[]> {
  const r = await query<ResellerSummary>(
    `SELECT r.email, r.company, r.role,
            COUNT(q.number)::int AS quote_count,
            COALESCE(SUM(q.customer_total), 0) AS total_value,
            MAX(q.created_at) AS last_quote_at,
            COALESCE((SELECT SUM(cost_usd) FROM ai_usage a WHERE a.reseller_email = r.email), 0) AS ai_cost
       FROM resellers r
       LEFT JOIN quotes q ON q.reseller_email = r.email
      GROUP BY r.email, r.company, r.role
      ORDER BY total_value DESC`
  );
  return r.rows;
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
