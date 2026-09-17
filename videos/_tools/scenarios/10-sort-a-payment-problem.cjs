// Video 10: a marketer says their money never arrived. Open the problem, reply with a new
// receipt, send it, mark it sorted, and find it kept under Sorted.
const path = require("path");
const { makeReceipt, stamp } = require("../receipt.cjs");

const BTN =(text) => `::-p-xpath(//button[normalize-space()="${text}"])`;
const CARD = (name) => `::-p-xpath(//button[@aria-expanded][.//span[normalize-space()='${name}']])`;
const REPLY = "::-p-xpath(//label[.//span[normalize-space()='Reply']]//textarea)";
const THREAD = "::-p-xpath(//ul[@aria-label='The conversation so far'])";
const LAST = "::-p-xpath(//ul[@aria-label='The conversation so far']/li[last()])";
const PICKED = "::-p-xpath(//div[@role='group'][.//span[normalize-space()='Receipt']]//img)";
const TAB = (label) => `::-p-xpath(//div[@aria-label='Filter problems']//button[normalize-space()='${label}'])`;
const DRY = process.env.NO_RECORD === "1";

// Drawn in before(), so the slip on camera carries the reference typed into the reply.
const RECEIPT = path.join(__dirname, "../../_captures/receipt-10-sort-a-payment-problem.png");
const HOUR = 36e5;

module.exports = {
  dir: "10-sort-a-payment-problem",

  /**
   * One open problem, with the marketer's word last.
   *
   * The fixture's August problem already carries an answer from the console, and
   * the other open one is Adaeze's own, raised against the account doing the
   * sorting. So Chidi's is cut back to his complaint, raised this week, and
   * Adaeze's is taken out of this recording.
   */
  prepare(S) {
    const M = S.marketing;
    const chidi = M.issues.find((row) => row.id === "pisu_aug_chidi");
    const raised = Date.now() - 26 * HOUR;
    chidi.messages = [{ ...chidi.messages[0], at: raised }];
    Object.assign(chidi, { createdAt: raised, updatedAt: raised });

    M.issues = M.issues.filter((row) => row.id !== "pisu_jul_adaeze");
    for (const run of M.payRuns) {
      for (const item of run.items) {
        if (item.issueId === "pisu_jul_adaeze") item.issueId = null;
      }
    }
  },

  async before(a) {
    await makeReceipt(a.tab.browser(), RECEIPT, {
      amount: "₦70,400,000.00",
      name: "CHIDI EMMANUEL OKONKWO",
      bank: "Zenith Bank",
      account: "0123456702",
      reference: "FT26091705112",
      when: stamp("08:47"),
    });
    for (const p of ["/admin/marketers/problems", "/admin/marketers/pay", "/admin/marketers/problems"]) await a.goto(p);
    await a.sleep(600);
  },

  async run(a) {
    const { sleep, tab } = a;

    await a.goto("/admin/marketers/problems");
    a.mark("problems");
    await sleep(3400);
    if (DRY) await a.shot("problems");

    a.mark("open");
    await a.moveTo(CARD("Chidi Okonkwo"), 900, 0.3);
    await sleep(500);
    await a.click(CARD("Chidi Okonkwo"), 200, 0.3);
    await a.waitFor(REPLY);
    await sleep(600);
    await a.moveTo(THREAD, 800, -0.03, 0.5);
    await sleep(3000);
    if (DRY) await a.shot("thread");

    a.mark("reply");
    await a.click(REPLY, 800);
    await a.type(
      "Sorry, Chidi. That transfer bounced back to us, so we sent it again this morning with reference FT26091705112. The new receipt is attached.",
      24,
    );
    await sleep(800);
    if (DRY) await a.shot("typed");

    a.mark("receipt");
    const [chooser] = await Promise.all([tab.waitForFileChooser(), a.click(BTN("Upload file"), 900)]);
    await chooser.accept([RECEIPT]);
    await a.waitFor(PICKED);
    await sleep(2200);
    if (DRY) await a.shot("receipt");

    a.mark("send");
    await a.moveTo(BTN("Send reply"), 900);
    await sleep(500);
    await a.click(BTN("Send reply"), 200);
    await a.waitFor("::-p-xpath(//ul[@aria-label='The conversation so far']/li[2])");
    a.mark("sent");
    await sleep(700);
    await a.moveTo(LAST, 900, -0.03, 0.5);
    await sleep(3000);
    if (DRY) await a.shot("sent");

    a.mark("sort");
    await a.moveTo(BTN("Mark as sorted"), 900);
    await sleep(600);
    await a.click(BTN("Mark as sorted"), 200);
    await a.waitFor("::-p-xpath(//*[normalize-space()='Nothing is disputed'])");
    a.mark("sorted");
    await sleep(2600);
    if (DRY) await a.shot("sorted");

    a.mark("to-sorted");
    await a.click(TAB("Sorted"), 900);
    await a.waitFor(CARD("Chidi Okonkwo"));
    await sleep(900);
    await a.click(CARD("Chidi Okonkwo"), 900, 0.3);
    await a.waitFor(LAST);
    a.mark("kept");
    await sleep(600);
    await a.moveTo(LAST, 900, -0.03, 0.5);
    await sleep(3400);
    if (DRY) await a.shot("kept");
  },
};
