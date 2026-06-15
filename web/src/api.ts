import type { AuthUser, Pricelist, QuoteSummary, QuoteTotals, Recommendation } from "./types";

const BASE = import.meta.env.VITE_API_URL || "";

let token: string | null = localStorage.getItem("cn_token");
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("cn_token", t);
  else localStorage.removeItem("cn_token");
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
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string) =>
    req<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  pricelist: () => req<Pricelist>("/api/pricelist"),

  recommend: (requirement: string) =>
    req<Recommendation>("/api/recommend", {
      method: "POST",
      body: JSON.stringify({ requirement }),
    }),

  nextNumber: () => req<{ number: number }>("/api/quotes/next-number"),

  listQuotes: () => req<QuoteSummary[]>("/api/quotes"),

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
};
