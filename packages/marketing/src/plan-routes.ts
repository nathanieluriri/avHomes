import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "mongodb";
import {
  UnauthenticatedError,
  auditEntityId,
  currentDb,
  currentUser,
  pathParam,
  readJson,
  deploymentOrigin,
  requestOrigin,
  str,
  type AppEnv,
} from "@avhomes/core";
import { formatMoney, type Deal } from "@avhomes/contracts";
import { requireAuth } from "@avhomes/identity";
import {
  claimDueReminders,
  logPayment,
  plansNeedingAttention,
  purchasesFor,
  rejectPayment,
  verifyPayment,
  type Verified,
} from "./plans";
import { findMarketerById } from "./repo";
import { tellPaymentVerified, tellPurchase, tellUplineShares } from "./purchase-notes";
import { assertActive, currentMarketer, dealView, noAccrual, type MarketingDeps } from "./routes";

const PaymentBody = z
  .object({
    amountMinor: z.number().int().min(1),
    paidOn: z.number().int().min(0).default(0),
    proof: z.array(str().max(600)).min(1).max(5),
    note: str().max(400).default(""),
  })
  .strict();

function firstOf(name: string): string {
  return name.trim().split(/\s+/u)[0] || name;
}

/**
 * One message per person per verified payment. A partner buying for themselves
 * hears about their purchase; anyone else on the deal hears what it earned them.
 */
async function afterVerified(
  deps: MarketingDeps,
  db: Db,
  verified: Verified,
  ctx: { origin: string; requestId: string },
): Promise<void> {
  const { deal, payment } = verified;
  if (deal.selfPurchase) {
    await tellPurchase(deps, db, {
      marketerId: deal.reporterId,
      property: deal.listingTitle,
      step: verified.complete ? "owner" : "instalment-verified",
      ...ctx,
    });
  } else {
    const earned = payment.shares.find((s) => s.marketerId === deal.reporterId)?.amountMinor ?? 0;
    await tellPaymentVerified(deps, db, { deal, amountMinor: payment.amountMinor, earnedMinor: earned, ...ctx });
  }
  await tellUplineShares(deps, db, { deal, shares: payment.shares });
}

export function planAppRoutes(deps: MarketingDeps = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** A payment the buyer made on a plan, waiting for AV Homes to verify it. */
  routes.post("/marketing/deals/:id/payments", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    assertActive(marketer);
    const id = pathParam(c, "id");
    const body = await readJson(c, PaymentBody);
    const { deal, payment } = await logPayment(
      db,
      id,
      body,
      { side: "marketer", name: marketer.displayName, marketerId: marketer.id },
      deps.accrue ?? noAccrual,
    );
    auditEntityId(c, id);
    if (deps.notify) {
      await deps.notify(db, {
        kind: "marketing-deal",
        title: `${marketer.displayName} logged a payment`,
        body: `${formatMoney(payment.amountMinor, deal.currency)} on ${deal.listingTitle}. Check the proof and verify it.`,
        href: `/admin/marketers/deals/${deal.id}`,
        actorId: marketer.userId,
        actorName: marketer.displayName,
      });
    }
    if (deal.selfPurchase) {
      await tellPurchase(deps, db, {
        marketerId: marketer.id,
        property: deal.listingTitle,
        step: "payment-received",
        origin: requestOrigin(c.req),
        requestId: c.get("requestId"),
      });
    }
    return c.json({ ...dealView(deal, marketer.id), payment }, 201);
  });

  /** What this partner is buying for themselves. */
  routes.get("/marketing/purchases", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const marketer = await currentMarketer(db, c);
    return c.json(await purchasesFor(db, marketer.id));
  });

  return routes;
}

export function planAdminRoutes(deps: MarketingDeps = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const accrue = deps.accrue ?? noAccrual;

  /** Plans still being paid, overdue first. */
  routes.get("/admin/marketing/plans", requireAuth(), async (c) => {
    const db = await currentDb(c);
    return c.json({ items: await plansNeedingAttention(db, Date.now()) });
  });

  /** A payment logged from the console is verified as it is logged. */
  routes.post("/admin/marketing/deals/:id/payments", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, PaymentBody);
    const result = await logPayment(db, id, body, { side: "admin", name: user.displayName }, accrue);
    auditEntityId(c, id);
    if (result.verified) {
      await afterVerified(deps, db, result.verified, { origin: requestOrigin(c.req), requestId: c.get("requestId") });
    }
    return c.json({ deal: result.deal, payment: result.payment }, 201);
  });

  routes.post("/admin/marketing/deals/:id/payments/:paymentId/verify", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const paymentId = pathParam(c, "paymentId");
    const body = await readJson(c, z.object({ amountMinor: z.number().int().min(1).optional() }).strict());
    const verified = await verifyPayment(db, id, paymentId, { name: user.displayName }, accrue, body.amountMinor);
    auditEntityId(c, id);
    await afterVerified(deps, db, verified, { origin: requestOrigin(c.req), requestId: c.get("requestId") });
    return c.json({ deal: verified.deal, payment: verified.payment });
  });

  routes.post("/admin/marketing/deals/:id/payments/:paymentId/reject", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const user = currentUser(c);
    const id = pathParam(c, "id");
    const paymentId = pathParam(c, "paymentId");
    const body = await readJson(c, z.object({ reason: str().trim().min(1).max(400) }).strict());
    const result = await rejectPayment(db, id, paymentId, body.reason, { name: user.displayName });
    auditEntityId(c, id);
    if (deps.tell) {
      const marketer = await findMarketerById(db, result.deal.reporterId);
      if (marketer) {
        await deps.tell(db, [marketer.userId], {
          kind: "plan-payment",
          title: `A payment on ${result.deal.listingTitle} was not accepted`,
          body: body.reason,
          url: `/m/deals/${result.deal.id}`,
          tag: `deal-${result.deal.id}`,
        });
      }
    }
    return c.json(result);
  });

  return routes;
}

function reminderLine(deal: Deal, late: boolean): string {
  return late
    ? `A payment on ${deal.listingTitle} is overdue and has not been logged.`
    : `A payment on ${deal.listingTitle} is due soon.`;
}

/**
 * The daily reminder run, called by the platform's cron with the CRON_SECRET bearer.
 * Each reminder stage is claimed once per instalment, so a repeated call sends nothing twice.
 */
export function planCronRoutes(deps: MarketingDeps = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/cron/plan-reminders", async (c) => {
    const secret = process.env.CRON_SECRET ?? "";
    const given = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/iu, "");
    if (secret === "" || given !== secret) throw new UnauthenticatedError("cron secret");

    const db = await currentDb(c);
    const now = Date.now();
    const due = await claimDueReminders(db, now);
    // A scheduled call has no visitor to follow: links go to the production host, which /admin links must anyway.
    const origin = deploymentOrigin(c.req);
    const ctx = { requestId: c.get("requestId"), route: "plan reminders" };
    const office = deps.officeEmail ? await deps.officeEmail(db) : "";

    for (const { deal, standing, late } of due) {
      const next = standing.next;
      const amount = formatMoney(standing.nextLeftMinor, deal.currency);
      const dueDate =
        next && next.dueOn > 0
          ? new Date(next.dueOn).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric" })
          : "";
      const message = reminderLine(deal, late);
      const marketer = await findMarketerById(db, deal.reporterId);
      const text = {
        property: deal.listingTitle,
        buyer: deal.buyerName || "the buyer",
        amount,
        dueDate,
        message,
        dealLink: `${origin}/m/deals/${deal.id}`,
      };
      if (marketer) {
        if (deps.tell) {
          await deps.tell(
            db,
            [marketer.userId],
            {
              kind: "plan-reminder",
              title: late ? "Payment overdue" : "Payment due soon",
              body: `${amount} on ${deal.listingTitle}, due ${dueDate}.`,
              url: `/m/deals/${deal.id}`,
              tag: `plan-${deal.id}`,
            },
            { urgency: late ? "high" : "normal" },
          );
        }
        if (deps.mail && marketer.email.trim() !== "") {
          await deps.mail(db, marketer.email, "plan-payment-reminder", { name: firstOf(marketer.displayName), ...text }, ctx);
        }
      }
      if (deps.notify) {
        await deps.notify(db, {
          kind: "marketing-deal",
          title: late ? "A plan payment is overdue" : "A plan payment is due soon",
          body: `${amount} on ${deal.listingTitle}, due ${dueDate}. Reported by ${deal.reporterName}.`,
          href: `/admin/marketers/deals/${deal.id}`,
          actorId: "",
          actorName: "AV Homes",
        });
      }
      if (deps.mail && office) {
        await deps.mail(db, office, "plan-payment-reminder", { name: "team", ...text, dealLink: `${origin}/admin/marketers/deals/${deal.id}` }, ctx);
      }
    }
    return c.json({ ok: true, sent: due.length });
  });

  return routes;
}

