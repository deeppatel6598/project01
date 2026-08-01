/**
 * `npm run seed` — create the Roast & Toast pilot data.
 *
 * Prints the table codes, because those are what has to be turned into QR
 * stickers before anyone can order anything. The full print sheet lives at
 * /admin/tables/print.
 */

import { getDb } from "../src/lib/db";
import { seed } from "../src/lib/seed";

const force = process.argv.includes("--force");

const ownerEmail = process.env.TABLEKIT_OWNER_EMAIL ?? "owner@roastandtoast.test";
const ownerPassword = process.env.TABLEKIT_OWNER_PASSWORD ?? "roast-and-toast";

const result = seed({ force, ownerEmail, ownerPassword }, getDb());

if (result.skipped) {
  console.log("Database already seeded — nothing to do.");
  console.log("Re-seed from scratch with: npm run seed:reset  (this deletes order history)\n");
} else {
  console.log(`Seeded ${result.itemCount} menu items across ${result.tables.length} tables.\n`);

  if (result.ownerEmail) {
    console.log("Owner login");
    console.log(`  email     ${result.ownerEmail}`);
    console.log(`  password  ${ownerPassword}`);
    console.log("  Change this before the cafe goes live.\n");
  }
}

console.log("Table codes");
for (const table of result.tables) {
  console.log(`  ${table.label.padEnd(12)} /t/${table.code}`);
}

console.log("\nPrint the stickers from /admin/tables/print once the server is running.");
