# AV Homes Money: sources

Every screen is the real console from the repo, run locally (`next start` against a local demo
MongoDB, never production), captured at 2.5x through the kit's `shots.cjs`. Every mock body comes
from the capture harness's own handlers (`videos/_tools/record.cjs`), run in process by
`capture/tools/sim.cjs` in the order the story happens: scenario 05's waiting deal, approved at the
corrected ₦158,000,000, then this month's pay list made and each transfer recorded
(`capture/tools/payjobs.cjs`). Nothing touches a real account or bank.

## Demo (labelled "Demo data" where totals show)

| On screen | Source |
|---|---|
| Ikeja GRA Family House deal, Tobi Ajayi, Yetunde Bello, Chidi Okonkwo, buyer Kemi Adebayo and the buyer phone | Harness scenario 05 and fixtures |
| Fund balances, the quarter's standings, the pay list, bank names and account numbers | Harness fixtures (demo accounts such as 0123456707) |
| The two proof photos | The harness's library images |

## Real

| On screen | Source |
|---|---|
| Every screen, label and state (Who gets paid, Approve deal, The two funds, Pay day, Mark as paid, Paid) | The product UI (`src/app/admin/marketers`, `src/app/admin/analytics/wallets`) |
| The 5% / 2% / 1% split and the fund shares | The harness's handlers mirror the product's rules; today's sale rates as shown on the page |
| `POST /api/admin/marketing/deals/{id}/review` | `routes.post("/admin/marketing/deals/:id/review")` in `packages/marketing/src/routes.ts` |
| Mark as paid | `routes.post("/admin/marketing/pay-runs/:id/pay")`, same file |

## Treatment

- The cursor, rings, pill, route line and tints are the showcase's focus light.
- The reference sheet that Mark as paid opens is skipped; each row goes straight to Paid, with the
  harness's own run after each payment.
