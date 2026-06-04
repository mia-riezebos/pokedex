const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const colorRoles = require('../services/colorRoles');

const commandData = new SlashCommandBuilder()
  .setName('color')
  .setDescription('Pick a color role for your name')
  .addSubcommand(sub => sub.setName('list').setDescription('Show available preset colors'))
  .addSubcommand(sub =>
    sub.setName('set').setDescription('Use a preset color')
      .addStringOption(o => o.setName('name').setDescription('Preset color name').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('hex').setDescription('Use a custom hex color')
      .addStringOption(o => o.setName('code').setDescription('e.g. #ff8800').setRequired(true)))
  .addSubcommand(sub => sub.setName('clear').setDescription('Remove your color role'))
  .addSubcommand(sub =>
    sub.setName('add').setDescription('(Mods) Add a preset color')
      .addStringOption(o => o.setName('name').setDescription('Color name').setRequired(true))
      .addStringOption(o => o.setName('code').setDescription('Hex, e.g. #ff8800').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('remove').setDescription('(Mods) Remove a preset color')
      .addStringOption(o => o.setName('name').setDescription('Color name').setRequired(true)));

// In-process per-guild seed lock so two concurrent /color calls on a fresh server don't
// both run the seed loop and create 20 duplicate roles.
const seedLocks = new Map();

// Ensure the palette exists, seeding defaults the first time.
async function ensurePalette(guild) {
  if (await colorRoles.isPaletteSeeded()) {
    return (await colorRoles.getPalette()) || {};
  }
  if (!seedLocks.has(guild.id)) {
    seedLocks.set(guild.id, seedPalette(guild).finally(() => seedLocks.delete(guild.id)));
  }
  return seedLocks.get(guild.id);
}

// Create any default presets that don't exist yet, then mark the palette seeded.
// Resumable: skips names already present, so a previously-failed partial seed is
// completed rather than duplicated.
async function seedPalette(guild) {
  const palette = { ...((await colorRoles.getPalette()) || {}) };
  try {
    for (const [name, hex] of Object.entries(colorRoles.DEFAULT_PALETTE)) {
      if (palette[name]) continue;
      // Reuse a guild role that already matches this preset (e.g. created by a concurrent
      // seed on another shard, or a previous partial seed) instead of duplicating it.
      const wantColor = parseInt(hex.slice(1), 16);
      let role = guild.roles.cache.find(r => r.name === name && r.color === wantColor);
      if (!role) {
        role = await guild.roles.create({ name, color: hex, mentionable: false, reason: 'Color role palette seed' });
      }
      palette[name] = { hex, roleId: role.id };
      await colorRoles.setPaletteEntry(name, hex, role.id);
    }
    await colorRoles.markPaletteSeeded();
  } catch (err) {
    console.error('color palette seed failed:', err.message);
    throw err;
  }
  return palette;
}

async function applyColor(interaction, roleId) {
  const member = interaction.member;
  const allIds = await colorRoles.allColorRoleIds();
  // Strip every managed color role except the one we're about to apply.
  const toStrip = colorRoles.rolesToStrip([...member.roles.cache.keys()], allIds)
    .filter(id => id !== roleId);
  try {
    // Add first, then strip — a failed add leaves the member's current color intact
    // (no "colorless" window), and we never remove-then-fail-to-add.
    await member.roles.add(roleId, 'Color role');
    if (toStrip.length) await member.roles.remove(toStrip, 'Switching color role');
  } catch (err) {
    console.error('color apply failed:', err.message);
    return interaction.editReply('I could not change your color. My role must be **above** the color roles, and I need **Manage Roles**.');
  }
  return interaction.editReply('✅ Color updated!');
}

async function runColor(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    await interaction.deferReply({ ephemeral: true });
    const palette = await ensurePalette(interaction.guild);
    let lines = Object.entries(palette).map(([name, v]) => `• **${name}** — \`${v.hex}\``).join('\n');
    // Discord caps an embed description at 4096 chars; truncate defensively for huge palettes.
    if (lines.length > 3900) lines = lines.slice(0, 3900) + '\n… (list truncated)';
    const embed = new EmbedBuilder().setTitle('🎨 Available colors').setDescription(lines || '_none_').setColor(0x5865f2);
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'set') {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name');
    const palette = await ensurePalette(interaction.guild);
    const entry = Object.entries(palette).find(([n]) => n.toLowerCase() === name.toLowerCase());
    if (!entry) return interaction.editReply(`No preset color named "${name}". Try \`/color list\`.`);
    return applyColor(interaction, entry[1].roleId);
  }

  if (sub === 'hex') {
    await interaction.deferReply({ ephemeral: true });
    const hex = colorRoles.normalizeHex(interaction.options.getString('code'));
    if (!hex) return interaction.editReply('That is not a valid hex color. Example: `#ff8800`.');
    // Reuse any existing role of this color — preset or previously-created custom —
    // instead of making a duplicate. Seed the palette first so preset matches count.
    await ensurePalette(interaction.guild);
    let roleId = await colorRoles.findRoleIdByHex(hex);
    // If the cached role was deleted from the guild, forget it and recreate.
    if (roleId && !interaction.guild.roles.cache.has(roleId)) roleId = null;
    if (!roleId) {
      try {
        const role = await interaction.guild.roles.create({ name: hex, color: hex, mentionable: false, reason: 'Custom color role' });
        roleId = role.id;
        await colorRoles.setCustomEntry(hex, roleId);
      } catch (err) {
        console.error('color hex create failed:', err.message);
        return interaction.editReply('I could not create that color role. I need **Manage Roles** and my role must be high enough.');
      }
    }
    return applyColor(interaction, roleId);
  }

  if (sub === 'clear') {
    await interaction.deferReply({ ephemeral: true });
    const allIds = await colorRoles.allColorRoleIds();
    const toStrip = colorRoles.rolesToStrip([...interaction.member.roles.cache.keys()], allIds);
    if (!toStrip.length) return interaction.editReply('You have no color role to remove.');
    try {
      await interaction.member.roles.remove(toStrip, 'Cleared color role');
    } catch (err) {
      console.error('color clear failed:', err.message);
      return interaction.editReply('I could not remove your color role. Check my permissions.');
    }
    return interaction.editReply('✅ Color cleared.');
  }

  // --- Admin subcommands ---
  if (sub === 'add' || sub === 'remove') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: 'You need the **Manage Roles** permission to manage the palette.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name');

    if (sub === 'add') {
      const hex = colorRoles.normalizeHex(interaction.options.getString('code'));
      if (!hex) return interaction.editReply('Invalid hex color. Example: `#ff8800`.');
      const palette = await ensurePalette(interaction.guild);
      // Reject a duplicate name (case-insensitive) so we don't orphan the existing role.
      const clash = Object.keys(palette).find(n => n.toLowerCase() === name.toLowerCase());
      if (clash) {
        return interaction.editReply(`A preset named **${clash}** already exists. Use \`/color remove ${clash}\` first, or pick another name.`);
      }
      try {
        const role = await interaction.guild.roles.create({ name, color: hex, mentionable: false, reason: 'Palette color added' });
        await colorRoles.setPaletteEntry(name, hex, role.id);
      } catch (err) {
        console.error('palette add failed:', err.message);
        return interaction.editReply('Could not create the role. Check my permissions.');
      }
      return interaction.editReply(`✅ Added **${name}** (\`${hex}\`) to the palette.`);
    }

    // remove
    const palette = await colorRoles.getPalette() || {};
    const entry = Object.entries(palette).find(([n]) => n.toLowerCase() === name.toLowerCase());
    if (!entry) return interaction.editReply(`No preset named "${name}".`);
    const role = interaction.guild.roles.cache.get(entry[1].roleId);
    if (role) await role.delete('Palette color removed').catch(() => {});
    await colorRoles.deletePaletteEntry(entry[0]);
    return interaction.editReply(`✅ Removed **${entry[0]}** from the palette.`);
  }
}

async function execute(interaction) {
  try {
    return await runColor(interaction);
  } catch (err) {
    console.error('color command failed:', err.message);
    const msg = 'Something went wrong with that color command. Make sure I have **Manage Roles** and my role sits above the color roles.';
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(msg).catch(() => {});
    }
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
}

module.exports = { data: commandData, execute };
