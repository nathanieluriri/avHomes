import type { Metadata } from "next";
import type { ReactNode } from "react";

/* Absolute, because the Enquiries layout above sets a plain string and a plain
   string carries no template onward. See src/app/admin/layout.tsx. */
export const metadata: Metadata = {
  title: { absolute: "Enquiry | AVHomes console" },
};

export default function EnquiryDetailLayout({ children }: { children: ReactNode }) {
  return children;
}
