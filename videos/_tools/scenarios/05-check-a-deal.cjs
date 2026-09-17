// Video 5: a marketer says they sold a house. Open the waiting deal, look at the proof full
// size, correct the amount to what was actually paid, approve it, and show the three shares
// it wrote and the row under Approved.
const F = (label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
const BTN = (text) => `::-p-xpath(//button[normalize-space()='${text}'])`;
const ROW = (name) => `::-p-xpath(//tr[.//*[normalize-space()='${name}']])`;
const PROOF = "::-p-xpath((//ul[@aria-label='Proof of the deal']//img)[1])";
const NOTE = "::-p-xpath(//p[normalize-space()='What the marketer wrote']/following-sibling::p)";
const WHO = "::-p-xpath(//h2[normalize-space()='Who gets paid'])";
const SHARE = (name) => `::-p-xpath(//div[contains(@class,'bg-mist-50')][.//span[normalize-space()='${name}']])`;
const SNAPSHOT = "::-p-xpath(//p[contains(normalize-space(),'Rates were snapshotted')])";
const TAB = (label) => `::-p-xpath(//button[starts-with(normalize-space(),'${label}')])`;
const RAIL = (href) => `::-p-xpath(//*[contains(@class,'c-rail')]//a[@href='${href}'])`;
const DRY = process.env.NO_RECORD === "1";

const DEAL_ID = "deal_ikeja_gra";
const DEAL = `/admin/marketers/deals/${DEAL_ID}`;
const SHOT = "/images/library/av-photo-01.jpg";
const DAY = 864e5;

module.exports = {
  dir: "05-check-a-deal",

  /**
   * One more deal waiting, reported from three levels down.
   *
   * The fixture's only waiting deal is Adaeze's own, and she is the one checking.
   * Tobi sits under Yetunde under Chidi, so approving his sale writes all three
   * shares. The listing is the demo's own Ikeja GRA Family House at its asking
   * price; the note says what was really paid.
   */
  prepare(S) {
    const M = S.marketing;
    const tobi = M.marketers.find((p) => p.code === "AV-0008");
    M.deals.unshift({
      id: DEAL_ID,
      listingId: "demo_ikeja-gra-family-house",
      listingTitle: "Ikeja GRA Family House",
      listingLocation: "Ikeja GRA, Lagos",
      listingType: "sale",
      listingEstate: "",
      unitKey: "",
      amountMinor: 165_000_000 * 100,
      currency: "NGN",
      buyerName: "Kemi Adebayo",
      buyerPhone: "0801 234 5609",
      proof: [SHOT, "/images/library/av-photo-03.jpg"],
      note: "The buyer paid 158 million in the end, not the 165 million on the listing. The family took 7 million off for a cash sale. The photos are from the handover on Saturday.",
      reporterId: tobi.id,
      reporterName: tobi.displayName,
      reporterCode: tobi.code,
      status: "pending",
      reason: "",
      reviewedBy: "",
      reviewedByName: "",
      reviewedAt: null,
      closedOn: Date.now() - 5 * DAY,
      shares: [],
      createdAt: Date.now() - 2 * DAY,
      updatedAt: Date.now() - 2 * DAY,
    });
  },

  // Compile and cache every route once, so the footage has no dev-server stalls.
  async before(a) {
    for (const p of ["/admin/marketers/deals", DEAL, SHOT, "/admin/marketers/deals"]) await a.goto(p);
    await a.sleep(600);
  },

  async run(a) {
    const { sleep, tab } = a;

    await a.goto("/admin/marketers/deals");
    a.mark("queue");
    await sleep(3200);
    if (DRY) await a.shot("queue");

    await a.moveTo(ROW("Tobi Ajayi"), 900, 0.3);
    await sleep(600);
    a.mark("open");
    await a.click(ROW("Tobi Ajayi"), 250, 0.3);
    await a.waitFor(PROOF);
    await sleep(2200);
    if (DRY) await a.shot("deal");

    // The photo opens in a tab of its own. That tab is closed and the same file shown here,
    // which is exactly what the reader sees once they switch to it.
    a.mark("proof");
    await a.moveTo(PROOF, 900);
    await sleep(900);
    const popup = new Promise((resolve) => tab.browser().once("targetcreated", resolve));
    await a.click(PROOF, 200);
    const target = await Promise.race([popup, sleep(3000).then(() => null)]);
    const opened = target ? await target.page().catch(() => null) : null;
    if (opened) await opened.close().catch(() => {});
    await a.goto(SHOT);
    a.mark("full");
    await sleep(3400);
    if (DRY) await a.shot("full");
    await a.goto(DEAL);
    await a.waitFor(NOTE);
    a.mark("back");
    await sleep(900);

    // A little down the page, so the note sits clear of the caption panel; the cursor goes
    // beside the words rather than over them.
    a.mark("note");
    await a.scrollBy(100, 700);
    await sleep(150);
    await a.moveTo(NOTE, 900, -0.025, 0.3);
    await sleep(3400);
    if (DRY) await a.shot("note");

    a.mark("amount");
    await a.clearAndType(F("Final amount"), "158000000", 95);
    await sleep(700);
    // Leaving the field is what commits the number, and the split under it follows.
    await a.click(WHO, 700);
    await sleep(900);
    if (DRY) await a.shot("amount");

    a.mark("split");
    await a.moveTo(SHARE("Tobi Ajayi"), 700, 0.5);
    await sleep(900);
    await a.moveTo(SHARE("Yetunde Bello"), 500, 0.5);
    await sleep(900);
    await a.moveTo(SHARE("Chidi Okonkwo"), 500, 0.5);
    await sleep(1300);
    if (DRY) await a.shot("split");

    a.mark("approve");
    await a.moveTo(BTN("Approve deal"), 900);
    await sleep(1100);
    await a.click(BTN("Approve deal"), 200);
    await a.waitFor(SNAPSHOT);
    a.mark("approved");
    await sleep(700);
    // The page grew by a row, so the note is lifted clear of the caption again.
    await a.scrollBy(50, 600);
    await a.moveTo(SNAPSHOT, 800, -0.05, 0.6);
    await sleep(3000);
    if (DRY) await a.shot("approved");

    // The rail rather than the breadcrumb, which is scrolled out of view by now.
    a.mark("to-list");
    await a.click(RAIL("/admin/marketers/deals"), 1000);
    await a.waitFor(TAB("Approved"));
    await sleep(1100);
    await a.click(TAB("Approved"), 800);
    await a.waitFor(ROW("Ikeja GRA Family House"));
    await sleep(600);
    a.mark("listed");
    await a.moveTo(ROW("Ikeja GRA Family House"), 900, 0.2);
    await sleep(3600);
    if (DRY) await a.shot("listed");
  },
};
