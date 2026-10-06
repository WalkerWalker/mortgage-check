import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mortgage application check",
  description:
    "Check a Swiss mortgage dossier against the rule sheet, propose a decision, draft the Kreditantrag.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
