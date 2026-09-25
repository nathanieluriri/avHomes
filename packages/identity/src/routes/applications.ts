import { Hono } from "hono";
import { z } from "zod";
import {
  auditEntityId,
  clientIp,
  currentDb,
  currentUser,
  deploymentOrigin,
  email as emailString,
  pathParam,
  readJson,
  str,
  trySend,
  type AppEnv,
  type Mailer,
} from "@avhomes/core";
import {
  APPLICATION_STATUSES,
  createApplication,
  decideApplication,
  getApplication,
  listApplications,
  openApplicationCount,
  reopenApplication,
} from "../repo/applications";
import { createInvite } from "../repo/invites";
import { upsertPartnerForApplication } from "../repo/partners";
import { limit } from "../repo/ratelimit";
import { requireAdmin, requireAuth } from "../middleware";

/**
 * Applying to list property, and the queue that decides.
 *
 * Approving one creates an ordinary invite at role `partner`. There is no second
 * door: the account is minted by `admit()` the first time they sign in, exactly
 * like every other account on the instance.
 */

/** An application is a write from a stranger, so it is rate limited per address. */
const APPLY_IP_LIMIT = 4;
const APPLY_WINDOW_MS = 60 * 60 * 1000;

const ApplyBody = z
  .object({
    name: str().min(2).max(120),
    email: emailString(),
    phone: str().max(40).default(""),
    company: str().max(160).default(""),
    about: str().min(10).max(1000),
    portfolio: str().max(80).default(""),
  })
  .strict();

const DecideBody = z
  .object({
    approve: z.boolean(),
    /** Required on a refusal: a no with no reason is a no somebody chases by phone. */
    reason: str().max(400).default(""),
  })
  .strict();

/**
 * The public intake.
 *
 * Mounted BELOW the origin guard and deliberately NOT in the cacheable `/public/*`
 * router, for the same reason the enquiry intake is not: it is a public MUTATION,
 * and that router's whole safety property is that a shared cache may store its
 * responses.
 */
export function applicationPublicRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/public/partner-applications", async (c) => {
    // Parsed before the limiter, like the enquiry intake: a schema check is free
    // and the limiter is a database write.
    const body = await readJson(c, ApplyBody);
    const db = await currentDb(c);
    await limit(db, `apply:${clientIp(c)}`, APPLY_IP_LIMIT, APPLY_WINDOW_MS);

    const application = await createApplication(db, body);

    /* Told what happens next, because an application with no stated outcome is an
       application people chase by phone. Never fatal: a confirmation that failed
       to send must not undo the application it confirms. */
    await trySend(
      deps.mailer,
      {
        to: application.email,
        subject: "AV Homes has your application",
        text: [
          `Thank you ${application.name}.`,
          "",
          "We have your request to list property with AV Homes. Somebody reads every",
          "one of these, and you will hear back either way. If we go ahead you will get",
          "a link to sign in and add your first property.",
        ].join("\n"),
      },
      { requestId: c.get("requestId"), route: "POST /public/partner-applications" },
    );

    /* The id only. A stranger learns that it landed and nothing about the queue. */
    return c.json({ ok: true, id: application.id }, 201);
  });

  return routes;
}

export function applicationAdminRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/applications", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const status = c.req.query("status");
    const valid = APPLICATION_STATUSES.find((value) => value === status);
    const [applications, open] = await Promise.all([
      listApplications(db, { status: valid, limit: 100 }),
      openApplicationCount(db),
    ]);
    return c.json({ applications, open });
  });

  routes.post("/admin/applications/:id/decide", requireAuth(), requireAdmin(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, DecideBody);
    const actor = currentUser(c);

    const before = await getApplication(db, id);
    if (!before) return c.json({ error: "gone" }, 404);

    /*
     * THE CLAIM FIRST, THE INVITE SECOND, and the order is the point. Claiming the
     * row is a CAS on `status: "open"`, so two admins deciding at once cannot both
     * act; creating the invite only after it means an account is never minted for
     * an application somebody else refused a moment earlier.
     */
    const { application, claimed } = await decideApplication(db, id, {
      approve: body.approve,
      reason: body.reason,
      byName: actor.displayName,
    });
    auditEntityId(c, application.id);

    /* The CAS, not the status read above it: `before` was read before the claim and
       still says "open" to the loser of two simultaneous decisions, which would send
       it on to mail and mint an account against the winner's verdict. */
    if (!claimed) {
      return c.json({
        application,
        url: null,
        already: true,
      });
    }

    if (!body.approve) {
      await trySend(
        deps.mailer,
        {
          to: application.email,
          subject: "About your AV Homes application",
          text: [
            `Thank you for asking to list with AV Homes, ${application.name}.`,
            "",
            "We are not going ahead this time.",
            body.reason ? `\n${body.reason}` : "",
            "",
            "You are welcome to apply again.",
          ].join("\n"),
        },
        { requestId: c.get("requestId"), route: "POST /admin/applications/:id/decide" },
      );
      return c.json({ application, url: null, already: false });
    }

    /* The company before the invite: the invite carries its id, and the upsert
       means a retry after a failure finds the company rather than making one. */
    let partner: Awaited<ReturnType<typeof upsertPartnerForApplication>>;
    let invite: Awaited<ReturnType<typeof createInvite>>;
    try {
      partner = await upsertPartnerForApplication(db, {
        applicationId: application.id,
        name: application.company || application.name,
        contactName: application.name,
        contactEmail: application.email,
        contactPhone: application.phone,
      });
      invite = await createInvite(db, {
        email: application.email,
        role: "partner",
        invitedBy: actor.id,
        partnerId: partner.id,
        partnerRole: "main",
      });
    } catch (err) {
      // decideApplication already committed "approved"; put it back to open rather than stranding it with no invite and nothing able to retry.
      if (application.decidedAt !== null) await reopenApplication(db, application.id, application.decidedAt);
      throw err;
    }

    /* The deployment's own host, never the request's: this URL goes in mail, and a
       host chosen by whoever made the request is a phishing page wearing our return
       address. The link carries no credential; membership is spent against the
       address the door verifies. */
    const url = `${deploymentOrigin(c.req)}/admin/sign-in`;

    await trySend(
      deps.mailer,
      {
        to: application.email,
        subject: "You can list with AV Homes",
        text: [
          `Good news, ${application.name}.`,
          "",
          "AV Homes has approved your account. Sign in here to add your first property:",
          url,
          "",
          "Use this same email address and you'll be sent a 6-digit code to confirm it. Your listings go live once AV Homes has read them.",
        ].join("\n"),
      },
      { requestId: c.get("requestId"), route: "POST /admin/applications/:id/decide" },
    );

    /* The URL comes back whether or not the mail went, the rule team invites
       already hold: an approval that depends on a working mail provider is an
       approval nobody can hand over by hand. */
    return c.json({ application, url, inviteId: invite._id, partnerId: partner.id, already: false });
  });

  return routes;
}
