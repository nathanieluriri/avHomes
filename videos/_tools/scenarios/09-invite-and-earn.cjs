// Video 9: bringing people in, and what they earn you. Share my link on home and the message
// it sends, the Invite screen (copy, WhatsApp, the QR code), the team across its three levels,
// and the card that says what each level pays.
const { STAGE, ORIGIN, BTN, TAB, reveal, warm } = require("../phone.cjs");

const DRY = process.env.NO_RECORD === "1";
const MENU = "::-p-xpath(//nav[@aria-label='App']//button[normalize-space()='Menu'])";
const MENU_ITEM = (href) => `::-p-xpath(//div[@role='dialog'][@aria-label='Menu']//a[@href='${href}'])`;
const TEAM_ROW = "::-p-xpath(//a[@href='/m/team'][.//span[normalize-space()='Your team']])";

module.exports = {
  dir: "09-invite-and-earn",
  viewport: STAGE,
  origin: ORIGIN,

  async before(a) {
    await warm(a, ["/m/invite", "/m/team", "/m"]);
  },

  async run(a) {
    const { sleep } = a;
    const shot = (n) => (DRY ? a.shot(n) : Promise.resolve());

    a.mark("home");
    await a.moveTo(BTN("Share my link"), 1100, 0.6);
    await sleep(900);
    await shot("home");

    // The phone's share sheet cannot be filmed; the recorder keeps the message for the video.
    await a.click(BTN("Share my link"), 400, 0.6);
    a.mark("message");
    await sleep(5200);

    a.mark("menu");
    await a.click(MENU, 1000);
    await a.waitFor(MENU_ITEM("/m/invite"));
    await sleep(1300);
    await shot("menu");
    await a.click(MENU_ITEM("/m/invite"), 900);
    await a.waitFor('button[aria-label="Copy your link"]');
    await sleep(1400);
    a.mark("invite");
    await shot("invite");
    await sleep(1400);

    await reveal(a, 'button[aria-label="Copy your link"]', 0.45);
    a.mark("copy");
    await a.click('button[aria-label="Copy your link"]', 900);
    // The button says Copied for 1.8s.
    await sleep(1000);
    await shot("copied");
    await sleep(1900);

    a.mark("whatsapp");
    await a.moveTo(BTN("Send on WhatsApp"), 900, 0.35);
    await sleep(3000);
    await shot("whatsapp");

    a.mark("qr");
    await a.click(BTN("Make it bigger"), 1000);
    await a.waitFor(BTN("Done"));
    await sleep(3200);
    await shot("qr");
    await a.click(BTN("Done"), 900);
    await sleep(900);

    await reveal(a, TEAM_ROW, 0.5, 1400);
    await sleep(500);
    await a.click(TEAM_ROW, 900);
    await a.waitFor(TAB("They invited"));
    await sleep(1200);
    a.mark("team");
    await shot("team");
    await a.moveTo(TAB("You invited"), 900);
    await sleep(2600);

    a.mark("level2");
    await a.click(TAB("They invited"), 800);
    await sleep(2800);
    await shot("level2");

    a.mark("level3");
    await a.click(TAB("One more step"), 800);
    await sleep(2800);
    await shot("level3");

    // The whole card fits between the compact bar and the bottom bar at 360x640.
    await reveal(a, "section[aria-labelledby='how-it-pays']", 0.1, 1500);
    a.mark("rates");
    await a.moveTo("::-p-xpath(//section[@aria-labelledby='how-it-pays']//ol/li[1]//span[contains(@class,'rounded-full')])", 900);
    await sleep(3400);
    await shot("rates");

    a.mark("real");
    await a.moveTo("::-p-xpath(//section[@aria-labelledby='how-it-pays']//p[starts-with(normalize-space(),'Nobody earns')])", 900, 0.5, 0.3);
    await sleep(3200);
    await shot("real");
  },
};
