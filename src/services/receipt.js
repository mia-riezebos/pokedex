const NA = '(not provided)';

function numberList(numbers) {
  const tags = numbers.map(n => `#${n}`);
  if (tags.length === 1) return tags[0];
  if (tags.length === 2) return `${tags[0]} and ${tags[1]}`;
  return `${tags.slice(0, -1).join(', ')}, and ${tags[tags.length - 1]}`;
}

// Templated closing receipt. `numbers` is one or more ticket numbers (multi-bug
// splits list all of them). `fields` is the structured ticket content.
function buildReceipt(numbers, fields = {}) {
  return [
    `Filed as ${numberList(numbers)}.`,
    'What the team will see:',
    `- Issue: ${fields.summary || NA}`,
    `- Expected: ${fields.expected || NA}`,
    `- Actual: ${fields.actual || NA}`,
    `- Scope: ${fields.scope || NA}`,
    'Expected response: a human will follow up.',
  ].join('\n');
}

module.exports = { buildReceipt, numberList };
