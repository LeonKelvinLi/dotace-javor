import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
export const metadata: Metadata = {
  title: "Dotace · Sportovní federace Javor",
  description:
    "Přehledné vyúčtování dotací. Smlouvy, doklady a kontrola na jednom místě.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
