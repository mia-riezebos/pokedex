import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

function resolveMetadataBase(): URL {
  const fallback = new URL("http://localhost:3001");
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!raw) return fallback;
  // Normalize: add https:// if the value is missing a protocol.
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(normalized);
  } catch {
    return fallback;
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "Pokedex — AI-assisted Discord triage, moderation & community tools",
  description:
    "Pokedex is a Discord bot for AI-powered issue triage, automated moderation, and community features like recipes and feedback.",
  openGraph: {
    title: "Pokedex — Discord bot",
    description:
      "AI-powered issue triage, automated moderation, and community features for your Discord server.",
    type: "website",
    siteName: "Pokedex",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pokedex — Discord bot",
    description:
      "AI-powered issue triage, automated moderation, and community features for your Discord server.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-gray-100 min-h-screen antialiased font-sans">
        {/* Ambient orbs */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="orb w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(240,200,64,0.15),transparent_70%)] -top-[200px] -left-[100px] absolute" />
          <div className="orb w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(99,102,241,0.1),transparent_70%)] -bottom-[150px] -right-[100px] absolute" style={{ animationDelay: "-7s" }} />
          <div className="orb w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(16,185,129,0.08),transparent_70%)] top-[40%] left-[50%] absolute" style={{ animationDelay: "-14s" }} />
        </div>

        <div className="relative z-10 flex flex-col min-h-screen">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
