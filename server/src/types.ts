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

export interface QuoteSelection {
  sku: string;
  users: number;
  fwImpl?: boolean;
  xdr?: boolean;
  xdrImpl?: boolean;
  managed?: boolean;
  markup?: number;
  competitiveModel?: string; // model being migrated from — triggers +10% partner discount
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

export interface AuthUser {
  email: string;
  company: string;
}
