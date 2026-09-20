===========================================
Walkthrough: the money screens
===========================================

:Date: 2026-09-20
:For: whoever runs AV Homes day to day

Three jobs, in the order you will meet them. Each one is a separate video in
``/admin/tutorials`` once those are cut; this is the same walkthrough in writing.

.. contents::
   :local:

--------------------------------------------------------------------------------

1. A house sold. Record it.
===========================

**The one question: how do I take a listing off the market once it has sold?**

There is exactly one way, and it is not a status menu. A listing reaches "Closed"
only through this sheet, which is what makes every closed listing on the site one
with an amount, a buyer and proof behind it.

Open the listing
   **Listings**, then the property. The status card is on the right.

Pick "Record the sale"
   From the status picker, not a button. It says *Sold or let. Needs the amount,
   the buyer and proof*, so you know before you tap that it opens a form.

Correct the amount
   The asking price is already in the box. Change it to what it actually went for,
   which is rarely the same number.

Say who closed it
   Three choices, and this is the field that decides whether anybody gets paid:

   ================  =========================================================
   A marketer        Pays commission up their referral chain. Search by their
                     code (``AV-0008``) or their name.
   AV Homes staff    No commission, because they are salaried. Still counts
                     towards their record and the quarterly prize.
   Walk-in           Nobody to pay. Both funds still take their share.
   ================  =========================================================

Name the buyer, and attach the proof
   A receipt, a bank alert, or the signed agreement. **At least one.** The form
   will not let you past it, and that is deliberate: it is the whole reason this
   flow exists.

Read the split before you confirm
   "What this pays out" opens into every share by name: each level of the chain
   with its percentage, both funds, and what AV Homes keeps. The last line adds
   back up to the sale, so you can see it balances without doing the arithmetic.

Confirm
   The button says **Record it and close this listing**, because it does both. The
   money is recorded and the property comes off the market in one action.

If it falls through
   Cancel the deal from **Analytics → Transactions**. Unpaid commission is voided,
   anything already paid gets a negative line the next pay run subtracts, both
   funds give their share back, and the listing goes back to live. Nothing is
   deleted, so the history still shows what happened.

--------------------------------------------------------------------------------

2. Where did the money go?
==========================

**The one question: we transacted this much, so who got what?**

**Analytics** in the menu. Four tiles, and each one says the period it covers
underneath it:

Transacted
   What every recorded deal in the window came to. Tap it to open the daily chart.

Deals
   How many. The average is on the Transactions page.

Commission out
   Everything paid to people.

AV Homes kept
   What was left after every share. This number did not exist before and it is
   usually the one worth watching.

Underneath, **Whose property it was** splits the same total between AV Homes' own
stock and everybody else's. That split is the point of the whole release: AV Homes
earns far more on its own property, so the two are priced separately.

.. code-block:: text

   AV Homes' own    5 / 2 / 1   + 1 pool + 1 foundation   = 10%
   Somebody else's  2 / 1 / 0.5 + 1 pool + 1 foundation   = 5.5%

**Transactions** lists every deal. A row shows the amount and who closed it; tap
*Where this money goes* to open its five shares by name. Filter by whose property,
sale or rent, and who closed it.

The other three pages
   - **Listing performance**: views, enquiries, buyers logged and whether it sold,
     per listing. The tile that matters is *Seen, never asked about*: tap it and
     the list narrows to listings people looked at and never enquired about. That
     is usually a price or a photo problem.
   - **People**: everyone who closed anything, marketers and AV Homes staff in one
     table, ranked by value closed. Each score opens into its own breakdown.
   - **Traffic**: visitors, and which listings they read.

A note on the periods
   Every figure says what window it covers. The two fund balances say **held now,
   all time**, because a balance is what a fund holds rather than what it earned
   this month. The traffic figures are a fixed 30 day window, which the page says
   plainly, because that is what the visit counter keeps.

--------------------------------------------------------------------------------

3. Spend the community fund
===========================

**The one question: how do I pay out of the AV Foundation and leave a record?**

Every recorded deal puts a share into two pots, whoever closed it and whether or
not anybody earned commission:

The Reward Pool
   Paid to the best seller each quarter. It leaves through an award with a winner
   and a quarter attached, never a transfer typed in by hand.

The AV Foundation
   Spent on the community. This is the one you pay out of.

Both are renameable on the commission screen, and renaming one does not orphan
anything: the records keep pointing at the right fund.

**Analytics → The two funds.** Each card shows what it holds now, what has gone in
and what has gone out. *The history* opens the full statement.

To pay out
   **Record a payment out** on the Foundation card.

   - **How much.** It will not accept more than the fund holds. A balance is the
     sum of its history, so a negative one would be the fund claiming it gave away
     money it never had.
   - **What it paid for.** Write what a reader needs a year from now. "Borehole at
     the primary school in Ajah", not "project".
   - **The receipt.** At least one. Money leaving needs evidence.

Confirm, and the balance drops by exactly that amount with the payment at the top
of the history, carrying what it paid for and who recorded it.

--------------------------------------------------------------------------------

Changing the rates
==================

**Marketers → Commission.** Four rows, five shares each, one row per ownership and
deal kind. Every row shows its own total and turns red past 100, because five
percentages that are each legal can still add up to more than the deal.

The most important thing on that screen is written at the top of it: **a change
applies to deals approved from then on and never rewrites a settled one.** Every
deal carries the rates it was approved at, forever.

The same screen renames the two funds and sets the four weights behind the score on
the People page.

--------------------------------------------------------------------------------

Letting somebody outside AV Homes list
======================================

Send them to **/list-with-us**. They apply, and the application lands in
**Team → Partner applications**.

Approving one creates their account and emails a sign-in link, which also appears
on screen for the day mail is not configured. Refusing asks for a reason, and they
are told it, because a no with no reason is a no somebody chases by phone.

What they can then do
   Add their own listings with their own photos, and read their own numbers: views,
   enquiries, and for anything that sold, the price, AV Homes' total fee and their
   net. They see nothing about anybody else's listings, and nothing about which
   marketer earned what.

What they cannot do
   Publish. Their listings sit at **In review** until AV Homes approves them, which
   the public page tells them up front.
