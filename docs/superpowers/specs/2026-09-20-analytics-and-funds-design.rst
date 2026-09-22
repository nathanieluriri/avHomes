=====================================
Analytics, funds and partner listings
=====================================

:Date: 2026-09-20
:Status: approved
:Surfaces: the console (``/admin``), the marketer app (``/m``), the public site

Why
===

Five things are missing, and they are one thing.

AV Homes pays 5/2/1 on every deal, whoever owns the property. Selling somebody
else's house earns AV Homes a fraction of what selling its own does, and the
commission comes out the same, so the more third party stock the site carries the
worse the economics get. The rate table has no idea whose property it is.

Nothing records what the business actually did. There are deals, and a ledger of
what marketers are owed, and between them there is no answer to "what did we
transact this quarter", "which listings do people look at and never enquire
about", "who is actually closing", or "what did AV Homes keep". The dashboard
counts documents by status. That is inventory, not performance.

Two pots of money the owner wants do not exist at all: a community fund and a
prize for the best seller.

Third parties have no way in. Somebody with a property to sell has to email
somebody, an AV Homes account holder types it in, and the owner of the property
can never see how it is doing.

And a listing stops being for sale by somebody picking a status off a menu. No
amount, no proof, nobody named. The single most important event in the business
is the least evidenced thing in the system.

Goal
====

Every naira that moves is a record with proof behind it, attributed to a person,
split five ways by a rule that knows whose property it was, visible on pages that
explain themselves.

Five constraints shape everything below.

1. **One door to closed.** A listing becomes sold or let through exactly one
   flow, and that flow requires proof and a name. Not a status menu.
2. **Money already paid is never edited.** The existing ledger rule extends to
   both funds: append only, reverse with a negative line, balance is always a
   sum.
3. **A share with no person behind it is not a ledger line.** The reward pool and
   the Foundation are owed to nobody, so they must not enter
   ``marketing_ledger``: ``reconcile()`` proves that collection balances against
   what marketers are owed, and it must keep meaning that.
4. **Scope is part of every number.** A figure whose label names a different
   quantity from the figure is the failure the whole analytics section exists to
   avoid. Period, ownership class and who is being counted are stated beside the
   number, on the device, never in a tooltip.
5. **A partner sees their own records and nothing else.** Enforced in one
   function, not per route.

Whose property is it
====================

``Property`` gains ``ownership``.

.. code-block:: ts

   export const OWNERSHIPS = ["av", "partner"] as const;
   export type Ownership = (typeof OWNERSHIPS)[number];

``av`` is AV Homes' own stock. ``partner`` is somebody else's, whether it arrived
through a partner account or an AV Homes agent typed it in for an owner who has
none. A row written before this field existed reads as ``av``, which is correct:
every listing on the site today is AV Homes' own.

It is a required choice on the listing form, beside sale/rent, because it changes
the money exactly as much as sale/rent does. ``ownerLabel`` holds the external
owner's or developer's name, empty when not stated, so analytics can group by
where stock comes from.

``ownership`` is NOT derived from ``agentUserId``. An agent can list a partner's
property, and a partner account can only ever hold partner property, so the two
fields answer different questions. Collapsing them would make the commission rate
depend on which account happened to type the listing in.

The five shares
===============

``saleRates: [5,2,1]`` and ``rentRates: [5,2,1]`` are replaced by a matrix over
ownership and deal kind, each cell holding five percentages.

.. code-block:: ts

   export interface CommissionSplit {
     /** The person who closed it. */
     level1: number;
     /** Whoever invited them. */
     level2: number;
     /** Whoever invited that person. */
     level3: number;
     rewardPool: number;
     foundation: number;
   }

   /** ownership -> deal kind -> the split. Four independently editable cells. */
   export type CommissionMatrix = Record<Ownership, Record<DealKind, CommissionSplit>>;

Defaults:

.. code-block:: text

   av.sale       5 / 2 / 1   + 1 pool + 1 foundation   = 10%
   av.rent       5 / 2 / 1   + 1 pool + 1 foundation   = 10%
   partner.sale  2 / 1 / 0.5 + 1 pool + 1 foundation   = 5.5%
   partner.rent  2 / 1 / 0.5 + 1 pool + 1 foundation   = 5.5%

Rent starts seeded from sale in each class and is editable apart from it, so rent
can be repriced later without touching sales.

A settings document written before the matrix existed derives one on read: the
stored ``saleRates`` and ``rentRates`` become the ``av`` row, the ``partner`` row
takes the defaults above, and both funds take 1. This follows the coalescing rule
the settings reader already holds, so a deploy mid-flight cannot produce a deal
split by a half-written table. The legacy fields are read for that derivation and
never written again.

The split itself
----------------

``splitCommission`` becomes ``splitDeal``, answering for the whole deal rather
than for the people only.

.. code-block:: ts

   export interface FundShare {
     fund: FundKind;
     rate: number;
     amountMinor: number;
   }

   export interface DealSplit {
     people: SplitLine[];
     funds: FundShare[];
     /** What AV Homes keeps: the remainder, a paused upline's share included. */
     keptMinor: number;
   }

   export function splitDeal(
     amountMinor: number,
     split: CommissionSplit,
     chain: readonly (ChainMember | null)[],
   ): DealSplit;

The existing rules hold unchanged: rounding is down to the minor unit, and a
paused or banned person earns nothing whose share is not handed up the chain.
What is new is that the unpaid remainder is named and reported as ``keptMinor``
instead of being invisible, because "what did AV Homes keep" is one of the
questions the analytics section has to answer.

Fund shares accrue on **every** approved deal, including one closed by staff or by
nobody. The owner's words were "1% of every sale" and "every recorded
transaction", and a walk-in sale is a transaction.

``ratesRefusal`` becomes ``splitRefusal`` and refuses a cell whose five
percentages exceed 100 together, not three.

``previewEarning``, which is what the marketer app shows as "you would earn" on a
listing, now takes the listing's ``ownership`` and reads ``level1`` from the right
cell. A Non-AV listing honestly shows the smaller number in the app, which is the
whole point of the field: a marketer choosing what to push should see the real
figure before they spend a week on it. The listing feed the app reads therefore
carries ``ownership``.

The two funds
=============

A new package, ``@avhomes/funds``, owning two collections. A package rather than
more code in marketing because the fund ledger is written by deals and read by
analytics, and neither of those may import the other: that is the crossing the
layout exists to prevent. Marketing receives an ``accrue()`` port injected at
``packages/api``, exactly as every other crossing here works.

``fund_ledger``
---------------

Append only, signed, never edited. The same discipline as ``marketing_ledger``
and for the same reason.

.. code-block:: ts

   export const FUND_KINDS = ["reward", "foundation"] as const;
   export type FundKind = (typeof FUND_KINDS)[number];

   export const FUND_ENTRY_KINDS = ["accrual", "payout", "adjustment"] as const;
   export type FundEntryKind = (typeof FUND_ENTRY_KINDS)[number];

   export interface FundEntry {
     id: string;
     fund: FundKind;
     kind: FundEntryKind;
     /** Signed. An accrual is positive, a payout negative. */
     amountMinor: number;
     currency: string;
     /** The deal that produced an accrual. Null on a payout or adjustment. */
     dealId: string | null;
     /** The percentage snapshotted at accrual. 0 on a payout. */
     rate: number;
     /** The award a reward payout settles. Null otherwise. */
     awardId: string | null;
     /** What a Foundation disbursement was for. */
     note: string;
     /** Receipts for a disbursement. Required on a payout. */
     proof: string[];
     byName: string;
     createdAt: number;
     updatedAt: number;
   }

A balance is the sum of the entries, never a stored number, so a lost write can
never silently make a fund richer. Both funds are renameable: ``rewardPoolName``
and ``foundationName`` live in marketing settings and default to "Reward Pool"
and "AV Foundation". The names are display only and the ``FundKind`` keys never
change, so renaming cannot orphan a row.

The Foundation is a real wallet: accruals in, disbursements out, each carrying
amount, what it was for, the date, proof and who approved it. A fund whose number
only ever climbs stops meaning "what we have".

``reward_awards``
-----------------

The pool closes **quarterly**, winner takes all, and an admin confirms. Nothing
pays out on its own.

.. code-block:: ts

   export const AWARD_STATUSES = ["proposed", "awarded", "skipped"] as const;
   export type AwardStatus = (typeof AWARD_STATUSES)[number];

   export interface RewardStanding {
     rank: number;
     kind: "marketer" | "staff";
     personId: string;
     name: string;
     /** The marketer code, or empty for staff. */
     code: string;
     deals: number;
     valueMinor: number;
     /** The composite rating, shown for context. NOT what ranks. */
     score: number;
   }

   export interface RewardAward {
     id: string;
     /** `2026-Q3`. One award per quarter. */
     quarter: string;
     status: AwardStatus;
     /** The pot as it stood when the quarter closed. */
     potMinor: number;
     currency: string;
     /** The table as it stood, so a later deal cannot rewrite a settled award. */
     standings: RewardStanding[];
     winnerKind: "marketer" | "staff" | null;
     winnerId: string | null;
     winnerName: string | null;
     /** A marketer winner: the adjust line that carries it into a pay run. */
     ledgerLineId: string | null;
     /** A staff winner: the transfer reference and its proof. */
     reference: string;
     proof: string[];
     reason: string;
     decidedByName: string;
     decidedAt: number | null;
     createdAt: number;
     updatedAt: number;
   }

Ranking is by ``valueMinor``, the total value of deals closed in the quarter, and
nothing else. It is the one number nobody can argue with, which is what a prize
needs. The composite rating is shown beside it for context and does not decide
the winner.

Marketers and AV Homes staff rank in **one** league, because the owner's point
was that the best closer might be either. How each is paid differs, because the
system has different machinery for them:

- A **marketer** winner gets a ``marketing_ledger`` line with ``kind: "adjust"``,
  ``level: 0``, ``dealId: null`` and a note naming the quarter. ``buildPayRun``
  carries it into their next payment with no special case, and ``reconcile()``
  still balances because an adjust line is an ordinary ledger line.
- A **staff** winner is paid by transfer, and the reference plus proof lands on
  the award. Console accounts have no bank details and no ledger, and inventing a
  payout identity for one prize a quarter is more machinery than the prize is
  worth.

Either way a matching ``fund_ledger`` payout entry is written for the negative
amount, so the fund loses exactly what the person gained.

Recording a sale
================

One flow, and it is the only path to ``closed``.

It asks: sold or let, the amount, the buyer's name and phone, the date it closed,
**proof (at least one file)**, and **who closed it**. That last answer is a
marketer searched by code or name, an AV Homes staff member, or direct with nobody
to credit. Before confirming, it shows the split by name: each level, both funds,
and what AV Homes keeps.

``Deal`` gains the closer and the source.

.. code-block:: ts

   export const CLOSER_KINDS = ["marketer", "staff", "direct"] as const;
   export type CloserKind = (typeof CLOSER_KINDS)[number];

   export const DEAL_SOURCES = ["app", "console"] as const;
   export type DealSource = (typeof DEAL_SOURCES)[number];

   /* On Deal: */
   closerKind: CloserKind;
   /** A marketer id, a user id, or empty for direct. */
   closerId: string;
   closerName: string;
   /** Whose property it was, snapshotted. The rate depended on it. */
   ownership: Ownership;
   /** The split as applied, so a settings change never rewrites a settled deal. */
   split: CommissionSplit;
   fundShares: FundShare[];
   keptMinor: number;
   source: DealSource;

``reporterId`` keeps its current meaning, who filed the report, and for a
marketer-closed deal it equals ``closerId`` so ``chainFor`` and the duplicate
claim index keep working untouched. A staff or direct deal has no chain, so no
shares and no ledger lines, and both funds still accrue.

On confirm, in this order:

1. The deal is written, ``status: "approved"``, ``source: "console"``, with
   ``ownership`` and ``split`` snapshotted off the listing and the settings.
2. Marketer ledger lines, if a marketer closed it and the chain has active people.
3. Fund accruals, both of them.
4. The listing moves to ``closed`` and takes ``closedDealId``.

No Mongo session wraps that. The existing ``reviewDeal`` writes a deal and then
its ledger lines the same way, and the recovery story is the same one: every write
is append only or idempotent, the order leaves a crash detectable rather than
profitable, and ``reconcile()`` is extended to prove fund accruals match approved
deals. Introducing transactions for this one path would make it the only place in
the codebase that uses them.

The three ways in are one component: the listing's own "Mark as sold" action, the
alert raised when a marketer's deal is approved (pre-filled from that deal, proof
included), and "Record a deal" in Analytics for a sale that happened offline.

Approving a marketer's deal does **not** silently close the listing. It raises an
alert that opens this flow, because the person approving the money and the person
who knows the listing is genuinely off the market are not always the same, and a
status that moved on its own is a status nobody trusts.

Going back
----------

``cancelDeal`` already voids unpaid ledger lines and writes negative lines for
paid ones. It now also writes negative fund entries for the deal's accruals and
returns the listing to ``live``, naming the cancelled deal in the audit trail.
Nothing is deleted on either side.

Partner accounts
================

A new role, ``partner``, holding ``listings``, ``media`` and ``analytics``, scoped
to its own records.

.. code-block:: ts

   partner: {
     label: "Partner lister",
     tagline: "Their own property, their own numbers",
     grants: ["listings", "media", "analytics"],
     scoped: true,
   }

``scoped`` is new on ``RoleInfo`` and is read by one function. ``partner`` is not
in ``ASSIGNABLE_ROLES``: it is minted by an admin approving an application, the
rule ``marketer`` already follows and for the same reason. Handing it to a console
account would take that person's console away.

Two gates, because a trusted account and a trustworthy listing are different
claims:

1. **The account.** A public application at ``/list-with-us`` collects who they
   are, what they have and how to reach them. An admin approves or refuses.
   Approval creates the invite and the account.
2. **Every listing.** A new ``PropertyStatus`` value, ``submitted``, reading as
   "In review" on both sides. A partner creates, edits and submits. A partner can
   never write ``status``, so publishing stays an AV Homes action and an admin
   gets a queue of what is waiting.

``submitted`` is a status rather than a flag on ``draft`` because the status is
what the person reads, and a listing showing "Draft" after somebody submitted it
is a lie the queue then has to work around. The enum is compile-checked through
``Record<PropertyStatus, ...>`` maps, so adding it surfaces every place that has
to decide what it means.

It is **not** in ``PUBLIC_PROPERTY_STATUSES``. A submitted listing is invisible to
the public site, has no slug and cannot be featured, exactly like a draft. The
publish check runs against it on submission, so a partner is told what is missing
while they can still fix it rather than after an admin refuses it.

Scoping
-------

``authorize()`` in ``packages/listings/src/authorize.ts`` currently says every
signed-in user reads every listing. That stops being true for exactly one role,
and it changes there, in the one function, rather than in each route.

.. code-block:: text

   read     scoped role -> own records only ; everyone else -> everything
   write    the listing's own account, or an admin
   destroy  admin only
   status   never a scoped role

What a partner sees: **everything about their own listings, and nothing about
anybody else's.** That covers who closed each sale, every level's name and
earnings, both fund shares, what AV Homes kept, the buyer, the proof and the
views. The overview leads with the three numbers a property owner asks first
(what it sold for, AV Homes' fee, what came to them) and Transactions carries each
deal's full split.

What stays hidden is anything site-wide: the dashboard's counts and enquiries, the
league on People, the fund balances, the site's visitor numbers and the Alerts
feed. Each of those describes AV Homes as a whole, so a partner's session is
refused them rather than shown a narrowed copy.

*Changed 2026-09-22.* This section first said a partner sees only the sale price,
the fee and their net. The owner reversed that: a partner sees the full picture on
their own property.

Beyond analytics, the scoped rule holds everywhere a partner's domains reach. The
image library returns and deletes only their own uploads, a listing's history is
readable only on a listing they can open, and a partner's save cannot set
``featured``, ``ownership``, ``ownerLabel`` or ``agentUserId``. A partner account
is refused by the marketer app, and its role cannot be changed on the Team screen,
though it can still be disabled there.

The analytics section
=====================

Six pages under ``/admin/analytics``, gated on the ``analytics`` domain. Money
blocks render only for roles that also hold ``marketing``, the pattern
``dashboard.ts`` already uses for its marketing tile, so support keeps the traffic
numbers without the payroll.

The routes live in ``packages/api``, next to ``dashboard.ts``, because they are
the reads that span listings, marketing, funds, enquiries and analytics at once
and no feature package may know about another. One ``scopeFor(user)`` returns the
filter every query applies, so a partner's version of a page is the same code over
a narrower set.

============================  ==================================================
Page                          The one question it answers
============================  ==================================================
``/admin/analytics``          What did the business do this period
``.../transactions``          Every deal, with its split and its proof
``.../listings``              Which listings work and which are ignored
``.../people``                Who is closing
``.../wallets``               What is in the two funds and where it went
``.../traffic``               Who is visiting the site
============================  ==================================================

Against information overload
----------------------------

Five rules, checkable on every screen. They are the ``PulseStrip`` rules
generalised, because that component already got this right.

1. **One question per page**, stated in the heading. **At most four** stat tiles
   above the fold.
2. **Progressive detail.** A row expands or a chart opens on request, never both
   at once, and the choice is remembered for the browser session only.
3. **Scope beside the number**, on the device. A tooltip does not exist on a
   phone, so a figure whose definition lives in a ``title`` attribute is
   undefined for half the readers.
4. **No trend without two measured windows.** With nothing to compare against it
   says so, instead of dividing by zero and drawing an arrow.
5. **The five-way split is collapsed by default** everywhere. A transaction row
   shows the amount and who closed it; the split opens when somebody asks.

The design system
-----------------

The console has 24 primitives, no chart and no stat tile, so six pages would
otherwise invent six of each. Five additions, in ``src/components/admin/``,
following the idiom already there:

============================  ==================================================
Primitive                     Why it is shared
============================  ==================================================
``StatTile``                  One number, its label, its scope, an optional
                              trend. Extracted from ``PulseStrip``'s own tile so
                              both render one object.
``MiniChart``                 Sparkline and bar series over the existing
                              palette. Zero-filled series only.
``SplitBreakdown``            The five shares plus what was kept. Drawn in the
                              record-a-sale sheet AND on an expanded transaction
                              row, so the two can never disagree.
``PeriodPicker``              The period control all six pages share.
``OwnershipBadge``            AV Homes or Non-AV, one chip, one wording.
============================  ==================================================

No new colour, radius or shadow. Charts draw from the ``--wine-*`` and
``--mist-*`` tokens already defined, and a series colour is never the only thing
distinguishing two lines.

The rating
----------

A composite out of 100 over the chosen period, from four inputs with editable
weights, always shown with its breakdown. A score nobody can take apart is a
score nobody accepts.

==========================  =======  =====================================
Input                       Weight   Measured as
==========================  =======  =====================================
Value closed                50       Against the period's top performer
Deals closed                20       Against the period's top performer
Lead to deal conversion     20       Won leads over leads handled
Speed                       10       Median days lead to close, inverted
==========================  =======  =====================================

Computed on read, never stored, the reasoning the marketer alerts already use: a
stored score outlives the thing it describes. A person with no leads scores on the
first two inputs and the breakdown says why, rather than being punished for a
denominator of zero.

Per-listing views
-----------------

The beacon starts naming which listing it is on. ``PulseBody`` gains an optional
bounded ``listing`` id, and a ``listing_views`` document per listing per day keeps
``views`` and ``sessions``.

Still no IP and still no person, so the privacy position in
``packages/analytics/src/index.ts`` is unchanged: this is a counter per listing per
day, not a log of who read what. ``sessions`` increments when the client says this
is its first view of that listing in this session, client-asserted in exactly the
way the client-minted ``sid`` already is, and bounded by the same two rate
limiters.

That, plus ``propertyId`` on enquiries and ``listingId`` on leads, gives the funnel
the listings page draws: views, enquiries, leads, deal.

Data
====

One migration, ``0015_analytics_and_funds``.

========================  ======================================================
Change                    Detail
========================  ======================================================
``properties``            ``ownership`` backfilled to ``av``, ``ownerLabel``,
                          ``closedDealId``. Validator enum gains ``submitted``.
                          Index on ``(ownership, status)``.
``marketing_deals``       ``closerKind``, ``closerId``, ``closerName``,
                          ``ownership``, ``split``, ``fundShares``,
                          ``keptMinor``, ``source``. Backfilled from existing
                          rows: an approved deal was marketer closed, source
                          ``app``, ownership ``av``.
``fund_ledger``           New. Indexes on ``(fund, createdAt)`` and ``dealId``.
``reward_awards``         New. ``quarter`` unique.
``listing_views``         New. ``_id`` is ``<listingId>:<day>``, TTL sweep at 90
                          days like ``visits``.
``partner_applications``  New. ``email`` unique among the undecided.
``settings``              The marketing document gains ``commission``, the fund
                          names and the rating weights.
``users``                 Validator enum gains ``partner``.
``audit``                 Entity enum gains ``deal``, ``fund``, ``award``,
                          ``application``.
========================  ======================================================

Every new money field is the wide numeric type ``0011`` established, because kobo
on a Lagos property crosses 2^31 and the driver sends a double.

What this does not do
=====================

- **No FX.** A fund holds one currency, the site's own. There is no rate in this
  system and inventing one is how a number nobody honours gets printed.
- **No automatic payouts.** The quarterly award is proposed and a human confirms.
- **No staff pay runs.** A staff winner is paid by transfer with the reference
  recorded. Giving console accounts bank details and ledger rows is a larger
  change and is not needed for a quarterly prize.
- **No Foundation project accounting.** Disbursements carry a note and proof, not
  a named cause with its own budget.
- **No per-visitor analytics.** Counters per listing per day, no path and no
  person, deliberately.
- **No tests.** Standing project rule. Coverage intentions are recorded as
  ``TODO(test):`` comments beside the code.
