import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Names the tab. The console's screens are client components and cannot export
   metadata themselves, so each section carries a one line server layout. See
   src/app/admin/layout.tsx for the argument. */
export const metadata: Metadata = { title: "Sign in" };

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
