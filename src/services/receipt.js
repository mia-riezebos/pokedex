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

// Sent when the bot stops asking because it hit MAX_QUESTION_TURNS. Tells the
// reporter that question-time is over and points them at /addcontext for
// anything they remember afterward.
function buildTurnCapNotice() {
  return [
    "That's all the questions I'll ask — filing your report now.",
    'If you remember more later, run `/addcontext` in this thread (or right-click a message → **Add to Pokedex context**) and the team will see it.',
  ].join('\n');
}

module.exports = { buildReceipt, numberList, buildTurnCapNotice };
