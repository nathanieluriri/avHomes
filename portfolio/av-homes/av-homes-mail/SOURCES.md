# AV Homes Mailboxes: sources

Every screen is the real console (`/admin/mail`, the Mailboxes screen) from the repo, run locally
(`next start` against a local demo MongoDB, never production), captured at 2.5x by
`capture/tools/jobs.cjs`. Sign-in is not faked: the capture harness answers `/api/*` from its
in-memory mock, and `capture/tools/mail-mock.cjs` answers the mail routes (the harness has no mail
data). Nothing was sent to Hostinger or anyone else.

## Demo data (private data replaced)

| On screen | Source |
|---|---|
| Mailboxes sales@, hello@, partners@avhomes.example | Demo, reserved `.example` domain |
| People and addresses (Chidinma Okafor, Tunde Bakare, Seyi Adeleke, Grace Obi, Musa Bello, Ifeoma Nwosu, Ngozi Okafor, Kemi Adebayo, Bola Adeyemi, Emeka Nwankwo, Halima Yusuf, Ada Eze, Yemi Alade) | Demo, @example.com or `.example` |
| Thread subjects, counts, dates and times | Demo, times relative to the capture (25 Sept 2026) |
| Folder counts, quotas | Demo |
| Signature "Adaeze Vincent, AV Homes" | The harness persona (owner) |

## Real

| On screen | Source |
|---|---|
| Every layout, label, button, toast ("Sending · Undo", "Message sent · View message"), the reply quoting, "Saved" | The product UI (`src/components/admin/mail/*`) |
| Futuless Manor, Life Camp, 3 bedroom apartment, ₦97,000,000, 50% deposit (₦48,500,000), ₦8,083,333 a month for 6 months | The live listing's public price and payment plan |
| `POST /mailboxes/{id}/send` on the Hostinger Mail API | `packages/settings/src/mailbox.ts` (route `POST /admin/mail/mailboxes/:mailbox/send` calls `hostingerRequest(key, "POST", "/mailboxes/{id}/send")`), base `https://api.mail.hostinger.com/api/v1` in `packages/core/src/hostinger.ts` |

## Treatment

- The request pill, its route line, click rings, focus dim and row tint are the showcase's own
  focus light, not product UI. The cursor is the harness arrow.
- ₦ renders in Liberation Sans (Arial's metric twin) through a `U+20A6` @font-face, as the
  product's `local("Arial")` fallback would on a machine that has Arial.
- The Sent list before the reply is the real after-capture with rows 2 and below lifted one row;
  its pager comes from a real capture of Sent before the send.
- Time is compressed: the pill leaves as Send is pressed, while the product waits out its undo window.
