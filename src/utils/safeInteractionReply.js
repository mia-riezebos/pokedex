const { MessageFlags } = require('discord.js');

async function safeInteractionReply(interaction, content) {
  try {
    if (interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else if (interaction.deferred) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // Interaction may be expired, unknown, or already acknowledged by another
    // instance. Swallow to avoid crashing the client on an error-handler error.
  }
}

module.exports = { safeInteractionReply };
