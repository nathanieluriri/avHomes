// Video 8: a marketer sold a house and wants paying. The orb on home, the three steps of
// Report a deal with real values, and the new deal in their list marked Being checked.
const path = require("path");
const { makeReceipt } = require("../receipt.cjs");
const { STAGE, ORIGIN, BTN, TAB, FIELD, reveal, warm } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const RECEIPT = path.join(__dirname, "../../_captures/receipt-08-report-a-deal.png");
const CARD = "::-p-xpath(//button[.//span[normalize-space()='Tropical Oasis']])";
const AMOUNT = 'input[aria-label="What they paid in the end, in naira"]';
const DATE = FIELD("Date it was done");
const NEW_ROW = "::-p-xpath(//a[contains(@href,'/m/deals/deal_new_')])";

/**
 * Two days back, typed in the order headless Chrome's date field shows (month first). The
 * app's own "You picked" line under the field spells the date out, so it reads plainly.
 * The year is already right, so only month and day are typed.
 */
function twoDaysAgo() {
  const d = new Date(Date.now() - 2 * 864e5);
  return { d, typed: `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` };
}

module.exports = {
  dir: "08-report-a-deal",
  viewport: STAGE,
  origin: ORIGIN,
  demoListings: true,

  async before(a) {
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

    // before() ends on a fresh home screen, so the take starts there.
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

    // Sold is already chosen for a home listed for sale; the tap shows where it is set.
    await reveal(a, TAB("Sold"), 0.3);
    await a.click(TAB("Sold"), 800);
    a.mark("sold");
    await sleep(1600);
    await shot("sold");

    // The asking price is filled in. What changed hands is what gets paid on, so it is retyped.
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

    // Step 3 opens where step 2 was scrolled to, so the earnings card is brought back up.
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
