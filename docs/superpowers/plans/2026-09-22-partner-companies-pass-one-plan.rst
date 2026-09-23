=================================================
Partners, pass one: companies, staff and limits
=================================================

:Date: 2026-09-22
:Spec: ``docs/superpowers/specs/2026-09-22-partner-companies-design.rst``
:Branch: ``partner-companies``, worked in a worktree made when execution starts
:Pass: one of two. Pass two (changes held for review, the partner inbox,
       partner sales, notifications) gets its own plan, written against the
       code this pass leaves behind.

The spec is the authority. Where this plan and the spec disagree, the spec wins
and the plan is wrong.

Goal
====

A partner becomes a company. Its accounts share its listings and photographs,
work inside three limits AV Homes sets, and are managed on the company's page
under Partners instead of on the Team screen. AV Homes can suspend a company
and take its listings off the site in one move.

Approach
========

Task 1 is a production fix and ships on its own, first: approving a partner
application writes an invite the database refuses. Everything after it is one
pull request, built bottom up in the direction the packages already run:
contracts, identity's storage, the migration, the doors, the scope, the
limits, the holds, the two APIs, the Team change, then the screens and the
harness that checks them.

Partner accounts leave the Team screen in task 11, after the partner page can
disable them (task 9), and all of it ships together, so there is never a build
with no way to stop a partner account.

Global constraints
==================

These bind every task. Check them on every diff.

1. **No tests.** Standing project rule. Never create a test file, a runner or a
   testing dependency. Coverage intentions are ``TODO(test):`` comments beside
   the code, and the cross-cutting ones go in
   ``packages/api/src/TESTS.todo.ts``.
2. **No em dashes** anywhere: code, comments, copy, commit messages, docs. Use a
   period, a comma, a colon, or parentheses.
3. **Comments say what the code does or why it exists, in one line where
   possible.** Comment units, invariants and surprising choices. Skip the
   comment when the code is already clear.
4. **Copy is plain English and short.** If a label needs a sentence to explain
   it, the label is wrong.
5. **Timestamps are epoch-millisecond integers.** Ids are prefixed strings from
   ``newId()`` or derived from another id, never an ``ObjectId``.
6. **Never spread a request body into an update.** Every writable field is
   named.
7. **Feature packages never import each other.** ``contracts`` imports nothing
   from another package. Crossings are ports injected at ``packages/api``.
   Feature packages may import ``@avhomes/identity``, which is the tier below
   them.
8. **A wire field added under** ``/api/public/`` **is optional on the wire and
   coalesced once in** ``src/lib/data.ts``. This pass adds ``partnerId`` to
   ``Property``, which the site does not read, so nothing there changes, but
   the live-API build in task 14 still runs.
9. **The three gates pass before a task is done:** ``npm run build``,
   ``npm run typecheck``, ``npm run lint``.
10. **Stage specific paths.** Never ``git add .``, ``git add -f`` or
    ``git commit -a``.
11. **Commits are authored by nathanieluriri with no trailers.** No
    ``Co-Authored-By``, no "Generated with", no robot emoji. Check with
    ``git log -1 --format='%an <%ae>%n%B'`` after each commit.
12. **Docs are reStructuredText.** No new ``.md`` files.
13. **Never point tooling at the production database.** The main checkout's
    ``.env.local`` holds production's ``MONGODB_URI``. Every migration in this
    plan runs against the demo database. Running one on production is
    nathanieluriri's call, asked for in so many words.
14. **Never sign into the console by going around the password door**, not
    even on the demo database. Screens are checked with ``videos/_tools/qa.cjs``,
    which drives the real console against a mocked ``/api/admin``.
15. **Push and open a pull request only when nathanieluriri says so.**

The demo stack
==============

Used by the migration and screen checks. Run from the worktree.

.. code-block:: bash

   # the demo database, in its own terminal
   "/c/Program Files/MongoDB/Server/7.0/bin/mongod.exe" --dbpath "C:/Users/Mr Dashi/Downloads/avHomes/.demo-db" --port 27018 --bind_ip 127.0.0.1

   # a migration against it, never against .env.local
   MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB=avhomes_demo npm run db:migrate -- --dry
   MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB=avhomes_demo npm run db:migrate

   # the console on :3300 against it, then the screen checks
   node scripts/demo-server.mjs
   . videos/_tools/env.sh && BASE=http://localhost:3300 node videos/_tools/qa.cjs videos/_tools/qa-partner-companies.json .qa/partner-companies

File structure
==============

==============================================================  ================================================
File                                                            Responsibility
==============================================================  ================================================
``packages/db/src/migrations/0016_invites_know_every_role.ts``  NEW. Task 1. The invites validator, refreshed.
``packages/db/src/migrations/0017_partner_companies.ts``        NEW. Companies, fields, indexes, backfill.
``packages/core/src/ids.ts``                                    The ``ptnr`` prefix.
``packages/contracts/src/partners.ts``                          NEW. Company types, limits, the scope function.
``packages/contracts/src/roles.ts``                             ``PARTNER_ROLES``.
``packages/contracts/src/types.ts``                             ``partnerId`` on the account and the listing.
``packages/identity/src/schema.ts``                             Stored shapes gain the company.
``packages/identity/src/repo/users.ts``                         Projections, ``createUser``, the Team list.
``packages/identity/src/repo/invites.ts``                       Invites carry the company; two revokes.
``packages/identity/src/repo/partners.ts``                      NEW. Companies, their accounts and seats.
``packages/identity/src/repo/partner-settings.ts``              NEW. The default limits.
``packages/identity/src/partner-accounts.ts``                   NEW. Taking one account out of a company.
``packages/identity/src/admit.ts``                              Suspension; a claim fills its seat.
``packages/identity/src/routes/doors.ts``                       Suspension at login and claim.
``packages/identity/src/routes/applications.ts``                Approval makes the company first.
``packages/identity/src/routes/partners.ts``                    NEW. AV Homes' Partners API.
``packages/identity/src/routes/company.ts``                     NEW. A partner's own Company and Staff API.
``packages/identity/src/routes/team.ts``                        Partner accounts refused.
``packages/identity/src/middleware.ts``                         Three rules in the domain gate.
``packages/listings/src/authorize.ts``                          Read and write by company.
``packages/listings/src/repo.ts``                               ``publicVisible``, usage, holds, reassignment.
``packages/listings/src/schema.ts``                             ``partnerId``, ``partnerHold``.
``packages/listings/src/routes/admin.ts``                       Company scope and the limits.
``packages/media/src/routes.ts``                                The library by company.
``packages/api/src/analytics.ts``                               ``scopeFor`` by company.
``packages/api/src/app.ts``                                     The ports, the two new routers.
``packages/marketing/src/routes.ts``                            The marketer door refuses partners.
``src/components/admin/nav.tsx``                                The Partners section, Company and Staff.
``src/app/admin/partners/*``                                    List, one partner, applications, settings.
``src/app/admin/company/*``                                     The partner's Company and Staff screens.
``videos/_tools/record.cjs``                                    Mocks for every new route.
``videos/_tools/qa-partner-companies.json``                     NEW. The screen checks.
==============================================================  ================================================

--------------------------------------------------------------------------------

Task 1: invites know every role
===============================

Ships alone, before everything else. It fixes production.

Files
  Create ``packages/db/src/migrations/0016_invites_know_every_role.ts``.
  Modify ``packages/db/src/migrations/index.ts``.

Produces
  ``invitesValidator()``, which task 4 extends.

Why
  ``0001`` wrote the invites validator inline with ``role: { enum:
  [...ALL_ROLES] }`` as the roles stood then. A validator freezes the enums it
  was built from. ``0011`` and ``0015`` re-applied the USERS validator for the
  roles they added, never this one. So on a database migrated before
  ``partner`` existed, ``createInvite({ role: "partner" })`` fails validation.
  The approve route claims the application BEFORE it writes the invite, so each
  failed approval left an application marked approved with no invite behind
  it, and that person can never be approved again.

Step 1: the migration
---------------------

.. code-block:: ts

   import type { Db, Document } from "mongodb";
   import { ALL_ROLES } from "@avhomes/contracts";
   import { COLLECTIONS } from "../collections";
   import { ensureCollection, type Migration } from "../migrate";

   const STR = { bsonType: "string" };
   const TS = { bsonType: ["long", "int", "double"] };
   const NULLABLE_TS = { bsonType: ["long", "int", "double", "null"] };

   /**
    * The invites validator, as a function, for the reason `usersValidator` is one.
    *
    * 0001 wrote it inline, and a validator freezes the enums it was built from, so
    * every role added since was refused on an invite.
    */
   export function invitesValidator(): Document {
     return {
       $jsonSchema: {
         bsonType: "object",
         required: ["_id", "email", "role", "invitedBy", "createdAt", "expiresAt"],
         properties: {
           _id: STR,
           email: STR,
           role: { enum: [...ALL_ROLES] },
           invitedBy: STR,
           createdAt: TS,
           expiresAt: TS,
           acceptedAt: NULLABLE_TS,
         },
       },
     };
   }

   interface ApplicationRow {
     _id: string;
     email: string;
   }

   export const migration0016: Migration = {
     tag: "0016_invites_know_every_role",
     why: `Approving a partner application writes an invite at role \`partner\`, and the
   invites validator refused it.

   0001 wrote that validator inline, from the roles that existed then. 0011 and 0015
   re-applied the users validator for the roles they added but never this one, so a
   database migrated before the partner role refuses every partner invite. The
   approval claims the application first, so each refusal left an application
   marked approved with no invite behind it, which can never be approved again.

   This re-applies the validator from the current role list, then puts every
   approved application with no account and no invite behind it back to open, so
   it can be approved again.`,

     async up(db: Db) {
       await ensureCollection(db, COLLECTIONS.invites, invitesValidator());
       console.log(`invites accept every role: ${ALL_ROLES.join(", ")}.`);

       const applications = db.collection<ApplicationRow & Document>(COLLECTIONS.partnerApplications);
       const approved = await applications
         .find({ status: "approved" }, { projection: { _id: 1, email: 1 } })
         .toArray();

       let reopened = 0;
       for (const row of approved) {
         const [account, invite] = await Promise.all([
           db.collection(COLLECTIONS.users).findOne({ email: row.email }, { projection: { _id: 1 } }),
           db.collection(COLLECTIONS.invites).findOne({ email: row.email, role: "partner" }, { projection: { _id: 1 } }),
         ]);
         if (account || invite) continue;
         try {
           await applications.updateOne(
             { _id: row._id, status: "approved" },
             { $set: { status: "open", reason: "", decidedByName: "", decidedAt: null, updatedAt: Date.now() } },
           );
           reopened += 1;
         } catch (err) {
           // The partial unique index: they applied again meanwhile, and the newer one stands.
           if ((err as { code?: number }).code !== 11000) throw err;
           console.log(`${row.email} has a newer open application, so the old one stays approved.`);
         }
       }
       console.log(
         `${reopened} approved ${reopened === 1 ? "application had" : "applications had"} no invite behind it and went back to open.`,
       );
     },
   };

   // TODO(test): an approved application with no user and no invite goes back to
   // open; one with either stays approved.

Step 2: register it
-------------------

In ``packages/db/src/migrations/index.ts`` import ``migration0016`` and append it
after ``migration0015``.

Step 3: gates and the demo database
-----------------------------------

The three gates. Then start the demo database and run the migration against it,
``--dry`` first, following "The demo stack" above. The output must name
``0016_invites_know_every_role`` as applied.

Step 4: commit, then stop
-------------------------

.. code-block:: bash

   git add packages/db/src/migrations/0016_invites_know_every_role.ts packages/db/src/migrations/index.ts
   git commit -m "fix(db): partner invites are no longer refused by a role list from 0001" -m "0001 froze the invites validator's roles before partner existed and nothing re-applied it, so approving an application wrote an invite the validator refused. The approval claims the application first, so each one was left approved with no invite. This re-applies the validator and puts those applications back to open."

Stop here. Ask nathanieluriri whether to push this commit on its own branch and
open a pull request, and tell him production needs ``0016`` run against it
once it is merged. Do not run it there yourself.

--------------------------------------------------------------------------------

Task 2: the shapes
==================

Files
  Create ``packages/contracts/src/partners.ts``. Modify
  ``packages/contracts/src/roles.ts``, ``types.ts``, ``index.ts``,
  ``packages/core/src/ids.ts``, ``packages/identity/src/schema.ts``,
  ``packages/identity/src/repo/users.ts``, ``packages/listings/src/schema.ts``,
  ``packages/media/src/routes.ts``, ``src/lib/demo-data.ts``.

Produces
  ``PARTNER_ROLES``, ``PartnerRole``, ``PARTNER_STATUSES``,
  ``PartnerStatus``, ``PARTNER_STATUS_LABEL``, ``PARTNER_LIMIT_KEYS``,
  ``PartnerLimitKey``, ``PartnerLimits``, ``PartnerLimitOverrides``,
  ``DEFAULT_PARTNER_LIMITS``, ``PARTNER_LIMIT_MAX``, ``PARTNER_LIMIT_LABEL``,
  ``PARTNER_LIMIT_HINT``, ``REVIEW_LIMIT_STATUSES``, ``LIVE_LIMIT_STATUSES``,
  ``Partner``, ``PartnerUsage``, ``PartnerAccount``, ``PartnerInvite``,
  ``PartnerRow``, ``PartnerDetail``, ``PartnerSettings``, ``CompanyView``,
  ``effectiveLimits``, ``NO_PARTNER``, ``partnerScopeOf``, ``limitRefusal``.
  ``AuthUser.partnerId``, ``AuthUser.partnerRole``, ``Property.partnerId``.
  The ``partner: "ptnr"`` id prefix.

Step 1: the seat inside a company, in ``roles.ts``
-------------------------------------------------

Below ``ALL_ROLES``:

.. code-block:: ts

   /** Inside a partner company: the one account that manages it, and everyone else. */
   export const PARTNER_ROLES = ["main", "staff"] as const;
   export type PartnerRole = (typeof PARTNER_ROLES)[number];

The partner row's ``description`` becomes: "Lists their company's property,
uploads its photography and watches how it performs. Sees only their company's
listings, and a listing goes live once AV Homes approves it."

Step 2: ``contracts/src/partners.ts``
-------------------------------------

.. code-block:: ts

   import { isScopedRole, type PartnerRole, type Role } from "./roles";
   import type { PropertyStatus } from "./types";

   /*
    * A partner is a company. Its accounts share its listings, inside three limits
    * AV Homes sets, and one function decides what any account may see of them.
    */

   export const PARTNER_STATUSES = ["active", "suspended"] as const;
   export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

   export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
     active: "Active",
     suspended: "Suspended",
   };

   export const PARTNER_LIMIT_KEYS = ["review", "live", "staff"] as const;
   export type PartnerLimitKey = (typeof PARTNER_LIMIT_KEYS)[number];
   export type PartnerLimits = Record<PartnerLimitKey, number>;
   /** A company's own values. Null takes the default from Partners settings. */
   export type PartnerLimitOverrides = Record<PartnerLimitKey, number | null>;

   export const DEFAULT_PARTNER_LIMITS: PartnerLimits = { review: 3, live: 10, staff: 3 };

   /** The largest value a limit field accepts, so a typo cannot open the gates. */
   export const PARTNER_LIMIT_MAX = 500;

   export const PARTNER_LIMIT_LABEL: Record<PartnerLimitKey, string> = {
     review: "Not yet approved",
     live: "Live",
     staff: "Staff",
   };

   export const PARTNER_LIMIT_HINT: Record<PartnerLimitKey, string> = {
     review: "Drafts plus listings waiting for AV Homes",
     live: "Live plus under offer. Sold is not counted",
     staff: "Staff accounts plus open invites, not the main account",
   };

   /** The statuses each listing limit counts, trash excluded. */
   export const REVIEW_LIMIT_STATUSES: readonly PropertyStatus[] = ["draft", "submitted"];
   export const LIVE_LIMIT_STATUSES: readonly PropertyStatus[] = ["live", "under-offer"];

   export interface Partner {
     id: string;
     /** Printed after "Listed by" in pass two. Only AV Homes changes it. */
     name: string;
     contactName: string;
     /** Where review decisions and buyer threads are mailed. */
     contactEmail: string;
     contactPhone: string;
     status: PartnerStatus;
     /** Why it was last suspended or reinstated. The partner reads it. */
     statusReason: string;
     limits: PartnerLimitOverrides;
     /** Null until the main person first signs in. */
     mainUserId: string | null;
     /** Null for a company the migration made from an account with no application. */
     applicationId: string | null;
     createdAt: number;
     updatedAt: number;
     revision: number;
   }

   export type PartnerUsage = Record<PartnerLimitKey, number>;

   export interface PartnerAccount {
     id: string;
     email: string;
     displayName: string;
     partnerRole: PartnerRole;
     disabledAt: number | null;
     /** The newest `lastSeenAt` among its sessions. Null when it has none. */
     lastActiveAt: number | null;
     createdAt: number;
   }

   export interface PartnerInvite {
     id: string;
     email: string;
     createdAt: number;
     expiresAt: number;
   }

   /** One row of the Partners list. */
   export interface PartnerRow {
     partner: Partner;
     limits: PartnerLimits;
     usage: PartnerUsage;
     accounts: number;
   }

   /** One partner's page, for AV Homes. */
   export interface PartnerDetail {
     partner: Partner;
     limits: PartnerLimits;
     defaults: PartnerLimits;
     usage: PartnerUsage;
     accounts: PartnerAccount[];
     invites: PartnerInvite[];
   }

   /** The partner's own Company and Staff screens. */
   export interface CompanyView {
     partner: Partner;
     limits: PartnerLimits;
     usage: PartnerUsage;
     accounts: PartnerAccount[];
     invites: PartnerInvite[];
     viewer: { userId: string; partnerRole: PartnerRole };
   }

   export interface PartnerSettings {
     limits: PartnerLimits;
     updatedAt: number;
   }

   /** A company's own value where it has one, the default where it has none. */
   export function effectiveLimits(own: PartnerLimitOverrides, defaults: PartnerLimits): PartnerLimits {
     return {
       review: own.review ?? defaults.review,
       live: own.live ?? defaults.live,
       staff: own.staff ?? defaults.staff,
     };
   }

   /** An id no document carries. A scoped account without a company scopes to it. */
   export const NO_PARTNER = "ptnr_none";

   /**
    * The company this account is confined to, or null when it is not confined.
    *
    * Null means every row, and only an unscoped role gets it. A scoped role with
    * no company gets NO_PARTNER, so a broken account reads nothing rather than
    * everything.
    */
   export function partnerScopeOf(user: { role: Role; partnerId: string | null }): string | null {
     if (!isScopedRole(user.role)) return null;
     return user.partnerId || NO_PARTNER;
   }

   const REFUSAL_TAIL: Record<PartnerLimitKey, Record<"partner" | "av", string>> = {
     review: {
       partner: "Send one for review or delete a draft first.",
       av: "Raise their limit, or wait for one to be approved.",
     },
     live: {
       partner: "Mark one sold or take one down first.",
       av: "Raise their limit, or wait for one to come down.",
     },
     staff: {
       partner: "Remove somebody or revoke an invite first.",
       av: "Raise their limit first.",
     },
   };

   const NOUN: Record<PartnerLimitKey, [string, string]> = {
     review: ["listing not yet approved", "listings not yet approved"],
     live: ["live listing", "live listings"],
     staff: ["staff seat in use", "staff seats in use"],
   };

   /** The sentence a refused action shows, to the partner or to AV Homes. */
   export function limitRefusal(
     limit: PartnerLimitKey,
     count: number,
     max: number,
     audience: "partner" | "av",
   ): string {
     const noun = NOUN[limit][count === 1 ? 0 : 1];
     const lead = audience === "partner" ? `You have ${count} ${noun}` : `This partner has ${count} ${noun}`;
     const whose = audience === "partner" ? "your" : "their";
     return `${lead}, ${whose} limit of ${max}. ${REFUSAL_TAIL[limit][audience]}`;
   }

   // TODO(test): partnerScopeOf returns null for every unscoped role, the company
   // for a partner, and NO_PARTNER for a partner with none.

Re-export it from ``packages/contracts/src/index.ts`` with
``export * from "./partners";``.

Step 3: the account and the listing, in ``types.ts``
---------------------------------------------------

Import ``PartnerRole`` beside ``Role`` from ``./roles``. ``AuthUser`` gains, after
``phone``:

.. code-block:: ts

     /** The partner company this account works for. Null for AV Homes' own accounts. */
     partnerId: string | null;
     /** "main" manages the company's staff and details. Null outside a company. */
     partnerRole: PartnerRole | null;

``Property`` gains, after ``agentUserId``:

.. code-block:: ts

     /**
      * The partner company whose listing this is. Null for AV Homes' own, and for
      * Non-AV property an AV Homes agent typed in for an owner with no account.
      */
     partnerId: string | null;

Step 4: the id prefix, in ``packages/core/src/ids.ts``
-----------------------------------------------------

Add to ``ID_PREFIXES``, after ``partnerApplication``:

.. code-block:: ts

     /* A company's id is DERIVED from its application's where it has one, so an
        approval retried after a failure finds the company it already made. */
     partner: "ptnr",

Step 5: the stored shapes
-------------------------

``packages/identity/src/schema.ts`` imports ``PartnerLimitOverrides``,
``PartnerRole`` and ``PartnerStatus`` from contracts. ``UserDoc`` gains:

.. code-block:: ts

     /** Absent on every account made before partner companies; reads as null. */
     partnerId?: string | null;
     partnerRole?: PartnerRole | null;

``InviteDoc`` gains:

.. code-block:: ts

     /** The company a partner invite joins, and which seat. Absent on a team invite. */
     partnerId?: string | null;
     partnerRole?: PartnerRole | null;

And a new stored shape:

.. code-block:: ts

   export interface PartnerDoc {
     _id: string;
     name: string;
     contactName: string;
     contactEmail: string;
     contactPhone: string;
     status: PartnerStatus;
     statusReason: string;
     limits: PartnerLimitOverrides;
     mainUserId: string | null;
     applicationId: string | null;
     createdAt: number;
     updatedAt: number;
     revision: number;
   }

Export ``PartnerDoc`` from ``packages/identity/src/index.ts`` beside
``UserDoc``.

``packages/listings/src/schema.ts``: ``PropertyDoc`` gains

.. code-block:: ts

     /** The partner company. Absent on rows written before companies existed. */
     partnerId?: string | null;
     /** True while the company is suspended: off the public site, status untouched. */
     partnerHold?: boolean;

and ``toProperty`` adds ``partnerId: doc.partnerId ?? null,`` after
``agentUserId``. ``partnerHold`` never reaches the wire.

``packages/media/src/routes.ts``: ``ImageDoc`` gains
``partnerId?: string | null;`` with the comment "The company that uploaded it.
Null for AV Homes' own."

Step 6: coalesce on read, in ``packages/identity/src/repo/users.ts``
-------------------------------------------------------------------

The two projections are enumerated, so the new fields have to be named or they
never arrive:

.. code-block:: ts

   const PROFILE_FIELDS = { avatarUrl: 1, title: 1, phone: 1 } as const;
   const PARTNER_FIELDS = { partnerId: 1, partnerRole: 1 } as const;

and ``...PARTNER_FIELDS`` joins both ``AUTH_PROJECTION`` and ``TEAM_PROJECTION``.

.. code-block:: ts

   export function toAuthUser(
     doc: Pick<UserDoc, "_id" | "email" | "displayName" | "role"> &
       Partial<Pick<UserDoc, "avatarUrl" | "title" | "phone" | "partnerId" | "partnerRole">>,
   ): AuthUser {
     return {
       id: doc._id,
       email: doc.email,
       displayName: doc.displayName,
       role: doc.role,
       avatarUrl: doc.avatarUrl ?? "",
       title: doc.title ?? "",
       phone: doc.phone ?? "",
       partnerId: doc.partnerId ?? null,
       partnerRole: doc.partnerRole ?? null,
     };
   }

``resolveSession`` needs nothing: its ``$lookup`` returns the whole user row,
which ``toAuthUser`` maps.

Step 7: the fixtures, in ``src/lib/demo-data.ts``
------------------------------------------------

Add ``"partnerId"`` to the ``Omit`` list of ``PropertySeed`` beside
``"agentUserId"``, and ``partnerId: null,`` in ``toProperty`` beside
``agentUserId: null``. No fixture is a partner's.

Step 8: gates and commit
------------------------

Run the three gates. If ``npm run typecheck`` names another place that builds an
``AuthUser`` or a ``Property`` by hand, give it ``partnerId: null`` (and
``partnerRole: null`` for an account) and list it in the commit body.

.. code-block:: bash

   git add packages/contracts/src packages/core/src/ids.ts packages/identity/src/schema.ts packages/identity/src/index.ts packages/identity/src/repo/users.ts packages/listings/src/schema.ts packages/media/src/routes.ts src/lib/demo-data.ts
   git commit -m "feat(contracts): a partner is a company, and an account knows which"

--------------------------------------------------------------------------------

Task 3: companies in identity
=============================

Files
  Create ``packages/identity/src/repo/partners.ts``,
  ``packages/identity/src/repo/partner-settings.ts``. Modify
  ``packages/db/src/collections.ts``, ``packages/identity/src/repo/users.ts``,
  ``packages/identity/src/repo/invites.ts``, ``packages/identity/src/index.ts``.

Consumes
  Everything task 2 produced.

Produces
  From ``@avhomes/identity``: ``partnerIdForApplication``,
  ``upsertPartnerForApplication``, ``findPartner``, ``listPartners``,
  ``setPartnerMain``, ``updatePartner``, ``setPartnerStatus``,
  ``isSuspendedPartner``, ``partnerAccounts``, ``partnerUserIds``,
  ``openPartnerInvites``, ``countStaffSeats``, ``setPartnerRole``,
  ``readPartnerSettings``, ``writePartnerSettings``, ``limitsForPartner``,
  ``revokeTeamInvite``, ``revokePartnerInvite``, ``type PartnerPatch``.
  ``createUser`` and ``createInvite`` accept ``partnerId`` and ``partnerRole``.

Step 1: the collection name
---------------------------

In ``COLLECTIONS``, after ``partnerApplications``:

.. code-block:: ts

     /* Partner companies. Their accounts are users rows carrying the company's id. */
     partners: "partners",

Step 2: ``createUser`` fills a seat
-----------------------------------

In ``repo/users.ts``:

.. code-block:: ts

   export interface CreateUserArgs {
     email: string;
     displayName: string;
     role: Role;
     passwordHash?: string | null;
     partnerId?: string | null;
     partnerRole?: PartnerRole | null;
   }

and in ``createUser``'s document, after ``phone: null``:

.. code-block:: ts

       partnerId: args.partnerId ?? null,
       partnerRole: args.partnerRole ?? null,

Also add, below ``enableUser``:

.. code-block:: ts

   /** Moves a partner account between the main seat and a staff seat. */
   export async function setPartnerRole(db: Db, userId: string, partnerRole: PartnerRole): Promise<void> {
     await users(db).updateOne({ _id: userId }, { $set: { partnerRole, updatedAt: Date.now() } });
   }

Step 3: invites carry the company, in ``repo/invites.ts``
--------------------------------------------------------

.. code-block:: ts

   export async function createInvite(
     db: Db,
     args: {
       email: string;
       role: Role;
       invitedBy: string;
       partnerId?: string | null;
       partnerRole?: PartnerRole | null;
     },
   ): Promise<InviteDoc> {
     const now = Date.now();
     const doc: InviteDoc = {
       _id: newId("inv", now),
       email: args.email.trim().toLowerCase(),
       role: args.role,
       invitedBy: args.invitedBy,
       createdAt: now,
       expiresAt: now + INVITE_TTL_MS,
       acceptedAt: null,
       partnerId: args.partnerId ?? null,
       partnerRole: args.partnerRole ?? null,
     };
     await invites(db).insertOne(doc);
     return doc;
   }

Replace ``revokeInvite`` with two, so neither screen can reach the other's rows:

.. code-block:: ts

   /** The Team screen's revoke. A partner invite is not the team's to withdraw. */
   export async function revokeTeamInvite(db: Db, inviteId: string): Promise<boolean> {
     const result = await invites(db).deleteOne({ _id: inviteId, role: { $ne: "partner" } });
     return result.deletedCount === 1;
   }

   /** A partner invite, withdrawn by its company or by AV Homes. Only while open. */
   export async function revokePartnerInvite(db: Db, partnerId: string, inviteId: string): Promise<boolean> {
     const result = await invites(db).deleteOne({ _id: inviteId, partnerId, acceptedAt: null });
     return result.deletedCount === 1;
   }

``listInvites`` stops returning partner invites. Its filter becomes:

.. code-block:: ts

     const base = { role: { $ne: "partner" as const } };
     const filter = includeHistory ? base : { ...base, acceptedAt: null, expiresAt: { $gt: now } };

Step 4: ``repo/partners.ts``
----------------------------

.. code-block:: ts

   import { COLLECTIONS, collection, type Db } from "@avhomes/db";
   import { NotFoundError, StaleWriteError } from "@avhomes/core";
   import type {
     Partner,
     PartnerAccount,
     PartnerInvite,
     PartnerLimitOverrides,
     PartnerRole,
     PartnerStatus,
   } from "@avhomes/contracts";
   import type { InviteDoc, PartnerDoc, SessionDoc, UserDoc } from "../schema";

   function partners(db: Db) {
     return collection<PartnerDoc>(db, COLLECTIONS.partners);
   }

   export function toPartner(doc: PartnerDoc): Partner {
     return {
       id: doc._id,
       name: doc.name,
       contactName: doc.contactName ?? "",
       contactEmail: doc.contactEmail ?? "",
       contactPhone: doc.contactPhone ?? "",
       status: doc.status,
       statusReason: doc.statusReason ?? "",
       limits: {
         review: doc.limits?.review ?? null,
         live: doc.limits?.live ?? null,
         staff: doc.limits?.staff ?? null,
       },
       mainUserId: doc.mainUserId ?? null,
       applicationId: doc.applicationId ?? null,
       createdAt: doc.createdAt,
       updatedAt: doc.updatedAt,
       revision: doc.revision,
     };
   }

   /** One application, one company: the id is the application's, re-prefixed. */
   export function partnerIdForApplication(applicationId: string): string {
     return `ptnr_${applicationId.slice(applicationId.indexOf("_") + 1)}`;
   }

   export interface PartnerSeed {
     applicationId: string;
     name: string;
     contactName: string;
     contactEmail: string;
     contactPhone: string;
   }

   /**
    * The company an approved application stands for, made once.
    *
    * An upsert on an id derived from the application, so an approval retried
    * after a failure finds the company it already made instead of a second one.
    */
   export async function upsertPartnerForApplication(db: Db, seed: PartnerSeed): Promise<Partner> {
     const now = Date.now();
     const id = partnerIdForApplication(seed.applicationId);
     await partners(db).updateOne(
       { _id: id },
       {
         $setOnInsert: {
           name: seed.name,
           contactName: seed.contactName,
           contactEmail: seed.contactEmail,
           contactPhone: seed.contactPhone,
           status: "active",
           statusReason: "",
           limits: { review: null, live: null, staff: null },
           mainUserId: null,
           applicationId: seed.applicationId,
           createdAt: now,
           updatedAt: now,
           revision: 1,
         },
       },
       { upsert: true },
     );
     const doc = await partners(db).findOne({ _id: id });
     if (!doc) throw new NotFoundError(`partner ${id}`);
     return toPartner(doc);
   }

   export async function findPartner(db: Db, id: string): Promise<Partner | null> {
     const doc = await partners(db).findOne({ _id: id });
     return doc ? toPartner(doc) : null;
   }

   /**
    * Every company, by name. Unpaged, like the team list: each one exists because
    * somebody approved an application, so the count grows by hand.
    */
   export async function listPartners(db: Db): Promise<Partner[]> {
     const docs = await partners(db).find({}, { sort: { name: 1 }, limit: 500 }).toArray();
     return docs.map(toPartner);
   }

   export async function setPartnerMain(db: Db, partnerId: string, userId: string): Promise<void> {
     await partners(db).updateOne(
       { _id: partnerId },
       { $set: { mainUserId: userId, updatedAt: Date.now() }, $inc: { revision: 1 } },
     );
   }

   export interface PartnerPatch {
     name?: string;
     contactName?: string;
     contactEmail?: string;
     contactPhone?: string;
     limits?: PartnerLimitOverrides;
   }

   /** Named fields only, against the revision the caller read. A lost race is a 409. */
   export async function updatePartner(
     db: Db,
     id: string,
     patch: PartnerPatch,
     baseRevision: number,
   ): Promise<Partner> {
     const set: Partial<PartnerDoc> = { updatedAt: Date.now() };
     if (patch.name !== undefined) set.name = patch.name;
     if (patch.contactName !== undefined) set.contactName = patch.contactName;
     if (patch.contactEmail !== undefined) set.contactEmail = patch.contactEmail;
     if (patch.contactPhone !== undefined) set.contactPhone = patch.contactPhone;
     if (patch.limits !== undefined) set.limits = patch.limits;
     const after = await partners(db).findOneAndUpdate(
       { _id: id, revision: baseRevision },
       { $set: set, $inc: { revision: 1 } },
       { returnDocument: "after" },
     );
     if (after) return toPartner(after);
     const current = await partners(db).findOne({ _id: id });
     if (!current) throw new NotFoundError(`partner ${id}`);
     throw new StaleWriteError("partner", baseRevision, current.revision, toPartner(current));
   }

   /**
    * Suspends or reinstates, with no revision check: stopping a company must not
    * fail because somebody edited its phone number a second earlier.
    */
   export async function setPartnerStatus(
     db: Db,
     id: string,
     status: PartnerStatus,
     reason: string,
   ): Promise<Partner | null> {
     const after = await partners(db).findOneAndUpdate(
       { _id: id },
       { $set: { status, statusReason: reason, updatedAt: Date.now() }, $inc: { revision: 1 } },
       { returnDocument: "after" },
     );
     return after ? toPartner(after) : null;
   }

   export async function isSuspendedPartner(db: Db, partnerId: string | null): Promise<boolean> {
     if (!partnerId) return false;
     const doc = await partners(db).findOne({ _id: partnerId, status: "suspended" }, { projection: { _id: 1 } });
     return doc !== null;
   }

   /** Every account in a company, main first, each with when it was last active. */
   export async function partnerAccounts(db: Db, partnerId: string): Promise<PartnerAccount[]> {
     const docs = await collection<UserDoc>(db, COLLECTIONS.users)
       .find(
         { partnerId },
         { projection: { _id: 1, email: 1, displayName: 1, partnerRole: 1, disabledAt: 1, createdAt: 1 } },
       )
       .toArray();
     const seen = await collection<SessionDoc>(db, COLLECTIONS.sessions)
       .aggregate<{ _id: string; last: number }>([
         { $match: { userId: { $in: docs.map((d) => d._id) } } },
         { $group: { _id: "$userId", last: { $max: "$lastSeenAt" } } },
       ])
       .toArray();
     const last = new Map(seen.map((row) => [row._id, row.last]));
     const rank = (role: PartnerRole | null | undefined) => (role === "main" ? 0 : 1);
     return docs
       .map((doc) => ({
         id: doc._id,
         email: doc.email,
         displayName: doc.displayName,
         partnerRole: (doc.partnerRole ?? "staff") as PartnerRole,
         disabledAt: doc.disabledAt ?? null,
         lastActiveAt: last.get(doc._id) ?? null,
         createdAt: doc.createdAt,
       }))
       .sort((a, b) => rank(a.partnerRole) - rank(b.partnerRole) || a.createdAt - b.createdAt);
   }

   /** Every account id in a company, disabled ones included, for ending sessions. */
   export async function partnerUserIds(db: Db, partnerId: string): Promise<string[]> {
     const docs = await collection<UserDoc>(db, COLLECTIONS.users)
       .find({ partnerId }, { projection: { _id: 1 } })
       .toArray();
     return docs.map((doc) => doc._id);
   }

   export async function openPartnerInvites(db: Db, partnerId: string): Promise<PartnerInvite[]> {
     const docs = await collection<InviteDoc>(db, COLLECTIONS.invites)
       .find({ partnerId, acceptedAt: null, expiresAt: { $gt: Date.now() } }, { sort: { createdAt: -1 } })
       .toArray();
     return docs.map((doc) => ({ id: doc._id, email: doc.email, createdAt: doc.createdAt, expiresAt: doc.expiresAt }));
   }

   /**
    * Staff seats in use: staff accounts not disabled, plus staff invites still
    * open. The main account never takes a seat. `exceptUserId` leaves one account
    * out, for re-enabling it.
    */
   export async function countStaffSeats(db: Db, partnerId: string, exceptUserId?: string): Promise<number> {
     const [accounts, open] = await Promise.all([
       collection<UserDoc>(db, COLLECTIONS.users).countDocuments({
         partnerId,
         partnerRole: "staff",
         disabledAt: null,
         ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}),
       }),
       collection<InviteDoc>(db, COLLECTIONS.invites).countDocuments({
         partnerId,
         partnerRole: "staff",
         acceptedAt: null,
         expiresAt: { $gt: Date.now() },
       }),
     ]);
     return accounts + open;
   }

   // TODO(test): countStaffSeats leaves out the main account, disabled staff and
   // expired invites, and counts open staff invites.

Step 5: ``repo/partner-settings.ts``
------------------------------------

.. code-block:: ts

   import { COLLECTIONS, collection, type Db } from "@avhomes/db";
   import {
     DEFAULT_PARTNER_LIMITS,
     effectiveLimits,
     type Partner,
     type PartnerLimits,
     type PartnerSettings,
   } from "@avhomes/contracts";
   import { findPartner } from "./partners";

   /** One row in the shared settings collection, like marketing's, read with defaults. */
   const DOC_ID = "partners";

   interface SettingsDoc {
     _id: string;
     limits?: Partial<PartnerLimits>;
     updatedAt?: number;
   }

   function rows(db: Db) {
     return collection<SettingsDoc>(db, COLLECTIONS.settings);
   }

   export async function readPartnerSettings(db: Db): Promise<PartnerSettings> {
     const doc = await rows(db).findOne({ _id: DOC_ID });
     const d = DEFAULT_PARTNER_LIMITS;
     return {
       limits: {
         review: doc?.limits?.review ?? d.review,
         live: doc?.limits?.live ?? d.live,
         staff: doc?.limits?.staff ?? d.staff,
       },
       updatedAt: doc?.updatedAt ?? 0,
     };
   }

   export async function writePartnerSettings(db: Db, limits: PartnerLimits): Promise<PartnerSettings> {
     await rows(db).updateOne(
       { _id: DOC_ID },
       { $set: { limits: { review: limits.review, live: limits.live, staff: limits.staff }, updatedAt: Date.now() } },
       { upsert: true },
     );
     return readPartnerSettings(db);
   }

   /** A company and the limits that actually bind it. */
   export async function limitsForPartner(
     db: Db,
     partnerId: string,
   ): Promise<{ partner: Partner; limits: PartnerLimits; defaults: PartnerLimits } | null> {
     const [partner, settings] = await Promise.all([findPartner(db, partnerId), readPartnerSettings(db)]);
     if (!partner) return null;
     return { partner, limits: effectiveLimits(partner.limits, settings.limits), defaults: settings.limits };
   }

Step 6: exports, gates, commit
------------------------------

Export every function in the "Produces" list from
``packages/identity/src/index.ts``, grouped under a ``./repo/partners`` block
and a ``./repo/partner-settings`` block, and swap ``revokeInvite`` for the two
new revokes wherever it was imported (``routes/team.ts`` uses
``revokeTeamInvite``). Run the three gates.

.. code-block:: bash

   git add packages/db/src/collections.ts packages/identity/src
   git commit -m "feat(identity): companies, their seats and the limits that bind them"

--------------------------------------------------------------------------------

Task 4: the migration
=====================

Files
  Create ``packages/db/src/migrations/0017_partner_companies.ts``. Modify
  ``packages/db/src/migrations/index.ts``, ``0005_enquiry_threads.ts``,
  ``0015_analytics_and_funds.ts``, ``0016_invites_know_every_role.ts``.

Consumes
  ``PARTNER_ROLES``, ``PARTNER_STATUSES`` (task 2), ``COLLECTIONS.partners``
  (task 3).

Step 1: the three shared validators learn the new fields
--------------------------------------------------------

A validator is frozen when applied, so each gains its fields here and 0017
re-applies all three.

``usersValidator()`` in ``0005``, inside ``properties``, after ``phone``:

.. code-block:: ts

           partnerId: NULLABLE_STR,
           partnerRole: { enum: [...PARTNER_ROLES, null] },

``invitesValidator()`` in ``0016``, after ``acceptedAt``:

.. code-block:: ts

           partnerId: { bsonType: ["string", "null"] },
           partnerRole: { enum: [...PARTNER_ROLES, null] },

``propertiesValidator()`` in ``0015``, after ``closedDealId``:

.. code-block:: ts

           partnerId: NULLABLE_STR,
           partnerHold: BOOL,

Each file imports ``PARTNER_ROLES`` from contracts where it needs it.

Step 2: ``0017_partner_companies.ts``
-------------------------------------

.. code-block:: ts

   import type { Db, Document } from "mongodb";
   import { PARTNER_STATUSES } from "@avhomes/contracts";
   import { COLLECTIONS } from "../collections";
   import { ensureCollection, ensureIndex, type Migration } from "../migrate";
   import { usersValidator } from "./0005_enquiry_threads";
   import { propertiesValidator } from "./0015_analytics_and_funds";
   import { invitesValidator } from "./0016_invites_know_every_role";

   const STR = { bsonType: "string" };
   const NULLABLE_STR = { bsonType: ["string", "null"] };
   const TS = { bsonType: ["long", "int", "double"] };
   const INT = { bsonType: ["long", "int", "double"] };
   const NULLABLE_INT = { bsonType: ["long", "int", "double", "null"] };

   function partnersValidator(): Document {
     return {
       $jsonSchema: {
         bsonType: "object",
         required: ["_id", "name", "status", "limits", "createdAt", "revision"],
         properties: {
           _id: STR,
           name: STR,
           contactName: STR,
           contactEmail: STR,
           contactPhone: STR,
           status: { enum: [...PARTNER_STATUSES] },
           statusReason: STR,
           limits: {
             bsonType: "object",
             properties: { review: NULLABLE_INT, live: NULLABLE_INT, staff: NULLABLE_INT },
           },
           mainUserId: NULLABLE_STR,
           applicationId: NULLABLE_STR,
           createdAt: TS,
           updatedAt: TS,
           revision: INT,
         },
       },
     };
   }

   interface AccountRow extends Document {
     _id: string;
     email: string;
     displayName: string;
     phone?: string | null;
   }

   interface ApplicationRow extends Document {
     _id: string;
     name: string;
     email: string;
     phone?: string;
     company?: string;
   }

   interface InviteRow extends Document {
     _id: string;
     email: string;
   }

   /** The same derivation `partnerIdForApplication` uses: the source id, re-prefixed. */
   function derivedId(sourceId: string): string {
     return `ptnr_${sourceId.slice(sourceId.indexOf("_") + 1)}`;
   }

   interface CompanyRow extends Document {
     _id: string;
     mainUserId: string | null;
   }

   async function companyFor(
     db: Db,
     seed: { sourceId: string; applicationId: string | null; name: string; contactName: string; contactEmail: string; contactPhone: string },
     now: number,
   ): Promise<string> {
     const id = derivedId(seed.sourceId);
     await db.collection<CompanyRow>(COLLECTIONS.partners).updateOne(
       { _id: id },
       {
         $setOnInsert: {
           name: seed.name,
           contactName: seed.contactName,
           contactEmail: seed.contactEmail,
           contactPhone: seed.contactPhone,
           status: "active",
           statusReason: "",
           limits: { review: null, live: null, staff: null },
           mainUserId: null,
           applicationId: seed.applicationId,
           createdAt: now,
           updatedAt: now,
           revision: 1,
         },
       },
       { upsert: true },
     );
     return id;
   }

   export const migration0017: Migration = {
     tag: "0017_partner_companies",
     why: `A partner stops being one account and becomes a company its accounts share.

   \`partners\` is new: one row per company, its contact details, its status and
   its own values for three limits, where null takes the default kept in the
   \`partners\` settings row. A company's id is derived from its application's, so
   re-running this, or retrying an approval, cannot make a second one.

   Users and invites gain \`partnerId\` and \`partnerRole\`, and listings and
   images gain \`partnerId\`, because every scoped read now narrows by the company
   rather than by the one account that happened to create a row. Listings also
   gain \`partnerHold\`, which keeps a suspended company's listings off the public
   site without touching their status.

   The backfill turns every partner that exists into a company of one: each
   partner account becomes the main account of the company its approved
   application stands for, its listings and images take that company, and an
   open partner invite takes the company of its application. An account or
   invite with no application to match gets a company named after it, listed in
   the output, so a person decides what it should be called.

   The users, invites and properties validators are re-applied with the new
   fields.`,

     async up(db: Db) {
       const now = Date.now();

       await ensureCollection(db, COLLECTIONS.partners, partnersValidator());
       await ensureIndex(db, COLLECTIONS.partners, { applicationId: 1 }, { name: "partners_application" });
       await ensureIndex(db, COLLECTIONS.partners, { status: 1, name: 1 }, { name: "partners_status" });

       const users = db.collection<AccountRow>(COLLECTIONS.users);
       const applications = db.collection<ApplicationRow>(COLLECTIONS.partnerApplications);
       const invites = db.collection<InviteRow>(COLLECTIONS.invites);
       const orphans: string[] = [];

       const accounts = await users
         .find({ role: "partner", partnerId: null }, { projection: { _id: 1, email: 1, displayName: 1, phone: 1 } })
         .toArray();
       for (const account of accounts) {
         const application = await applications.findOne(
           { email: account.email, status: "approved" },
           { sort: { decidedAt: -1 } },
         );
         if (!application) orphans.push(account.email);
         const partnerId = await companyFor(
           db,
           application
             ? {
                 sourceId: application._id,
                 applicationId: application._id,
                 name: application.company || application.name,
                 contactName: application.name,
                 contactEmail: application.email,
                 contactPhone: application.phone ?? "",
               }
             : {
                 sourceId: account._id,
                 applicationId: null,
                 name: account.displayName,
                 contactName: account.displayName,
                 contactEmail: account.email,
                 contactPhone: account.phone ?? "",
               },
           now,
         );
         await users.updateOne({ _id: account._id }, { $set: { partnerId, partnerRole: "main", updatedAt: now } });
         await db
           .collection<CompanyRow>(COLLECTIONS.partners)
           .updateOne({ _id: partnerId, mainUserId: null }, { $set: { mainUserId: account._id } });
         await db
           .collection(COLLECTIONS.properties)
           .updateMany({ agentUserId: account._id, partnerId: null }, { $set: { partnerId } });
         await db
           .collection(COLLECTIONS.images)
           .updateMany({ uploadedBy: account._id, partnerId: null }, { $set: { partnerId } });
       }

       const open = await invites
         .find({ role: "partner", partnerId: null, acceptedAt: null, expiresAt: { $gt: now } }, { projection: { _id: 1, email: 1 } })
         .toArray();
       for (const invite of open) {
         const application = await applications.findOne(
           { email: invite.email, status: "approved" },
           { sort: { decidedAt: -1 } },
         );
         if (!application) orphans.push(invite.email);
         const partnerId = await companyFor(
           db,
           application
             ? {
                 sourceId: application._id,
                 applicationId: application._id,
                 name: application.company || application.name,
                 contactName: application.name,
                 contactEmail: application.email,
                 contactPhone: application.phone ?? "",
               }
             : {
                 sourceId: invite._id,
                 applicationId: null,
                 name: invite.email,
                 contactName: "",
                 contactEmail: invite.email,
                 contactPhone: "",
               },
           now,
         );
         await invites.updateOne({ _id: invite._id }, { $set: { partnerId, partnerRole: "main" } });
       }

       console.log(
         `${accounts.length} partner ${accounts.length === 1 ? "account is" : "accounts are"} now the main account of a company, and ${open.length} open ${open.length === 1 ? "invite has" : "invites have"} a company to join.`,
       );
       if (orphans.length > 0) {
         console.log(`No application matched these, so each company is named after the address: ${orphans.join(", ")}.`);
       }

       await ensureCollection(db, COLLECTIONS.users, usersValidator());
       await ensureIndex(db, COLLECTIONS.users, { partnerId: 1 }, { name: "users_partner" });
       await ensureCollection(db, COLLECTIONS.invites, invitesValidator());
       await ensureIndex(db, COLLECTIONS.invites, { partnerId: 1, acceptedAt: 1 }, { name: "invites_partner" });
       await ensureCollection(db, COLLECTIONS.properties, propertiesValidator());
       await ensureIndex(db, COLLECTIONS.properties, { partnerId: 1, status: 1 }, { name: "properties_partner" });
       await ensureIndex(db, COLLECTIONS.images, { partnerId: 1, createdAt: -1, _id: -1 }, { name: "images_partner" });
     },
   };

   // TODO(test): a partner account with an approved application becomes main of
   // the company derived from it, twice run makes one company, and its listings
   // and images take the company.

Step 3: register, gates, the demo database, commit
--------------------------------------------------

Append ``migration0017`` to ``index.ts``. Run the three gates, then the
migration against the demo database, ``--dry`` first. The runner reads the
indexes back off the server; confirm ``partners_application``,
``partners_status``, ``users_partner``, ``invites_partner``,
``properties_partner`` and ``images_partner`` are listed.

.. code-block:: bash

   git add packages/db/src/migrations
   git commit -m "feat(db): partner companies, and every partner that exists becomes one"

--------------------------------------------------------------------------------

Task 5: the doors know the company
==================================

Files
  Modify ``packages/identity/src/admit.ts``, ``routes/doors.ts``,
  ``routes/applications.ts``, ``packages/marketing/src/routes.ts``.

Consumes
  ``createInvite``, ``createUser``, ``upsertPartnerForApplication``,
  ``setPartnerMain``, ``isSuspendedPartner`` (task 3).

Step 1: ``admit()`` refuses a suspended company and fills a seat
---------------------------------------------------------------

``admit.ts`` and ``routes/doors.ts`` both import ``isSuspendedPartner`` and
``setPartnerMain`` from ``repo/partners``.

.. code-block:: ts

   export type AdmitRefusal = "not_invited" | "disabled" | "suspended";

In ``admit``, the ``if (found)`` line becomes:

.. code-block:: ts

     if (found) {
       if (await isSuspendedPartner(db, found.user.partnerId)) return { ok: false, reason: "suspended" };
       return { ok: true, user: found.user };
     }

After ``claimInvite`` returns an invite:

.. code-block:: ts

     if (await isSuspendedPartner(db, invite.partnerId ?? null)) {
       if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
       return { ok: false, reason: "suspended" };
     }

``createUser`` takes the seat, and a main seat names its holder on the company:

.. code-block:: ts

       const user = await createUser(db, {
         email: address,
         displayName,
         role: invite.role,
         partnerId: invite.partnerId ?? null,
         partnerRole: invite.partnerRole ?? null,
       });
       if (invite.partnerId && invite.partnerRole === "main") await setPartnerMain(db, invite.partnerId, user.id);
       return { ok: true, user };

``refusalBody``'s detail gains the third case:

.. code-block:: ts

       reason === "disabled"
         ? "This account has been disabled. Ask an owner to re-enable it."
         : reason === "suspended"
           ? "Your company's access to AV Homes is suspended. Contact AV Homes."
           : "This address has not been invited. Ask an owner or developer for an invite.",

Step 2: the password door, in ``routes/doors.ts``
------------------------------------------------

In ``/auth/password/login``, AFTER the password is verified, so a wrong
password learns nothing about the company:

.. code-block:: ts

     if (await isSuspendedPartner(db, found.user.partnerId)) {
       return c.json({ ...refusalBody("suspended"), requestId: c.get("requestId") }, 403);
     }

In ``/auth/password/claim``, after ``claimInvite`` returns the invite:

.. code-block:: ts

     if (await isSuspendedPartner(db, invite.partnerId ?? null)) {
       if (invite.acceptedAt != null) await releaseInvite(db, invite._id, invite.acceptedAt);
       return c.json({ ...refusalBody("suspended"), requestId: c.get("requestId") }, 403);
     }

and its ``createUser`` call and the line after it match ``admit``'s: pass
``partnerId`` and ``partnerRole`` from the invite, then ``setPartnerMain`` for a
main seat.

Step 3: approval makes the company first, in ``routes/applications.ts``
----------------------------------------------------------------------

Replace the ``createInvite`` call in the approve path with:

.. code-block:: ts

       /* The company before the invite: the invite carries its id, and the upsert
          means a retry after a failure finds the company rather than making one. */
       const partner = await upsertPartnerForApplication(db, {
         applicationId: application.id,
         name: application.company || application.name,
         contactName: application.name,
         contactEmail: application.email,
         contactPhone: application.phone,
       });
       const invite = await createInvite(db, {
         email: application.email,
         role: "partner",
         invitedBy: actor.id,
         partnerId: partner.id,
         partnerRole: "main",
       });

and add ``partnerId: partner.id`` to the approve response, so the applications
screen can link to the partner's page.

Step 4: the marketer app's door refuses partner accounts
--------------------------------------------------------

In ``packages/marketing/src/routes.ts``, ``/public/marketing/sign-in`` signs in
any account with a password, and the cookie it sets opens the console. After the
password is verified and before ``createSession``:

.. code-block:: ts

       // A partner has no app here, and this cookie would open the console past a suspension.
       if (isScopedRole(found.user.role)) {
         throw new ForbiddenError("partner accounts sign in at /admin/sign-in");
       }

Step 5: gates and commit
------------------------

.. code-block:: bash

   git add packages/identity/src/admit.ts packages/identity/src/routes/doors.ts packages/identity/src/routes/applications.ts packages/marketing/src/routes.ts
   git commit -m "feat(identity): an invite fills a seat in a company, and a suspended one cannot sign in"

--------------------------------------------------------------------------------

Task 6: scope by company
========================

Files
  Modify ``packages/listings/src/authorize.ts``, ``repo.ts``,
  ``routes/admin.ts``, ``packages/media/src/routes.ts``,
  ``packages/api/src/analytics.ts``.

Consumes
  ``partnerScopeOf`` (task 2), ``Property.partnerId``.

Step 1: ``authorize.ts``
------------------------

.. code-block:: ts

   import { ForbiddenError } from "@avhomes/core";
   import { isAdminRole, partnerScopeOf, type AuthUser } from "@avhomes/contracts";

   export function authorize(
     listing: { agentUserId: string | null; partnerId: string | null },
     user: AuthUser,
     action: Action,
   ): boolean {
     if (action === "destroy") return isAdminRole(user.role);
     const scope = partnerScopeOf(user);
     if (action === "status") return scope === null;
     // A partner reads and writes its company's listings, and nothing else.
     if (scope !== null) return listing.partnerId === scope;
     if (action === "read") return true;
     if (listing.agentUserId === null) return isAdminRole(user.role);
     return listing.agentUserId === user.id || isAdminRole(user.role);
   }

   export function scopeFilter(user: AuthUser): Record<string, unknown> {
     const scope = partnerScopeOf(user);
     return scope === null ? {} : { partnerId: scope };
   }

``assertAuthorized`` takes the same widened ``listing`` type. Update the header
comment's four rules: read and write are "the company's own" for a scoped role.

Step 2: the list and the create, in ``repo.ts`` and ``routes/admin.ts``
----------------------------------------------------------------------

``ListQuery`` gains ``partnerId?: string | undefined;`` and ``buildFilter``
gains, beside the ``agentUserId`` line:

.. code-block:: ts

     if (query.partnerId) and.push({ partnerId: query.partnerId });

``CreatePropertyArgs`` gains ``partnerId?: string | null;`` and
``createProperty``'s document ``partnerId: args.partnerId ?? null,``.

In the list route, the scope pin moves to the company:

.. code-block:: ts

       const scope = partnerScopeOf(user);
       // ...in the query object:
       partnerId: scope ?? undefined,
       agentUserId: scope === null && q.mine === "1" ? user.id : undefined,

In the create route:

.. code-block:: ts

       const scope = partnerScopeOf(user);
       // ...in createProperty's args:
       ownership: scope !== null ? "partner" : "av",
       partnerId: scope,

Step 3: the library by company, in ``packages/media/src/routes.ts``
------------------------------------------------------------------

Import ``partnerScopeOf`` and ``type Role`` from ``@avhomes/contracts``, and drop
``isScopedRole`` from that import only if the quota-request route no longer uses
it (it does, so it stays).

.. code-block:: ts

   /**
    * The rows this caller may see and touch: all of them, or its company's.
    *
    * By company rather than by uploader, so a partner's staff share one library.
    * Merged into the query, so another company's id is simply not found.
    */
   function ownedBy(user: { role: Role; partnerId: string | null }): Partial<ImageDoc> {
     const scope = partnerScopeOf(user);
     return scope === null ? {} : { partnerId: scope };
   }

The upload's ``ImageDoc`` gains ``partnerId: partnerScopeOf(user),`` after
``uploadedBy``.

Step 4: ``scopeFor``, in ``packages/api/src/analytics.ts``
---------------------------------------------------------

.. code-block:: ts

   async function scopeFor(db: Db, user: ReturnType<typeof currentUser>): Promise<Scope> {
     const scope = partnerScopeOf(user);
     if (scope === null) {
       return { listingIds: null, money: hasDomain(user.role, "marketing"), partner: false };
     }
     const rows = await collection<{ _id: string }>(db, COLLECTIONS.properties)
       .find({ partnerId: scope }, { projection: { _id: 1 } })
       .toArray();
     return { listingIds: rows.map((row) => row._id), money: true, partner: true };
   }

Drop the ``isScopedRole`` import if nothing else there uses it.

Step 5: gates and commit
------------------------

``getPropertyById`` returns a ``Property``, which now carries ``partnerId``, so
the history port in ``app.ts`` needs no change. Run the three gates.

.. code-block:: bash

   git add packages/listings/src packages/media/src/routes.ts packages/api/src/analytics.ts
   git commit -m "feat(partners): a partner's staff see the company's listings, photographs and numbers"

--------------------------------------------------------------------------------

Task 7: the listing limits
==========================

Files
  Modify ``packages/listings/src/repo.ts``, ``routes/admin.ts``,
  ``packages/listings/src/index.ts``.

Consumes
  ``limitsForPartner`` (task 3), ``limitRefusal``, ``REVIEW_LIMIT_STATUSES``,
  ``LIVE_LIMIT_STATUSES`` (task 2).

Produces
  ``partnerListingUsage(db, partnerIds)``, exported for task 9's port.

Step 1: usage, in ``repo.ts``
-----------------------------

.. code-block:: ts

   /** How much of each listing limit each company is using, trash excluded. Counted, never stored. */
   export async function partnerListingUsage(
     db: Db,
     partnerIds: readonly string[],
   ): Promise<Map<string, { review: number; live: number }>> {
     const out = new Map(partnerIds.map((id) => [id, { review: 0, live: 0 }]));
     if (partnerIds.length === 0) return out;
     const rows = await properties(db)
       .aggregate<{ _id: { partnerId: string; status: PropertyStatus }; count: number }>([
         {
           $match: {
             partnerId: { $in: [...partnerIds] },
             deletedAt: null,
             status: { $in: [...REVIEW_LIMIT_STATUSES, ...LIVE_LIMIT_STATUSES] },
           },
         },
         { $group: { _id: { partnerId: "$partnerId", status: "$status" }, count: { $sum: 1 } } },
       ])
       .toArray();
     for (const row of rows) {
       const entry = out.get(row._id.partnerId);
       if (!entry) continue;
       if (REVIEW_LIMIT_STATUSES.includes(row._id.status)) entry.review += row.count;
       else entry.live += row.count;
     }
     return out;
   }

Step 2: the one check, in ``routes/admin.ts``
---------------------------------------------

New imports: ``limitsForPartner`` from ``@avhomes/identity``, ``limitRefusal``
and ``partnerScopeOf`` from ``@avhomes/contracts``, ``partnerListingUsage`` from
``../repo``, and ``type Db`` from ``@avhomes/db``.

.. code-block:: ts

   /**
    * Refuses when a company has no room left under one listing limit.
    *
    * Counted at the moment of the action. Two actions in the same instant can
    * each see room for one more; the overshoot is at most the company's headcount,
    * and these are commercial caps, so a counter that drifts would be worse.
    */
   async function assertRoom(
     db: Db,
     partnerId: string,
     limit: "review" | "live",
     audience: "partner" | "av",
   ): Promise<void> {
     const found = await limitsForPartner(db, partnerId);
     if (!found) throw new NotFoundError(`partner ${partnerId}`);
     const usage = (await partnerListingUsage(db, [partnerId])).get(partnerId) ?? { review: 0, live: 0 };
     const count = usage[limit];
     const max = found.limits[limit];
     if (count >= max) {
       throw new PreconditionFailedError("limit_reached", {
         limit,
         count,
         max,
         detail: limitRefusal(limit, count, max, audience),
       });
     }
   }

Step 3: the four places it runs
-------------------------------

In the create route, for a scoped caller, before ``createProperty``:

.. code-block:: ts

       if (scope !== null) await assertRoom(db, scope, "review", "partner");

In the lifecycle route, after ``assertTransition(current, operation)``:

.. code-block:: ts

     /* A partner's listing going on the market needs room under the live limit:
        on submission, so the partner hears it before anyone at AV Homes does; on
        publish, which is AV Homes approving it; on relisting a sold one. */
     if (current.partnerId !== null) {
       const who = isScopedCaller(currentUser(c)) ? "partner" : "av";
       if (operation === "submit") await assertRoom(db, current.partnerId, "live", who);
       if (operation === "publish") await assertRoom(db, current.partnerId, "live", "av");
       if (operation === "relist" && current.status === "closed") {
         await assertRoom(db, current.partnerId, "live", "av");
       }
     }

A relist from ``under-offer`` changes no count, so it is not checked. The
review-limit checks on a partner's unarchive and restore arrive in pass two with
those two ops, because until then a partner cannot run either.

Step 4: exports, gates, commit
------------------------------

Export ``partnerListingUsage`` from ``packages/listings/src/index.ts``.

.. code-block:: bash

   git add packages/listings/src
   git commit -m "feat(listings): a partner lists inside the limits AV Homes sets"

--------------------------------------------------------------------------------

Task 8: one definition of public, and the holds
===============================================

Files
  Modify ``packages/listings/src/repo.ts``, ``packages/listings/src/index.ts``.

Produces
  ``setPartnerHold(db, partnerId, held)`` and ``reassignPartnerListings(db,
  input)``, exported for task 9's ports.

Step 1: ``publicVisible``
-------------------------

.. code-block:: ts

   /**
    * What the public site may show: a public status, not in the trash, not held.
    *
    * One definition, used by all three public reads. It was three copies, and a
    * condition added to three copies is how the third copy misses it.
    */
   function publicVisible(status?: PropertyStatus): Filter<PropertyDoc> {
     return {
       status: status ?? { $in: [...PUBLIC_PROPERTY_STATUSES] },
       deletedAt: null,
       partnerHold: { $ne: true },
     } as Filter<PropertyDoc>;
   }

In ``buildFilter``'s public branch, the two ``and.push`` lines become
``and.push(publicVisible(query.status));``. ``getPropertyBySlug`` uses
``const visible = publicVisible();``. ``getSimilarProperties``' filter becomes
``{ _id: { $ne: current.id }, ...publicVisible(), $or: [...] }``.

Step 2: the hold
----------------

.. code-block:: ts

   /**
    * Takes a suspended company's listings off the public site, or puts them back.
    *
    * Status, featuring and revision are left alone, so reinstating shows exactly
    * what was there, and an open editor does not lose its save to a 409.
    */
   export async function setPartnerHold(db: Db, partnerId: string, held: boolean): Promise<number> {
     const result = await properties(db).updateMany(
       { partnerId },
       held ? { $set: { partnerHold: true } } : { $unset: { partnerHold: "" } },
     );
     return result.modifiedCount;
   }

Step 3: a departed account's listings
-------------------------------------

.. code-block:: ts

   /**
    * A partner account that leaves hands its listings to the company's main
    * account: the record, and the contact card wherever the card was theirs.
    *
    * The card changes without review, the one content change that does, because a
    * departed employee's number on a live listing sends buyers to nobody.
    */
   export async function reassignPartnerListings(
     db: Db,
     input: { partnerId: string; fromUserId: string; to: Agent },
   ): Promise<number> {
     const now = Date.now();
     const [owned, cards] = await Promise.all([
       properties(db).updateMany(
         { partnerId: input.partnerId, agentUserId: input.fromUserId },
         { $set: { agentUserId: input.to.id, updatedAt: now }, $inc: { revision: 1 } },
       ),
       properties(db).updateMany(
         { partnerId: input.partnerId, "agent.id": input.fromUserId },
         { $set: { agent: input.to, updatedAt: now }, $inc: { revision: 1 } },
       ),
     ]);
     return Math.max(owned.modifiedCount, cards.modifiedCount);
   }

Import ``Agent`` from contracts.

Step 4: exports, gates, commit
------------------------------

Export ``setPartnerHold`` and ``reassignPartnerListings``. Check every other
public read of ``properties`` still goes through ``listProperties``,
``getPropertyBySlug`` or ``getSimilarProperties``:

.. code-block:: bash

   git grep -n "PUBLIC_PROPERTY_STATUSES" -- packages src

Any direct use outside ``publicVisible`` and the admin rules is a fourth copy:
move it onto ``publicVisible``. Then the three gates.

.. code-block:: bash

   git add packages/listings/src
   git commit -m "feat(listings): one rule for what is public, and a hold that keeps a suspended partner off it"

--------------------------------------------------------------------------------

Task 9: the Partners API
========================

Files
  Create ``packages/identity/src/partner-accounts.ts``,
  ``packages/identity/src/routes/partners.ts``. Modify
  ``packages/identity/src/middleware.ts``, ``packages/identity/src/index.ts``,
  ``packages/api/src/app.ts``.

Consumes
  Tasks 3, 7 and 8.

Produces
  ``partnerAdminRoutes(deps)``, ``PartnerPorts``, ``offboardPartnerAccount``,
  ``agentCardOf``.

Step 1: the ports and taking one account out, in ``partner-accounts.ts``
-----------------------------------------------------------------------

.. code-block:: ts

   import type { Db } from "@avhomes/db";
   import type { Agent, AuthUser, Partner } from "@avhomes/contracts";
   import { disableUser, findUserById } from "./repo/users";
   import { endAllSessions } from "./repo/sessions";

   /** What identity needs from listings, injected at packages/api. */
   export interface PartnerPorts {
     listingUsage: (db: Db, partnerIds: readonly string[]) => Promise<Map<string, { review: number; live: number }>>;
     holdListings: (db: Db, partnerId: string, held: boolean) => Promise<number>;
     reassignListings: (db: Db, input: { partnerId: string; fromUserId: string; to: Agent }) => Promise<number>;
   }

   /** The contact card an account would put on a listing. */
   export function agentCardOf(user: AuthUser): Agent {
     return {
       id: user.id,
       name: user.displayName,
       role: user.title || "Sales agent",
       phone: user.phone,
       email: user.email,
       avatarUrl: user.avatarUrl,
     };
   }

   /**
    * Takes one staff account out of a company: disabled, every session ended,
    * then its listings and cards handed to the main account.
    *
    * In that order, like the team screen's disable: the account is safe before
    * the slow bulk update runs.
    */
   export async function offboardPartnerAccount(
     db: Db,
     partner: Partner,
     userId: string,
     reassign: PartnerPorts["reassignListings"],
   ): Promise<{ sessionsEnded: number; listingsMoved: number }> {
     await disableUser(db, userId);
     const sessionsEnded = await endAllSessions(db, userId);
     const main = partner.mainUserId ? await findUserById(db, partner.mainUserId) : null;
     const listingsMoved = main
       ? await reassign(db, { partnerId: partner.id, fromUserId: userId, to: agentCardOf(main.user) })
       : 0;
     return { sessionsEnded, listingsMoved };
   }

Step 2: ``routes/partners.ts``
------------------------------

.. code-block:: ts

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
   import { enableUser, findUserById, setPartnerRole } from "../repo/users";
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
       if (partner.mainUserId && partner.mainUserId !== userId) await setPartnerRole(db, partner.mainUserId, "staff");
       await setPartnerRole(db, userId, "main");
       await setPartnerMain(db, id, userId);
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
       if (!target || target.user.partnerId !== id) throw new NotFoundError(`account ${userId}`);
       auditBefore(c, target as unknown as Record<string, unknown>);
       if (target.user.partnerRole === "main") {
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
       if (!target || target.user.partnerId !== id) throw new NotFoundError(`account ${userId}`);
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

Step 3: the domain gate, in ``middleware.ts``
---------------------------------------------

Above ``{ prefix: "/api/admin/analytics", ... }``:

.. code-block:: ts

     /* A partner company's page and the default limits. `team`, beside the
        applications: deciding who a company is and what it may ask for is the
        same job as deciding who gets an account. */
     { prefix: "/api/admin/partners", domain: "team" },
     { prefix: "/api/admin/partner-settings", domain: "team" },
     /* SELF-GATING, like tutorials: every route under it reads or writes only the
        caller's own company and refuses an account with none. ANY route added
        under /api/admin/company must only ever touch the caller's company. */
     { prefix: "/api/admin/company", domain: null, subtree: true },

``/api/admin/partner-settings`` does not start with ``/api/admin/partners``, so
the two rules cannot shadow each other.

Step 4: wire it, in ``packages/api/src/app.ts``
----------------------------------------------

.. code-block:: ts

   import { partnerAdminRoutes } from "@avhomes/identity";
   import { partnerListingUsage, reassignPartnerListings, setPartnerHold } from "@avhomes/listings";

   // in createApp, beside marketingPorts:
   /* identity -> listings: what a company is using, holding its listings off the
      site, and handing a departed account's listings to its main account. */
   const partnerPorts = {
     listingUsage: partnerListingUsage,
     holdListings: setPartnerHold,
     reassignListings: reassignPartnerListings,
   };

   // after applicationAdminRoutes:
   app.route(API_PREFIX, partnerAdminRoutes({ mailer, ...partnerPorts }));

Export ``partnerAdminRoutes``, ``offboardPartnerAccount``, ``agentCardOf`` and
``type PartnerPorts`` from ``packages/identity/src/index.ts``.

Step 5: gates and commit
------------------------

.. code-block:: bash

   git add packages/identity/src packages/api/src/app.ts
   git commit -m "feat(partners): AV Homes sees each company's team and can act on it"

--------------------------------------------------------------------------------

Task 10: the partner's own Company API
======================================

Files
  Create ``packages/identity/src/routes/company.ts``. Modify
  ``packages/identity/src/index.ts``, ``packages/api/src/app.ts``.

Consumes
  Tasks 3 and 9.

Produces
  ``companyRoutes(deps)``.

Step 1: ``routes/company.ts``
-----------------------------

.. code-block:: ts

   import { Hono, type MiddlewareHandler } from "hono";
   import { z } from "zod";
   import {
     NO_PARTNER,
     effectiveLimits,
     limitRefusal,
     partnerScopeOf,
     type CompanyView,
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

   function requireMain(c: Parameters<typeof currentUser>[0]): void {
     if (currentUser(c).partnerRole !== "main") {
       throw new PreconditionFailedError("main_only", { detail: "Only your company's main account can do this." });
     }
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
       viewer: { userId: user.id, partnerRole: user.partnerRole ?? "staff" },
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
       requireMain(c);
       const db = await currentDb(c);
       const id = currentUser(c).partnerId as string;
       const body = await readJson(c, ContactBody);
       const before = await findPartner(db, id);
       if (!before) throw new NotFoundError(`partner ${id}`);
       auditBefore(c, before as unknown as Record<string, unknown>);
       await updatePartner(
         db,
         id,
         { contactName: body.contactName, contactEmail: body.contactEmail, contactPhone: body.contactPhone },
         body.baseRevision,
       );
       auditEntityId(c, id);
       return c.json(await viewFor(db, c, deps));
     });

     routes.post("/admin/company/staff/invites", requireAuth(), requireCompany(), async (c) => {
       requireMain(c);
       const db = await currentDb(c);
       const actor = currentUser(c);
       const id = actor.partnerId as string;
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
         partnerId: id,
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
       requireMain(c);
       const db = await currentDb(c);
       const removed = await revokePartnerInvite(db, currentUser(c).partnerId as string, pathParam(c, "inviteId"));
       if (!removed) throw new NotFoundError(pathParam(c, "inviteId"));
       return c.json(await viewFor(db, c, deps));
     });

     routes.post("/admin/company/staff/:userId/remove", requireAuth(), requireCompany(), async (c) => {
       requireMain(c);
       const db = await currentDb(c);
       const id = currentUser(c).partnerId as string;
       const userId = pathParam(c, "userId");
       const partner = await findPartner(db, id);
       if (!partner) throw new NotFoundError(`partner ${id}`);
       const target = await findUserById(db, userId);
       // Another company's account is simply not found.
       if (!target || target.user.partnerId !== id) throw new NotFoundError(`account ${userId}`);
       if (target.user.partnerRole === "main") {
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

``updatePartner`` receives ``undefined`` for a field left out of the body and
skips it, so the patch stays field by field.

Step 2: wire and export
-----------------------

Export ``companyRoutes`` from ``packages/identity/src/index.ts``. In ``app.ts``,
after ``partnerAdminRoutes``:

.. code-block:: ts

   app.route(API_PREFIX, companyRoutes({ mailer, ...partnerPorts }));

Step 3: gates and commit
------------------------

.. code-block:: bash

   git add packages/identity/src packages/api/src/app.ts
   git commit -m "feat(partners): a company's main account adds and removes its own staff"

--------------------------------------------------------------------------------

Task 11: the Team screen is AV Homes' own
=========================================

Files
  Modify ``packages/identity/src/repo/users.ts``,
  ``packages/identity/src/routes/team.ts``.

Step 1: the list, in ``users.ts``
---------------------------------

.. code-block:: ts

     const filter = scope === "console" ? { role: { $nin: ["marketer", "partner"] as Role[] } } : {};

and the ``UserScope`` comment says ``console`` is AV Homes' own people, with
marketers and partner accounts in ``all`` for the audit trail's actor picker.

Step 2: the refusals, in ``team.ts``
------------------------------------

The ``Refusal`` union loses ``"role_partner"`` and gains ``"manage_partner"``:

.. code-block:: ts

     manage_partner:
       "This is a partner company's account. Manage it on that partner's page under Partners.",

``refuseIfMarketer`` becomes:

.. code-block:: ts

   /**
    * Only AV Homes' own people are managed here.
    *
    * A marketer's account is the whole of their app, and a partner's belongs to
    * their company, managed on its page under Partners. Refused by role, so a
    * row the list no longer shows cannot be reached by id either.
    */
   function refuseIfNotTeam(target: FoundUser, userId: string): void {
     if (target.user.role === "marketer") refuse("manage_marketer", userId);
     if (target.user.role === "partner") refuse("manage_partner", userId);
   }

and every call site uses it. The role route's ``isScopedRole`` block is deleted:
``refuseIfNotTeam`` refuses a partner before it is reached. Drop the
``isScopedRole`` import if nothing else uses it.

``DELETE /admin/invites/:id`` calls ``revokeTeamInvite``, so a partner invite is
not found from here.

Step 3: gates and commit
------------------------

.. code-block:: bash

   git add packages/identity/src/repo/users.ts packages/identity/src/routes/team.ts
   git commit -m "feat(team): the Team screen is AV Homes' own people, and partners are managed on their page"

--------------------------------------------------------------------------------

Task 12: the Partners section
=============================

Files
  Move ``src/app/admin/partners/page.tsx`` to
  ``src/app/admin/partners/applications/page.tsx``. Create
  ``src/app/admin/partners/page.tsx``, ``src/app/admin/partners/[id]/page.tsx``,
  ``src/app/admin/partners/settings/page.tsx``,
  ``src/app/admin/partners/layout.tsx``. Modify
  ``src/components/admin/nav.tsx``, ``packages/contracts/src/site-health.ts``.

Consumes
  The routes of tasks 9 and 5 (``partnerId`` on the approve response).

Step 1: the rail
----------------

Delete the "Partner applications" child from Team. Add ``Building2`` to the
``lucide-react`` import and, before the Team row:

.. code-block:: ts

     {
       href: "/admin/partners",
       label: "Partners",
       hint: "Companies listing their own property, their teams and limits",
       icon: Building2,
       domain: "team",
       unscoped: true,
       children: [
         {
           href: "/admin/partners/applications",
           label: "Applications",
           hint: "People asking to list their own property",
           icon: UserRoundSearch,
           domain: "team",
         },
         {
           href: "/admin/partners/settings",
           label: "Settings",
           hint: "The limits every partner starts with",
           icon: SlidersHorizontal,
           domain: "team",
         },
       ],
     },

In ``site-health.ts`` the applications alert's action ``href`` becomes
``/admin/partners/applications``.

Step 2: the section's tab title, ``partners/layout.tsx``
-------------------------------------------------------

.. code-block:: tsx

   import type { Metadata } from "next";
   import type { ReactNode } from "react";

   export const metadata: Metadata = { title: "Partners" };

   export default function PartnersLayout({ children }: { children: ReactNode }) {
     return children;
   }

Step 3: applications, moved
---------------------------

.. code-block:: bash

   mkdir -p src/app/admin/partners/applications
   git mv src/app/admin/partners/page.tsx src/app/admin/partners/applications/page.tsx

In the moved file: the ``PageHeader`` title becomes "Applications", the
``decide`` call reads ``{ url: string | null; partnerId?: string }``, and after
an approval the card shows, beside the sign-in link:

.. code-block:: tsx

   <ButtonLink href={`/admin/partners/${partnerId}`} variant="ghost" size="sm">
     Open the partner
   </ButtonLink>

``onDecided`` carries ``partnerId`` up alongside ``url`` for that.

Step 4: the list, ``partners/page.tsx``
---------------------------------------

.. code-block:: tsx

   "use client";

   import Link from "next/link";
   import { Building2 } from "lucide-react";
   import {
     PARTNER_LIMIT_KEYS,
     PARTNER_LIMIT_LABEL,
     PARTNER_STATUS_LABEL,
     type PartnerRow,
     type PartnerSettings,
   } from "@avhomes/contracts";
   import { api } from "@/lib/admin/client";
   import { useAsync } from "@/lib/admin/hooks";
   import { Badge, ButtonLink, Card, EmptyState, ErrorNote, PageHeader, Skeleton } from "@/components/admin/ui";

   interface Response {
     items: PartnerRow[];
     settings: PartnerSettings;
   }

   /** Every partner company, and what each is using of its limits. */
   export default function PartnersPage() {
     const state = useAsync((signal) => api.get<Response>("/admin/partners", signal), []);
     const rows = state.data?.items ?? [];

     return (
       <>
         <PageHeader
           icon={Building2}
           title="Partners"
           subtitle="Companies listing their own property with AV Homes."
         />
         {state.error && (
           <div className="mb-4">
             <ErrorNote error={state.error} onRetry={state.reload} />
           </div>
         )}
         {state.loading && rows.length === 0 ? (
           <div className="space-y-2">
             <Skeleton className="h-20" />
             <Skeleton className="h-20" />
           </div>
         ) : rows.length === 0 ? (
           <EmptyState
             title="No partners yet"
             hint="Approving an application makes the first one."
             action={<ButtonLink href="/admin/partners/applications">Applications</ButtonLink>}
           />
         ) : (
           <div className="space-y-2">
             {rows.map((row) => (
               <Link key={row.partner.id} href={`/admin/partners/${row.partner.id}`} className="block">
                 <Card>
                   <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                     <h2 className="min-w-0 text-[14px] font-semibold text-plum-950">{row.partner.name}</h2>
                     <Badge tone={row.partner.status === "active" ? "green" : "red"}>
                       {PARTNER_STATUS_LABEL[row.partner.status]}
                     </Badge>
                     <span className="ml-auto text-[12px] text-slate-600">
                       {row.accounts} {row.accounts === 1 ? "account" : "accounts"}
                     </span>
                   </div>
                   <p className="mt-1.5 text-[12px] text-slate-600">
                     {PARTNER_LIMIT_KEYS.map(
                       (key) => `${PARTNER_LIMIT_LABEL[key]}: ${row.usage[key]} of ${row.limits[key]}`,
                     ).join(" · ")}
                   </p>
                 </Card>
               </Link>
             ))}
           </div>
         )}
       </>
     );
   }

Step 5: one partner, ``partners/[id]/page.tsx``
----------------------------------------------

Four cards, each acting on the same ``PartnerDetail``: every action answers
with the new detail, which the page adopts, so there is no second read.

.. code-block:: tsx

   "use client";

   import { useState } from "react";
   import { useParams } from "next/navigation";
   import { Building2 } from "lucide-react";
   import {
     PARTNER_LIMIT_HINT,
     PARTNER_LIMIT_KEYS,
     PARTNER_LIMIT_LABEL,
     PARTNER_STATUS_LABEL,
     type PartnerAccount,
     type PartnerDetail,
     type PartnerLimitKey,
   } from "@avhomes/contracts";
   import { api, type ApiError } from "@/lib/admin/client";
   import { useAsync } from "@/lib/admin/hooks";
   import { relative } from "@/lib/admin/format";
   import { toApiError } from "@/lib/admin/marketing";
   import {
     Badge,
     Button,
     Card,
     CardHead,
     ConfirmButton,
     ErrorNote,
     Field,
     PageHeader,
     Skeleton,
     inputClass,
   } from "@/components/admin/ui";

   /** One partner company: its limits, its team and every action on it. */
   export default function PartnerPage() {
     const { id } = useParams<{ id: string }>();
     const state = useAsync((signal) => api.get<PartnerDetail>(`/admin/partners/${id}`, signal), [id]);
     const [detail, setDetail] = useState<PartnerDetail | null>(null);
     const current = detail ?? state.data ?? null;

     if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
     if (!current) return <Skeleton className="h-64" />;

     return (
       <>
         <PageHeader
           icon={Building2}
           title={current.partner.name}
           backTo="/admin/partners"
           backLabel="Partners"
           badge={
             <Badge tone={current.partner.status === "active" ? "green" : "red"}>
               {PARTNER_STATUS_LABEL[current.partner.status]}
             </Badge>
           }
         />
         <div className="space-y-3">
           <TeamCard detail={current} onChanged={setDetail} />
           <LimitsCard detail={current} onChanged={setDetail} />
           <NameCard detail={current} onChanged={setDetail} />
           <AccessCard detail={current} onChanged={setDetail} />
         </div>
       </>
     );
   }

   type Changed = (next: PartnerDetail) => void;

   /** Runs one action, holding its error and its busy flag. */
   function useAction(onChanged: Changed) {
     const [busy, setBusy] = useState<string | null>(null);
     const [error, setError] = useState<ApiError | null>(null);
     async function run(key: string, call: () => Promise<PartnerDetail>) {
       setBusy(key);
       setError(null);
       try {
         onChanged(await call());
       } catch (err) {
         setError(toApiError(err));
       } finally {
         setBusy(null);
       }
     }
     return { busy, error, run };
   }

   function TeamCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
     const { busy, error, run } = useAction(onChanged);
     const base = `/admin/partners/${detail.partner.id}`;
     return (
       <Card>
         <CardHead title="Team" />
         {error && (
           <div className="mb-2">
             <ErrorNote error={error} />
           </div>
         )}
         <ul className="divide-y divide-mist-100">
           {detail.accounts.map((account: PartnerAccount) => (
             <li key={account.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
               <span className="min-w-0 text-[13px] font-medium text-plum-950">{account.displayName}</span>
               <span className="min-w-0 break-all text-[12px] text-slate-600">{account.email}</span>
               <Badge tone={account.partnerRole === "main" ? "wine" : "neutral"}>
                 {account.partnerRole === "main" ? "Main" : "Staff"}
               </Badge>
               {account.disabledAt !== null && <Badge tone="red">Disabled</Badge>}
               <span className="text-[11px] text-slate-550">
                 {account.lastActiveAt ? `Active ${relative(account.lastActiveAt)}` : "Never signed in"}
               </span>
               <span className="ml-auto flex gap-1.5">
                 {account.partnerRole === "staff" && account.disabledAt === null && (
                   <Button
                     size="sm"
                     variant="ghost"
                     disabled={busy !== null}
                     onClick={() =>
                       void run(`main:${account.id}`, () =>
                         api.post<PartnerDetail>(`${base}/main`, { userId: account.id }),
                       )
                     }
                   >
                     Make main
                   </Button>
                 )}
                 {account.partnerRole === "staff" &&
                   (account.disabledAt === null ? (
                     <ConfirmButton
                       size="sm"
                       confirmLabel="Yes, disable"
                       disabled={busy !== null}
                       onConfirm={() =>
                         void run(`off:${account.id}`, () =>
                           api.post<PartnerDetail>(`${base}/accounts/${account.id}/disable`),
                         )
                       }
                     >
                       Disable
                     </ConfirmButton>
                   ) : (
                     <Button
                       size="sm"
                       variant="ghost"
                       disabled={busy !== null}
                       onClick={() =>
                         void run(`on:${account.id}`, () =>
                           api.post<PartnerDetail>(`${base}/accounts/${account.id}/enable`),
                         )
                       }
                     >
                       Enable
                     </Button>
                   ))}
               </span>
             </li>
           ))}
           {detail.invites.map((invite) => (
             <li key={invite.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
               <span className="min-w-0 break-all text-[13px] text-plum-950">{invite.email}</span>
               <Badge tone="amber">Invited</Badge>
               <span className="text-[11px] text-slate-550">Expires {relative(invite.expiresAt)}</span>
               <span className="ml-auto">
                 <ConfirmButton
                   size="sm"
                   confirmLabel="Yes, revoke"
                   disabled={busy !== null}
                   onConfirm={() =>
                     void run(`inv:${invite.id}`, () => api.del<PartnerDetail>(`${base}/invites/${invite.id}`))
                   }
                 >
                   Revoke
                 </ConfirmButton>
               </span>
             </li>
           ))}
         </ul>
         <p className="mt-2 text-[11px] leading-relaxed text-slate-550">
           Disabling a staff account hands its listings to the main account. The main account cannot be
           disabled on its own: make someone else main first, or suspend the company.
         </p>
       </Card>
     );
   }

   function LimitsCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
     const { busy, error, run } = useAction(onChanged);
     const [draft, setDraft] = useState<Record<PartnerLimitKey, string>>(() => ({
       review: detail.partner.limits.review?.toString() ?? "",
       live: detail.partner.limits.live?.toString() ?? "",
       staff: detail.partner.limits.staff?.toString() ?? "",
     }));
     // Empty means "use the default", which is what null stores.
     const parse = (value: string) => (value.trim() === "" ? null : Number(value));
     return (
       <Card>
         <CardHead title="Limits" />
         {error && (
           <div className="mb-2">
             <ErrorNote error={error} />
           </div>
         )}
         <div className="grid gap-3 sm:grid-cols-3">
           {PARTNER_LIMIT_KEYS.map((key) => (
             <Field key={key} label={PARTNER_LIMIT_LABEL[key]} hint={PARTNER_LIMIT_HINT[key]}>
               <input
                 className={inputClass}
                 inputMode="numeric"
                 value={draft[key]}
                 placeholder={`Default, ${detail.defaults[key]}`}
                 onChange={(event) => setDraft({ ...draft, [key]: event.target.value.replace(/[^0-9]/g, "") })}
               />
               <span className="mt-1 block text-[11px] text-slate-550">
                 Using {detail.usage[key]} of {detail.limits[key]}
               </span>
             </Field>
           ))}
         </div>
         <div className="mt-3">
           <Button
             disabled={busy !== null}
             onClick={() =>
               void run("limits", () =>
                 api.patch<PartnerDetail>(`/admin/partners/${detail.partner.id}`, {
                   baseRevision: detail.partner.revision,
                   limits: { review: parse(draft.review), live: parse(draft.live), staff: parse(draft.staff) },
                 }),
               )
             }
           >
             {busy === "limits" ? "Saving..." : "Save limits"}
           </Button>
         </div>
         <p className="mt-2 text-[11px] text-slate-550">
           Lowering a limit takes nothing down. It stops new ones until they are back under it.
         </p>
       </Card>
     );
   }

   function NameCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
     const { busy, error, run } = useAction(onChanged);
     const [name, setName] = useState(detail.partner.name);
     const p = detail.partner;
     return (
       <Card>
         <CardHead title="Company" />
         {error && (
           <div className="mb-2">
             <ErrorNote error={error} />
           </div>
         )}
         <Field label="Name" hint="Printed on their listings. Only AV Homes changes it.">
           <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
         </Field>
         <div className="mt-2">
           <Button
             variant="ghost"
             disabled={busy !== null || name.trim() === p.name}
             onClick={() =>
               void run("name", () =>
                 api.patch<PartnerDetail>(`/admin/partners/${p.id}`, { baseRevision: p.revision, name: name.trim() }),
               )
             }
           >
             {busy === "name" ? "Saving..." : "Save name"}
           </Button>
         </div>
         <p className="mt-3 text-[12px] text-slate-600">
           {p.contactName || "No contact name"} · {p.contactEmail || "no email"} · {p.contactPhone || "no phone"}
         </p>
       </Card>
     );
   }

   function AccessCard({ detail, onChanged }: { detail: PartnerDetail; onChanged: Changed }) {
     const { busy, error, run } = useAction(onChanged);
     const [reason, setReason] = useState("");
     const suspended = detail.partner.status === "suspended";
     const path = `/admin/partners/${detail.partner.id}/${suspended ? "reinstate" : "suspend"}`;
     return (
       <Card>
         <CardHead title="Access" />
         {error && (
           <div className="mb-2">
             <ErrorNote error={error} />
           </div>
         )}
         {detail.partner.statusReason && (
           <p className="mb-2 text-[12px] text-slate-600">Last change: {detail.partner.statusReason}</p>
         )}
         <Field
           label="Why"
           hint={
             suspended
               ? "They are told this when their access comes back."
               : "They are told this. Suspending signs every account out and takes their listings off the site."
           }
         >
           <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
         </Field>
         <div className="mt-2">
           <ConfirmButton
             variant={suspended ? "primary" : "danger"}
             confirmLabel={suspended ? "Yes, reinstate" : "Yes, suspend"}
             disabled={busy !== null || reason.trim().length < 3}
             onConfirm={() => void run("access", () => api.post<PartnerDetail>(path, { reason: reason.trim() }))}
           >
             {suspended ? "Reinstate" : "Suspend"}
           </ConfirmButton>
         </div>
       </Card>
     );
   }

``toApiError`` comes from ``src/lib/admin/marketing``, where the applications
screen already imports it from. Do not write a second one.

Step 6: default limits, ``partners/settings/page.tsx``
-----------------------------------------------------

.. code-block:: tsx

   "use client";

   import { useState } from "react";
   import { SlidersHorizontal } from "lucide-react";
   import {
     PARTNER_LIMIT_HINT,
     PARTNER_LIMIT_KEYS,
     PARTNER_LIMIT_LABEL,
     type PartnerLimitKey,
     type PartnerSettings,
   } from "@avhomes/contracts";
   import { api, type ApiError } from "@/lib/admin/client";
   import { useAsync } from "@/lib/admin/hooks";
   import { toApiError } from "@/lib/admin/marketing";
   import { Button, Card, ErrorNote, Field, PageHeader, Skeleton, inputClass } from "@/components/admin/ui";

   /** The limits a partner starts with, until AV Homes gives it its own. */
   export default function PartnerSettingsPage() {
     const state = useAsync((signal) => api.get<{ settings: PartnerSettings }>("/admin/partner-settings", signal), []);
     if (state.error && !state.data) return <ErrorNote error={state.error} onRetry={state.reload} />;
     if (!state.data) return <Skeleton className="h-48" />;
     return <Form settings={state.data.settings} />;
   }

   function Form({ settings }: { settings: PartnerSettings }) {
     const [draft, setDraft] = useState<Record<PartnerLimitKey, string>>({
       review: String(settings.limits.review),
       live: String(settings.limits.live),
       staff: String(settings.limits.staff),
     });
     const [busy, setBusy] = useState(false);
     const [saved, setSaved] = useState(false);
     const [error, setError] = useState<ApiError | null>(null);

     async function save() {
       setBusy(true);
       setError(null);
       setSaved(false);
       try {
         await api.patch("/admin/partner-settings", {
           limits: { review: Number(draft.review), live: Number(draft.live), staff: Number(draft.staff) },
         });
         setSaved(true);
       } catch (err) {
         setError(toApiError(err));
       } finally {
         setBusy(false);
       }
     }

     return (
       <>
         <PageHeader
           icon={SlidersHorizontal}
           title="Partner settings"
           backTo="/admin/partners"
           backLabel="Partners"
           subtitle="Every partner starts with these. A partner's own page can set its own."
         />
         <Card>
           {error && (
             <div className="mb-3">
               <ErrorNote error={error} />
             </div>
           )}
           <div className="grid gap-3 sm:grid-cols-3">
             {PARTNER_LIMIT_KEYS.map((key) => (
               <Field key={key} label={PARTNER_LIMIT_LABEL[key]} hint={PARTNER_LIMIT_HINT[key]}>
                 <input
                   className={inputClass}
                   inputMode="numeric"
                   value={draft[key]}
                   onChange={(event) => setDraft({ ...draft, [key]: event.target.value.replace(/[^0-9]/g, "") })}
                 />
               </Field>
             ))}
           </div>
           <div className="mt-3 flex items-center gap-2">
             <Button disabled={busy || PARTNER_LIMIT_KEYS.some((key) => draft[key] === "")} onClick={() => void save()}>
               {busy ? "Saving..." : "Save"}
             </Button>
             {saved && <span className="text-[12px] text-slate-600">Saved.</span>}
           </div>
         </Card>
       </>
     );
   }

Step 7: gates, screens, commit
------------------------------

The three gates. The screens are checked in task 14, where the harness learns
these routes.

.. code-block:: bash

   git add src/components/admin/nav.tsx packages/contracts/src/site-health.ts src/app/admin/partners
   git commit -m "feat(console): a page for every partner, with its team and what can be done to it"

--------------------------------------------------------------------------------

Task 13: the partner's Company and Staff screens
================================================

Files
  Create ``src/app/admin/company/layout.tsx``, ``src/app/admin/company/page.tsx``,
  ``src/app/admin/company/staff/page.tsx``. Modify
  ``src/components/admin/nav.tsx``.

Consumes
  The routes of task 10.

Step 1: the rail
----------------

After the Listings row, for partner accounts only:

.. code-block:: ts

     {
       href: "/admin/company",
       label: "Company",
       hint: "Your company's details and limits",
       icon: Building2,
       domain: null,
       roles: ["partner"],
       children: [
         {
           href: "/admin/company/staff",
           label: "Staff",
           hint: "Who works on your listings",
           icon: UsersRound,
           domain: null,
           roles: ["partner"],
         },
       ],
     },

``homeFor`` still sends a partner to ``/admin/properties``.

Step 2: ``company/layout.tsx``
------------------------------

The same one-line server layout as task 12, with ``title: "Company"``.

Step 3: ``company/page.tsx``
----------------------------

.. code-block:: tsx

   "use client";

   import { useState } from "react";
   import { Building2 } from "lucide-react";
   import {
     PARTNER_LIMIT_HINT,
     PARTNER_LIMIT_KEYS,
     PARTNER_LIMIT_LABEL,
     type CompanyView,
   } from "@avhomes/contracts";
   import { api, type ApiError } from "@/lib/admin/client";
   import { useAsync } from "@/lib/admin/hooks";
   import { toApiError } from "@/lib/admin/marketing";
   import {
     Button,
     Card,
     CardHead,
     DRow,
     DefinitionList,
     ErrorNote,
     Field,
     PageHeader,
     Skeleton,
     inputClass,
   } from "@/components/admin/ui";

   /** The company, its limits and how much of each is used. */
   export default function CompanyPage() {
     const state = useAsync((signal) => api.get<CompanyView>("/admin/company", signal), []);
     const [view, setView] = useState<CompanyView | null>(null);
     const current = view ?? state.data ?? null;

     if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
     if (!current) return <Skeleton className="h-64" />;

     const main = current.viewer.partnerRole === "main";
     return (
       <>
         <PageHeader icon={Building2} title={current.partner.name} subtitle="Your company on AV Homes." />
         <div className="space-y-3">
           <Card>
             <CardHead title="Limits" />
             <DefinitionList>
               {PARTNER_LIMIT_KEYS.map((key) => (
                 <DRow key={key} label={`${PARTNER_LIMIT_LABEL[key]}. ${PARTNER_LIMIT_HINT[key]}`}>
                   {current.usage[key]} of {current.limits[key]}
                 </DRow>
               ))}
             </DefinitionList>
             {PARTNER_LIMIT_KEYS.some((key) => current.usage[key] > current.limits[key]) && (
               <p className="mt-2 text-[12px] text-slate-600">
                 You are over a limit. Nothing is taken down, but nothing new can be added there until
                 you are back under it.
               </p>
             )}
           </Card>
           <ContactCard view={current} editable={main} onChanged={setView} />
         </div>
       </>
     );
   }

   function ContactCard({
     view,
     editable,
     onChanged,
   }: {
     view: CompanyView;
     editable: boolean;
     onChanged: (next: CompanyView) => void;
   }) {
     const p = view.partner;
     const [contactName, setContactName] = useState(p.contactName);
     const [contactEmail, setContactEmail] = useState(p.contactEmail);
     const [contactPhone, setContactPhone] = useState(p.contactPhone);
     const [busy, setBusy] = useState(false);
     const [error, setError] = useState<ApiError | null>(null);

     async function save() {
       setBusy(true);
       setError(null);
       try {
         onChanged(
           await api.patch<CompanyView>("/admin/company", {
             baseRevision: p.revision,
             contactName: contactName.trim(),
             contactEmail: contactEmail.trim(),
             contactPhone: contactPhone.trim(),
           }),
         );
       } catch (err) {
         setError(toApiError(err));
       } finally {
         setBusy(false);
       }
     }

     return (
       <Card>
         <CardHead title="Contact" />
         {error && (
           <div className="mb-2">
             <ErrorNote error={error} />
           </div>
         )}
         <p className="mb-3 text-[12px] text-slate-600">
           AV Homes mails review decisions here. The company name on your listings is changed by AV Homes.
         </p>
         <div className="grid gap-3 sm:grid-cols-3">
           <Field label="Name">
             <input className={inputClass} value={contactName} disabled={!editable} onChange={(e) => setContactName(e.target.value)} />
           </Field>
           <Field label="Email">
             <input className={inputClass} value={contactEmail} disabled={!editable} onChange={(e) => setContactEmail(e.target.value)} />
           </Field>
           <Field label="Phone">
             <input className={inputClass} value={contactPhone} disabled={!editable} onChange={(e) => setContactPhone(e.target.value)} />
           </Field>
         </div>
         {editable ? (
           <div className="mt-3">
             <Button disabled={busy} onClick={() => void save()}>
               {busy ? "Saving..." : "Save"}
             </Button>
           </div>
         ) : (
           <p className="mt-3 text-[12px] text-slate-550">Only your company's main account can change these.</p>
         )}
       </Card>
     );
   }

Step 4: ``company/staff/page.tsx``
----------------------------------

.. code-block:: tsx

   "use client";

   import { useState } from "react";
   import { UsersRound } from "lucide-react";
   import type { CompanyView } from "@avhomes/contracts";
   import { api, type ApiError } from "@/lib/admin/client";
   import { useAsync } from "@/lib/admin/hooks";
   import { relative } from "@/lib/admin/format";
   import { toApiError } from "@/lib/admin/marketing";
   import {
     Badge,
     Button,
     Card,
     CardHead,
     ConfirmButton,
     ErrorNote,
     Field,
     PageHeader,
     Skeleton,
     inputClass,
   } from "@/components/admin/ui";

   /** Who works on the company's listings. Everyone sees it; the main account changes it. */
   export default function StaffPage() {
     const state = useAsync((signal) => api.get<CompanyView>("/admin/company/staff", signal), []);
     const [view, setView] = useState<CompanyView | null>(null);
     const [link, setLink] = useState<string | null>(null);
     const [email, setEmail] = useState("");
     const [busy, setBusy] = useState<string | null>(null);
     const [error, setError] = useState<ApiError | null>(null);
     const current = view ?? state.data ?? null;

     if (state.error && !current) return <ErrorNote error={state.error} onRetry={state.reload} />;
     if (!current) return <Skeleton className="h-64" />;

     const main = current.viewer.partnerRole === "main";
     const mainName = current.accounts.find((a) => a.partnerRole === "main")?.displayName ?? "your main account";

     async function act(key: string, call: () => Promise<CompanyView & { url?: string }>) {
       setBusy(key);
       setError(null);
       try {
         const next = await call();
         setView(next);
         if (next.url) {
           setLink(next.url);
           setEmail("");
         }
       } catch (err) {
         setError(toApiError(err));
       } finally {
         setBusy(null);
       }
     }

     return (
       <>
         <PageHeader
           icon={UsersRound}
           title="Staff"
           subtitle={`${current.usage.staff} of ${current.limits.staff} staff seats in use.`}
         />
         {error && (
           <div className="mb-3">
             <ErrorNote error={error} />
           </div>
         )}
         <div className="space-y-3">
           {main && (
             <Card>
               <CardHead title="Add someone" />
               <Field label="Email" hint="They sign in with this address. The invite lasts seven days.">
                 <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
               </Field>
               <div className="mt-2">
                 <Button
                   disabled={busy !== null || email.trim() === ""}
                   onClick={() =>
                     void act("invite", () =>
                       api.post<CompanyView & { url: string }>("/admin/company/staff/invites", { email: email.trim() }),
                     )
                   }
                 >
                   {busy === "invite" ? "Inviting..." : "Invite"}
                 </Button>
               </div>
               {link && (
                 <p className="mt-2 break-all text-[12px] text-wine-700">
                   Their sign-in link, if the mail does not arrive: {link}
                 </p>
               )}
             </Card>
           )}
           <Card>
             <CardHead title="Team" />
             <ul className="divide-y divide-mist-100">
               {current.accounts.map((account) => (
                 <li key={account.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                   <span className="text-[13px] font-medium text-plum-950">{account.displayName}</span>
                   <span className="break-all text-[12px] text-slate-600">{account.email}</span>
                   <Badge tone={account.partnerRole === "main" ? "wine" : "neutral"}>
                     {account.partnerRole === "main" ? "Main" : "Staff"}
                   </Badge>
                   {account.disabledAt !== null && <Badge tone="red">Removed</Badge>}
                   {account.lastActiveAt && (
                     <span className="text-[11px] text-slate-550">Active {relative(account.lastActiveAt)}</span>
                   )}
                   {main && account.partnerRole === "staff" && account.disabledAt === null && (
                     <span className="ml-auto">
                       <ConfirmButton
                         size="sm"
                         confirmLabel="Yes, remove"
                         disabled={busy !== null}
                         onConfirm={() =>
                           void act(`rm:${account.id}`, () =>
                             api.post<CompanyView>(`/admin/company/staff/${account.id}/remove`),
                           )
                         }
                       >
                         Remove
                       </ConfirmButton>
                     </span>
                   )}
                 </li>
               ))}
               {current.invites.map((invite) => (
                 <li key={invite.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                   <span className="break-all text-[13px] text-plum-950">{invite.email}</span>
                   <Badge tone="amber">Invited</Badge>
                   {main && (
                     <span className="ml-auto">
                       <ConfirmButton
                         size="sm"
                         confirmLabel="Yes, revoke"
                         disabled={busy !== null}
                         onConfirm={() =>
                           void act(`inv:${invite.id}`, () =>
                             api.del<CompanyView>(`/admin/company/staff/invites/${invite.id}`),
                           )
                         }
                       >
                         Revoke
                       </ConfirmButton>
                     </span>
                   )}
                 </li>
               ))}
             </ul>
             {!main && (
               <p className="mt-2 text-[12px] text-slate-550">Only {mainName} can add or remove staff.</p>
             )}
             {main && (
               <p className="mt-2 text-[11px] text-slate-550">
                 Removing someone signs them out and hands their listings to you.
               </p>
             )}
           </Card>
         </div>
       </>
     );
   }

Step 5: gates and commit
------------------------

.. code-block:: bash

   git add src/components/admin/nav.tsx src/app/admin/company
   git commit -m "feat(console): a partner's company, its limits and its staff"

--------------------------------------------------------------------------------

Task 14: the harness, the screens, the readme
=============================================

Files
  Modify ``videos/_tools/record.cjs``, ``videos/_tools/qa.cjs``,
  ``README.rst``. Create ``videos/_tools/qa-partner-companies.json``.

Step 1: fixtures
----------------

In ``fixtures()`` in ``record.cjs``, the signed-in account gains the company when
the run is a partner's, and the state gains two companies:

.. code-block:: js

   // in S.owner:
   partnerId: (process.env.ROLE || "owner") === "partner" ? "ptnr_demo_lekki" : null,
   partnerRole: (process.env.ROLE || "owner") === "partner" ? process.env.PARTNER_ROLE || "main" : null,

   // beside S.props:
   partnerSettings: { limits: { review: 3, live: 10, staff: 3 }, updatedAt: 0 },
   partners: [
     {
       id: "ptnr_demo_lekki", name: "Lekki Homes Ltd", contactName: "Tunde Bakare",
       contactEmail: "tunde@lekkihomes.example", contactPhone: "+234 803 555 0101",
       status: "active", statusReason: "", limits: { review: null, live: 12, staff: null },
       mainUserId: "usr_demo_tunde", applicationId: "appl_demo_lekki",
       createdAt: Date.now() - 20 * 864e5, updatedAt: Date.now() - 864e5, revision: 3,
       accounts: [
         { id: "usr_demo_tunde", email: "tunde@lekkihomes.example", displayName: "Tunde Bakare", partnerRole: "main", disabledAt: null, lastActiveAt: Date.now() - 3600e3, createdAt: Date.now() - 20 * 864e5 },
         { id: "usr_demo_ife", email: "ife@lekkihomes.example", displayName: "Ifeoma Obi", partnerRole: "staff", disabledAt: null, lastActiveAt: Date.now() - 2 * 864e5, createdAt: Date.now() - 9 * 864e5 },
       ],
       invites: [{ id: "inv_demo_seun", email: "seun@lekkihomes.example", createdAt: Date.now() - 864e5, expiresAt: Date.now() + 6 * 864e5 }],
       usage: { review: 2, live: 7 },
     },
     {
       id: "ptnr_demo_palm", name: "Palm Realty", contactName: "Grace Eze",
       contactEmail: "grace@palmrealty.example", contactPhone: "",
       status: "suspended", statusReason: "Listings showed prices that were not the asking price.",
       limits: { review: null, live: null, staff: null },
       mainUserId: "usr_demo_grace", applicationId: "appl_demo_palm",
       createdAt: Date.now() - 60 * 864e5, updatedAt: Date.now() - 5 * 864e5, revision: 6,
       accounts: [
         { id: "usr_demo_grace", email: "grace@palmrealty.example", displayName: "Grace Eze", partnerRole: "main", disabledAt: null, lastActiveAt: Date.now() - 6 * 864e5, createdAt: Date.now() - 60 * 864e5 },
       ],
       invites: [],
       usage: { review: 0, live: 4 },
     },
   ],

Step 2: the mocked routes
-------------------------

Add these to the array ``mockApi(S)`` returns, above any broader
``/api/admin`` pattern (the first match wins):

.. code-block:: js

   // Partner companies: the shapes packages/identity/src/routes/partners.ts and company.ts answer with.
   ...(() => {
     const strip = ({ accounts, invites, usage, ...partner }) => partner;
     const lim = (p) => ({
       review: p.limits.review ?? S.partnerSettings.limits.review,
       live: p.limits.live ?? S.partnerSettings.limits.live,
       staff: p.limits.staff ?? S.partnerSettings.limits.staff,
     });
     const seats = (p) => p.accounts.filter((a) => a.partnerRole === "staff" && a.disabledAt === null).length + p.invites.length;
     const use = (p) => ({ review: p.usage.review, live: p.usage.live, staff: seats(p) });
     const detail = (p) => ({ partner: strip(p), limits: lim(p), defaults: S.partnerSettings.limits, usage: use(p), accounts: p.accounts, invites: p.invites });
     const find = (id) => S.partners.find((p) => p.id === id);
     const mine = () => find(S.owner.partnerId);
     const view = () => ({ ...detail(mine()), viewer: { userId: S.owner.id, partnerRole: S.owner.partnerRole } });
     const touch = (p) => Object.assign(p, { updatedAt: Date.now(), revision: p.revision + 1 });
     return [
       ["GET", /^\/api\/admin\/partners$/, () => ({
         items: S.partners.map((p) => ({ partner: strip(p), limits: lim(p), usage: use(p), accounts: p.accounts.length })),
         settings: S.partnerSettings,
       })],
       ["GET", /^\/api\/admin\/partners\/([^/]+)$/, (m) => detail(find(m[1]))],
       ["PATCH", /^\/api\/admin\/partners\/([^/]+)$/, (m, u, b) => {
         const p = find(m[1]);
         if (b.name) p.name = b.name;
         if (b.limits) p.limits = b.limits;
         return detail(touch(p));
       }],
       ["POST", /^\/api\/admin\/partners\/([^/]+)\/(suspend|reinstate)$/, (m, u, b) => {
         const p = find(m[1]);
         Object.assign(p, { status: m[2] === "suspend" ? "suspended" : "active", statusReason: b.reason });
         return detail(touch(p));
       }],
       ["POST", /^\/api\/admin\/partners\/([^/]+)\/main$/, (m, u, b) => {
         const p = find(m[1]);
         for (const a of p.accounts) a.partnerRole = a.id === b.userId ? "main" : "staff";
         p.mainUserId = b.userId;
         return detail(touch(p));
       }],
       ["POST", /^\/api\/admin\/partners\/([^/]+)\/accounts\/([^/]+)\/(disable|enable)$/, (m) => {
         const p = find(m[1]);
         const a = p.accounts.find((x) => x.id === m[2]);
         a.disabledAt = m[3] === "disable" ? Date.now() : null;
         return detail(touch(p));
       }],
       ["DELETE", /^\/api\/admin\/partners\/([^/]+)\/invites\/([^/]+)$/, (m) => {
         const p = find(m[1]);
         p.invites = p.invites.filter((i) => i.id !== m[2]);
         return detail(touch(p));
       }],
       ["GET", /^\/api\/admin\/partner-settings$/, () => ({ settings: S.partnerSettings })],
       ["PATCH", /^\/api\/admin\/partner-settings$/, (m, u, b) => {
         S.partnerSettings = { limits: b.limits, updatedAt: Date.now() };
         return { settings: S.partnerSettings };
       }],
       ["GET", /^\/api\/admin\/company(\/staff)?$/, () => view()],
       ["PATCH", /^\/api\/admin\/company$/, (m, u, b) => {
         const p = mine();
         Object.assign(p, { contactName: b.contactName, contactEmail: b.contactEmail, contactPhone: b.contactPhone });
         touch(p);
         return view();
       }],
       ["POST", /^\/api\/admin\/company\/staff\/invites$/, (m, u, b) => {
         mine().invites.unshift({ id: "inv_" + Date.now().toString(36), email: b.email, createdAt: Date.now(), expiresAt: Date.now() + 7 * 864e5 });
         return { ...view(), url: "http://localhost:3300/admin/sign-in", emailed: false };
       }],
       ["DELETE", /^\/api\/admin\/company\/staff\/invites\/([^/]+)$/, (m) => {
         const p = mine();
         p.invites = p.invites.filter((i) => i.id !== m[1]);
         return view();
       }],
       ["POST", /^\/api\/admin\/company\/staff\/([^/]+)\/remove$/, (m) => {
         const a = mine().accounts.find((x) => x.id === m[1]);
         a.disabledAt = Date.now();
         return view();
       }],
     ];
   })(),

The mock has no ``/api/admin/applications`` route. Add one, so the moved screen
draws its empty state rather than an unmocked 404:

.. code-block:: js

   ["GET", /^\/api\/admin\/applications$/, () => ({ applications: [], open: 0 })],

Step 3: a job names its seat, in ``videos/_tools/qa.cjs``
--------------------------------------------------------

``qa.cjs`` sets ``ROLE`` per job before building the fixtures. Beside that line:

.. code-block:: js

       process.env.PARTNER_ROLE = job.partnerRole || "main";

and the header comment's job shape gains ``"partnerRole": "main" | "staff"``.

Step 4: the screen checks
-------------------------

``videos/_tools/qa-partner-companies.json``:

.. code-block:: json

   [
     { "name": "owner-partners-list", "path": "/admin/partners", "viewport": "desktop",
       "steps": [{ "wait": 2500, "eval": "document.querySelectorAll('a[href^=\"/admin/partners/ptnr_\"]').length", "shot": "list" }] },
     { "name": "owner-partner-page", "path": "/admin/partners/ptnr_demo_lekki", "viewport": "desktop",
       "steps": [
         { "wait": 2500, "shot": "page" },
         { "click": "::-p-xpath(//button[normalize-space()='Make main'])", "wait": 1200, "shot": "main-moved" }
       ] },
     { "name": "owner-partner-suspended-phone", "path": "/admin/partners/ptnr_demo_palm", "viewport": "phone",
       "steps": [{ "wait": 2500, "shot": "suspended" }] },
     { "name": "owner-partner-settings", "path": "/admin/partners/settings", "viewport": "desktop",
       "steps": [{ "wait": 2000, "shot": "settings" }] },
     { "name": "owner-team", "path": "/admin/team", "viewport": "desktop",
       "steps": [{ "wait": 2500, "eval": "[document.body.innerText.includes('Lekki Homes'), !!document.querySelector('a[href=\"/admin/partners\"]')]", "shot": "team" }] },
     { "name": "partner-main-company", "path": "/admin/company", "viewport": "desktop", "role": "partner",
       "steps": [{ "wait": 2500, "eval": "!!document.querySelector('a[href=\"/admin/partners\"]')", "shot": "company" }] },
     { "name": "partner-main-staff", "path": "/admin/company/staff", "viewport": "phone", "role": "partner",
       "steps": [{ "wait": 2500, "shot": "staff" }] },
     { "name": "partner-staff-staff", "path": "/admin/company/staff", "viewport": "phone", "role": "partner", "partnerRole": "staff",
       "steps": [{ "wait": 2500, "eval": "document.body.innerText.includes('Add someone')", "shot": "read-only" }] }
   ]

.. code-block:: bash

   . videos/_tools/env.sh && BASE=http://localhost:3300 node videos/_tools/qa.cjs videos/_tools/qa-partner-companies.json .qa/partner-companies

Look at three to five frames, not every one, and read every ``eval`` line and
any ``UNMOCKED`` line. Expect: the owner's rail has a Partners section and the
Team screen does not name Lekki Homes (``owner-team`` prints ``[false,true]``);
a partner's rail has Company and Staff and no Partners link
(``partner-main-company`` prints ``false``); the staff account sees the team
with no "Add someone" card (``partner-staff-staff`` prints ``false``); nothing
overflows at phone width.

Step 5: the readme
------------------

In ``README.rst``, the ``@avhomes/identity`` row of the package table becomes
"Users, sessions, invites, partner companies, the two auth doors and the domain
gate." Add a short section after "Authentication":

.. code-block:: rst

   Partner companies
   =================

   A partner is a company outside AV Homes that lists its own property. Its
   accounts share its listings, photographs and numbers, scoped by the
   company's id, never by who created a row. The main account adds and removes
   staff; AV Homes approves the company, sets its limits (listings not yet
   approved, live listings, staff seats) and can suspend it, which signs every
   account out and holds its listings off the public site. Partner accounts are
   managed on their company's page under Partners, never on the Team screen.

Step 6: the last gates
----------------------

The three gates, then the build against the live API, because ``Property``
gained ``partnerId`` on a public route:

.. code-block:: bash

   VERCEL_URL=av-homes.vercel.app npm run build

It must generate every page.

Step 7: commit, then stop
-------------------------

.. code-block:: bash

   git add videos/_tools/record.cjs videos/_tools/qa.cjs videos/_tools/qa-partner-companies.json README.rst
   git commit -m "chore(partners): the harness answers the partner routes, and the readme says what a partner is"

Stop. Report what the screen checks showed, with a few frames. Ask
nathanieluriri whether to push ``partner-companies`` and open the pull request,
and tell him production needs ``0017`` run once it merges. Pass two's plan is
written next, against this code.

--------------------------------------------------------------------------------

Self-review against the spec
============================

What pass one of the spec asks for, and where it is built.

============================================  ==========
Spec                                          Task
============================================  ==========
The company record, in identity               2, 3
Membership on the account                     2, 3, 5
``partnerScopeOf`` and every scope moved      2, 6
Staff invites through the existing doors      3, 5, 10
Approval makes the company first              5
Removing somebody, cards switch               8, 9, 10
Main role moved by AV Homes                   9, 12
AV Homes disables one account                 9, 12
Limits: counts, checks, never take down       2, 7, 9, 10
Suspension: sessions, every door, holds       5, 8, 9
``publicVisible``                             8
Partners section and a partner's page         12
Partner accounts off the Team screen          11
Company and Staff for the partner             10, 13
The migration and backfill                    4
The invites validator                         1
============================================  ==========

Pass two owns everything under "Changes to a live listing", "Their own
buyers", "Selling" and "Telling people", the "Waiting for review" screen, the
AV Homes / Partners filters on the inbox and the image library, and its own
migration.
