import type { Metadata } from "next";
import PreviewApp from "@/components/listing/PreviewApp";

export const metadata: Metadata = {
  title: "Listing preview",
  robots: { index: false, follow: false },
};

/**
 * Where the editor's preview sheet points its frame. It shows nothing on its
 * own: the listing arrives from the editor by postMessage, unsaved changes
 * included, and never touches the database from here.
 */
export default function ListingPreviewPage() {
  return <PreviewApp />;
}
