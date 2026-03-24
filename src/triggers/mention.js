const { EmbedBuilder } = require('discord.js');
const { enqueue } = require('../services/queue');
const { processIssue } = require('../services/pipeline');

async function handleMention(message) {
  const text = message.content.replace(/<@!?\d+>/g, '').trim();

  if (!text) {
    const embed = new EmbedBuilder()
      .setTitle('Hey! I\'m Pokedex')
      .setColor(0x5865f2)
      .setDescription('I help identify and organize bugs for the engineering team. Here\'s how to use me:')
      .addFields(
        {
          name: 'Report an Issue',
          value: '**@mention me** with a description of the problem\nExample: `@Pokedex my gmail won\'t sync`',
        },
        {
          name: 'Flag a Message',
          value: 'React with 🐛 on any message to report it as an issue\nReact with 💡 to submit it as a suggestion',
        },
        {
          name: 'Commands',
          value: '`/help` — Full list of commands and settings\n`/config list` — View bot settings',
        },
      )
      .setFooter({ text: 'Identifying bugs so engineers don\'t have to hunt for them' });

    await message.reply({ embeds: [embed] });
    return;
  }

  // Include replied-to message context if present
  let fullText = text;
  if (message.reference) {
    try {
      const referenced = await message.channel.messages.fetch(message.reference.messageId);
      fullText = `[Context from replied message]: ${referenced.content}\n\n[User's report]: ${text}`;
    } catch {
      // Could not fetch referenced message, proceed with just the text
    }
  }

  enqueue(() => processIssue(message, fullText));
}

module.exports = { handleMention };