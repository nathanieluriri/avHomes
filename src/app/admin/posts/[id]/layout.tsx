import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Absolute, for the same reason the listing editor's is. See
   src/app/admin/layout.tsx. */
export const metadata: Metadata = {
  title: { absolute: "Editing a post | AVHomes console" },
};

export default function PostEditorLayout({ children }: { children: ReactNode }) {
  return children;
}
