import type { Db } from "mongodb";
import { COLLECTIONS } from "./collections";
import { ensureCollection } from "./migrate";
import { propertiesValidator } from "./migrations/0015_analytics_and_funds";

const DOCUMENT_VALIDATION_FAILURE = 121;

/**
 * Runs a properties write, and when the stored validator refuses it, re-applies
 * the validator from the current contracts and tries once more.
 *
 * A validator freezes the enums it was built from, so a property type added in
 * code is refused until somebody runs the migration. This closes that gap on the
 * first save. If the app's user may not run collMod, the original refusal stands.
 */
export async function withFreshPropertiesValidator<T>(db: Db, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if ((err as { code?: number }).code !== DOCUMENT_VALIDATION_FAILURE) throw err;
    try {
      await ensureCollection(db, COLLECTIONS.properties, propertiesValidator());
    } catch {
      throw err;
    }
    return write();
  }
}
