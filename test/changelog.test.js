const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEntry, data } = require('../src/commands/changelog');

describe('changelog booklet renderer', () => {
  test('command data builds', () => {
    assert.equal(data.toJSON().name, 'changelog');
  });

  test('normalizeEntry renders booklet entry with sections in order', () => {
    const n = normalizeEntry({
      version: '9.9.9',
      date: '2026-05-22',
      headline: 'Test headline.',
      sections: {
        new: ['x'],
        changed: ['y'],
        fixed: ['z'],
        internal: ['i'],
      },
    });
    assert.equal(n.version, '9.9.9');
    assert.match(n.dateStr, /May 2026/);
    assert.equal(n.headline, 'Test headline.');
    const names = n.sectionFields.map(f => f.name);
    assert.deepEqual(names, ['✨ New', '🔧 Changed', '🐛 Fixed', '🛠️ Internal']);
  });

  test('legacy entry with `changes` renders one What changed field', () => {
    const n = normalizeEntry({ version: '1.0.0', date: '2026-01-01', changes: ['a', 'b'] });
    assert.equal(n.sectionFields.length, 1);
    assert.equal(n.sectionFields[0].name, '📝 What changed');
    assert.match(n.sectionFields[0].value, /• a/);
    assert.match(n.sectionFields[0].value, /• b/);
  });

  test('handles entry with no headline and no sections gracefully', () => {
    const n = normalizeEntry({ version: '1.0.0', date: '2026-01-01' });
    assert.equal(n.headline, null);
    assert.deepEqual(n.sectionFields, []);
  });

  test('truncates oversize section values to <=1024 chars with ellipsis', () => {
    const long = Array.from({ length: 50 }, (_, i) => `item ${i} ` + 'x'.repeat(30));
    const n = normalizeEntry({ version: '1.0.0', date: '2026-01-01', sections: { new: long } });
    const val = n.sectionFields[0].value;
    assert.ok(val.length <= 1024, `value length ${val.length} must be <=1024`);
    assert.ok(val.endsWith('…'), 'should end with ellipsis when truncated');
  });
});
