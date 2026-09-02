/**
 * Applies migrations, then VERIFIES by querying the server.
 *
 * The verification is the point. A runner that reports success because it
 * finished reading a file has told you nothing about the database; reading the
 * indexes and collections back is the only account that cannot be stale.
 *
 * Usage:
 *   MONGODB_URI=... npm run db:migrate
 *   MONGODB_URI=... npm run db:migrate -- --dry
 */
import { closeDb, getDb } from "../client";
import { describeSchema, runMigrations } from "../migrate";
import { MIGRATIONS } from "../migrations";

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Nothing to migrate against.");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "avhomes";
  const dry = process.argv.includes("--dry");

  const db = await getDb({ uri, dbName });
  console.log(`database: ${dbName}`);

  if (dry) {
    const applied = await db
      .collection("migrations")
      .find({}, { projection: { _id: 1 } })
      .toArray();
    const done = new Set(applied.map((r) => String(r._id)));
    for (const m of MIGRATIONS) {
      console.log(`${done.has(m.tag) ? "  applied" : "  PENDING"}  ${m.tag}`);
    }
    await closeDb();
    return;
  }

  const result = await runMigrations(db, MIGRATIONS);
  for (const tag of result.skipped) console.log(`  skipped  ${tag}`);
  for (const tag of result.applied) console.log(`  APPLIED  ${tag}`);

  console.log("\nverifying against the server:");
  const schema = await describeSchema(db);
  for (const [name, info] of Object.entries(schema)) {
    console.log(`  ${name}: ${info.indexes.join(", ")}`);
  }

  await closeDb();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  if (err instanceof Error && err.cause) console.error("caused by:", err.cause);
  await closeDb().catch(() => {});
  process.exit(1);
});
