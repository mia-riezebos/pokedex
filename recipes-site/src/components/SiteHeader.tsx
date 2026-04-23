"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { INVITE_URL, DASHBOARD_URL, SITE_NAME } from "@/lib/constants";
import DiscordIcon from "@/components/DiscordIcon";

const NAV = [
  { href: "/recipes", label: "Recipes" },
  { href: "/feedback", label: "Feedback" },
  { href: DASHBOARD_URL, label: "Dashboard", external: true },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-bg-primary/70 border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-lg font-bold bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
            {SITE_NAME}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = !item.external && pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "text-gold bg-gold-glow"
                    : "text-gray-400 hover:text-gray-100 hover:bg-bg-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-gold to-gold-soft !text-[#0a0e17] hover:opacity-90 transition-opacity"
          >
            <DiscordIcon className="w-4 h-4" />
            <span>Add to Discord</span>
          </a>
        </nav>

        <button
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          className="md:hidden p-2 text-gray-400 hover:text-gray-100"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="site-mobile-nav"
          aria-label="Mobile"
          className="md:hidden border-t border-border px-4 py-3 space-y-1 bg-bg-primary/95"
        >
          {NAV.map((item) => {
            const active = !item.external && pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm ${
                  active ? "text-gold bg-gold-glow" : "text-gray-300 hover:bg-bg-hover"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 mt-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-gold to-gold-soft !text-[#0a0e17]"
          >
            <DiscordIcon className="w-4 h-4" />
            <span>Add to Discord</span>
          </a>
        </nav>
      )}
    </header>
  );
}
