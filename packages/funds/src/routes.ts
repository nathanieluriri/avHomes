import { Hono } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  clampLimit,
  currentDb,
  currentUser,
  auditBefore,
  auditEntityId,
  pathParam,
  readJson,
  readQuery,
  str,
  type AppEnv,
} from "@avhomes/core";
import { requireAuth, requireTreasurer } from "@avhomes/identity";
import { FUND_KINDS, type FundKind } from "@avhomes/contracts";
import {
  disburse,
  fundMonthly,
  getFundEntry,
  listPayments,
  voidPayment,
  fundBalances,
  getAward,
  listAwards,
  listFundEntries,
} from "./repo";

/**
 * The two funds' console routes.
 *
 * Reads are `finance` domain, because what is in a community fund is a money
 * figure and the domain gate already decides who reads those. Writes are
 * `requireTreasurer` on top of that: spending a fund is an owner, developer or
 * accountant job however the domain matrix later evolves.
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

const PaymentBody = z
  .object({
    amountMinor: z.number().int().positive(),
    recipient: str().min(2).max(200),
    /** What it paid for. The only description this row will ever carry. */
    note: str().min(4).max(400),
    reference: str().max(120).default(""),
    paidAt: z.number().int().positive(),
    proof: z.array(str().max(500)).max(10).default([]),
  })
  .strict();

const VoidBody = z.object({ reason: str().min(4).max(400) }).strict();

const MonthlyQuery = z
  .object({ months: z.coerce.number().int().min(1).max(60).default(12) })
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

  routes.get("/admin/funds/:fund/payments", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const query = readQuery(c, EntriesQuery);
    return c.json({ payments: await listPayments(db, { fund, limit: clampLimit(query.limit) }) });
  });

  routes.get("/admin/funds/:fund/monthly", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const query = readQuery(c, MonthlyQuery);
    const names = await deps.names(db);
    return c.json(await fundMonthly(db, { fund, months: query.months, names }));
  });

  /*
   * Recording money that left a fund. Either fund: the reward pool's prize
   * normally leaves through an award, but a prize paid in kind, or a cost the
   * pool covers, still needs a line with a name and a date on it.
   */
  routes.post("/admin/funds/:fund/payments", requireAuth(), requireTreasurer(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const body = await readJson(c, PaymentBody);
    const names = await deps.names(db);
    const user = currentUser(c);
    const entry = await disburse(db, {
      fund,
      amountMinor: body.amountMinor,
      currency: (await fundBalances(db, names)).find((f) => f.fund === fund)?.currency ?? "NGN",
      recipient: body.recipient,
      note: body.note,
      reference: body.reference,
      paidAt: body.paidAt,
      proof: body.proof,
      byName: user.displayName,
      names,
    });
    auditEntityId(c, entry.id);
    return c.json({ entry }, 201);
  });

  routes.post("/admin/funds/:fund/payments/:id/void", requireAuth(), requireTreasurer(), async (c) => {
    const db = await currentDb(c);
    const fund = fundParam(pathParam(c, "fund"));
    const id = pathParam(c, "id");
    const body = await readJson(c, VoidBody);
    const before = await getFundEntry(db, fund, id);
    if (before) auditBefore(c, before as unknown as Record<string, unknown>);
    auditEntityId(c, id);
    const entry = await voidPayment(db, {
      fund,
      id,
      reason: body.reason,
      byName: currentUser(c).displayName,
    });
    return c.json({ entry });
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
