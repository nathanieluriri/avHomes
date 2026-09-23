import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  DEFAULT_PARTNER_LIMITS,
  effectiveLimits,
  type Partner,
  type PartnerLimits,
  type PartnerSettings,
} from "@avhomes/contracts";
import { findPartner } from "./partners";

/** One row in the shared settings collection, like marketing's, read with defaults. */
const DOC_ID = "partners";

interface SettingsDoc {
  _id: string;
  limits?: Partial<PartnerLimits>;
  updatedAt?: number;
}

function rows(db: Db) {
  return collection<SettingsDoc>(db, COLLECTIONS.settings);
}

export async function readPartnerSettings(db: Db): Promise<PartnerSettings> {
  const doc = await rows(db).findOne({ _id: DOC_ID });
  const d = DEFAULT_PARTNER_LIMITS;
  return {
    limits: {
      review: doc?.limits?.review ?? d.review,
      live: doc?.limits?.live ?? d.live,
      staff: doc?.limits?.staff ?? d.staff,
    },
    updatedAt: doc?.updatedAt ?? 0,
  };
}

export async function writePartnerSettings(db: Db, limits: PartnerLimits): Promise<PartnerSettings> {
  await rows(db).updateOne(
    { _id: DOC_ID },
    { $set: { limits: { review: limits.review, live: limits.live, staff: limits.staff }, updatedAt: Date.now() } },
    { upsert: true },
  );
  return readPartnerSettings(db);
}

/** A company and the limits that actually bind it. */
export async function limitsForPartner(
  db: Db,
  partnerId: string,
): Promise<{ partner: Partner; limits: PartnerLimits; defaults: PartnerLimits } | null> {
  const [partner, settings] = await Promise.all([findPartner(db, partnerId), readPartnerSettings(db)]);
  if (!partner) return null;
  return { partner, limits: effectiveLimits(partner.limits, settings.limits), defaults: settings.limits };
}
