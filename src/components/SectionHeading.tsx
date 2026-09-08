import { ReactNode } from "react";

/**
 * Centered section heading in the house style: small wine eyebrow, then a
 * two-tone headline where the emphasis half is italic serif.
 */
export default function SectionHeading({
  eyebrow,
  lead,
  accent,
  sub,
  align = "center",
}: {
  eyebrow?: string;
  lead: string;
  accent?: string;
  sub?: ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-3xl font-bold leading-[1.15] tracking-tight text-plum-950 sm:text-4xl lg:text-[2.75rem]">
        {lead}
        {accent && (
          <>
            {" "}
            <span className="accent">{accent}</span>
          </>
        )}
      </h2>
      {sub && (
        <p className={`mt-4 text-base leading-relaxed text-muted-foreground ${centered ? "mx-auto" : ""}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
