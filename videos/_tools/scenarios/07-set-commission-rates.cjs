// Video 7: change what marketers earn. Marketers, then Commission; retype the sale rates, watch
// the worked example follow, save from the bar that appears, then open a waiting sale to see
// the new rates already in its split.
const SALE = (n) =>
  `::-p-xpath(//h2[normalize-space()='Sale rates']/ancestor::div[contains(@class,'rounded-2xl')][1]//label[.//span[normalize-space()='Level ${n}']]//input)`;
const WORKED = "::-p-xpath(//p[starts-with(normalize-space(),'On a')]/following-sibling::p[1])";
const SAVE = "::-p-xpath(//div[contains(@class,'c-savebar')]//button[normalize-space()='Save'])";
const COMMISSION = "::-p-xpath(//a[normalize-space()='Commission'])";
const RAIL = (href) => `::-p-xpath(//*[contains(@class,'c-rail')]//a[@href='${href}'])`;
const ROW = (name) => `::-p-xpath(//tr[.//*[normalize-space()='${name}']])`;
const RATES = `::-p-xpath(//p[contains(normalize-space(),"Today's sale rates")])`;
const DRY = process.env.NO_RECORD === "1";

const DEAL_ID = "deal_ikeja_gra";
const DAY = 864e5;

module.exports = {
  dir: "07-set-commission-rates",

  /**
   * A sale still waiting, so the new rates can be seen at work after saving.
   *
   * The same Ikeja GRA deal video 5 checks, before anybody has approved it: its
   * split is a preview at today's rates, which is exactly what a save changes.
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
      proof: ["/images/library/av-photo-01.jpg", "/images/library/av-photo-03.jpg"],
      note: "",
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

  async before(a) {
    for (const p of ["/admin/marketers/settings", "/admin/marketers/deals", `/admin/marketers/deals/${DEAL_ID}`, "/admin/marketers"]) {
      await a.goto(p);
    }
    await a.sleep(600);
  },

  async run(a) {
    const { sleep } = a;

    await a.goto("/admin/marketers");
    a.mark("marketers");
    await sleep(2600);
    if (DRY) await a.shot("marketers");

    await a.moveTo(COMMISSION, 900);
    await sleep(500);
    await a.click(COMMISSION, 200);
    await a.waitFor(SALE(1));
    a.mark("commission");
    await sleep(2600);
    if (DRY) await a.shot("commission");

    a.mark("example");
    await a.moveTo(WORKED, 900, -0.04, 0.5);
    await sleep(3400);
    if (DRY) await a.shot("example");

    a.mark("level1");
    await a.clearAndType(SALE(1), "7", 120);
    await sleep(1100);
    a.mark("level2");
    await a.clearAndType(SALE(2), "3", 120);
    await sleep(1400);
    if (DRY) await a.shot("typed");

    a.mark("updated");
    await a.moveTo(WORKED, 900, -0.04, 0.5);
    await sleep(3400);
    if (DRY) await a.shot("updated");

    a.mark("save");
    await a.moveTo(SAVE, 900);
    await sleep(700);
    await a.click(SAVE, 200);
    await sleep(1200);
    a.mark("saved");
    await sleep(2200);
    if (DRY) await a.shot("saved");

    a.mark("to-deals");
    await a.click(RAIL("/admin/marketers/deals"), 1000);
    await a.waitFor(ROW("Tobi Ajayi"));
    await sleep(900);
    await a.moveTo(ROW("Tobi Ajayi"), 900, 0.3);
    await sleep(400);
    await a.click(ROW("Tobi Ajayi"), 200, 0.3);
    await a.waitFor(RATES);
    a.mark("deal");
    await sleep(800);
    await a.moveTo(RATES, 900, -0.05, 0.6);
    await sleep(3800);
    if (DRY) await a.shot("deal");
  },
};
