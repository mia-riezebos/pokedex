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

const INDICATOR_EMOJI = {
  none: '🟢',
  minor: '🟡',
  major: '🟠',
  critical: '🔴',
  maintenance: '🔵',
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

function buildSummaryEmbed(snapshot, { statusPageUrl, userId, isPublic }) {
  const indicator = snapshot.overall.indicator;
  const description = snapshot.overall.description || prettyStatus(indicator);
  const lines = snapshot.components.map(c => {
    const emoji = COMPONENT_EMOJI[c.status] ?? '⚪';
    return `${emoji}  **${c.name}** — ${prettyStatus(c.status)}`;
  });

  const activeIncidents = snapshot.incidents.filter(i => i.status !== 'resolved');
  const nowSecs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${INDICATOR_EMOJI[indicator] ?? '⚪'} Poke Status — ${description}`)
    .setColor(colorForIndicator(indicator))
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Active Incidents', value: String(activeIncidents.length), inline: true },
      { name: 'Last Checked', value: `<t:${nowSecs}:R>`, inline: true },
    )
    .setFooter({ text: 'Data: status.poke.com' })
    .setTimestamp();

  const buttons = [
    new ButtonBuilder()
      .setLabel('Open status page')
      .setStyle(ButtonStyle.Link)
      .setURL(statusPageUrl),
  ];

  if (activeIncidents.length > 0 && userId) {
    const visibility = isPublic ? 'pub' : 'priv';
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`status_incidents_${userId}_${visibility}`)
        .setLabel(`View Incidents (${activeIncidents.length})`)
        .setStyle(ButtonStyle.Primary),
    );
  }

  const row = new ActionRowBuilder().addComponents(...buttons);

  return { embed, row };
}

function buildIncidentListEmbeds(snapshot, { statusPageUrl }) {
  const active = snapshot.incidents.filter(i => i.status !== 'resolved');
  if (active.length === 0) {
    return [new EmbedBuilder()
      .setTitle('No Active Incidents')
      .setColor(SEVERITY_COLORS.none)
      .setDescription('All systems are operating normally.')
      .setTimestamp()];
  }

  return active.map(incident => {
    const indicatorForImpact = {
      critical: 'critical', major: 'major', minor: 'minor', none: 'none',
    }[incident.impact] ?? 'minor';

    const createdSecs = incident.createdAt ? Math.floor(new Date(incident.createdAt).getTime() / 1000) : null;
    const updatedSecs = incident.updatedAt ? Math.floor(new Date(incident.updatedAt).getTime() / 1000) : null;

    const embed = new EmbedBuilder()
      .setTitle(`${INDICATOR_EMOJI[indicatorForImpact] ?? '🟡'} ${incident.name}`)
      .setColor(colorForIndicator(indicatorForImpact))
      .setURL(incident.shortlink || statusPageUrl)
      .addFields(
        { name: 'Impact', value: prettyStatus(incident.impact || 'unknown'), inline: true },
        { name: 'Status', value: prettyStatus(incident.status || 'unknown'), inline: true },
      )
      .setTimestamp();

    if (createdSecs) {
      embed.addFields({ name: 'Created', value: `<t:${createdSecs}:R>`, inline: true });
    }
    if (updatedSecs) {
      embed.addFields({ name: 'Last Updated', value: `<t:${updatedSecs}:R>`, inline: true });
    }

    // Show update timeline (most recent first, up to 5)
    const updates = (incident.updates || []).slice(0, 5);
    if (updates.length > 0) {
      const timeline = updates.map(u => {
        const ts = u.createdAt ? `<t:${Math.floor(new Date(u.createdAt).getTime() / 1000)}:R>` : '';
        const status = u.status ? `**${prettyStatus(u.status)}**` : '';
        const body = truncate(u.body || '', 200);
        return `${status} ${ts}\n> ${body}`;
      }).join('\n\n');
      embed.setDescription(truncate(timeline, 4000));
    }

    return embed;
  });
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
    : transition.next === 'under_maintenance' ? 'maintenance'
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
  buildIncidentListEmbeds,
  buildTransitionEmbed,
  colorForIndicator,
  prettyStatus,
  SEVERITY_COLORS,
  COMPONENT_EMOJI,
  INDICATOR_EMOJI,
};
