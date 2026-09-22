=======================================
Partners: companies, staff and review
=======================================

:Date: 2026-09-22
:Status: approved
:Builds on: ``2026-09-20-analytics-and-funds-design.rst``, "Partner accounts"
:Surfaces: the console (``/admin``), the public listing pages

Why
===

The first partner release lets somebody outside AV Homes apply at
``/list-with-us``, be approved, sign in to the console and submit listings that
only AV Homes can publish. Five things it leaves out have now been asked for.

1. **A partner is one person.** Access is scoped to ``agentUserId``, the account
   that created a listing, so an agency of three people shares one login or
   cannot work.
2. **Nothing is bounded.** An approved partner can fill the review queue and
   the site with as many listings as they like.
3. **Approval happens once.** A listing is read before it goes live, and a
   minute later the partner can change its price, photographs or description
   straight onto the site.
4. **The partner never meets their buyers.** A partner listing shows the
   partner's own contact card, but everything a buyer types, in the form or the
   chat, lands in AV Homes' inbox, which a partner cannot open.
5. **A partner sees only part of their own business.** The owner has decided a
   partner sees everything recorded about their own listings. PR #12 opened
   Transactions to them in full; their buyers and their proposed changes are
   still out of reach.

Two more gaps come out of those five.

6. **A send-back has no reason.** ``sendBack`` moves a submitted listing to
   draft and stores nothing about why, so the partner gets a draft back and has
   to phone somebody.
7. **There is no way to stop a partner as a whole.** Approval is the only
   control. Stopping one means finding and disabling each account, and their
   listings stay live.

Goal
====

A partner is a company. Its people work on its listings together, inside
limits AV Homes sets, and nothing they write reaches the public site until AV
Homes has read it. They answer their own buyers and see every record about
their own listings.

Four constraints shape everything below.

1. **One id decides what a partner may see: the company's.** ``partnerId`` is
   read off the session, never off a request, and every scoped query carries
   it. One function in ``@avhomes/contracts`` turns a signed-in account into
   that scope, so no package decides for itself what a partner is.
2. **Nothing reaches the public site without an AV Homes yes.** That already
   holds for new listings. It now holds for edits to live ones. Whatever only
   takes something away (under offer, sold, taken down) happens at once.
3. **A limit bounds what a partner can ask for next, never what exists.**
   Lowering one never takes anything down.
4. **Nothing unapproved is stored on the listing.** The public API returns the
   stored listing as it is, so a proposed price kept on the listing document is
   one field away from being published. Proposed changes and review notes live
   in their own collection, which no public route reads.

Three choices
=============

**A company id on each account, not a list of accounts.** The alternatives were
scoping every query to the list of a company's user ids, which changes whenever
somebody joins or leaves and strands the listings of whoever left, or one
shared login, which loses per-person history and makes removing somebody a
password change. One id carried by every row and every account is the only
version where "their listings" means the same thing tomorrow.

**Proposed changes in their own collection, not on the listing.** A field on
the listing is the simplest to write and is one field away from the public API.
A second listing document per edit needs its own slug, its own history and a
swap on approval. A patch held where no public route reads is neither.

**Threads stamped with the company when they arrive, not joined when read.**
Analytics joins through a partner's listing ids because it only counts. The
inbox has to find a thread by company quickly, keep finding it after the
listing is archived or trashed, and index it. A stamped id does all three.

The company
===========

.. code-block:: ts

   export const PARTNER_STATUSES = ["active", "suspended"] as const;
   export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

   export interface PartnerLimits {
     /** Listings not yet approved: drafts plus those waiting for AV Homes. */
     review: number;
     /** Listings on the market: live plus under offer. Sold is not counted. */
     live: number;
     /** Staff accounts plus open invites. The main account is not counted. */
     staff: number;
   }

   export interface Partner {
     id: string;
     /** What the public site prints after "Listed by". Only AV Homes changes it. */
     name: string;
     contactName: string;
     /** Where new buyer threads and review decisions are mailed. */
     contactEmail: string;
     contactPhone: string;
     status: PartnerStatus;
     /** Why it was last suspended or reinstated. The partner reads it. */
     statusReason: string;
     /** A null field takes the default from Partners settings. */
     limits: { [K in keyof PartnerLimits]: number | null };
     mainUserId: string;
     applicationId: string;
     createdAt: number;
     updatedAt: number;
     revision: number;
   }

The ``partners`` collection belongs to ``@avhomes/identity``, beside the
applications and the invites. Feature packages may import identity, which is
the tier below them, so listings can read a company's limits and enquiries can
read its contact address directly, with no port. A package of its own at that
tier would be a second identity with the same position and no different rule.

``name`` starts as the application's company, or the applicant's name when that
was blank, and only AV Homes changes it. It is printed on the public site, and a
partner able to rename themselves "AV Homes" could pass their listings off as
ours.

Membership
----------

``UserDoc`` and ``AuthUser`` gain two fields.

.. code-block:: ts

   /** The company a partner account works for. Null for everyone else. */
   partnerId: string | null;
   /** "main" manages staff and company details. Null for everyone else. */
   partnerRole: "main" | "staff" | null;

On the account rather than in a membership collection, because the session
already resolves the account on every request and every package already has
``currentUser(c)``. Scoping by a field it holds costs no read. A membership
lookup would be a read per request in five packages. Rows written before the
fields existed coalesce to null, the rule ``avatarUrl`` already follows.

The one function
----------------

.. code-block:: ts

   /** An id no document carries. A scoped account without a company gets it. */
   export const NO_PARTNER = "ptnr_none";

   /**
    * The company this account is confined to, or null when it is not confined.
    *
    * Null means every row, and only an unscoped role gets it. A scoped role
    * with no company gets NO_PARTNER, so a broken account reads nothing rather
    * than everything.
    */
   export function partnerScopeOf(user: Pick<AuthUser, "role" | "partnerId">): string | null;

Every place that narrows a partner today moves to it.

==============================  ======================  ===========================
Where                           Today                   After
==============================  ======================  ===========================
``authorize()`` in listings     ``agentUserId``         ``partnerId``
The listing list pin            ``agentUserId``         ``partnerId``
A partner creating a listing    ``agentUserId`` only    both, forced from the session
``scopeFor()`` in analytics     ``agentUserId``         ``partnerId``
The image library               ``uploadedBy``          ``partnerId`` on the image
Listing history                 ``authorize()``         unchanged: follows it
The enquiry inbox               not reachable           ``partnerId`` on the thread
==============================  ======================  ===========================

Partner accounts are managed on their partner's page, never on the Team
screen, which is for AV Homes' own people. The Team list leaves them out, the
way ``8cea406`` left marketers out, and every team route that acts on an
account refuses a partner one with a pointer to Partners, as ``manage_marketer``
does for marketers. They stay in the audit trail's actor filter, where a
partner who changed a listing is a name somebody needs to find.

That takes back a choice PR #12 made: it kept partners on Team because Team was
then the only place an account could be disabled. So the partner page's account
controls and the move off Team ship in the same pass, and there is never a
moment with no way to stop a partner account.

Staff
=====

The main account is the person whose application was approved. They invite
staff by email from **Staff** in the console. AV Homes does not approve staff:
the staff limit is AV Homes' control.

Every account in a company works on every one of its listings and every one of
its buyers. Only the main account invites or removes staff and edits the
company's contact details.

Invites
-------

``InviteDoc`` gains ``partnerId`` and ``partnerRole``. A staff invite is an
ordinary invite at role ``partner`` that carries the company, claimed through
whichever console door is live, exactly like the main account's. ``admit()``
under Clerk and ``/auth/password/claim`` under the password door both hand the
invite's ``partnerId`` and ``partnerRole`` to ``createUser``. There is no third
door.

Approving an application now makes the company before the invite. The
application is claimed by the CAS that already exists, the company is upserted
on a unique ``applicationId``, and the invite carries its id with
``partnerRole: "main"``. The upsert is what lets a retry after a failure finish
the job rather than make a second company.

Removing somebody
-----------------

The main account removes a staff member. Their account is disabled and every
session ended, through the functions the team screen already uses, and the
slot is free at once.

Their listings stay with the company, because they were always the company's.
On any of those whose contact card is that person, the card switches to the
main account's details in the same request. This is the one change to a live
listing that skips review, and it has to: a departed employee's number on a
live listing sends buyers to somebody who no longer works there, and holding
the fix for review would leave it there for a day.

The main account cannot remove themselves. When the main person leaves, AV
Homes moves the main role to another staff member from the partner's page.

AV Homes can also disable or re-enable any one account from the partner's page,
which is how one person is stopped without suspending the company. Disabling a
staff account frees its slot and switches its contact cards exactly as a
removal does. The main account cannot be disabled on its own: AV Homes moves
the main role first, or suspends the company, because a company whose main
account is off has nobody who can manage its staff.

Limits
======

Three numbers per company. Each is the company's own value, or the default from
**Partners settings** when it has none.

==========  =======  ===================================================
Limit       Default  Counts
==========  =======  ===================================================
``review``  3        Listings not yet approved: ``draft`` and
                     ``submitted``, not in the trash
``live``    10       Listings on the market: ``live`` and
                     ``under-offer``. Sold is not counted
``staff``   3        Staff accounts that are not disabled, plus invites
                     neither accepted nor expired. The main account is
                     not counted
==========  =======  ===================================================

A count is taken when an action needs it, and never stored. A stored count
drifts the first time a listing moves through a path that forgot to update it,
and every lifecycle op, the trash and the migration are such paths.

======================================  ======  ====================================
Action                                  Limit   Refused with
======================================  ======  ====================================
A partner creates a listing             review  ``limit_reached``, naming the limit,
                                                the count and the maximum
A partner unarchives or restores one    review  The same
A partner sends one for review          live    The same: it could not be approved
AV Homes approves one                   live    The same, telling AV Homes to raise
                                                the limit or wait
AV Homes puts a sold one back           live    The same
A main account invites staff            staff   The same
AV Homes re-enables a staff account     staff   The same
======================================  ======  ====================================

Nothing else is refused by a limit. Moving between ``live`` and
``under-offer`` changes no count, and a change to a live listing is not a new
listing.

Two requests at the same instant can each see room for one more, and both
succeed. The overshoot is at most the number of people in the company, it only
happens by accident, and these limits are commercial caps rather than safety
bounds, so it is accepted rather than closed with a counter that would drift.

Lowering a limit takes nothing down. A company over its limit keeps what it has
and cannot add more until it is back under, and its Company screen says so in
those words.

Changes to a live listing
=========================

A partner editing a listing that is on the site edits a proposal. The approved
version stays live, untouched, until AV Homes approves the change.

``listing_reviews``
-------------------

One document per listing that has something in front of AV Homes, or something
AV Homes sent back.

.. code-block:: ts

   export const REVIEW_KINDS = ["new", "change"] as const;
   export type ReviewKind = (typeof REVIEW_KINDS)[number];

   export const REVIEW_STATES = ["drafting", "waiting", "sent-back"] as const;
   export type ReviewState = (typeof REVIEW_STATES)[number];

   export interface ListingReview {
     /** The listing's id. One review per listing at a time. */
     id: string;
     partnerId: string;
     kind: ReviewKind;
     state: ReviewState;
     /** A change only: the fields that differ from the live listing. */
     patch: PropertyPatch | null;
     /** A change only: the live revision the patch was made against. */
     baseRevision: number | null;
     /** AV Homes' reason on a send-back. Required there, empty otherwise. */
     note: string;
     noteByName: string;
     noteAt: number | null;
     updatedByName: string;
     updatedAt: number;
     submittedAt: number | null;
   }

For a **new** listing the status stays the truth about where it is:
``submitted`` is waiting and ``draft`` is with the partner. The review document
holds only the note from a send-back, so the partner reads why, and it is
deleted when the listing is published. ``sendBack`` now requires the note.

For a **change** the review document is the change.

.. code-block:: text

   partner saves          drafting    the patch is stored; the site is unchanged
   partner sends it       waiting     the publish check runs on the listing as it
                                      would be, so a gap is found now
   AV Homes approves      (deleted)   the patch is applied; the live listing moves
   AV Homes sends back    sent-back   with a note; the partner edits and resends
   partner discards       (deleted)   the live listing never changed

Approving applies the patch through the same save path a direct edit takes, so
slug changes, price history, the featured rules and the publish check all hold
unchanged. The price history names the partner person who proposed the price,
and the audit trail names the AV Homes person who approved it.

The patch holds only the fields the partner changed. If the live listing moved
after the change was made, because AV Homes corrected something or the partner
marked it under offer, AV Homes reviews the patch against the listing as it is
now, under a line saying it moved, and approving overwrites only the fields in
the patch.

The ``PATCH`` route refuses a partner on a listing with a public status and says
where changes go. The editor never sends one, and the refusal is what stops a
hand-made request from going around review.

The editor
----------

On a live or under offer listing, a partner's editor opens the listing with
their proposal laid over it, under a line saying the site shows the approved
version until AV Homes has read the change. Save stores the proposal. **Send
for review** and **Discard changes** sit beside it, and a sent-back change
shows AV Homes' note above the form.

Reviewing a change
------------------

AV Homes sees the change field by field, what the site says now beside what the
partner proposes, with photographs added and removed shown as photographs.
Approve, or send back with a note.

What happens at once
--------------------

Whatever only takes something away does not wait.

===============  ==============================================================
Status           What a partner can do: at once, unless it says it waits
===============  ==============================================================
``draft``        Edit it. Send it for review. Archive it. Put it in the trash
``submitted``    Withdraw it to draft. Nothing else until AV Homes decides
``live``         Propose changes, which wait. Mark it under offer. Record the
                 sale. Take it down. Mark an estate option sold out, or back
``under-offer``  Propose changes, which wait. Put it back on the market.
                 Record the sale. Take it down
``closed``       Nothing. Putting a sold listing back is AV Homes' call,
                 because the recorded sale has to be cancelled first
``archived``     Bring it back as a draft, then send it again
===============  ==============================================================

``withdraw`` is a new op, ``submitted`` to ``draft``, for partners. A partner
never publishes and never unpublishes. Taking a listing down is archiving it,
and bringing it back goes through review again.

An estate option's availability has its own small route, because an estate
sells option by option and sold does not wait. Every other field of an option
is content, and content waits.

Their own buyers
================

Buyer threads about a partner's listing go to the partner.

- **The intake stamps the company.** ``POST /enquiries`` and the chat look up
  the listing's ``partnerId`` through a port injected at ``packages/api``,
  because the enquiries package may not read listings. It never comes from the
  request body, so a buyer cannot route a message to a company by naming one.
- **The partner role gains ``enquiries``.** Every inbox route narrows by
  ``partnerScopeOf``, so a partner reads, answers and closes their own threads
  and gets a not-found for anyone else's.
- **The mail goes to them.** A new thread on a partner listing is mailed to the
  company's ``contactEmail`` and appears in every one of its accounts'
  notifications. ``ENQUIRY_NOTIFY_TO`` is not mailed for it.
- **AV Homes still sees every thread.** The console inbox opens on AV Homes'
  own threads, with a **Partners** filter beside it. Anybody holding
  ``enquiries`` can read a partner thread and answer it, and the buyer sees who
  answered.
- **The buyer knows who they are talking to.** A partner listing says "Listed
  by" and the company's name on its card and its page, the chat is headed with
  the company's name, and the transcript mail says "your conversation with" the
  company rather than "with our team".
- **A marketer's referral shows.** A thread that came in through a marketer's
  link says so, with the code, so the partner knows AV Homes brought that
  buyer.

"Listed by" is a new field on the public listing, ``partner: { name }``,
resolved through identity in one batched read per page. It follows the rule in
the readme: optional on the wire, coalesced once in ``src/lib/data.ts``, and
built against the live API before it merges.

Selling
=======

A marketer selling a partner's listing is unchanged. They report it, AV Homes
checks the proof and approves it, and the listing comes off the market through
the sold-still-listed prompt from PR #12
(``POST /admin/marketing/deals/:id/close-listing``, which writes no money). The
partner is told, and the deal appears in full on their Transactions page.

A partner selling it themselves records the sale from the listing through the
same sheet AV Homes uses, with the closer fixed to their company.
``CloserKind`` gains ``partner``.

.. code-block:: text

   closerKind   partner
   closerId     the company's id
   closerName   the company's name
   split        zero in all five places
   fundShares   none
   keptMinor    0

No split, because nobody at AV Homes closed it and no money reached AV Homes.
Writing 2% into the funds and 3.5% as kept would put figures in the books that
no naira stands behind, which is what the analytics spec exists to prevent.
The sale still counts: it proves the listing sold and at what price, and it
closes the listing through the one door there is. A partner's sale is not in
the quarterly league, which ranks AV Homes' own people.

The route is ``POST /admin/partner-sales`` in the marketing package, which owns
deals. It is its own path because the recorded-sale route sits under
``marketing``, a domain a partner must never hold.

**A sale to a buyer a marketer found.** A partner's inbox is where a marketer's
buyer ends up, so a partner can sell to that buyer and record it as their own.
When a partner records a sale on a listing that had a referred thread, AV Homes
gets an alert naming the marketers whose buyers asked about it, so somebody
checks before the commission is lost. It clears when an admin marks the deal
checked. An alert rather than a block, because whether that buyer is the one
who bought is a thing a person has to find out.

What a partner sees
===================

Everything recorded about their own listings.

==================  ===========================================================
Screen              What a partner reads there
==================  ===========================================================
Listings            Their company's, every status, with AV Homes' notes and
                    their proposed changes
Buyers              Their company's threads, whole
Transactions        Every sale on their listings in full: who closed it, each
                    level's name and earnings, both fund shares, what AV Homes
                    kept, the buyer, the proof
Analytics           The overview, listings and traffic pages, over their
                    listings only
Photos              Their company's uploads
Company             Contact details, limits and how much of each is used
Staff               The main account only
==================  ===========================================================

Refused, because they are about other people's property: the dashboard's site
totals, the sellers' league, the fund balances, health alerts about the whole
site, and the marketer app.

**One exception.** A marketer's leads and unapproved deals on a partner's
listing show as counts, not names. Those are buyers a marketer found and has
not yet been paid for, and a partner holding a buyer's name and number before
the sale can sell to them directly and leave the marketer with nothing. Once a
deal is approved it shows in full.

AV Homes' side
==============

**Partners** becomes its own section of the rail, taking the one row that sits
under Team today.

====================  ========  ================================================
Screen                Domain    What it is for
====================  ========  ================================================
Applications          team      Unchanged
Partners              team      Every company: status, team size, limits, usage
A partner             team      Its team and everything done to it, below
Waiting for review    listings  New listings and changes, oldest first
Settings              team      The default limits
====================  ========  ================================================

A partner's page is where everything about one company is seen and done. It
shows the company, its limits against what is used, and its team: the main
account and every staff account, each with its status and when it was last
active (the newest ``lastSeenAt`` among its sessions), and the invites not yet
accepted. The actions are all there too.

- Disable or re-enable an account.
- Revoke an open invite.
- Move the main role to a staff member.
- Change the company's limits or its name.
- Suspend or reinstate the company, with a reason.

The Team screen keeps AV Homes' own people and nobody else.

Approving and sending back stay with owner and developer, as publishing is
today. A partner's listing belongs to a partner account, so ``authorize()``
refuses the write to everyone else.

The waiting-for-review alert PR #12 added for submitted listings also counts
held changes. One alert is new: a partner's sale on a listing a marketer's
buyer asked about.

The inbox and the image library gain an **AV Homes / Partners** filter and open
on AV Homes' own, so a busy partner does not bury the team's work.

Telling people
==============

``packages/api/src/notifications.ts`` gains ``partnerNotifier`` beside
``developerNotifier``: a notification for every active account in the company,
and a mail to ``contactEmail`` where the event needs one.

==================================  ==========  ======
Event                               Console     Mail
==================================  ==========  ======
A listing approved or sent back     yes         yes
A change approved or sent back      yes         yes
A new buyer thread                  yes         yes
A sale closed by AV Homes           yes         yes
A limit changed by AV Homes         yes         no
Suspended or reinstated             no          yes
==================================  ==========  ======

Suspending a partner
====================

AV Homes can suspend a company, with a reason the partner reads, and reinstate
it.

- Every session of every account in it ends, and every door that issues a
  session refuses its accounts while it is suspended, through one check in
  identity. That means the marketer app's door too: it signs in any account
  with a password, and the cookie it sets opens the console. It refuses partner
  accounts outright, suspended or not, since a partner has no app there.
- Its listings come off the public site and keep their status, so reinstating
  puts back exactly what was there. ``partnerHold`` on each listing does it,
  written through a port by the suspend route, because identity may not write
  the listings collection.
- Its buyers' threads stay readable in AV Homes' inbox, so nobody who wrote is
  left without an answer.

The public site has three separate definitions of visible today: the list
query, the page by slug and similar listings. They become one predicate,
``publicVisible``, which the hold joins. Adding a condition to three copies is
how the third copy gets forgotten.

Routes
======

The ``partner`` role's grants gain ``enquiries``.

======================================================  ============  ==============================
Route                                                   Gate          Who
======================================================  ============  ==============================
``GET /admin/company``                                  own company   Any account in the company
``PATCH /admin/company``                                own company   The main account
``GET /admin/company/staff``                            own company   Any account in the company
``POST /admin/company/staff/invites``                   own company   The main account, staff limit
``DELETE /admin/company/staff/invites/:id``             own company   The main account
``POST /admin/company/staff/:userId/remove``            own company   The main account
``GET /admin/properties/:id/change``                    listings      The company, and AV Homes
``PUT /admin/properties/:id/change``                    listings      The listing's company
``DELETE /admin/properties/:id/change``                 listings      The listing's company
``POST /admin/properties/:id/change/send``              listings      The listing's company
``POST /admin/properties/:id/change/approve``           listings      Owner or developer
``POST /admin/properties/:id/change/send-back``         listings      Owner or developer
``POST /admin/properties/:id/options/:key/available``   listings      The listing's company
``GET /admin/properties/review``                        listings      Owner or developer
``POST /admin/partner-sales``                           listings      A partner, own listing
``GET /admin/partners``                                 team          AV Homes
``GET /admin/partners/:id``                             team          AV Homes
``PATCH /admin/partners/:id``                           team, admin   Limits and name
``POST /admin/partners/:id/suspend``                    team, admin   With a reason
``POST /admin/partners/:id/reinstate``                  team, admin   With a reason
``POST /admin/partners/:id/main``                       team, admin   Move the main role
``POST /admin/partners/:id/accounts/:userId/disable``   team, admin   Not the main account
``POST /admin/partners/:id/accounts/:userId/enable``    team, admin   Staff limit applies
``DELETE /admin/partners/:id/invites/:inviteId``        team, admin   Revoke an open invite
``GET /admin/partner-settings``                         team          AV Homes
``PATCH /admin/partner-settings``                       team, admin   The default limits
======================================================  ============  ==============================

``/admin/company`` is a self-gating subtree like ``/admin/tutorials``: every
route under it reads or writes only the caller's own company and refuses an
account that has none. ``/admin/partner-sales``, ``/admin/partners`` and
``/admin/partner-settings`` each get their own rule in the domain gate, above
the catch-all, so none of them falls to ``danger`` or borrows another's domain.
The lifecycle route takes ``withdraw`` from a partner and requires ``note`` on
``sendBack``.

Data
====

One migration, numbered next in ``packages/db/src/migrations`` when this is
built. PR #12 adds none, so that is ``0016`` unless something else lands
first. Read the folder rather than this document.

=====================  ======================================================
Collection             Change
=====================  ======================================================
``partners``           New. Unique ``applicationId``, index on ``status``
``listing_reviews``    New. ``_id`` is the listing id. Indexes on
                       ``(state, submittedAt)`` and ``partnerId``
``users``              ``partnerId``, ``partnerRole``. Index on ``partnerId``
``invites``            ``partnerId``, ``partnerRole``
``properties``         ``partnerId``, ``partnerHold``. Index on
                       ``(partnerId, status)``
``enquiries``          ``partnerId``. Index on ``(partnerId, createdAt)``
``images``             ``partnerId``. Index on ``(partnerId, createdAt)``
``marketing_deals``    ``closerKind`` gains ``partner``, plus
                       ``referralCheckedAt``
``settings``           A ``partners`` document holding the default limits
=====================  ======================================================

The backfill turns every partner that exists into a company of one.

1. Each account at role ``partner`` gets a company made from its approved
   application, matched on email, with that account as main.
2. Each open invite at role ``partner`` gets the company of its application,
   so somebody who has not signed in yet lands in the right one.
3. Every listing whose ``agentUserId`` is a partner account takes that
   account's ``partnerId``. Every thread takes its listing's, and every image
   its uploader's.

A partner account with no application to match gets a company named after the
account and is listed in the migration's output, so a person decides what it
should be called.

Build order
===========

Two passes, each shippable on its own.

1. **The company.** ``partners``, membership on the account,
   ``partnerScopeOf`` and every scope moved to it, staff, limits, suspension,
   the Partners section with each partner's team and its actions, partner
   accounts off the Team screen, and the migration. After this pass a partner
   is a company with staff inside limits, and nothing a partner sees has
   changed except that their colleagues see it too.
2. **The work.** ``listing_reviews`` with changes held for review and the
   send-back note, the partner inbox, "Listed by", partner sales with the
   referral alert, the notifications, and the partner walkthroughs' steps for
   sending a change for review.

The second pass needs the first pass's ``partnerId`` everywhere, so it cannot
go first.

What PR #12 already did
=======================

This spec is built on PR #12 (``worktree-partner-hardening``), which closed
what a partner account could reach and must merge first. It scopes the image
library, refuses the dashboard and the whole-site health alerts to a partner,
drops ``featured`` and ``agentUserId`` from a partner's save, reads listing
history through ``authorize()``, keeps partners out of the marketer app,
refuses a role change on a partner account, answers Transactions in full over
a partner's own listings, and adds the "Approve and publish" control and the
sold-still-listed prompt. It kept partner accounts on the Team screen, which
this spec moves to the partner's page (see Membership).

Two of those key on the partner's own account, and this spec moves both to the
company through ``partnerScopeOf``: ``scopeFor()`` still reads
``agentUserId``, and the image library's ``ownedBy`` reads ``uploadedBy``, so
without the move staff would not see each other's listings in analytics or
each other's photographs.

Three decisions
===============

The owner confirmed all three on 2026-09-22. The other way is kept beside each,
so changing one later starts from what was weighed.

1. **A partner's own sale carries no fee.** The other way: it takes the Non-AV
   cell with nobody to pay, so the funds take 2% and AV Homes keeps 3.5%. That
   is right only if partners owe AV Homes that on every sale of a listed
   property.
2. **Leads and unapproved deals show as counts.** The other way: names and
   numbers, which lets a partner reach a marketer's buyer before the marketer
   is paid.
3. **Suspension is included** though nobody asked for it, because approval with
   no way to take it back is half a control.

What this does not do
=====================

- **No billing.** Nothing invoices a partner or records what they owe AV Homes.
- **No roles inside a company** beyond main and staff.
- **No moving a listing between companies**, and AV Homes does not assign a
  listing to one. A listing phoned in is typed by an agent as Non-AV property,
  as today.
- **No staff approval by AV Homes.** The staff limit is the control, as agreed.
- **No marketer app for partners.**
- **No company logos.** "Listed by" prints the name.
- **No tests.** Standing project rule. ``TODO(test):`` comments go beside
  ``partnerScopeOf``, the limit counts, the public listing never carrying a
  review, and the refused sign-in of a suspended company.

Verifying
=========

``npm run build``, ``npm run typecheck`` and ``npm run lint``, then, because
``partner`` is a new field on a public listing:

.. code-block:: bash

   VERCEL_URL=av-homes.vercel.app npm run build
