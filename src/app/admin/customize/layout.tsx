import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Absolute, like the two editors: this screen takes the whole window, so the
   "| AVHomes console" suffix is naming a frame that is not on screen. */
export const metadata: Metadata = { title: { absolute: "Customize | AVHomes" } };

export default function CustomizeLayout({ children }: { children: ReactNode }) {
  return children;
}
