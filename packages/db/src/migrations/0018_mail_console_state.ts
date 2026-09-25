import type { Db, Document } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const STR = { bsonType: "string" };
const TS = { bsonType: ["long", "int", "double"] };
const INT = { bsonType: ["long", "int", "double"] };
const STR_LIST = { bsonType: "array", items: STR };
const REF = {
  bsonType: ["object", "null"],
  required: ["uid", "folder"],
  properties: { uid: INT, folder: STR },
};

/*
 * Validators as functions, for the reason 0016 gives: a later migration that
 * adds a field re-applies the same shape rather than copying an inline one.
 * The routes cap sizes; these only pin types and the fields every read needs.
 */

export function mailPrefsValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "createdAt", "updatedAt"],
      properties: {
        _id: STR,
        view: { bsonType: ["object", "null"] },
        density: { enum: ["comfortable", "compact"] },
        recentTo: STR_LIST,
        createdAt: TS,
        updatedAt: TS,
      },
    },
  };
}

export function mailDraftsValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "mailbox", "revision", "createdAt", "updatedAt"],
      properties: {
        _id: STR,
        userId: STR,
        mailbox: STR,
        to: STR_LIST,
        cc: STR_LIST,
        bcc: STR_LIST,
        subject: STR,
        text: STR,
        html: STR,
        mode: { enum: ["text", "html"] },
        inReplyTo: REF,
        forwardOf: REF,
        revision: INT,
        createdAt: TS,
        updatedAt: TS,
      },
    },
  };
}

export function mailContactsValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "contacts", "harvestedAt"],
      properties: {
        _id: STR,
        address: STR,
        contacts: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["address", "count", "lastAt"],
            properties: { name: STR, address: STR, count: INT, lastAt: TS },
          },
        },
        highWater: { bsonType: "object" },
        harvestedAt: TS,
      },
    },
  };
}

export const migration0018: Migration = {
  tag: "0018_mail_console_state",
  why: `The Mailboxes page remembers where each member left it, on the server, so
a refresh or another device opens the same mailbox, folder, search, filters,
page and message, with the same compose windows open.

\`mail_prefs\` is one row per member, keyed by user id: the view, the list
density, and the addresses last used in the Sent to filter.

\`mail_drafts\` holds unsent messages, one row per draft, keyed by an id the
browser mints so a draft has one before its first save. Each carries a
revision, and a save names the revision it was based on, so two devices
editing one draft cannot overwrite each other unseen. Indexed by member and
last edit, which is the only read.

\`mail_contacts\` is one row per Hostinger mailbox: the people it has written to
and heard from, harvested from Inbox and Sent, because Hostinger has no
contacts API and reading hundreds of messages on every keystroke is not an
option. It is a cache: dropping it costs one harvest, nothing else.

All three are written by code that already works without this migration,
because MongoDB creates a collection on first insert. This adds the
validators and the draft index.`,

  async up(db: Db) {
    await ensureCollection(db, COLLECTIONS.mailPrefs, mailPrefsValidator());
    await ensureCollection(db, COLLECTIONS.mailDrafts, mailDraftsValidator());
    await ensureIndex(db, COLLECTIONS.mailDrafts, { userId: 1, updatedAt: -1 }, { name: "mail_drafts_user" });
    await ensureCollection(db, COLLECTIONS.mailContacts, mailContactsValidator());
    console.log("mail_prefs, mail_drafts and mail_contacts are ready.");
  },
};
