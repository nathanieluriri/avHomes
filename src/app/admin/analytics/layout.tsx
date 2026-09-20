import type { ReactNode } from "react";

/**
 * The analytics section.
 *
 * A layout with nothing in it but the children, deliberately. Every page here
 * draws its own `PageHeader` with its own one question, and a shared sub-nav
 * above them would be a second navigation to keep in agreement with the sidebar
 * that already lists these six.
 */
export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
