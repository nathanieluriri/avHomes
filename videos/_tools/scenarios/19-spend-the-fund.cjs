// Video 19: the community fund has money in it. Spend some.
//
// ONE PROBLEM: "How do I pay out of the AV Foundation and leave a record?"
//
// Opens the two funds, reads what the Foundation holds, records a payment out with
// what it paid for and a receipt, and ends on the balance having dropped by exactly
// that amount with the payment at the top of the history. It does not explain where
// the money came from: that is video 18.

const RAIL = (href) => `::-p-xpath(//*[contains(@class,'c-rail')]//a[@href='${href}'])`;
const CARD = (name) => `::-p-xpath(//h2[normalize-space()='${name}']/ancestor::div[contains(@class,'rounded-2xl')][1])`;
const SPEND = "::-p-xpath(//button[normalize-space()='Record a payment out'])";
const SHEET = "::-p-xpath(//h2[starts-with(normalize-space(),'Pay out of')])";
const AMOUNT = "::-p-xpath(//label[.//span[normalize-space()='How much']]//input)";
const WHAT = "::-p-xpath(//label[.//span[normalize-space()='What it paid for']]//input)";
const RECEIPT = "::-p-xpath(//button[normalize-space()='Choose from library'])";
const CONFIRM = "::-p-xpath(//button[normalize-space()='Record the payment'])";
const HISTORY = "::-p-xpath((//button[starts-with(normalize-space(),'The history')])[2])";
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "19-spend-the-fund",

  async before(a) {
    for (const p of ["/admin/analytics/wallets", "/admin/analytics"]) {
      await a.goto(p);
      await a.sleep(500);
    }
    /* The picker opens onto the image library, and forty full size photos on first
       paint froze an earlier take for four seconds. */
    await a.tab.evaluate(
      (urls) =>
        Promise.all(
          urls.map(
            (url) =>
              new Promise((done) => {
                const img = new Image();
                img.onload = img.onerror = done;
                img.src = url;
              }),
          ),
        ),
      a.S.library.map((row) => row.url),
    );
    await a.sleep(600);
  },

  async run(a) {
    const { sleep } = a;

    await a.goto("/admin/analytics");
    a.mark("analytics");
    await sleep(1800);

    a.mark("wallets");
    await a.moveTo(RAIL("/admin/analytics/wallets"), 900);
    await sleep(500);
    await a.click(RAIL("/admin/analytics/wallets"), 200);
    await a.waitFor(SPEND);
    await sleep(2800);
    if (DRY) await a.shot("wallets");

    a.mark("balance");
    await a.moveTo(CARD("AV Foundation"), 900, 0, 0.35);
    await sleep(3000);
    if (DRY) await a.shot("balance");

    a.mark("sheet");
    await a.moveTo(SPEND, 900);
    await sleep(500);
    await a.click(SPEND, 200);
    await a.waitFor(SHEET);
    await sleep(2200);
    if (DRY) await a.shot("sheet");

    a.mark("amount");
    await a.clearAndType(AMOUNT, "2500000", 70);
    await sleep(1200);

    a.mark("what");
    await a.clearAndType(WHAT, "Borehole at the primary school in Ajah", 45);
    await sleep(1600);
    if (DRY) await a.shot("typed");

    a.mark("receipt");
    await a.moveTo(RECEIPT, 900);
    await sleep(500);
    await a.click(RECEIPT, 300);
    await sleep(1800);
    await a.click("::-p-xpath((//div[@role='dialog']//button[.//img])[1])", 300);
    await sleep(1400);
    await a
      .click("::-p-xpath(//div[@role='dialog']//button[normalize-space()='Done' or normalize-space()='Use these'])", 300)
      .catch(() => {});
    await sleep(1400);
    if (DRY) await a.shot("receipt");

    a.mark("confirm");
    await a.moveTo(CONFIRM, 900);
    await sleep(700);
    await a.click(CONFIRM, 200);
    await sleep(2200);
    a.mark("paid");
    await sleep(2400);
    if (DRY) await a.shot("paid");

    /* The outcome: the balance is down and the payment is the newest line, with
       what it paid for written on it. */
    a.mark("history");
    await a.moveTo(HISTORY, 900);
    await sleep(500);
    await a.click(HISTORY, 200);
    await sleep(3200);
    if (DRY) await a.shot("history");
  },
};
