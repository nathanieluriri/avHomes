import type { Metadata } from "next";
import type { ReactNode } from "react";

/*
 * `absolute`, because the template does not reach this far. The Marketers
 * layout above sets a plain string, a plain string carries no template of its
 * own, and a bare title here would render without the console's name. See
 * src/app/admin/properties/[id]/layout.tsx for the full argument.
 */
export const metadata: Metadata = {
  title: { absolute: "Pay day | AVHomes console" },
};

export default function PayLayout({ children }: { children: ReactNode }) {
  return children;
}
