// Builds a marketer app tutorial inside the iPhone 18 Pro frame. See VIDEOS.md section 12.
//
//   node videos/_tools/iphone.cjs edit <name> <from>   edit.json from video <from>'s edit, remapped by both takes' marks
//   node videos/_tools/iphone.cjs compose <name>       assets/iphone.mp4, the held last frame, index.html, project files
//
// Env: FFMPEG (source videos/_tools/env.sh first).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "../..");
const [mode, name, from] = process.argv.slice(2);
const DIR = path.join(REPO, "videos", name || "");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// Intro and closing card copy per video, the same fields compose.cjs uses for the flat phone stage.
const META = {
  "08-report-a-deal-iphone": {
    title: ["Reporting", "a deal"],
    sub: "Sold a home? Tell AV Homes, send the proof, and get paid.",
    close: {
      h: ["Now report", "yours."],
      p: "Tap the round <b>+</b> in the middle of the bar.<br />We check the proof, then the money is yours.",
    },
  },
  "09-invite-and-earn-iphone": {
    title: ["Invite people,", "earn more"],
    sub: "Share your link, grow a team, and earn from their deals too.",
    close: {
      h: ["Now bring", "someone in."],
      p: "Send your link to one person this week.<br />When they close a home, you earn from it too.",
    },
  },
  "11-share-a-listing-iphone": {
    title: ["Sharing a", "listing"],
    sub: "Send a buyer a home on AV Homes, with your code in the link.",
    close: {
      h: ["Now share", "a home."],
      p: "Open <b>Listings</b> from the Menu and tap <b>Share</b>.<br />An enquiry from your link names you.",
    },
  },
  "12-send-more-proof-iphone": {
    title: ["Sending more", "proof"],
    sub: "AV Homes asked for more on your deal? Answer it from one screen.",
    close: {
      h: ["Answer it", "the same day."],
      p: "Tap the alert, add the photo they asked for, send it back.<br />Your deal goes straight back to Being checked.",
    },
  },
  "13-join-as-a-marketer-iphone": {
    title: ["Joining as a", "marketer"],
    sub: "Got an invite link? Three short steps and you are in.",
    close: {
      h: ["Welcome to", "the team."],
      p: "Your own invite code is on your home screen.<br />Report your first deal with the round <b>+</b>.",
    },
  },
  "14-log-a-buyer-iphone": {
    title: ["Logging a", "buyer"],
    sub: "Know somebody who wants to buy? Hand them over and still get paid.",
    close: {
      h: ["Now send us", "one person."],
      p: "Menu, then <b>Buyers</b>, then the <b>+</b> at the top.<br />We do the calls. You are paid the same commission.",
    },
  },
};

// Apple's bezel, scaled once to 822x1680 (section 12). Gitignored: Apple's license bars redistributing it.
const BEZEL = path.join(REPO, "videos/08-report-a-deal-iphone/assets/iphone-18-pro-silver.png");

if (mode === "edit") {
  const src = path.join(REPO, "videos", from);
  const oldMarks = read(path.join(src, "assets/marks.json"));
  const newMarks = read(path.join(DIR, "assets/marks.json"));
  const pairs = Object.keys(oldMarks).filter((k) => k in newMarks).map((k) => [oldMarks[k], newMarks[k]]).sort((a, b) => a[0] - b[0]);
  // Piecewise linear between marks; slope 1 outside them.
  const map = (t) => {
    if (t <= pairs[0][0]) return pairs[0][1] + (t - pairs[0][0]);
    for (let i = 1; i < pairs.length; i++) {
      const [a0, b0] = pairs[i - 1];
      const [a1, b1] = pairs[i];
      if (t <= a1) return b0 + ((t - a0) * (b1 - b0)) / (a1 - a0);
    }
    const [aN, bN] = pairs[pairs.length - 1];
    return bN + (t - aN);
  };
  const r2 = (x) => Math.round(x * 100) / 100;
  const end = newMarks.end;
  const edl = read(path.join(src, "edit.json"));
  const segments = edl.segments.map(([a, b, speed = 1]) => [r2(Math.max(0, map(a))), r2(Math.min(end - 0.02, map(b))), speed]);
  const captions = edl.captions.map((c) => ({ ...c, at: r2(map(c.at)), until: r2(Math.min(end - 0.1, map(c.until))) }));
  fs.writeFileSync(path.join(DIR, "edit.json"), JSON.stringify({ segments, captions }, null, 2) + "\n");
  console.log("edit.json:", segments.map((s) => s.slice(0, 2).join("-")).join(" "));
}

if (mode === "compose") {
  const META_V = META[name];
  if (!META_V) throw new Error(`no META entry for ${name} in iphone.cjs`);
  const timeline = read(path.join(DIR, "timeline.json"));
  const FFMPEG = process.env.FFMPEG;

  if (path.resolve(BEZEL) !== path.resolve(path.join(DIR, "assets/iphone-18-pro-silver.png"))) {
    fs.copyFileSync(BEZEL, path.join(DIR, "assets/iphone-18-pro-silver.png"));
  }
  fs.copyFileSync(path.join(REPO, "public/brand/logo-mark-reversed.png"), path.join(DIR, "assets/logo-mark-reversed.png"));

  // The bezel's screen at left 129, top 218 is 734x1596 from (172.8, 260). The footage bleeds 2px
  // under the rim on every side at the take's own 402:874, so no seam shows at the inner edge.
  // Lanczos here because the browser's downscale softens small type; BT.601 to BT.709 because the
  // renderer misreads the recorder's untagged footage and turns the wine hero brick red.
  const SCREEN = { left: 171, top: 256, width: 738, height: 1604 };
  execFileSync(FFMPEG, ["-hide_banner", "-v", "error", "-y", "-i", path.join(DIR, "assets/edited.mp4"),
    "-vf", `scale=${SCREEN.width}:${SCREEN.height}:flags=lanczos:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`,
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-g", "30", "-keyint_min", "30",
    "-movflags", "+faststart", path.join(DIR, "assets/iphone.mp4")], { stdio: "inherit" });
  // Shown behind the clip, so the screen keeps its last frame while the closing card fades in.
  execFileSync(FFMPEG, ["-hide_banner", "-v", "error", "-y", "-sseof", "-0.1", "-i", path.join(DIR, "assets/iphone.mp4"),
    "-frames:v", "1", "-q:v", "2", path.join(DIR, "assets/last-frame.jpg")], { stdio: "inherit" });

  // The clock the take was filmed at, so it agrees with the app's Good morning or Good afternoon.
  const shotAt = new Date(fs.statSync(path.join(DIR, "assets/footage.mp4")).mtimeMs - timeline.footageDuration * 1000);
  const clock = `${shotAt.getHours() % 12 || 12}:${String(shotAt.getMinutes()).padStart(2, "0")}`;

  const INTRO = 3.4;
  const FOOT = timeline.footageDuration;
  const OUTRO = 5;
  const TOTAL = +(INTRO + FOOT + OUTRO - 0.4).toFixed(2);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const caps = timeline.captions.map((c, i, all) => {
    const next = all[i + 1];
    const end = next ? Math.min(c.end, next.start - 0.3) : Math.min(c.end, FOOT - 0.2);
    return { ...c, start: +(INTRO + c.start).toFixed(2), end: +(INTRO + end).toFixed(2) };
  });
  const capHtml = caps.map((c, i) => `      <div class="cap top" id="cap${i}" data-layout-allow-occlusion data-layout-allow-overlap>
        <span class="bar"></span>
        <div class="step">Step ${i + 1} of ${caps.length}</div>
        <div class="h">${esc(c.title)}</div>
        <div class="d">${esc(c.line)}</div>
      </div>`).join("\n");
  const capJs = caps.map((c, i) => {
    const d = Math.max(0.6, c.end - c.start);
    return `      tl.fromTo("#cap${i}", { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, ${c.start});
      tl.to("#cap${i}", { opacity: 0, x: -10, duration: 0.3, ease: "power1.in" }, ${(c.start + d - 0.3).toFixed(2)});`;
  }).join("\n");
  // A shared message goes to the share sheet or WhatsApp, which no take can film. As in compose.cjs:
  // the exact text the app sent, over the dimmed screen, with the marketer's code picked out.
  const linkHtml = (link, code) => {
    const at = code ? link.lastIndexOf(code) : -1;
    return at < 0 ? esc(link) : `${esc(link.slice(0, at))}<b>${esc(code)}</b>${esc(link.slice(at + code.length))}`;
  };
  const said = caps.map((c, i) => ({ c, i })).filter(({ c }) => c.message);
  // Only when a message is shown, so 08's index.html stays byte for byte.
  const msgCss = !said.length ? "" : `
      /* The screen dims under the status bar; the card stays inside the glass. */
      .scrim { position: absolute; left: ${SCREEN.left}px; top: ${SCREEN.top}px; width: ${SCREEN.width}px; height: ${SCREEN.height}px; border-radius: 128px;
        background: rgb(14 6 9 / 0.66); opacity: 0; }
      .msg { position: absolute; left: ${SCREEN.left + 30}px; width: ${SCREEN.width - 60}px; top: 720px; z-index: 19; opacity: 0; background: rgb(28 18 20 / 0.97);
        border-radius: 28px; padding: 34px 38px 38px; box-shadow: 0 30px 70px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.08); }
      .msg .m-label { color: var(--wine-300); font-size: 22px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
      .msg .m-text { margin-top: 16px; color: #fff; font-size: 36px; font-weight: 500; line-height: 1.38; letter-spacing: -.01em; }
      .msg .m-link { margin-top: 22px; padding: 16px 20px; border-radius: 16px; background: rgb(255 255 255 / 0.06); color: var(--wine-100); font-size: 28px; line-height: 1.4; overflow-wrap: anywhere; }
      .msg .m-link b { color: #fff; font-weight: 700; background: rgb(180 80 105 / 0.5); border-radius: 8px; padding: 0 8px; }
`;
  const scrimHtml = said.map(({ i }) => `
      <div class="scrim" id="scrim${i}" data-layout-allow-occlusion data-layout-allow-overlap></div>`).join("");
  const msgHtml = said.map(({ c, i }) => `
      <div class="msg" id="msg${i}" data-layout-allow-occlusion data-layout-allow-overlap>
        <div class="m-label">${esc(c.message.label)}</div>
        <p class="m-text">${esc(c.message.text)}</p>
        <p class="m-link">${linkHtml(c.message.link, c.message.code)}</p>
      </div>`).join("");
  const msgJs = said.map(({ c, i }) => {
    const from = +(c.start + (c.message.delay ?? 0.5)).toFixed(2);
    const to = +(c.end - 0.3).toFixed(2);
    return `
      tl.fromTo("#scrim${i}", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, ${from});
      tl.fromTo("#msg${i}", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${(from + 0.1).toFixed(2)});
      tl.to("#msg${i}", { opacity: 0, y: 16, duration: 0.3, ease: "power1.in" }, ${to});
      tl.to("#scrim${i}", { opacity: 0, duration: 0.3, ease: "power1.in" }, ${to});`;
  }).join("");

  const outroStart = +(INTRO + FOOT - 0.4).toFixed(2);
  const title = META_V.title.join(" ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>AVHomes marketers tutorial: ${esc(title)} (iPhone)</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@600&display=swap" rel="stylesheet" />
    <style>
      /* Tokens from src/app/globals.css. */
      :root {
        --plum-950: #1c1214; --wine-700: #762d3f; --wine-600: #983c53; --wine-500: #b45069;
        --wine-300: #e6a8b7; --wine-100: #f2dee3; --chrome-900: #321119; --chrome-800: #4d1a26;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { width: 1080px; height: 1920px; }
      html, body { overflow: hidden; background: var(--chrome-900); font-family: "Geist", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
      #root { position: relative; overflow: hidden; background: radial-gradient(120% 70% at 18% 6%, #5a2130 0%, var(--chrome-800) 34%, var(--chrome-900) 72%, #230b11 100%); }
      .clip { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
      video.clip { object-fit: cover; background: #140b0e; }

      /* The phone: Apple's iPhone 18 Pro bezel (Silver) over the take, filmed at its 402x874. */
      .device-shadow { position: absolute; left: 139px; top: 231px; width: 802px; height: 1653px; border-radius: 164px; background: #0b0b0c;
        box-shadow: 0 46px 90px -12px rgb(12 2 6 / 0.62), 0 14px 34px rgb(12 2 6 / 0.4); }
      .screen { position: absolute; left: ${SCREEN.left}px; top: ${SCREEN.top}px; width: ${SCREEN.width}px; height: ${SCREEN.height}px; overflow: hidden;
        border-radius: 128px; background: #140b0e url("assets/last-frame.jpg") center / cover no-repeat; }
      .bezel { position: absolute; left: 129px; top: 218px; width: 822px; height: 1680px; }
      .status { position: absolute; left: 173px; top: 297px; width: 734px; height: 44px; color: #fff; }
      .status .time { position: absolute; left: 70px; top: 0; width: 120px; height: 44px; line-height: 44px; text-align: center;
        font-family: "Inter", "Geist", system-ui, sans-serif; font-weight: 600; font-size: 31px; letter-spacing: -0.02em; }
      .status .icons { position: absolute; left: 547px; top: 11px; height: 22px; display: flex; align-items: center; gap: 11px; }
      .status svg { display: block; flex: 0 0 auto; }
      .home-ind { position: absolute; left: 412px; top: 1832px; width: 256px; height: 9px; border-radius: 9px; background: #fff; }
${msgCss}
      .card { background: radial-gradient(120% 90% at 18% 20%, #5a2130 0%, var(--chrome-800) 38%, var(--chrome-900) 78%, #230b11 100%); }
      .intro .inner { position: absolute; left: 96px; right: 96px; top: 50%; transform: translateY(-50%); }
      .intro .mark { width: 136px; height: auto; display: block; margin-bottom: 56px; }
      .eyebrow { color: var(--wine-300); font-size: 26px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; }
      .intro h1 { margin-top: 24px; color: #fff; font-size: 128px; font-weight: 700; letter-spacing: -.035em; line-height: 1.0; }
      h1 em, h2 em { font-family: "Instrument Serif", Georgia, serif; font-style: italic; font-weight: 400; color: var(--wine-300); letter-spacing: -.01em; }
      .intro .sub { margin-top: 38px; color: var(--wine-100); font-size: 42px; font-weight: 400; line-height: 1.3; max-width: 880px; }
      .intro .rule { margin-top: 60px; width: 240px; height: 4px; border-radius: 3px; background: var(--wine-500); transform-origin: 0 50%; }

      .cap { position: absolute; left: 40px; right: 40px; top: 46px; z-index: 20; opacity: 0;
        background: rgb(28 18 20 / 0.95); border-radius: 22px; padding: 20px 32px 22px 46px;
        box-shadow: 0 18px 44px rgb(28 18 20 / 0.36), 0 0 0 1px rgb(255 255 255 / 0.06); }
      .cap .bar { position: absolute; left: 0; top: 18px; bottom: 18px; width: 6px; border-radius: 3px; background: var(--wine-500); }
      .cap .step { color: var(--wine-300); font-size: 19px; line-height: 1.2; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
      .cap .h { margin-top: 4px; color: #fff; font-size: 40px; font-weight: 700; letter-spacing: -.02em; line-height: 1.12; }
      .cap .d { margin-top: 4px; color: var(--wine-100); font-size: 29px; font-weight: 400; line-height: 1.3; }

      .progress { position: absolute; left: 0; bottom: 0; height: 8px; width: 1080px; background: var(--wine-500); transform-origin: 0 50%; z-index: 21; }

      .outro .o-inner { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; }
      .outro h2 { margin-top: 18px; color: #fff; font-size: 112px; font-weight: 700; letter-spacing: -.035em; line-height: 1.02; }
      .o-close { margin: 44px auto 0; max-width: 1000px; padding: 0 40px; color: var(--wine-100); font-size: 36px; line-height: 1.45; }
      .o-close b { color: #fff; font-weight: 600; }
      .o-mark { width: 136px; height: auto; display: block; margin: 0 auto 40px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${TOTAL}">
      <div class="device-shadow" id="device-shadow" data-layout-allow-occlusion data-layout-allow-overlap></div>
      <div class="screen" id="screen" data-layout-allow-occlusion data-layout-allow-overlap>
        <video class="clip" id="footage" data-start="${(INTRO - 0.5).toFixed(2)}" data-duration="${(FOOT + 0.1).toFixed(2)}" data-media-start="0" src="assets/iphone.mp4" muted playsinline></video>
      </div>${scrimHtml}
      <div class="status" id="status" data-layout-allow-occlusion data-layout-allow-overlap>
        <div class="time">${clock}</div>
        <div class="icons">
          <svg width="35" height="22" viewBox="0 0 19 12" fill="#fff" aria-hidden="true"><rect x="0" y="7.3" width="3.2" height="4.7" rx="1"/><rect x="5.2" y="5" width="3.2" height="7" rx="1"/><rect x="10.4" y="2.5" width="3.2" height="9.5" rx="1"/><rect x="15.6" y="0" width="3.2" height="12" rx="1"/></svg>
          <svg width="31" height="22" viewBox="0 0 17 12" fill="#fff" aria-hidden="true"><path d="M8.5 2.6c2.3 0 4.5.9 6.2 2.4.1.1.3.1.4 0l1.2-1.2c.1-.1.1-.3 0-.4C14.3 1.4 11.5.2 8.5.2S2.7 1.4.7 3.4c-.1.1-.1.3 0 .4l1.2 1.2c.1.1.3.1.4 0C4 3.5 6.2 2.6 8.5 2.6zm0 3.9c1.3 0 2.5.5 3.5 1.3.1.1.3.1.4 0l1.2-1.2c.1-.1.1-.3 0-.4-1.4-1.3-3.2-2-5.1-2s-3.7.7-5.1 2c-.1.1-.1.3 0 .4L4.6 7.8c.1.1.3.1.4 0 1-.8 2.2-1.3 3.5-1.3zm2.5 2.6c.1-.1.1-.3 0-.4-.7-.6-1.6-1-2.5-1s-1.8.4-2.5 1c-.1.1-.1.3 0 .4l2.3 2.3c.1.1.3.1.4 0L11 9.1z"/></svg>
          <svg width="50" height="24" viewBox="0 0 27 13" aria-hidden="true"><rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="#fff" stroke-opacity="0.4"/><rect x="2" y="2" width="20" height="9" rx="2.4" fill="#fff"/><path d="M25 4.4v4.2c.8-.3 1.4-1.2 1.4-2.1S25.8 4.7 25 4.4z" fill="#fff" fill-opacity="0.45"/></svg>
        </div>
      </div>
      <div class="home-ind" id="home-ind" data-layout-allow-occlusion data-layout-allow-overlap></div>
      <img class="bezel" id="bezel" src="assets/iphone-18-pro-silver.png" alt="" data-layout-allow-occlusion data-layout-allow-overlap />
      <div class="progress" id="progress"></div>

      <section class="clip card intro" id="intro" data-start="0" data-duration="${INTRO.toFixed(2)}">
        <div class="inner">
          <img class="mark" id="i-mark" src="assets/logo-mark-reversed.png" alt="" />
          <div class="eyebrow" id="i-eyebrow">AVHomes marketers &middot; Tutorial</div>
          <h1 id="i-h">${esc(META_V.title[0])}<br /><em>${esc(META_V.title[1])}</em></h1>
          <p class="sub" id="i-sub">${esc(META_V.sub)}</p>
          <div class="rule" id="i-rule"></div>
        </div>
      </section>

${capHtml}${msgHtml}

      <section class="clip card outro" id="outro" data-start="${outroStart}" data-duration="${(TOTAL - outroStart).toFixed(2)}">
        <div class="o-inner">
          <img class="o-mark" src="assets/logo-mark-reversed.png" alt="" />
          <h2 id="o-h">${esc(META_V.close.h[0])}<br /><em>${esc(META_V.close.h[1])}</em></h2>
          <p class="o-close" id="o-close">${META_V.close.p}</p>
        </div>
      </section>
    </div>

    <script>
      var tl = gsap.timeline({ paused: true });
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;

      tl.fromTo("#i-mark", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, 0.1);
      tl.fromTo("#i-eyebrow", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0.35);
      tl.fromTo("#i-h", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.5);
      tl.fromTo("#i-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.85);
      tl.fromTo("#i-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.inOut" }, 1.1);
      tl.to("#intro", { opacity: 0, duration: 0.5, ease: "power1.in" }, ${(INTRO - 0.5).toFixed(2)});

      tl.fromTo("#progress", { scaleX: 0 }, { scaleX: 1, duration: ${FOOT.toFixed(2)}, ease: "none" }, ${INTRO.toFixed(2)});
      tl.to("#progress", { opacity: 0, duration: 0.3 }, ${(INTRO + FOOT - 0.3).toFixed(2)});

${capJs}${msgJs}

      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" }, ${outroStart});
      tl.fromTo(".o-mark", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, ${(outroStart + 0.3).toFixed(2)});
      tl.fromTo("#o-h", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${(outroStart + 0.6).toFixed(2)});
      tl.fromTo("#o-close", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${(outroStart + 1.3).toFixed(2)});
    </script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(DIR, "index.html"), html);
  const pin = "hyperframes@0.8.33";
  fs.writeFileSync(path.join(DIR, "package.json"), JSON.stringify({ name: `avhomes-tutorial-${name}`, private: true, type: "module", scripts: { check: `npx --yes ${pin} check`, render: `npx --yes ${pin} render` } }, null, 2) + "\n");
  fs.writeFileSync(path.join(DIR, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2) + "\n");
  fs.writeFileSync(path.join(DIR, "meta.json"), JSON.stringify({ id: `avhomes-tutorial-${name}`, name: `${title} (iPhone)` }, null, 2) + "\n");
  console.log(`${name}: ${TOTAL}s total, footage ${FOOT}s, ${caps.length} captions, clock ${clock}`);
}
