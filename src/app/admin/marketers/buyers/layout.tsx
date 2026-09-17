import type { Metadata } from "next";
import type { ReactNode } from "react";

/* `absolute`, for the same reason the Deals layout gives: the Marketers layout
   above sets a plain string, which carries no template to build on. */
export const metadata: Metadata = {
  title: { absolute: "Potential buyers | AVHomes console" },
};

export default function BuyersLayout({ children }: { children: ReactNode }) {
  return children;
}
