"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Sheet } from "../Sheet";
import { Button } from "../ui";

/**
 * Photos that open full size: proof on a deal, the slip on a payment, a photo
 * the office sent in a reply. A receipt has to be read, so the sheet shows the
 * whole picture and offers the file itself for pinching in on.
 */
export function PhotoGallery({
  urls,
  name,
  variant = "grid",
}: {
  urls: readonly string[];
  /** What one photo is called: "Proof photo", "Transfer slip". */
  name: string;
  /** `row` is the small strip inside a chat bubble. */
  variant?: "grid" | "row";
}) {
  const [open, setOpen] = useState<number | null>(null);
  const grid = variant === "grid";

  return (
    <>
      <ul className={grid ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
        {urls.map((url, index) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={`Open ${name.toLowerCase()} ${index + 1} of ${urls.length}`}
              className={`m-press relative block overflow-hidden bg-m-raised ring-1 ring-white/10 ${
                grid ? "aspect-square w-full rounded-[14px]" : "h-16 w-16 rounded-[12px]"
              }`}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes={grid ? "(max-width: 30rem) 33vw, 10rem" : "64px"}
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <PhotoSheet urls={urls} index={open} onIndex={setOpen} name={name} />
    </>
  );
}

function PhotoSheet({
  urls,
  index,
  onIndex,
  name,
}: {
  urls: readonly string[];
  index: number | null;
  onIndex: (next: number | null) => void;
  name: string;
}) {
  const url = index === null ? undefined : urls[index];
  const at = index ?? 0;
  const many = urls.length > 1;

  return (
    <Sheet
      open={url !== undefined}
      onClose={() => onIndex(null)}
      title={many ? `${name} ${at + 1} of ${urls.length}` : name}
    >
      {url !== undefined && (
        <div>
          {/* The box takes the photo's own shape once it loads, up to the height a phone can show. */}
          <div className="grid place-items-center overflow-hidden rounded-[18px] bg-black/45 ring-1 ring-white/10">
            <Image
              key={url}
              src={url}
              alt={`${name} ${at + 1}`}
              width={1200}
              height={900}
              sizes="(max-width: 30rem) 100vw, 30rem"
              className="h-auto max-h-[60dvh] w-full object-contain"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            {many && (
              <Button
                variant="secondary"
                size="md"
                aria-label="Photo before"
                onClick={() => onIndex((at - 1 + urls.length) % urls.length)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="m-btn m-btn--secondary h-11 min-w-0 flex-1 px-4 text-[14px]"
            >
              <ExternalLink className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Open full size
            </a>
            {many && (
              <Button
                variant="secondary"
                size="md"
                aria-label="Next photo"
                onClick={() => onIndex((at + 1) % urls.length)}
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
