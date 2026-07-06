import { createHash, randomBytes } from "node:crypto";
import { query } from "../db.js";

export type TokenKind = "verify" | "reset";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Issue a single-use token. Returns the RAW token (goes in the emailed link);
 *  only its sha256 hash is persisted, so a DB leak can't be replayed. */
export async function issueToken(email: string, kind: TokenKind, ttlMs: number): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await query(
    "INSERT INTO auth_tokens (email, kind, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [email, kind, sha256(raw), expiresAt]
  );
  return raw;
}

/** Consume a token: if valid, unused and unexpired, mark it (and the account's
 *  other tokens of the same kind) used, and return the email. Else null. */
export async function consumeToken(raw: string, kind: TokenKind): Promise<string | null> {
  const r = await query<{ id: number; email: string }>(
    `SELECT id, email FROM auth_tokens
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
      ORDER BY id DESC LIMIT 1`,
    [sha256(raw), kind]
  );
  const row = r.rows[0];
  if (!row) return null;
  await query(
    "UPDATE auth_tokens SET used_at = now() WHERE email = $1 AND kind = $2 AND used_at IS NULL",
    [row.email, kind]
  );
  return row.email;
}
