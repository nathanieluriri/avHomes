/**
 * @avhomes/db
 *
 * The driver, the collection names, and the migration machinery. It reads no
 * environment of its own: `DbConfig` arrives from the composition root, which is
 * what keeps this package usable from a CLI script and a request handler without
 * either of them agreeing on a variable name.
 */
export { getClient, getDb, closeDb, type Db, type DbConfig } from "./client";
export { COLLECTIONS, collection, type CollectionName, type BaseDoc, type VersionedDoc } from "./collections";
export {
  runMigrations,
  ensureCollection,
  ensureIndex,
  describeSchema,
  type Migration,
  type MigrationResult,
} from "./migrate";
export { MIGRATIONS } from "./migrations";
