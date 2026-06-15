import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { parseWorkbook, importPricelist } from "../src/services/importPricelist.js";
import { pool } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT = join(__dirname, "..", "db", "PANW_Pricelist.xlsx");

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const path = args.find((a) => !a.startsWith("--")) || DEFAULT;

  if (!existsSync(path)) {
    console.error(`Pricelist not found: ${path}`);
    process.exit(1);
  }

  if (dry) {
    const parsed = parseWorkbook(path);
    console.log(`Currency: ${parsed.currency} · XDR $${parsed.xdr.listPerUser}/user`);
    console.table(
      parsed.products.map((p) => ({
        model: p.model, series: p.series, maxUsers: p.maxUsers,
        price: p.listPrice, unit: p.priceUnit,
      }))
    );
    process.exit(0);
  }

  const parsed = await importPricelist(path);
  console.log(`Imported ${parsed.products.length} products + Cortex XDR ($${parsed.xdr.listPerUser}/user).`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
