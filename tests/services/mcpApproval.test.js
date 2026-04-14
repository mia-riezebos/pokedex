import { describe, it, expect } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { canModerate } from '../../src/services/mcpApproval.js';

function memberWith(flags) {
  return {
    permissions: {
      has: (flag) => (BigInt(flags) & BigInt(flag)) !== 0n,
    },
  };
}

describe('canModerate', () => {
  it('returns true when member has ManageMessages', () => {
    expect(canModerate(memberWith(PermissionFlagsBits.ManageMessages))).toBe(true);
  });

  it('returns false when member lacks ManageMessages', () => {
    expect(canModerate(memberWith(0n))).toBe(false);
  });

  it('returns false for null/undefined member', () => {
    expect(canModerate(null)).toBe(false);
    expect(canModerate(undefined)).toBe(false);
  });

  it('returns false when member has no permissions object', () => {
    expect(canModerate({})).toBe(false);
  });
});
