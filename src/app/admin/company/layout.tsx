import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Company" };

export default function CompanyLayout({ children }: { children: ReactNode }) {
  return children;
}
