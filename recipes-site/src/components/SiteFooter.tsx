import Link from "next/link";
import { CONTACT_DISCORD_HANDLE, DASHBOARD_URL, INVITE_URL, SITE_NAME } from "@/lib/constants";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 md:col-span-1">
          <div className="text-gold font-semibold">{SITE_NAME}</div>
          <p className="text-gray-500 mt-2 text-xs leading-relaxed">
            AI-assisted triage, moderation, and community tools for your Discord server.
          </p>
        </div>

        <div>
          <div className="text-gray-300 font-medium mb-3">Product</div>
          <ul className="space-y-2 text-gray-500">
            <li><Link href="/recipes" className="hover:text-gold transition-colors">Recipes</Link></li>
            <li><Link href="/feedback" className="hover:text-gold transition-colors">Feedback</Link></li>
            <li>
              <a href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">
                Dashboard
              </a>
            </li>
            <li>
              <a href={INVITE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">
                Add to Discord
              </a>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-gray-300 font-medium mb-3">Legal</div>
          <ul className="space-y-2 text-gray-500">
            <li><Link href="/terms" className="hover:text-gold transition-colors">Terms of Service</Link></li>
            <li><Link href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-gray-300 font-medium mb-3">Contact</div>
          <ul className="space-y-2 text-gray-500">
            <li>
              <span className="text-gray-400">@{CONTACT_DISCORD_HANDLE}</span>
              <span className="block text-xs text-gray-600">on Discord</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-[11px] text-gray-600 flex justify-between items-center">
          <span>© {year} {SITE_NAME}</span>
          <span>Not affiliated with Discord Inc.</span>
        </div>
      </div>
    </footer>
  );
}
