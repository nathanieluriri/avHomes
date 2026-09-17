// Video 12 on an iPhone: the same take as 12-send-more-proof, filmed at the iPhone 18 Pro's
// 402x874 with its status bar and home indicator insets (see VIDEOS.md section 12).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { makeReceipt } = require("../receipt.cjs");
const { ORIGIN, BTN, FIELD, reveal: revealOn, warm, prepaint } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const IPHONE = { width: 402, height: 874, dpr: 2, mobile: true };
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };
// The pinned hero and bottom bar are taller by the insets they pad for.
const CLEAR = { top: 72 + INSETS.top, bottom: 110 + INSETS.bottom };
const reveal = (a, sel, at = 0.4, ms = 750) => revealOn(a, sel, at, ms, CLEAR);

const DEAL_ID = "deal_chevron_info";
const SLIP = path.join(__dirname, "../../_captures/receipt-12-send-more-proof-iphone.png");
const CUT = path.join(__dirname, "../../_captures/receipt-12-cut-off-iphone.png");
const ALERT = `a.m-alert-card[href="/m/deals/${DEAL_ID}"]`;
const REASON = "::-p-xpath(//p[normalize-space()='What they said']/following-sibling::p)";
const NOTE = FIELD("Add a note", "textarea");

// Held for the whole run: the override lives as long as its session.
let insetSession = null;

module.exports = {
  dir: "12-send-more-proof-iphone",
  viewport: IPHONE,
  origin: ORIGIN,

  // Adaeze's July pay problem is sorted, so the deal sent back is the one thing on home that needs her.
  prepare(S) {
    const july = S.marketing.issues.find((row) => row.id === "pisu_jul_adaeze");
    july.status = "resolved";
    july.resolvedAt = july.updatedAt;
  },

  async before(a) {
    insetSession = await a.tab.createCDPSession();
    await insetSession.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    const slip = {
      amount: "₦235,000,000.00",
      name: "AV CONSTRUCTIONS",
      bank: "Guaranty Trust Bank",
      account: "******4417",
      reference: "FT26090413842",
      when: `${new Date(2026, 8, 4).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, 13:42`,
    };
    await makeReceipt(a.tab.browser(), SLIP, slip);
    // What was sent first: the same slip with its bottom half missing, as the admin describes.
    execFileSync(process.env.FFMPEG, ["-v", "error", "-y", "-i", SLIP, "-vf", "crop=800:330:0:0", CUT]);
    const deal = a.S.marketing.deals.find((row) => row.id === DEAL_ID);
    deal.proof = [`data:image/png;base64,${fs.readFileSync(CUT).toString("base64")}`];
    await warm(a, [`/m/deals/${DEAL_ID}`, "/m"]);
    await prepaint(a);
  },

  async run(a) {
    const { sleep, tab } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("home");
    await sleep(1400);
    await reveal(a, ALERT, 0.34, 1400);
    await sleep(300);
    a.mark("alert");
    await a.moveTo(ALERT, 1000, 0.45, 0.4);
    await sleep(2400);
    await shot("alert");

    await a.click(ALERT, 400, 0.45, 0.4);
    await a.waitFor(REASON);
    await sleep(1200);
    a.mark("reason");
    await reveal(a, REASON, 0.42, 1000);
    await a.moveTo(REASON, 900, 0.2, 0.5);
    await sleep(3400);
    await shot("reason");

    await reveal(a, BTN("From phone"), 0.55, 1000);
    a.mark("proof");
    const [chooser] = await Promise.all([tab.waitForFileChooser(), a.click(BTN("From phone"), 900)]);
    await chooser.accept([SLIP]);
    await a.waitFor("::-p-xpath(//img[@alt='Proof photo 2'])");
    await sleep(2600);
    await shot("proof");

    await reveal(a, NOTE, 0.4, 900);
    a.mark("note");
    await a.click(NOTE, 800, 0.3, 0.4);
    await a.hideCursor();
    await a.type("Full slip from the buyer's bank, with the date and amount.", 70);
    await a.hideCursor(false);
    await sleep(1400);
    await shot("note");

    await reveal(a, BTN("Send it back"), 0.62, 800);
    a.mark("send");
    await a.click(BTN("Send it back"), 900);
    await a.waitFor("::-p-xpath(//p[normalize-space()='We got it'])");
    await sleep(1500);
    a.mark("sent");
    // Resting just under the chip, so the fingertip points at Being checked without covering it.
    await a.moveTo("::-p-xpath(//header//span[normalize-space()='Being checked'])", 1000, 0.5, 2.4);
    await sleep(3400);
    await shot("sent");
  },
};
