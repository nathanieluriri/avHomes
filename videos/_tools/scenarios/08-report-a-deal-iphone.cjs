// Video 8 on an iPhone: the same take as 08-report-a-deal, filmed at the iPhone 18 Pro's
// 402x874 with its status bar and home indicator insets, so the app lays out under the Dynamic
// Island as it does on the device the composition frames it in. 2x, not 3x: at 3x the
// screencast fell behind and held frames for up to half a second.
const path = require("path");
const { makeReceipt } = require("../receipt.cjs");
const { ORIGIN, BTN, TAB, FIELD, reveal: revealOn, warm } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const IPHONE = { width: 402, height: 874, dpr: 2, mobile: true };
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };
// The pinned hero and bottom bar are taller by the insets they pad for.
const CLEAR = { top: 72 + INSETS.top, bottom: 110 + INSETS.bottom };
const reveal = (a, sel, at = 0.4, ms = 750) => revealOn(a, sel, at, ms, CLEAR);

const RECEIPT = path.join(__dirname, "../../_captures/receipt-08-report-a-deal-iphone.png");
const CARD = "::-p-xpath(//button[.//span[normalize-space()='Tropical Oasis']])";
const AMOUNT = 'input[aria-label="What they paid in the end, in naira"]';
const DATE = FIELD("Date it was done");
const NEW_ROW = "::-p-xpath(//a[contains(@href,'/m/deals/deal_new_')])";

// Held for the whole run: the override lives as long as its session.
let insetSession = null;

function twoDaysAgo() {
  const d = new Date(Date.now() - 2 * 864e5);
  return { d, typed: `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` };
}

module.exports = {
  dir: "08-report-a-deal-iphone",
  viewport: IPHONE,
  origin: ORIGIN,
  demoListings: true,

  async before(a) {
    insetSession = await a.tab.createCDPSession();
    await insetSession.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    const { d } = twoDaysAgo();
    await makeReceipt(a.tab.browser(), RECEIPT, {
      amount: "₦240,000,000.00",
      name: "AV CONSTRUCTIONS",
      bank: "Guaranty Trust Bank",
      account: "******4417",
      reference: "FT26091503318",
      when: `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, 11:20`,
    });
    await warm(a, ["/m", "/m/deals/new", "/m/deals", "/m/deals?new=1", "/m"]);
  },

  async run(a) {
    const { sleep, tab } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("home");
    await sleep(2200);
    await shot("home");

    await a.click("a.m-orb", 1000);
    await a.waitFor('input[type="search"]');
    await sleep(900);
    a.mark("which");
    await shot("which");
    await sleep(900);

    await a.click('input[type="search"]', 800);
    await a.hideCursor();
    await a.type("Lekki", 120);
    await a.waitFor(CARD);
    await sleep(700);
    await a.hideCursor(false);
    a.mark("found");
    await shot("found");
    await sleep(1600);

    await reveal(a, CARD, 0.45);
    await a.click(CARD, 900);
    await a.waitFor(AMOUNT);
    await sleep(900);
    a.mark("deal");
    await shot("deal");
    await sleep(700);

    await reveal(a, TAB("Sold"), 0.3);
    await a.click(TAB("Sold"), 800);
    a.mark("sold");
    await sleep(1600);
    await shot("sold");

    await reveal(a, AMOUNT, 0.32);
    a.mark("amount");
    await a.click(AMOUNT, 800, 0.75);
    await a.hideCursor();
    await tab.keyboard.down("Control");
    await tab.keyboard.press("KeyA");
    await tab.keyboard.up("Control");
    await tab.keyboard.press("Backspace");
    await sleep(300);
    await a.type("240000000", 110);
    await a.hideCursor(false);
    await sleep(1800);
    await shot("amount");

    await reveal(a, FIELD("Buyer name"), 0.3);
    a.mark("buyer");
    await a.click(FIELD("Buyer name"), 800);
    await a.hideCursor();
    await a.type("Babajide Ogunleye", 85);
    await a.hideCursor(false);
    await sleep(300);
    await reveal(a, FIELD("Buyer phone"), 0.4);
    await a.click(FIELD("Buyer phone"), 700);
    await a.hideCursor();
    await a.type("0806 214 9357", 85);
    await a.hideCursor(false);
    await sleep(1200);
    await shot("buyer");

    await reveal(a, DATE, 0.42);
    a.mark("date");
    await a.click(DATE, 800, 0.09);
    await a.hideCursor();
    await a.type(twoDaysAgo().typed, 130);
    await a.hideCursor(false);
    await sleep(1800);
    await shot("date");

    await a.click(BTN("Next"), 900);
    await a.waitFor(BTN("From phone"));
    await sleep(500);
    await reveal(a, ".m-update", 0.3, 800);
    await sleep(400);
    a.mark("earn");
    await shot("earn");
    await sleep(2600);

    await reveal(a, BTN("From phone"), 0.5);
    a.mark("proof");
    const [chooser] = await Promise.all([tab.waitForFileChooser(), a.click(BTN("From phone"), 900)]);
    await chooser.accept([RECEIPT]);
    await a.waitFor("::-p-xpath(//img[@alt='Proof photo 1'])");
    await sleep(2200);
    await shot("proof");

    a.mark("send");
    await a.click(BTN("Send it in"), 900);
    await a.waitFor(BTN("Got it"));
    await sleep(800);
    a.mark("sent");
    await shot("sent");
    await sleep(2600);

    await a.click(BTN("Got it"), 900);
    await a.waitFor(NEW_ROW);
    await sleep(900);
    a.mark("listed");
    await a.moveTo(NEW_ROW, 900, 0.3, 0.75);
    await sleep(2800);
    await shot("listed");
  },
};
