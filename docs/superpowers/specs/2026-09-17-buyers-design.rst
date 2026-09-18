=============================
Buyers: potential buyer logging
=============================

:Date: 2026-09-17
:Status: approved
:Surfaces: the marketer app (``/m``) and the console (``/admin/marketers``)

Why
===

A marketer knows people who want to buy. Today the app gives them exactly one
way to turn that into money: close the sale themselves, then report it at
``/m/deals/new`` with proof attached. That is the whole surface.

Most of what a marketer actually has is earlier than that. A cousin who wants a
three bedroom in Lekki around eighty million. A colleague whose lease ends in
March. Those people are worth real money to AV Homes and the marketer cannot
currently hand them over, because handing them over means losing the thread: a
phone number sent by WhatsApp to an admin has no state, no history, and no
evidence six months later that it was ever sent.

So marketers keep the lead until it closes or dies, and AV Homes never gets the
ones that needed a professional to close them.

Goal
====

A marketer logs somebody who might buy. AV Homes takes the meetings. Both sides
watch the same pipeline move, and if it ends in a sale the marketer is paid
through the machinery that already pays them for deals.

Three constraints shape everything below:

1. **Both sides read one history.** Not an admin view and a marketer view that
   have to be kept in agreement.
2. **No state changes without a reason.** On either side. A pipeline whose
   states move silently is a pipeline nobody trusts.
3. **One money path.** A won lead becomes a ``Deal``. It does not grow a
   parallel commission system.

A lead is not a deal
====================

The obvious cheap move is to add states to ``Deal`` and be done. It is wrong,
and the reason is worth writing down because it is the whole shape of this unit.

``Deal`` records an **outcome**. A marketer sold something, attached proof, and
an admin approved or refused it. It carries one ``reason`` string, one
``reviewedBy``, one ``reviewedAt`` — because there is one decision to record.
Its status field answers "did this pay out".

A lead records a **process**. It moves six or seven times over months, each move
made by a different person for a different reason, and the value of the record
is the sequence rather than the current value. Squeezing that into one
``reason`` string means every state change destroys the last one, which is
precisely the history both sides are supposed to be watching.

So: a new collection, a sibling to deals rather than a mode of one, and the
storage is a timeline rather than a field.

.. code-block:: text

   Deal      one decision, one reason, one reviewer        -> "did this pay"
   Lead      many moves, a reason each, two sides moving   -> "where is this"

Data
====

``packages/contracts/src/marketing.ts`` gains the types,
``packages/marketing/src/schema.ts`` the document and its mapper, and
``packages/marketing/src/leads.ts`` the reads and writes. Leads are a big enough
surface that putting them in ``repo.ts`` would push that file past 1900 lines,
so they get their own module beside it.

States
------

.. code-block:: text

   new -> contacted -> meeting -> viewed -> offer -> won
     \________\__________\_________\_________\____ -> lost

``new`` is the marketer logging somebody. ``won`` and ``lost`` are terminal, but
reversible: see `Reversing a win`_. Anything live can go to ``lost`` from
anywhere, because that is how leads actually die.

The words on screen are plain on both sides, following the precedent
``DEAL_STATUS_LABEL`` already sets of never showing a marketer the word the
database uses:

.. code-block:: text

   new        Logged
   contacted  We called them
   meeting    Meeting booked
   viewed     They viewed
   offer      Talking price
   won        Bought
   lost       Closed

The timeline
------------

.. code-block:: ts

   interface LeadEvent {
     at: number;
     from: LeadState;
     to: LeadState;
     bySide: "marketer" | "admin";
     byName: string;
     /** The chip they picked. One of REASONS[to]. */
     reason: string;
     /** Their own words. Never empty: that is the point of the feature. */
     note: string;
   }

Events are appended and never edited, the same discipline ``LedgerLine`` holds
for money. ``lead.state`` is the ``to`` of the last event and exists only so a
list query does not have to read the array.

Both sides render the same ``events[]``. There is no admin-private note field,
and that is a deliberate refusal rather than an omission: the moment one exists,
the marketer's copy of the history stops being the history, and the transparency
this feature is for becomes a claim instead of a structural fact. An admin who
needs a private note has the audit trail and the deal's own ``note``.

What a lead is about
--------------------

``buyerName`` and ``buyerPhone`` identify the person. What they want is
**either** a listing **or** a description, never neither:

.. code-block:: ts

   listingId: string | null;     // they have one in mind
   wantKind: DealKind | null;    // or: sale/rent, and...
   wantArea: string;             //     where
   wantBudgetMinor: number;      //     roughly how much

Requiring a listing would be cleaner data and worse data. A marketer holding a
vague lead and facing a required listing picker does not abandon the form, they
pick something close enough, and the field becomes a lie that an admin then
works from. Optional keeps it honest.

Who may move what
=================

.. code-block:: text

   admin      any state, any time, reason + note required
   marketer   -> lost only, from a live state, reason + note required

The marketer owns their end. They know before anyone else when a buyer has gone
quiet or bought elsewhere, and making them phone an admin to record it means it
does not get recorded. They do not own the pipeline, because ``won`` mints money
and a marketer who can declare their own payday is a control that does not
survive its first dispute.

Reasons are a picked chip plus a required note, per target state:

.. code-block:: text

   contacted  Reached them / Left a message / Wrong number
   meeting    They picked a date / We offered dates / Rescheduled
   viewed     Inspection done / They came alone / Agent showed them
   offer      They made an offer / We sent terms / Negotiating price
   won        Paid in full / Deposit taken / Papers signed
   lost       Went quiet / Bought elsewhere / Price too high /
              Not ready yet / Wrong details / Other

The note is required in every case, including when the chip is self-explanatory.
A chip is filterable data; the note is what a human reads in March to remember
what happened. Making the note conditional optimises for the tap and loses the
only part with real information in it.

Money
=====

Admin marks **Won**. That creates a ``Deal`` from the lead, already approved,
which falls into the path that already exists:

.. code-block:: text

   lead won -> Deal(status: approved)
            -> splitCommission(amount, rates, chain)
            -> LedgerLine per share, status "earned"
            -> next PayRun picks them up
            -> marketer is paid

``lead.dealId`` holds the link and ``deal.leadId`` holds it back. The marketer's
lead screen then grows a card showing their share, so the thread from "I logged
my cousin in July" to "₦4,000,000 landed in October" is one screen deep.

Converting needs the amount and the listing, which is why ``won`` is admin-only
even before the money argument: the marketer frequently does not know the final
number.

Reversing a win
---------------

A sale falls through. The admin moves the lead off ``won``, with a reason and a
note like every other move, and the linked deal is cancelled.

``cancelDeal`` (``repo.ts:712``) already does the hard half correctly, and this
unit reuses it rather than restating it: lines still ``earned`` or ``scheduled``
go ``void``; lines already ``paid`` get a negative ``clawback`` line pointing at
what it reverses. Nothing is deleted, so a marketer's history stays readable a
year later, which is the property the ledger was built for.

The lead lands on whichever state the admin chose — usually ``lost``, sometimes
``offer`` if the sale is being renegotiated rather than dead. The reversal is an
ordinary ``LeadEvent`` in the timeline. The marketer sees the reason, because
money leaving their balance without an explanation on the same screen is the
single fastest way to lose their trust.

HTTP
====

Mounted in ``packages/marketing/src/routes.ts`` beside deals, same three-router
split, same ``requireAuth()`` and ``marketing`` domain gate.

.. code-block:: text

   GET   /marketing/leads                  their own, newest first
   POST  /marketing/leads                  log one
   GET   /marketing/leads/:id              theirs, or 404
   POST  /marketing/leads/:id/state        -> lost only, reason + note
   POST  /marketing/leads/:id/note         a line on the timeline, no move

   GET   /admin/marketing/leads            filterable by state
   GET   /admin/marketing/leads/:id
   POST  /admin/marketing/leads/:id/state  any state, reason + note
   POST  /admin/marketing/leads/:id/convert   -> won, mints the Deal

``convert`` is its own route rather than a ``state`` call with extra fields,
because it is the one transition that takes money-shaped input (amount, listing,
unit) and the one that can fail for reasons that have nothing to do with the
lead. Folding it into ``state`` would give that route two unrelated failure
modes and one confusing body schema.

Notifications reuse ``deps.notify`` exactly as deals do: a logged lead tells the
console, and every admin move tells the marketer through the existing
``MarketerAlert`` path, which needs no new storage because alerts are derived on
read.

Screens
=======

Console
-------

``/admin/marketers/buyers``, a new child row under Marketers in
``src/components/admin/nav.tsx``, between Deals and Pay day. A ``DataTable``
with a state filter, because that is what the console does with a queue and a
second pattern would be a second thing to learn.

``/admin/marketers/buyers/[id]`` is the timeline, the state changer, and
Convert.

App
---

A new Menu tile at ``/m/buyers``. The Menu grid in ``NavBar.tsx`` currently runs
3-2-3; Buyers fills the gap in row 2 and makes it a clean 3-3-3.

.. code-block:: text

   /m/buyers        Open / Bought / Closed, segmented
   /m/buyers/new    log one
   /m/buyers/[id]   the timeline, and Update when it can still be closed

Design system
=============

This unit also carries a pass over the app's visual language, because two of the
changes are token-level and would otherwise have to be made twice.

Flat
----

Every shadow and glow used as decoration comes out. What stays is
``--m-edge``, the hairline and lit top lip that give a dark card its edge, since
removing it makes cards dissolve into the ground.

.. code-block:: text

   m.css:614   .m-btn--primary      wine glow                 remove
   m.css:774   .m-card              var(--m-drop)             remove
   m.css:620   .m-menu__dot         active glow               remove
   m.css:671   .m-menu__close       wine glow                 remove
   m.css:424   .m-*                 drop-shadow filter        remove
   m.css:1380  .m-*                 drop-shadow filter        remove
   m.css:876   .m-btn--whatsapp     hardcoded #059669         tokenise

Money has a direction
---------------------

``--m-good-fg`` and ``--m-bad-fg`` are **status** tokens: they colour "Approved"
and "Not approved". Money in and money out is a different axis that happens to
want similar hues today, and sharing the token means the day someone tunes the
"Approved" green they silently retune every credit in the app.

.. code-block:: text

   --m-in-fg     money arriving     #5fd3a3 dark / #047857 paper
   --m-out-fg    money leaving      #ff8a8a dark / #b91c1c paper

Colour is never the only signal. Every amount carries a sign (``+`` / a true
``−``) and every row carries the words "Money In" or "Money Out", so the list
reads correctly in greyscale and for a red-green colour blind reader. The
codebase already holds this line at ``m.css:866`` for failed fields.

New components
--------------

``src/components/marketer/``:

- ``Calendar.tsx`` — a month grid with a month/year jump. Opens on the current
  month and clamps to the account's lifetime, rather than falling through an
  empty value to the epoch.
- ``SuccessBurst.tsx`` — the badge scales in, then one burst of confetti on a
  canvas. Roughly 26 particles, one shot, no library. Under
  ``prefers-reduced-motion`` it is a fade with no motion and no particles.
- ``ReceiptSheet.tsx`` — short by default: amount, who, when, status. "More
  info" expands to reference, session id and tap-to-copy.
- ``money/TxRow.tsx`` and ``DateRangeSheet.tsx``.

Transaction history
-------------------

``/m/money/history``: every money event for the account in one list, newest
first — ledger lines and the payouts pay runs actually sent. Search, a Money In
/ Money Out filter, a date range through the calendar sheet, and a receipt on
any row.

This deliberately merges what ``/m/money`` deliberately keeps apart. That screen
splits payments from earnings because merged they read as double counting; the
history screen is a ledger, where the merge is the point and the type column
carries the distinction. Both are correct for their own job.

Login
-----

The wine hero becomes a passport block: their initial in a thin wine-ringed
disc, "Welcome back" small over their first name large, and the masked email as
a quiet tappable chip beneath, all on the same 16px gutter every other hero
uses. The sheet holds one field and one flat button. The chip's pencil clears
the memory and returns the full email and password form.

Stored on the device: first name and masked email. Never a password, never a
token. Sessions are untouched. Join gets the same treatment so the two doors
look like one app.

Not in this unit
================

- The home screen keeps its current rounder language until its own pass.
- No lead assignment to a specific admin. One queue until there is evidence of
  two people fighting over it.
- No lead import or bulk anything.
- No SLA timers or ageing alerts on a stale lead. Worth having, worth having
  after real leads exist to measure.
