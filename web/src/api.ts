import type { AdminQuote, AdminReseller, AuthUser, Pricelist, QuoteSummary, QuoteTotals, Rates, Recommendation, UsageReport } from "./types";

const BASE = import.meta.env.VITE_API_URL || "";

let token: string | null = localStorage.getItem("cn_token");
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("cn_token", t);
  else localStorage.removeItem("cn_token");
}

// Called when an authenticated request is rejected (expired/invalid token).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    // Token expired/invalid on a protected route → force logout (but not for
    // the login/register calls themselves, which surface their own errors).
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      setToken(null);
      onUnauthorized?.();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, company?: string) =>
    req<{ token: string; user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, company }),
    }),

  pricelist: () => req<Pricelist>("/api/pricelist"),

  recommend: (requirement: string) =>
    req<Recommendation>("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ requirement }),
    }),

  nextNumber: () => req<{ number: number }>("/api/quotes/next-number"),

  listQuotes: () => req<QuoteSummary[]>("/api/quotes"),

  rates: () => req<Rates>("/api/rates"),

  getBranding: () => req<{ logo: string | null; company: string }>("/api/branding"),

  saveBranding: (payload: { logo: string | null; company?: string }) =>
    req<{ logo: string | null; company: string }>("/api/branding", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  createQuote: (payload: Record<string, unknown>) =>
    req<QuoteTotals & { number: number }>("/api/quotes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  sendQuote: (number: number) =>
    req<{ sent: boolean; dryRun: boolean }>(`/api/quotes/${number}/send`, {
      method: "POST",
    }),

  reminder: (customerName: string, customerEmail: string) =>
    req<{ google: string; outlook: string; ics: string }>("/api/calendar/reminder", {
      method: "POST",
      body: JSON.stringify({ customerName, customerEmail }),
    }),

  // PDF as a blob (auth header needs to be attached, so we fetch then objectURL)
  async quotePdf(number: number): Promise<string> {
    const res = await fetch(`${BASE}/api/quotes/${number}/pdf`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Could not load PDF");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // ---- admin ----
  adminResellers: () => req<AdminReseller[]>("/api/admin/resellers"),
  adminQuotes: (reseller?: string) =>
    req<AdminQuote[]>(`/api/admin/quotes${reseller ? `?reseller=${encodeURIComponent(reseller)}` : ""}`),
  adminUsage: () => req<UsageReport>("/api/admin/usage"),
  adminRates: () => req<Rates>("/api/admin/rates"),
  adminSaveRates: (rates: Partial<Rates>) =>
    req<Rates>("/api/admin/rates", { method: "PUT", body: JSON.stringify(rates) }),
  async adminQuotePdf(number: number): Promise<string> {
    const res = await fetch(`${BASE}/api/admin/quotes/${number}/pdf`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Could not load PDF");
    return URL.createObjectURL(await res.blob());
  },
};
