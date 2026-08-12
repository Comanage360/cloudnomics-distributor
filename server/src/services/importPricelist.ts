import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { pool } from "../db.js";

const KNOWN_SERIES = ["PA-Series", "VM-Series", "CN-Series", "Cortex-XDR"];

export interface ParsedProduct {
  model: string;
  series: string;
  recommendedUsers: string;
  maxUsers: number | null;
  formFactor: string;
  fwThroughput: string;
  tpThroughput: string;
  sessionsMax: string;
  listPrice: number | null;
  priceUnit: "one_time" | "annual" | "on_request";
  notes: string;
}

export interface ParsedPricelist {
  currency: string;
  products: ParsedProduct[];
  xdr: { sku: string; name: string; listPerUser: number };
}

/** A SKU from the PANW GLOBAL price list (subscriptions/support, not firewalls). */
export interface ParsedCatalogItem {
  partNumber: string;
  category: string;
  product: string;
  model: string;
  description: string;
  listPrice: number | null;
  priceUnit: ParsedProduct["priceUnit"];
  discountCategory: string;
  eolDate: string;
}

function parseMaxUsers(text: string): number | null {
  const nums = (text.match(/[\d,]+/g) || []).map((n) => parseInt(n.replace(/,/g, ""), 10));
  if (!nums.length) return null;
  let max = Math.max(...nums);
  if (text.includes("+")) max = Math.max(max, 9_999_999); // open-ended top tier
  return max;
}

function parsePrice(text: string): { price: number | null; unit: ParsedProduct["priceUnit"] } {
  const t = String(text);
  // "on request" (Cloudnomics sheet) and "PER PANW QUOTE" (PANW global sheet)
  // both mean the same thing: no list price, quote it with the vendor.
  if (/request/i.test(t) || /per\s+panw\s+quote/i.test(t)) return { price: null, unit: "on_request" };
  const unit: ParsedProduct["priceUnit"] = /\/yr/i.test(t) ? "annual" : "one_time";
  const cleaned = t.replace(/,/g, "").replace(/[^\d.]/g, "");
  const price = cleaned ? Number(cleaned) : null;
  if (price == null) return { price: null, unit: "on_request" }; // no number = not priceable
  return { price, unit };
}

const cell = (v: unknown) => (v == null ? "" : String(v).trim());

/** Parse the PANW pricelist workbook into structured data (no DB writes). */
export function parseWorkbook(path: string): ParsedPricelist {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false });

  // Locate the header row (contains "Model" and a price column).
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => cell(c) === "Model") && r.some((c) => /list price/i.test(cell(c)))
  );
  if (headerIdx < 0) throw new Error("Could not find the pricelist header row");

  const header = rows[headerIdx].map((c) => cell(c));
  const col = (name: RegExp) => header.findIndex((h) => name.test(h));
  const idx = {
    series: col(/^series$/i),
    model: col(/^model$/i),
    users: col(/recommended users/i),
    form: col(/form factor/i),
    fw: col(/fw throughput/i),
    tp: col(/threat prevention/i),
    sessions: col(/sessions/i),
    price: col(/list price/i),
    notes: col(/notes/i),
  };

  const products: ParsedProduct[] = [];
  let xdr = { sku: "CORTEX-XDR-PRO", name: "Cortex XDR Pro", listPerUser: 70 };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const series = cell(r[idx.series]);
    const model = cell(r[idx.model]);
    if (!model || !KNOWN_SERIES.includes(series)) continue; // skip footnotes/blank rows

    const recommendedUsers = cell(r[idx.users]);
    const { price, unit } = parsePrice(cell(r[idx.price]));

    if (series === "Cortex-XDR") {
      if (price) xdr = { sku: "CORTEX-XDR-PRO", name: "Cortex XDR Pro", listPerUser: price };
      continue; // XDR lives in settings, not products
    }

    products.push({
      model,
      series,
      recommendedUsers,
      maxUsers: parseMaxUsers(recommendedUsers),
      formFactor: cell(r[idx.form]),
      fwThroughput: cell(r[idx.fw]),
      tpThroughput: cell(r[idx.tp]),
      sessionsMax: cell(r[idx.sessions]),
      listPrice: price,
      priceUnit: unit,
      notes: cell(r[idx.notes]),
    });
  }

  return { currency: "USD", products, xdr };
}

/** Extract the "(B)" from a discount label like "Subscription (B)". */
function parseDiscountCategory(text: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(String(text).trim());
  return m ? m[1].trim() : "";
}

/**
 * Parse the PANW GLOBAL price list sheet, keeping only SKUs whose part number
 * matches `filter` (default: MSSP). That sheet is ~10k rows across every PANW
 * product line, so a filter is required — importing it wholesale would swamp
 * the catalog. The "INTERNAL ONLY" sheet is never read.
 */
export function parseGlobalCatalog(
  path: string,
  filter: RegExp = /MSSP/i
): ParsedCatalogItem[] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  const ws = wb.Sheets["GLOBAL Price List"];
  if (!ws) throw new Error('Sheet "GLOBAL Price List" not found in the workbook');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false });

  // The sheet has a few banner rows above the real header.
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => /^part name$/i.test(cell(c))) && r.some((c) => /price/i.test(cell(c)))
  );
  if (headerIdx < 0) throw new Error("Could not find the GLOBAL price list header row");

  const header = rows[headerIdx].map((c) => cell(c));
  const col = (name: RegExp) => header.findIndex((h) => name.test(h));
  const idx = {
    category: col(/product category/i),
    product: col(/^product$/i),
    model: col(/^model$/i),
    part: col(/^part name$/i),
    description: col(/^description$/i),
    price: col(/price/i),
    discount: col(/^discount/i),
    eol: col(/end-of-life/i),
  };

  const items: ParsedCatalogItem[] = [];
  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const partNumber = cell(r[idx.part]);
    if (!partNumber || !filter.test(partNumber)) continue;
    if (seen.has(partNumber)) continue; // the sheet can repeat a SKU
    seen.add(partNumber);

    const { price, unit } = parsePrice(cell(r[idx.price]));
    const category = cell(r[idx.category]);
    // The global sheet carries no "/yr" marker, so the term has to come from the
    // category. PANW subscription SKUs are sold on an annual term — ASSUMPTION,
    // confirm with PANW before these prices are used in a customer quote.
    const priceUnit: ParsedProduct["priceUnit"] =
      unit === "on_request" ? "on_request" : /subscription/i.test(category) ? "annual" : unit;

    items.push({
      partNumber,
      category,
      product: cell(r[idx.product]),
      model: cell(r[idx.model]),
      description: cell(r[idx.description]),
      listPrice: price,
      priceUnit,
      discountCategory: parseDiscountCategory(cell(r[idx.discount])),
      eolDate: cell(r[idx.eol]),
    });
  }
  return items;
}

/** Parse + write catalog SKUs to Postgres (idempotent, upsert by part number). */
export async function importGlobalCatalog(
  path: string,
  tag = "mssp",
  filter: RegExp = /MSSP/i
): Promise<ParsedCatalogItem[]> {
  const items = parseGlobalCatalog(path, filter);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const it of items) {
      await client.query(
        `INSERT INTO catalog_items
           (part_number, category, product, model, description,
            list_price, price_unit, discount_category, tag, eol_date, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         ON CONFLICT (part_number) DO UPDATE SET
           category=EXCLUDED.category, product=EXCLUDED.product, model=EXCLUDED.model,
           description=EXCLUDED.description, list_price=EXCLUDED.list_price,
           price_unit=EXCLUDED.price_unit, discount_category=EXCLUDED.discount_category,
           tag=EXCLUDED.tag, eol_date=EXCLUDED.eol_date, updated_at=now()`,
        [
          it.partNumber, it.category, it.product, it.model, it.description,
          it.listPrice, it.priceUnit, it.discountCategory, tag, it.eolDate,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return items;
}

/** Parse + write the pricelist to Postgres (idempotent). */
export async function importPricelist(path: string): Promise<ParsedPricelist> {
  const parsed = parseWorkbook(path);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of parsed.products) {
      await client.query(
        `INSERT INTO products
           (model, series, recommended_users, max_users, form_factor,
            fw_throughput, tp_throughput, sessions_max, list_price, price_unit, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (model) DO UPDATE SET
           series=EXCLUDED.series, recommended_users=EXCLUDED.recommended_users,
           max_users=EXCLUDED.max_users, form_factor=EXCLUDED.form_factor,
           fw_throughput=EXCLUDED.fw_throughput, tp_throughput=EXCLUDED.tp_throughput,
           sessions_max=EXCLUDED.sessions_max, list_price=EXCLUDED.list_price,
           price_unit=EXCLUDED.price_unit, notes=EXCLUDED.notes`,
        [
          p.model, p.series, p.recommendedUsers, p.maxUsers, p.formFactor,
          p.fwThroughput, p.tpThroughput, p.sessionsMax, p.listPrice, p.priceUnit, p.notes,
        ]
      );
    }
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('xdr', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(parsed.xdr)]
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('currency', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(parsed.currency)]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return parsed;
}
