import { query } from "../db.js";

export async function upsertReseller(email: string, company: string): Promise<void> {
  await query(
    `INSERT INTO resellers (email, company)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET company = EXCLUDED.company`,
    [email, company]
  );
}
