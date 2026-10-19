import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "My purchases" };

export default function PurchasesLayout({ children }: { children: ReactNode }) {
  return children;
}
