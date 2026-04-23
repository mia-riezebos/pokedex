import type { Metadata } from "next";
import { CONTACT_DISCORD_HANDLE, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE_NAME}`,
  description: `How the ${SITE_NAME} Discord bot collects, uses, and stores data.`,
};

const EFFECTIVE = "April 23, 2026";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 prose prose-invert">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent">
          Privacy Policy
        </h1>
        <p className="text-xs text-gray-600 mt-2">Effective {EFFECTIVE}</p>
      </header>

      <Section title="1. Overview">
        This Privacy Policy explains what data the {SITE_NAME} Discord bot (the &quot;Service&quot;)
        collects, how it is used, and what controls you have. The Service is operated for community
        use and does not sell user data.
      </Section>

      <Section title="2. What we collect">
        <p>The Service collects only the data necessary to operate. Specifically:</p>
        <ul>
          <li>
            <strong>Discord IDs</strong> — server (guild) IDs, channel IDs, user IDs, message IDs,
            thread IDs, and role IDs needed to route bot interactions.
          </li>
          <li>
            <strong>Message content</strong> — only when a message is explicitly submitted to the
            bot (you @mention it, react with 🐛 / 💡, post in a tracked forum, or invoke a slash
            command). The bot does not log or store ambient conversation.
          </li>
          <li>
            <strong>Triage metadata</strong> — for messages submitted to the bot: the AI-generated
            category, priority, summary, and status of the resulting issue.
          </li>
          <li>
            <strong>Moderation events</strong> — automod actions (warnings, timeouts, kicks) and
            their reasons, used for audit and to prevent abuse.
          </li>
          <li>
            <strong>Optional features</strong> — XP totals, AFK status, leaderboard entries,
            reaction-role mappings — only when those features are enabled by a server admin and
            opted into by the user.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use the data">
        <ul>
          <li>To classify and triage issues with AI assistance.</li>
          <li>To detect duplicate issues and group related reports.</li>
          <li>To enforce server-defined moderation rules.</li>
          <li>To display public community features (Recipes, Feedback) on this website when a
            server has enabled them.</li>
          <li>To operate the dashboard for authorized server administrators.</li>
        </ul>
      </Section>

      <Section title="4. Where data is stored">
        Data is stored in Google Firebase / Cloud Firestore in the United States. Access is
        restricted to operators of the Service.
      </Section>

      <Section title="5. Third parties">
        <p>The Service uses the following third-party processors:</p>
        <ul>
          <li>
            <strong>Discord</strong> — to receive and send messages. See Discord&apos;s{" "}
            <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>.
          </li>
          <li>
            <strong>Google Firebase / Firestore</strong> — for data storage. See Google&apos;s{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>.
          </li>
          <li>
            <strong>OpenRouter</strong> — for AI classification of submitted messages. Submitted
            content is sent to OpenRouter for inference. See OpenRouter&apos;s{" "}
            <a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>.
          </li>
          <li>
            <strong>Vercel</strong> — for hosting this website and dashboard.
          </li>
        </ul>
        <p>We do not sell data to third parties or use it for advertising.</p>
      </Section>

      <Section title="6. Public content">
        Recipes and feedback that an authorized member of your server marks as &quot;approved&quot;
        or &quot;published&quot; may appear on the public sections of this website (
        <a href="/recipes" className="text-gold hover:underline">/recipes</a>,{" "}
        <a href="/feedback" className="text-gold hover:underline">/feedback</a>). Author display
        name and message content of those approved/published items are visible publicly. If you do
        not want your post to be public, ask a server moderator to remove or unpublish it.
      </Section>

      <Section title="7. Data retention">
        Issues, recipes, and feedback are retained until a server administrator deletes them or
        removes the bot. AutoMod events are retained for up to 90 days. Aggregate, non-identifying
        statistics may be retained longer.
      </Section>

      <Section title="8. Your rights">
        <p>You may request to:</p>
        <ul>
          <li>Access the data the Service holds about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Delete your data from our systems.</li>
          <li>Opt out of optional features (XP, leaderboard) where supported.</li>
        </ul>
        <p>
          To exercise these rights, contact{" "}
          <span className="text-gold">@{CONTACT_DISCORD_HANDLE}</span> on Discord. Server
          administrators can also delete data directly through the dashboard.
        </p>
      </Section>

      <Section title="9. Children">
        The Service is not directed at children under 13 (or under 16 in the EU/UK). Discord
        requires users to meet its minimum-age requirement. If you believe a child has provided
        data to the Service, contact us and we will delete it.
      </Section>

      <Section title="10. Security">
        We use industry-standard practices (TLS in transit, access controls, secret management) to
        protect data. No system is perfectly secure; we cannot guarantee absolute security.
      </Section>

      <Section title="11. Changes to this policy">
        We may update this Privacy Policy. The &quot;Effective&quot; date at the top of this page
        indicates the most recent revision. Continued use of the Service constitutes acceptance of
        the updated policy.
      </Section>

      <Section title="12. Contact">
        For privacy questions or data requests, contact{" "}
        <span className="text-gold">@{CONTACT_DISCORD_HANDLE}</span> on Discord.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
