import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Names the tab. The screen is a client component and cannot export metadata. */
export const metadata: Metadata = { title: "Mailboxes" };

export default function MailLayout({ children }: { children: ReactNode }) {
  return children;
}
