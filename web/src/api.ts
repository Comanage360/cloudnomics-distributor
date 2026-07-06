import type { AdminQuote, AdminReseller, AuthEventRow, AuthUser, ChatStatePatch, LimitRequest, Pricelist, QuoteSummary, QuoteTotals, Rates, Step, UsageReport } from "./types";

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

type AuthResult = { token: string; user: AuthUser; emailVerified: boolean };

export const api = {
  login: (email: string, password: string) =>
    req<AuthResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, confirmPassword: string, company?: string) =>
    req<AuthResult>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, confirmPassword, company }),
    }),

  requestPasswordReset: (email: string) =>
    req<{ ok: boolean }>("/api/auth/request-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    req<AuthResult>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password, confirmPassword }),
    }),

  verifyEmail: (token: string) =>
    req<{ ok: boolean; emailVerified: boolean; email: string }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: () =>
    req<{ ok: boolean }>("/api/auth/resend-verification", { method: "POST", body: "{}" }),

  me: () => req<{ user: AuthUser; emailVerified: boolean }>("/api/auth/me"),

  pricelist: () => req<Pricelist>("/api/pricelist"),

  // One AI advisor turn: send the conversation + current selection state, get
  // back the next reply, a validated state patch, the step, and a done flag.
  chat: (payload: { messages: { role: "user" | "assistant"; text: string }[]; state: ChatStatePatch; sessionId: string }) =>
    req<{ reply: string; patch?: ChatStatePatch; step?: Step; done?: boolean; limited?: boolean; period?: "monthly" | null; used?: number; limit?: number }>("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Reseller asks their admin to raise their AI token limit (server recomputes context).
  requestLimitIncrease: (reason: string) =>
    req<{ ok: boolean; id?: number; already?: boolean }>("/api/limits/request-increase", {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  // Whether the current reseller already has a pending increase request.
  myLimitRequest: () => req<{ pending: boolean }>("/api/limits/my-request"),

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

  sendQuote: (number: number, opts?: { to?: string; cc?: string; subject?: string; body?: string }) =>
    req<{ sent: boolean; dryRun: boolean }>(`/api/quotes/${number}/send`, {
      method: "POST",
      body: JSON.stringify(opts || {}),
    }),

  reminder: (customerName: string, customerEmail: string) =>
    req<{ google: string; outlook: string; ics: string }>("/api/calendar/reminder", {
      method: "POST",
      body: JSON.stringify({ customerName, customerEmail }),
    }),

  // PDF as a blob (auth header needs to be attached, so we fetch then objectURL).
  // variant "partner" = Cloudnomics→reseller base-cost quote; default = customer quote.
  async quotePdf(number: number, variant: "partner" | "customer" = "customer"): Promise<string> {
    const res = await fetch(`${BASE}/api/quotes/${number}/pdf?variant=${variant}`, {
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
  adminSaveResellerLimit: (email: string, limits: { monthly: number | null }) =>
    req<{ ok: boolean }>(`/api/admin/resellers/${encodeURIComponent(email)}/limits`, {
      method: "PUT",
      body: JSON.stringify(limits),
    }),
  adminAuthEvents: (limit = 200) => req<AuthEventRow[]>(`/api/admin/auth-events?limit=${limit}`),
  adminLimitRequests: () => req<LimitRequest[]>("/api/admin/limit-requests"),
  adminResolveLimitRequest: (id: number, status: "approved" | "dismissed") =>
    req<{ ok: boolean }>(`/api/admin/limit-requests/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  async adminQuotePdf(number: number, variant: "partner" | "customer" = "customer"): Promise<string> {
    const res = await fetch(`${BASE}/api/admin/quotes/${number}/pdf?variant=${variant}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Could not load PDF");
    return URL.createObjectURL(await res.blob());
  },
};
