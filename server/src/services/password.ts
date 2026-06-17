import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

/** Hash a password with scrypt. Returns "saltHex:keyHex" (self-contained). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

/** Constant-time verify of a password against a stored "saltHex:keyHex". */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = Buffer.from(keyHex, "hex");
  const test = (await scryptAsync(password, Buffer.from(saltHex, "hex"), KEYLEN)) as Buffer;
  return key.length === test.length && timingSafeEqual(key, test);
}
