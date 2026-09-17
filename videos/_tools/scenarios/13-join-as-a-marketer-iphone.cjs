// Video 13 on an iPhone: the same take as 13-join-as-a-marketer, filmed at the iPhone 18 Pro's
// 402x874 with its status bar and home indicator insets (see VIDEOS.md section 12).
const { ORIGIN, BTN, FIELD, reveal: revealOn, warm } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const IPHONE = { width: 402, height: 874, dpr: 2, mobile: true };
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };
// The pinned hero and bottom bar are taller by the insets they pad for.
const CLEAR = { top: 72 + INSETS.top, bottom: 110 + INSETS.bottom };
const reveal = (a, sel, at = 0.4, ms = 750) => revealOn(a, sel, at, ms, CLEAR);

const PATH = "/m/join/AV-0001";
const INVITED = "::-p-xpath(//p[normalize-space()='Invited by'])";
const PASSWORD = 'input[aria-label="Password"]';
const BANK = FIELD("Your bank", "select");
const ACCOUNT = FIELD("Account number");
const NAME_CHECK = "::-p-xpath(//span[normalize-space()='Name on the account'])";

// Held for the whole run: the override lives as long as its session.
let insetSession = null;

/** A field tapped, then typed into with the fingertip out of the way. */
async function fill(a, sel, text, delay, at = 0.42) {
  await reveal(a, sel, at, 700);
  await a.click(sel, 700, 0.3);
  await a.hideCursor();
  await a.type(text, delay);
  await a.hideCursor(false);
  await a.sleep(350);
}

module.exports = {
  dir: "13-join-as-a-marketer-iphone",
  viewport: IPHONE,
  origin: ORIGIN,

  async before(a) {
    insetSession = await a.tab.createCDPSession();
    await insetSession.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    // Home is warmed too: after joining, the app lands there for the new account.
    await warm(a, ["/m", PATH]);
  },

  async run(a) {
    const { sleep, tab } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("open");
    await sleep(3000);
    await shot("open");

    await reveal(a, INVITED, 0.3, 1100);
    a.mark("invited");
    await a.moveTo(INVITED, 900, 0.5, 1.4);
    await sleep(2600);
    await shot("invited");

    a.mark("about");
    await fill(a, FIELD("Your name"), "Adeola Oyedepo", 95);
    await fill(a, FIELD("Email"), "adeola@example.com", 60);
    await fill(a, FIELD("Phone"), "0801 234 5610", 85);
    await fill(a, FIELD("State"), "Lagos", 110);
    await sleep(500);
    await shot("about");

    a.mark("password");
    await fill(a, PASSWORD, "Oyedepo@2026", 95, 0.45);
    await sleep(900);
    await shot("password");
    await reveal(a, BTN("Next"), 0.55, 700);
    await a.click(BTN("Next"), 800);
    await a.waitFor(BANK);
    await sleep(1000);

    a.mark("bank");
    await reveal(a, BANK, 0.4, 900);
    await a.click(BANK, 800, 0.4);
    await sleep(400);
    // The phone's own picker is outside the page; the choice lands in the field.
    await tab.select(BANK, "044");
    await tab.keyboard.press("Escape").catch(() => {});
    await sleep(1100);
    await fill(a, ACCOUNT, "0123456709", 120);
    await a.waitFor(NAME_CHECK, 15000);
    await sleep(600);
    a.mark("name");
    await reveal(a, NAME_CHECK, 0.5, 800);
    await a.moveTo(NAME_CHECK, 800, 0.5, 2.2);
    await sleep(3000);
    await shot("name");

    await reveal(a, BTN("Next"), 0.55, 800);
    await a.click(BTN("Next"), 800);
    await a.waitFor(BTN("Create my account"));
    await sleep(900);
    a.mark("promises");
    await sleep(3800);
    await shot("promises");

    await reveal(a, BTN("Create my account"), 0.6, 900);
    a.mark("create");
    await a.click(BTN("Create my account"), 900);
    await a.waitFor("::-p-xpath(//p[normalize-space()='Adeola'])", 30000);
    await sleep(1600);
    a.mark("home");
    // The copy button beside the new code: the fingertip leaves the code readable.
    await sleep(900);
    await a.click('button[aria-label="Copy your invite code"]', 1000);
    await sleep(3000);
    await shot("home");
  },
};
