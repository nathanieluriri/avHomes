// A plain transfer receipt for a scenario to upload, drawn in the recorder's own browser.
// Unbranded on purpose: it stands for "a screenshot of the transfer" without imitating a bank.
const fs = require("fs");
const path = require("path");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Today's date as a phone's banking screen writes it, at a fixed time of day. */
function stamp(time) {
  return `${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

/**
 * Writes `file`: 800 by 600, the 4:3 of the console's image tiles, so the whole slip
 * shows in a picker preview and its middle survives a square thumbnail.
 */
async function makeReceipt(browser, file, r) {
  const rows = [
    ["To", r.name],
    ["Account", `${r.bank} · ${r.account}`],
    ["Reference", r.reference],
    ["Date", r.when],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 800px; height: 600px; background: #eef1f4; font-family: Roboto, "Segoe UI", Arial, sans-serif; color: #111827; }
    .slip { position: absolute; left: 60px; top: 36px; width: 680px; height: 528px; background: #fff; border-radius: 22px; padding: 30px 44px; text-align: center; }
    .tick { width: 70px; height: 70px; margin: 0 auto; border-radius: 999px; background: #16a34a; display: grid; place-items: center; }
    h1 { margin-top: 14px; font-size: 30px; font-weight: 600; }
    .amount { margin-top: 6px; font-size: 56px; font-weight: 700; letter-spacing: -1px; }
    dl { margin-top: 22px; border-top: 2px solid #e5e7eb; text-align: left; }
    .row { display: flex; justify-content: space-between; gap: 24px; padding: 13px 0; border-bottom: 1px solid #f0f1f3; font-size: 21px; }
    dt { color: #6b7280; }
    dd { font-weight: 600; text-align: right; }
  </style></head><body><div class="slip">
    <div class="tick"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg></div>
    <h1>Transfer successful</h1>
    <div class="amount">${esc(r.amount)}</div>
    <dl>${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
  </div></body></html>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: file });
  } finally {
    await page.close();
  }
  return file;
}

module.exports = { makeReceipt, stamp };
