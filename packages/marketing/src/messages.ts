import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import { newId } from "@avhomes/core";
import type { MarketerMessage } from "@avhomes/contracts";

interface MessageDoc {
  _id: string;
  marketerId: string;
  subject: string;
  body: string;
  sentById: string;
  sentByName: string;
  delivered: boolean;
  createdAt: number;
}

function messages(db: Db) {
  return collection<MessageDoc>(db, COLLECTIONS.marketerMessages);
}

function toMessage(doc: MessageDoc): MarketerMessage {
  return {
    id: doc._id,
    marketerId: doc.marketerId,
    subject: doc.subject,
    body: doc.body,
    sentByName: doc.sentByName,
    delivered: doc.delivered,
    createdAt: doc.createdAt,
  };
}

export async function recordMessage(
  db: Db,
  input: { marketerId: string; subject: string; body: string; sentById: string; sentByName: string; delivered: boolean },
): Promise<MarketerMessage> {
  const now = Date.now();
  const doc: MessageDoc = { _id: newId("mmsg", now), ...input, createdAt: now };
  await messages(db).insertOne(doc);
  return toMessage(doc);
}

export async function listMessages(db: Db, marketerId: string, limit: number): Promise<MarketerMessage[]> {
  const docs = await messages(db).find({ marketerId }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return docs.map(toMessage);
}
