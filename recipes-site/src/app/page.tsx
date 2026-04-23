import Link from "next/link";
import { INVITE_URL, DASHBOARD_URL } from "@/lib/constants";
import DiscordIcon from "@/components/DiscordIcon";

const FEATURES = [
  {
    icon: "🧠",
    title: "AI Issue Triage",
    body: "@mention the bot or react with 🐛 / 💡 — issues are auto-classified, deduplicated, and stored.",
  },
  {
    icon: "🛡️",
    title: "AutoMod",
    body: "Spam, raid, caps, invites, and content blocklist — all configurable per server.",
  },
  {
    icon: "🔨",
    title: "Moderation Tools",
    body: "Kick, ban, warn, timeout, purge, lock, slowmode — from chat or the dashboard.",
  },
  {
    icon: "🍳",
    title: "Community Recipes",
    body: "Auto-scrapes builds and recipes shared in your server into a public, searchable hub.",
  },
  {
    icon: "💬",
    title: "Community Feedback",
    body: "Forum threads sync into a published feedback board with categories and priorities.",
  },
  {
    icon: "✨",
    title: "XP & Leveling",
    body: "Reward active members with XP and level-up notifications.",
  },
  {
    icon: "📡",
    title: "Status & Incidents",
    body: "Track upstream service incidents and surface them in your server.",
  },
  {
    icon: "📊",
    title: "Web Dashboard",
    body: "Full server admin dashboard for triage queue, automod config, and moderation actions.",
  },
];

const STEPS = [
  { n: "1", label: "Invite the bot", body: "One-click OAuth — pick your server and confirm permissions." },
  { n: "2", label: "Mention or react", body: "@Pokedex on a message — or drop a 🐛 / 💡 reaction." },
  { n: "3", label: "Triage in the dashboard", body: "AI sorts, deduplicates, and routes everything to your dashboard." },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-[11px] text-gold/80 uppercase tracking-wider mb-6 fade-up">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          AI-assisted Discord operations
        </div>
        <h1
          className="text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight bg-gradient-to-br from-gold via-gold-soft to-gold/60 bg-clip-text text-transparent fade-up"
          style={{ animationDelay: "60ms" }}
        >
          Run your Discord server
          <br />
          on autopilot.
        </h1>
        <p
          className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-gray-400 fade-up"
          style={{ animationDelay: "120ms" }}
        >
          Pokedex is a Discord bot for AI-powered issue triage, automated moderation, and community
          tools — purpose-built for active servers that want less manual work and more signal.
        </p>
        <div
          className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-gold to-gold-soft !text-[#0a0e17] hover:opacity-90 transition-opacity shadow-lg shadow-gold/20"
          >
            <DiscordIcon className="w-5 h-5" />
            <span>Add to Discord</span>
          </a>
          <a
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-xl text-sm font-semibold glass text-gray-200 hover:bg-bg-hover transition-colors"
          >
            Open Dashboard
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-100">Everything in one bot</h2>
          <p className="text-sm text-gray-500 mt-2">No separate plugins. No paid tier. Just install and configure.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass rounded-xl p-5 fade-up hover:bg-bg-hover transition-colors"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="text-sm font-semibold text-gray-100">{f.title}</div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-100">How it works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="glass rounded-xl p-6 relative fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-gradient-to-br from-gold to-gold-soft text-bg-primary text-sm font-bold flex items-center justify-center">
                {s.n}
              </div>
              <div className="text-sm font-semibold text-gray-100 mt-2">{s.label}</div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live community section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/recipes"
            className="glass rounded-xl p-6 hover:bg-bg-hover transition-colors group"
          >
            <div className="text-xs text-gold/70 uppercase tracking-wider">Live</div>
            <div className="text-lg font-semibold text-gray-100 mt-1 group-hover:text-gold transition-colors">
              Community Recipes →
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Browse builds and recipes shared by Pokedex-powered communities.
            </p>
          </Link>
          <Link
            href="/feedback"
            className="glass rounded-xl p-6 hover:bg-bg-hover transition-colors group"
          >
            <div className="text-xs text-gold/70 uppercase tracking-wider">Live</div>
            <div className="text-lg font-semibold text-gray-100 mt-1 group-hover:text-gold transition-colors">
              Community Feedback →
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Real-time feedback synced from #feedback forums in active servers.
            </p>
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent">
          Ready to install?
        </h2>
        <p className="mt-4 text-sm text-gray-500">
          Free, open source, and self-hostable. Bring it into your server in under a minute.
        </p>
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-8 px-8 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-gold to-gold-soft !text-[#0a0e17] hover:opacity-90 transition-opacity shadow-lg shadow-gold/20"
        >
          <DiscordIcon className="w-5 h-5" />
          <span>Add Pokedex to Discord</span>
        </a>
      </section>
    </div>
  );
}
