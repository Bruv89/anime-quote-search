import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anime Quote Search | 言葉を探せ",
  description:
    "Search exact quotes from your favourite anime — in Japanese or Romaji.",
  keywords: ["anime", "quotes", "subtitles", "japanese", "search", "manga"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {/* Ambient background grid */}
        <div
          aria-hidden
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(167,139,250,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.025) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Radial glow at top */}
        <div
          aria-hidden
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.12) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
