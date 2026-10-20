import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "TradingWorld",
  description:
    "Explainable market analysis engine, chart, journal, academy and community for traders. Not a broker, not signals, no profit promises.",
};
export const viewport: Viewport = { themeColor: "#13181b", width: "device-width", initialScale: 1 };

/** Applies the persisted theme before first paint so night/day never flashes. */
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('tw-app')||'{}').state||{};var t=s.theme||'night';var r=document.documentElement;if(t==='night')r.setAttribute('data-theme','dark');else if(t==='day')r.setAttribute('data-theme','light');else r.removeAttribute('data-theme');var l=s.locale||'ar';r.lang=l;r.dir=l==='ar'?'rtl':'ltr';if(s.palette==='classic')r.setAttribute('data-palette','classic');else r.removeAttribute('data-palette');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
