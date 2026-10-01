import { createECDH } from "node:crypto";
import webpush from "web-push";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { BadRequestError, openSecret, sealSecret } from "@avhomes/core";
import type { PushKeysView } from "@avhomes/contracts";

/**
 * The VAPID key pair every push is signed with.
 *
 * Kept in the settings collection, the private half sealed at rest like the
 * Hostinger key, and shown in full to the owner and developers under Settings,
 * where a pair can be pasted in or made fresh. With nothing pasted the server
 * makes one the first time it is needed, so a new deployment has nothing to set.
 *
 * Changing the pair ends every existing subscription, because each browser
 * subscribed against the old public key. The rows are dropped, and each browser
 * subscribes again the next time it opens the app: the client compares its
 * subscription's key with this one.
 */

const DOC_ID = "push";
/** Long enough to spare a read per send, short enough that a pair changed on another instance lands soon. */
const TTL_MS = 5 * 60 * 1000;

interface PushKeysDoc {
  _id: string;
  publicKey: string;
  /** `sealSecret` output. Never the plain key. */
  privateKey: string;
  source: "generated" | "pasted";
  createdAt: number;
  updatedAt: number;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: { at: number; value: Promise<VapidKeys> } | null = null;

function rows(db: Db) {
  return collection<PushKeysDoc>(db, COLLECTIONS.settings);
}

export function forgetVapidKeys(): void {
  cached = null;
}

async function load(db: Db): Promise<VapidKeys> {
  const doc = await rows(db).findOne({ _id: DOC_ID });
  const plain = doc ? openSecret(doc.privateKey) : null;
  if (doc && plain) return { publicKey: doc.publicKey, privateKey: plain };

  const made = webpush.generateVAPIDKeys();
  const now = Date.now();
  const sealed = sealSecret(made.privateKey);
  if (doc) {
    // Only replaces the pair this instance found unreadable, so two instances
    // racing here keep whichever wrote first.
    const swapped = await rows(db).updateOne(
      { _id: DOC_ID, privateKey: doc.privateKey },
      { $set: { publicKey: made.publicKey, privateKey: sealed, source: "generated", updatedAt: now } },
    );
    if (swapped.modifiedCount === 1) return made;
  } else {
    try {
      await rows(db).insertOne({
        _id: DOC_ID,
        publicKey: made.publicKey,
        privateKey: sealed,
        source: "generated",
        createdAt: now,
        updatedAt: now,
      });
      return made;
    } catch {
      // Another instance made one first. Use theirs.
    }
  }
  const winner = await rows(db).findOne({ _id: DOC_ID });
  const opened = winner ? openSecret(winner.privateKey) : null;
  if (!winner || !opened) throw new Error("push keys could not be read back");
  return { publicKey: winner.publicKey, privateKey: opened };
}

export function vapidKeys(db: Db): Promise<VapidKeys> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const value = load(db).catch((err: unknown) => {
    // A failed read is not cached, so the next send tries again.
    cached = null;
    throw err;
  });
  cached = { at: now, value };
  return value;
}

/** The pair in full, for the Settings card. Makes one first if there is none. */
export async function readVapidKeys(db: Db): Promise<PushKeysView> {
  const keys = await vapidKeys(db);
  const doc = await rows(db).findOne({ _id: DOC_ID });
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    source: doc?.source ?? "generated",
    createdAt: doc?.createdAt ?? 0,
    updatedAt: doc?.updatedAt ?? 0,
  };
}

function bytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) return null;
  return Buffer.from(value.replace(/=+$/u, ""), "base64url");
}

/**
 * Checks a pasted pair before it replaces the one in use: the right lengths,
 * and a private key that actually produces the public key beside it. A pair
 * that does not match would sign every push with a key no browser trusts.
 */
export function assertVapidPair(publicKey: string, privateKey: string): void {
  const pub = bytes(publicKey);
  const priv = bytes(privateKey);
  if (!pub || pub.length !== 65 || pub[0] !== 4) {
    throw new BadRequestError("The public key should be 87 characters of URL-safe base64, as web-push prints it.");
  }
  if (!priv || priv.length !== 32) {
    throw new BadRequestError("The private key should be 43 characters of URL-safe base64, as web-push prints it.");
  }
  let derived: Buffer;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    derived = ecdh.getPublicKey();
  } catch {
    throw new BadRequestError("That private key is not a valid P-256 key.");
  }
  if (!derived.equals(pub)) throw new BadRequestError("Those two keys are not a pair. Paste both halves of the same pair.");
}

/** Replaces the pair. The caller drops every subscription made against the old one. */
export async function writeVapidKeys(db: Db, pair: VapidKeys | null): Promise<void> {
  const next = pair ?? webpush.generateVAPIDKeys();
  if (pair) assertVapidPair(pair.publicKey, pair.privateKey);
  const now = Date.now();
  await rows(db).updateOne(
    { _id: DOC_ID },
    {
      $set: {
        publicKey: next.publicKey,
        privateKey: sealSecret(next.privateKey),
        source: pair ? "pasted" : "generated",
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  forgetVapidKeys();
}

/**
 * Who push services contact about our traffic. Apple refuses a localhost one,
 * so a machine off Vercel names the live site.
 */
export function vapidSubject(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `https://${production || "www.avhomesltd.com"}`;
}
