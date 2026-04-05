import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Kotoba Search — Anime Quote Finder",
  description: "Cerca frasi anime in giapponese o romaji. Studia il vocabolario giapponese con i tuoi anime preferiti.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="antialiased">
        {/* Ambient background grid */}
        <div aria-hidden className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(167,139,250,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.02) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
        {/* Radial glow */}
        <div aria-hidden className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 70%)" }} />

        <NavBar />

        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
