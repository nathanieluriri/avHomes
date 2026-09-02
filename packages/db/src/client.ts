import { MongoClient, type Db as MongoDb, type MongoClientOptions } from "mongodb";

export type Db = MongoDb;

export interface DbConfig {
  uri: string;
  dbName: string;
}

/**
 * The connection, cached across invocations.
 *
 * Fluid Compute reuses a function instance for many requests, so the client and
 * its pool must outlive one of them. The cache holds the PROMISE, not the
 * resolved client: two concurrent first-requests would otherwise each start a
 * connection and one of the two pools would be orphaned.
 *
 * Never call `close()` inside a request. The next request on the same instance
 * would find a dead pool and pay a full TCP plus TLS handshake to Atlas.
 */
const GLOBAL_KEY = Symbol.for("avhomes.mongo.client");

interface ClientCache {
  uri: string;
  promise: Promise<MongoClient>;
}

const globalCache = globalThis as unknown as { [GLOBAL_KEY]?: ClientCache };

/**
 * Modest pool per instance, on purpose.
 *
 * Every warm Fluid instance holds its own pool, and Atlas caps total
 * connections per cluster (500 on the shared tiers). A generous per-instance
 * pool multiplied by the instance count is how a deployment starts refusing
 * connections under exactly the traffic it was scaled up for.
 */
const OPTIONS: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  // Fail fast rather than holding a request open for the platform's whole budget.
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 20_000,
  retryWrites: true,
  retryReads: true,
  appName: "avhomes",
};

export function getClient(config: DbConfig): Promise<MongoClient> {
  const cached = globalCache[GLOBAL_KEY];
  // A changed URI means a different cluster. Reusing the old pool would silently
  // keep reading the previous database after an environment change.
  if (cached && cached.uri === config.uri) return cached.promise;

  const promise = new MongoClient(config.uri, OPTIONS).connect().catch((err: unknown) => {
    // A failed connect must not poison the cache, or every later request on this
    // instance replays one dead attempt instead of trying again.
    if (globalCache[GLOBAL_KEY]?.promise === promise) delete globalCache[GLOBAL_KEY];
    throw err;
  });

  globalCache[GLOBAL_KEY] = { uri: config.uri, promise };
  return promise;
}

export async function getDb(config: DbConfig): Promise<Db> {
  const client = await getClient(config);
  return client.db(config.dbName);
}

/** Closes the cached client. For CLI scripts only, never inside a request. */
export async function closeDb(): Promise<void> {
  const cached = globalCache[GLOBAL_KEY];
  if (!cached) return;
  delete globalCache[GLOBAL_KEY];
  const client = await cached.promise.catch(() => null);
  await client?.close();
}
