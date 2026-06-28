export type PriceUnit = "one_time" | "annual" | "on_request";

export interface Firewall {
  sku: string;
  name: string;
  maxUsers: number;
  list: number | null; // null for on-request products (CN-Series)
  series: string; // "PA-Series" | "VM-Series" | "CN-Series"
  unit: PriceUnit;
}
export interface Xdr {
  sku: string;
  name: string;
  listPerUser: number;
}
export interface Pricelist {
  currency: string;
  firewalls: Firewall[];
  xdr: Xdr;
}
export interface LineItem {
  key: string;
  label: string;
  meta: string;
  qty: number;
  listTotal: number;
  reseller: number;
  service: boolean;
}
export interface QuoteTotals {
  items: LineItem[];
  discount: number;
  markup: number;
  resellerTotal: number;
  customerTotal: number;
  margin: number;
  currency: string;
}
export interface Recommendation {
  sku: string;
  users: number;
  message: string;
  series?: string;
  unit?: PriceUnit;
  source: "claude" | "fallback";
}
export interface ChatMessage {
  id: number;
  role: "claude" | "user";
  text: string;
  card?: { firewall: Firewall; users: number };
}
export type Step =
  | "intake" | "competitive" | "selectFw" | "fwImpl" | "xdr" | "xdrImpl"
  | "managed" | "markup" | "whitelabel" | "send" | "done";

/** Fields the AI advisor can set on the selection/customer as it guides a session. */
export interface ChatStatePatch {
  sku?: string;
  users?: number;
  fwImpl?: boolean;
  xdr?: boolean;
  xdrImpl?: boolean;
  managed?: boolean;
  competitiveModel?: string;
  markup?: number;
  customerName?: string;
  customerEmail?: string;
}

export interface AuthUser {
  email: string;
  company: string;
  role?: "admin" | "reseller";
}

export interface AdminReseller {
  email: string;
  company: string | null;
  role: string;
  quote_count: number;
  total_value: string;
  last_quote_at: string | null;
}

export interface UsageRow {
  reseller_email: string;
  calls: number;    // completed quotes
  sessions: number; // AI sessions started (incl. abandoned)
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}

export interface UsageReport {
  overall: { calls: number; sessions: number; input_tokens: string; output_tokens: string; cost_usd: string };
  byReseller: UsageRow[];
}

export interface Rates {
  discount: number;
  competitiveBonus: number;
  implRate: number;
  managedRate: number;
  markupDefault: number;
  markupMin: number;
  markupMax: number;
}

export type PortalView = "assistant" | "quotes" | "renewals" | "products" | "branding" | "admin";

export interface AdminQuote extends QuoteSummary {
  reseller_email: string;
}

export interface QuoteSummary {
  number: number;
  customer_name: string;
  customer_email: string;
  customer_total: string;
  reseller_total: string;
  markup: string;
  status: string;
  created_at: string;
  sku: string | null;
}
