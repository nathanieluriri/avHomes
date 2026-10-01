import type { Db, Document } from "mongodb";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const STR = { bsonType: "string" };
const TS = { bsonType: ["long", "int", "double"] };
const INT = { bsonType: ["long", "int", "double"] };
const TS_OR_NULL = { bsonType: ["long", "int", "double", "null"] };

export function pushDevicesValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "app", "endpoint", "keys", "createdAt", "updatedAt"],
      properties: {
        _id: STR,
        userId: STR,
        app: { enum: ["m", "admin"] },
        endpoint: STR,
        keys: {
          bsonType: "object",
          required: ["p256dh", "auth"],
          properties: { p256dh: STR, auth: STR },
        },
        label: STR,
        failures: INT,
        lastOkAt: TS_OR_NULL,
        lastFailAt: TS_OR_NULL,
        createdAt: TS,
        updatedAt: TS,
      },
    },
  };
}

export function pushLogValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "userId", "app", "kind", "title", "outcome", "createdAt", "expiresAtDate"],
      properties: {
        _id: STR,
        userId: STR,
        app: { enum: ["m", "admin"] },
        kind: STR,
        title: STR,
        body: STR,
        url: STR,
        outcome: { enum: ["delivered", "partial", "failed", "no-device"] },
        devices: INT,
        delivered: INT,
        failed: INT,
        gone: INT,
        errors: { bsonType: "array", items: STR },
        openedAt: TS_OR_NULL,
        createdAt: TS,
        expiresAtDate: { bsonType: "date" },
      },
    },
  };
}

export function mailFailuresValidator(): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "to", "subject", "reason", "at", "expiresAtDate"],
      properties: {
        _id: STR,
        to: STR,
        subject: STR,
        reason: STR,
        at: TS,
        expiresAtDate: { bsonType: "date" },
      },
    },
  };
}

export const migration0020: Migration = {
  tag: "0020_push_and_unsent_mail",
  why: `Push notifications for the partner app and the console, and a record of
every email the site could not send.

\`push_devices\` is one row per browser that turned notifications on, keyed by a
hash of its push endpoint, so the same browser subscribing again updates its
row rather than adding one, and a second person signing in on it takes it over.
Indexed by person and app, which is how every send finds its targets.

\`push_log\` is one row per notification per person: what was sent, to how many
devices, how many took it, and when it was opened. It answers "did they get
it?" without guessing, and \`no-device\` rows are the people nothing reached.
Kept for 180 days through \`expiresAtDate\`, the same per-row TTL idiom 0008
uses, because a notification log has no use after the thing it announced.

\`mail_failures\` is one row per email the provider refused or never took:
recipient, subject and reason, never the body, because half of what the site
sends is a sign-in code. Kept for 90 days the same way.

All three are written by code that works without this migration, because
MongoDB creates a collection on first insert. This adds the validators, the
lookup indexes and the two TTLs.`,

  async up(db: Db) {
    await ensureCollection(db, COLLECTIONS.pushDevices, pushDevicesValidator());
    await ensureIndex(db, COLLECTIONS.pushDevices, { userId: 1, app: 1 }, { name: "push_devices_user" });

    await ensureCollection(db, COLLECTIONS.pushLog, pushLogValidator());
    await ensureIndex(db, COLLECTIONS.pushLog, { userId: 1, createdAt: -1 }, { name: "push_log_user" });
    await ensureIndex(db, COLLECTIONS.pushLog, { kind: 1, createdAt: -1 }, { name: "push_log_kind" });
    await ensureIndex(
      db,
      COLLECTIONS.pushLog,
      { expiresAtDate: 1 },
      { name: "push_log_ttl", expireAfterSeconds: 0 },
    );

    await ensureCollection(db, COLLECTIONS.mailFailures, mailFailuresValidator());
    await ensureIndex(db, COLLECTIONS.mailFailures, { at: -1 }, { name: "mail_failures_recent" });
    await ensureIndex(
      db,
      COLLECTIONS.mailFailures,
      { expiresAtDate: 1 },
      { name: "mail_failures_ttl", expireAfterSeconds: 0 },
    );
    console.log("push_devices, push_log and mail_failures are ready.");
  },
};
