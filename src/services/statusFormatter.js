const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SEVERITY_COLORS = {
  none: 0x2ECC71,
  minor: 0xF1C40F,
  major: 0xE67E22,
  critical: 0xE74C3C,
  maintenance: 0x3498DB,
};

const COMPONENT_EMOJI = {
  operational: '🟢',
  degraded_performance: '🟡',
  partial_outage: '🟠',
  major_outage: '🔴',
  under_maintenance: '🔵',
};

function colorForIndicator(indicator) {
  return SEVERITY_COLORS[indicator] ?? SEVERITY_COLORS.none;
}

function prettyStatus(s) {
  return String(s || '')
    .split('_')
    .map(word => word.length === 0 ? word : word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function buildSummaryEmbed(snapshot, { statusPageUrl }) {
  const indicator = snapshot.overall.indicator;
  const description = snapshot.overall.description || prettyStatus(indicator);
  const lines = snapshot.components.map(c => {
    const emoji = COMPONENT_EMOJI[c.status] ?? '⚪';
    return `${emoji}  **${c.name}** — ${prettyStatus(c.status)}`;
  });

  const activeIncidents = snapshot.incidents.filter(i => i.status !== 'resolved').length;
  const nowSecs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${COMPONENT_EMOJI[indicator === 'none' ? 'operational' : 'major_outage']} Poke Status — ${description}`)
    .setColor(colorForIndicator(indicator))
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Active Incidents', value: String(activeIncidents), inline: true },
      { name: 'Last Checked', value: `<t:${nowSecs}:R>`, inline: true },
    )
    .setFooter({ text: 'Data: status.poke.com' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open status page')
      .setStyle(ButtonStyle.Link)
      .setURL(statusPageUrl),
  );

  return { embed, row };
}

function buildIncidentEmbed(incident, { kind, statusPageUrl }) {
  const PREFIX = { new: '🚨 New Incident', update: 'ℹ️ Incident Update', resolved: '✅ Resolved' };
  const prefix = PREFIX[kind] ?? 'Incident';
  const latestUpdate = incident.updates?.[0];
  const createdSecs = incident.createdAt ? Math.floor(new Date(incident.createdAt).getTime() / 1000) : null;

  const indicatorForImpact = {
    critical: 'critical',
    major: 'major',
    minor: 'minor',
    none: 'none',
  }[incident.impact] ?? 'minor';

  const embed = new EmbedBuilder()
    .setTitle(`${prefix}: ${incident.name}`)
    .setColor(kind === 'resolved' ? SEVERITY_COLORS.none : colorForIndicator(indicatorForImpact))
    .setURL(incident.shortlink || statusPageUrl)
    .addFields(
      { name: 'Impact', value: prettyStatus(incident.impact || 'unknown'), inline: true },
      { name: 'Status', value: prettyStatus(incident.status || 'unknown'), inline: true },
    )
    .setTimestamp();

  if (createdSecs) {
    embed.addFields({ name: 'Created', value: `<t:${createdSecs}:R>`, inline: true });
  }
  if (latestUpdate?.body) {
    embed.setDescription(`> ${truncate(latestUpdate.body, 500)}`);
  }

  return embed;
}

function buildTransitionEmbed(transition, statusPageUrl) {
  const emojiPrev = COMPONENT_EMOJI[transition.prev] ?? '⚪';
  const emojiNext = COMPONENT_EMOJI[transition.next] ?? '⚪';
  const severity = transition.next === 'operational' ? 'none'
    : transition.next === 'degraded_performance' ? 'minor'
    : transition.next === 'partial_outage' ? 'major'
    : transition.next === 'major_outage' ? 'critical'
    : 'minor';

  return new EmbedBuilder()
    .setColor(colorForIndicator(severity))
    .setDescription(
      `${emojiNext} **${transition.name}**  ${emojiPrev} ${prettyStatus(transition.prev)} → ${emojiNext} ${prettyStatus(transition.next)}`,
    )
    .setTimestamp();
}

module.exports = {
  buildSummaryEmbed,
  buildIncidentEmbed,
  buildTransitionEmbed,
  colorForIndicator,
  prettyStatus,
  SEVERITY_COLORS,
  COMPONENT_EMOJI,
};
