import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ChatProvider } from "@/lib/chat/provider";
import { getSiteSettings } from "@/lib/data";

/**
 * The site's chrome for the admin preview, and nothing that reports.
 *
 * Its own group rather than a page under `(site)`, because that layout also
 * mounts the visit beacon, the cookie banner and the chat bubble: a preview
 * would count as storefront traffic and could open a real conversation.
 */
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteSettings();
  return (
    <ChatProvider>
      <Navbar contactEmail={site.contactEmail} social={site.social} />
      <main className="flex-1">{children}</main>
      <Footer social={site.social} />
    </ChatProvider>
  );
}
