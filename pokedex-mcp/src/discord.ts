// Discord REST + webhook helpers used by MCP tool handlers.
// Extracted from index.ts so handlers can import them and tests can stub
// global fetch to assert/intercept the network call.

export async function postContextToDiscord(
  issue: Record<string, unknown>,
  _issueId: string,
  context: string,
  author: string,
) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return;

  // Determine channel and message to edit (works for both pending and approved issues)
  const channelId = (issue.triageChannelId as string) || (issue.pendingChannelId as string);
  const messageId = (issue.triageMessageId as string) || (issue.pendingReplyMessageId as string);
  if (!channelId || !messageId) return;

  const headers = {
    Authorization: `Bot ${botToken}`,
    "Content-Type": "application/json",
  };

  try {
    // Fetch the existing message to get its current embeds
    const getRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, { headers });
    if (!getRes.ok) return;

    const msg = (await getRes.json()) as { embeds?: Array<Record<string, unknown>> };
    const embeds = msg.embeds || [];
    if (embeds.length === 0) return;

    // Update the first embed — add/replace the context field
    const embed = embeds[0];
    const fields = (embed.fields as Array<{ name: string; value: string; inline?: boolean }>) || [];

    // Remove any existing "💬 Context Added" field so we replace it with the latest
    const filtered = fields.filter((f: { name: string }) => !f.name.startsWith("💬"));
    filtered.push({ name: "💬 Context Added", value: `**${author}**: ${context.slice(0, 240)}` });
    embed.fields = filtered;
    embed.timestamp = new Date().toISOString();

    // PATCH the message with updated embed
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error("Discord context embed edit failed:", err);
  }
}

export async function postToDiscordWebhook(issue: Record<string, unknown>, issueId: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const PRIORITY_COLORS: Record<string, number> = {
    critical: 0xff0000,
    high: 0xff8c00,
    medium: 0xffd700,
    low: 0x00cc00,
  };

  const color = PRIORITY_COLORS[issue.priority as string] ?? 0x808080;

  const embed = {
    title: issue.summary as string,
    color,
    fields: [
      { name: "Priority", value: issue.priority as string, inline: true },
      { name: "Category", value: issue.category as string, inline: true },
      { name: "Reporter", value: issue.reporterName as string, inline: true },
      { name: "Source", value: "MCP Agent", inline: true },
      { name: "Description", value: (issue.text as string)?.slice(0, 1024) || "(no description)" },
    ],
    footer: { text: issue.number ? `Ticket #${issue.number} | Issue ID: ${issueId} | via Pokedex MCP` : `Issue ID: ${issueId} | via Pokedex MCP` },
    timestamp: new Date().toISOString(),
    ...(issue.screenshotUrl ? { image: { url: issue.screenshotUrl as string } } : {}),
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Pokedex",
        avatar_url: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/137.png",
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.error("Discord webhook failed:", err);
  }
}
