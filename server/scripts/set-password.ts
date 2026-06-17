import { setResellerPassword } from "../src/repositories/resellers.js";
import { hashPassword } from "../src/services/password.js";
import { pool } from "../src/db.js";

/**
 * Set (or reset) a reseller's password — hashing it with scrypt and storing the
 * hash. Creates the account if it doesn't exist yet.
 *
 *   npm --prefix server run set-password -- <email> <password> [company]
 */
async function main() {
  const [emailArg, password, companyArg] = process.argv.slice(2);
  const email = (emailArg || "").trim().toLowerCase();

  if (!email || !email.includes("@") || !password) {
    console.error('Usage: set-password -- <email> <password> [company]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const derived = email.split("@")[1]?.split(".")[0] || "reseller";
  const company = (companyArg || "").trim() || derived.charAt(0).toUpperCase() + derived.slice(1);

  await setResellerPassword(email, company, await hashPassword(password));
  console.log(`✓ Password set for ${email} (company: ${company})`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
