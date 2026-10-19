import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Marketing tools" };

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return children;
}
