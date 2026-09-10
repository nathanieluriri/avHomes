==========================
Audit trail: design
==========================

:Date: 2026-09-10
:Status: approved
:Unit: 2 of 7 on the admin roadmap
:Follows: ``2026-09-10-listing-truth-design.rst``

Why
===

Nothing records who did anything.

Posts carry revisions and a property carries a monotonic ``revision`` as a CAS
token, but neither answers a question an agency actually asks. Who dropped the
price on the Ikoyi house. Who marked the Lekki flat sold. Who changed an agent's
role to owner, and when. Who deleted the listing that a buyer says they saw last
week.

Today the honest answer to all of those is "nobody knows". For a business where a
price change and a status change are both commercially meaningful, and where
staff turn over, that is a gap that costs money the first time two people
disagree about what happened.

This unit is deliberately second on the roadmap rather than later. It is
cross-cutting, so building it now means contacts (unit 3) and viewings (unit 4)
are born instrumented, instead of being retrofitted twice.

Goal
====

Every state-changing action taken by a signed-in person is recorded, with who,
what, when, and what changed. The record cannot be skipped by forgetting, and a
failure to record can never fail the action itself.

Where it lives, and why that is the whole design
================================================

**A middleware at the composition root, not forty calls in forty routes.**

There are roughly forty mutating routes across eight packages. Instrumenting them
one by one produces a system that is correct on the day it ships and wrong on the
day somebody adds route forty-one. That is a convention, and this repository
already has a written position on conventions: a router mounted above
``sessionMiddleware`` is *structurally* incapable of reading a cookie, and the
README calls that a guarantee where "we remembered not to read the session" is
merely a habit.

The same argument applies here. ``app.ts`` mounts ``sessionMiddleware`` and
``rolePermissions`` at lines 264 and 265, and every admin router below them. An
audit middleware mounted immediately after them sees every authenticated,
authorised, mutating request that reaches any of those routers. Nothing below it
can escape it, including routers that do not exist yet.

.. code-block:: text

    8. sessionMiddleware       resolves the cookie to a user or null
    9. rolePermissions         the domain gate over URL prefixes
   10. auditTrail              <- NEW. everything below is recorded
   ------------------------------------------------------------------
   11. auth, team, listings, content, media, enquiries, settings, ...

Mounting it *below* ``rolePermissions`` is deliberate. A request that is refused
by the domain gate never happened as far as the data is concerned, and recording
attempts that were correctly rejected would fill the log with noise that looks
like activity.

What an entry holds
===================

.. code-block:: ts

   export interface AuditEntry {
     id: string;
     /** Epoch ms, like every other timestamp here. */
     at: number;
     /** SNAPSHOT of the actor, not a join. A renamed or deleted user must not
      *  rewrite who did a thing last year. */
     actorId: string;
     actorName: string;
     actorRole: Role;
     /** "property", "post", "user", "enquiry", ... derived from the path. */
     entity: string;
     /** The id from the path, or null on a create where the path has none. */
     entityId: string | null;
     /** "create" | "update" | "delete" | "op:<name>", derived from method and path. */
     action: string;
     /** What the caller asked for. The request body, redacted. */
     requested: Record<string, unknown> | null;
     /** What the record looked like first. Only where a route supplies it. */
     before: Record<string, unknown> | null;
     method: string;
     path: string;
     status: number;
     /** Ties an entry to the error-table line and the server log for the same call. */
     requestId: string;
     /** Written beside the real expiry solely so a TTL index can sweep the row.
      *  Never read by the application. */
     expiresAtDate: Date;
   }

The actor fields are snapshots for the same reason ``EnquiryMessage.authorName``
is: an audit trail that re-derives who someone was at read time is not an audit
trail, because renaming an account would silently rewrite history.

Values, and the cost of recording them
--------------------------------------

The owner chose to record full values, having been shown the alternative. So
``requested`` carries the request body as sent.

The consequence, stated once so it is on the record: the audit collection becomes
a second store of personal data. An enquiry reply carries the message text; an
invite carries an email address; a contact update carries a phone number. A
request to delete someone's data now has two places to reach, and the two year
TTL is the only thing bounding that. Two mitigations follow from it and are part
of this design rather than optional extras:

- Audit reads sit in the ``danger`` domain, which is owner and developer only.
  Support and agent roles cannot read it, even though they can generate it.
- No audit entry is reachable from any public route. The reader is mounted with
  the admin routers, below the session middleware.

Redaction is not optional
-------------------------

**Three routes carry plaintext passwords in their bodies**:
``/auth/password/login``, ``/auth/password/change`` and ``/auth/password/claim``.
Writing those into a collection with a two year retention would be a genuine
security defect, and "full values" plainly did not mean that.

So before an entry is stored, ``requested`` is walked and any key matching the
redaction list is replaced with the string ``"[redacted]"``, at any depth:

.. code-block:: ts

   const REDACT = ["password", "newPassword", "currentPassword", "token",
                   "secret", "passwordHash", "threadKey"];

The list is a denylist by key name, which is the weaker of the two designs, and
it is chosen with the weakness understood: an allowlist would have to be
maintained per route, and a body field it did not know about would be dropped
silently rather than recorded, which defeats the point of recording bodies at
all. A denylist fails towards recording too much; an allowlist fails towards
recording nothing. Given the choice that was made about values, failing towards
recording is the consistent one. ``TODO(test)`` covers every name on the list.

Bodies that are not JSON
------------------------

``POST /admin/images`` is a multipart upload. Capturing its body would put image
bytes in a database row. The middleware reads a body **only** when the
content type is JSON, and stores ``requested: null`` otherwise. A body over 16KB
after redaction is replaced by ``{ "_truncated": true }`` rather than stored, so
one pathological request cannot write a document that approaches Mongo's limit.

Reading the body safely
-----------------------

The middleware reads the body **after** ``next()``, not before. Hono caches the
parsed body on ``c.req.json()``, so by that point the route has usually already
parsed it and the second call is free. Reading before ``next()`` would risk
consuming the stream ahead of the route that needs it.

What is not audited
===================

- **Reads.** ``GET`` and ``HEAD`` never produce an entry. A log of who looked at
  what is a different feature with a different privacy answer, and it would
  outnumber the writes by two orders of magnitude.
- **Public writes.** An enquiry submission, a newsletter subscribe and an
  analytics beacon have no actor, arrive at volume, and are already recorded as
  the thing they create. They are mounted above this middleware and are therefore
  structurally excluded rather than filtered.
- **Failed requests.** An entry is written only for a ``2xx``. A 400 changed
  nothing, and a 403 was already refused by the gate above.
- **Anonymous requests below the gate.** ``/auth/password/login`` on a failed
  attempt has no actor and changed nothing, so it produces nothing.

Signing in, which the middleware cannot see on its own
------------------------------------------------------

A successful login *should* produce an entry: "who signed in, and when" is one of
the questions an audit trail exists to answer, and ``auth_attempts`` exists only
to rate limit, so nothing else records it today.

The middleware cannot manage it alone. ``sessionMiddleware`` resolves the cookie
**before** the auth routes run, so at the moment the middleware tests for an
actor, a person in the act of signing in is still anonymous, and the entry would
be dropped for having nobody to attribute it to.

So the handle carries an actor as well as a before-image, and the door routes
name the person they just authenticated:

.. code-block:: ts

   export interface AuditHandle {
     setBefore(doc: Record<string, unknown>): void;
     /** For routes that establish an actor rather than inherit one. */
     setActor(user: AuthUser): void;
   }

The middleware's actor is ``c.get("user")`` when the session middleware resolved
one, or whatever a route supplied, whichever is present. Two lines in two routes,
and it is the only place in the design where a route has to remember something.
Everywhere else, forgetting costs detail rather than coverage.

Enrichment: how ``before`` gets filled
======================================

The middleware cannot know what a record looked like beforehand. A route can tell
it, through a handle on the request context:

.. code-block:: ts

   // in AppVariables
   audit: { setBefore(doc: Record<string, unknown>): void };

Routes that already read the prior document pay nothing to call it.
``saveProperty`` reads the row before writing (unit 1 gave it an actor for price
history), so the property patch route can hand that document straight over.

This is opt-in **enrichment**, not opt-in recording. A route that never calls
``setBefore`` still produces a complete entry with ``before: null``. That is the
degradation that matters: forgetting costs detail, never coverage.

Routes instrumented with ``setBefore`` in this unit, chosen because they are the
ones an argument is actually about:

- ``PATCH /admin/properties/:id`` and its lifecycle ops
- ``PATCH /admin/users/:id/role``, disable and enable
- ``PATCH /admin/posts/:id`` and its ops
- ``PATCH /admin/enquiries/:id``
- ``PUT`` on testimonials, stats and categories

Failure policy
==============

**A failed audit write never fails the request.**

The entry is written after the response body has been decided. If the insert
throws, the error is logged with the same ``requestId`` and the response is
returned unchanged. An audit system that can turn a successful save into a 500 is
worse than one that occasionally misses a row: the first loses the user's work,
the second loses a record of work that succeeded.

This is a real trade and it is being made deliberately. A deployment that needs
audit to be a hard precondition of the write would need the write and the entry
in one transaction, which is a different and much more expensive design.

Storage
=======

Collection ``audit``, added to ``COLLECTIONS``. Migration ``0008``.

Retention is two years, through the pattern the README already names as the one
exception to epoch-millisecond timestamps: a real ``Date`` in ``expiresAtDate``
written solely so a TTL index can sweep the row, never read by the application.

.. code-block:: ts

   await ensureIndex(db, COLLECTIONS.audit, { expiresAtDate: 1 },
     { name: "audit_ttl", expireAfterSeconds: 0 });

``expireAfterSeconds: 0`` with a per-document date is how a TTL index expresses
"expire at the time in this field" rather than "expire this long after it".

Two read indexes, because there are exactly two questions:

.. code-block:: text

   audit_recent  { at: -1, _id: -1 }                  the log, newest first
   audit_entity  { entity: 1, entityId: 1, at: -1 }   this record's history

The validator pins ``actorRole`` to the role enum and ``action``/``entity`` to
strings. ``requested`` and ``before`` are free-form objects by necessity: they
mirror whatever the audited route accepts.

Reading it
==========

``GET /api/admin/audit`` with keyset paging, sorted by ``at`` descending, the same
cursor machinery every other list uses. Filters: ``entity``, ``entityId``,
``actorId``, and a date range.

It falls into the ``danger`` domain automatically. ``RULES`` in
``packages/identity/src/middleware.ts`` already ends with
``{ prefix: "/api/admin/", domain: "danger" }``, so no new rule is needed and no
existing rule has to move. An explicit rule is added anyway, directly above the
catch-all, because relying on a fallthrough for an access decision is exactly the
kind of thing that breaks silently when somebody inserts a rule below it.

Admin UI
========

A screen at ``/admin/audit``, in the navigation only for roles that hold
``danger``.

Copy rule, unchanged from unit 1: **plain English, short.** "Adaeze changed the
price on Ikoyi Glass House", not "PATCH /api/admin/properties/prop_123 (200)".
The raw method and path belong in a details expander, not in the line a person
reads.

- One row per entry: who, what they did, which record, how long ago.
- A row expands to show the changed fields, before and after side by side.
  Redacted values render as the word "hidden", not as ``[redacted]``.
- Filters matching the API: entity type, actor, date range.
- Empty state in the same grade as the rest of the console.
- A **"History" panel on the property editor**, filtered to that listing, so the
  question "what happened to this house" is answered where it is asked rather
  than only on a separate screen.

Visual bar: the Shopify admin (2026), as with unit 1, so the new screen and panel
share the existing section rhythm rather than reading as bolted on.

Surface inventory
=================

===============================================  ======================================
File                                             What changes
===============================================  ======================================
``packages/contracts/src/types.ts``              ``AuditEntry``, action and entity consts
``packages/contracts/src/index.ts``              ``export *``, nothing to do
``packages/core/src/app-env.ts``                 ``AppVariables`` gains the audit handle
``packages/audit/**``                            NEW package: middleware, repo, routes
``packages/api/src/app.ts``                      mounts it at position 10
``packages/db/src/collections.ts``               ``audit``
``packages/db/src/migrations/0008_audit.ts``     NEW: validator, TTL, two read indexes
``packages/db/src/migrations/index.ts``          register 0008
``packages/identity/src/middleware.ts``          explicit ``/api/admin/audit`` rule
``packages/listings/src/routes/admin.ts``        ``setBefore`` on patch and ops
``packages/identity/src/routes/team.ts``         ``setBefore`` on role, disable, enable
``packages/content/src/routes.ts``               ``setBefore`` on patch and ops
``packages/enquiries/src/index.ts``              ``setBefore`` on patch
``src/app/admin/audit/page.tsx``                 NEW screen
``src/app/admin/properties/[id]/page.tsx``       history panel
``src/components/admin/nav.tsx``                 nav entry, danger-gated
``src/lib/types.ts``                             named re-export list
===============================================  ======================================

**``packages/audit`` is a new feature package** and obeys the same rule as the
others: it imports ``contracts``, ``core`` and ``db``, and no other feature
package imports it. The middleware is injected at the composition root, which is
the only place allowed to know both halves of a seam.

``nav.tsx`` is being actively edited by concurrent work at the time of writing.
Coordinate before touching it, or add the nav entry last.

Tests
=====

**No tests are written in this unit.** Standing project rule. Intentions are
recorded as ``TODO(test):`` beside the code, and cross-cutting ones appended to
``packages/api/src/TESTS.todo.ts``.

Redaction, which is the part where a mistake is a security bug
  - Every name in ``REDACT`` is replaced, at top level and nested.
  - A password field inside an array of objects is replaced.
  - The three password routes produce an entry whose body contains no plaintext.
  - A key whose name merely contains "password" as a substring is handled the way
    the implementation claims, and the claim is written down.

Coverage, which is the part where a mistake is a silent gap
  - A route added below the middleware with no audit code of its own still
    produces an entry.
  - ``GET`` produces none.
  - A 400 produces none; a 200 produces exactly one.
  - A public route mounted above the middleware produces none.

Behaviour
  - ``before`` is null when a route does not call ``setBefore``, and populated
    when it does.
  - A multipart upload stores ``requested: null`` rather than bytes.
  - A body over 16KB stores the truncation marker.
  - An insert that throws is logged and the response is unchanged, still 2xx.
  - ``expiresAtDate`` is two years ahead and the TTL index exists on it.
  - The entity and action derived from ``PATCH /admin/properties/abc`` are
    ``property`` and ``update``; from ``POST /admin/properties/abc/publish`` they
    are ``property`` and ``op:publish``.

Out of scope
============

- **No read auditing.** Different feature, different privacy answer.
- **No tamper evidence.** No hash chain, no append-only enforcement. An owner
  with database access can edit the collection. Saying so plainly is better than
  implying a guarantee that Mongo is not providing.
- **No diffing in the writer.** ``before`` and ``requested`` are stored whole and
  the UI computes the difference at read time, so a change to how a diff is
  presented does not require a migration.
- **No export.** Roadmap unit 6 covers export generally.

Roadmap position
================

Unit 2 of 7. Next: 3 contacts, 4 viewings, 5 reporting, 6 portal export,
7 WhatsApp intake. Units 3 and 4 introduce new mutating routes, and they will be
audited on the day they are written without doing anything, which is the point of
building this second.
