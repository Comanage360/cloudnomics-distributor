import { query } from "../db.js";

export interface ResellerRow {
  email: string;
  company: string | null;
  logo_url: string | null;
}

export async function upsertReseller(email: string, company: string): Promise<void> {
  await query(
    `INSERT INTO resellers (email, company)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET company = EXCLUDED.company`,
    [email, company]
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
