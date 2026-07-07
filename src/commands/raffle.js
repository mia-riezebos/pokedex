const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const firestore = require('../services/firestore');

const raffles = new Map();
const RAFFLE_COLORS = {
  active: 0x5865f2,
  ended: 0x2ecc71,
  canceled: 0xe74c3c,
};

const data = new SlashCommandBuilder()
  .setName('raffle')
  .setDescription('Manage button-based raffles')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('create')
      .setDescription('Create a raffle')
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('Raffle title')
          .setRequired(true)
          .setMaxLength(256),
      )
      .addStringOption((option) =>
        option
          .setName('description')
          .setDescription('What people are entering for')
          .setRequired(true)
          .setMaxLength(2000),
      )
      .addIntegerOption((option) =>
        option
          .setName('duration_minutes')
          .setDescription('Optional auto-pick deadline in minutes')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(10080),
      )
      .addAttachmentOption((option) =>
        option
          .setName('image')
          .setDescription('Optional raffle image')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('pick')
      .setDescription('Pick a winner for an active raffle')
      .addStringOption((option) =>
        option
          .setName('raffle')
          .setDescription('Active raffle')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('cancel')
      .setDescription('Cancel an active raffle')
      .addStringOption((option) =>
        option
          .setName('raffle')
          .setDescription('Active raffle')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reroll')
      .setDescription('Reroll a raffle that already has a winner')
      .addStringOption((option) =>
        option
          .setName('raffle')
          .setDescription('Picked raffle')
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

function createRaffle({ title, description, hostId, durationMinutes = null, imageUrl = null, now = Date.now() }) {
  const endsAt = durationMinutes ? now + durationMinutes * 60_000 : null;
  return {
    title,
    description,
    hostId,
    imageUrl,
    guildId: null,
    channelId: null,
    messageId: null,
    createdAt: now,
    endsAt,
    entrants: new Map(),
    winnerId: null,
    endedAt: null,
    canceledAt: null,
    timeout: null,
  };
}

function serializeRaffle(messageId, raffle) {
  return {
    messageId,
    guildId: raffle.guildId,
    channelId: raffle.channelId,
    title: raffle.title,
    description: raffle.description,
    hostId: raffle.hostId,
    imageUrl: raffle.imageUrl || null,
    createdAt: raffle.createdAt || Date.now(),
    endsAt: raffle.endsAt || null,
    entrants: [...raffle.entrants.values()].map((entrant) => ({
      id: entrant.id,
      username: entrant.username || entrant.id,
      joinedAt: entrant.joinedAt || Date.now(),
    })),
    winnerId: raffle.winnerId || null,
    endedAt: raffle.endedAt || null,
    canceledAt: raffle.canceledAt || null,
  };
}

function hydrateRaffle(data) {
  const raffle = {
    title: data.title,
    description: data.description,
    hostId: data.hostId,
    imageUrl: data.imageUrl || null,
    guildId: data.guildId || null,
    channelId: data.channelId || null,
    messageId: data.messageId || data.id || null,
    createdAt: data.createdAt || Date.now(),
    endsAt: data.endsAt || null,
    entrants: new Map(),
    winnerId: data.winnerId || null,
    endedAt: data.endedAt || null,
    canceledAt: data.canceledAt || null,
    timeout: null,
  };

  for (const entrant of data.entrants || []) {
    if (!entrant?.id) continue;
    raffle.entrants.set(entrant.id, {
      id: entrant.id,
      username: entrant.username || entrant.id,
      joinedAt: entrant.joinedAt || raffle.createdAt,
    });
  }

  return raffle;
}

async function persistRaffle(messageId, raffle) {
  raffle.messageId = messageId;
  await firestore.saveRaffle(serializeRaffle(messageId, raffle));
}

function parseRaffleId(raffleId) {
  const raw = String(raffleId || '').trim();
  const [guildId, messageId] = raw.includes(':') ? raw.split(':') : [null, raw];
  return { guildId, messageId };
}

function makeRaffleId(messageId, raffle) {
  return raffle.guildId ? `${raffle.guildId}:${messageId}` : messageId;
}

async function loadRaffle(raffleId) {
  const { messageId } = parseRaffleId(raffleId);
  const cached = raffles.get(messageId);
  if (cached) return cached;

  const saved = await firestore.getRaffle(messageId);
  if (!saved) return null;

  const raffle = hydrateRaffle(saved);
  raffles.set(messageId, raffle);
  return raffle;
}

function ticketCount(raffle) {
  return raffle.entrants.size;
}

function joinRaffle(raffle, user, now = Date.now()) {
  if (raffle.endedAt) return { ok: false, reason: 'ended' };
  if (raffle.entrants.has(user.id)) return { ok: false, reason: 'already_joined' };
  raffle.entrants.set(user.id, { id: user.id, username: user.username || user.tag || user.id, joinedAt: now });
  return { ok: true };
}

function leaveRaffle(raffle, userId) {
  if (raffle.endedAt) return { ok: false, reason: 'ended' };
  if (!raffle.entrants.delete(userId)) return { ok: false, reason: 'not_joined' };
  return { ok: true };
}

function pickWinner(raffle, random = Math.random, now = Date.now(), { reroll = false } = {}) {
  if (raffle.canceledAt) return { ok: false, reason: 'canceled' };
  if (raffle.endedAt && !reroll) return { ok: false, reason: 'ended', winnerId: raffle.winnerId };
  if (raffle.endedAt && reroll && !raffle.winnerId) return { ok: false, reason: 'no_winner' };

  raffle.endedAt = now;
  if (raffle.timeout) {
    clearTimeout(raffle.timeout);
    raffle.timeout = null;
  }

  let entrants = [...raffle.entrants.keys()];
  if (reroll && raffle.winnerId && entrants.length > 1) {
    entrants = entrants.filter((id) => id !== raffle.winnerId);
  }
  if (entrants.length === 0) return { ok: false, reason: 'no_entrants' };

  const index = Math.floor(random() * entrants.length);
  raffle.winnerId = entrants[Math.min(index, entrants.length - 1)];
  return { ok: true, winnerId: raffle.winnerId };
}

function cancelRaffle(raffle, now = Date.now()) {
  if (raffle.endedAt) return { ok: false, reason: 'ended' };
  raffle.endedAt = now;
  raffle.canceledAt = now;
  if (raffle.timeout) {
    clearTimeout(raffle.timeout);
    raffle.timeout = null;
  }
  return { ok: true };
}

function getRaffleColor(raffle) {
  if (raffle.canceledAt) return RAFFLE_COLORS.canceled;
  if (raffle.endedAt) return RAFFLE_COLORS.ended;
  return RAFFLE_COLORS.active;
}

function buildRaffleStatus(raffle) {
  const parts = [`🎟️ ${ticketCount(raffle)} entered`];
  if (raffle.winnerId) {
    parts.push(`winner <@${raffle.winnerId}>`);
  } else if (raffle.canceledAt) {
    parts.push('canceled');
  } else if (raffle.endedAt) {
    parts.push('ended with no winner');
  } else if (raffle.endsAt) {
    parts.push(`ends in <t:${Math.floor(raffle.endsAt / 1000)}:R>`);
  }
  return `-# ${parts.join(' • ')}`;
}

function buildRaffleActionRow(messageId, raffleOrEnded = false) {
  const raffle = typeof raffleOrEnded === 'object' ? raffleOrEnded : null;
  const ended = raffle ? !!raffle.endedAt : !!raffleOrEnded;
  if (ended) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raffle_join_${messageId}`)
      .setLabel('Join Raffle')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`raffle_leave_${messageId}`)
      .setLabel('Leave Raffle')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildRaffleComponents(messageId, raffleOrEnded = false) {
  const raffle = typeof raffleOrEnded === 'object' ? raffleOrEnded : null;
  const row = buildRaffleActionRow(messageId, raffleOrEnded);
  if (!raffle) return row ? [row] : [];

  const container = new ContainerBuilder()
    .setAccentColor(getRaffleColor(raffle))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${raffle.title}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(raffle.description));

  if (raffle.imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(raffle.imageUrl),
      ),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildRaffleStatus(raffle)));

  if (row) container.addActionRowComponents(row);

  return [
    new TextDisplayBuilder().setContent('A new raffle has been opened!'),
    container,
  ];
}

function buildRaffleMessagePayload(messageId, raffle) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: buildRaffleComponents(messageId, raffle),
  };
}

async function refreshRaffleMessage(message, raffle) {
  await message.edit(buildRaffleMessagePayload(message.id, raffle));
}

async function announceWinner(message, winnerId, title) {
  await message.channel.send({
    content: `🎉 Congratulations <@${winnerId}> — you won **${title || message.embeds[0]?.title || 'the raffle'}**!`,
    allowedMentions: { users: [winnerId] },
  });
}

async function endRaffle(message, raffle, { announce = true, reroll = false } = {}) {
  const result = pickWinner(raffle, Math.random, Date.now(), { reroll });
  await persistRaffle(message.id, raffle);
  await refreshRaffleMessage(message, raffle);

  if (result.ok && announce) {
    await announceWinner(message, result.winnerId, raffle.title);
  }

  return result;
}

function scheduleRaffleEnd(message, raffle) {
  if (!raffle.endsAt || raffle.endedAt) return;
  if (raffle.timeout) clearTimeout(raffle.timeout);

  raffle.timeout = setTimeout(() => {
    const liveRaffle = raffles.get(message.id) || raffle;
    if (liveRaffle.endedAt) return;
    endRaffle(message, liveRaffle).catch((err) => console.error('[raffle] auto-pick failed:', err));
  }, Math.max(0, raffle.endsAt - Date.now()));
}

async function resumeActiveRaffles(client) {
  const savedRaffles = await firestore.listActiveRaffles();
  let resumed = 0;

  for (const saved of savedRaffles) {
    if (!saved.messageId || !saved.channelId) continue;
    const raffle = hydrateRaffle(saved);
    raffles.set(saved.messageId, raffle);

    if (!raffle.endsAt) continue;

    try {
      const channel = await client.channels.fetch(raffle.channelId);
      const message = await channel.messages.fetch(raffle.messageId);
      await refreshRaffleMessage(message, raffle);
      scheduleRaffleEnd(message, raffle);
      resumed++;
    } catch (err) {
      console.error(`[raffle] failed to resume ${saved.messageId}:`, err.message);
    }
  }

  if (resumed > 0) console.log(`[raffle] resumed ${resumed} active raffle deadline${resumed === 1 ? '' : 's'}`);
}

function canManageRaffles(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

async function listKnownRaffles() {
  const persisted = await firestore.listRaffles();
  const byId = new Map();

  for (const raffle of persisted) {
    if (!raffle.messageId && !raffle.id) continue;
    byId.set(raffle.messageId || raffle.id, hydrateRaffle(raffle));
  }
  for (const [id, raffle] of raffles) {
    byId.set(id, raffle);
  }

  return [...byId.entries()].map(([id, raffle]) => ({ id, raffle }));
}

function filterRafflesForAction(items, action) {
  return items.filter(({ raffle }) => {
    if (action === 'reroll') return !!raffle.endedAt && !!raffle.winnerId && !raffle.canceledAt;
    return !raffle.endedAt && !raffle.canceledAt;
  });
}

function formatRaffleChoice(id, raffle) {
  const raffleId = makeRaffleId(id, raffle);
  const title = String(raffle.title || 'Untitled raffle').slice(0, Math.max(20, 97 - raffleId.length));
  return `${title} — ${raffleId}`.slice(0, 100);
}

async function fetchRaffleMessage(interaction, raffle) {
  const channelId = raffle.channelId || interaction.channelId;
  const channel = await interaction.client.channels.fetch(channelId);
  return channel.messages.fetch(raffle.messageId);
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'create') return executeCreate(interaction);
  if (subcommand === 'pick') return executePick(interaction);
  if (subcommand === 'cancel') return executeCancel(interaction);
  if (subcommand === 'reroll') return executeReroll(interaction);
}

async function executeCreate(interaction) {
  const durationMinutes = interaction.options.getInteger('duration_minutes');
  const image = interaction.options.getAttachment('image');
  if (image && image.contentType && !image.contentType.startsWith('image/')) {
    await interaction.reply({ content: 'The raffle attachment must be an image.', ephemeral: true });
    return;
  }

  const raffle = createRaffle({
    title: interaction.options.getString('title'),
    description: interaction.options.getString('description'),
    hostId: interaction.user.id,
    durationMinutes,
    imageUrl: image?.url || null,
  });

  const message = await interaction.reply({
    ...buildRaffleMessagePayload('pending', raffle),
    fetchReply: true,
  });

  raffle.guildId = interaction.guildId;
  raffle.channelId = interaction.channelId;
  raffle.messageId = message.id;
  raffles.set(message.id, raffle);
  await persistRaffle(message.id, raffle);
  await refreshRaffleMessage(message, raffle);
  scheduleRaffleEnd(message, raffle);
}

async function executePick(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const raffleId = interaction.options.getString('raffle');
  const { messageId } = parseRaffleId(raffleId);
  const raffle = await loadRaffle(raffleId);
  if (!raffle || raffle.endedAt || raffle.canceledAt) {
    await interaction.editReply({ content: 'That raffle is not active.' });
    return;
  }

  const message = await fetchRaffleMessage(interaction, raffle);
  const result = await endRaffle(message, raffle);
  if (!result.ok && result.reason === 'no_entrants') {
    await interaction.editReply({ content: 'Raffle ended with no entrants.' });
    return;
  }
  await interaction.editReply({ content: `Picked winner for **${raffle.title}**: <@${result.winnerId}>` });
}

async function executeCancel(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const raffleId = interaction.options.getString('raffle');
  const { messageId } = parseRaffleId(raffleId);
  const raffle = await loadRaffle(raffleId);
  if (!raffle || raffle.endedAt || raffle.canceledAt) {
    await interaction.editReply({ content: 'That raffle is not active.' });
    return;
  }

  const result = cancelRaffle(raffle);
  if (!result.ok) {
    await interaction.editReply({ content: 'That raffle could not be canceled.' });
    return;
  }

  const message = await fetchRaffleMessage(interaction, raffle);
  await persistRaffle(messageId, raffle);
  await refreshRaffleMessage(message, raffle);
  await interaction.editReply({ content: `Canceled **${raffle.title}**.` });
}

async function executeReroll(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const raffleId = interaction.options.getString('raffle');
  const raffle = await loadRaffle(raffleId);
  if (!raffle || !raffle.endedAt || !raffle.winnerId || raffle.canceledAt) {
    await interaction.editReply({ content: 'That raffle does not have a winner to reroll.' });
    return;
  }

  const message = await fetchRaffleMessage(interaction, raffle);
  const result = await endRaffle(message, raffle, { reroll: true });
  if (!result.ok) {
    await interaction.editReply({ content: 'Could not reroll this raffle.' });
    return;
  }
  await interaction.editReply({ content: `Rerolled **${raffle.title}**: <@${result.winnerId}>` });
}

async function autocomplete(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = filterRafflesForAction(await listKnownRaffles(), subcommand)
    .filter(({ raffle }) => !raffle.guildId || raffle.guildId === interaction.guildId)
    .filter(({ id, raffle }) => `${raffle.title || ''} ${makeRaffleId(id, raffle)}`.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(({ id, raffle }) => ({ name: formatRaffleChoice(id, raffle), value: makeRaffleId(id, raffle) }));
  await interaction.respond(choices);
}

async function handleRaffleButton(interaction) {
  const [, action, messageId] = interaction.customId.split('_');
  const raffle = await loadRaffle(messageId);

  if (!raffle) {
    await interaction.reply({ content: 'This raffle is no longer active.', ephemeral: true });
    return;
  }

  if (action === 'join') {
    const result = joinRaffle(raffle, interaction.user);
    if (result.reason === 'ended') {
      await interaction.reply({ content: 'This raffle has already ended.', ephemeral: true });
      return;
    }
    if (result.reason === 'already_joined') {
      await interaction.reply({ content: 'You are already in this raffle. You still have 1 ticket.', ephemeral: true });
      return;
    }

    await persistRaffle(messageId, raffle);
    await refreshRaffleMessage(interaction.message, raffle);
    await interaction.reply({ content: `You joined **${raffle.title}**. You have 1 raffle ticket.`, ephemeral: true });
    return;
  }

  if (action === 'leave') {
    const result = leaveRaffle(raffle, interaction.user.id);
    if (result.reason === 'ended') {
      await interaction.reply({ content: 'This raffle has already ended.', ephemeral: true });
      return;
    }
    if (result.reason === 'not_joined') {
      await interaction.reply({ content: 'You are not in this raffle.', ephemeral: true });
      return;
    }

    await persistRaffle(messageId, raffle);
    await refreshRaffleMessage(interaction.message, raffle);
    await interaction.reply({ content: `You left **${raffle.title}**.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: 'Use `/raffle pick`, `/raffle cancel`, or `/raffle reroll` for moderator actions.', ephemeral: true });
}

module.exports = {
  data,
  execute,
  autocomplete,
  handleRaffleButton,
  resumeActiveRaffles,
  createRaffle,
  serializeRaffle,
  hydrateRaffle,
  parseRaffleId,
  makeRaffleId,
  joinRaffle,
  leaveRaffle,
  pickWinner,
  cancelRaffle,
  buildRaffleStatus,
  buildRaffleComponents,
  buildRaffleMessagePayload,
  raffles,
  requiresFirebase: false,
};
