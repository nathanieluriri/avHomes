# AV Homes Mailboxes: storyboard

16 s, 1920x1080, 60 fps, silent, one take, seamless loop. Two real console screens on the board:
the Inbox (A, at 0,0) and Sent (B, at 4400,900), world px = CSS px x 2.5.

| Time (s) | Camera | Zoom | What the viewer reads |
|---|---|---|---|
| 15.0 to 1.2 (loop point inside) | Hero: the Inbox, tilted (rx 6, ry -5) | 0.445 to 0.456 | Mailboxes, three unread threads on top. The cursor comes in and opens Chidinma Okafor's thread (click 0.95). |
| 1.2 to 2.3 | Move in, flattening | to 0.785 | |
| 2.3 to 4.25 | Read hold | 0.785 to 0.795 | "Futuless Manor, 3 bedroom apartment" and the question about the 50% deposit plan. Cursor drifts to Reply, clicks (3.95). |
| 4.1 | The composer rises, the page behind dims to 45% | | |
| 4.25 to 5.25 | Pan down to the composer | 0.765 | |
| 5.25 to 7.85 | Compose hold | 0.765 to 0.78 | The reply is typed in four real steps (5.35, 5.85, 6.45, 7.0): the price, deposit, monthly plan and a Saturday viewing. Send hovers (7.5), clicks (7.62). |
| 7.7 | Composer closes, "Sending · Undo" toast | | |
| 7.68 to 9.7 | The Send button widens into the request pill "Hostinger POST /mailboxes/{id}/send" and flies at constant speed to Sent; camera rides it (pass key 8.8, zoom 0.44) | 0.78 to 0.44 to 0.862 | The pill label |
| 9.22 | Sent's rows make room | | |
| 9.7 to 11.6 | Sent hold | 0.8615 to 0.875 | The pill unfolds into the new first row: "Chidinma, me 2 · Re: Futuless Manor, 3 bedroom apartment", wine tint kept. |
| 9.9 | (off frame) the toast turns to "Message sent · View message" | | |
| 11.6 to 13.1 | One continuous pull-back (pass key 12.35) | 0.875 to 0.18 | |
| 13.1 to 14.0 | Overview, tilted | 0.18 to 0.186 | Both screens and the connector between them. |
| 14.0 to 15.0 | Ease into the hero | to 0.445 | |

Peak pan 1444 px/s. Zoom per move at most 2.39x. Text at reading holds: 14 px body at 0.785 to 0.8
(27.5 to 28 px), 13 px Sent list at 0.8615 (28 px).

## Seam and resets

| Time (s) | Reset | Why unseen |
|---|---|---|
| 10.6 | Inbox back to the list: thread, composer stages, toasts hidden | Camera on Sent, Inbox fully left of frame |
| 14.05 to 14.65 | Connector line fades | Leaving the overview |
| 15.5 | Sent back to its old list, route, pill, row tint | Hero hold, Sent right of frame (x 2084 px and beyond) |

Frame 0 equals frame 960: the loop point sits inside the hero hold, pose(0) = pose(16) exactly.
