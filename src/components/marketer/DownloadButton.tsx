"use client";

import { Download, ExternalLink } from "lucide-react";
import { downloadLink } from "@avhomes/contracts";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./ui";

/** Saves the file where its host allows it, and opens it in a new tab where it does not. */
export function DownloadButton({
  url,
  name,
  variant = "secondary",
  size = "md",
  full = false,
  label = "Download",
}: {
  url: string;
  name: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  label?: string;
}) {
  if (!url) return null;
  const link = downloadLink(url, name);
  const className = buttonClass(variant, size, full, "gap-2");
  return link ? (
    <a href={link.href} download={link.filename} className={className}>
      <Download className="h-4 w-4" aria-hidden />
      {label}
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      <ExternalLink className="h-4 w-4" aria-hidden />
      Open
    </a>
  );
}
