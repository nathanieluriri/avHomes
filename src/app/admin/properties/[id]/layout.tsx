import type { Metadata } from "next";
import type { ReactNode } from "react";

/*
 * The editor names itself, rather than inheriting "Listings" from the section
 * above it. Without this a list tab and an open listing carried the same title,
 * which is the failure the metadata split in src/app/admin/layout.tsx exists to
 * prevent.
 *
 * A static string and not the listing's own title: reading that here would mean
 * a server side fetch of an endpoint that requires the operator's session
 * cookie, which is a round trip and a cookie-forwarding path bought for a tab
 * label. "Editing a listing" is enough to tell two tabs apart.
 */
/*
 * `absolute`, and spelled out in full, because the template does not reach this
 * far. A `title.template` applies to a segment's children, but the Listings
 * layout above sets a plain string, and a plain string carries no template of
 * its own, so a bare title here rendered as "Editing a listing" with the
 * console's name dropped. Absolute is the one form that cannot be affected by
 * what any ancestor did.
 */
export const metadata: Metadata = {
  title: { absolute: "Editing a listing | AVHomes console" },
};

export default function ListingEditorLayout({ children }: { children: ReactNode }) {
  return children;
}
