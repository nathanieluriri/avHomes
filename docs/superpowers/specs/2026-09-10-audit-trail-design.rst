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
``rolePermissions`` at lines 261 and 262, and every admin router below them. An
audit middleware mounted immediately after them sees every authenticated,
authorised, mutating request that reaches any of those routers. Nothing below it
can escape it, including routers that do not exist yet.

.. code-block:: text

   app.ts:261   sessionMiddleware()   resolves the cookie to a user or null
   app.ts:262   rolePermissions()     the domain gate over URL prefixes
   app.ts:263   auditTrail()          <- NEW. everything below is recorded
   ----------------------------------------------------------------------
   app.ts:265+  auth, team, listings, content, media, enquiries, settings

Cited by line rather than by a step number on purpose. The README carries its own
numbered mount-order table, and inventing a second numbering here would leave two
lists to keep in agreement.

Mounting it *below* ``rolePermissions`` is deliberate. A request that is refused
by the domain gate never happened as far as the data is concerned, and recording
attempts that were correctly rejected would fill the log with noise that looks
like activity.

What an entry holds
===================

Two shapes, as everywhere else here: ``AuditEntry`` is the wire shape and lives in
``contracts`` with an ``id``; ``AuditEntryDoc`` is the stored shape and lives in
the audit package with an ``_id``, the way ``PropertyDoc`` sits beside
``Property``. The read indexes below are written against ``_id``.

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
     /** "property", "post", "user", "enquiry", ... see the derivation table. */
     entity: AuditEntity;
     /** The record's id, or null where there is not one. See the table. */
     entityId: string | null;
     /** "create" | "update" | "delete" | "op:<name>". See the table. */
     action: string;
     /** What the caller asked for. The request body, redacted. */
     requested: Record<string, unknown> | null;
     /** What the record looked like first. Only where a route supplies it. */
     before: Record<string, unknown> | null;
     method: string;
     /** Path only. The query string is captured separately, below. */
     path: string;
     /** Parsed query parameters, redacted like any other payload. Null when
      *  there were none. `DELETE /admin/properties/:id?baseRevision=7` carries
      *  its only interesting argument here, so dropping it would record a
      *  deletion with no record of what was asked for. */
     query: Record<string, string> | null;
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

And one consequence that the mitigations do **not** cover, stated plainly because
a design that names a problem and quietly implies it is handled is worse than one
that admits the gap:

**An erasure request cannot be honoured against this collection.** The reader
filters on entity, entityId, actor and date. None of those finds "every entry
containing this person's email or phone", ``requested`` is free-form and unindexed,
and there is no delete path at all. So deleting a buyer's enquiry leaves its full
text in the audit rows, and the two year clock runs from the audit write rather
than from the request to be forgotten. If that becomes a real obligation rather
than a hypothetical one, the answer is a targeted delete path and an index to
support it, and that is a change to this design rather than a configuration of it.

Credentials: excluded by path, not by field name
------------------------------------------------

The first draft of this spec tried to solve this with a denylist of key names and
got it wrong in the most instructive way. It listed ``newPassword`` and
``currentPassword``. Neither name exists anywhere in this repository. The route
that actually changes a password is:

.. code-block:: ts

   // packages/identity/src/routes/doors.ts, POST /auth/password/change
   z.object({
     current: z.string().min(1).max(400),
     next:    z.string().min(12).max(400),
   }).strict()

``current`` and ``next``. Two innocuous words, both carrying a plaintext
password, and a denylist would have written both into a two year store while
looking like it had handled the problem.

That is the argument against name matching, made concretely: **a key name is a
convention and the secret does not have to honour it.** So the auth surface is
excluded structurally instead.

.. code-block:: ts

   /** Bodies here are never captured. Every route under it exists to receive a
    *  credential, so there is nothing on this prefix worth recording and no way
    *  to be sure which field is the secret. */
   const NO_BODY_PREFIXES = ["/api/auth/"];

An auth request still produces an entry, with ``requested: null``. Who signed in,
who changed their password, and when, are all preserved. What they typed is not
captured at all rather than captured and filtered.

This is the same shape of argument the README makes about mount order: a router
that cannot reach the session middleware is *structurally* incapable of reading a
cookie, where remembering not to read it is merely a habit. A prefix that is
never read cannot leak a field somebody adds to it next year.

A denylist still runs, for everything else
------------------------------------------

Outside ``/api/auth/``, ``requested`` is walked and any key whose name matches is
replaced with ``"[redacted]"``, at any depth, through objects and arrays alike:

.. code-block:: ts

   const REDACT_KEYS = ["password", "token", "secret", "passwordHash",
                        "threadKey", "sessionId", "apiKey"];

This is defence in depth rather than the primary control, and it is worth being
honest about what it is for. The primary control is the path exclusion above. The
denylist catches a credential that turns up on a route nobody expected to carry
one, which is exactly the case where a name match is better than nothing and
worse than a guarantee.

Matching is case-insensitive on the key name. Recursion is depth capped, so a
cyclic or absurdly nested body cannot hang a request; past the cap the subtree
becomes ``"[deep]"``.

``TODO(test)`` covers every name on the list, and separately asserts that each of
the four ``/api/auth/`` routes produces an entry whose ``requested`` is ``null``.

Both payload fields get the same treatment
------------------------------------------

Redaction and the size limit apply to ``requested`` **and** to ``before``. The
first draft scoped both to ``requested`` alone, which was backwards: ``before`` is
the field designed to carry an entire stored document, so it is the one with the
most to leak and the most to bloat.

Today ``before`` on the users path happens to be safe, because ``findUserById``
projects through ``AUTH_PROJECTION`` and that enumeration excludes
``passwordHash``. That is luck, not a design. It holds only while every present
and future ``setBefore`` caller passes a narrow projection, which is precisely the
habit-versus-guarantee distinction this document opens by rejecting. So
``before`` goes through the same walk as ``requested``, and a hash that reaches it
is redacted whatever the projection did.

Bodies that are not JSON
------------------------

``POST /admin/images`` is a multipart upload. Capturing its body would put image
bytes in a database row. The middleware reads a body **only** when the
``content-type`` is JSON, and stores ``requested: null`` otherwise.

Trimming is per field, not all or nothing
-----------------------------------------

The first draft replaced any payload over 16KB with ``{ "_truncated": true }``.
That destroys the flagship record. The property editor sends the whole patch on
every save, and ``PatchBody`` permits a 20,000 character description plus forty
image URLs. One long description pushes the payload over the line and the
``priceMinor`` field goes over the cliff with it, so "who dropped the price on the
Ikoyi house" has no answer. The cap was justified against pathological traffic and
set where it bites ordinary traffic.

So oversized payloads are trimmed **field by field**:

- Scalars are always kept. A number, a boolean, a short string, an id.
- A string over 512 characters becomes ``"[long: 20431 chars]"``.
- An array over 20 entries becomes ``["[list: 40 items]"]``.
- If the result still exceeds 64KB, the whole field becomes
  ``{ "_truncated": true }`` as a last resort.

The values that settle arguments are small: a price, a status, a role, a date.
Keeping every scalar and dropping the prose is what makes an entry answer the
question it exists for.

Reading the body safely
-----------------------

The middleware reads the body **after** ``next()``, not before. Hono caches the
parsed body on ``c.req.json()``, so by that point the route has usually already
parsed it and the second call is free. Reading before ``next()`` would risk
consuming the stream ahead of the route that needs it.

Deriving entity, entityId and action
====================================

All three are required fields, so "derived from the path" is not a specification
until it covers every path. At runtime ``c.req.path`` carries the ``/api``
prefix, so it reads ``/api/admin/properties/abc``, not ``/admin/properties/abc``.
Strip ``/api/`` first; an implementer indexing segments from an unprefixed
example is off by one.

.. code-block:: text

   segments = path without "/api/", split on "/"

   segments[0] === "auth"    -> the auth table below
   segments[0] === "admin"   -> entity = ENTITY_BY_SEGMENT[segments[1]]
                                rest   = segments.slice(2)
   anything else             -> entity "unknown", action from the method

For an ``admin`` path, ``rest`` decides the rest:

==================  ==========================================================
``rest``            Result
==================  ==========================================================
``[]``              POST is ``create``, PATCH is ``update`` (a singleton such
                    as settings). ``entityId`` null.
``[id]``            PATCH is ``update``, DELETE is ``delete``, PUT is
                    ``create`` when ``id`` is the literal ``"new"`` and
                    ``update`` otherwise. ``entityId`` is ``id``, or null for
                    that ``"new"`` case.
``[id, op]``        ``op:<op>``, ``entityId`` is ``id``.
``[a, b, op]``      ``op:<op>``, ``entityId`` is ``a``. This is
                    ``/admin/revisions/:postId/:revisionId/restore``, and the
                    record being changed is the post, so the post's id is the
                    one worth indexing.
==================  ==========================================================

The ``"new"`` sentinel is not a detail. ``PUT /admin/testimonials/:id``,
``/stats/:id`` and ``/categories/:id`` all resolve ``id === "new" ? null : id``
and mint an id in the handler. Taking the path segment literally would file every
create in the system's history under the id ``"new"``, where they would collide
with each other and where ``audit_entity`` would answer nothing for any of them.
So a create records ``entityId: null`` and the route hands back the id it minted:

.. code-block:: ts

   setEntityId(id: string): void    // third method on the handle

============================  ===========================================
``ENTITY_BY_SEGMENT``         maps to
============================  ===========================================
properties                    ``property``
posts                         ``post``
revisions                     ``post``  (the post is what changed)
categories                    ``category``
images                        ``image``
enquiries                     ``enquiry``
users                         ``user``
invites                       ``invite``
testimonials                  ``testimonial``
stats                         ``stat``
notes                         ``note``
settings                      ``settings``
anything else                 ``unknown``
============================  ===========================================

The auth surface has no entity noun in its paths, so it gets its own small table:

=================================  ==============  ====================
Path                               ``entity``      ``action``
=================================  ==============  ====================
``/auth/logout``                   session         ``op:logout``
``/auth/sessions/:id``             session         ``delete``
``/auth/me``                       user            ``update``
``/auth/clerk/exchange``           auth            ``op:login``
``/auth/password/login``           auth            ``op:login``
``/auth/password/claim``           auth            ``op:claim``
``/auth/password/change``          auth            ``op:password-change``
=================================  ==============  ====================

``unknown`` is a real member of ``AuditEntity``, not a defensive afterthought. A
route added later whose segment nothing recognises must still produce a valid
entry: a validator that rejected it would convert "nobody taught the mapper about
this route" into "this write is silently unaudited", which is the failure this
whole unit exists to prevent.

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
- **Anything with no actor.** This rule is load-bearing and not merely tidy, so
  it is stated as a rule rather than left implicit: **no actor, no entry.**

  ``rolePermissions`` does not authenticate, so "everything below the mount is
  captured" cuts both ways: anonymous requests reach the middleware too.
  ``POST /auth/logout`` is the sharp case. It deliberately carries no
  ``requireAuth``, has no rate limiter, and always answers 200, so without this
  rule a stranger with no cookie could loop it and write one two-year row per
  request. With it, an anonymous logout writes nothing, because there is nobody to
  attribute it to and nothing was changed.

  The routes that *can* mint an actor from nothing are the two doors, and both are
  rate limited on the caller's IP already
  (``limit(db, "login:<ip>", LOGIN_IP_LIMIT, LOGIN_WINDOW_MS)`` in ``doors.ts``),
  so the one anonymous path that does produce entries is bounded by a limiter
  that already exists.

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

And that is the whole list. Three routes that looked like obvious candidates are
deliberately excluded:

``PATCH /admin/posts/:id``
  **Excluded, and this one matters.** The post editor autosaves 1.5 seconds after
  each pause and sends the full patch, where ``content`` may run to a megabyte.
  Attaching ``before`` to it would write a complete prior copy of the post on
  every keystroke pause, retained two years. This repository already met that
  problem and solved it: ``savePostRevision`` keeps only the twenty most recent
  autosaves per post, with the comment "Unbounded history of keystrokes is the
  largest collection in a blog nobody reads twice." Reintroducing it uncapped in
  the audit collection would undo that fix in a second place. Posts already have a
  before-image mechanism in ``post_revisions``; audit records who and when, and
  points at the revision for what.

``PATCH /admin/enquiries/:id`` and the three ``PUT`` upserts
  Excluded because they do not read the prior document. The first draft claimed
  routes that already read one "pay nothing to call it", which is true for
  properties and users and false for these: the enquiry patch goes straight to
  ``findOneAndUpdate``, and the upserts never read at all. Adding a read to
  manufacture a before-image buys detail with a database round trip on every
  write, which is the wrong trade. They produce complete entries with
  ``before: null``.

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

The trade has a consequence the first draft did not state: **a persistently
broken writer degrades to no audit at all, and an empty log looks exactly like a
quiet week.** For a trail whose entire purpose is settling disputes, silently
reading as "nothing happened" is the worst available failure. Three things
follow, and they are part of this design rather than nice-to-haves:

- The swallowed error is logged at ``error`` level, not ``warn``, beside the same
  ``requestId``, so it is findable in a log filtered to errors.
- The insert is **awaited** before the response returns. Deferring it past the
  response is unreliable on this deployment, where a function can suspend once it
  has answered, which would turn "occasionally misses a row" into systematic loss.
  The cost is one database round trip added to each mutating request, and that
  cost is named here rather than discovered later.
- The audit screen shows when the most recent entry was recorded. A trail that
  stopped three days ago is then visible as a stale timestamp instead of an empty
  list, which is the only cheap way to tell the two apart.

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

   audit_recent  { at: -1, _id: -1 }                          the log, newest first
   audit_entity  { entity: 1, entityId: 1, at: -1, _id: -1 }  this record's history

Both carry ``_id`` as the final key. Paging here is keyset, and ``at`` is not
unique: two entries written in the same millisecond would page inconsistently
without a tiebreak. That is the same shape as every other keyset index in this
repository.

The validator pins ``actorRole`` to the role enum and ``action``/``entity`` to
strings. ``requested`` and ``before`` are free-form objects by necessity: they
mirror whatever the audited route accepts.

Reading it
==========

``GET /api/admin/audit`` with keyset paging, sorted by ``at`` descending, the same
cursor machinery every other list uses. Filters: ``entity``, ``entityId``,
``actorId``, and a date range.

**It carries ``requireAuth()`` on the route itself, and that is not belt and
braces.** The first draft rested access control entirely on the ``danger`` domain
falling out of the ``RULES`` catch-all, which does not do what it needed to do.
``rolePermissions`` says so in its own header:

  *It acts ONLY when an admin session resolved, so an anonymous request falls
  through to each route's own guards exactly as it did before this file existed.*

It is strictly tightening. It can 403 a signed-in editor; it never authenticates
anybody. An anonymous request passes through it untouched, so a read route with
no guard of its own would have served the entire log, which this same document
describes as a second store of buyer emails, phone numbers and message text, to
anyone who asked without a cookie.

Every other admin route in this repository already attaches ``requireAuth()`` or
``requireAdmin()`` per route, and the reason is exactly this. The audit route is
not an exception to that pattern, and the two controls compose:

- ``requireAuth()`` establishes that there is a session at all.
- ``rolePermissions`` then finds ``danger`` for the path and refuses any role that
  does not hold it, which is owner and developer only.

**No extra ``RULES`` entry is added.** The first draft proposed one directly above
the catch-all, justified as protection against somebody inserting a rule below it.
That justification is wrong twice over: ``domainFor`` is first match wins, so a
rule inserted below the catch-all can never match anything under ``/api/admin/``
and is inert, and the file argues at length that unmatched-falls-to-``danger`` is
the deliberate safe default rather than a fragility. Adding a redundant rule to
guard against an impossible failure would make that file worse.

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

  **It cannot be served from ``/api/admin/audit``.** Agents are the primary users
  of that editor and they hold ``listings``, not ``danger``, so that endpoint
  403s for exactly the role the panel is for. The obvious fix is worse than the
  problem: exposing the same data under a ``/api/admin/properties/`` path would
  resolve to the ``listings`` domain and hand every agent the full trail,
  ``before`` bodies and buyer personal data included.

  So the panel is served by a second, narrower endpoint:

  .. code-block:: text

     GET /api/admin/properties/:id/history   ->  { at, actorName, action }[]

  Three fields, no ``requested``, no ``before``, no ``path``. "Tobi marked this
  under offer two days ago" is the whole question an agent has on that screen, and
  it carries no personal data beyond a colleague's name. The full entry stays
  behind ``danger``.

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
