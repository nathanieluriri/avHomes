import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Spectral, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
  title: "AVHomes | Buy. Sell. Rent.",
  description:
    "AVHomes lists vetted homes across Lagos and Abuja, backed by the build quality of AV Constructions.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${spectral.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
