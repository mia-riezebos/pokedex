'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeHex,
  rolesToStrip,
  matchRoleIdByHex,
  DEFAULT_PALETTE,
} = require('../src/services/colorRoles');

// These tests focus on HARD edge cases of the PURE/exported helpers only.
// No Discord or Firestore calls are made.

describe('normalizeHex — malformed input', () => {
  test('3-digit without # expands and lowercases', () => {
    assert.equal(normalizeHex('f80'), '#ff8800');
    assert.equal(normalizeHex('ABC'), '#aabbcc');
  });

  test('uppercase 6-digit is lowercased', () => {
    assert.equal(normalizeHex('#ABCDEF'), '#abcdef');
    assert.equal(normalizeHex('FFFFFF'), '#ffffff');
  });

  test('surrounding whitespace (tabs/newlines) is trimmed', () => {
    assert.equal(normalizeHex('\t#aabbcc\n'), '#aabbcc');
    assert.equal(normalizeHex('   abc   '), '#aabbcc');
  });

  test('multiple leading # are not all stripped (only one removed)', () => {
    // The regex replace(/^#/, '') removes exactly one leading '#'.
    // '##aabbcc' -> '#aabbcc' which is not valid hex -> null.
    assert.equal(normalizeHex('##aabbcc'), null);
  });

  test('internal whitespace is rejected', () => {
    assert.equal(normalizeHex('aa bb cc'), null);
    assert.equal(normalizeHex('#aa\tbbcc'), null);
  });

  test('leading/trailing junk is rejected', () => {
    assert.equal(normalizeHex('#aabbccx'), null);
    assert.equal(normalizeHex('xaabbcc'), null);
    assert.equal(normalizeHex('0x336699'), null); // 0x prefix is not valid
  });

  test('non-hex chars rejected', () => {
    assert.equal(normalizeHex('#gggggg'), null);
    assert.equal(normalizeHex('zzz'), null);
    assert.equal(normalizeHex('#12 45 6'), null);
  });

  test('wrong lengths rejected (1,2,4,5,7,8 digits)', () => {
    assert.equal(normalizeHex('a'), null);
    assert.equal(normalizeHex('ab'), null);
    assert.equal(normalizeHex('abcd'), null);
    assert.equal(normalizeHex('abcde'), null);
    assert.equal(normalizeHex('#1234567'), null);
    assert.equal(normalizeHex('12345678'), null);
  });

  test('empty / whitespace-only / falsy inputs return null', () => {
    assert.equal(normalizeHex(''), null);
    assert.equal(normalizeHex('   '), null);
    assert.equal(normalizeHex('#'), null);
    assert.equal(normalizeHex(null), null);
    assert.equal(normalizeHex(undefined), null);
    assert.equal(normalizeHex(0), null); // falsy -> null
    assert.equal(normalizeHex(false), null);
  });

  test('numeric input that looks like hex is coerced via String()', () => {
    // 123456 -> "123456" -> valid 6-digit hex
    assert.equal(normalizeHex(123456), '#123456');
    // A 3-digit number coerces to a 3-char string and expands
    assert.equal(normalizeHex(888), '#888888');
  });

  test('idempotency: normalizing an already-normalized value is stable', () => {
    const once = normalizeHex('#F80');
    assert.equal(once, '#ff8800');
    const twice = normalizeHex(once);
    assert.equal(twice, once);
    const thrice = normalizeHex(twice);
    assert.equal(thrice, twice);
  });

  test('idempotency across all forms collapses to one canonical value', () => {
    const canonical = '#aabbcc';
    for (const form of ['#AABBCC', 'aabbcc', '#abc', 'ABC', '  #AbC  ']) {
      assert.equal(normalizeHex(form), canonical, `form ${JSON.stringify(form)}`);
    }
  });
});

describe('rolesToStrip — edge cases', () => {
  test('member has zero color roles -> empty', () => {
    assert.deepEqual(rolesToStrip(['r1', 'r2'], ['c1', 'c2']), []);
  });

  test('member has multiple color roles -> all returned, order preserved', () => {
    const member = ['x', 'c2', 'y', 'c1', 'c3', 'z'];
    const colors = ['c1', 'c2', 'c3'];
    assert.deepEqual(rolesToStrip(member, colors), ['c2', 'c1', 'c3']);
  });

  test('empty colorRoleIds -> nothing to strip', () => {
    assert.deepEqual(rolesToStrip(['c1', 'c2'], []), []);
  });

  test('empty member roles -> empty', () => {
    assert.deepEqual(rolesToStrip([], ['c1']), []);
  });

  test('duplicate color role ids on the member are NOT deduped', () => {
    // filter keeps every matching element, including duplicates.
    assert.deepEqual(rolesToStrip(['c1', 'c1', 'r1'], ['c1']), ['c1', 'c1']);
  });

  test('exact string match only (no type coercion across number/string)', () => {
    // A Set of numbers won't match string ids.
    assert.deepEqual(rolesToStrip(['1', '2'], [1, 2]), []);
  });
});

describe('matchRoleIdByHex — preset/custom collisions and guards', () => {
  test('case-insensitive match on the WANT hex even if it has uppercase', () => {
    const palette = { Blue: { hex: '#3498db', roleId: 'rb' } };
    assert.equal(matchRoleIdByHex(palette, {}, '#3498DB'), 'rb');
  });

  test('preset wins over custom for the same color', () => {
    const palette = { Orange: { hex: '#ff8800', roleId: 'preset' } };
    const custom = { _ff8800: 'custom' };
    assert.equal(matchRoleIdByHex(palette, custom, '#ff8800'), 'preset');
  });

  test('first matching preset wins when two presets share a hex', () => {
    // Object.values iterates in insertion order; first match returned.
    const palette = {
      AliceBlue: { hex: '#abcdef', roleId: 'first' },
      Bluish: { hex: '#ABCDEF', roleId: 'second' },
    };
    assert.equal(matchRoleIdByHex(palette, {}, '#abcdef'), 'first');
  });

  test('preset entry with matching hex but NO roleId is skipped, falls to custom', () => {
    const palette = { Broken: { hex: '#ff8800' } }; // no roleId
    const custom = { _ff8800: 'custom_role' };
    assert.equal(matchRoleIdByHex(palette, custom, '#ff8800'), 'custom_role');
  });

  test('preset entry that is null/undefined does not throw', () => {
    const palette = { Bad: null, Also: undefined, Good: { hex: '#123456', roleId: 'g' } };
    assert.equal(matchRoleIdByHex(palette, {}, '#123456'), 'g');
  });

  test('custom key uses the "." and "#" -> "_" mangling', () => {
    // setCustomEntry stores under hex.replace(/[.#]/g,'_'); matchRoleIdByHex uses
    // want.replace(/[.#]/g,'_'). For a normalized '#rrggbb' only the leading '#'
    // is replaced -> '_rrggbb'.
    const custom = { _abcdef: 'role_x' };
    assert.equal(matchRoleIdByHex({}, custom, '#abcdef'), 'role_x');
  });

  test('non-normalized want hex still keys correctly because only # is mangled', () => {
    const custom = { _abcdef: 'role_x' };
    // Uppercase want should still find lowercased key (want is lowercased first).
    assert.equal(matchRoleIdByHex({}, custom, '#ABCDEF'), 'role_x');
  });

  test('returns null when neither preset nor custom matches', () => {
    assert.equal(matchRoleIdByHex({ A: { hex: '#000000', roleId: 'z' } }, { _111111: 'q' }, '#222222'), null);
  });

  test('null/undefined palette and customMap are tolerated', () => {
    assert.equal(matchRoleIdByHex(null, null, '#123456'), null);
    assert.equal(matchRoleIdByHex(undefined, undefined, '#123456'), null);
  });

  test('custom map present but lookup key absent -> null (not undefined)', () => {
    assert.equal(matchRoleIdByHex({}, { _aaaaaa: 'r' }, '#bbbbbb'), null);
  });
});

describe('DEFAULT_PALETTE — integrity', () => {
  test('all default hex values are valid and already normalized', () => {
    for (const [name, hex] of Object.entries(DEFAULT_PALETTE)) {
      assert.equal(normalizeHex(hex), hex, `${name} -> ${hex} should be canonical`);
    }
  });

  test('no two default presets share the same hex (collision-free seed)', () => {
    const hexes = Object.values(DEFAULT_PALETTE).map(h => h.toLowerCase());
    const unique = new Set(hexes);
    assert.equal(unique.size, hexes.length, 'duplicate hex in DEFAULT_PALETTE');
  });

  test('no two default preset names collide case-insensitively', () => {
    const names = Object.keys(DEFAULT_PALETTE).map(n => n.toLowerCase());
    assert.equal(new Set(names).size, names.length);
  });

  test('exactly 10 starter colors', () => {
    assert.equal(Object.keys(DEFAULT_PALETTE).length, 10);
  });
});

describe('matchRoleIdByHex integrates with normalizeHex output', () => {
  test('a custom role stored under normalized hex is found via normalize+match', () => {
    // Simulate /color hex flow: normalize the user input, then look it up.
    const userInput = '  #F80 ';
    const hex = normalizeHex(userInput); // '#ff8800'
    const custom = { [hex.replace(/[.#]/g, '_')]: 'custom_orange' };
    assert.equal(matchRoleIdByHex({}, custom, hex), 'custom_orange');
  });

  test('preset seeded from DEFAULT_PALETTE is reused for an equivalent custom request', () => {
    // Build a palette as seedPalette would, from DEFAULT_PALETTE.
    const palette = {};
    for (const [name, hex] of Object.entries(DEFAULT_PALETTE)) {
      palette[name] = { hex, roleId: `role_${name}` };
    }
    // User requests Blue's hex in a different case -> should reuse the preset.
    const want = normalizeHex(DEFAULT_PALETTE.Blue.toUpperCase());
    assert.equal(matchRoleIdByHex(palette, {}, want), 'role_Blue');
  });
});
