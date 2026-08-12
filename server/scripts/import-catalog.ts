import { existsSync } from "node:fs";
import { parseGlobalCatalog, importGlobalCatalog } from "../src/services/importPricelist.js";
import { pool } from "../src/db.js";

/**
 * Import tagged SKUs from the PANW GLOBAL price list workbook.
 *
 *   npm --prefix server run import:catalog -- <file.xlsx> [--dry] [--tag=mssp] [--filter=MSSP]
 *
 * Unlike the firewall pricelist there is no default file: the global workbook is
 * ~10k rows and is supplied per refresh, so the path must be given explicitly.
 */
async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const tag = (args.find((a) => a.startsWith("--tag="))?.split("=")[1] || "mssp").trim();
  const filterArg = args.find((a) => a.startsWith("--filter="))?.split("=")[1];
  const filter = new RegExp(filterArg || "MSSP", "i");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    console.error("Usage: import:catalog -- <file.xlsx> [--dry] [--tag=mssp] [--filter=MSSP]");
    process.exit(1);
  }
  if (!existsSync(path)) {
    console.error(`Workbook not found: ${path}`);
    process.exit(1);
  }

  if (dry) {
    const items = parseGlobalCatalog(path, filter);
    console.table(
      items.map((i) => ({
        part: i.partNumber, model: i.model, category: i.category,
        price: i.listPrice ?? "PER PANW QUOTE", unit: i.priceUnit, disc: i.discountCategory,
      }))
    );
    console.log(`\n${items.length} SKUs matched /${filter.source}/i (dry run — nothing written).`);
    process.exit(0);
  }

  const items = await importGlobalCatalog(path, tag, filter);
  console.log(`Imported ${items.length} catalog SKUs tagged "${tag}".`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
