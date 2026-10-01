import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  clientIp,
  currentDb,
  email,
  newId,
  readJson,
  slugString,
  requestOrigin,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import { welcomeEmail } from "./admin";

export {
  audienceAdminRoutes,
  newsletterArticle,
  recentNewsFor,
  unsubscribe,
  unsubscribeLink,
  unsubscribePublicRoutes,
  unsubscribedAmong,
} from "./admin";
import { SUBSCRIBE_IP_LIMIT, SUBSCRIBE_WINDOW_MS, limit } from "@avhomes/identity";

/**
 * @avhomes/audience
 *
 * The reading list: one public write, and nothing else yet.
 *
 * A package rather than more code inside @avhomes/api for the same reason
 * @avhomes/analytics is one. It is a self-contained feature with a public write,
 * and it knows about no other feature package: a post slug arrives as a string
 * and is stored as a string, never looked up, so subscribing works on a post
 * that is later renamed or deleted.
 */

interface SubscriberDoc {
  _id: string;
  /** Lowercased and trimmed by `email()`. A unique index enforces one row. */
  email: string;
  /** The post slug they said yes on, or null for the footer form. */
  source: string | null;
  createdAt: number;
  updatedAt: number;
  /** Null until a double opt-in exists. See migration 0004. */
  confirmedAt: number | null;
  /**
   * ABSENT means subscribed; a timestamp means they left. The row survives
   * either way, so a re-import cannot quietly sign a leaver back up.
   *
   * Optional because the re-subscribe path `$unset`s it rather than writing
   * null, and `$setOnInsert` cannot also name a field `$unset` touches. Query
   * it as `{ unsubscribedAt: null }`, never `$exists`: that filter matches both
   * a missing field and an explicit null, so it stays correct if a row ever
   * gains one.
   */
  unsubscribedAt?: number | null;
}

function subscribers(db: Db) {
  return collection<SubscriberDoc>(db, COLLECTIONS.subscribers);
}

const SubscribeBody = z
  .object({
    email: email(),
    /**
     * The post they were reading. A SLUG, not a URL: a URL carries a host that
     * differs per deployment, and the question an operator asks of this column
     * is which writing earns subscribers.
     */
    source: slugString().max(160).optional(),
    /**
     * The honeypot, same name and same contract as the enquiry form's. A real
     * browser leaves it empty because it is hidden; a form filler fills every
     * field it can see in the markup.
     */
    website: str().max(200).optional(),
  })
  .strict();

/** Mongo's duplicate key, which the upsert below can still race into. */
function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Puts an address on the list and welcomes it, once.
 *
 * AN UPSERT, NOT A READ THEN A WRITE, and the unique index is what makes it
 * correct. Two tabs pressing Subscribe together both find nothing on a read
 * and both insert, and the reader is then on the list twice: they receive
 * every message twice, and the second copy is what earns a spam report.
 *
 * `$setOnInsert` carries everything that describes the FIRST yes, so a second
 * submission of the same address cannot rewrite when they joined or relabel
 * which post brought them in.
 *
 * `resubscribe` is for somebody typing their own address into the form: their
 * returning yes beats an earlier no. A subscription made on somebody's behalf,
 * such as a marketer signing up, passes false, so it never undoes an opt-out.
 */
export async function subscribeAddress(
  db: Db,
  mailer: Mailer | undefined,
  input: { email: string; source: string | null; origin: string; resubscribe: boolean },
  ctx: { requestId: string; route: string },
): Promise<void> {
  const now = Date.now();
  try {
    const res = await subscribers(db).updateOne(
      { email: input.email },
      {
        $setOnInsert: {
          _id: newId("sub", now),
          email: input.email,
          source: input.source,
          createdAt: now,
          confirmedAt: null,
        },
        $set: { updatedAt: now },
        ...(input.resubscribe ? { $unset: { unsubscribedAt: "" } } : {}),
      },
      { upsert: true },
    );
    // Welcomed once, on the first yes; a repeat sends nothing.
    if (res.upsertedCount > 0 && res.upsertedId && mailer) {
      const message = await welcomeEmail(db, input.origin, { _id: String(res.upsertedId), email: input.email });
      await trySend(mailer, message, ctx);
    }
  } catch (error) {
    /*
     * Two upserts for one unseen address race, both miss, and the loser hits
     * the unique index. The list is exactly right either way.
     */
    if (!isDuplicateKey(error)) throw error;
  }
}

/**
 * The subscribe intake.
 *
 * A public MUTATION, so it is mounted BELOW the origin guard and deliberately
 * NOT in the cacheable `/public/*` router, for the same reason the enquiry
 * intake is not: that router's safety property is that a shared cache may store
 * its responses, and a response to a write must never be stored.
 */
export function audiencePublicRoutes(deps: { mailer?: Mailer } = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/public/subscribe", async (c) => {
    // Parsed before the limiter, like every other public write here: a schema
    // check is free, the limiter is a database write, and every well-formed
    // request below is still counted.
    const body = await readJson(c, SubscribeBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    await limit(db, `subscribe:${ip}`, SUBSCRIBE_IP_LIMIT, SUBSCRIBE_WINDOW_MS);

    if (body.website !== undefined && body.website.trim() !== "") {
      // Answers exactly like a success, and stores nothing.
      return c.json({ ok: true }, 201);
    }

    await subscribeAddress(db, deps.mailer, {
      email: body.email,
      source: body.source ?? null,
      origin: requestOrigin(c.req),
      resubscribe: true,
    }, { requestId: c.get("requestId"), route: "POST /public/subscribe" });

    /*
     * The SAME answer whether the address was new or already on the list.
     *
     * Telling a caller "already subscribed" turns this endpoint into an oracle
     * that reports whether a given address reads this blog, to anyone who asks.
     * The reader loses nothing: they typed their address and they are on the
     * list, which is what the message says.
     */
    return c.json({ ok: true }, 201);
  });

  return routes;
}
