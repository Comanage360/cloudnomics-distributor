import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, setToken, getToken, setUnauthorizedHandler } from "../api";
import { clearQuoteSession } from "./quote";
import type { AuthUser } from "../types";

interface JwtPayload { email?: string; company?: string; role?: "admin" | "reseller"; exp?: number }

/** Decode a JWT payload (no verification — just to read email/company/exp). */
function decodeJwt(t: string | null): JwtPayload | null {
  const part = t?.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}
const isExpired = (p: JwtPayload | null) =>
  !!p && typeof p.exp === "number" && p.exp * 1000 <= Date.now();

export const useSession = defineStore("session", () => {
  // Restore from the stored token on load; drop it if already expired.
  const initial = decodeJwt(getToken());
  if (getToken() && isExpired(initial)) setToken(null);
  const valid = initial && !isExpired(initial);

  const user = ref<AuthUser | null>(
    valid ? { email: initial!.email || "", company: initial!.company || "", role: initial!.role } : null
  );
  const authed = ref(Boolean(getToken()) && !!valid);
  const isAdmin = computed(() => user.value?.role === "admin");
  const error = ref("");
  // Optimistic on restore (avoids a banner flash); corrected by login/refresh().
  const emailVerified = ref(true);

  let expiryTimer: number | undefined;
  function scheduleExpiry() {
    window.clearTimeout(expiryTimer);
    const p = decodeJwt(getToken());
    if (!p?.exp) return;
    const ms = p.exp * 1000 - Date.now();
    if (ms <= 0) { logout(); return; }
    // setTimeout caps at ~24.8 days; our tokens are 12h so this is safe.
    expiryTimer = window.setTimeout(() => logout(), ms);
  }

  function logout() {
    window.clearTimeout(expiryTimer);
    setToken(null);
    user.value = null;
    authed.value = false;
    clearQuoteSession(); // don't leave a draft quote for the next user on this browser
  }

  async function login(email: string, password: string) {
    error.value = "";
    try {
      const { token, user: u, emailVerified: ev } = await api.login(email, password);
      setToken(token);
      user.value = u;
      authed.value = true;
      emailVerified.value = ev;
      scheduleExpiry();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  /** Returns "pending" when the account needs admin approval (no session granted),
   *  true when signed in (admin self-approve), or false on error. */
  async function register(email: string, password: string, confirmPassword: string, company?: string) {
    error.value = "";
    try {
      const r = await api.register(email, password, confirmPassword, company);
      if (r.pending || !r.token || !r.user) return "pending" as const;
      setToken(r.token);
      user.value = r.user;
      authed.value = true;
      emailVerified.value = r.emailVerified ?? false;
      scheduleExpiry();
      return true as const;
    } catch (e) {
      error.value = (e as Error).message;
      return false as const;
    }
  }

  /** Refresh user + verified status from the server (after load / after verify). */
  async function refresh() {
    if (!authed.value) return;
    try {
      const { user: u, emailVerified: ev } = await api.me();
      user.value = u;
      emailVerified.value = ev;
    } catch { /* a stale token surfaces via other protected calls */ }
  }

  /** Start a password reset — always resolves ok (never reveals if the email exists). */
  async function requestReset(email: string) {
    error.value = "";
    try { await api.requestPasswordReset(email); return true; }
    catch (e) { error.value = (e as Error).message; return false; }
  }

  /** Complete a reset from an emailed token; logs the user in on success. */
  async function resetPassword(token: string, password: string, confirmPassword: string) {
    error.value = "";
    try {
      const { token: jwt, user: u, emailVerified: ev } = await api.resetPassword(token, password, confirmPassword);
      setToken(jwt);
      user.value = u;
      authed.value = true;
      emailVerified.value = ev;
      scheduleExpiry();
      return true;
    } catch (e) { error.value = (e as Error).message; return false; }
  }

  /** Confirm the account email from an emailed token. */
  async function verifyEmail(token: string) {
    error.value = "";
    try {
      const r = await api.verifyEmail(token);
      if (r.emailVerified && user.value?.email === r.email) emailVerified.value = true;
      return true;
    } catch (e) { error.value = (e as Error).message; return false; }
  }

  /** Resend the verification email to the signed-in user. */
  async function resendVerification() {
    try { await api.resendVerification(); return true; } catch { return false; }
  }

  // Force logout if a protected request is rejected (expired/invalid token),
  // arm the idle expiry timer, and sync verified status for a restored session.
  setUnauthorizedHandler(() => logout());
  scheduleExpiry();
  refresh();

  return {
    user, authed, isAdmin, error, emailVerified,
    login, register, logout, refresh, requestReset, resetPassword, verifyEmail, resendVerification,
  };
});
