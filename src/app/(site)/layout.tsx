import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import SitePulse from "@/components/SitePulse";
import ChatWidget from "@/components/chat/ChatWidget";
import { ChatProvider } from "@/lib/chat/provider";

/**
 * The marketing site's chrome.
 *
 * It lives in a route GROUP rather than in the root layout, because Next.js
 * composes layouts downward and there is no way for a child to opt out of one.
 * With the navbar, footer and cookie banner at the root, the admin console
 * rendered a "Find Property" button and a consent banner over its own sign-in
 * form. The group is the only way to say "these routes, and not those".
 *
 * The root layout keeps html, body, fonts and globals, which every route wants.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * The chat provider wraps the whole group rather than sitting beside it,
     * because "Contact agent" on a listing page has to be able to reach the same
     * conversation state the floating widget is showing. Two of them would mean
     * two pollers and two answers to "do I have an unread message".
     *
     * It is inside the site group and not the root layout for the same reason
     * the navbar is: the console has its own inbox and must not grow a customer
     * chat bubble over its sign-in form.
     */
    <ChatProvider>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <CookieBanner />
      {/* Counts storefront visits only, and only once the banner above is accepted. */}
      <SitePulse />
      {/* Last, so it paints over everything, and portalled to the body from
          inside so a transformed section cannot become its containing block. */}
      <ChatWidget />
    </ChatProvider>
  );
}
