import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Tutorials" };

export default function TutorialsLayout({ children }: { children: ReactNode }) {
  return children;
}
