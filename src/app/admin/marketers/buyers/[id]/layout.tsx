import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "Potential buyer | AVHomes console" },
};

export default function BuyerLayout({ children }: { children: ReactNode }) {
  return children;
}
