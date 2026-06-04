const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHex, rolesToStrip, matchRoleIdByHex, DEFAULT_PALETTE } = require('../src/services/colorRoles');

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

test('matchRoleIdByHex reuses a preset role of the same color (case-insensitive)', () => {
  const palette = { Blue: { hex: '#3498DB', roleId: 'role_blue' } };
  const custom = {};
  assert.equal(matchRoleIdByHex(palette, custom, '#3498db'), 'role_blue');
});

test('matchRoleIdByHex reuses an existing custom role before creating a new one', () => {
  const palette = {};
  const custom = { '_ff8800': 'role_orange' };
  assert.equal(matchRoleIdByHex(palette, custom, '#ff8800'), 'role_orange');
});

test('matchRoleIdByHex prefers a preset over a custom for the same color', () => {
  const palette = { Orange: { hex: '#ff8800', roleId: 'preset_orange' } };
  const custom = { '_ff8800': 'custom_orange' };
  assert.equal(matchRoleIdByHex(palette, custom, '#ff8800'), 'preset_orange');
});

test('matchRoleIdByHex returns null when nothing matches', () => {
  assert.equal(matchRoleIdByHex({}, {}, '#123456'), null);
  assert.equal(matchRoleIdByHex(null, null, '#123456'), null);
});
