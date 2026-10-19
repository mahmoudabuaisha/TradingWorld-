import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "TradingWorld — AI Market Intelligence",
  description: "Explainable market analysis engine, chart, journal, academy and community for traders. Not a broker, not signals, no profit promises.",
};
export const viewport: Viewport = { themeColor: "#0b0c0f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
