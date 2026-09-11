// Video 3: reply to an enquiry so the buyer hears back fast. Chioma's chat about the
// Asokoro Hillside Villa, answered from the thread, then the inbox with one fewer new.
const DRY = process.env.NO_RECORD === "1";

module.exports = {
  dir: "03-reply-to-enquiries",
  async before(a) {
    const chioma = a.S.enqs.find((e) => e.name === "Chioma Okafor");
    await a.goto("/admin/enquiries");
    await a.goto(`/admin/enquiries/${chioma.id}`);
  },
  async run(a) {
    const { sleep } = a;
    await a.goto("/admin/enquiries");
    a.mark("inbox");
    await sleep(2200);

    await a.moveTo("::-p-xpath(//a[.//*[normalize-space()='Chioma Okafor']] | //tr[.//*[normalize-space()='Chioma Okafor']])", 900);
    await sleep(700);
    await a.click("::-p-xpath(//a[.//*[normalize-space()='Chioma Okafor']] | //tr[.//*[normalize-space()='Chioma Okafor']])", 300);
    await a.waitFor("textarea");
    a.mark("thread");
    await sleep(2600);

    await a.click("::-p-xpath(//textarea[starts-with(@placeholder,'Reply to the buyer')])", 800);
    a.mark("typing");
    await sleep(300);
    await a.type("Good afternoon Chioma, yes, the Asokoro Hillside Villa is still available.", 34);
    await a.tab.keyboard.down("Shift");
    await a.tab.keyboard.press("Enter");
    await a.tab.keyboard.up("Shift");
    await a.type("Saturday works. I can show you round at 11am or 2pm, which suits you better? I'll send the exact address as soon as you confirm.", 26);
    await sleep(900);
    if (DRY) await a.shot("typed");

    a.mark("send");
    await a.click("::-p-xpath(//button[@aria-label='Send reply' or @aria-label='Send' or @type='submit'][ancestor::*[.//textarea]])", 700).catch(async () => {
      await a.tab.keyboard.press("Enter");
    });
    await sleep(1800);
    a.mark("sent");
    if (DRY) await a.shot("sent");
    await sleep(2200);

    // A reply moves it to Open by itself; point at the badge that just changed.
    await a.moveTo("::-p-xpath(//h1/following-sibling::*[normalize-space()='Open'] | //h1/..//*[normalize-space()='Open'])", 900);
    a.mark("status");
    await sleep(2400);
    if (DRY) await a.shot("status");

    await a.click("::-p-xpath(//nav[@aria-label='Breadcrumb']//a)", 900);
    await a.waitFor("::-p-xpath(//*[normalize-space()='Tunde Bakare'])");
    a.mark("inbox-after");
    await sleep(2800);
    if (DRY) await a.shot("inbox-after");
  },
};
