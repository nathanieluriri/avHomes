import type { Migration } from "../migrate";
import { migration0001 } from "./0001_init";
import { migration0002 } from "./0002_visits";
import { migration0003 } from "./0003_visits_views_index";
import { migration0004 } from "./0004_subscribers";
import { migration0005 } from "./0005_enquiry_threads";
import { migration0006 } from "./0006_design_notes";

/**
 * The ordered list. Append only, and never renumber a tag that has shipped:
 * the ledger keys on the string, so a rename re-runs a migration that already
 * applied.
 *
 * Read the folder, not this file, for the next number. A list in a document
 * goes stale; `ls packages/db/src/migrations` cannot.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
];
