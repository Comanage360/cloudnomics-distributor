import { query } from "../db.js";

/** How many quote emails this reseller has sent within the last `hours`. */
export async function countEmailSendsSince(resellerEmail: string, hours: number): Promise<number> {
  const r = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM email_sends
      WHERE reseller_email = $1 AND created_at >= now() - ($2 || ' hours')::interval`,
    [resellerEmail, String(hours)]
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Record one outgoing quote email (for the daily cap + monitoring). */
export async function logEmailSend(resellerEmail: string, toEmail: string, ccCount: number): Promise<void> {
  await query(
    "INSERT INTO email_sends (reseller_email, to_email, cc_count) VALUES ($1, $2, $3)",
    [resellerEmail, toEmail, ccCount]
  );
}
