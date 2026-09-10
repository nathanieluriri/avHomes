=============================
Listing truth: design
=============================

:Date: 2026-09-10
:Status: approved
:Unit: 1 of 7 on the admin roadmap
:Supersedes: nothing

Why
===

A listing cannot currently say what it is.

``PROPERTY_STATUSES`` is ``["draft", "for-sale", "for-rent", "sold", "archived"]``,
which mixes two unrelated axes. ``draft``, ``sold`` and ``archived`` describe where
a listing is in its life. ``for-sale`` and ``for-rent`` describe what kind of deal
it is. Because they share one field, three things are broken at once:

1. **A closed record cannot say what closed.** A ``sold`` row was either a sale or
   a let, and nothing in the document remembers which. Reporting (roadmap unit 5)
   cannot separate sales closed from lets agreed without guessing.
2. **Rent has no unit.** ``formatPrice`` at ``packages/contracts/src/money.ts:85``
   hardcodes a ``/yr`` suffix for ``for-rent`` and carries the comment "Rentals are
   quoted per year". The assumption is real and correct for most Lagos stock, but
   it is a string in a formatter rather than a field, so a serviced apartment let
   monthly and a short let cannot be expressed at all.
3. **There is no state between listed and closed.** An agent with an accepted offer
   has to choose between leaving it ``for-sale`` (and fielding enquiries on a flat
   that is gone) or marking it ``sold`` (and lying, plus losing the listing from the
   site if the deal collapses).

This unit fixes the model, adds the money detail a Nigerian listing actually needs,
and records price movement. Everything downstream on the roadmap reads this shape,
so it goes first.

The live defect this unit inherits
----------------------------------

**Public status filtering is broken today and returns an empty page.**

``src/app/(site)/listings/page.tsx:35`` reads:

.. code-block:: ts

   if (sp.status && p.status !== (sp.status as PropertyStatus)) return false;

``sp.status`` comes from the URL, where ``FilterBar`` and ``SearchStrip`` push the
display-case value ``"For Sale"``. ``p.status`` is the stored value ``"for-sale"``.
The two can never be equal, so the predicate drops every row.

Measured against the bundled fixtures:

.. code-block:: text

   fixtures total           : 20
   distinct stored statuses : for-sale, for-rent, sold
   rows matching 'For Sale' : 0        <- what the URL asks for
   rows matching 'for-sale' : 10       <- what it should return

The header block twenty lines below compares the *same* display-case value
correctly, so ``/listings?status=For+Sale`` renders the heading "Homes For Sale"
above nothing at all. There is no empty state on this page, so the failure is a
silent blank rather than a message.

This is the exact line the compatibility section below rewrites, so fixing it is
inside this unit, not adjacent to it. Two consequences follow:

- The translation point must map display-case URL values to the model, which is
  what it was always supposed to do.
- **The listings page needs an empty state.** Once the filter genuinely filters,
  empty results become ordinary ("Let Agreed" when nothing is let agreed), and a
  blank page is no longer survivable.

Goal
====

A listing states its deal type, its lifecycle position, its rent period, the fees
attached to it, and how its price has moved. The public site keeps every URL it has
today. The admin gains the controls without gaining vocabulary.

The model
=========

Two fields where there was one
------------------------------

.. code-block:: ts

   export const LISTING_TYPES = ["sale", "rent"] as const;
   export type ListingType = (typeof LISTING_TYPES)[number];

   export const PROPERTY_STATUSES = [
     "draft", "live", "under-offer", "closed", "archived",
   ] as const;

   export const PUBLIC_PROPERTY_STATUSES: readonly PropertyStatus[] = [
     "live", "under-offer", "closed",
   ];

``status`` is now pure lifecycle. ``listingType`` is the deal. A closed rental is
``{listingType: "rent", status: "closed"}`` and reports as a let forever.

``closed`` stays publicly visible because ``sold`` is publicly visible today. A sold
board outside a house is advertising, and removing the listing the day it closes
throws away the agency's best proof of work.

Rent period
-----------

.. code-block:: ts

   export const RENT_PERIODS = ["year", "month", "night"] as const;
   rentPeriod: RentPeriod | null   // null on a sale

``night`` is included now rather than later because short lets are a real and
growing part of Lagos stock, and an enum value costs one line here against a second
migration then.

**Legacy rows are not backfilled.** A property written before this migration has no
``rentPeriod`` key, and the read path resolves that absence exactly as
``channel ?? "form"`` does in ``0005``:

.. code-block:: ts

   rentPeriod ?? (listingType === "rent" ? "year" : null)

That coalesce reproduces today's hardcoded ``/yr`` behaviour precisely, which is why
rewriting a thousand rows to state what their absence already states is not worth
doing.

Fees
----

Fees exist on **both** sides. A Lagos sale carries an agency fee and a legal fee just
as a let does, and gating the field on ``listingType`` means moving it the day
somebody wants that.

.. code-block:: ts

   export const FEE_KINDS = ["agency", "legal", "caution", "service-charge"] as const;
   export const RECURRING_FEE_KINDS: readonly FeeKind[] = ["service-charge"];

   export interface ListingFee {
     kind: FeeKind;
     amountMinor: number;
     /** Defaults to the listing's currency. Stored so a fee can disagree. */
     currency: string;
   }

   fees: ListingFee[]   // never null; absent reads as []

Which kinds the form offers is a UI decision, not a storage one:

============  ========================================================
Listing type  Fee kinds offered
============  ========================================================
``sale``      agency, legal
``rent``      agency, legal, caution, service-charge
============  ========================================================

``recurring`` is **not stored**. It is derived from ``kind`` through
``RECURRING_FEE_KINDS``, because a stored flag can disagree with the kind beside it
and then two fields describe one fact.

At most one fee per ``kind``. The form renders one row per allowed kind so a
duplicate cannot be produced by hand, and the write path de-duplicates by kind with
last-wins, so a malformed payload cannot create two agency fees.

Move-in total
-------------

.. code-block:: ts

   moveInTotalMinor(property): { minor: number; excluded: FeeKind[] }

The sum of the rent (one period) plus every **non-recurring** fee. Service charge is
excluded because it recurs; a tenant asking "what do I need to pack in" is asking
about the one-off outlay.

Fees whose ``currency`` differs from the listing's are **listed but excluded from the
sum**, and returned in ``excluded`` so the UI can say so. There is no FX in this
system and inventing a rate to make a total look tidy is how a buyer gets quoted a
number nobody honours.

Price history
-------------

.. code-block:: ts

   export interface PriceChange {
     at: number;
     fromMinor: number;
     toMinor: number;
     currency: string;
     byUserId: string | null;
     /** SNAPSHOT of who changed it, as EnquiryMessage.authorName is. */
     byName: string;
   }

   priceHistory: PriceChange[]   // never null; absent reads as []

Embedded on the property, not a collection. A property changes price a handful of
times, the history is always read with the property, and a separate collection buys
a join on the hottest read on the site for nothing.

**Capped at 50 entries**, oldest trimmed on write. An unbounded array in a hot
document is the 16MB limit with a countdown on it, which is the same reasoning
``0005`` applied to ``CHAT_MAX_MESSAGES``.

Written only by the admin update path, and only when ``priceMinor`` actually changes.
An update that touches the title does not append a no-op price change.

Labels
======

One function became two, because one label serves two different readers.

.. code-block:: ts

   statusLabel(status): string          // admin: lifecycle only
   listingLabel(type, status): string   // public: the reader's vocabulary

============  =====================  =====================
Status        ``listingLabel`` sale  ``listingLabel`` rent
============  =====================  =====================
draft         Draft                  Draft
live          For Sale               For Rent
under-offer   Under Offer            Let Agreed
closed        Sold                    Let
archived      Archived               Archived
============  =====================  =====================

``statusLabel`` returns: Draft, Live, Under offer, Closed, Archived.

Every public component uses ``listingLabel``. No public surface ever renders a raw
status.

Money formatting
================

.. code-block:: ts

   formatPrice(minor, { listingType, rentPeriod, currency }): string
   formatPriceShort(minor, { listingType, rentPeriod, currency }): string

Both stop taking ``status``. This is a deliberately breaking signature change: the
compiler then walks the implementer to all four call sites instead of a grep being
trusted to find them.

The limit of that trick is worth stating, because the spec relies on it and it does
not cover everything. A bare interpolation is not a call site, so the compiler says
nothing about ``{property.status}`` rendered directly into JSX. There is exactly one
of those and it is listed in the surface inventory below.

Suffix comes from the period, not the status: ``year`` gives ``/yr``, ``month``
gives ``/mo``, ``night`` gives ``/night``, and a sale gets no suffix.

Migration 0007
==============

Following ``0005``, this migration backfills **only what absence cannot express**.

What is rewritten
-----------------

``status`` and ``listingType``, on every property row, because the stored values are
not absent, they are present and invalid under the new enum. A read path cannot
coalesce ``"for-sale"`` into the new model without keeping the old vocabulary alive
forever, and the validator would reject the row on its next write.

===========  ==================  =====================================
Old status   New listingType     New status
===========  ==================  =====================================
for-sale     sale                live
for-rent     rent                live
sold         sale (**default**)  closed
draft        sale (**default**)  draft
archived     sale (**default**)  archived
===========  ==================  =====================================

The three defaulted rows cannot be recovered from the document: a ``sold`` row does
not remember whether it was a sale or a let. The owner has approved defaulting them
to ``sale``. The migration **prints the affected count** at the end so the number is
visible rather than silent, and every one of them is editable in the admin.

What is not rewritten
---------------------

``rentPeriod``, ``fees`` and ``priceHistory`` are never written onto an existing row.
Their absence is meaningful and the read path resolves it. This keeps the migration
a single ``updateMany`` per status value instead of a full-collection document
rewrite.

Where the coalesce lives
------------------------

Saying "the read path resolves it" is not enough, because **the read path currently
cannot**. ``toProperty`` in ``packages/listings/src/schema.ts`` is a blind spread:

.. code-block:: ts

   export function toProperty(doc: PropertyDoc): Property {
     const { _id, ...rest } = doc;
     return { id: _id, ...rest };
   }

A spread carries absence straight through. ``Property.fees`` is declared
non-optional, so every legacy row would hand the UI ``undefined`` and the first
``.map`` would throw.

So ``toProperty`` **becomes a field-by-field mapper**, in the idiom
``toEnquiry`` already uses in ``packages/enquiries/src/index.ts`` for exactly this
reason:

.. code-block:: ts

   rentPeriod: readRentPeriod(doc.rentPeriod, doc.listingType),
   fees: normalizeFees(doc.fees ?? []),
   priceHistory: doc.priceHistory ?? [],

``PropertyDoc`` marks those three optional. That optionality exists in exactly one
file and never escapes it: everything above ``toProperty`` sees the resolved shape.

Creating a listing
------------------

``createProperty`` builds a full ``PropertyDoc`` literal, so a required
``listingType`` that it does not set makes **every new listing fail the validator**
and the "New listing" button stop working. The literal gains:

.. code-block:: ts

   listingType: "sale",

A new draft is a sale until somebody says otherwise, which is both the common case
and the same default the backfill uses.

Order of operations inside ``up()``
-----------------------------------

**The validator is collMod'd BEFORE the data is rewritten, and that order is the only
one that works.** ``ensureCollection`` sets ``validationLevel: "moderate"``
(``migrate.ts:119``), which validates every update to a document that *currently
satisfies* the schema. A row holding ``status: "for-sale"`` satisfies the 0001
validator, so an ``updateMany`` setting ``status: "live"`` under that validator is
checked against the old enum and rejected. Once the new validator is installed, that
same row no longer satisfies the schema, moderate stops validating updates to it, and
the backfill goes through.

Data-first looks natural and fails on the first run. Validator, then data, then
indexes.

Validator
---------

The ``properties`` validator gains ``listingType`` (required, enum), ``rentPeriod``
(enum or null), ``fees`` (array with an item schema pinning ``kind`` to the enum) and
``priceHistory`` (array with an item schema). The ``status`` enum is replaced.

``listingType`` is the **only** one of the four added to ``required``. The other three
are absent on every legacy row by design, and requiring them would reject the very
rows the migration deliberately does not rewrite.

Index
-----

**The existing ``properties_public`` index is left exactly as it is.** Two reasons,
and the first is fatal on its own:

1. ``ensureIndex`` is a bare ``createIndex`` with no drop (``migrate.ts:124``).
   Recreating a live index name with different keys is a MongoDB
   ``IndexKeySpecsConflict``, and 0001 always runs first, so ``npm run db:migrate``
   would throw on a fresh database as well as an existing one.
2. Putting ``listingType`` between the ``status`` prefix and the ``publishedAt`` sort
   key would cost the sort on the hottest read. The default public query never sets
   ``listingType`` (``repo.ts:84``), and an unused equality field in the middle of a
   compound index stops the sort being index-provided.

Instead 0007 **adds a second index**, used only when a type is actually named:

.. code-block:: text

   properties_public_type
   { listingType: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1 }

New name, so no conflict. Equality fields first, sort key last, which is the shape
that lets Mongo serve the filter and the order from one index.

Compatibility: the public URL does not change
=============================================

**This is the constraint the rest of the unit bends around.**

``/listings?status=For+Sale`` keeps working, unchanged, forever. Three reasons:

1. Those URLs are indexed by search engines and bookmarked by buyers. Breaking them
   costs traffic that took months to earn.
2. ``?type=`` is already spent. It carries the property type (Villa, Duplex), so
   ``listingType`` cannot claim that name on the public side.
3. "For Sale" is the word a buyer uses. ``?listingType=sale&status=live`` is the
   database's vocabulary leaking into a URL a human reads.

``src/app/(site)/listings/page.tsx`` stays the single translation point between the
reader's vocabulary and the model, and gains the new cases. Nothing else on the
public side learns the new field names. The translation is a table, not a chain of
ternaries, and it is the same table the header block already switches on:

============================  ==================  =============
URL ``status``                ``listingType``     ``status``
============================  ==================  =============
``For Sale``                  sale                live
``For Rent``                  rent                live
``Under Offer``               sale                under-offer
``Let Agreed``                rent                under-offer
``Sold``                      sale                closed
``Let``                       rent                closed
absent                        any                 any public
============================  ==================  =============

Unrecognised values return the unfiltered list rather than an empty one, because a
mistyped URL showing everything is a smaller failure than a mistyped URL showing
nothing, which is the failure this page has today.

Fixtures and the seeder
-----------------------

Two things outside the packages read the property shape and both must move with it:

``src/lib/demo-data.ts``
  ``PropertySeed`` types ``status`` as ``"For Sale" | "For Rent" | "Sold"`` and
  ``toProperty`` maps those through ``statusMap`` into the old enum. The seed
  vocabulary stays readable, and the map now produces the pair. Fixtures gain a
  handful of rentals with periods and fees, and at least one listing with price
  history, so the new UI has something to render on a fresh checkout.

``scripts/seed-demo.ts``
  Writes property documents straight from ``demoProperties``. It needs no change of
  its own, but its output must satisfy the new validator, so it is a verification
  step: seeding into a migrated database must not be rejected.

The public API route keeps accepting the legacy ``status`` trio
(``for-sale``, ``for-rent``, ``sold``) for one release, translating each into the new
pair. This shim is marked in the code as deletable.

It is worth being precise about what the shim does and does not buy, because the
obvious justification for it is wrong. The listings page fetches the whole list and
filters **in memory**; it never sends ``status`` to the API. So the shim does not
protect the site across a deploy. It ships because ``/api/public/properties`` is a
public surface whoever is calling it, and silently dropping a query value that worked
yesterday is a breaking change to that surface regardless of who noticed.

API
===

Public (``packages/listings/src/routes/public.ts``)
  Query gains ``listingType`` and the new ``status`` values, keeps translating the
  legacy trio. Sort keys ``price-high`` and ``price-low`` are unchanged: they sort on
  ``priceMinor``, which is still comparable within a type, and mixing sale and rent
  prices in one sort was already the caller's choice.

Admin (``packages/listings/src/routes/admin.ts``)
  ``listingType``, ``rentPeriod`` and ``fees`` join the write schema.
  ``AdminListQuery`` is ``.strict()``, so the admin list's new type filter is a 400
  until ``listingType`` is added there too, alongside a ``listingType`` clause in
  ``ListQuery`` and ``buildFilter`` in the repo. A UI filter with no server behind it
  is not a filter.

Validation refusals reuse ``parseMajor`` and ``moneyRefusalMessage``, so a bad fee is
refused with the same wording as a bad price. A ``rentPeriod`` on a sale is a 400
naming the field, not a silent null.

Lifecycle transitions
---------------------

``LifecycleOp`` is a union in ``repo.ts`` and ``TRANSITIONS`` is a
``Record<LifecycleOp, PropertyStatus>``, so adding keys without extending the union
is a compile error. The union gains two ops, and the full map becomes:

===============  ==============  ================================
Op               To status       Allowed from
===============  ==============  ================================
``publish``      live            draft, archived
``unpublish``    draft           live, under-offer
``markOffer``    under-offer     live
``relist``       live            under-offer, closed
``close``        closed          live, under-offer
``archive``      archived        anything not archived
``unarchive``    draft           archived
``restore``      draft           a trashed row
===============  ==============  ================================

``relist`` is not optional. The whole justification for adding ``under-offer`` was
that a collapsed deal must not force a lie, and without a way back out of
``under-offer`` and ``closed`` the new state is a trap that is worse than what it
replaced. Every op carries a ``when`` guard in the admin's ``LIFECYCLE`` array so an
op that cannot apply is not offered.

Price history mechanics
-----------------------

``saveProperty(db, id, patch, baseRevision)`` has no actor and does a single
``findOneAndUpdate``, so as it stands it can supply neither ``byName`` nor
``fromMinor``. It takes an actor, and reads the current row before the write:

.. code-block:: ts

   saveProperty(db, id, patch, baseRevision, actor: { userId: string; name: string })

The read-then-write is safe **because of the CAS**, not in spite of it. If anything
changed the price between the read and the write, ``revision`` moved too and the
guarded update misses, which is the existing 409. The history push rides in the same
atomic update:

.. code-block:: ts

   $push: { priceHistory: { $each: [change], $slice: -PRICE_HISTORY_MAX } }

**A change is recorded only when the old price was greater than zero and the new one
differs.** ``createProperty`` seeds ``priceMinor: 0``, so without that guard the first
real price an agent types would be recorded as a reduction from nothing, and every
listing would carry a junk first entry. A listing that never had a price did not have
a price change.

That guard is also what makes the currency rule work: the currency stays editable
while ``priceHistory`` is empty, and a brand new listing's first price leaves it
empty, so an agent can still fix a currency they picked wrongly.

Admin UI
========

Copy rule
---------

**Plain English, short, no jargon.** The owner's instruction, and it binds every
string in this unit. "Under offer", not "Offer accepted, pending exchange". "What
the tenant pays to move in", not "Aggregate non-recurring consideration". If a label
needs a sentence to explain it, the label is wrong.

Property editor (``src/app/admin/properties/[id]/page.tsx``)
-----------------------------------------------------------

- A **Sale / Rent** segmented control at the top of the pricing section. Switching it
  shows or hides the rent fields. Switching to Sale does not delete fee values the
  agent typed; it hides the rent-only kinds and drops them on save, which is stated
  next to the control.
- **Period** select, visible only for Rent: "Per year", "Per month", "Per night". It
  carries no blank option, and a rental with no period stored shows "Per year",
  which is what such a row already means. Clearing a period is done by switching the
  listing back to Sale, which is the only state where a null period is meaningful.
- **Lifecycle buttons for the new ops.** The ``LIFECYCLE`` array at line 118 is what
  renders these, so the server ops are unreachable until it gains rows for
  ``markOffer``, ``relist`` and ``close``, each with the ``when`` guard from the
  transition table. A backend capability with no button is not shipped.
- **Fees**, one row per allowed kind, each an amount input that refuses like the
  price input does. Empty means the fee does not apply, not zero.
- A **move-in total** line under the fee rows for rentals, recalculated live, with
  the excluded-currency note when it applies.
- A **price history** panel: date, old price, new price, who changed it. Collapsed
  when empty rather than rendering an empty box.
- The guard at line 128 becomes ``status === "live"``.

Property list (``src/app/admin/properties/page.tsx``)
-----------------------------------------------------

- Status filter lists the five lifecycle values.
- A new type filter beside it: All / Sale / Rent. It needs a server: ``AdminListQuery``
  is ``.strict()``, and ``ListQuery`` and ``buildFilter`` in the repo need a
  ``listingType`` clause of their own. **Do not fold it into the existing ``type``
  filter**, which already means ``PropertyType`` (Villa, Duplex) in that same
  function. Two different things called type in one filter builder is how the wrong
  one gets read.
- The row badge shows lifecycle; a second, quieter chip shows Sale or Rent.
- ``STATUS_TONE`` is rekeyed. ``Tone`` is
  ``"neutral" | "green" | "amber" | "wine" | "red"`` (``ui.tsx:670``) and nothing
  else type-checks, so:

  .. code-block:: ts

     draft: "amber",          // unchanged, draft already reads as needs attention
     live: "green",
     "under-offer": "wine",
     closed: "neutral",
     archived: "neutral",

Dashboard (``src/app/admin/page.tsx:319``)
------------------------------------------

The live count stops summing two buckets and reads ``listings.live``.

Public site
===========

- ``PropertyCard`` and ``AgentPanel`` switch to ``listingLabel`` and the new
  ``formatPriceShort`` signature.
- The detail page gains a **letting details** block for rentals: period, each fee on
  its own line, and the move-in total, with recurring fees visually separated from
  one-off ones so a tenant is never surprised by which is which.
- A **price reduced** marker appears on the card and detail page when the most recent
  ``priceHistory`` entry lowered the price within the last 90 days. This is the one
  piece of price history the public sees.
- ``FilterBar`` gains "Under Offer" and "Let Agreed" options, and its local
  ``statusLabel`` at line 46 is left alone: it labels URL values, which do not change.
- **An empty state on the listings page**, which does not exist today. It names what
  was filtered and offers the way out, in plain words: "No homes match that filter
  yet." above a link that clears it. It is not a full-page illustration; it is a
  short block in the grid's place, matching the admin's existing empty grades.

Verifying this locally
======================

Non-obvious, and it cost time once already, so it is written down:

1. The site reads through its own HTTP API, so an empty database renders an empty
   site. ``npm run db:migrate`` then ``npx tsx --env-file-if-exists=.env.local
   scripts/seed-demo.ts`` puts the fixtures in. The seeder refuses if the database
   holds records it did not write; that refusal is correct and is not to be forced
   past on a database with real content in it.
2. ``LIST_REVALIDATE`` is 300 seconds. A server component's list will keep serving
   the previous result for up to five minutes after the data changes, so a UI check
   immediately after a write can be reading a stale page rather than a broken one.
   Restart the dev server or wait it out before concluding anything.

Surface inventory
=================

Every place the changed vocabulary is read or written. A file not on this list does
not know about listing status; a file on it must be visited.

=================================================  ==========================================
File                                               What it does with the vocabulary
=================================================  ==========================================
``packages/contracts/src/types.ts``                declares the enums
``packages/contracts/src/money.ts``                labels and formatting
``packages/contracts/src/index.ts``                re-exports them
``packages/listings/src/schema.ts``                ``PropertyDoc`` and ``toProperty``
``packages/listings/src/repo.ts``                  ``ListQuery``, ``buildFilter``,
                                                   ``createProperty``, ``saveProperty``,
                                                   ``LifecycleOp``
``packages/listings/src/routes/public.ts``         public query enum, legacy shim
``packages/listings/src/routes/admin.ts``          ``AdminListQuery``, ``TRANSITIONS``,
                                                   write schema
``packages/db/src/migrations/0001_init.ts``        the old validator and index (read only)
``packages/db/src/migrations/0007_*.ts``           the new validator, backfill, index
``src/lib/types.ts``                               **named** re-export list, not ``export *``
``src/lib/data.ts``                                **named** re-export list
``src/lib/demo-data.ts``                           ``PropertySeed``, ``statusMap``
``scripts/seed-demo.ts``                           writes property docs (no edit, but must
                                                   still pass the validator)
``src/app/(site)/listings/page.tsx``               the broken filter, the header ternary
``src/app/(site)/listings/[slug]/page.tsx``        **renders ``{property.status}`` raw**
``src/components/PropertyCard.tsx``                badge and short price
``src/components/AgentPanel.tsx``                  badge and price
``src/components/FilterBar.tsx``                   mints the URL values
``src/components/SearchStrip.tsx``                 mints the URL values ("Buy"/"Rent")
``src/components/Navbar.tsx``                      **links to the broken filter**
``src/components/admin/Palette.tsx``               ``statusLabel`` in search results
``src/app/admin/page.tsx``                         the live count
``src/app/admin/properties/page.tsx``              filters, tone map, badge
``src/app/admin/properties/[id]/page.tsx``         editor, ``LIFECYCLE`` array
=================================================  ==========================================

Two entries in bold are live defects rather than migration work:

``[slug]/page.tsx``
  The hero badge interpolates the raw status, so a buyer is shown ``for-sale`` today
  and would be shown ``under-offer`` after this lands. It becomes ``listingLabel``.

``Navbar.tsx``
  The main navigation's Buy and Rent links are ``?status=For+Sale`` and
  ``?status=For+Rent``. They are the primary entry points to the two most important
  pages on the site, and both currently land on an empty grid. This is what makes the
  filter defect a priority rather than a detail.

Visual bar
==========

The admin surfaces are judged against the **Shopify admin (2026)** bar this repo's
existing ``GAUNTLET.md`` already passed, so the new editor sections must not read as
bolted on: same section rhythm, same input styling, same empty-state grade.

The public letting block is judged against **Rightmove's letting details**, which is
the real-world thing that solves this exact problem: period and deposit stated at the
same visual weight as the rent, fees itemised rather than footnoted.

Tests
=====

**No tests are written in this unit.** Standing project rule, reaffirmed by the owner
for this session: another session writes them later. This unit leaves behind the list
of what should be covered, in the existing ``TESTS.todo.ts`` idiom, so the later
session inherits reasoning rather than a blank page.

Each item below is recorded as ``TODO(test)`` beside the code it covers, or appended
to ``packages/api/src/TESTS.todo.ts``:

Contracts
  - ``listingLabel`` returns the right phrase for all ten type/status pairs.
  - ``formatPrice`` suffixes ``/yr``, ``/mo``, ``/night``, and nothing on a sale.
  - ``moveInTotalMinor`` excludes recurring fees.
  - ``moveInTotalMinor`` excludes foreign-currency fees and names them in
    ``excluded``.
  - A fee list with two ``agency`` entries de-duplicates last-wins.

Migration
  - Each of the five old statuses maps to the right pair.
  - The defaulted count is reported and matches the number of draft, sold and
    archived rows.
  - A row with no ``rentPeriod`` key still reads as ``year`` when it is a rental.
  - Re-running 0007 is a no-op.

API
  - ``?status=for-sale`` on the public route still returns live sale listings.
  - ``?status=For+Sale`` through the site page still returns the same set as before
    the migration.
  - A ``rentPeriod`` on a sale is refused with 400 naming the field.
  - Changing ``priceMinor`` appends exactly one history entry; changing the title
    appends none.
  - The 51st price change trims the oldest.
  - A stale ``baseRevision`` on a price change is a 409 and appends nothing.

Public filtering (the inherited defect)
  - ``?status=For+Sale`` returns exactly the live sale listings, and the count is
    non-zero against the fixtures. This is the regression test for the bug this unit
    inherits, and it is the single most important item on this list: the defect
    shipped precisely because nothing asserted a count.
  - Every row of the URL translation table maps to the right pair.
  - An unrecognised ``status`` value returns the unfiltered list, not an empty one.
  - A filter that legitimately matches nothing renders the empty state rather than a
    bare grid.

UI
  - ``TODO(verify)``: the Sale/Rent toggle hides rent fields without losing typed
    values before save. Needs a browser.
  - ``TODO(verify)``: the letting block reads correctly at 390px. Needs a browser.
  - ``TODO(verify)``: the admin editor's new sections match the Shopify bar's section
    rhythm rather than reading as an appended block. Needs a browser and a human eye.

Out of scope
============

Named so a later reader knows it was decided, not forgotten:

- **No FX.** A fee in another currency is shown and excluded from totals.
- **No fee percentages.** Agency fee is entered as an amount. A "10% of rent"
  calculator is a form convenience that can be added without changing storage.
- **No public price history.** The site shows a reduced marker, not a table.
- **No per-listing currency change once a price has actually moved.** Editing the
  currency on a listing with price history would make the history incomparable, so
  the field stays editable only while ``priceHistory`` is empty. Because a listing's
  first real price is not recorded as a change, a new listing stays correctable.

Roadmap position
================

Unit 1 of 7. Next: 2 audit trail, 3 contacts, 4 viewings, 5 reporting, 6 portal
export, 7 WhatsApp intake. Units 5 and 6 both read the shape this unit defines,
which is why it goes first.
