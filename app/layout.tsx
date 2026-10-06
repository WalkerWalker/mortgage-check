import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

/**
 * A high-contrast serif for the headlines and a neutral grotesque for
 * everything else. Self-hosted by next/font at build time, so there is no
 * runtime dependency on a font CDN.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Can you get this mortgage?",
  description:
    "Check a Swiss mortgage dossier against the lending rules and see what it would take.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
