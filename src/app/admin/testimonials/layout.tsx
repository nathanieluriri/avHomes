import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Testimonials" };

export default function TestimonialsLayout({ children }: { children: ReactNode }) {
  return children;
}
