import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { safeInteractionReply } from '../../src/utils/safeInteractionReply.js';

function makeInteraction({ deferred = false, replied = false, methodBehavior = 'resolve' } = {}) {
  const behavior = methodBehavior === 'reject'
    ? () => Promise.reject(new Error('Unknown interaction'))
    : () => Promise.resolve();

  return {
    deferred,
    replied,
    reply: vi.fn(behavior),
    editReply: vi.fn(behavior),
    followUp: vi.fn(behavior),
  };
}

describe('safeInteractionReply', () => {
  it('uses reply() with ephemeral flag when interaction is fresh', async () => {
    const interaction = makeInteraction();

    await safeInteractionReply(interaction, 'An error occurred.');

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'An error occurred.',
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('uses editReply() when interaction was deferred but not yet replied', async () => {
    const interaction = makeInteraction({ deferred: true });

    await safeInteractionReply(interaction, 'An error occurred.');

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'An error occurred.' });
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('uses followUp() with ephemeral flag when interaction was already replied', async () => {
    const interaction = makeInteraction({ replied: true });

    await safeInteractionReply(interaction, 'An error occurred.');

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'An error occurred.',
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('does NOT use deprecated `ephemeral: true` option', async () => {
    const interaction = makeInteraction();

    await safeInteractionReply(interaction, 'hi');

    const args = interaction.reply.mock.calls[0][0];
    expect(args).not.toHaveProperty('ephemeral');
    expect(args.flags).toBe(MessageFlags.Ephemeral);
  });

  it('does not throw when reply() rejects (e.g. Unknown interaction)', async () => {
    const interaction = makeInteraction({ methodBehavior: 'reject' });

    await expect(safeInteractionReply(interaction, 'err')).resolves.toBeUndefined();
  });

  it('does not throw when editReply() rejects (e.g. Interaction expired)', async () => {
    const interaction = makeInteraction({ deferred: true, methodBehavior: 'reject' });

    await expect(safeInteractionReply(interaction, 'err')).resolves.toBeUndefined();
  });

  it('does not throw when followUp() rejects (e.g. Interaction already acknowledged)', async () => {
    const interaction = makeInteraction({ replied: true, methodBehavior: 'reject' });

    await expect(safeInteractionReply(interaction, 'err')).resolves.toBeUndefined();
  });
});
