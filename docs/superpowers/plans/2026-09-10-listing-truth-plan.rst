====================================
Listing truth: implementation plan
====================================

:Date: 2026-09-10
:Spec: ``docs/superpowers/specs/2026-09-10-listing-truth-design.rst``
:Branch: ``listing-truth``

The spec is the authority. Where this plan and the spec disagree, the spec wins and
the plan is wrong.

Global constraints
==================

These bind every task. A reviewer checks them on every diff.

1. **No tests.** Standing project rule and an explicit instruction for this session.
   Never create a test file, never add a runner, never add a testing dependency.
   Coverage intentions are recorded as ``TODO(test):`` comments beside the code, and
   the cross-cutting ones are appended to ``packages/api/src/TESTS.todo.ts`` in the
   idiom already there.
2. **No em dashes** anywhere: code, comments, copy, commit messages. Use a period, a
   comma, a colon, or parentheses.
3. **Comments say what the code does or why it exists, in one line where possible.**
   No preamble, no restating the function name. Comment units, workarounds,
   invariants, and surprising choices. Skip the comment when the code is clear.
4. **Admin copy is plain English and short.** "Under offer", not "Offer accepted,
   pending exchange". If a label needs a sentence to explain it, the label is wrong.
5. **Money is an integer in minor units** with its currency beside it. Never a float,
   never a formatted string in storage.
6. **Never spread a request body into an update.** No ``$set: {...body}``.
7. **Feature packages never import each other.** ``contracts`` imports nothing from
   another package.
8. **The three gates must pass** before a task is done: ``npm run build``,
   ``npx tsc --noEmit``, ``npm run lint``. Use ``npm run typecheck`` rather than a
   bare ``tsc`` if ``.next/types`` is missing.
9. **Stage specific paths.** Never ``git add .``, ``git add -f`` or ``git commit -a``.
   Another session is live in this working tree.

Task 1: contracts
=================

Files
  ``packages/contracts/src/types.ts``, ``packages/contracts/src/money.ts``,
  ``packages/contracts/src/index.ts``

Add to ``types.ts``
-------------------

.. code-block:: ts

   export const LISTING_TYPES = ["sale", "rent"] as const;
   export type ListingType = (typeof LISTING_TYPES)[number];

   export const RENT_PERIODS = ["year", "month", "night"] as const;
   export type RentPeriod = (typeof RENT_PERIODS)[number];

   export const FEE_KINDS = ["agency", "legal", "caution", "service-charge"] as const;
   export type FeeKind = (typeof FEE_KINDS)[number];

   /** Recurs with the rent rather than being paid once at move in. */
   export const RECURRING_FEE_KINDS: readonly FeeKind[] = ["service-charge"];

   /** Which fee kinds a listing of each type can carry. */
   export const FEE_KINDS_FOR: Record<ListingType, readonly FeeKind[]> = {
     sale: ["agency", "legal"],
     rent: ["agency", "legal", "caution", "service-charge"],
   };

   export interface ListingFee {
     kind: FeeKind;
     amountMinor: number;
     /** Defaults to the listing's currency. Stored so a fee can disagree. */
     currency: string;
   }

   export interface PriceChange {
     at: number;
     fromMinor: number;
     toMinor: number;
     currency: string;
     byUserId: string | null;
     /** SNAPSHOT of who changed it, as EnquiryMessage.authorName is. */
     byName: string;
   }

   export const PRICE_HISTORY_MAX = 50;

Replace ``PROPERTY_STATUSES``
-----------------------------

.. code-block:: ts

   export const PROPERTY_STATUSES = [
     "draft", "live", "under-offer", "closed", "archived",
   ] as const;

   export const PUBLIC_PROPERTY_STATUSES: readonly PropertyStatus[] = [
     "live", "under-offer", "closed",
   ];

``Property`` gains
------------------

.. code-block:: ts

   listingType: ListingType;
   /** Null on a sale. Absent on a legacy row; see readRentPeriod. */
   rentPeriod: RentPeriod | null;
   fees: ListingFee[];
   priceHistory: PriceChange[];

Add to ``money.ts``
-------------------

.. code-block:: ts

   export interface PriceShape {
     listingType: ListingType;
     rentPeriod: RentPeriod | null;
     currency?: string;
   }

   export function periodSuffix(period: RentPeriod | null): string;
   // year -> "/yr", month -> "/mo", night -> "/night", null -> ""

   export function formatPrice(minor: number, shape: PriceShape): string;
   export function formatPriceShort(minor: number, shape: PriceShape): string;

   export function statusLabel(status: PropertyStatus): string;
   // Draft, Live, Under offer, Closed, Archived

   export function listingLabel(type: ListingType, status: PropertyStatus): string;
   // see the spec's table; ten pairs, all covered, no default branch that hides a
   // missing case from the compiler

   export function isRecurringFee(kind: FeeKind): boolean;

   /** At most one fee per kind, last wins. */
   export function normalizeFees(fees: readonly ListingFee[]): ListingFee[];

   /** Rent for one period plus every non-recurring fee in the listing currency. */
   export function moveInTotalMinor(input: {
     priceMinor: number;
     currency: string;
     listingType: ListingType;
     fees: readonly ListingFee[];
   }): { minor: number; excluded: FeeKind[] };

   /** Legacy rows have no rentPeriod key; a rental without one is per year. */
   export function readRentPeriod(
     stored: RentPeriod | null | undefined,
     listingType: ListingType,
   ): RentPeriod | null;

``moveInTotalMinor`` includes the rent itself only when ``listingType === "rent"``.
Fees whose ``currency`` differs from the listing's are excluded from ``minor`` and
returned in ``excluded``.

``listingLabel`` is a lookup over the pair, written so that adding a status without
adding its labels is a compile error. Do not write a ``default:`` that returns the
status string.

Delete
------

The old ``statusLabel`` branches returning "For Sale" and "For Rent". Nothing public
renders a raw status after this task.

Also
----

- ``TODO(test):`` markers per the spec's Tests section, beside each new function.
- Export everything new from ``index.ts``.

Task 2: migration 0007 and the stored shape
===========================================

Files
  ``packages/db/src/migrations/0007_listing_truth.ts`` (new),
  ``packages/db/src/migrations/index.ts``,
  ``packages/listings/src/schema.ts``

Read ``packages/db/src/migrations/0005_enquiry_threads.ts`` first. Match its shape
exactly: a ``Migration`` with ``tag``, a ``why`` written as prose that states the
rejected alternative, and ``up(db)`` using ``ensureCollection`` and ``ensureIndex``.

The ``why`` must say, in its own words, why this migration backfills at all when
``0005`` argued against backfilling: the old status values are present and invalid
under the new enum, not absent, so no read-time coalesce can resolve them without
keeping the old vocabulary alive forever.

Order inside ``up()``
---------------------

**Validator first, then data, then indexes.** ``validationLevel`` is ``"moderate"``
(``migrate.ts:119``), which validates updates to documents that currently satisfy the
schema. A ``for-sale`` row satisfies the 0001 validator, so rewriting its status
before the collMod is checked against the old enum and rejected. After the collMod
the row no longer satisfies the schema, moderate stops validating it, and the
backfill goes through. Data-first fails on the first run.

Backfill
--------

Five ``updateMany`` calls, one per old value, in this order:

===========  =================================================
Old status   ``$set``
===========  =================================================
for-sale     ``{listingType:"sale", status:"live"}``
for-rent     ``{listingType:"rent", status:"live"}``
sold         ``{listingType:"sale", status:"closed"}``
draft        ``{listingType:"sale", status:"draft"}``
archived     ``{listingType:"sale", status:"archived"}``
===========  =================================================

``rentPeriod``, ``fees`` and ``priceHistory`` are **not** written. Their absence is
resolved on read.

Sum the ``modifiedCount`` of the last three and log it as the defaulted count, in
plain words, naming what to do about it:

.. code-block:: text

   listingType defaulted to "sale" on 7 rows (draft, sold or archived). A row that
   was actually a rental needs changing by hand in the admin.

Validator
---------

``ensureCollection`` on ``properties`` with the ``status`` enum replaced,
``listingType`` added to ``required`` and to ``properties`` as an enum, and
``rentPeriod`` (enum plus null, **not** required), ``fees`` and ``priceHistory``
added as arrays with item schemas. Pin ``fees[].kind`` to ``FEE_KINDS``. Reuse the
``TS``/``INT``/``STR``/``NULLABLE_STR`` constants that ``0005`` defines locally.

Index
-----

**Do not touch ``properties_public``.** ``ensureIndex`` is a bare ``createIndex``
with no drop (``migrate.ts:124``), so recreating a live index name with different
keys is an ``IndexKeySpecsConflict`` and ``npm run db:migrate`` throws. 0001 always
runs first, so this happens on a fresh database too.

Add a second index instead, used only when a type is named:

.. code-block:: ts

   await ensureIndex(
     db,
     COLLECTIONS.properties,
     { listingType: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1 },
     { name: "properties_public_type" },
   );

Equality fields first, sort key last. Leaving ``properties_public`` alone also keeps
the default public list's sort index-provided, which putting an unused
``listingType`` in the middle of it would have cost.

Register
--------

Append ``migration0007`` to ``MIGRATIONS`` in ``index.ts``. Never renumber a shipped
tag.

``schema.ts``
-------------

``PropertyDoc`` gains the four fields. ``rentPeriod``, ``fees`` and ``priceHistory``
are optional on the doc type (``?``) because legacy rows do not carry them.

``toProperty`` **stops being a spread and becomes a field-by-field mapper.** As it
stands it is:

.. code-block:: ts

   const { _id, ...rest } = doc;
   return { id: _id, ...rest };

which carries absence straight through, so ``Property.fees`` would be ``undefined``
at runtime on every legacy row and the first ``.map`` in the UI would throw. Copy the
idiom from ``toEnquiry`` in ``packages/enquiries/src/index.ts``, which does exactly
this for exactly this reason. The three resolving lines:

.. code-block:: ts

   rentPeriod: readRentPeriod(doc.rentPeriod, doc.listingType),
   fees: normalizeFees(doc.fees ?? []),
   priceHistory: doc.priceHistory ?? [],

This is the one file where the optionality exists. Nothing above it sees an
undefined.

Verify
------

``npm run db:migrate -- --dry`` then ``npm run db:migrate``, and confirm the runner's
read-back of the index matches. Then re-run the seeder and confirm the new validator
accepts what it writes.

Task 3: repo and routes
=======================

Files
  ``packages/listings/src/repo.ts``, ``packages/listings/src/routes/public.ts``,
  ``packages/listings/src/routes/admin.ts``

Repo
----

``createProperty``
  The ``PropertyDoc`` literal gains ``listingType: "sale"``. Without it every insert
  fails the new validator and the "New listing" button stops working, because
  ``validationLevel: "moderate"`` validates all inserts.

``ListQuery`` and ``buildFilter``
  Gain a ``listingType`` clause. **It is a separate clause from the existing ``type``
  filter**, which means ``PropertyType`` (Villa, Duplex) in that same function. Do
  not merge or rename them.

``saveProperty``
  Takes an actor and reads before writing:

  .. code-block:: ts

     saveProperty(db, id, patch, baseRevision, actor: { userId: string; name: string })

  Read the current row, and if the price moved, ride the history push in the same
  guarded update:

  .. code-block:: ts

     $push: { priceHistory: { $each: [change], $slice: -PRICE_HISTORY_MAX } }

  The read-then-write is safe because of the CAS: anything that changed the price in
  between also moved ``revision``, so the guarded update misses and returns the
  existing 409.

  **Record a change only when the old price was greater than zero and the new one
  differs.** ``createProperty`` seeds ``priceMinor: 0``, so without that guard every
  listing gets a junk first entry recording a rise from nothing, and the currency
  lock below fires immediately on a brand new listing.

Public route
------------

Query schema gains ``listingType: z.enum(LISTING_TYPES).optional()`` and the new
status values. It keeps accepting the legacy trio and translates:

.. code-block:: ts

   // Deletable one release after this ships. A tab left open across a deploy
   // still sends the old vocabulary.
   const LEGACY_STATUS = {
     "for-sale": { listingType: "sale", status: "live" },
     "for-rent": { listingType: "rent", status: "live" },
     sold: { listingType: "sale", status: "closed" },
   } as const;

Admin route
-----------

- Write schema gains ``listingType``, ``rentPeriod``, ``fees``.
- A ``rentPeriod`` on a sale is a 400 naming the field. Not a silent null.
- Fee amounts parse through ``parseMajor`` and refuse through
  ``moneyRefusalMessage``, exactly as the price does.
- Fees are run through ``normalizeFees`` on write, and any fee whose kind is not in
  ``FEE_KINDS_FOR[listingType]`` is dropped, not rejected: switching a listing from
  rent to sale is a legitimate act that strands a caution fee.
- ``AdminListQuery`` is ``.strict()``, so it gains
  ``listingType: z.enum(LISTING_TYPES).optional()`` or the new filter is a 400.
- ``LifecycleOp`` in ``repo.ts`` is a union and ``TRANSITIONS`` is a
  ``Record<LifecycleOp, PropertyStatus>``, so **extend the union first** or the new
  keys are a compile error. The full map:

  .. code-block:: ts

     publish:    "live",        // from draft, archived
     unpublish:  "draft",       // from live, under-offer
     markOffer:  "under-offer", // from live
     relist:     "live",        // from under-offer, closed
     close:      "closed",      // from live, under-offer
     archive:    "archived",
     unarchive:  "draft",
     restore:    "draft",

  ``relist`` is not optional. The reason ``under-offer`` exists is that a collapsed
  deal must not force a lie, and a state with no way out is worse than the state it
  replaced.
- ``byName`` snapshots the acting user's display name at the time of the change, the
  way ``EnquiryMessage.authorName`` does. Never a join.
- The currency field is only editable while ``priceHistory`` is empty. Changing it
  otherwise is a 409 ``precondition_failed``, because a history in mixed currencies
  is not comparable.

Task 4: fixtures, seeder surface and the dashboard count
========================================================

Files
  ``src/lib/demo-data.ts``, ``src/lib/types.ts``, ``src/lib/data.ts``,
  ``src/app/admin/page.tsx``

- ``PropertySeed`` keeps its readable vocabulary. ``statusMap`` becomes a map to the
  pair:

  .. code-block:: ts

     const statusMap = {
       "For Sale":    { listingType: "sale", status: "live" },
       "For Rent":    { listingType: "rent", status: "live" },
       Sold:          { listingType: "sale", status: "closed" },
       "Under Offer": { listingType: "sale", status: "under-offer" },
       "Let Agreed":  { listingType: "rent", status: "under-offer" },
       Let:           { listingType: "rent", status: "closed" },
     } as const;

- Extend the seed union to those six values.
- Give the existing rentals a ``rentPeriod``. Make one a monthly serviced apartment
  and one a nightly short let, so the new formatting has something to render.
- Give at least three listings ``fees`` (a sale with agency and legal, a rental with
  all four), and one listing a ``priceHistory`` with a reduction dated inside the
  last 90 days so the reduced marker appears on a fresh checkout.
- Add one ``Under Offer`` and one ``Let Agreed`` fixture.
- ``src/lib/types.ts`` and ``src/lib/data.ts`` re-export the new names.
- ``src/app/admin/page.tsx:319``: the live count reads ``data.listings.live``.

Task 5: public site
===================

Files
  ``src/app/(site)/listings/page.tsx``, ``src/app/(site)/listings/[slug]/page.tsx``,
  ``src/components/PropertyCard.tsx``, ``src/components/AgentPanel.tsx``,
  ``src/components/FilterBar.tsx``, ``src/components/SearchStrip.tsx``

The filter fix
--------------

Replace the broken comparison with the spec's translation table. This is the
regression that shipped; treat it as the task's primary requirement, not a detail.

.. code-block:: ts

   const URL_STATUS: Record<string, { listingType: ListingType; status: PropertyStatus }> = {
     "For Sale":    { listingType: "sale", status: "live" },
     "For Rent":    { listingType: "rent", status: "live" },
     "Under Offer": { listingType: "sale", status: "under-offer" },
     "Let Agreed":  { listingType: "rent", status: "under-offer" },
     Sold:          { listingType: "sale", status: "closed" },
     Let:           { listingType: "rent", status: "closed" },
   };

An unrecognised value filters nothing. The header block keeps switching on the same
display-case strings it already uses.

Empty state
-----------

When the filtered set is empty, render a short block in the grid's place: one line
of plain copy and a link that clears the filter. Match the admin's existing empty
grades in weight. Do not add an illustration.

Cards and detail
----------------

- ``PropertyCard`` and ``AgentPanel`` use ``listingLabel`` and the new
  ``formatPriceShort`` shape.
- The detail page gains a letting block for rentals: the period, each fee on its own
  line, and the move in total. Recurring fees are visually separated from one off
  ones and labelled so a tenant cannot mistake which is which. When
  ``excluded`` is non empty, say so in one plain line rather than hiding it.
- A "Price reduced" marker on card and detail when the newest ``priceHistory`` entry
  lowered the price within 90 days.
- ``FilterBar`` and ``SearchStrip`` gain "Under Offer" and "Let Agreed".

Task 6: admin UI
================

Files
  ``src/app/admin/properties/page.tsx``,
  ``src/app/admin/properties/[id]/page.tsx``,
  ``src/components/admin/Palette.tsx``

List screen
-----------

- Status filter lists the five lifecycle values through ``statusLabel``.
- A type filter beside it: All, Sale, Rent.
- Row shows the lifecycle badge plus a quieter Sale/Rent chip.
- ``STATUS_TONE`` rekeyed. ``Tone`` is ``"neutral" | "green" | "amber" | "wine" |
  "red"`` (``src/components/admin/ui.tsx:670``) and nothing else compiles:

  .. code-block:: ts

     draft: "amber",
     live: "green",
     "under-offer": "wine",
     closed: "neutral",
     archived: "neutral",

Editor
------

- A Sale/Rent segmented control at the top of the pricing section.
- Period select, visible only for Rent: "Per year", "Per month", "Per night".
- One fee row per kind in ``FEE_KINDS_FOR[listingType]``, each refusing like the
  price input does. Empty means the fee does not apply, not zero.
- A move in total line under the fee rows for rentals, recalculated live.
- A price history panel: date, old, new, who. Collapsed when empty.
- ``LIFECYCLE`` at line 118 is what renders these buttons, so it gains a row per new
  op or the server capability is unreachable. Plain English labels, and the ``when``
  guard from the transition table:

  .. code-block:: ts

     { op: "markOffer", label: "Mark under offer", when: (p) => p.status === "live" },
     { op: "relist",    label: "Back on the market",
       when: (p) => p.status === "under-offer" || p.status === "closed" },
     { op: "close",     label: "Mark closed",
       when: (p) => p.status === "live" || p.status === "under-offer" },

  The guard on the existing ``unpublish`` row at line 128 becomes
  ``p.status === "live" || p.status === "under-offer"``.
- Switching the type says, in one short line, that rent only fees are dropped on
  save. It does not clear typed values before then.

Visual bar for this task
------------------------

The Shopify admin (2026), as the existing ``GAUNTLET.md`` run used it. The new
sections must share the existing section rhythm, input styling and empty grades.
A critic will drive ``/admin/properties`` at 1440px and 390px.

Order and dependencies
======================

.. code-block:: text

   1 contracts
     └─> 2 migration ──> 3 repo and routes ──┬─> 5 public site
         └─> 4 fixtures, seeder, dashboard ──┴─> 6 admin UI

Tasks run one at a time. 5 and 6 touch disjoint files but are still dispatched
sequentially, because a shared working tree makes concurrent implementers a
merge problem rather than a speed gain.

Definition of done
==================

- The three gates pass.
- ``npm run db:migrate`` applies 0007 and the runner's index read back matches.
- The seeder writes into the migrated database without a validator rejection.
- ``/listings?status=For+Sale`` returns a non empty set of sale listings.
- A filter matching nothing renders the empty state.
- ``/admin/properties`` shows both filters and a listing editor with the type
  toggle, period, fees and history panel.
- The branch merges to master and pushes.
