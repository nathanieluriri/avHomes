// Video 11 on an iPhone: the same take as 11-share-a-listing, filmed at the iPhone 18 Pro's
// 402x874 with its status bar and home indicator insets (see VIDEOS.md section 12).
const { ORIGIN, TAB, reveal: revealOn, warm } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const IPHONE = { width: 402, height: 874, dpr: 2, mobile: true };
const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };
// The pinned hero and bottom bar are taller by the insets they pad for.
const CLEAR = { top: 72 + INSETS.top, bottom: 110 + INSETS.bottom };
const reveal = (a, sel, at = 0.4, ms = 750) => revealOn(a, sel, at, ms, CLEAR);

const MENU = "::-p-xpath(//nav[@aria-label='App']//button[normalize-space()='Menu'])";
const MENU_ITEM = (href) => `::-p-xpath(//div[@role='dialog'][@aria-label='Menu']//a[@href='${href}'])`;
const SEARCH = 'input[aria-label="Search homes"]';
const CARD = (title) => `::-p-xpath(//article[.//h3[normalize-space()='${title}']])`;
const SHARE = (title) => `button[aria-label="Share ${title}"]`;

// Held for the whole run: the override lives as long as its session.
let insetSession = null;

module.exports = {
  dir: "11-share-a-listing-iphone",
  viewport: IPHONE,
  origin: ORIGIN,
  demoListings: true,

  async before(a) {
    insetSession = await a.tab.createCDPSession();
    await insetSession.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
    await warm(a, ["/m/listings", "/m"]);
  },

  async run(a) {
    const { sleep } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("home");
    await a.moveTo(MENU, 1200);
    await sleep(500);
    await a.click(MENU, 300);
    await a.waitFor(MENU_ITEM("/m/listings"));
    await sleep(1200);
    await shot("menu");
    await a.click(MENU_ITEM("/m/listings"), 900);
    await a.waitFor(SEARCH);
    await a.waitFor("article");
    await sleep(1600);
    a.mark("listings");
    await shot("listings");
    await sleep(800);

    a.mark("search");
    await a.click(SEARCH, 900);
    await a.hideCursor();
    await a.type("Lekki", 130);
    await a.waitFor(CARD("Chevron Drive Townhouse"));
    await sleep(900);
    await a.hideCursor(false);
    await sleep(1400);
    await shot("search");

    await reveal(a, TAB("For rent"), 0.25, 900);
    a.mark("kind");
    await a.click(TAB("For rent"), 900);
    await a.waitFor(CARD("Palm Residence"));
    await sleep(2200);
    await shot("rent");
    await a.click(TAB("For sale"), 800);
    await a.waitFor(CARD("Tropical Oasis"));
    await sleep(1600);
    await shot("sale");

    // 0.16, not the flat 0.12: the card's top edge sits just under the taller compact bar, as it did at 360x640.
    await reveal(a, CARD("Tropical Oasis"), 0.16, 1000);
    a.mark("card");
    await a.moveTo("::-p-xpath(//article//h3[normalize-space()='Tropical Oasis'])", 900, 0.3);
    await sleep(2600);
    await shot("card");

    a.mark("share");
    await a.click(SHARE("Tropical Oasis"), 900);
    await sleep(900);
    a.mark("message");
    await sleep(5600);
    await shot("shared");
  },
};
