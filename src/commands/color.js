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

// Ensure the palette exists, seeding defaults the first time.
async function ensurePalette(guild) {
  let palette = await colorRoles.getPalette();
  if (palette) return palette;
  palette = {};
  try {
    for (const [name, hex] of Object.entries(colorRoles.DEFAULT_PALETTE)) {
      const role = await guild.roles.create({ name, color: hex, mentionable: false, reason: 'Color role palette seed' });
      palette[name] = { hex, roleId: role.id };
      await colorRoles.setPaletteEntry(name, hex, role.id);
    }
  } catch (err) {
    console.error('color palette seed failed:', err.message);
    throw err;
  }
  return palette;
}

async function applyColor(interaction, roleId) {
  const member = interaction.member;
  const allIds = await colorRoles.allColorRoleIds();
  const toStrip = colorRoles.rolesToStrip([...member.roles.cache.keys()], allIds);
  try {
    if (toStrip.length) await member.roles.remove(toStrip, 'Switching color role');
    await member.roles.add(roleId, 'Color role');
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
    const lines = Object.entries(palette).map(([name, v]) => `• **${name}** — \`${v.hex}\``).join('\n');
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
      await ensurePalette(interaction.guild);
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
