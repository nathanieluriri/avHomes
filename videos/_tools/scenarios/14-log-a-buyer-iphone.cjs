// Video 14 on an iPhone: a marketer hands AV Homes somebody who might buy, and the property
// they are interested in is an ESTATE, which is the version with the extra step. Picking
// "Kuje Garden Estate" tells nobody which house, so a checklist of its options appears and the
// marketer ticks every one the buyer asked about, sold-out ones included so the reader can see
// what is gone. Filmed at the iPhone 18 Pro's 402x874 with its safe areas on (VIDEOS.md 12).
const { ORIGIN, BTN, FIELD, reveal: revealOn, warm, prepaint } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const IPHONE = { width: 402, height: 874, dpr: 2, mobile: true };
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };
// The pinned hero and bottom bar are taller by the insets they pad for.
const CLEAR = { top: 72 + INSETS.top, bottom: 110 + INSETS.bottom };
const reveal = (a, sel, at = 0.4, ms = 750) => revealOn(a, sel, at, ms, CLEAR);

const MENU = "::-p-xpath(//nav[@aria-label='App']//button[normalize-space()='Menu'])";
const MENU_ITEM = (href) => `::-p-xpath(//div[@role='dialog'][@aria-label='Menu']//a[@href='${href}'])`;
const LOG = 'a[aria-label="Log a buyer"]';
const NAME = FIELD("Their name");
const PHONE = FIELD("Their phone number");
const BRIEF = FIELD("Anything we should know", "textarea");
const SEARCH = 'input[aria-label="Search a property"]';
const OPTION = (title) => `::-p-xpath(//li[@role='option'][.//span[normalize-space()='${title}']])`;
// The estate's own checklist rows, named the way the estate names them.
const UNIT = (label) => `::-p-xpath(//h3[@id='units-heading']/following::label[.//span[normalize-space()='${label}']][1])`;

// Held for the whole run: the override lives as long as its session.
let insetSession = null;

module.exports = {
  dir: "14-log-a-buyer-iphone",
  viewport: IPHONE,
  origin: ORIGIN,
  demoListings: true,

  async before(a) {
    insetSession = await a.tab.createCDPSession();
    await insetSession.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    await warm(a, ["/m/buyers", "/m/buyers/new"]);
    /* The estate checklist only exists after a property is picked, so warming
       the route never paints it. Picking one here compiles that branch and puts
       the search behind it in the cache; the take then starts from a clean load. */
    await a.click(SEARCH, 200);
    await a.type("Kuje", 20);
    await a.waitFor(OPTION("Kuje Garden Estate"));
    await a.click(OPTION("Kuje Garden Estate"), 150);
    await a.waitFor(UNIT("3 bedroom detached bungalow"));
    await a.scrollBy(700, 250);
    await a.sleep(700);
    await warm(a, ["/m"]);
    await prepaint(a, 900);
  },

  async run(a) {
    const { sleep } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("home");
    await sleep(1800);
    await a.moveTo(MENU, 1100);
    await sleep(400);
    await a.click(MENU, 300);
    await a.waitFor(MENU_ITEM("/m/buyers"));
    await sleep(1100);
    await shot("menu");

    await a.click(MENU_ITEM("/m/buyers"), 900);
    await a.waitFor(LOG);
    await sleep(1800);
    a.mark("buyers");
    await shot("buyers");
    await sleep(1000);

    await a.click(LOG, 900);
    await a.waitFor(NAME);
    await sleep(1200);
    a.mark("form");
    await shot("form");
    await sleep(600);

    a.mark("who");
    await a.click(NAME, 800);
    await a.hideCursor();
    await a.type("Ngozi Okafor", 85);
    await a.hideCursor(false);
    await sleep(300);
    await a.click(PHONE, 700);
    await a.hideCursor();
    await a.type("0802 774 1163", 85);
    await a.hideCursor(false);
    await sleep(1400);
    await shot("who");

    await reveal(a, SEARCH, 0.34);
    a.mark("find");
    await a.click(SEARCH, 800);
    await a.hideCursor();
    await a.type("Kuje", 135);
    await a.waitFor(OPTION("Kuje Garden Estate"));
    await sleep(900);
    await a.hideCursor(false);
    await sleep(1500);
    await shot("find");

    await a.click(OPTION("Kuje Garden Estate"), 850);
    await a.waitFor(UNIT("3 bedroom detached bungalow"));
    await sleep(2200);
    a.mark("estate");
    await shot("estate");
    await sleep(1000);

    // The whole point of the estate version: one tick is not an answer, so
    // several are taken, and the one that is gone is shown rather than hidden.
    await reveal(a, UNIT("3 bedroom detached bungalow"), 0.32, 1000);
    a.mark("options");
    await a.click(UNIT("3 bedroom detached bungalow"), 850, 0.35);
    await sleep(1100);
    await a.click(UNIT("500 sqm plot"), 800, 0.35);
    await sleep(1600);
    await shot("options");
    await a.moveTo(UNIT("4 bedroom detached duplex"), 800, 0.35);
    a.mark("soldout");
    await sleep(2400);
    await shot("soldout");

    await reveal(a, BRIEF, 0.34);
    a.mark("brief");
    await a.click(BRIEF, 800);
    await a.hideCursor();
    await a.typeFast(
      "My aunt's husband. They are building in Abuja and want the three bedroom, but he asked about a plot as well.",
      65,
    );
    await a.hideCursor(false);
    await sleep(1800);
    await shot("brief");

    a.mark("send");
    await a.click(BTN("Send to AV Homes"), 900);
    await a.waitFor(BTN("See what happens"));
    await sleep(600);
    a.mark("sent");
    await shot("burst");
    await sleep(3400);
    await shot("sent");

    await a.click(BTN("See what happens"), 900);
    await sleep(1400);
    a.mark("track");
    await shot("track");
    await sleep(3000);
  },
};
