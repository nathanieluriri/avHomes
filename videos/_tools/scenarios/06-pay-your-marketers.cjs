// Video 6: it is the end of the month. Make the month's list, copy an account number, record
// one transfer with its bank reference and receipt, and watch the amount sent climb. A second
// person, sped up in the edit, shows the list being worked down.
const path = require("path");
const { makeReceipt, stamp } = require("../receipt.cjs");

const F =(label, tag = "input") => `::-p-xpath(//label[.//span[normalize-space()='${label}']]//${tag})`;
// Double quotes around the literal: two of these labels carry an apostrophe.
const BTN = (text) => `::-p-xpath(//button[normalize-space()="${text}"])`;
const PAY = (name) => `::-p-xpath(//tr[.//*[normalize-space()='${name}']]//button[normalize-space()='Mark as paid'])`;
const COPY = (name) => `::-p-xpath(//button[@aria-label="Copy ${name}'s account number"])`;
const ACCOUNT = (digits) => `::-p-xpath(//tr//span[contains(@class,'c-num')][normalize-space()='${digits}'])`;
const TOTALS = "::-p-xpath(//h2[normalize-space()='September 2026']/../following-sibling::p[1])";
const STILL = "::-p-xpath(//button[contains(normalize-space(),'still to pay')])";
const DIALOG_IMG = "::-p-xpath(//div[@role='dialog']//img)";
const DRY = process.env.NO_RECORD === "1";

// Drawn in before(), so the slip on camera carries the reference typed into the sheet.
const RECEIPT = path.join(__dirname, "../../_captures/receipt-06-pay-your-marketers.png");
const DAY = 864e5;

module.exports = {
  dir: "06-pay-your-marketers",

  /**
   * August finished, and three people owed for September.
   *
   * The fixture leaves August half paid, which would put last month's job on the
   * screen this video opens on. Paying and closing it makes September the only
   * job. Funmilayo's sale of the demo's Guzape Ridge Duplex, approved this month,
   * gives the new list three people on three banks instead of one earned line.
   */
  prepare(S) {
    const M = S.marketing;
    const august = M.payRuns.find((run) => run.month === "2026-08");
    for (const item of august.items) {
      if (item.status === "paid") continue;
      Object.assign(item, {
        status: "paid",
        proof: ["/images/library/av-photo-03.jpg"],
        reference: "AVH-2608-0003",
        paidAt: Date.now() - 16 * DAY,
        paidByName: "Adaeze Vincent",
      });
      august.paidMinor += item.totalMinor;
    }
    Object.assign(august, { status: "closed", closedAt: Date.now() - 16 * DAY });
    // The ledger has to agree with the run, or the screen says so in red.
    for (const line of M.ledger) {
      if (line.payRunId === august.id && line.status === "scheduled") line.status = "paid";
    }

    // 5% to Funmilayo, 2% to Ngozi who invited her, 1% to Adaeze above them.
    const sale = 189_000_000 * 100;
    const chain = [
      { id: "mkt_av0007", level: 1, rate: 5 },
      { id: "mkt_av0003", level: 2, rate: 2 },
      { id: "mkt_av0001", level: 3, rate: 1 },
    ];
    chain.forEach((share, index) => {
      M.ledger.push({
        id: `ledg_guzape_${index + 1}`,
        marketerId: share.id,
        dealId: "deal_guzape_ridge",
        level: share.level,
        kind: "earn",
        amountMinor: Math.floor((sale * share.rate) / 100),
        currency: "NGN",
        status: "earned",
        payRunId: null,
        reversesId: null,
        note: "",
        dealTitle: "Guzape Ridge Duplex",
        createdAt: Date.now() - 9 * DAY,
        updatedAt: Date.now() - 9 * DAY,
      });
    });
  },

  async before(a) {
    await makeReceipt(a.tab.browser(), RECEIPT, {
      amount: "₦9,450,000.00",
      name: "FUNMILAYO CHIAMAKA EZE",
      bank: "OPay",
      account: "0123456706",
      reference: "FT26091704412",
      when: stamp("10:42"),
    });
    for (const p of ["/admin/marketers/pay", "/admin/marketers/deals", "/admin/marketers/pay"]) await a.goto(p);
    await a.sleep(600);
  },

  async run(a) {
    const { sleep, tab } = a;

    await a.goto("/admin/marketers/pay");
    a.mark("payday");
    await sleep(3400);
    if (DRY) await a.shot("payday");

    a.mark("make");
    await a.moveTo(BTN("Make this month's list"), 900);
    await sleep(500);
    await a.click(BTN("Make this month's list"), 200);
    await a.waitFor(PAY("Funmilayo Eze"));
    a.mark("list");
    await sleep(3200);
    if (DRY) await a.shot("list");

    a.mark("copy");
    await a.moveTo(ACCOUNT("0123456706"), 900, 0.4);
    await sleep(900);
    // Measured before the press: its label turns into "Copied" once pressed.
    const b = await a.box(COPY("Funmilayo Eze"));
    await a.click(COPY("Funmilayo Eze"), 600);
    // Off the button at once, along the same row, so the tick that says Copied is not under the cursor.
    await a.cursorTo(b.x + b.width + 180, b.y + b.height / 2, 300);
    await sleep(700);
    if (DRY) await a.shot("copied");
    await sleep(1600);

    a.mark("sheet");
    await a.click(PAY("Funmilayo Eze"), 900);
    await a.waitFor(F("Bank reference"));
    await sleep(1400);
    if (DRY) await a.shot("sheet");
    await a.click(F("Bank reference"), 700);
    a.mark("typing");
    await a.type("FT26091704412", 75);
    await sleep(700);

    a.mark("receipt");
    const [chooser] = await Promise.all([tab.waitForFileChooser(), a.click(BTN("Upload file"), 800)]);
    await chooser.accept([RECEIPT]);
    await a.waitFor(DIALOG_IMG);
    await sleep(2400);
    if (DRY) await a.shot("receipt");

    a.mark("record");
    await a.moveTo(BTN("Record the payment"), 800);
    await sleep(500);
    await a.click(BTN("Record the payment"), 200);
    await a.waitFor("::-p-xpath(//tr[.//*[normalize-space()='Funmilayo Eze']]//*[normalize-space()='Paid'])");
    a.mark("paid");
    await sleep(700);
    await a.moveTo(TOTALS, 900, -0.04, 0.5);
    await sleep(3200);
    if (DRY) await a.shot("paid");

    // The next person, the same way; the edit speeds this part up.
    a.mark("next");
    await a.click(PAY("Ngozi Balogun"), 800);
    await a.waitFor(F("Bank reference"));
    await sleep(600);
    await a.click(F("Bank reference"), 600);
    await a.type("FT26091704631", 45);
    await sleep(400);
    await a.click(BTN("Record the payment"), 700);
    await a.waitFor("::-p-xpath(//tr[.//*[normalize-space()='Ngozi Balogun']]//*[normalize-space()='Paid'])");
    a.mark("next-paid");
    await sleep(600);
    await a.moveTo(TOTALS, 800, -0.04, 0.5);
    await sleep(1600);
    await a.moveTo(STILL, 900);
    a.mark("still");
    await sleep(3000);
    if (DRY) await a.shot("still");
  },
};
