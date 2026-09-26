# Sources

Every string and number that can be read in the video, and where it comes from. Capture date for
everything public: **2026-09-25**. Repo: `nathanieluriri/avHomes` at `27d6d85` (`evidence/repo-commit.txt`).

## 1. Site plates (public, real)

Pixel captures of https://www.avhomesltd.com/listings/futuless-manor-life-camp, read only, with the
`capture/tools/shots.cjs` job runner (a copy of `videos/_tools/qa.cjs` with a 1536x864 @ 2.5x
preset). Consent answered "rejected" before load, so the site's visit beacon never fired; `/api`
calls other than `/api/public/*` were answered by the capture harness and never left the browser.
The chat form was opened and filled from the browser's own saved identity; it was never submitted.
Two capture-time stylesheets (`capture/tools/site-jobs.cjs`), both read-only on the live page:

- **Naira sign.** Geist's latin subset has no ₦ (U+20A6), so the site draws it from its own
  `"Geist Fallback"` face, `local("Arial")` at `size-adjust: 104.76%`. This container's Arial predates
  the sign and Chrome fell through to a serif. One more `"Geist Fallback"` face with the site's exact
  metrics, `local("Liberation Sans")` (Arial's metric twin) and `unicode-range: U+20A6`, draws it the
  way a Windows or Mac visitor sees it. Only that one glyph changes; the price box moved 1.2 CSS px.
- **Agent photo.** The agent card shows the product's own no-photo state (`AgentPanel.tsx`: the
  initial on wine-50, what it renders when `avatarUrl` is empty) instead of a real person's face.

| Visible | Source |
|---|---|
| Header: AV HOMES LTD logo, Home, Buy, Rent, List With Us, Insights, About Us, Contact, Find Property | live page (`capture/site/site-before-page.png`); text in `evidence/site-visible-text.txt` |
| HOME > LISTINGS > FUTULESS MANOR, LIFE CAMP; For Sale; Estate Land | live page |
| Futuless Manor, Life Camp; 2 and 3 bedroom apartments in Dape, Life Camp; Dape, Life Camp, Abuja | live page; `/api/public/properties` `title`, `tagline`, `address` (`evidence/public-properties-futuless-manor.json`) |
| FROM ₦87,000,000; All 2 available | live page; `priceMinor` 8700000000 ("All 2 available" is the live copy) |
| Cover render and gallery rail | the listing's own Cloudinary images, as the live page renders them (`images[0..12]`). The live rail squeezes 12 photos into a 560 px column (`Gallery.tsx`: `repeat(rest.length, 1fr)`), so they render as thin strips; they are shown exactly as the live page draws them |
| Overview paragraph | live page; `description` |
| Options, 2 to 3 bed, All 2 available | live page |
| 2 bedroom apartment, 2 bed, ₦87,000,000, ₦43,500,000 deposit, then ₦7,250,000 a month for 6 months | live page; `prototypes[0]` + `paymentPlan` |
| 3 bedroom apartment, 3 bed, ₦97,000,000, ₦48,500,000 deposit, then ₦8,083,333 a month for 6 months | live page; `prototypes[1].priceMinor` 9700000000 + `paymentPlan {depositPercent: 50, months: 6}` |
| Ask about this (and its hover colors) | live page; hover colors are the button's own `hover:border-wine-600 hover:text-wine-600` classes, forced for the still (`src/components/listing/EnquiryOption.tsx`) |
| Sidebar: For Sale, FROM ₦87,000,000, Payment plan: 50% deposit, balance over 6 months. | live page |
| Sidebar agent: A, Arc Athanasius, Architect & Property Development Consultant | live page, the listing's public agent card (no phone or email is shown). The circle shows the product's own no-photo initial instead of the photo (see above) |
| Asking about 3 bedroom apartment; Contact agent; Book a site inspection | live page after "Ask about this" (`capture/site/site-after-page.png`) |
| Verified listing, checked by our team; No hidden fees; Response within one business day | live page |
| Payment plan: 50% DEPOSIT, 6 months TO PAY THE BALANCE, On the 2 bedroom apartment at ₦87,000,000: ₦43,500,000 deposit, then ₦7,250,000 a month for 6 months. | live page |
| Chat panel: Futuless Manor, Life Camp; Tell us how to reach you; A consultant picks this up and answers here. We email you a copy of everything said, so you always have it.; Your name; Email; Phone; NG +234; What would you like to know?; Start the conversation (and its hover color) | live page, `StartForm` in `src/components/chat/ChatWidget.tsx` (`evidence/site-chat-code.txt`); hover is its own `hover:bg-wine-700`, forced for the still |
| I would like to know more about the 3 bedroom apartment. | written by the site itself: `messageFor()` in `src/components/listing/EnquiryOption.tsx:37` |

## 2. Demo data (private surfaces, from the capture harness)

| Visible | Source |
|---|---|
| Buyer in the chat form: Chidinma Okafor, chidinma.okafor@example.com, 801 234 5601 | a harness demo buyer (`videos/_tools/record.cjs:298`, "Chidinma Okafor", "0801 234 5601"), seeded as the browser's saved chat identity (`avhomes.chat.identity`) in `capture/tools/site-jobs.cjs` |
| Console chrome: console, Search, Ctrl K, AV, Adaeze Vincent, Dashboard, Alerts, Listings, Analytics, Enquiries, Mailboxes, Content, Audience, Marketers 1, Partners, Team, Tutorials, Settings, View storefront | the real console UI at `27d6d85` on the local demo stack; persona and the Marketers badge are harness fixtures (`record.cjs`) |
| Enquiries; Everything the contact form and the property pages send in.; All, New, Open, Closed, Spam; Filter this page; FROM, STATUS, MESSAGE, ABOUT, RECEIVED; 5 enquiries on this page / 4 enquiries on this page | real console UI (`src/app/admin/enquiries/page.tsx`, `evidence/console-enquiries-code.txt`) |
| New row: CO, Chidinma Okafor, chidinma.okafor@example.com, New, I would like to know more about the 3 bedroom apartment., futuless-manor-life-camp, just now | job mock on `GET /api/admin/enquiries` (`capture/tools/console-jobs.cjs`): the same buyer and the same site-written question, about the real listing's slug; "just now" is the console's own `relative()` |
| Rows: Seyi Adeleke, Grace Obi, Musa Bello, Ifeoma Nwosu (all @example.com), their questions about demo listings, 2h / 5h / 1d / 2d ago | job mock; names from the harness's demo people, listings from the seeded demo database (`scripts/seed-demo.ts`) |

No business totals appear (no analytics tiles, fund balances or dashboard counts), so no "Demo data"
label is needed. Every person in the console is a harness demo person at @example.com.

## 3. Built for the video (travellers only)

| Visible | Source |
|---|---|
| `POST /api/enquiries/chat` (the request pill) | the real route: `routes.post("/enquiries/chat", ...)`, `packages/enquiries/src/index.ts:593` (`evidence/route-post-enquiries-chat.txt`), called by `start()` in `src/lib/chat/provider.tsx:295` |
| Cursor and click ring | the capture harness's own drawn cursor and ring (`CURSOR_JS`, `videos/_tools/record.cjs:2292`) |
| Colors | product tokens from `src/app/globals.css` (`evidence/tokens.txt`); the capture's `capture/hf/extracted/tokens.json` agrees |
| Focus light | while the chat panel is the focus (4.7 to 8.1 s) the page behind it dims to 45% (plum-950 at 0.55), and the panel carries one soft drop shadow so it reads as an overlay: section 7.6's "light, not arrows". The live panel is flat |
| Plate levels | `assets/plates/lod/*@1..5.png` are Lanczos reductions of the same captures (0.71x to 0.18x), so the wide shots are filtered instead of shimmering; `capture/tools/plates.py` builds them |

## 4. Privacy scan

Scanned: `evidence/*.txt`, `capture/tools/*`, `capture/*.json`, the composition. Patterns: API keys
(`sk_live_`, `AKIA`, `ghp_`, `eyJ` JWTs, `-----BEGIN`), emails, phone numbers, IPs, internal hosts.
Result: only `@example.com` addresses and the harness's demo numbers. No secrets. The agent's
phone and email exist in the public API but are not shown on the page and are left out of the
evidence copy. The raw page capture (`capture/hf/extracted/page.html`) carried the company's public
business phone and email in its structured data; both are redacted there (never on screen).
Remaining pattern hits are false positives: GSAP's easing constants, GreenSock's license header,
and decimal coordinates in the page capture's inline SVG.
