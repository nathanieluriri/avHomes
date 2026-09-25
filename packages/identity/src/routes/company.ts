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
import { limit } from "../repo/ratelimit";
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

// The seat decides, never the session's partnerRole label, which can go stale.
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

    /* Parsed before the limiter, like the application intake: a schema check is free
       and the limiter is a database write, so a mistyped body does not spend a day's
       budget. It stays ABOVE the address checks below, which is what bounds the
       probe the neutral refusal down there declines to answer. */
    await limit(db, `partner-invite:${partner.id}`, 20, 24 * 60 * 60 * 1000);

    const [staffCount, settings] = await Promise.all([countStaffSeats(db, partner.id), readPartnerSettings(db)]);
    const staffLimit = effectiveLimits(partner.limits, settings.limits).staff;
    if (staffCount >= staffLimit) {
      throw new PreconditionFailedError("limit_reached", {
        limit: "staff",
        count: staffCount,
        max: staffLimit,
        detail: limitRefusal("staff", staffCount, staffLimit, "partner"),
      });
    }

    const [existing, open] = await Promise.all([findUserByEmail(db, address), findOpenInvite(db, address)]);
    if (existing || open) {
      /* ONE refusal for both, and it asserts nothing: two would let a company's main
         account learn whether an address is known to AV Homes ANYWHERE, which is more
         than "is it free in my company". The reason stays in the log, where AV Homes
         can still tell the two apart. */
      console.warn(
        "[api]",
        JSON.stringify({
          requestId: c.get("requestId"),
          route: "POST /admin/company/staff/invites",
          partnerId: partner.id,
          reason: existing ? "account_exists" : "invite_open",
        }),
      );
      throw new PreconditionFailedError("invite_unavailable", {
        detail: "This address cannot be added. Check it, and ask AV Homes if it looks right.",
      });
    }

    const invite = await createInvite(db, {
      email: address,
      role: "partner",
      invitedBy: actor.id,
      partnerId: partner.id,
      partnerRole: "staff",
    });

    // Parallel invites each saw room for one more, so the insert is checked again and undone if it went over.
    const staffCountAfter = await countStaffSeats(db, partner.id);
    if (staffCountAfter > staffLimit) {
      await revokePartnerInvite(db, partner.id, invite._id);
      throw new PreconditionFailedError("limit_reached", {
        limit: "staff",
        count: staffCountAfter,
        max: staffLimit,
        detail: limitRefusal("staff", staffCountAfter, staffLimit, "partner"),
      });
    }

    auditEntityId(c, invite._id);

    // The deployment's own host, never the request's, for the reason team invites give.
    const url = `${deploymentOrigin(c.req)}/admin/sign-in`;
    const emailed = await trySend(
      deps.mailer,
      {
        to: address,
        subject: `${actor.displayName} added you to ${partner.name} on AV Homes`,
        text: [
          `${actor.displayName} has added you to ${partner.name}'s account on AV Homes.`,
          "",
          `Sign in here: ${url}`,
          "",
          "Sign in with this same email address and you'll be sent a 6-digit code to confirm it. The invite expires in seven days.",
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
    // Another company's account, or one that is not a partner account, is simply not found.
    if (!target || target.user.partnerId !== partner.id || target.user.role !== "partner") {
      throw new NotFoundError(`account ${userId}`);
    }
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
