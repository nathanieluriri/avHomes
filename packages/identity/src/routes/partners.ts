import { Hono } from "hono";
import { z } from "zod";
import {
  PARTNER_LIMIT_MAX,
  effectiveLimits,
  limitRefusal,
  type PartnerDetail,
  type PartnerLimits,
  type PartnerRow,
} from "@avhomes/contracts";
import {
  NotFoundError,
  PreconditionFailedError,
  auditBefore,
  auditEntityId,
  currentDb,
  pathParam,
  readJson,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import type { Db } from "@avhomes/db";
import { requireAdmin, requireAuth } from "../middleware";
import { offboardPartnerAccount, type PartnerPorts } from "../partner-accounts";
import {
  countStaffSeats,
  findPartner,
  listPartners,
  openPartnerInvites,
  partnerAccounts,
  partnerUserIds,
  setPartnerMain,
  setPartnerStatus,
  updatePartner,
} from "../repo/partners";
import { readPartnerSettings, writePartnerSettings } from "../repo/partner-settings";
import { revokePartnerInvite } from "../repo/invites";
import { demoteOtherMains, enableUser, findUserById, setPartnerRole } from "../repo/users";
import { endAllSessions } from "../repo/sessions";

const LIMIT = z.number().int().min(0).max(PARTNER_LIMIT_MAX);
const NULLABLE_LIMIT = LIMIT.nullable();

const PatchBody = z
  .object({
    baseRevision: z.number().int().min(0),
    name: str().trim().min(2).max(160).optional(),
    limits: z.object({ review: NULLABLE_LIMIT, live: NULLABLE_LIMIT, staff: NULLABLE_LIMIT }).strict().optional(),
  })
  .strict();

const ReasonBody = z.object({ reason: str().trim().min(3).max(400) }).strict();
const MainBody = z.object({ userId: str().max(120) }).strict();
const SettingsBody = z.object({ limits: z.object({ review: LIMIT, live: LIMIT, staff: LIMIT }).strict() }).strict();

/** What a company is using of each limit: two counts from listings, one from here. */
async function usageFor(db: Db, ids: readonly string[], ports: PartnerPorts): Promise<Map<string, PartnerLimits>> {
  const listing = await ports.listingUsage(db, ids);
  const out = new Map<string, PartnerLimits>();
  for (const id of ids) {
    const counts = listing.get(id) ?? { review: 0, live: 0 };
    out.set(id, { review: counts.review, live: counts.live, staff: await countStaffSeats(db, id) });
  }
  return out;
}

async function detailFor(db: Db, id: string, ports: PartnerPorts): Promise<PartnerDetail> {
  const [partner, settings] = await Promise.all([findPartner(db, id), readPartnerSettings(db)]);
  if (!partner) throw new NotFoundError(`partner ${id}`);
  const [usage, accounts, invites] = await Promise.all([
    usageFor(db, [id], ports),
    partnerAccounts(db, id),
    openPartnerInvites(db, id),
  ]);
  return {
    partner,
    limits: effectiveLimits(partner.limits, settings.limits),
    defaults: settings.limits,
    usage: usage.get(id) ?? { review: 0, live: 0, staff: 0 },
    accounts,
    invites,
  };
}

/** A mail to the company's contact address. Never fatal: the change has happened. */
async function tell(mailer: Mailer, to: string, subject: string, lines: string[], ctx: { requestId: string; route: string }) {
  if (to === "") return false;
  return trySend(mailer, { to, subject, text: lines.join("\n") }, ctx);
}

export function partnerAdminRoutes(deps: { mailer: Mailer } & PartnerPorts): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/partners", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const [partners, settings] = await Promise.all([listPartners(db), readPartnerSettings(db)]);
    const ids = partners.map((p) => p.id);
    const [usage, headcount] = await Promise.all([
      usageFor(db, ids, deps),
      Promise.all(ids.map(async (id) => [id, (await partnerAccounts(db, id)).length] as const)),
    ]);
    const accounts = new Map(headcount);
    const items: PartnerRow[] = partners.map((partner) => ({
      partner,
      limits: effectiveLimits(partner.limits, settings.limits),
      usage: usage.get(partner.id) ?? { review: 0, live: 0, staff: 0 },
      accounts: accounts.get(partner.id) ?? 0,
    }));
    return c.json({ items, settings });
  });

  routes.get("/admin/partners/:id", requireAuth(), async (c) => {
    return c.json(await detailFor(await currentDb(c), pathParam(c, "id"), deps));
  });

  /** The name printed on their listings, and their own limits. AV Homes only. */
  routes.patch("/admin/partners/:id", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, PatchBody);
    const before = await findPartner(db, id);
    if (!before) throw new NotFoundError(`partner ${id}`);
    auditBefore(c, before as unknown as Record<string, unknown>);
    const patch: { name?: string; limits?: PartnerDetail["partner"]["limits"] } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.limits !== undefined) patch.limits = body.limits;
    await updatePartner(db, id, patch, body.baseRevision);
    auditEntityId(c, id);
    return c.json(await detailFor(db, id, deps));
  });

  routes.post("/admin/partners/:id/suspend", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const { reason } = await readJson(c, ReasonBody);
    const before = await findPartner(db, id);
    if (!before) throw new NotFoundError(`partner ${id}`);
    auditBefore(c, before as unknown as Record<string, unknown>);
    const partner = await setPartnerStatus(db, id, "suspended", reason);
    if (!partner) throw new NotFoundError(`partner ${id}`);
    // Sessions first: the listings coming down is the slower half and the less urgent.
    let sessionsEnded = 0;
    for (const userId of await partnerUserIds(db, id)) sessionsEnded += await endAllSessions(db, userId);
    const listingsHeld = await deps.holdListings(db, id, true);
    auditEntityId(c, id);
    await tell(
      deps.mailer,
      partner.contactEmail,
      "Your AV Homes access is suspended",
      [
        `Hello ${partner.contactName || partner.name},`,
        "",
        "AV Homes has suspended your company's access, and your listings are off the site for now.",
        "",
        reason,
        "",
        "Reply to this email or call AV Homes to talk about it.",
      ],
      { requestId: c.get("requestId"), route: "POST /admin/partners/:id/suspend" },
    );
    return c.json({ ...(await detailFor(db, id, deps)), sessionsEnded, listingsHeld });
  });

  routes.post("/admin/partners/:id/reinstate", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const { reason } = await readJson(c, ReasonBody);
    const before = await findPartner(db, id);
    if (!before) throw new NotFoundError(`partner ${id}`);
    auditBefore(c, before as unknown as Record<string, unknown>);
    const partner = await setPartnerStatus(db, id, "active", reason);
    if (!partner) throw new NotFoundError(`partner ${id}`);
    const listingsBack = await deps.holdListings(db, id, false);
    auditEntityId(c, id);
    await tell(
      deps.mailer,
      partner.contactEmail,
      "Your AV Homes access is back",
      [
        `Hello ${partner.contactName || partner.name},`,
        "",
        "AV Homes has restored your company's access, and your listings are back on the site.",
        "",
        reason,
      ],
      { requestId: c.get("requestId"), route: "POST /admin/partners/:id/reinstate" },
    );
    return c.json({ ...(await detailFor(db, id, deps)), listingsBack });
  });

  /** The main seat moves to an active staff member; the old holder takes a staff seat. */
  routes.post("/admin/partners/:id/main", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const { userId } = await readJson(c, MainBody);
    const partner = await findPartner(db, id);
    if (!partner) throw new NotFoundError(`partner ${id}`);
    const target = await findUserById(db, userId);
    if (!target || target.user.partnerId !== id) throw new NotFoundError(`account ${userId}`);
    if (target.disabledAt != null) {
      throw new PreconditionFailedError("account_disabled", {
        detail: "Enable this account before giving it the main role.",
      });
    }
    auditBefore(c, partner as unknown as Record<string, unknown>);
    // The compare-and-set keeps one seat; demoting by query keeps the labels matching it, so a retry repairs a half-done move.
    const moved = await setPartnerMain(db, id, userId, partner.mainUserId);
    if (!moved) {
      throw new PreconditionFailedError("main_changed", {
        detail: "Someone moved this company's main account a moment ago. Reload and try again.",
      });
    }
    await demoteOtherMains(db, id, userId);
    await setPartnerRole(db, userId, "main");
    auditEntityId(c, id);
    return c.json(await detailFor(db, id, deps));
  });

  routes.post("/admin/partners/:id/accounts/:userId/disable", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const userId = pathParam(c, "userId");
    const partner = await findPartner(db, id);
    if (!partner) throw new NotFoundError(`partner ${id}`);
    const target = await findUserById(db, userId);
    // Both clauses, like the company's own remove: an AV Homes account that somehow
    // carries a partnerId is not this company's to disable either.
    if (!target || target.user.partnerId !== id || target.user.role !== "partner") {
      throw new NotFoundError(`account ${userId}`);
    }
    auditBefore(c, target as unknown as Record<string, unknown>);
    if (partner.mainUserId === userId) {
      throw new PreconditionFailedError("main_account", {
        detail: "Move the main role to someone else first, or suspend the company.",
      });
    }
    const result = await offboardPartnerAccount(db, partner, userId, deps.reassignListings);
    return c.json({ ...(await detailFor(db, id, deps)), ...result });
  });

  routes.post("/admin/partners/:id/accounts/:userId/enable", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const userId = pathParam(c, "userId");
    const detail = await detailFor(db, id, deps);
    const target = await findUserById(db, userId);
    // Both clauses, like disable: an AV Homes account carrying a partnerId is not
    // this company's to put back either.
    if (!target || target.user.partnerId !== id || target.user.role !== "partner") {
      throw new NotFoundError(`account ${userId}`);
    }
    auditBefore(c, target as unknown as Record<string, unknown>);
    if (target.user.partnerRole === "staff" && target.disabledAt != null) {
      const seats = await countStaffSeats(db, id, userId);
      if (seats >= detail.limits.staff) {
        throw new PreconditionFailedError("limit_reached", {
          limit: "staff",
          count: seats,
          max: detail.limits.staff,
          detail: limitRefusal("staff", seats, detail.limits.staff, "av"),
        });
      }
    }
    await enableUser(db, userId);
    return c.json(await detailFor(db, id, deps));
  });

  routes.delete("/admin/partners/:id/invites/:inviteId", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const removed = await revokePartnerInvite(db, id, pathParam(c, "inviteId"));
    if (!removed) throw new NotFoundError(pathParam(c, "inviteId"));
    return c.json(await detailFor(db, id, deps));
  });

  routes.get("/admin/partner-settings", requireAuth(), async (c) => {
    return c.json({ settings: await readPartnerSettings(await currentDb(c)) });
  });

  routes.patch("/admin/partner-settings", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const { limits } = await readJson(c, SettingsBody);
    auditBefore(c, (await readPartnerSettings(db)) as unknown as Record<string, unknown>);
    return c.json({ settings: await writePartnerSettings(db, limits) });
  });

  return routes;
}

// TODO(test): disabling the main account is refused; disabling staff moves its
// listings to the main account; suspending ends every session and holds every
// listing; reinstating releases them.
