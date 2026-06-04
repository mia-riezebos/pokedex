const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHex, rolesToStrip, DEFAULT_PALETTE } = require('../src/services/colorRoles');

test('normalizeHex accepts 6-digit, 3-digit, with/without #', () => {
  assert.equal(normalizeHex('#FF8800'), '#ff8800');
  assert.equal(normalizeHex('ff8800'), '#ff8800');
  assert.equal(normalizeHex('#f80'), '#ff8800');
  assert.equal(normalizeHex('  #AABBCC '), '#aabbcc');
});

test('normalizeHex rejects junk', () => {
  assert.equal(normalizeHex('red'), null);
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex(''), null);
  assert.equal(normalizeHex(null), null);
});

test('rolesToStrip returns only the member roles that are color roles', () => {
  const memberRoles = ['r1', 'colorA', 'r2', 'colorB'];
  const colorRoleIds = ['colorA', 'colorB', 'colorC'];
  assert.deepEqual(rolesToStrip(memberRoles, colorRoleIds), ['colorA', 'colorB']);
});

test('default palette has the starter colors', () => {
  assert.ok(DEFAULT_PALETTE.Crimson);
  assert.equal(Object.keys(DEFAULT_PALETTE).length, 10);
});
