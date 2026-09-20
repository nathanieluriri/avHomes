// Video 18: where did the money go.
//
// ONE PROBLEM: "We transacted this much. Who got what?"
//
// Opens Analytics, reads the four tiles, opens one transaction's split so the five
// shares are on screen with names against them, and ends on the AV vs Non-AV card
// that explains why two deals of the same size pay differently. It does not record
// a sale (video 17) and does not spend a fund (video 19).

const RAIL = (href) => `::-p-xpath(//*[contains(@class,'c-rail')]//a[@href='${href}'])`;
const TILE = (label) => `::-p-xpath(//span[normalize-space()='${label}']/parent::*)`;
const SPLIT = "::-p-xpath((//button[.//span[normalize-space()='Where this money goes']])[1])";
const OWNERSHIP = "::-p-xpath(//h2[normalize-space()='Whose property it was'])";
const FUNDS = "::-p-xpath(//h2[normalize-space()='The two funds'])";
const ADDS_UP = "::-p-xpath((//dt[starts-with(normalize-space(),'Adds up to')])[1])";
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "18-read-the-money",

  async before(a) {
    for (const p of ["/admin/analytics", "/admin/analytics/transactions", "/admin"]) {
      await a.goto(p);
      await a.sleep(500);
    }
    await a.sleep(600);
  },

  async run(a) {
    const { sleep } = a;

    await a.goto("/admin");
    a.mark("dashboard");
    await sleep(1800);

    a.mark("open");
    await a.moveTo(RAIL("/admin/analytics"), 900);
    await sleep(500);
    await a.click(RAIL("/admin/analytics"), 200);
    await a.waitFor(TILE("Transacted"));
    await sleep(2600);
    if (DRY) await a.shot("overview");

    /* The two the owner asks about first. Kept is the one that was invisible
       before this release, so it gets the longer hold. */
    a.mark("transacted");
    await a.moveTo(TILE("Transacted"), 900, 0, 0.5);
    await sleep(2400);

    a.mark("kept");
    await a.moveTo(TILE("AV Homes kept"), 900, 0, 0.5);
    await sleep(3000);
    if (DRY) await a.shot("kept");

    a.mark("ownership");
    await a.moveTo(OWNERSHIP, 900, 0, 1.6);
    await sleep(3400);
    if (DRY) await a.shot("ownership");

    a.mark("funds");
    await a.moveTo(FUNDS, 900, 0, 1.6);
    await sleep(3200);
    if (DRY) await a.shot("funds");

    a.mark("to-transactions");
    await a.click(RAIL("/admin/analytics/transactions"), 1000);
    await a.waitFor(SPLIT);
    await sleep(2200);
    if (DRY) await a.shot("transactions");

    /* The whole point of the video: one deal, opened, with five named shares and a
       line that adds back up to what it sold for. */
    a.mark("split");
    await a.moveTo(SPLIT, 900);
    await sleep(600);
    await a.click(SPLIT, 200);
    await sleep(3800);
    if (DRY) await a.shot("split");

    a.mark("adds-up");
    await a.moveTo(ADDS_UP, 900, 0, 0.5);
    await sleep(3400);
    if (DRY) await a.shot("adds-up");
  },
};
