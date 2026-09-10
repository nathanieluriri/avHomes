/**
 * The test plan, held as a file rather than as a promise in a pull request.
 *
 * Nothing here runs. There is no test runner in this repository yet and adding
 * one is a separate, explicit decision. This exists so the work is written down
 * at the moment the reasoning was fresh, in the order that matters.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE THIS PLAN IS BUILT AROUND
 *
 * A green suite has repeatedly meant nothing in systems shaped like this one.
 * The bugs that ship are not "the function returns the wrong number"; they are
 * "the mechanism was correct and complete, and nothing called it, or something
 * called it differently in production than in the test."
 *
 * So every item below names WHO CALLS IT IN PRODUCTION, and the test is only
 * worth writing if it goes through that same caller.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export {};

/* ──────────────────────────── 1. HIGHEST VALUE ────────────────────────────
 *
 * TODO(test): composition. Drive every mounted route through the REAL
 *   `createApp()`, not a hand-built router. A test app that registers its own
 *   dependencies hides a missing wire in the composition root, and that exact
 *   shape is the most expensive bug class in this design. Assert specifically:
 *     - `mediaRoutes` received a storage port (an unconfigured one answers 501,
 *       not 500)
 *     - `teamRoutes` and `enquiriesPublicRoutes` received the SAME mailer
 *       instance, so a recorder injected once catches both
 *
 * TODO(test): mount order is the security model. For each public read route,
 *   assert `c.get('user')` is undefined even when a VALID session cookie is
 *   sent. This is the property the layout exists to create, and it is one
 *   accidental `app.route` reorder away from silently disappearing.
 *
 * TODO(test): the origin guard refuses an ABSENT Origin on every unsafe method,
 *   and matches the allow-list by EQUALITY. Include a case for
 *   `https://evil-avhomes.vercel.app` against an allowed `avhomes.vercel.app`,
 *   which is what a suffix match would wrongly admit.
 *
 * TODO(test): the domain gate. Drive every prefix in `RULES` through the real
 *   app with each role, and assert the `/api/admin/` catch-all gives `danger`
 *   for an unclassified path. A drifted prefix must fail loudly.
 *
 * TODO(test): exactly one door is open. With Clerk configured, the password
 *   routes answer 501; without it, the exchange answers 501. An always-live
 *   password endpoint alongside Clerk is a standing MFA bypass.
 */

/* ──────────────────────── 2. THINGS THAT SILENTLY LIE ─────────────────────
 *
 * TODO(test): keyset cursors across sorts. Mint a cursor under `newest`, spend
 *   it under `price-high`, assert a 400. In Postgres this raised a type error;
 *   in MongoDB the comparison SUCCEEDS against a different BSON type and returns
 *   a wrong page with no error at all. This is the sharpest trap in the port.
 *
 * TODO(test): paging is exact at a value boundary. Insert 30 listings that share
 *   one `publishedAt`, page through at limit 10, assert every id is seen exactly
 *   once. This is what the `_id` tiebreaker exists for.
 *
 * TODO(test): CAS. Two concurrent `saveProperty` calls with the same
 *   `baseRevision`: exactly one wins, the loser gets a 409 whose body carries
 *   the winner's FULL entity, so a client's "load theirs" needs no second read.
 *
 * TODO(test): the default value the application actually writes. `createPost`
 *   stores `emptyDoc()`; put THAT value in the fixture and assert `validateDoc`
 *   accepts it. A doc with an empty content array is invalid under ProseMirror
 *   and locks an editor, and a fixture full of real paragraphs never finds it.
 *
 * TODO(test): `claimInvite` under concurrency. Two exchanges racing for one
 *   address: exactly one user is created, and a failed `createUser` hands the
 *   invite back rather than burning it.
 *
 * TODO(test): a disabled account is refused BEFORE the invite is consulted, so a
 *   revoked teammate with a surviving invite row cannot walk back in.
 */

/* ─────────────────────── 3. BOUNDARIES AND INJECTION ──────────────────────
 *
 * TODO(test): operator injection. POST a body carrying `{"$ne": null}` and a
 *   `__proto__` key at several depths; assert 400 for each, and assert no
 *   document was written.
 *
 * TODO(test): magic-byte sniffing. Upload an HTML file named `photo.png` with
 *   `Content-Type: image/png`; assert 400 and nothing stored. A stored XSS
 *   served from our own origin is what this guard is for.
 *
 * TODO(test): projections. Assert `sourceIp` never appears in any enquiry
 *   response and `passwordHash` never appears in any user response, by walking
 *   the serialised body rather than by reading the projection constant.
 *
 * TODO(test): the rate limiter bounds the DEPLOYMENT. Build TWO apps over one
 *   database and watch the count carry across them. An in-memory limiter passes
 *   a single-app test and resets whenever the platform scales out.
 *
 * TODO(test): the honeypot answers 201 and stores nothing.
 */

/* ─────────────────────────── 4. THE ERROR TABLE ───────────────────────────
 *
 * TODO(test): no route produces a 5xx for an input that can never be accepted.
 *   Walk every registered route with a control character in each path segment
 *   and each string body field; any 5xx is a missing row in the table, and a
 *   client will retry it five times to reach the same permanent answer.
 *
 * TODO(test): driver translation. A duplicate key becomes 409 `duplicate` naming
 *   the field; a `$jsonSchema` rejection becomes 400 carrying the failing rule.
 *   Both are 500s without `fromDriver`, and both are permanent answers.
 *
 * TODO(test): a 500 body in production mode is exactly `{error, requestId}` with
 *   no `debug` block, and the stack reached the LOG instead.
 */

/* ──────────────────────── 5. THINGS TESTS CANNOT SEE ──────────────────────
 *
 * These need a running deployment, not a suite, and pretending otherwise is how
 * the blind spot forms. Written here so they are not mistaken for covered.
 *
 * TODO(verify): every HTTP method the router serves is exported from
 *   `src/app/api/[[...route]]/route.ts`. A missing one is a PLATFORM 405 before
 *   any route is consulted, and every in-process test calls `app.fetch` and
 *   never crosses the platform router. Curl the deployed origin, one method at a
 *   time.
 *
 * TODO(verify): the MongoDB driver bundles and connects from the deployed
 *   function. It needs node:net and node:tls; a local run proves nothing about
 *   the deployment's module resolution.
 *
 * TODO(verify): `next build` bakes `NEXT_PUBLIC_*` values. Changing one in the
 *   dashboard does nothing until the next deploy, which is exactly why
 *   `GET /api/auth/door` answers at runtime instead.
 */

/* ──────────────────── 6. LISTING TRUTH (listings routes) ──────────────────
 *
 * TODO(test): the public route's legacy status shim. `GET
 *   /api/public/properties?status=for-sale` (then `for-rent`, `sold`) still
 *   returns exactly the live listings of the matching deal type, driven
 *   through the real Hono app so the translation table and `buildFilter` are
 *   exercised together, not `buildFilter` called in isolation.
 *
 * TODO(test): a `rentPeriod` on a sale is refused with 400 naming the field,
 *   driven through `PATCH /api/admin/properties/:id`, the only caller that
 *   can set one.
 *
 * TODO(test): a price change. `PATCH /api/admin/properties/:id` with a
 *   changed `priceMinor` appends exactly one `priceHistory` entry, carrying
 *   the signed-in user's id and display name; a patch that changes only the
 *   title appends none, because `saveProperty` reads the old price itself
 *   rather than trusting a flag from the caller.
 *
 * TODO(test): the 51st price change trims the oldest entry, not the newest.
 *
 * TODO(test): a stale `baseRevision` on a price-changing PATCH is the
 *   existing 409, and appends nothing: the CAS miss must discard the whole
 *   guarded update, history push included, not just the `$set` half.
 *
 * TODO(test): the currency lock. `PATCH /api/admin/properties/:id` refuses a
 *   changed `currency` with 409 once `priceHistory` is non-empty, and still
 *   allows it on a listing whose price has never actually changed.
 *
 * TODO(test): switching `listingType` from rent to sale drops a fee kind the
 *   sale side cannot carry (`caution`, `service-charge`) rather than
 *   rejecting the save, whether or not `fees` itself rides the same patch.
 */
