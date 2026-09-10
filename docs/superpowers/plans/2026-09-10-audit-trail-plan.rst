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

   /** The entity kinds an audit entry can name, derived from the URL prefix. */
   export const AUDIT_ENTITIES = [
     "property", "post", "revision", "category", "image", "enquiry",
     "user", "invite", "testimonial", "stat", "note", "settings",
     "session", "auth", "unknown",
   ] as const;
   export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

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
   }

   /** Both no-op when called above the middleware, so a route need not check. */
   export function auditBefore(c: Context<AppEnv>, doc: Record<string, unknown>): void;
   export function auditActor(c: Context<AppEnv>, user: AuthUser): void;

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
   export const REDACT_KEYS: readonly string[] = [ ... see spec ... ];
   /** Deep, case-insensitive on the key name, walks objects and arrays alike. */
   export function redact(value: unknown): unknown;

Case-insensitive, and it must recurse through arrays as well as objects, because
a body can carry ``{ users: [{ password: "..." }] }``. Depth is capped so a
cyclic or absurdly nested body cannot hang the request; past the cap the subtree
becomes ``"[deep]"``.

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
7. Read the body **only** when ``content-type`` is JSON, through
   ``c.req.json()``, inside a try/catch that yields ``null``. Redact it. If the
   redacted JSON exceeds 16KB, store ``{ _truncated: true }`` instead.
8. Insert. **Wrap the whole insert in try/catch**: on failure log with the same
   ``requestId`` and swallow. A failed audit write never fails the request.

Entity and action derivation is a table over path prefixes, in the same spirit as
``RULES`` in ``packages/identity/src/middleware.ts``, and it lives beside that
table's cousin rather than being scattered:

.. code-block:: text

   POST   /admin/properties          -> property, create
   PATCH  /admin/properties/:id      -> property, update
   DELETE /admin/properties/:id      -> property, delete
   POST   /admin/properties/:id/:op  -> property, op:<op>
   POST   /auth/password/login       -> auth,     op:login

A prefix nothing matches yields ``entity: "unknown"`` and the method-derived
action, which is why ``unknown`` is a valid enum value.

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
  Add ``{ prefix: "/api/admin/audit", domain: "danger" }`` **directly above** the
  ``/api/admin/`` catch-all. The catch-all already produces the same answer, so
  this is redundant today and deliberately so: relying on a fallthrough for an
  access decision breaks silently the first time somebody inserts a rule below it.
  Say that in a comment.

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

Call ``auditBefore(c, doc)`` where the route already holds the prior document.
Where it does not already read one, **do not add a read to get it**: the entry is
complete without ``before``, and buying detail with an extra database round trip
on every write is the wrong trade. Report any route where you skipped for this
reason.

Targets: property patch and ops, user role/disable/enable, post patch and ops,
enquiry patch, and the ``PUT`` routes for testimonials, stats and categories.

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
- A **History panel on the property editor**, filtered to that listing, so "what
  happened to this house" is answered where it is asked.
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
