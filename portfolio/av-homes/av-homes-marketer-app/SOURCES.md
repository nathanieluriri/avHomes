# AV Homes Marketers: sources

Every screen is the real marketer app (`/m`, `/m/deals/new`, `/m/deals`, `/m/money`) from the repo,
run locally (`next start` against a local demo MongoDB, never production), captured at dpr 3 by
`capture/tools/make-jobs.cjs` through the kit's `shots.cjs`. Sign-in is not faked: the capture
harness (`videos/_tools/record.cjs`) answers `/api/*` from its in-memory fixtures, persona Adaeze
Vincent. Every mock body is computed by the harness's own handlers: the deal is sent through its
`POST /api/marketing/deals` and approved through its `POST /api/admin/marketing/deals/:id/review`.

## Demo

| On screen | Source |
|---|---|
| Balances (₦24,000,000 and ₦36,000,000 waiting, ₦900,000 being checked, ₦29,425,000 paid), payments, earnings, deals list | Harness fixtures (one clawback line left out so Waiting stays the plain case). Labelled "Demo data" |
| Tropical Oasis, Palm Residence, Chevron Drive Townhouse (the Lekki search results) | Demo listings in the local demo db (`demo_` ids), never real listings |
| Buyer Babajide Ogunleye, invite code AV-0001, Guaranty Trust Bank ending 6789 | Harness demo data |
| The proof photo (a transfer receipt for ₦240,000,000) | Drawn by the harness's `receipt.cjs` with demo details; shown only as the app's small thumbnail |

## Real

| On screen | Source |
|---|---|
| Every screen, label, figure format and step ("Report a deal", "You could earn, 5% of it, once it is approved", "Send it in") | The product UI (`src/app/m`, `src/components/marketer`) |
| The 5% earning worked out as the amount is typed | The app's own calculation, captured after each digit |
| `POST /api/marketing/deals` | `packages/marketing/src/routes.ts`, `routes.post("/marketing/deals")` |
| `POST /admin/marketing/deals/{id}/review` | `packages/marketing/src/routes.ts`, `routes.post("/admin/marketing/deals/:id/review")` (served under `/api`) |

## Treatment

- Phones float bezel-less with the screen's 55 CSS px corner radius; no drawn device, no status bar.
- The fingertip, rings, pills, route lines and tints are the showcase's focus light. Pressed faces
  are the app's own pressed styles, applied during capture.
- ₦ renders in Liberation Sans through a `U+20A6` @font-face (the app falls back to Arial for it).
- Your deals before the deal is a real capture of the list before it; the approval is shown right
  after the send, while in the product an AV Homes admin approves it later from the console.
