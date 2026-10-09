import type { Db } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureIndex, type Migration } from "../migrate";

export const migration0022: Migration = {
  tag: "0022_whatsapp_clicks",
  why: `Each open of a partner's /wa/<code> link to the WhatsApp group is one row,
credited to the partner whose link it was. The indexes serve the redirect's own
checks (has this browser opened this link before) and the console's report.`,

  async up(db: Db): Promise<void> {
    await ensureIndex(
      db,
      COLLECTIONS.whatsappClicks,
      { ownerId: 1, visitor: 1, at: -1 },
      { name: "whatsapp_clicks_owner_visitor" },
    );
    await ensureIndex(db, COLLECTIONS.whatsappClicks, { ownerId: 1, kind: 1 }, { name: "whatsapp_clicks_owner_kind" });
    await ensureIndex(db, COLLECTIONS.whatsappClicks, { at: -1 }, { name: "whatsapp_clicks_recent" });
  },
};
