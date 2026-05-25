const MAX_QUESTION_TURNS = 3;

function hasAllFields(cf = {}) {
  return !!(cf.expected && cf.actual && cf.feature && cf.frequency);
}

// Decide what the bot should do for one thread message. Pure: no I/O.
// Returns { action, reason?, incrementTurn?, evaluation }.
// action ∈ 'silent' | 'file' | 'ask' | 'reply' | 'react'.
function decideThreadAction({ role, issue = {}, frustration = {}, evaluation = {} }) {
  if (issue.filedAt) return { action: 'silent', reason: 'already-filed', evaluation };

  // Auto-resolve is handled separately (processConversationResponse); not here.
  if (role !== 'OP') return { action: 'silent', reason: 'non-op', evaluation };

  if (frustration.frustrated) return { action: 'file', reason: 'frustration', evaluation };
  if ((issue.questionTurns || 0) >= MAX_QUESTION_TURNS) return { action: 'file', reason: 'turn-cap', evaluation };
  if (hasAllFields(evaluation.contextFields)) return { action: 'file', reason: 'sufficient', evaluation };
  if (evaluation.shouldFile) return { action: 'file', reason: 'model', evaluation };

  if (evaluation.askedQuestion && evaluation.responseMode === 'reply') {
    return { action: 'ask', incrementTurn: true, evaluation };
  }
  if (evaluation.responseMode === 'react') return { action: 'react', evaluation };
  if (evaluation.responseMode === 'reply' && evaluation.reply) return { action: 'reply', evaluation };
  return { action: 'silent', reason: 'ignore', evaluation };
}

module.exports = { decideThreadAction, hasAllFields, MAX_QUESTION_TURNS };
