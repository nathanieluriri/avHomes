import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Spectral, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { SITE_DOMAIN } from "@/lib/api-config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// preload:false keeps six Spectral files out of the head of every shop page
// that never draws a serif glyph. The blog is the only consumer.
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  preload: false,
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  /*
   * Every `alternates.canonical` and `openGraph.url` written as a path in this
   * tree resolves against this. Without it Next emits the path unchanged, and a
   * canonical or an og:url that is not absolute is one a crawler discards.
   *
   * It comes from the deployment rather than a constant, so a preview names
   * itself and production names the stable alias. See SITE_DOMAIN.
   */
  metadataBase: new URL(SITE_DOMAIN),
  title: "AVHomes | Buy. Sell. Rent.",
  description:
    "AVHomes lists vetted homes across Lagos and Abuja, backed by the build quality of AV Constructions.",
  alternates: { canonical: "/" },
};

/**
 * The viewport, and two of these four values do real work on a phone.
 *
 * `viewportFit: "cover"` is the one everything else waits on. Without it every
 * `env(safe-area-inset-*)` in the tree resolves to 0, so a padding written
 * against the home indicator is not a weak fix, it is no fix at all. The
 * console's save bar and its bottom sheets both read those insets, so this line
 * has to exist before any of them mean anything.
 *
 * `interactiveWidget: "resizes-content"` makes Chromium shrink the layout
 * viewport when the on-screen keyboard opens, which by itself puts the save bar
 * back above the keyboard on Android. iOS does not honour it and is handled
 * separately, by `useKeyboardInset` publishing a measured `--c-kb`.
 *
 * No `maximumScale` and no `userScalable: false`. Locking zoom is the usual way
 * to dodge iOS's focus-zoom on a sub-16px input, and it pays for that by taking
 * pinch-zoom away from everybody, permanently, on a console whose meta lines
 * are 12px. The zoom is solved where it belongs instead, by raising input text
 * to 16px on coarse pointers only.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/**
 * html, body, fonts and globals only.
 *
 * The marketing chrome lives in the (site) route group's layout, because one here
 * composes into EVERY route and the admin console is not a marketing page. With
 * the navbar at this level the admin rendered a "Find Property" button over its
 * own sign-in form, and no child could opt out.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /*
       * Next warns when `scroll-behavior: smooth` is set on <html> in CSS,
       * because it silently changes how the router restores scroll position.
       * This attribute is the framework's own way of saying the smoothness is
       * deliberate, and it clears the warning that was logged on every page.
       */
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${spectral.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
