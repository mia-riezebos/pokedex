import type { Metadata } from "next";
import { CONTACT_DISCORD_HANDLE, SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Terms of Service — ${SITE_NAME}`,
  description: `Terms of Service for the ${SITE_NAME} Discord bot.`,
};

const EFFECTIVE = "April 23, 2026";

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 prose prose-invert">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gold to-gold-soft bg-clip-text text-transparent">
          Terms of Service
        </h1>
        <p className="text-xs text-gray-600 mt-2">Effective {EFFECTIVE}</p>
      </header>

      <Section title="1. Acceptance">
        By inviting, installing, or using the {SITE_NAME} Discord bot (the &quot;Service&quot;), you
        agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        These Terms apply to server administrators who install the bot and to end users who interact
        with it.
      </Section>

      <Section title="2. Description of Service">
        {SITE_NAME} is a Discord bot that provides AI-assisted issue triage, automated moderation,
        community tools (recipes, feedback, leveling), and a server administration dashboard. The
        Service is provided free of charge and is offered &quot;as is&quot; without warranty of any
        kind.
      </Section>

      <Section title="3. Acceptable Use">
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate Discord&apos;s{" "}
            <a href="https://discord.com/terms" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{" "}
            or{" "}
            <a href="https://discord.com/guidelines" target="_blank" rel="noopener noreferrer">
              Community Guidelines
            </a>.
          </li>
          <li>Harass, abuse, dox, or harm other users.</li>
          <li>Spam, flood, or otherwise abuse the bot&apos;s commands or AI features.</li>
          <li>Attempt to reverse-engineer, exploit, or disrupt the Service.</li>
          <li>Engage in any unlawful activity.</li>
        </ul>
        <p>
          Server administrators are responsible for the conduct of users in their servers and for
          configuring the bot in accordance with applicable laws.
        </p>
      </Section>

      <Section title="4. AI-Generated Content">
        The Service uses third-party AI models to classify, summarize, and respond to messages. AI
        outputs may contain inaccuracies. Do not rely on AI-generated content for safety-critical,
        legal, medical, or financial decisions. We are not liable for actions taken based on
        AI-generated content.
      </Section>

      <Section title="5. User Content">
        You retain ownership of any content you submit through the Service. By using the Service,
        you grant us a limited, non-exclusive license to process, store, and display your content
        solely for the purpose of operating the Service. See the{" "}
        <a href="/privacy" className="text-gold hover:underline">Privacy Policy</a> for details.
      </Section>

      <Section title="6. Availability and Modifications">
        We may modify, suspend, or discontinue the Service or any feature at any time, with or
        without notice. We are not liable for any modification, suspension, or discontinuation. We
        do not guarantee uptime, availability, or that the Service will be error-free.
      </Section>

      <Section title="7. Termination">
        We may suspend or terminate access to the Service for any user or server that violates these
        Terms or that abuses the Service. You may stop using the Service at any time by removing the
        bot from your server.
      </Section>

      <Section title="8. Disclaimer of Warranties">
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF
        ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
        WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
      </Section>

      <Section title="9. Limitation of Liability">
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE OPERATORS OF THE SERVICE BE
        LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY
        LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE
        SERVICE.
      </Section>

      <Section title="10. Indemnification">
        You agree to indemnify and hold harmless the operators of the Service from any claims,
        damages, or expenses arising out of your use of the Service or your violation of these
        Terms.
      </Section>

      <Section title="11. Governing Law">
        These Terms are governed by the laws of the United States and the State of New York,
        without regard to conflict-of-law principles. Any disputes arising out of these Terms shall
        be resolved exclusively in the state or federal courts located in New York, NY.
      </Section>

      <Section title="12. Changes to These Terms">
        We may update these Terms from time to time. The &quot;Effective&quot; date at the top of
        this page indicates when the latest version took effect. Continued use of the Service after
        changes constitutes acceptance of the updated Terms.
      </Section>

      <Section title="13. Contact">
        For questions about these Terms, contact{" "}
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
