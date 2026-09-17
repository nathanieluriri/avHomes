import type { Metadata } from "next";
import type { ReactNode } from "react";

/* The page is a client component and cannot export metadata, so the tab title
   is set here. `robots` is inherited from the `/m` layout. */
export const metadata: Metadata = { title: "Your account" };

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
