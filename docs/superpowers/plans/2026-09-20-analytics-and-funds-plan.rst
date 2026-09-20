===============================================
Analytics, funds and partner listings: the plan
===============================================

:Date: 2026-09-20
:Spec: ``docs/superpowers/specs/2026-09-20-analytics-and-funds-design.rst``
:Branch: ``worktree-analytics-and-funds``

The spec is the authority. Where this plan and the spec disagree, the spec wins
and the plan is wrong.

Goal
====

Every naira that moves becomes a record with proof behind it, attributed to a
person, split five ways by a rule that knows whose property it was, on six pages
that explain themselves.

Approach
========

Bottom up, in the direction the package layout already runs. Contracts and the
migration first, because every later task compiles against them. Then the new
``@avhomes/funds`` package, then the feature packages that write to it, then the
one spanning read in ``packages/api``, then the screens. The five shared UI
primitives come before the six pages that use them, so no page invents its own.

Global constraints
==================

These bind every task. Check them on every diff.

1. **No tests.** Standing project rule. Never create a test file, never add a
   runner, never add a testing dependency. Coverage intentions are
   ``TODO(test):`` comments beside the code, in the idiom already there, and the
   cross-cutting ones are appended to ``packages/api/src/TESTS.todo.ts``.
2. **No em dashes** anywhere: code, comments, copy, commit messages, docs. Use a
   period, a comma, a colon, or parentheses.
3. **Comments say what the code does or why it exists, in one line where
   possible.** No preamble, no restating the function name. Comment units,
   workarounds, invariants and surprising choices. Skip the comment when the code
   is already clear.
4. **Copy is plain English and short.** "In review", not "Submitted, pending
   editorial approval". If a label needs a sentence to explain it, the label is
   wrong.
5. **Money is an integer in minor units** with its currency beside it. Never a
   float, never a formatted string in storage. New money fields in a validator
   use the wide ``MONEY`` bson type from ``0011``.
6. **Timestamps are epoch-millisecond integers.** The only ``Date`` written is an
   ``expiresAtDate`` beside a TTL index, never read by the app.
7. **Ids are prefixed, time-sortable strings** from ``newId()``. Never an
   ``ObjectId``.
8. **Never spread a request body into an update.** No ``$set: {...body}``. Every
   writable field is named in a ``WRITABLE`` list.
9. **Append only for money.** A fund entry and a ledger line are written once.
   Corrections are new negative rows pointing at the old one.
10. **Feature packages never import each other.** ``contracts`` imports nothing
    from another package. Crossings are ports injected at ``packages/api``.
11. **Paging is keyset, never skip**, using ``@avhomes/core``'s cursor helpers.
12. **The three gates must pass** before a task is done: ``npm run build``,
    ``npm run typecheck``, ``npm run lint``. Use ``npm run typecheck`` rather than
    a bare ``tsc --noEmit``, because it runs ``next typegen`` first.
13. **Stage specific paths.** Never ``git add .``, ``git add -f`` or
    ``git commit -a``.
14. **Commits are authored by nathanieluriri with no trailers.** No
    ``Co-Authored-By``, no "Generated with", no robot emoji, anywhere.
15. **Docs are reStructuredText.** No new ``.md`` files.

The five UX rules
=================

Every screen in tasks 9 to 14 is checked against these. They come from
``PulseStrip``, which already got this right.

1. One question per page, stated in the heading. At most four stat tiles above
   the fold.
2. Progressive detail. A row expands or a chart opens on request, never both at
   once. The choice is remembered for the browser session only, and every
   ``sessionStorage`` access is wrapped in try/catch because Safari private mode
   throws rather than returning null.
3. Scope beside the number, rendered on the device. Never a ``title`` attribute
   as the only home for a definition.
4. No trend without two measured windows. Say "first activity in this window"
   rather than dividing by zero.
5. The five-way split is collapsed by default everywhere.

File structure
==============

============================================================  ================================================
File                                                          Responsibility
============================================================  ================================================
``packages/contracts/src/funds.ts``                           NEW. Fund and award types, quarter helpers.
``packages/contracts/src/analytics.ts``                        NEW. The shapes the six pages render.
``packages/contracts/src/marketing.ts``                        The split matrix, ``splitDeal``, rating, closer.
``packages/contracts/src/types.ts``                            ``Ownership``, ``submitted``, Property fields.
``packages/contracts/src/roles.ts``                            The ``partner`` role and ``scoped``.
``packages/contracts/src/money.ts``                            Labels for the new status.
``packages/db/src/migrations/0015_analytics_and_funds.ts``     NEW. Every collection and validator change.
``packages/funds/src/index.ts``                                NEW. Package entry.
``packages/funds/src/repo.ts``                                 NEW. Fund ledger and award data access.
``packages/funds/src/routes.ts``                               NEW. ``/api/admin/funds`` and awards.
``packages/marketing/src/settings.ts``                         Matrix coalescing, fund names, weights.
``packages/marketing/src/repo.ts``                             ``recordSale``, funds on review and cancel.
``packages/marketing/src/routes.ts``                           The record-a-sale route, closer search.
``packages/listings/src/authorize.ts``                         The scoped-role branch.
``packages/listings/src/repo.ts``                              Ownership, the submitted status, scoping.
``packages/listings/src/routes/admin.ts``                      Submit and approve, close with proof.
``packages/identity/src/repo/applications.ts``                  NEW. Partner applications.
``packages/identity/src/routes/applications.ts``                NEW. Public apply, admin decide.
``packages/analytics/src/index.ts``                            Per-listing view counters.
``packages/api/src/analytics.ts``                              NEW. The spanning read, scope aware.
``src/components/admin/StatTile.tsx``                          NEW. One number and its scope.
``src/components/admin/MiniChart.tsx``                         NEW. Sparkline and bar series.
``src/components/admin/SplitBreakdown.tsx``                    NEW. The five shares plus kept.
``src/components/admin/PeriodPicker.tsx``                      NEW. The shared period control.
``src/components/admin/OwnershipBadge.tsx``                    NEW. AV Homes or Non-AV.
``src/components/admin/RecordSale.tsx``                        NEW. The one door to closed.
``src/app/admin/analytics/*``                                  The six pages.
``src/app/admin/partners/*``                                   The application queue.
``src/app/(site)/list-with-us/page.tsx``                       NEW. The public application form.
============================================================  ================================================

--------------------------------------------------------------------------------

Task 1: contracts
=================

Files
  Create ``packages/contracts/src/funds.ts``,
  ``packages/contracts/src/analytics.ts``. Modify
  ``packages/contracts/src/types.ts``, ``marketing.ts``, ``roles.ts``,
  ``money.ts``, ``index.ts``.

Produces
  Every type and pure function tasks 2 to 14 compile against. Nothing here
  imports from another package.

Step 1: ownership and the new status in ``types.ts``
---------------------------------------------------

.. code-block:: ts

   /** Whose property this is, which is what the commission rate depends on. */
   export const OWNERSHIPS = ["av", "partner"] as const;
   export type Ownership = (typeof OWNERSHIPS)[number];

   export const OWNERSHIP_LABEL: Record<Ownership, string> = {
     av: "AV Homes",
     partner: "Non-AV",
   };

``PROPERTY_STATUSES`` gains ``submitted`` in lifecycle order, between ``draft``
and ``live``:

.. code-block:: ts

   export const PROPERTY_STATUSES = [
     "draft", "submitted", "live", "under-offer", "closed", "archived",
   ] as const;

``PUBLIC_PROPERTY_STATUSES`` is left alone: a submitted listing is not public.

``Property`` gains three fields:

.. code-block:: ts

   /** Whose property this is. A row written before this field reads as "av". */
   ownership: Ownership;
   /** The external owner or developer, for grouping. Empty when not stated. */
   ownerLabel: string;
   /** The deal that closed it, so the listing page draws the sale in one read. */
   closedDealId: string | null;

Step 2: status labels in ``money.ts``
------------------------------------

``statusLabel`` and ``LISTING_LABELS`` are compile-checked ``Record``s over
``PropertyStatus``, so both refuse to build until ``submitted`` is added.

.. code-block:: ts

   // in statusLabel's switch
   case "submitted":
     return "In review";

   // in LISTING_LABELS
   submitted: { sale: "In review", rent: "In review" },

Step 3: the split matrix in ``marketing.ts``
-------------------------------------------

Replace ``CommissionRates`` and ``splitCommission``. Keep the type name exported
for one release only if anything outside this repo reads it; nothing does, so
delete it.

.. code-block:: ts

   /** The five shares of one deal, as whole or one decimal percents. */
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

   export const DEFAULT_COMMISSION_MATRIX: CommissionMatrix = {
     av: {
       sale: { level1: 5, level2: 2, level3: 1, rewardPool: 1, foundation: 1 },
       rent: { level1: 5, level2: 2, level3: 1, rewardPool: 1, foundation: 1 },
     },
     partner: {
       sale: { level1: 2, level2: 1, level3: 0.5, rewardPool: 1, foundation: 1 },
       rent: { level1: 2, level2: 1, level3: 0.5, rewardPool: 1, foundation: 1 },
     },
   };

   /** The cell one deal is priced by. */
   export function splitFor(
     matrix: CommissionMatrix,
     ownership: Ownership,
     kind: DealKind,
   ): CommissionSplit {
     return matrix[ownership][kind];
   }

   /** The three person levels, nearest first, for the chain walk. */
   export function personRates(split: CommissionSplit): [number, number, number] {
     return [split.level1, split.level2, split.level3];
   }

Step 4: ``splitDeal``
---------------------

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

   /**
    * Who earns what on one deal, and what the two funds take.
    *
    * A paused or banned person earns nothing and their share is NOT handed up
    * the chain: AV Homes keeps it, and `keptMinor` is where it shows up rather
    * than vanishing. Rounding is down to the minor unit, because a bank transfer
    * cannot pay a fraction of a kobo.
    *
    * Fund shares accrue on every deal, including one closed by staff or by
    * nobody: the rule is a percentage of every transaction, not of every
    * commission.
    */
   export function splitDeal(
     amountMinor: number,
     split: CommissionSplit,
     chain: readonly (ChainMember | null)[],
   ): DealSplit {
     const people: SplitLine[] = [];
     const funds: FundShare[] = [];
     if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
       return { people, funds, keptMinor: 0 };
     }

     const rates = personRates(split);
     for (let i = 0; i < 3; i += 1) {
       const member = chain[i];
       const rate = rates[i] ?? 0;
       if (!member || member.status !== "active" || rate <= 0) continue;
       const amount = Math.floor((amountMinor * rate) / 100);
       if (amount <= 0) continue;
       people.push({
         marketerId: member.id,
         marketerName: member.name,
         code: member.code,
         level: (i + 1) as 1 | 2 | 3,
         rate,
         amountMinor: amount,
       });
     }

     for (const [fund, rate] of [
       ["reward", split.rewardPool],
       ["foundation", split.foundation],
     ] as const) {
       if (rate <= 0) continue;
       const amount = Math.floor((amountMinor * rate) / 100);
       if (amount <= 0) continue;
       funds.push({ fund, rate, amountMinor: amount });
     }

     const out =
       people.reduce((total, line) => total + line.amountMinor, 0) +
       funds.reduce((total, share) => total + share.amountMinor, 0);
     return { people, funds, keptMinor: amountMinor - out };
   }

   // TODO(test): a paused level 2 leaves its share in keptMinor and does not
   // promote level 3 into level 2's rate.
   // TODO(test): funds accrue when the chain is empty (a direct sale).
   // TODO(test): keptMinor plus every share equals amountMinor exactly.

``previewEarning`` now takes a ``CommissionSplit``:

.. code-block:: ts

   /** What one marketer would earn closing this, at this price, on this property. */
   export function previewEarning(amountMinor: number, split: CommissionSplit): number {
     if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
     return Math.floor((amountMinor * split.level1) / 100);
   }

Step 5: refusals
----------------

Replace ``ratesRefusal``:

.. code-block:: ts

   /** Five shares that cannot pay out more than the deal is worth. */
   export function splitRefusal(split: CommissionSplit): string | null {
     const entries: [string, number][] = [
       ["Direct", split.level1],
       ["Upline 1", split.level2],
       ["Upline 2", split.level3],
       ["Reward pool", split.rewardPool],
       ["Foundation", split.foundation],
     ];
     for (const [label, rate] of entries) {
       if (!Number.isFinite(rate)) return `${label} must be a number.`;
       if (rate < 0) return `${label} cannot be negative.`;
       if (Math.round(rate * 10) !== rate * 10) {
         return `${label} can have at most one decimal place.`;
       }
     }
     const total = entries.reduce((sum, [, rate]) => sum + rate, 0);
     if (total > 100) return "Those shares add up to more than the deal is worth.";
     return null;
   }

   /** Every cell, named, so a settings save says which one is wrong. */
   export function matrixRefusal(matrix: CommissionMatrix): string | null {
     for (const ownership of OWNERSHIPS) {
       for (const kind of DEAL_KINDS) {
         const refusal = splitRefusal(matrix[ownership][kind]);
         if (refusal) return `${OWNERSHIP_LABEL[ownership]} ${kind}: ${refusal}`;
       }
     }
     return null;
   }

Step 6: the closer, the source and the deal fields
--------------------------------------------------

.. code-block:: ts

   /** Who closed a deal. A marketer earns; staff and direct earn nothing. */
   export const CLOSER_KINDS = ["marketer", "staff", "direct"] as const;
   export type CloserKind = (typeof CLOSER_KINDS)[number];

   export const CLOSER_KIND_LABEL: Record<CloserKind, string> = {
     marketer: "A marketer",
     staff: "AV Homes staff",
     direct: "Walk-in, nobody to pay",
   };

   /** Where a deal came from, so analytics can separate the network from walk-ins. */
   export const DEAL_SOURCES = ["app", "console"] as const;
   export type DealSource = (typeof DEAL_SOURCES)[number];

``Deal`` gains, all required with the backfill in task 2 supplying them:

.. code-block:: ts

   closerKind: CloserKind;
   /** A marketer id, a user id, or empty for direct. */
   closerId: string;
   closerName: string;
   /** Whose property it was, snapshotted: the rate depended on it. */
   ownership: Ownership;
   /** The split as applied, so a settings change never rewrites a settled deal. */
   split: CommissionSplit;
   fundShares: FundShare[];
   keptMinor: number;
   source: DealSource;

Step 7: the rating
------------------

.. code-block:: ts

   export interface RatingWeights {
     value: number;
     deals: number;
     conversion: number;
     speed: number;
   }

   export const DEFAULT_RATING_WEIGHTS: RatingWeights = {
     value: 50, deals: 20, conversion: 20, speed: 10,
   };

   /** What a person did in the period, as the rating needs it. */
   export interface RatingInput {
     valueMinor: number;
     deals: number;
     /** Leads they handed over that reached a decision, won or lost. */
     leadsDecided: number;
     leadsWon: number;
     /** Median days from lead created to deal closed. 0 when they had none. */
     medianDays: number;
   }

   /** The best in the period, so a score is relative to a real person. */
   export interface RatingTops {
     valueMinor: number;
     deals: number;
   }

   export interface RatingBreakdown {
     value: number;
     deals: number;
     conversion: number;
     speed: number;
     /** 0 to 100, the sum of the four above. */
     score: number;
   }

   /** Thirty days from lead to close scores full marks; ninety scores nothing. */
   const SPEED_FLOOR_DAYS = 30;
   const SPEED_CEILING_DAYS = 90;

   /**
    * A score out of 100 with its parts, never stored.
    *
    * An input a person has no data for scores 0 on that part rather than
    * excluding them, and the breakdown is always rendered, so "why is my score
    * low" is answerable from the screen rather than from this function.
    */
   export function ratePerson(
     input: RatingInput,
     weights: RatingWeights,
     tops: RatingTops,
   ): RatingBreakdown {
     const share = (value: number, top: number) => (top > 0 ? Math.min(1, value / top) : 0);
     const value = weights.value * share(input.valueMinor, tops.valueMinor);
     const deals = weights.deals * share(input.deals, tops.deals);
     const conversion =
       input.leadsDecided > 0 ? weights.conversion * (input.leadsWon / input.leadsDecided) : 0;
     const speed =
       input.medianDays > 0
         ? weights.speed *
           Math.max(
             0,
             Math.min(
               1,
               (SPEED_CEILING_DAYS - input.medianDays) /
                 (SPEED_CEILING_DAYS - SPEED_FLOOR_DAYS),
             ),
           )
         : 0;
     const round = (n: number) => Math.round(n * 10) / 10;
     const parts = {
       value: round(value), deals: round(deals),
       conversion: round(conversion), speed: round(speed),
     };
     return { ...parts, score: round(parts.value + parts.deals + parts.conversion + parts.speed) };
   }

   // TODO(test): the top performer scores the full value and deals weights.
   // TODO(test): nobody with leads scores conversion above 0 on zero won.
   // TODO(test): score never exceeds the sum of the four weights.

Step 8: ``MarketingSettings``
-----------------------------

Remove ``saleRates`` and ``rentRates`` from the type. Add:

.. code-block:: ts

   /** The four rate cells. See splitFor. */
   commission: CommissionMatrix;
   /** Display names for the two funds. Renameable; the keys never change. */
   rewardPoolName: string;
   foundationName: string;
   rating: RatingWeights;

``DEFAULT_MARKETING_SETTINGS`` takes ``commission: DEFAULT_COMMISSION_MATRIX``,
``rewardPoolName: "Reward Pool"``, ``foundationName: "AV Foundation"``,
``rating: DEFAULT_RATING_WEIGHTS``.

Step 9: ``funds.ts``
--------------------

.. code-block:: ts

   /**
    * The two pots that are nobody's commission.
    *
    * They are NOT ledger lines. `marketing_ledger` is what marketers are owed
    * and `reconcile()` proves it balances against that; a row in there with no
    * person behind it would break the one check this feature must never hide.
    */
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
     dealId: string | null;
     /** The percentage snapshotted at accrual. 0 on a payout. */
     rate: number;
     awardId: string | null;
     note: string;
     proof: string[];
     byName: string;
     createdAt: number;
     updatedAt: number;
   }

   /** A fund's standing. Every figure is a sum, never a stored number. */
   export interface FundBalance {
     fund: FundKind;
     /** The renameable display name, resolved from settings by the caller. */
     name: string;
     currency: string;
     accruedMinor: number;
     paidMinor: number;
     balanceMinor: number;
     entries: number;
     lastAt: number | null;
   }

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
     /** The composite rating, for context. NOT what ranks. */
     score: number;
   }

   export interface RewardAward {
     id: string;
     /** `2026-Q3`. One award per quarter. */
     quarter: string;
     status: AwardStatus;
     potMinor: number;
     currency: string;
     standings: RewardStanding[];
     winnerKind: "marketer" | "staff" | null;
     winnerId: string | null;
     winnerName: string | null;
     ledgerLineId: string | null;
     reference: string;
     proof: string[];
     reason: string;
     decidedByName: string;
     decidedAt: number | null;
     createdAt: number;
     updatedAt: number;
   }

   /** `2026-Q3` for the quarter a timestamp falls in, in the server's own zone. */
   export function quarterOf(at: number): string {
     const d = new Date(at);
     return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
   }

   /** "July to September 2026" from `2026-Q3`. Used on both sides. */
   export function quarterLabel(quarter: string): string {
     const [year, q] = quarter.split("-Q");
     const index = (Number(q) - 1) * 3;
     const names = [
       "January", "February", "March", "April", "May", "June",
       "July", "August", "September", "October", "November", "December",
     ];
     const first = names[index];
     const last = names[index + 2];
     if (!first || !last) return quarter;
     return `${first} to ${last} ${year ?? ""}`.trim();
   }

   /** Half open: `from` inclusive, `to` exclusive, so no deal lands in two quarters. */
   export function quarterRange(quarter: string): { from: number; to: number } {
     const [year, q] = quarter.split("-Q");
     const y = Number(year);
     const start = (Number(q) - 1) * 3;
     return {
       from: new Date(y, start, 1).getTime(),
       to: new Date(y, start + 3, 1).getTime(),
     };
   }

   /** The quarter before this one, for "close the last finished quarter". */
   export function previousQuarter(quarter: string): string {
     const [year, q] = quarter.split("-Q");
     const n = Number(q);
     return n === 1 ? `${Number(year) - 1}-Q4` : `${year}-Q${n - 1}`;
   }

   // TODO(test): quarterOf lands March 31 in Q1 and April 1 in Q2.
   // TODO(test): quarterRange's `to` equals the next quarter's `from` exactly.

Step 10: ``analytics.ts``
-------------------------

.. code-block:: ts

   export const PERIOD_KEYS = ["7d", "30d", "90d", "quarter", "year", "all"] as const;
   export type PeriodKey = (typeof PERIOD_KEYS)[number];

   export const PERIOD_LABEL: Record<PeriodKey, string> = {
     "7d": "Last 7 days",
     "30d": "Last 30 days",
     "90d": "Last 90 days",
     quarter: "This quarter",
     year: "This year",
     all: "All time",
   };

   /** Half open, and the label is what a screen renders beside every figure. */
   export interface Period {
     key: PeriodKey;
     from: number;
     to: number;
     label: string;
     /** The window of equal length before `from`, for a trend. Null for "all". */
     previousFrom: number | null;
   }

   export interface ValuePoint {
     day: string;
     valueMinor: number;
     deals: number;
   }

   export interface MoneyOverview {
     currency: string;
     valueMinor: number;
     deals: number;
     /** Null when there is no previous window to compare against. */
     previousValueMinor: number | null;
     commissionMinor: number;
     keptMinor: number;
     rewardMinor: number;
     foundationMinor: number;
     byOwnership: Record<Ownership, { valueMinor: number; deals: number }>;
     byKind: Record<DealKind, { valueMinor: number; deals: number }>;
     byCloser: Record<CloserKind, { valueMinor: number; deals: number }>;
     /** Zero filled across the period. A gap is a zero, never a missing point. */
     series: ValuePoint[];
   }

   export interface TransactionRow {
     dealId: string;
     closedOn: number;
     listingId: string;
     listingTitle: string;
     ownership: Ownership;
     kind: DealKind;
     amountMinor: number;
     currency: string;
     closerKind: CloserKind;
     closerName: string;
     source: DealSource;
     status: DealStatus;
     /** Collapsed by default on every surface that draws this. */
     shares: DealShare[];
     fundShares: FundShare[];
     keptMinor: number;
     proof: string[];
   }

   export interface ListingFunnelRow {
     listingId: string;
     title: string;
     ownership: Ownership;
     status: PropertyStatus;
     priceMinor: number;
     currency: string;
     views: number;
     sessions: number;
     enquiries: number;
     leads: number;
     /** Set when it sold or let in the period. */
     soldMinor: number | null;
     /** Days from published to closed, or to now while it is still live. */
     daysOnMarket: number | null;
   }

   export interface PersonRow {
     kind: "marketer" | "staff";
     personId: string;
     name: string;
     code: string;
     deals: number;
     valueMinor: number;
     /** What they personally earned. 0 for staff. */
     earnedMinor: number;
     leadsDecided: number;
     leadsWon: number;
     rating: RatingBreakdown;
   }

   /** A partner's own money: no internal breakdown, by design. */
   export interface PartnerSaleRow {
     listingId: string;
     title: string;
     closedOn: number;
     kind: DealKind;
     soldMinor: number;
     /** What AV Homes took in total, not how it was divided. */
     feeMinor: number;
     netMinor: number;
     currency: string;
   }

Step 11: roles
--------------

.. code-block:: ts

   export type Role =
     | "owner" | "developer" | "agent" | "editor" | "support" | "marketer" | "partner";

``RoleInfo`` gains:

.. code-block:: ts

   /**
    * Every read is narrowed to records this account owns.
    *
    * One flag read by one function, `isScopedRole`, because a scope enforced per
    * route is a scope that is missing from the route somebody adds next month.
    */
   scoped?: true;

The entry:

.. code-block:: ts

   partner: {
     label: "Partner lister",
     tagline: "Their own property, their own numbers",
     description:
       "Lists property they own, uploads its photography and watches how it performs. Sees only their own listings, and their listings go live once AV Homes approves them.",
     grants: ["listings", "media", "analytics"],
     scoped: true,
   },

``ALL_ROLES`` gains ``"partner"``. ``ASSIGNABLE_ROLES`` does NOT: it is minted by
approving an application, like ``marketer``. ``isConsoleRole`` returns true for it.
New helper:

.. code-block:: ts

   /** Does this role see only records it owns? Read by authorize() and every list. */
   export function isScopedRole(role: Role): boolean {
     return ROLE_INFO[role]?.scoped === true;
   }

``canManage`` and ``canAssign`` are unchanged: an admin can disable a partner
account through the existing team rules, and nobody can assign the role directly.

Step 12: exports and the gates
------------------------------

``packages/contracts/src/index.ts`` re-exports ``./funds`` and ``./analytics``.

Run all three gates. ``npm run typecheck`` will fail in the packages and screens
that read ``saleRates``, ``splitCommission``, ``ratesRefusal`` or the
``PropertyStatus`` maps. Those are tasks 4, 5 and 14. Do not chase them here:
fix only what is inside ``packages/contracts``, and confirm the remaining errors
are all in files those tasks own. Record the list in the commit body.

Commit
------

.. code-block:: bash

   git add packages/contracts/src
   git commit -m "feat(contracts): a deal's split knows whose property it was"

--------------------------------------------------------------------------------

Task 2: the migration
=====================

Files
  Create ``packages/db/src/migrations/0015_analytics_and_funds.ts``. Modify
  ``packages/db/src/migrations/index.ts``, ``packages/db/src/collections.ts``.

Consumes
  ``OWNERSHIPS``, ``PROPERTY_STATUSES``, ``FUND_KINDS``, ``CLOSER_KINDS``,
  ``DEAL_SOURCES``, ``AWARD_STATUSES``, ``ALL_ROLES`` from task 1.

Step 1: collection names
------------------------

.. code-block:: ts

   fundLedger: "fund_ledger",
   rewardAwards: "reward_awards",
   listingViews: "listing_views",
   partnerApplications: "partner_applications",

Step 2: the migration
---------------------

Follow ``0011``'s shape exactly: a ``why`` string that explains the reasoning, the
shared bson constants at the top, ``ensureCollection`` then ``ensureIndex``, and
re-apply any validator whose enum has changed.

The ``why`` must say, in the file:

- Why the funds are their own collection rather than ledger rows (``reconcile()``).
- Why ``ownership`` is backfilled to ``av`` (every listing today is AV Homes').
- Why deals are backfilled as marketer-closed from the app (that is what every
  existing row is, by construction: the console had no way to record one).
- Why ``listing_views`` carries no person (the privacy position in
  ``packages/analytics``).

Backfills, each with an explicit filter so a re-run is a no-op:

.. code-block:: ts

   await db.collection(COLLECTIONS.properties).updateMany(
     { ownership: { $exists: false } },
     { $set: { ownership: "av", ownerLabel: "", closedDealId: null } },
   );

   /* Every existing deal was filed from the app by the marketer who closed it:
      the console had no way to record one until this release. */
   await db.collection(COLLECTIONS.marketingDeals).updateMany(
     { closerKind: { $exists: false } },
     [
       {
         $set: {
           closerKind: "marketer",
           closerId: "$reporterId",
           closerName: "$reporterName",
           ownership: "av",
           source: "app",
           fundShares: [],
           keptMinor: 0,
         },
       },
     ],
   );

The deal backfill is an aggregation pipeline update, because ``closerId`` copies
``reporterId`` and ``$set`` with a field path needs one. ``split`` is deliberately
NOT backfilled: an old deal's ``shares`` already record what was paid, and
inventing the cell it came from would assert a rate that did not exist. The
``split`` field is therefore optional on the stored document and the reader
coalesces it, which task 4 handles.

Validators to update:

- ``properties``: ``status`` enum gains ``submitted``; ``ownership`` enum;
  ``ownerLabel`` string; ``closedDealId`` nullable string.
- ``marketing_deals``: the eight new fields, money fields using ``MONEY``.
- ``users``: role enum gains ``partner``, re-applied from ``usersValidator``.
- ``audit``: entity enum gains ``deal``, ``fund``, ``award``, ``application``.

Indexes:

.. code-block:: text

   properties        (ownership, status)                   the analytics split
   properties        (status, updatedAt)                   the review queue
   fund_ledger       (fund, createdAt desc)                a fund's statement
   fund_ledger       dealId                                reversal on cancel
   reward_awards     quarter unique                        one award per quarter
   listing_views     (listingId, day)                      the funnel read
   listing_views     expiresAtDate TTL 0                   the 90 day sweep
   partner_appls     email, partial on decidedAt: null     one open application

Step 3: gates and commit
------------------------

Run ``npm run db:migrate -- --dry`` against the local stack, then
``npm run db:migrate``. The runner reads the indexes back off the server, so a
silent failure is visible. Then the three gates.

.. code-block:: bash

   git add packages/db/src
   git commit -m "feat(db): collections for the two funds, listing views and partner applications"

--------------------------------------------------------------------------------

Task 3: the funds package
=========================

Files
  Create ``packages/funds/package.json``, ``packages/funds/tsconfig.json``,
  ``packages/funds/src/index.ts``, ``repo.ts``, ``routes.ts``. Modify the root
  ``tsconfig.json`` paths and ``packages/api/src/app.ts``.

Copy ``packages/feedback``'s ``package.json`` and ``tsconfig.json`` as the
template: it is the smallest package and has the right shape.

Produces
  .. code-block:: ts

     export async function fundBalances(db: Db, names: Record<FundKind, string>): Promise<FundBalance[]>
     export async function fundBalance(db: Db, fund: FundKind, name: string): Promise<FundBalance>
     export async function listFundEntries(db: Db, input: { fund: FundKind; limit: number; cursor?: string }): Promise<{ entries: FundEntry[]; nextCursor: string | null }>
     /** The port marketing receives. Accrues both shares for one deal. */
     export async function accrueForDeal(db: Db, input: { dealId: string; currency: string; shares: readonly FundShare[]; byName: string }): Promise<void>
     /** The reverse, for a cancelled deal. Negative entries, nothing deleted. */
     export async function reverseForDeal(db: Db, input: { dealId: string; byName: string; note: string }): Promise<number>
     export async function disburse(db: Db, input: { fund: FundKind; amountMinor: number; currency: string; note: string; proof: string[]; byName: string }): Promise<FundEntry>
     export async function getAward(db: Db, quarter: string): Promise<RewardAward | null>
     export async function listAwards(db: Db, limit: number): Promise<RewardAward[]>
     export async function proposeAward(db: Db, input: { quarter: string; potMinor: number; currency: string; standings: RewardStanding[] }): Promise<RewardAward>
     export async function settleAward(db: Db, input: { quarter: string; winner: { kind: "marketer" | "staff"; id: string; name: string } | null; reference: string; proof: string[]; reason: string; byName: string; payMarketer: (winnerId: string, amountMinor: number, note: string) => Promise<string> }): Promise<RewardAward>
     export function fundsRoutes(): Hono<AppEnv>

Step 1: ``repo.ts``
-------------------

Invariants to hold in the file, with a comment on each:

- ``accrueForDeal`` is **idempotent on ``dealId``**. It inserts with an ``_id``
  derived from the deal and the fund (``newId`` is not used for these), so a
  retry after a crash between the ledger write and the fund write cannot double
  count. Use ``insertMany`` with ``ordered: false`` and swallow duplicate key
  errors, which is the only place in this package a 11000 is not an error.
- ``disburse`` refuses an amount greater than the balance, as
  ``PreconditionFailedError("insufficient_fund")``, and refuses empty proof.
  Spending a fund into the negative is not a thing to record, it is a thing to
  stop.
- ``settleAward`` writes the ``fund_ledger`` payout **after** the winner is
  credited, and for a marketer winner the credit is the injected
  ``payMarketer`` callback returning the new ledger line id. That callback is how
  this package avoids importing marketing: the composition root passes it.
- ``settleAward`` refuses a quarter that is not finished yet, and refuses a second
  settlement of an award already ``awarded``.

Step 2: ``routes.ts``
---------------------

All under ``/api/admin/funds`` and ``/api/admin/awards``, each with
``requireAuth()`` and ``requireAdmin()`` per route, never ``use("*")``. Domain
rules come in task 8.

.. code-block:: text

   GET  /admin/funds                    both balances
   GET  /admin/funds/:fund/entries      keyset paged statement
   POST /admin/funds/:fund/disburse     Foundation spending, proof required
   GET  /admin/awards                   the award history
   GET  /admin/awards/:quarter          one award with its standings
   POST /admin/awards/:quarter/propose  close the quarter, snapshot the table
   POST /admin/awards/:quarter/settle   confirm the winner, or skip

Step 3: mount and commit
------------------------

Mount in ``app.ts`` below ``auditTrail()``, beside ``marketingAdminRoutes()``.
Add the workspace to the root ``tsconfig.json`` path map alongside the others.

.. code-block:: bash

   git add packages/funds package.json tsconfig.json packages/api/src/app.ts
   git commit -m "feat(funds): a community fund and a quarterly prize, append only"

--------------------------------------------------------------------------------

Task 4: marketing reads the matrix and records a sale
=====================================================

Files
  Modify ``packages/marketing/src/settings.ts``, ``repo.ts``, ``routes.ts``,
  ``index.ts``.

Consumes
  Task 1's types, task 3's ``accrueForDeal`` and ``reverseForDeal`` as injected
  ports.

Step 1: settings coalescing
---------------------------

``readMarketingSettings`` derives the matrix when the stored document has none:

.. code-block:: ts

   /**
    * The rate cells, derived from the legacy pair when this document predates
    * the matrix.
    *
    * The stored `saleRates` and `rentRates` were AV Homes' own rates, because
    * partner property did not exist as a concept, so they become the `av` row
    * and `partner` takes the defaults. Both funds take 1, which is the rule the
    * owner set. The legacy fields are read here and never written again.
    */
   function commission(doc: SettingsDoc): CommissionMatrix {
     if (doc.commission) return coalesceMatrix(doc.commission);
     const d = DEFAULT_COMMISSION_MATRIX;
     const legacy = (pair: unknown, fallback: CommissionSplit): CommissionSplit =>
       Array.isArray(pair) && pair.length === 3
         ? { level1: num(pair[0]), level2: num(pair[1]), level3: num(pair[2]),
             rewardPool: 1, foundation: 1 }
         : fallback;
     return {
       av: {
         sale: legacy(doc.saleRates, d.av.sale),
         rent: legacy(doc.rentRates, d.av.rent),
       },
       partner: d.partner,
     };
   }

``WRITABLE`` drops ``saleRates`` and ``rentRates`` and gains ``commission``,
``rewardPoolName``, ``foundationName``, ``rating``.

Step 2: ``recordSale``
----------------------

The one function behind the one door. Signature:

.. code-block:: ts

   export interface RecordSaleInput {
     listingId: string;
     unitKey: string;
     kind: DealKind;
     amountMinor: number;
     currency: string;
     buyerName: string;
     buyerPhone: string;
     closedOn: number;
     proof: string[];
     note: string;
     closer:
       | { kind: "marketer"; marketerId: string }
       | { kind: "staff"; userId: string; name: string }
       | { kind: "direct" };
     /** The deal this grew out of, when an admin is settling a reported one. */
     dealId: string | null;
     actorId: string;
     actorName: string;
   }

   export async function recordSale(
     db: Db,
     input: RecordSaleInput,
     settings: MarketingSettings,
     listing: { ownership: Ownership; title: string; location: string; estate: string },
     accrue: FundAccrualPort,
   ): Promise<Deal>;

Order of writes, and the comment in the file must say why it is this order:

1. Refuse if another approved deal already claims ``(listingId, unitKey)``. The
   partial unique index is the real guard; this is the readable error.
2. Resolve the chain. ``chainFor`` for a marketer closer, empty otherwise.
3. ``splitDeal`` with ``splitFor(settings.commission, listing.ownership, kind)``.
4. Write the deal, ``status: "approved"``, ``source: "console"``, snapshotting
   ``ownership``, ``split``, ``fundShares`` and ``keptMinor``.
5. Insert the marketer ledger lines, if any.
6. ``accrue(...)``, which is idempotent on the deal id.
7. Return the deal. **The listing is closed by the caller**, in
   ``packages/listings``, because a feature package may not write another's
   collection. The route in task 5 does both in sequence.

``proof`` is refused when empty, with ``BadRequestError``, and the refusal is
also exported as a pure function so the sheet in task 10 shows the same words:

.. code-block:: ts

   export function recordSaleRefusal(input: {
     amountMinor: number; buyerName: string; proof: readonly string[];
     closer: { kind: CloserKind }; closedOn: number;
   }): string | null;

Step 3: ``reviewDeal`` and ``cancelDeal``
-----------------------------------------

``reviewDeal`` now reads the cell by the deal's own ``ownership`` rather than
``settings.saleRates``, snapshots ``split``, ``fundShares`` and ``keptMinor``, and
calls ``accrue`` after its ledger insert. It still does **not** close the listing:
it raises the alert instead, which is task 5's ``closePending`` alert.

``cancelDeal`` gains a ``reverse`` port call after its existing clawback logic,
and the note names the cancelled deal.

Step 4: closer search and previews
----------------------------------

.. code-block:: ts

   /** Marketers matching a code or name, for the closer picker. At most 8. */
   export async function findClosers(db: Db, query: string): Promise<ChainMember[]>;

   /** The split this sale would produce, for the sheet, before anything is written. */
   export async function previewSale(
     db: Db,
     input: { listingId: string; ownership: Ownership; kind: DealKind; amountMinor: number;
              closer: RecordSaleInput["closer"] },
     settings: MarketingSettings,
   ): Promise<DealSplit>;

``previewShares`` is replaced by ``previewSale``. The existing route that served
it moves to the new shape.

Step 5: reconcile
-----------------

``reconcile()`` gains one check, and its problem strings name the deal:

.. code-block:: ts

   /* Every approved deal's fundShares must have a matching accrual, and no
      accrual may exist without an approved deal. This is the check that catches
      a crash between step 5 and step 6 of recordSale. */

Step 6: gates and commit
------------------------

.. code-block:: bash

   git add packages/marketing/src
   git commit -m "feat(marketing): a sale is recorded once, with proof and a name on it"

--------------------------------------------------------------------------------

Task 5: listings carry ownership and close with proof
=====================================================

Files
  Modify ``packages/listings/src/authorize.ts``, ``repo.ts``, ``schema.ts``,
  ``routes/admin.ts``, ``routes/public.ts``,
  ``packages/contracts/src/publish-check.ts``,
  ``packages/contracts/src/listing-rules.ts``.

Step 1: the scoped branch in ``authorize.ts``
---------------------------------------------

.. code-block:: ts

   /**
    * Four rules now, because one role does not read everything.
    *
    *  - **read**: every signed-in user reads everything, EXCEPT a scoped role,
    *    which reads only what it owns. One agency with an invite-only staff list
    *    plus outside partners who are not staff.
    *  - **write**: the listing's own account, or an admin.
    *  - **status**: never a scoped role. Publishing is AV Homes' decision.
    *  - **destroy**: admin only.
    */
   export type Action = "read" | "write" | "status" | "destroy";

   export function authorize(
     listing: { agentUserId: string | null },
     user: AuthUser,
     action: Action,
   ): boolean {
     if (action === "destroy") return isAdminRole(user.role);
     if (action === "status") return !isScopedRole(user.role);
     if (action === "read") {
       return isScopedRole(user.role) ? listing.agentUserId === user.id : true;
     }
     if (listing.agentUserId === null) return isAdminRole(user.role);
     return listing.agentUserId === user.id || isAdminRole(user.role);
   }

``assertAuthorized`` gains the ``status`` sentence: "only AV Homes can publish a
listing".

A read filter for list queries, because ``authorize`` answers about one record and
a list must not fetch what it will then drop:

.. code-block:: ts

   /** The Mongo filter a list query adds for this caller. Empty for staff. */
   export function scopeFilter(user: AuthUser): Record<string, unknown> {
     return isScopedRole(user.role) ? { agentUserId: user.id } : {};
   }

Step 2: the fields and the status
---------------------------------

``schema.ts`` gains ``ownership`` (required, defaulting to ``av`` on create for a
staff caller) and ``ownerLabel``. A partner's create is forced to
``ownership: "partner"`` server side, never trusted from the body.

Lifecycle transitions in ``repo.ts``:

.. code-block:: text

   draft      -> submitted   a partner submits, or staff submits on their behalf
   submitted  -> live        staff approves, publish check must pass
   submitted  -> draft       staff sends it back, with a reason
   live       -> closed      ONLY through recordSale, never a bare status write

``closeWithSale(db, listingId, dealId)`` sets ``status: "closed"`` and
``closedDealId``, and is the only writer of that pair. ``reopenFromSale`` is its
reverse for a cancelled deal.

The publish check runs on submission as well as on publish, so a partner is told
what is missing while they can still fix it.

Step 3: the route
-----------------

.. code-block:: text

   POST /admin/properties/:id/submit    partner or staff
   POST /admin/properties/:id/approve   staff only, runs the publish check
   POST /admin/properties/:id/send-back staff only, reason required
   POST /admin/properties/:id/sale      the one door: recordSale then closeWithSale
   POST /admin/properties/:id/sale/preview   the sheet's live breakdown

The ``sale`` route is the sequencing point: it calls ``recordSale`` in marketing
through an injected port, then ``closeWithSale`` locally. Both halves are in one
handler so the ordering is readable in one place, and the audit trail records one
entity change naming the deal.

Step 4: the alert
-----------------

``alertsFor`` in marketing gains an admin-side counterpart, or the existing
``/admin/alerts`` page gains a row source: an approved deal whose listing is not
yet closed. Tone ``act``, one action, linking to the sale sheet pre-filled.

Step 5: gates and commit
------------------------

.. code-block:: bash

   git add packages/listings/src packages/contracts/src
   git commit -m "feat(listings): a listing says whose it is and only closes with proof"

--------------------------------------------------------------------------------

Task 6: partner accounts
========================

Files
  Create ``packages/identity/src/repo/applications.ts``,
  ``packages/identity/src/routes/applications.ts``. Modify
  ``packages/identity/src/index.ts``, ``packages/identity/src/middleware.ts``.

Step 1: the application
-----------------------

.. code-block:: ts

   export const APPLICATION_STATUSES = ["open", "approved", "refused"] as const;

   export interface PartnerApplication {
     id: string;
     name: string;
     email: string;
     phone: string;
     company: string;
     /** What they have to list, in their own words. */
     about: string;
     /** How many properties, roughly. A range, not a promise. */
     portfolio: string;
     status: ApplicationStatus;
     reason: string;
     decidedByName: string;
     decidedAt: number | null;
     createdAt: number;
     updatedAt: number;
   }

Approving creates an invite for the address at role ``partner`` and returns the
join URL, reusing the existing invite machinery rather than a second door. The
mail is sent through the existing ``Mailer`` port, and the URL comes back in the
response so it can be sent by hand when mail is not configured, exactly as team
invites already do.

Step 2: routes and the gate
---------------------------

.. code-block:: text

   POST /public/partner-applications    public, rate limited like the enquiry intake
   GET  /admin/applications             team domain
   POST /admin/applications/:id/decide  team domain, admin only

The public POST is mounted **below** the origin guard and **not** in the
cacheable ``/public/*`` router, for the same reason the enquiry intake is not: it
is a public mutation.

``RULES`` in ``middleware.ts`` gains, before the ``danger`` catch-all:

.. code-block:: ts

   { prefix: "/api/admin/applications", domain: "team" },
   { prefix: "/api/admin/analytics", domain: "analytics" },
   { prefix: "/api/admin/funds", domain: "marketing" },
   { prefix: "/api/admin/awards", domain: "marketing" },

Step 3: gates and commit
------------------------

.. code-block:: bash

   git add packages/identity/src
   git commit -m "feat(identity): somebody outside AV Homes can apply to list property"

--------------------------------------------------------------------------------

Task 7: per-listing views
=========================

Files
  Modify ``packages/analytics/src/index.ts``, ``src/components/SitePulse.tsx``.

Step 1: the beacon
------------------

``PulseBody`` gains:

.. code-block:: ts

   /**
    * Which listing this page is, when it is one.
    *
    * Bounded and charset-restricted like `sid`, because it becomes part of a
    * document key. Absent on every other page.
    */
   listing: str().min(4).max(64).regex(/^[A-Za-z0-9_-]+$/u, "listing").optional(),
   /** True the first time this session sees this listing, asserted by the client. */
   firstForListing: z.boolean().optional(),

The listing counter is a second update after the session update, in the same
handler, keyed ``<listingId>:<day>``:

.. code-block:: ts

   /*
    * A counter per listing per day, and NO PERSON.
    *
    * `sessions` is client-asserted through `firstForListing`, which is the same
    * trust the client-minted `sid` already carries and is bounded by the same
    * two rate limiters. The alternative, a list of seen listings on the visit
    * row, is an unbounded array on a document written on every beacon.
    */

Step 2: readers
---------------

.. code-block:: ts

   export async function listingViews(db: Db, input: { listingIds: readonly string[]; from: string; to: string }): Promise<Map<string, { views: number; sessions: number }>>
   export async function topListings(db: Db, input: { from: string; to: string; limit: number }): Promise<{ listingId: string; views: number; sessions: number }[]>
   export async function viewSeries(db: Db, input: { listingId: string; days: number }): Promise<{ day: string; views: number }[]>

Every series is zero filled by the server, the rule ``sitePulse`` already holds.

Step 3: the client
------------------

``SitePulse`` takes an optional ``listing`` prop, and the listing detail page
passes it. The first-view flag is remembered in ``sessionStorage`` under
``avhomes.seen.<listingId>``, wrapped in try/catch, defaulting to sending
``firstForListing: true`` when storage throws (a slight over-count beats a silent
zero).

Commit
------

.. code-block:: bash

   git add packages/analytics/src src/components/SitePulse.tsx src/app/\(site\)/listings
   git commit -m "feat(analytics): a listing counts its own views, still with no person attached"

--------------------------------------------------------------------------------

Task 8: the spanning read
=========================

Files
  Create ``packages/api/src/analytics.ts``. Modify ``packages/api/src/app.ts``,
  ``packages/api/src/dashboard.ts``, ``packages/api/src/TESTS.todo.ts``.

This file is the analogue of ``dashboard.ts`` and the same reasoning puts it here:
it is the read that spans listings, marketing, funds, enquiries and analytics, and
no feature package may know about another.

Step 1: the scope
-----------------

.. code-block:: ts

   /**
    * What this caller may count.
    *
    * One function, read by every query below, so a page added later cannot
    * forget it. A partner's `listingIds` is resolved once per request rather
    * than joined per query, because the set is small (their own stock) and a
    * `$lookup` per figure would be six of them.
    */
   interface Scope {
     /** Null means everything. A list means only these listings. */
     listingIds: string[] | null;
     /** False hides every money figure, for a role without `marketing`. */
     money: boolean;
     /** True renders the partner's reduced money shape instead of the full one. */
     partner: boolean;
   }

   async function scopeFor(c: Context<AppEnv>, db: Db): Promise<Scope>;

Step 2: the routes
------------------

.. code-block:: text

   GET /admin/analytics/overview      MoneyOverview + SitePulse + counts
   GET /admin/analytics/transactions  keyset paged TransactionRow
   GET /admin/analytics/listings      ListingFunnelRow, sorted by the asked column
   GET /admin/analytics/people        PersonRow with the rating
   GET /admin/analytics/traffic       the pulse, the series, top listings
   GET /admin/analytics/export        CSV of transactions for the period

Each parses its period with one shared helper that turns a ``PeriodKey`` into a
``Period``, including ``previousFrom``, and **echoes the resolved period in the
response** so the screen renders the scope it actually got rather than the scope
it asked for.

The people read builds the league from two sources, marketer deals and
staff-closed deals, then computes ``RatingTops`` across the combined set before
calling ``ratePerson`` per person. Doing tops first is why this cannot be a
per-person query.

Step 3: gates and commit
------------------------

Append the cross-cutting coverage notes to ``TESTS.todo.ts`` in the idiom there:
the scope function refusing to leak, the period echo, the zero-fill.

.. code-block:: bash

   git add packages/api/src
   git commit -m "feat(api): one scope-aware read behind every analytics page"

--------------------------------------------------------------------------------

Task 9: the five shared primitives
==================================

Files
  Create ``src/components/admin/StatTile.tsx``, ``MiniChart.tsx``,
  ``SplitBreakdown.tsx``, ``PeriodPicker.tsx``, ``OwnershipBadge.tsx``. Modify
  ``src/components/admin/PulseStrip.tsx`` to use ``StatTile``.

No new colour, radius or shadow. Everything draws from the tokens in
``globals.css`` and the existing ``Card``, ``Badge`` and ``Tone``.

``StatTile``
------------

.. code-block:: tsx

   export function StatTile({ label, value, scope, trend, onClick, expanded }: {
     label: string;
     value: string;
     /** The period or population, rendered under the value. Never a tooltip. */
     scope: string;
     /** Null when there is no previous window. Renders "first in this window". */
     trend?: { pct: number; up: boolean } | null;
     onClick?: () => void;
     expanded?: boolean;
   })

Tabular figures on the value. When ``onClick`` is set it is a ``button`` with
``aria-expanded``, so the disclosure is announced rather than implied.

``MiniChart``
-------------

One component, two modes, inline SVG, no dependency.

.. code-block:: tsx

   export function MiniChart({ points, mode, height, label }: {
     /** Zero filled by the server. A gap is a zero, never a missing point. */
     points: readonly { label: string; value: number }[];
     mode: "line" | "bars";
     height?: number;
     /** The accessible description, since the shape itself says nothing aloud. */
     label: string;
   })

``role="img"`` with that label, and a ``<title>``. The series is one colour from
``--wine-600``; a second series is never distinguished by colour alone, so this
component draws one at a time by design.

``SplitBreakdown``
------------------

The component that makes the sheet and the transaction row agree.

.. code-block:: tsx

   export function SplitBreakdown({ amountMinor, currency, people, funds, keptMinor, names, open, onToggle }: {
     amountMinor: number;
     currency: string;
     people: readonly SplitLine[];
     funds: readonly FundShare[];
     keptMinor: number;
     /** The renameable fund names, from settings. */
     names: Record<FundKind, string>;
     open?: boolean;
     onToggle?: () => void;
   })

Collapsed it is one line: "Commission and shares: N total". Open it is a
definition list of every level by name with its rate, both funds, and what AV
Homes keeps, ending in a row that sums to the deal amount so a reader can check
it adds up.

``PeriodPicker`` and ``OwnershipBadge``
---------------------------------------

``PeriodPicker`` is a ``Segmented``-styled control over ``PERIOD_KEYS`` that
writes the key to the URL query, so a period survives a refresh and can be
linked. ``OwnershipBadge`` is ``Badge`` with ``tone="wine"`` for AV Homes and
``tone="neutral"`` for Non-AV, wording from ``OWNERSHIP_LABEL``, one place.

Commit
------

.. code-block:: bash

   git add src/components/admin
   git commit -m "feat(console): the tile, chart and breakdown every analytics page shares"

--------------------------------------------------------------------------------

Task 10: the record-a-sale sheet
================================

Files
  Create ``src/components/admin/RecordSale.tsx``. Modify
  ``src/app/admin/properties/[id]/page.tsx``,
  ``src/components/admin/listing/Segmented.tsx`` usage for ownership.

Step 1: the sheet
-----------------

Built on ``BottomSheet``, the pattern the console already uses for a focused job.
One question at a time down the sheet, in this order, because each answer narrows
the next:

1. Sold or let (pre-filled from the listing type, not asked twice).
2. Amount, through ``MoneyInput``, which already refuses a bad number with a
   reason.
3. Who closed it: three ``Segmented`` options, then a marketer search that shows
   code and name, or a staff picker, or nothing for direct.
4. Buyer name and phone, through ``PhoneField``.
5. The date it closed, defaulting to today, refusing the future.
6. Proof, through ``ImagePicker``, at least one, with the refusal wording from
   ``recordSaleRefusal`` so the sheet and the server never disagree.
7. ``SplitBreakdown``, collapsed, from the preview route. It updates as the
   amount and closer change and is the last thing above the confirm button,
   because it is what the person is confirming.

The confirm button says what it will do: "Record the sale and close this
listing". Not "Submit".

Step 2: the ownership control on the form
-----------------------------------------

A ``Segmented`` beside the sale/rent control, labelled "Whose property is this",
with a one line hint naming the consequence: "Non-AV property pays a smaller
commission". Hidden and forced for a partner account, which can only list its
own.

Step 3: gates and commit
------------------------

.. code-block:: bash

   git add src/components/admin src/app/admin/properties
   git commit -m "feat(console): one sheet closes a listing, with proof and a name"

--------------------------------------------------------------------------------

Task 11: the six analytics pages
================================

Files
  Create ``src/app/admin/analytics/layout.tsx``, ``page.tsx``,
  ``transactions/page.tsx``, ``listings/page.tsx``, ``people/page.tsx``,
  ``wallets/page.tsx``, ``traffic/page.tsx``. Modify
  ``src/components/admin/nav.tsx``, ``src/lib/admin/audit.ts``.

Every page: ``PageHeader`` with the one question as the subtitle,
``PeriodPicker`` in the actions slot, at most four ``StatTile``s, then the detail.
Loading is ``Skeleton``, empty is ``EmptyState`` with the one action that would
fill it, error is ``ErrorNote`` with retry. All three already exist.

============================  ==================================================
Page                          Above the fold, then
============================  ==================================================
Overview                      Value transacted, deals, commission out, kept.
                              Then AV vs Non-AV, a ``MiniChart`` on request, and
                              both wallet balances as two cards.
Transactions                  Value, deals, average. ``DataTable`` where the
                              primary column is the listing, ownership is a
                              ``badge`` column, amount is ``numeric``, and the
                              row expands into ``SplitBreakdown`` plus proof.
                              ``TableToolbar`` filters, ``TablePager`` keyset.
Listings                      Views, enquiries, leads, sold. ``DataTable`` of the
                              funnel with a drop-off column, sortable, and a
                              "looked at, never enquired" filter which is the
                              page's actual reason to exist.
People                        Top closer, deals, value, average. One league
                              table, rating with its breakdown in the expanded
                              row, marketer and staff chips.
Wallets                       Two cards side by side, each with balance, in, out.
                              The Foundation card has "Record a disbursement".
                              The Reward card shows the current quarter's
                              standings and the award flow.
Traffic                       Live, sessions, views. The 30 day series and top
                              listings by views. The scope sentence from
                              ``PulseStrip`` is repeated verbatim here.
============================  ==================================================

Nav: a new ``Analytics`` section with the six children, ``domain: "analytics"``,
placed above ``Marketers``. The Dashboard row keeps its place: it is the landing
screen, and this is the section you go to on purpose.

Commit
------

.. code-block:: bash

   git add src/app/admin/analytics src/components/admin/nav.tsx src/lib/admin
   git commit -m "feat(console): six analytics pages, one question each"

--------------------------------------------------------------------------------

Task 12: the partner surface
============================

Files
  Create ``src/app/(site)/list-with-us/page.tsx``,
  ``src/app/admin/partners/page.tsx``. Modify
  ``src/app/admin/properties/page.tsx``, ``src/components/admin/nav.tsx``,
  ``src/components/admin/ConsoleShell.tsx``.

Step 1: the public form
-----------------------

One screen on the marketing site, in the site's own voice, not the console's.
Name, email, phone, company, what they have, roughly how many. It says what
happens next in one sentence, because an application with no stated outcome is an
application people chase by phone.

Step 2: the queue
-----------------

``/admin/partners`` lists applications, newest first, ``open`` first. Approving
shows the invite URL, as the team screen already does. Refusing takes a reason.

Step 3: the scoped console
--------------------------

For a ``partner`` role:

- The nav shows Listings, Media and Analytics only, which the existing
  ``visible()`` check already produces from the role's grants.
- The listings screen gains a **Waiting for AV Homes** filter, and for staff a
  count badge on the nav row, because a queue nobody sees is a queue nobody works.
- The lifecycle buttons collapse to one, "Submit for review", and the status card
  explains what review means in a sentence.
- The analytics pages render the partner shape: their own funnel, and money as
  sale price, AV Homes' fee, their net. Nothing about who earned what.

Commit
------

.. code-block:: bash

   git add src/app/\(site\)/list-with-us src/app/admin/partners src/app/admin/properties src/components/admin
   git commit -m "feat(console): a partner lists their own property and watches only it"

--------------------------------------------------------------------------------

Task 13: the marketer app tells the truth about Non-AV
======================================================

Files
  Modify ``src/lib/marketer/earnings.ts``,
  ``src/components/marketer/listings/*``, ``src/app/m/listings/page.tsx``,
  ``packages/marketing/src/routes.ts`` (the listing feed).

The feed the app reads carries ``ownership``. The earning preview calls
``previewEarning(amountMinor, splitFor(commission, ownership, kind))``, and a
Non-AV card carries the ``OwnershipBadge`` so the smaller number has a visible
reason beside it. A marketer choosing what to push sees the real figure before
spending a week on it, which is the whole point of the field.

Commit
------

.. code-block:: bash

   git add src/lib/marketer src/components/marketer src/app/m packages/marketing/src/routes.ts
   git commit -m "feat(m): a Non-AV listing shows what it really pays"

--------------------------------------------------------------------------------

Task 14: the settings screen
============================

Files
  Modify ``src/app/admin/marketers/settings/page.tsx``.

The rate table becomes a grid: four rows (AV sale, AV rent, Non-AV sale, Non-AV
rent) by five columns. Each row shows its own total and turns red past 100, using
``splitRefusal``'s words, so the refusal is visible before Save rather than after
it. Two text fields rename the funds. Four number fields weight the rating, with
their running total shown, because weights that do not sum to 100 make a score
out of something other than 100 and the screen should say so.

Above the grid, one sentence: what a change here does and does not do. It applies
to deals approved from now on and never rewrites a settled one. That is the most
important fact on the screen and it is currently nowhere.

Commit
------

.. code-block:: bash

   git add src/app/admin/marketers/settings
   git commit -m "feat(console): the rate grid says whose property each row prices"

--------------------------------------------------------------------------------

Task 15: the README
===================

Files
  Modify ``README.rst``.

The package table gains ``@avhomes/funds``. The mount order block gains the new
routers in their real positions. The data conventions section gains the fund
append-only rule beside the existing money rule. A new short section documents
the analytics section's five UX rules, because they are a contract for whoever
adds the seventh page.

.. code-block:: bash

   git add README.rst
   git commit -m "docs: the funds package, the new mounts and the analytics rules"

--------------------------------------------------------------------------------

Self-review
===========

**Spec coverage.** Ownership task 1 and 5. The matrix task 1, 4, 14. ``splitDeal``
task 1. Funds task 1, 3. Awards task 1, 3, 11. Record a sale task 4, 5, 10.
Cancel reversal task 4. Partner role task 1, 6, 12. ``submitted`` task 1, 2, 5.
Scoping task 5, 8. Six pages task 11. UX rules task 9, 11. Design system task 9.
Rating task 1, 8, 11, 14. Per-listing views task 7, 8, 11. Migration task 2.
Partner money shape task 8, 12. Marketer app honesty task 13. Docs task 15.

**Naming consistency checked.** ``splitDeal`` / ``splitFor`` / ``splitRefusal`` /
``matrixRefusal`` / ``personRates``; ``accrueForDeal`` / ``reverseForDeal``;
``closeWithSale`` / ``reopenFromSale``; ``scopeFilter`` (listings, Mongo) and
``scopeFor`` (api, request) are deliberately different names for different things.

**Two known follow-ups, out of scope by the spec.** A staff winner is not paid
through a pay run. The Foundation has no per-project budgeting.
