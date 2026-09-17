import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Your buyers" };

export default function BuyersLayout({ children }: { children: ReactNode }) {
  return children;
}
