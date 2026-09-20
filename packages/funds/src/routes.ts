import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  clampLimit,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import { requireAdmin, requireAuth } from "@avhomes/identity";
import { FUND_KINDS, type FundKind } from "@avhomes/contracts";
import {
  disburse,
  fundBalances,
  getAward,
  listAwards,
  listFundEntries,
} from "./repo";

/**
 * The two funds' console routes.
 *
 * Reads are `marketing` domain, because what is in a community fund is a money
 * figure and the domain gate already decides who reads those. Writes are
 * `requireAdmin` on top of that: spending a fund and deciding a prize are owner
 * or developer decisions however the domain matrix later evolves.
 *
 * Proposing and settling an award are NOT here. They need the league table,
 * which spans marketing and listings, so they live in `packages/api` beside the
 * other spanning reads. This file holds what needs only the funds themselves.
 */

/** The renameable names, injected because they live in marketing's settings. */
export interface FundNamesPort {
  (db: Awaited<ReturnType<typeof currentDb>>): Promise<Record<FundKind, string>>;
}

function fundParam(value: string): FundKind {
  if (!(FUND_KINDS as readonly string[]).includes(value)) {
    throw new BadRequestError("fund", [
      { path: "fund", message: `expected one of ${FUND_KINDS.join(", ")}` },
    ]);
  }
  return value as FundKind;
}

const DisburseBody = z
  .object({
    amountMinor: z.number().int().positive(),
    /** What it paid for. The only description this row will ever carry. */
    note: str().min(4).max(400),
    proof: z.array(str().max(500)).min(1).max(10),
  })
  .strict();

const EntriesQuery = z
  .object({
    /** Raw, because clampLimit refuses a non-integer with the reason attached. */
    limit: str().max(8).optional(),
    /** Keyset: the `createdAt` of the last row on the previous page. */
    before: z.coerce.number().int().optional(),
  })
  .strict();

export function fundsRoutes(deps: { names: FundNamesPort }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/funds", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const names = await deps.names(db);
    return c.json({ funds: await fundBalances(db, names) });
  });

  routes.get("/admin/funds/:fund/entries", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const query = readQuery(c, EntriesQuery);
    const page = await listFundEntries(db, {
      fund,
      limit: clampLimit(query.limit),
      before: query.before,
    });
    return c.json(page);
  });

  /*
   * Spending. Only the Foundation is meant to be spent from here: the reward
   * pool leaves through an award, which has a winner and a quarter attached. The
   * route still accepts either, because a fund that cannot be corrected is a
   * fund whose first mistake is permanent, and an adjustment with a receipt and
   * a name on it is the correction.
   */
  routes.post("/admin/funds/:fund/disburse", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const body = await readJson(c, DisburseBody);
    const names = await deps.names(db);
    const user = currentUser(c);
    const entry = await disburse(db, {
      fund,
      amountMinor: body.amountMinor,
      currency: (await fundBalances(db, names)).find((f) => f.fund === fund)?.currency ?? "NGN",
      note: body.note,
      proof: body.proof,
      byName: user.displayName,
      names,
    });
    return c.json({ entry }, 201);
  });

  routes.get("/admin/awards", requireAuth(), async (c) => {
    const db = await currentDb(c);
    return c.json({ awards: await listAwards(db, 24) });
  });

  routes.get("/admin/awards/:quarter", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const award = await getAward(db, pathParam(c, "quarter"));
    return c.json({ award });
  });

  return routes;
}
