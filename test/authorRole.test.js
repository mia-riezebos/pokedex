const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { resolveAuthorRole } = require('../src/services/authorRole');

function msg({ id = 'a', bot = false, manage = false } = {}) {
  return {
    author: { id, bot },
    member: { permissions: { has: (f) => manage && f === PermissionFlagsBits.ManageMessages } },
  };
}

describe('resolveAuthorRole', () => {
  const issue = { reporterId: 'op1', reporterIds: ['op1', 'op2'] };

  test('OP by reporterId', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'op1' }), issue), 'OP');
  });
  test('OP by membership in reporterIds', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'op2' }), issue), 'OP');
  });
  test('BOT takes precedence', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'x', bot: true }), issue), 'BOT');
  });
  test('MOD by ManageMessages', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'mod1', manage: true }), issue), 'MOD');
  });
  test('OTHER fallback', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'rando' }), issue), 'OTHER');
  });
  test('never throws on missing member/permissions', () => {
    assert.equal(resolveAuthorRole({ author: { id: 'z' } }, issue), 'OTHER');
  });
});
