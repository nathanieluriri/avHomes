"use client";

import { useEffect, useState } from "react";
import type { DesignNote, NoteMark } from "@avhomes/contracts";

/**
 * The screenshot with its marks burned in, as one PNG.
 *
 * On screen the marks are an SVG over the picture, so the browser's own Copy
 * image, Save image and a copied selection all took the bare screenshot.
 */
export async function markedShotBlob(note: DesignNote): Promise<Blob> {
  const image = new Image();
  // The shot lives on the image CDN. Without CORS the canvas is tainted and toBlob throws.
  image.crossOrigin = "anonymous";
  image.src = note.shotUrl;
  await image.decode();

  const width = image.naturalWidth || note.shotWidth;
  const height = image.naturalHeight || note.shotHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(image, 0, 0, width, height);

  // Matches the 3px the overlay draws at a typical ~400px wide review pane.
  ctx.lineWidth = Math.max(3, (width / 400) * 3);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const mark of note.marks) drawMark(ctx, mark, width, height);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

function drawMark(ctx: CanvasRenderingContext2D, mark: NoteMark, width: number, height: number) {
  const pt = (i: number): [number, number] => [(mark.points[i * 2] ?? 0) * width, (mark.points[i * 2 + 1] ?? 0) * height];
  ctx.strokeStyle = mark.color;
  ctx.beginPath();

  if (mark.kind === "pen") {
    for (let i = 0; i < mark.points.length / 2; i++) {
      const [x, y] = pt(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    const [x1, y1] = pt(0);
    const [x2, y2] = pt(1);
    if (mark.kind === "ellipse") {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    } else if (mark.kind === "rect") {
      ctx.roundRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), 4);
    } else {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(14, ctx.lineWidth * 4);
      const spread = Math.PI / 7;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2 - head * Math.cos(angle - spread), y2 - head * Math.sin(angle - spread));
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle + spread), y2 - head * Math.sin(angle + spread));
    }
  }
  ctx.stroke();
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface MarkedShot {
  blob: Blob;
  /** For the <img>, so a copied selection carries a picture that pastes anywhere. */
  dataUrl: string;
  /** For opening in a new tab, which browsers refuse for data: URLs. */
  objectUrl: string;
}

/** Null while composing, or for good if the CDN refuses CORS; callers keep the overlay then. */
export function useMarkedShot(note: DesignNote): MarkedShot | null {
  const key = `${note.id}:${note.shotUrl}:${note.marks.length}`;
  const [state, setState] = useState<{ key: string; shot: MarkedShot } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    markedShotBlob(note)
      .then(async (blob) => {
        const dataUrl = await asDataUrl(blob);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, shot: { blob, dataUrl, objectUrl } });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state?.key === key ? state.shot : null;
}
