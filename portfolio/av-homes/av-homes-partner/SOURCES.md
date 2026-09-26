# AV Homes Partners: sources

Every screen is the real product from the repo, run locally (`next start` against a local demo
MongoDB, never production), captured at 2.5x by `capture/tools/site.cjs` and `capture/tools/jobs.cjs`
through the kit's `shots.cjs`. Nothing was sent anywhere: the form's `POST` is answered by the job's
mock, and every console call by the capture harness (`videos/_tools/record.cjs`). Sign-in is not
faked or shown; the partner console runs as the harness's partner persona.

## Demo

| On screen | Source |
|---|---|
| Tunde Bakare, tunde@lekkihomes.example, +234 803 555 0101, Lekki Homes Ltd | The harness's demo partner (`ptnr_demo_lekki`), `.example` domain, a 555 number |
| The application card, "Approved by Adaeze Vincent", the sign-in link (`http://localhost:3300/admin/sign-in`) | Mock answers in the product's own response shapes (`packages/identity/src/routes/applications.ts`) |
| Idu Grove Estate, its options, city and address | Typed into the real editor during capture, saved through the harness |

## Real

| On screen | Source |
|---|---|
| Every page, label, step and state ("List your property with AV Homes", "That is with us", "Approve and invite", "Send for review", "In review") | The product UI (`src/components/ApplyForm.tsx`, `src/app/admin/partners/applications`, `src/app/admin/properties/[id]`) |
| `POST /api/public/partner-applications` | `routes.post("/public/partner-applications")` in `packages/identity/src/routes/applications.ts` |
| `POST /api/admin/applications/{id}/decide` | `routes.post("/admin/applications/:id/decide")`, same file; it creates the partner and the invite |
| Send for review | The harness mirrors the product's `submit` transition (draft to submitted, shown as In review) |

## Treatment

- The cursor, rings, pills, route lines and tints are the showcase's focus light. Hover faces are
  the buttons' own hover colors, applied during capture.
- Time is compressed: the partner signs in and builds the listing between the approval and the
  review, which the video skips (no sign-in screens are shown).
