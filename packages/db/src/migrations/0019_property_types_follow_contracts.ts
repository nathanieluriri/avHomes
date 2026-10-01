import type { Db } from "mongodb";
import { PROPERTY_TYPES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, type Migration } from "../migrate";
import { propertiesValidator } from "./0015_analytics_and_funds";

export const migration0019: Migration = {
  tag: "0019_property_types_follow_contracts",
  why: `Apartment Building, Shop and Plaza were added to PROPERTY_TYPES, and the
properties validator still held the list 0017 applied, so saving a listing as
any of them was refused with "type: failed enum". This re-applies the validator
from the current list.`,

  async up(db: Db) {
    await ensureCollection(db, COLLECTIONS.properties, propertiesValidator());
    console.log(`properties accept every type: ${PROPERTY_TYPES.join(", ")}.`);
  },
};
