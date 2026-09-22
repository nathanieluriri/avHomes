import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  NO_PARTNER,
  effectiveLimits,
  limitRefusal,
  partnerScopeOf,
  type CompanyView,
  type Partner,
} from "@avhomes/contracts";
import {
  DuplicateError,
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
  auditBefore,
  auditEntityId,
  currentDb,
  currentUser,
  deploymentOrigin,
  email,
  pathParam,
  readJson,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import type { Db } from "@avhomes/db";
import { requireAuth } from "../middleware";
import { offboardPartnerAccount, type PartnerPorts } from "../partner-accounts";
import {
  countStaffSeats,
  findPartner,
  openPartnerInvites,
  partnerAccounts,
  updatePartner,
} from "../repo/partners";
import { readPartnerSettings } from "../repo/partner-settings";
import { createInvite, findOpenInvite, revokePartnerInvite } from "../repo/invites";
import { findUserByEmail, findUserById } from "../repo/users";

const ContactBody = z
  .object({
    baseRevision: z.number().int().min(0),
    contactName: str().trim().max(120).optional(),
    contactEmail: email().optional(),
    contactPhone: str().trim().max(40).optional(),
  })
  .strict();

const InviteBody = z.object({ email: email() }).strict();

/** Only an account inside a company gets past this. */
function requireCompany(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const scope = partnerScopeOf(currentUser(c));
    if (scope === null || scope === NO_PARTNER) throw new ForbiddenError("only a partner account has a company");
    await next();
  };
}

/**
 * The seat decides who the main account is, never the `partnerRole` label on
 * the caller's own session: that label only mirrors the seat and can go
 * stale, so it is never trusted for authority. Loads the company itself and
 * returns it, so a route that needs the partner afterwards does not read it
 * twice.
 */
async function requireMain(db: Db, c: Parameters<typeof currentUser>[0]): Promise<Partner> {
  const id = currentUser(c).partnerId as string;
  const partner = await findPartner(db, id);
  if (!partner) throw new NotFoundError(`partner ${id}`);
  if (partner.mainUserId !== currentUser(c).id) {
    throw new PreconditionFailedError("main_only", { detail: "Only your company's main account can do this." });
  }
  return partner;
}

async function viewFor(db: Db, c: Parameters<typeof currentUser>[0], ports: PartnerPorts): Promise<CompanyView> {
  const user = currentUser(c);
  const id = user.partnerId as string;
  const [partner, settings, accounts, invites, listing, staff] = await Promise.all([
    findPartner(db, id),
    readPartnerSettings(db),
    partnerAccounts(db, id),
    openPartnerInvites(db, id),
    ports.listingUsage(db, [id]),
    countStaffSeats(db, id),
  ]);
  if (!partner) throw new NotFoundError(`partner ${id}`);
  const counts = listing.get(id) ?? { review: 0, live: 0 };
  return {
    partner,
    limits: effectiveLimits(partner.limits, settings.limits),
    usage: { review: counts.review, live: counts.live, staff },
    accounts,
    invites,
    // The seat decides, not the label: see requireMain.
    viewer: { userId: user.id, partnerRole: partner.mainUserId === user.id ? "main" : "staff" },
  };
}

export function companyRoutes(deps: { mailer: Mailer } & PartnerPorts): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/company", requireAuth(), requireCompany(), async (c) => {
    return c.json(await viewFor(await currentDb(c), c, deps));
  });

  /** The Staff screen reads the same view: every account sees who is on the team. */
  routes.get("/admin/company/staff", requireAuth(), requireCompany(), async (c) => {
    return c.json(await viewFor(await currentDb(c), c, deps));
  });

  /** Contact details only. The name printed on listings is AV Homes' to change. */
  routes.patch("/admin/company", requireAuth(), requireCompany(), async (c) => {
    const db = await currentDb(c);
    const partner = await requireMain(db, c);
    const body = await readJson(c, ContactBody);
    auditBefore(c, partner as unknown as Record<string, unknown>);
    await updatePartner(
      db,
      partner.id,
      { contactName: body.contactName, contactEmail: body.contactEmail, contactPhone: body.contactPhone },
      body.baseRevision,
    );
    auditEntityId(c, partner.id);
    return c.json(await viewFor(db, c, deps));
  });

  routes.post("/admin/company/staff/invites", requireAuth(), requireCompany(), async (c) => {
    const db = await currentDb(c);
    const partner = await requireMain(db, c);
    const actor = currentUser(c);
    const { email: address } = await readJson(c, InviteBody);

    if (await findUserByEmail(db, address)) throw new DuplicateError("email", address);
    if (await findOpenInvite(db, address)) {
      throw new PreconditionFailedError("invite_open", {
        email: address,
        detail: "This address already has an open invite.",
      });
    }
    const view = await viewFor(db, c, deps);
    if (view.usage.staff >= view.limits.staff) {
      throw new PreconditionFailedError("limit_reached", {
        limit: "staff",
        count: view.usage.staff,
        max: view.limits.staff,
        detail: limitRefusal("staff", view.usage.staff, view.limits.staff, "partner"),
      });
    }

    const invite = await createInvite(db, {
      email: address,
      role: "partner",
      invitedBy: actor.id,
      partnerId: partner.id,
      partnerRole: "staff",
    });
    auditEntityId(c, invite._id);

    // The deployment's own host, never the request's, for the reason team invites give.
    const url = `${deploymentOrigin(c.req)}/admin/sign-in`;
    const emailed = await trySend(
      deps.mailer,
      {
        to: address,
        subject: `${actor.displayName} added you to ${view.partner.name} on AV Homes`,
        text: [
          `${actor.displayName} has added you to ${view.partner.name}'s account on AV Homes.`,
          "",
          `Sign in here: ${url}`,
          "",
          "Use this same email address. The invite expires in seven days.",
        ].join("\n"),
      },
      { requestId: c.get("requestId"), route: "POST /admin/company/staff/invites" },
    );
    return c.json({ ...(await viewFor(db, c, deps)), url, emailed }, 201);
  });

  routes.delete("/admin/company/staff/invites/:inviteId", requireAuth(), requireCompany(), async (c) => {
    const db = await currentDb(c);
    const partner = await requireMain(db, c);
    const removed = await revokePartnerInvite(db, partner.id, pathParam(c, "inviteId"));
    if (!removed) throw new NotFoundError(pathParam(c, "inviteId"));
    return c.json(await viewFor(db, c, deps));
  });

  routes.post("/admin/company/staff/:userId/remove", requireAuth(), requireCompany(), async (c) => {
    const db = await currentDb(c);
    const partner = await requireMain(db, c);
    const userId = pathParam(c, "userId");
    const target = await findUserById(db, userId);
    // Another company's account is simply not found.
    if (!target || target.user.partnerId !== partner.id) throw new NotFoundError(`account ${userId}`);
    if (partner.mainUserId === userId) {
      throw new PreconditionFailedError("remove_main", {
        detail: "The main account cannot be removed. AV Homes can move the main role to someone else.",
      });
    }
    auditBefore(c, target as unknown as Record<string, unknown>);
    const result = await offboardPartnerAccount(db, partner, userId, deps.reassignListings);
    return c.json({ ...(await viewFor(db, c, deps)), ...result });
  });

  return routes;
}

// TODO(test): a staff account is refused every write here; a main account
// cannot remove itself or anyone in another company; an invite past the staff
// limit is refused.
