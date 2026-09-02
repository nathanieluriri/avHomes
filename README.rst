=======
AVHomes
=======

Real estate site, API and admin console for AVHomes, built on Next.js 16 over
MongoDB and deployed to Vercel as a single project.

Getting started
===============

.. code-block:: bash

   npm install
   cp .env.example .env.local     # fill in MONGODB_URI and SESSION_SECRET
   npm run db:migrate
   npm run db:bootstrap-owner -- --email you@example.com --name "Your Name" --password "twelve chars min" --apply
   npm run dev

Visit http://localhost:3000 for the site and http://localhost:3000/admin for the
console.

The site renders with **no environment at all**: every read falls back to the
bundled fixtures in ``src/lib/demo-data.ts`` and says so in the log. That is what
makes ``npm run build`` a release gate that tests the code rather than the
environment.

Layout
======

One Next.js application, one Vercel project, one origin. The API is mounted at
``/api`` inside it, so the site, the console and the API share a cookie and there
is no CORS surface anywhere.

.. code-block:: text

   src/app/(site)/     the marketing site        /, /listings, /posts, /contact
   src/app/admin/      the console               /admin/*
   src/app/api/        the API entrypoint        /api/*
   packages/           the API itself

The API lives in npm workspaces under ``packages/``, in five tiers. The direction
is one way and it is the whole design:

.. code-block:: text

                packages/api          the ONLY package allowed to know
               /    |    |    \       both halves of any seam
       listings  content  media  enquiries    never import each other
               \    |    |    /
                   identity                   guards everyone attaches
                      |
                 core  +  db
                      |
                 contracts                    imports nothing; browser safe

============================  ================================================
Package                       Holds
============================  ================================================
``@avhomes/contracts``        Types, the role matrix, document validation,
                              money. The only package the browser compiles.
``@avhomes/core``             The error table, request parsing, keyset paging,
                              ids, environment, the mail port.
``@avhomes/db``               The cached MongoDB client, collection names, the
                              migration runner.
``@avhomes/identity``         Users, sessions, invites, the two auth doors, the
                              origin guard and the domain gate.
``@avhomes/listings``         Properties, testimonials, site counters.
``@avhomes/content``          Posts, revisions, categories.
``@avhomes/media``            The image library and its storage port.
``@avhomes/enquiries``        Contact intake and the inbox.
``@avhomes/api``              ``createApp()``: the composition root.
============================  ================================================

Four rules hold that shape:

1. ``contracts`` imports nothing from another package. A server import there
   would ship the MongoDB driver to a phone.
2. Feature packages never import each other. Every crossing is a **port** with a
   loud default that throws, injected at ``packages/api``.
3. The composition root is a factory, not a module-level singleton, so a test can
   build two apps over one database.
4. The Next.js app imports exactly two packages: ``@avhomes/api`` on the server
   and ``@avhomes/contracts`` in the browser.

Mount order is the security model
=================================

Reading ``packages/api/src/app.ts`` top to bottom is reading the threat model.
A router mounted above ``sessionMiddleware`` is *structurally* incapable of
reading a cookie, because the middleware that would set one has not run and
cannot be reached from inside it. That is a guarantee. "We remembered not to read
the session" is a convention.

.. code-block:: text

    1. request id            minted here, never read from the request
    2. the error table       one implementation, every route answers through it
    3. GET /api/health       ABOVE the db factory: liveness must not need a URI
    4. lazy db factory       publishes a closure; nothing is dialled
   ------------------------------------------------------------------
    5. (machine callbacks)   the slot is empty on purpose
   ------------------------------------------------------------------
    6. GET /api/public/*     ABOVE sessionMiddleware. Cache-Control: public,
                             and cookieless BY CONSTRUCTION
   ------------------------------------------------------------------
    7. originGuard           exact match on unsafe methods, never a suffix
    8. POST /api/enquiries   a public MUTATION, deliberately not cacheable
    9. sessionMiddleware     resolves the cookie to a user or null
   10. rolePermissions       the domain gate over URL prefixes
   ------------------------------------------------------------------
   11. auth, team, listings, content, media, enquiries, dashboard

Authentication
==============

Two doors, and **exactly one is open at a time**. An always-live password
endpoint alongside single sign-on would be a standing bypass of whatever MFA the
provider enforces.

``GET /api/auth/door`` answers which one, at runtime. The Clerk door opens only
when ``CLERK_SECRET_KEY`` **and** ``NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`` are set
**and** ``SITE_ORIGIN`` is not a ``*.vercel.app`` alias, because a production
Clerk key refuses to load on a deploy alias and the symptom is a blank screen.
Otherwise the password door is live. Either way, membership is invite only and
one ``admit()`` decides it.

The way back in when the last owner is locked out is
``npm run db:bootstrap-owner``. That is why the password door has no reset flow.

Environment
===========

``.env*`` is gitignored, so this table is the reference rather than a checked-in
example file. Nothing here is read at import or at construction: every value
defaults to empty and is checked at the point of use, so the build runs with none
of it and a missing capability answers 501 naming the variable to set.

==================================  ==========  =============================================
Variable                            Needed for  Notes
==================================  ==========  =============================================
``MONGODB_URI``                     storage     Atlas connection string. Network access must
                                                allow ``0.0.0.0/0``: serverless functions have
                                                no stable egress IP, so security rests on
                                                SCRAM and TLS.
``MONGODB_DB``                      storage     Defaults to ``avhomes``.
``SESSION_SECRET``                  sessions    At least 32 characters, refused rather than
                                                padded. ``openssl rand -base64 32``
``SITE_ORIGIN``                     always      Canonical origin. Invite links and canonical
``NEXT_PUBLIC_SITE_ORIGIN``                     URLs are built from it, never from the Host
                                                header, which is attacker controlled.
``APP_ORIGINS``                     previews    Extra EXACT origins allowed on unsafe methods,
                                                comma separated. Never a suffix match: anyone
                                                can deploy to ``*.vercel.app``.
``CLERK_SECRET_KEY``                SSO         Both, on a custom domain, switch the admin to
``NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY``           Clerk. Otherwise the password door is live.
``BLOB_READ_WRITE_TOKEN``           uploads     Vercel dashboard, Storage, Blob.
``RESEND_API_KEY``                  mail        Invites still work without mail: the URL is
``MAIL_FROM``                                   returned so it can be sent by hand.
``ENQUIRY_NOTIFY_TO``               mail        Where a new enquiry is announced. Empty means
                                                do not send.
``AVHOMES_DEBUG_ERRORS``            debugging   ``1`` adds a ``debug`` block to every error
                                                response. On outside production; ``0`` forces
                                                it off.
==================================  ==========  =============================================

Errors
======

One table, in ``packages/core/src/errors.ts``. Two rules decide every row:

- **A 5xx is transient by a client's retry policy.** So an input that can never
  be accepted is a 4xx, or a caller spends thirty seconds re-asking a question
  with one permanent answer. Anything reaching 500 is a bug in the table.
- **Nothing outside the table is described to the caller in production.** The
  detail goes to the log beside the same ``requestId``.

Every response carries ``requestId`` in the body and ``x-request-id`` in the
headers. Outside production, or with ``AVHOMES_DEBUG_ERRORS=1``, it also carries
a ``debug`` block with the exception name, message and a trimmed stack.

MongoDB's own errors are translated rather than escaping as 500s: a duplicate key
becomes ``409 duplicate`` naming the field, a schema-validator rejection becomes
``400`` carrying the failing rule.

============================  =======  ==================================
Condition                     Status   Body
============================  =======  ==================================
Not authenticated             401      ``{error: 'unauthenticated'}``
Not permitted                 403      ``{error: 'forbidden', reason}``
Absent or destroyed           404      ``{error: 'gone'}``
Malformed                     400      ``{error: 'bad_request', detail, issues}``
Document invalid              422      ``{error: 'invalid_document', path, reason}``
CAS lost                      409      ``{error: 'stale_write', expected, actual, <entity>}``
Refused, no race              409      ``{error: 'precondition_failed', operation}``
Unique conflict               409      ``{error: 'duplicate', field}``
Rate limited                  429      ``{error: 'rate_limited', retryAfter}``
Not configured                501      ``{error: 'not_implemented', feature, hint}``
Dependency failed             502      ``{error: 'upstream_failed', service}``
Unhandled                     500      ``{error: 'internal'}``
============================  =======  ==================================

Data conventions
================

- **Timestamps are epoch-millisecond integers**, never a BSON date. The one
  exception is ``expiresAtDate``, written beside a real expiry solely so a TTL
  index can sweep the row; it is never read by the application.
- **Money is an integer in minor units** with its currency beside it. 100 kobo
  per naira.
- **Ids are prefixed, time-sortable strings**, never ``ObjectId``. An ObjectId
  serialises differently depending on the path it takes to JSON, so the id in a
  URL stops being the id in the document.
- **Soft delete is a nullable timestamp**, never a boolean.
- **Mutable aggregates carry a monotonic ``revision``**, and it is the CAS token.
  A write sends ``baseRevision``; a lost race is a 409 carrying the full current
  entity from a single re-read, so a client's "load theirs" needs no second
  request.
- **Every enum-ish field carries a JSON Schema validator**, which is the direct
  replacement for a SQL ``CHECK``. A TypeScript union is compile-time only.
- **Paging is keyset, never skip.** The cursor carries the sort key that minted
  it, and spending it under another sort is a 400. This is not defensive:
  MongoDB orders across BSON types, so the mismatch would silently return a
  *wrong page* rather than an error.
- **Never spread a request body into an update.** ``$set: {...body}`` is the
  Mongo-shaped equivalent of SQL injection.

Migrations
==========

MongoDB is schemaless; its indexes and validators are not.

.. code-block:: bash

   npm run db:migrate -- --dry    # what would run
   npm run db:migrate             # apply, then verify by querying the server

The runner reads the indexes back off the server afterwards rather than trusting
the file. Migrations are numbered ``.ts`` files under
``packages/db/src/migrations``; read the folder for the next number, never a
document.

Deploying
=========

One Vercel project. The function pins the Node runtime: password hashing uses
``node:crypto`` scrypt and the MongoDB driver needs ``node:net`` and
``node:tls``, none of which exist on the edge runtime.

MongoDB Atlas network access must allow ``0.0.0.0/0``, because serverless
functions have no stable egress IP. Security rests on SCRAM credentials and TLS.

Verifying
=========

.. code-block:: bash

   npm run build       # the gate
   npx tsc --noEmit
   npm run lint

There is no test suite yet. The plan for one, in the order that matters and with
the reasoning attached, is in ``packages/api/src/TESTS.todo.ts``. Three items in
it are marked ``TODO(verify)`` because they cannot be covered by a suite at all:
they need a real deployment, and pretending otherwise is how the blind spot
forms.
