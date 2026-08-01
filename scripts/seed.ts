/**
 * `npm run seed` — create the Roast & Toast pilot data.
 *
 * Prints the table codes, because those are what has to be turned into QR
 * stickers before anyone can order anything. The full print sheet lives at
 * /admin/tables/print.
 *
 * Safe to run against a live database: both the schema creation and the seed
 * are idempotent, and an existing restaurant row makes the seed a no-op rather
 * than a duplicate menu or a fresh set of table codes that would invalidate
 * every sticker already on a table.
 */

import { getDb, migrate } from "../src/lib/db";
import { seed } from "../src/lib/seed";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  const ownerEmail = process.env.TABLEKIT_OWNER_EMAIL ?? "owner@roastandtoast.test";
  const ownerPassword = process.env.TABLEKIT_OWNER_PASSWORD ?? "roast-and-toast";

  const sql = getDb();

  try {
    // `TABLEKIT_APPLY_RLS=1` also turns on Row Level Security, which is only
    // meaningful on a Supabase-hosted database — see docs/SECURITY.md.
    await migrate(sql, process.env.TABLEKIT_APPLY_RLS === "1");
    const result = await seed({ force, ownerEmail, ownerPassword }, sql);

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
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
