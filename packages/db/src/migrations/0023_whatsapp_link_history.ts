import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureIndex, type Migration } from "../migrate";

export const migration0023: Migration = {
  tag: "0023_whatsapp_link_history",
  why: `Every change to the partners' WhatsApp group link is kept with who made it,
when and why, newest first on the console's Group link page.`,

  async up(db: Db): Promise<void> {
    await ensureIndex(db, COLLECTIONS.whatsappLinkHistory, { at: -1, _id: -1 }, { name: "whatsapp_link_history_recent" });
  },
};
