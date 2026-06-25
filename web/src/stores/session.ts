import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, setToken, getToken, setUnauthorizedHandler } from "../api";
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
  }

  async function login(email: string, password: string) {
    error.value = "";
    try {
      const { token, user: u } = await api.login(email, password);
      setToken(token);
      user.value = u;
      authed.value = true;
      scheduleExpiry();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  async function register(email: string, password: string, company?: string) {
    error.value = "";
    try {
      const { token, user: u } = await api.register(email, password, company);
      setToken(token);
      user.value = u;
      authed.value = true;
      scheduleExpiry();
      return true;
    } catch (e) {
      error.value = (e as Error).message;
      return false;
    }
  }

  // Force logout if a protected request is rejected (expired/invalid token),
  // and arm the idle expiry timer for the current session.
  setUnauthorizedHandler(() => logout());
  scheduleExpiry();

  return { user, authed, isAdmin, error, login, register, logout };
});
