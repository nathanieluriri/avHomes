import { MARK_KINDS, NOTE_KINDS, NOTE_STATUSES } from "@avhomes/contracts";
import { COLLECTIONS } from "../collections";
import { ensureCollection, ensureIndex, type Migration } from "../migrate";

const TS = { bsonType: ["long", "int", "double"] };
const INT = { bsonType: ["int", "long"] };
const NUM = { bsonType: ["int", "long", "double"] };
const STR = { bsonType: "string" };
const NULLABLE_STR = { bsonType: ["string", "null"] };

export const migration0006: Migration = {
  tag: "0006_design_notes",
  why: `The customize studio needs somewhere to put feedback. A note is a frozen
picture of a page with marks drawn over it and something said about it, plus the
trail of what happened to it afterwards.

The screenshot is the ANCHOR, and that was a real choice with a real cost. Pinning
a note to a CSS selector and a scroll offset follows the element through a copy
change, which is the appealing half; the other half is that the day a section is
rebuilt the selector matches nothing and the note becomes a comment floating over
an unrelated part of the page, with nothing to say it moved. A stale picture is
legible. A silently misplaced marker is worse than no marker at all.

\`marks\` are stored NORMALISED to 0..1 against the shot rather than in pixels,
because one note is drawn at three sizes: a sidebar thumbnail, a review pane and
full screen. Pixels would put the render scale into every one of those call sites
and the first that forgot would draw a circle beside the thing it was circling.

The shot itself is NOT stored here. It is an ordinary upload that went through
the media route's magic-byte sniffing like any other image, and this document
keeps its URL. A private second image path for screenshots would be a second
place to get storage limits, content sniffing and serving wrong.

\`events\` carries both status moves and replies, in one array, because they are
the same kind of fact about a note and splitting them into two collections
produces two half-stories a reader has to interleave by timestamp themselves.`,

  async up(db) {
    await ensureCollection(db, COLLECTIONS.designNotes, {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "path", "kind", "comment", "shotUrl", "status", "createdAt", "revision"],
        properties: {
          _id: STR,
          // The pathname only. A full URL carries a host that differs between a
          // preview deployment and production, which would split one page's
          // notes into two groups that never meet.
          path: STR,
          kind: { enum: [...NOTE_KINDS] },
          comment: STR,
          // Populated on a `copy` note: the words as they were, and as they
          // should be. Null on a markup note.
          copyBefore: NULLABLE_STR,
          copyAfter: NULLABLE_STR,
          shotUrl: STR,
          shotWidth: INT,
          shotHeight: INT,
          marks: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["kind", "points"],
              properties: {
                kind: { enum: [...MARK_KINDS] },
                color: STR,
                // Flat [x, y, x, y, ...], each in 0..1. See the header.
                points: { bsonType: "array", items: NUM },
              },
            },
          },
          attachments: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["kind", "url"],
              properties: {
                // Stills are uploaded through the image pipeline. Video is a
                // link, because a video store is a different problem from an
                // image store and a Loom URL is what people actually paste.
                kind: { enum: ["image", "link"] },
                url: STR,
                label: STR,
              },
            },
          },
          status: { enum: [...NOTE_STATUSES] },
          createdAt: TS,
          updatedAt: TS,
          createdBy: STR,
          createdByName: STR,
          events: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["id", "at", "kind", "text"],
              properties: {
                id: STR,
                at: TS,
                byName: STR,
                kind: { enum: ["comment", "status"] },
                text: STR,
              },
            },
          },
          revision: INT,
        },
      },
    });

    // The studio's default view: newest first, `_id` breaking ties at a shared
    // millisecond the same way every other listing in this system does.
    await ensureIndex(
      db,
      COLLECTIONS.designNotes,
      { createdAt: -1, _id: -1 },
      { name: "notes_created" },
    );
    // The two filters the sidebar offers, as compounds rather than two single
    // field indexes, because the sidebar always pages a filtered list.
    await ensureIndex(
      db,
      COLLECTIONS.designNotes,
      { status: 1, createdAt: -1, _id: -1 },
      { name: "notes_status" },
    );
    await ensureIndex(
      db,
      COLLECTIONS.designNotes,
      { path: 1, createdAt: -1, _id: -1 },
      { name: "notes_path" },
    );
  },
};
