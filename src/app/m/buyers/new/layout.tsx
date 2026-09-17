import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Log a buyer" };

export default function NewBuyerLayout({ children }: { children: ReactNode }) {
  return children;
}
