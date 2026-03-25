const { ChannelType } = require('discord.js');
const { getConfig } = require('../config/config');
const { classifyIssue } = require('../services/openrouter');
const firestore = require('../services/firestore');
const { postIssueEmbed } = require('../services/triage');
const { evaluateContext, buildConversationHistory } = require('../services/contextEvaluator');

const STARTER_MSG_RETRIES = 3;
const STARTER_MSG_DELAY_MS = 2000;

async function handleForumPost(thread) {
  // Only handle forum channel threads
  if (!thread.parent || thread.parent.type !== ChannelType.GuildForum) return;

  // Check if this is the configured feedback forum
  const feedbackForum = getConfig('feedback_forum') || 'feedback';
  const parentName = thread.parent.name.toLowerCase();
  const parentId = thread.parent.id;
  if (parentName !== feedbackForum.toLowerCase() && parentId !== feedbackForum) return;

  // Join the thread so the bot can send messages
  try {
    await thread.join();
  } catch (err) {
    console.error('Failed to join forum thread:', err.message);
    return;
  }

  // Fetch starter message with retries
  let starterMessage = null;
  for (let i = 0; i < STARTER_MSG_RETRIES; i++) {
    try {
      starterMessage = await thread.fetchStarterMessage();
      if (starterMessage) break;
    } catch {
      // May not be available yet
    }
    await new Promise(resolve => setTimeout(resolve, STARTER_MSG_DELAY_MS));
  }

  if (!starterMessage || !starterMessage.content?.trim()) {
    console.warn(`Forum thread ${thread.id} has no starter message after retries — skipping`);
    return;
  }

  const text = starterMessage.content.trim();
  const guild = thread.guild;

  // Resolve reporter name early for the placeholder issue
  let reporterName = 'unknown';
  try {
    const member = await guild.members.fetch(thread.ownerId);
    reporterName = member.user.username;
  } catch {
    reporterName = starterMessage.author?.username || 'unknown';
  }

  // Phase 1: Save a placeholder issue with initialProcessing=true
  // This prevents thread.js from double-processing the starter message
  const placeholderData = {
    source: 'forum',
    threadId: thread.id,
    channelId: thread.parentId,
    guildId: guild.id,
    messageId: starterMessage.id,
    reporterId: thread.ownerId,
    reporterName,
    text,
    priority: 'unclassified',
    category: 'other',
    summary: text.slice(0, 100),
    reasoning: 'Pending classification',
    initialProcessing: true,
  };
  const issueId = await firestore.saveIssue(placeholderData);

  // Phase 2: Classify while the guard is active
  // Resolve forum tags
  const availableTags = thread.parent.availableTags || [];
  const forumTags = (thread.appliedTags || []).map(tagId => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag?.name || 'unknown';
  });

  const classificationInput = `${thread.name}\n\n${text}`;
  const classification = await classifyIssue(classificationInput);

  // Collect attachments from starter message
  const attachments = [...starterMessage.attachments.values()].map(a => ({
    url: a.url,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    isImage: a.contentType?.startsWith('image/') || false,
  }));

  // Phase 3: Update the issue with full classification and clear the guard
  await firestore.updateIssueFields(issueId, {
    forumTags,
    priority: classification.priority,
    category: classification.category,
    summary: classification.summary,
    reasoning: classification.reasoning,
    attachments,
    initialProcessing: false,
  });

  // Post triage embed
  const savedIssue = await firestore.getIssueById(issueId);
  const triageMessageId = await postIssueEmbed(guild, savedIssue, issueId);
  if (triageMessageId) {
    await firestore.updateIssueTriageMessageId(issueId, triageMessageId);
  }

  // Re-fetch issue so it has triageMessageId for the evaluator
  const issueWithTriage = await firestore.getIssueById(issueId);

  // Run context evaluator for first follow-up
  const history = buildConversationHistory([starterMessage]);
  const evaluation = await evaluateContext(issueWithTriage, history);

  if (evaluation.shouldReply && evaluation.reply) {
    await thread.send(evaluation.reply);
  }
}

module.exports = { handleForumPost };
