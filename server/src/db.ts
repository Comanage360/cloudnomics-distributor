import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { config } from "./config.js";
import type { Pricelist } from "./types.js";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return pool.query<T>(text, params);
}

/** Run schema + seed, then auto-import the bundled pricelist if none loaded. */
export async function migrate(): Promise<void> {
  const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf-8");
  const seed = readFileSync(join(__dirname, "..", "db", "seed.sql"), "utf-8");
  await pool.query(schema);
  await pool.query(seed);

  const count = await pool.query<{ n: string }>("SELECT COUNT(*)::int AS n FROM products");
  if (Number(count.rows[0].n) === 0) {
    const file = join(__dirname, "..", "db", "PANW_Pricelist.xlsx");
    if (existsSync(file)) {
      const { importPricelist } = await import("./services/importPricelist.js");
      const parsed = await importPricelist(file);
      console.log(`[db] auto-imported ${parsed.products.length} products from bundled pricelist`);
    } else {
      console.warn("[db] no products and no bundled pricelist — run `npm run import:pricelist <file.xlsx>`");
    }
  }
  console.log("[db] schema + seed applied");
}

/**
 * Load the pricelist the quote flow uses. All firewall series are surfaced —
 * PA-Series (one-time hardware), VM-Series (annual virtual), and CN-Series
 * (on-request, no price) — so the reseller can pick hardware vs virtual. The
 * pricing engine is unit-aware and treats null-priced rows as "on request".
 */
export async function loadPricelist(): Promise<Pricelist> {
  const fws = await query<{
    model: string;
    series: string;
    max_users: number | null;
    list_price: string | null;
    price_unit: string | null;
  }>(
    `SELECT model, series, max_users, list_price, price_unit
       FROM products
      WHERE series IN ('PA-Series', 'VM-Series', 'CN-Series')
      ORDER BY series ASC, max_users ASC NULLS LAST`
  );

  const settings = await query<{ key: string; value: unknown }>(
    "SELECT key, value FROM settings WHERE key IN ('xdr','currency')"
  );
  const map = Object.fromEntries(settings.rows.map((r) => [r.key, r.value]));

  return {
    currency: (map.currency as string) || "USD",
    firewalls: fws.rows.map((r) => ({
      sku: r.model,
      name: `${r.model} Next-Gen Firewall`,
      maxUsers: r.max_users ?? 9_999_999,
      list: r.list_price == null ? null : Number(r.list_price),
      series: r.series,
      unit: (r.price_unit as Pricelist["firewalls"][number]["unit"]) || "one_time",
    })),
    xdr: (map.xdr as Pricelist["xdr"]) || { sku: "CORTEX-XDR-PRO", name: "Cortex XDR Pro", listPerUser: 70 },
  };
}

// Allow `npm run migrate`
if (process.argv.includes("--migrate")) {
  migrate()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
