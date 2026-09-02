import type { Document, IndexSpecification, CreateIndexesOptions } from "mongodb";
import type { Db } from "./client";
import { COLLECTIONS } from "./collections";

/**
 * Migrations, hand-written and numbered.
 *
 * MongoDB is schemaless; its indexes and its validators are not. Both are
 * deployment state that has to arrive in a known order, so they get the same
 * discipline a SQL project gives DDL: a numbered file, a ledger row, and a
 * verification pass that QUERIES the result rather than trusting the file.
 */

export interface Migration {
  /** `NNNN_snake_case`. The number is the order; the ledger stores this string. */
  readonly tag: string;
  /** One paragraph on WHY. This header is read far more often than the code. */
  readonly why: string;
  up(db: Db): Promise<void>;
}

interface MigrationRow extends Document {
  _id: string;
  appliedAt: number;
  durationMs: number;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(db: Db, migrations: readonly Migration[]): Promise<MigrationResult> {
  assertUniqueOrderedTags(migrations);

  const ledger = db.collection<MigrationRow>(COLLECTIONS.migrations);
  const already = new Set((await ledger.find({}, { projection: { _id: 1 } }).toArray()).map((r) => r._id));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (already.has(migration.tag)) {
      skipped.push(migration.tag);
      continue;
    }
    const started = Date.now();
    try {
      await migration.up(db);
    } catch (err) {
      // Named loudly: a half-applied migration is the state a runner must never
      // leave silently, and the tag is what the operator needs to resume from.
      throw new Error(
        `migration ${migration.tag} failed after ${Date.now() - started}ms: ${describe(err)}`,
        { cause: err },
      );
    }
    await ledger.insertOne({
      _id: migration.tag,
      appliedAt: Date.now(),
      durationMs: Date.now() - started,
    });
    applied.push(migration.tag);
  }

  return { applied, skipped };
}

/**
 * A duplicated or out-of-order tag means two people numbered independently.
 * Catching it here beats discovering it as a migration that never ran.
 */
function assertUniqueOrderedTags(migrations: readonly Migration[]): void {
  const seen = new Set<string>();
  let previous = "";
  for (const m of migrations) {
    if (seen.has(m.tag)) throw new Error(`duplicate migration tag ${m.tag}`);
    if (m.tag <= previous) {
      throw new Error(`migration ${m.tag} is not ordered after ${previous}`);
    }
    seen.add(m.tag);
    previous = m.tag;
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/* ───────────────────────────── helpers ─────────────────────────────────── */

/**
 * Creates a collection if absent and applies its JSON Schema validator.
 *
 * This is the direct replacement for a SQL `CHECK` constraint, and it earns its
 * place for the same reason: a TypeScript type is compile-time only, so without
 * a validator a bug anywhere in the process could persist `role: "admin"`.
 *
 * `validationLevel: "moderate"` rather than "strict": a later migration that
 * adds a required field would otherwise make every update to a pre-existing
 * document fail until a backfill finished. Moderate validates inserts and any
 * update to a document that already satisfies the schema, which is the property
 * we actually want.
 */
export async function ensureCollection(
  db: Db,
  name: string,
  validator: Document | null,
): Promise<void> {
  const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name, validator ? { validator } : {});
    if (!validator) return;
  }
  if (!validator) return;
  await db.command({
    collMod: name,
    validator,
    validationLevel: "moderate",
    validationAction: "error",
  });
}

export async function ensureIndex(
  db: Db,
  name: string,
  spec: IndexSpecification,
  options: CreateIndexesOptions = {},
): Promise<void> {
  await db.collection(name).createIndex(spec, options);
}

/**
 * Reports what actually exists, for the verification pass.
 *
 * The rule the SQL original states as "verify by querying information_schema,
 * never by trusting the file" translates to this: read the indexes and the
 * validators back off the server after applying.
 */
export async function describeSchema(db: Db): Promise<Record<string, { indexes: string[] }>> {
  const out: Record<string, { indexes: string[] }> = {};
  for (const name of Object.values(COLLECTIONS)) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (exists.length === 0) continue;
    const indexes = await db.collection(name).indexes();
    out[name] = { indexes: indexes.map((i) => i.name ?? "<unnamed>").sort() };
  }
  return out;
}
