=================================
Audit trail: implementation plan
=================================

:Date: 2026-09-10
:Spec: ``docs/superpowers/specs/2026-09-10-audit-trail-design.rst``
:Worktree: ``C:\avhomes-audit``, branch ``audit-trail``

The spec is the authority. Where this plan and the spec disagree, the spec wins.

Global constraints
==================

1. **No tests.** Standing project rule. Coverage intentions are ``TODO(test):``
   comments beside the code, cross-cutting ones appended to
   ``packages/api/src/TESTS.todo.ts``.
2. **No em dashes** anywhere: code, comments, copy, commit messages.
3. **Comments say what the code does or why it exists**, one line where possible.
   Comment units, workarounds, invariants and surprising choices.
4. **Admin copy is plain English and short.** "Adaeze changed the price on Ikoyi
   Glass House", not a method and a path.
5. **Feature packages never import each other.** ``packages/audit`` may import
   ``contracts``, ``core`` and ``db``, and nothing else from ``packages/``.
   ``contracts`` imports nothing and is the only package the browser compiles.
6. **Never spread a request body into an update.**
7. **The three gates must pass**: ``npm run build``, ``npx tsc --noEmit`` (use
   ``npm run typecheck``), ``npm run lint``.
8. **Work only in ``C:\avhomes-audit``.** Never touch
   ``C:\Users\Mr Dashi\Downloads\avHomes``: it is a separate working tree with
   another session's uncommitted work in it.
9. **Do not run ``npm install``.** Dependencies are already installed here. If
   you believe you need it, stop and report instead: an install in this repo has
   previously pruned the workspace junctions and emptied ``packages/``.
10. ``git add`` specific paths only. Never ``git add .``.

Task 1: contracts and the request context
=========================================

Files
  ``packages/contracts/src/types.ts``, ``packages/core/src/app-env.ts``

``types.ts`` gains the entry shape exactly as the spec's "What an entry holds"
section gives it, plus:

.. code-block:: ts

   /** The entity kinds an audit entry can name. See the spec's derivation table. */
   export const AUDIT_ENTITIES = [
     "property", "post", "category", "image", "enquiry", "user", "invite",
     "testimonial", "stat", "note", "settings", "session", "auth", "unknown",
   ] as const;
   export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

There is no ``"revision"`` member. ``/admin/revisions/:postId/:revisionId/restore``
records ``entity: "post"`` with the POST's id, because the post is the record that
changed and it is the one worth indexing.

``AuditEntry`` is the WIRE shape and carries ``id``. The stored shape,
``AuditEntryDoc`` with ``_id``, belongs in the audit package beside its repo, the
way ``PropertyDoc`` sits beside ``Property``. Do not put the doc type here.

``unknown`` is in the list on purpose. A route added later whose prefix nothing
recognises must still produce a valid entry, and a validator that rejects it
would turn "we did not teach the mapper about this route" into "the write is
silently unaudited".

``app-env.ts``: ``AppVariables`` gains

.. code-block:: ts

   /** Set by the audit middleware. Absent above it, which is why it is optional. */
   audit?: AuditHandle;

with ``AuditHandle`` declared in ``core`` (it is a shape, not behaviour, so it
does not drag a feature package into ``core``):

.. code-block:: ts

   export interface AuditHandle {
     setBefore(doc: Record<string, unknown>): void;
     /** For routes that establish an actor rather than inherit one. */
     setActor(user: AuthUser): void;
     /** For creates, which mint an id the path does not carry. */
     setEntityId(id: string): void;
   }

   /** All three no-op when called above the middleware, so a route need not check. */
   export function auditBefore(c: Context<AppEnv>, doc: Record<string, unknown>): void;
   export function auditActor(c: Context<AppEnv>, user: AuthUser): void;
   export function auditEntityId(c: Context<AppEnv>, id: string): void;

These are the functions routes call. They exist so a route never writes
``c.get("audit")?.setBefore(...)`` and never has to think about whether the
middleware is above it.

``setActor`` is there for one reason, and it is worth understanding before you
implement the middleware. ``sessionMiddleware`` resolves the cookie BEFORE the
auth routes run, so a person in the act of signing in is still anonymous when the
audit middleware tests for an actor. Without ``setActor`` a successful login
would be dropped for having nobody to attribute it to.

Task 2: collection and migration 0008
=====================================

Files
  ``packages/db/src/collections.ts``, ``packages/db/src/migrations/0008_audit.ts``
  (new), ``packages/db/src/migrations/index.ts``

Read ``0005_enquiry_threads.ts`` first and match its shape: ``tag``, a ``why`` in
real prose that names the rejected alternative, and ``up(db)`` using
``ensureCollection`` and ``ensureIndex``. Copy the local ``TS``/``INT``/``STR``/
``NULLABLE_STR`` constants pattern. Note that ``0007_listing_truth.ts`` uses
``INT = { bsonType: ["long", "int", "double"] }`` for money fields and explains
why; follow whichever is right for each field rather than copying blindly.

The ``why`` must answer: why a separate collection rather than more fields on the
records themselves, and why a TTL rather than keeping entries forever.

Validator
  ``required``: ``_id``, ``at``, ``actorId``, ``actorName``, ``actorRole``,
  ``entity``, ``action``, ``method``, ``path``, ``status``, ``requestId``,
  ``expiresAtDate``. ``actorRole`` pinned to ``ALL_ROLES``, ``entity`` pinned to
  ``AUDIT_ENTITIES``. ``requested`` and ``before`` are ``["object", "null"]`` with
  no inner schema: they mirror whatever the audited route accepts and pinning them
  would make every new field a migration.

Indexes
  Three, all new names, so no conflict with anything:

  .. code-block:: text

     audit_ttl     { expiresAtDate: 1 }              expireAfterSeconds: 0
     audit_recent  { at: -1, _id: -1 }
     audit_entity  { entity: 1, entityId: 1, at: -1, _id: -1 }

  ``expireAfterSeconds: 0`` against a per-document date means "expire at the
  moment in this field". Verify ``ensureIndex`` in ``migrate.ts`` passes options
  through before relying on it.

Register ``migration0008`` in ``index.ts``. Never renumber a shipped tag.

Verify with ``npm run db:migrate -- --dry`` then ``npm run db:migrate``, and
confirm the runner's index read-back shows all three.

Task 3: the audit package
=========================

Files
  ``packages/audit/package.json``, ``packages/audit/src/{index,redact,middleware,repo,routes}.ts``
  (all new), plus a ``paths`` entry in ``tsconfig.json``

``package.json`` copies ``packages/audience/package.json`` exactly, with the name
``@avhomes/audit``. ``tsconfig.json`` gains
``"@avhomes/audit": ["./packages/audit/src/index.ts"]`` in ``compilerOptions.paths``,
which is the step that is easy to miss and produces a confusing module-not-found.

``redact.ts``
-------------

Pure, no imports from anywhere but itself. This is the file where a mistake is a
security bug, so it is separate and small.

.. code-block:: ts

   export const REDACTED = "[redacted]";

   /** Bodies under these prefixes are never read at all. */
   export const NO_BODY_PREFIXES = ["/api/auth/"];

   export const REDACT_KEYS = ["password", "token", "secret", "passwordHash",
                               "threadKey", "sessionId", "apiKey"];

   /** Deep, case-insensitive on the key name, walks objects and arrays alike. */
   export function redact(value: unknown): unknown;
   /** Keeps scalars, shortens long strings and big arrays. See the spec. */
   export function trim(value: unknown): unknown;

Read the spec's "Credentials: excluded by path, not by field name" section before
writing this, because the reasoning decides the shape. The short version: the
route that changes a password takes ``{ current, next }``, two innocuous names
both carrying plaintext, so name matching alone would have written both into a two
year store while appearing to have handled it. The path exclusion is the control;
the key list is defence in depth.

``redact`` is case-insensitive and must recurse through arrays as well as objects,
because a body can carry ``{ users: [{ password: "..." }] }``. Depth is capped so
a cyclic or absurdly nested body cannot hang the request; past the cap the subtree
becomes ``"[deep]"``.

``trim`` implements the spec's per-field rule: scalars always kept, a string over
512 chars becomes ``"[long: N chars]"``, an array over 20 entries becomes
``["[list: N items]"]``, and only if the result still exceeds 64KB does the whole
field become ``{ _truncated: true }``. All-or-nothing truncation was rejected
because it drops the price along with the description, and the price is the field
arguments are about.

**Both functions are applied to ``requested`` AND to ``before``.** ``before``
carries whole stored documents, so it is the field with the most to leak and the
most to bloat. It is safe on the users path today only because
``AUTH_PROJECTION`` happens to exclude ``passwordHash``, and that is luck rather
than a guarantee.

``middleware.ts``
-----------------

.. code-block:: ts

   export function auditTrail(): MiddlewareHandler<AppEnv>;

Order of operations, and each step is load-bearing:

1. If the method is ``GET`` or ``HEAD``, ``await next()`` and return. No entry.
2. Install the handle on the context before ``next()``, so routes can call
   ``auditBefore`` during their own execution.
3. ``await next()``.
4. Resolve the actor: ``c.get("user")`` if the session middleware found one, else
   whatever a route supplied through ``setActor``. If there is neither, return.
   A failed login has no actor and changed nothing.
5. If the response status is not 2xx, return.
6. Derive ``entity`` and ``action`` from the method and path.
7. Capture the query parameters (``c.req.query()``), redacted like any payload.
8. Read the body **only** when the ``content-type`` is JSON **and** the path is
   not under a ``NO_BODY_PREFIXES`` entry, through ``c.req.json()``, inside a
   try/catch that yields ``null``. Then ``redact`` and ``trim`` it.
9. ``redact`` and ``trim`` ``before`` too, if a route supplied one.
10. **Await** the insert, wrapped in try/catch. On failure log at ``error`` level
    with the same ``requestId`` and swallow. A failed audit write never fails the
    request. Do not defer the insert past the response: this deployment can
    suspend a function once it has answered, which would turn occasional loss
    into systematic loss.

Entity, entityId and action derivation is fully specified in the spec's
"Deriving entity, entityId and action" section, including the auth table, the
``ENTITY_BY_SEGMENT`` map, the ``rest`` shapes and the ``"new"`` sentinel.
Implement it from there, not from memory. Two traps in it:

- ``c.req.path`` includes the ``/api`` prefix. Strip it before splitting, or every
  segment index is off by one.
- ``PUT /admin/testimonials/new`` really does arrive with the literal string
  ``"new"`` as its id. Recording that verbatim would file every create in the
  system under one colliding id.

``repo.ts``
-----------

``insertEntry`` and ``listEntries`` using the existing keyset machinery from
``@avhomes/core`` (``keysetFilter``, ``keysetSort``, ``takePage``, ``clampLimit``,
``assertCursorSort``). One sort only, ``at`` descending, so there is no
sort-mismatch cursor case to get wrong.

``routes.ts``
-------------

``GET /admin/audit`` with a ``.strict()`` query: ``entity``, ``entityId``,
``actorId``, ``from``, ``to``, ``limit``, ``cursor``. Returns a ``Page<AuditEntry>``.
No other verbs. Nothing writes through HTTP.

**It carries ``requireAuth()`` on the route.** This is not belt and braces and it
is not optional. ``rolePermissions`` does not authenticate: its own header says it
acts only when a session resolved and that anonymous requests fall through to each
route's own guards. Without ``requireAuth()`` this endpoint would serve the entire
log, personal data included, to anyone without a cookie.

Also add ``GET /admin/properties/:id/history``, returning only
``{ at, actorName, action }[]`` and nothing else. It exists because agents hold
``listings`` and not ``danger``, so the full reader 403s for the exact role the
property editor's history panel is for. Never widen it: serving whole entries on a
``/admin/properties/`` path would hand every agent the buyer data in ``before``.

Task 4: wiring
==============

Files
  ``packages/api/src/app.ts``, ``packages/identity/src/middleware.ts``

``app.ts``
  Mount ``auditTrail()`` immediately after ``rolePermissions()``, before the first
  admin router. Extend the numbered comment block at the top of the file, which is
  the file's own map of the threat model, with the new position and one line on
  why it sits below the gate.

``middleware.ts``
  **No change.** An earlier draft of this plan added an explicit
  ``/api/admin/audit`` rule above the catch-all. Do not. ``domainFor`` is first
  match wins, so a rule inserted below the catch-all can never match anything
  under ``/api/admin/`` and would be inert, and that file argues at length that
  unmatched-falls-to-``danger`` is the deliberate safe default rather than a
  fragility. The redundant rule would guard against an impossible failure and make
  the file worse.

Task 5: enrichment
==================

Files
  ``packages/listings/src/routes/admin.ts``, ``packages/identity/src/routes/team.ts``,
  ``packages/content/src/routes.ts``, ``packages/enquiries/src/index.ts``,
  ``packages/identity/src/routes/doors.ts``

``doors.ts`` is the ``setActor`` case, not a ``setBefore`` case: after a
successful password login and after a successful Clerk exchange, call
``auditActor(c, user)`` so the sign-in is attributable. Nothing else in that file
changes.

Three separate jobs, and the list is short on purpose.

``auditBefore`` targets, and ONLY these two
  - ``PATCH /admin/properties/:id`` and its lifecycle ops
  - ``PATCH /admin/users/:id/role``, disable and enable

  Both already read the prior document, so the call is free.

  **Do not add it to posts.** The editor autosaves 1.5s after each pause and sends
  the full patch, where ``content`` can run to a megabyte, so a before-image there
  writes a complete prior copy of the post on every keystroke pause for two years.
  This repo already solved exactly that: ``savePostRevision`` keeps twenty
  autosaves per post because "Unbounded history of keystrokes is the largest
  collection in a blog nobody reads twice". Posts already have before-images in
  ``post_revisions``; audit records who and when.

  **Do not add it to the enquiry patch or the three PUT upserts.** None of them
  reads the prior document, so each would cost a new round trip on every write to
  manufacture detail. They produce complete entries with ``before: null``.

``auditActor`` targets, in ``packages/identity/src/routes/doors.ts``
  After a successful password login and a successful Clerk exchange. Without it
  the actor is null on exactly the entries the spec promises, the validator
  rejects the insert, and the never-fail policy swallows the rejection, so
  successful logins would be silently unrecorded forever.

``auditEntityId`` targets
  Every create that mints an id: ``POST /admin/properties``, ``POST /admin/posts``,
  ``POST /admin/images``, ``POST /admin/invites``, ``POST /admin/notes``, and the
  three ``PUT`` upserts when the path id is ``"new"``.

Task 6: admin UI
================

Files
  ``src/app/admin/audit/page.tsx`` (new), ``src/app/admin/properties/[id]/page.tsx``,
  ``src/components/admin/nav.tsx``, ``src/lib/types.ts``

- ``/admin/audit``: one row per entry reading as a sentence, who did what to
  which record and how long ago, using ``relative()`` from
  ``src/lib/admin/format.ts`` as the rest of the console does. Expanding a row
  shows changed fields before and after. A redacted value renders as the word
  "hidden", never as ``[redacted]``.
- Filters matching the API. Empty state in the console's existing grade.
- The screen also shows **when the most recent entry was recorded**. A trail that
  silently stopped three days ago must look different from a quiet week, and a
  stale timestamp is the only cheap way to tell those apart.
- A **History panel on the property editor**, filtered to that listing, so "what
  happened to this house" is answered where it is asked. It reads
  ``GET /admin/properties/:id/history``, NOT ``/admin/audit``: agents hold
  ``listings`` and not ``danger``, so the full reader 403s for the very role that
  lives on this screen.
- ``nav.tsx``: ONE array entry, gated to the ``danger`` domain. Keep the diff to a
  single line: this file is being edited concurrently by another session and a
  small diff makes the merge trivial.
- ``src/lib/types.ts`` is an explicit named re-export list. Add ``AuditEntry`` and
  ``AUDIT_ENTITIES`` or the screen cannot import them.

Visual bar: the Shopify admin (2026), matching the console's existing section
rhythm, input styling and empty grades.

Order and dependencies
======================

.. code-block:: text

   1 contracts + core
     └─> 2 collection + migration
           └─> 3 audit package
                 └─> 4 wiring ──┬─> 5 enrichment
                                └─> 6 admin UI

Sequential. Tasks 5 and 6 touch disjoint files but are dispatched one at a time.

Definition of done
==================

- The three gates pass, verified in this worktree, which has its own dependencies
  and none of the other session's work.
- ``npm run db:migrate`` applies 0008 and reads back all three indexes.
- A mutating admin request produces exactly one entry; a ``GET`` produces none; a
  400 produces none.
- A body containing a password field produces an entry with no plaintext in it.
- ``GET /api/admin/audit`` pages, and is refused for a role without ``danger``.
- ``/admin/audit`` renders the log and the property editor shows a history panel.
- Merged to master and pushed.
