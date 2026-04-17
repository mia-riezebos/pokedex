'use strict';

const cron = require('node-cron');
const { normalize, diff } = require('./statusDiff');
const {
  buildSummaryEmbed,
  buildIncidentEmbed,
  buildTransitionEmbed,
} = require('./statusFormatter');

const ERR_UNKNOWN_MESSAGE = 10008;
const ERR_UNKNOWN_CHANNEL = 10003;
const ERR_MISSING_PERMS = 50013;

function createPoller({ client, fetcher, store, config, logger = console }) {
  let cronTask = null;

  function statusPageUrl() {
    const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
    try { return new URL(apiUrl).origin; } catch { return 'https://status.poke.com'; }
  }

  async function applyToGuild(guildRecord, rawSummary) {
    const channelId = guildRecord.channelId;
    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      if (err?.code === ERR_UNKNOWN_CHANNEL) {
        logger.info(`[status] channel ${channelId} gone for guild ${guildRecord.id}; disabling`);
        await store.disable(guildRecord.id);
        return;
      }
      logger.warn(`[status] failed to fetch channel ${channelId}: ${err?.message}`);
      return;
    }
    if (!channel) {
      logger.info(`[status] channel ${channelId} not found; disabling guild ${guildRecord.id}`);
      await store.disable(guildRecord.id);
      return;
    }

    const nextSnap = normalize(rawSummary);
    const prevSnap = guildRecord.lastSummary ? normalize(guildRecord.lastSummary) : null;
    const d = diff(prevSnap, nextSnap);
    const pageUrl = statusPageUrl();

    const { embed, row } = buildSummaryEmbed(nextSnap, { statusPageUrl: pageUrl });
    let pinnedMessageId = guildRecord.pinnedMessageId;

    if (pinnedMessageId) {
      try {
        const msg = await channel.messages.fetch(pinnedMessageId);
        await msg.edit({ embeds: [embed], components: [row] });
      } catch (err) {
        if (err?.code === ERR_UNKNOWN_MESSAGE) {
          logger.info(`[status] pinned msg ${pinnedMessageId} gone for guild ${guildRecord.id}; creating new`);
          pinnedMessageId = null;
        } else if (err?.code === ERR_MISSING_PERMS) {
          logger.warn(`[status] missing permissions in channel ${channelId}`);
          return;
        } else {
          logger.warn(`[status] failed to edit pinned message: ${err?.message}`);
        }
      }
    }

    if (!pinnedMessageId) {
      try {
        const msg = await channel.send({ embeds: [embed], components: [row] });
        try { await msg.pin(); } catch (e) { logger.warn(`[status] could not pin: ${e?.message}`); }
        pinnedMessageId = msg.id;
      } catch (err) {
        logger.warn(`[status] failed to create pinned message: ${err?.message}`);
        return;
      }
    }

    for (const t of d.componentTransitions) {
      try {
        await channel.send({ embeds: [buildTransitionEmbed(t, pageUrl)] });
      } catch (err) {
        logger.warn(`[status] transition send failed: ${err?.message}`);
      }
    }

    const rolePrefix = guildRecord.alertRoleId ? `<@&${guildRecord.alertRoleId}>` : null;
    for (const inc of d.incidentsCreated) {
      try {
        await channel.send({
          content: rolePrefix ?? undefined,
          embeds: [buildIncidentEmbed(inc, { kind: 'new', statusPageUrl: pageUrl })],
          allowedMentions: rolePrefix ? { roles: [guildRecord.alertRoleId] } : undefined,
        });
      } catch (err) {
        logger.warn(`[status] new-incident send failed: ${err?.message}`);
      }
    }
    for (const { incident } of d.incidentsUpdated) {
      try {
        await channel.send({
          embeds: [buildIncidentEmbed(incident, { kind: 'update', statusPageUrl: pageUrl })],
        });
      } catch (err) {
        logger.warn(`[status] incident-update send failed: ${err?.message}`);
      }
    }
    for (const inc of d.incidentsResolved) {
      try {
        await channel.send({
          embeds: [buildIncidentEmbed(inc, { kind: 'resolved', statusPageUrl: pageUrl })],
        });
      } catch (err) {
        logger.warn(`[status] resolved-incident send failed: ${err?.message}`);
      }
    }

    await store.save(guildRecord.id, {
      pinnedMessageId,
      lastSummary: rawSummary,
    });
  }

  async function runTick() {
    let rawSummary;
    try {
      const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
      rawSummary = await fetcher.fetchSummary(apiUrl);
    } catch (err) {
      const consecutive = fetcher.getConsecutiveFailures ? fetcher.getConsecutiveFailures() : 1;
      logger.warn(`[status] fetch failed (${consecutive}): ${err?.message}`);
      if (consecutive === 3) {
        logger.error(`[status] 3 consecutive fetch failures; status page may be down`);
      }
      return;
    }

    let enabled;
    try {
      enabled = await store.listEnabled();
    } catch (err) {
      logger.warn(`[status] failed to list enabled guilds: ${err?.message}`);
      return;
    }

    for (const g of enabled) {
      try {
        await applyToGuild(g, rawSummary);
      } catch (err) {
        logger.warn(`[status] guild ${g.id} tick failed: ${err?.message}`);
      }
    }
  }

  async function runTickForGuild(guildId) {
    const g = await store.get(guildId);
    if (!g || !g.enabled) return null;
    let rawSummary;
    try {
      const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
      rawSummary = await fetcher.fetchSummary(apiUrl);
    } catch (err) {
      logger.warn(`[status] on-demand fetch failed: ${err?.message}`);
      throw err;
    }
    await applyToGuild(g, rawSummary);
    return rawSummary;
  }

  async function fetchOnce() {
    const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
    return fetcher.fetchSummary(apiUrl);
  }

  function start() {
    if (cronTask) return;
    const expr = config.getConfig('status_poll_cron') || '*/2 * * * *';
    cronTask = cron.schedule(expr, () => {
      runTick().catch(err => logger.error(`[status] tick error: ${err?.message}`));
    });
    logger.info(`[status] poller started with cron "${expr}"`);
  }

  function stop() {
    if (cronTask) {
      cronTask.stop();
      cronTask = null;
    }
  }

  return { runTick, runTickForGuild, fetchOnce, start, stop };
}

module.exports = { createPoller };
