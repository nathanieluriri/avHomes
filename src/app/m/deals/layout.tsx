import type { Metadata } from "next";
import type { ReactNode } from "react";

/* The pages are client components and cannot export metadata, so the tab title
   is set here. `robots` is inherited from the `/m` layout. */
export const metadata: Metadata = { title: "Your deals" };

export default function DealsLayout({ children }: { children: ReactNode }) {
  return children;
}
