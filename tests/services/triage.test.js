import { describe, it, expect } from 'vitest';
import { buildTriageButtons, buildIssueEmbed } from '../../src/services/triage.js';

function makeIssue(overrides = {}) {
  return {
    summary: 'Gmail sync is broken',
    priority: 'high',
    category: 'integration_bug',
    reporterName: 'alice',
    reasoning: 'User reports Gmail integration stopped syncing after OAuth refresh.',
    guildId: 'g1',
    channelId: 'c1',
    messageId: 'm1',
    ...overrides,
  };
}

describe('buildTriageButtons', () => {
  it('returns two action rows', () => {
    const rows = buildTriageButtons('issue-123');
    expect(rows).toHaveLength(2);
  });

  it('row 1 contains ack/fix/wontfix/escalate with the issue id embedded', () => {
    const [row1] = buildTriageButtons('issue-123');
    const ids = row1.components.map(b => b.data.custom_id);
    expect(ids).toEqual([
      'triage_ack_issue-123',
      'triage_fix_issue-123',
      'triage_wontfix_issue-123',
      'triage_escalate_issue-123',
    ]);
  });

  it('row 2 contains delete and gather context', () => {
    const [, row2] = buildTriageButtons('issue-123');
    const ids = row2.components.map(b => b.data.custom_id);
    expect(ids).toEqual(['triage_delete_issue-123', 'triage_gather_issue-123']);
  });
});

describe('buildIssueEmbed', () => {
  it('uses the priority color for known priorities', () => {
    expect(buildIssueEmbed(makeIssue({ priority: 'critical' }), 'id').data.color).toBe(0xff0000);
    expect(buildIssueEmbed(makeIssue({ priority: 'high' }), 'id').data.color).toBe(0xff8c00);
    expect(buildIssueEmbed(makeIssue({ priority: 'medium' }), 'id').data.color).toBe(0xffd700);
    expect(buildIssueEmbed(makeIssue({ priority: 'low' }), 'id').data.color).toBe(0x00cc00);
    expect(buildIssueEmbed(makeIssue({ priority: 'unclassified' }), 'id').data.color).toBe(0x808080);
  });

  it('falls back to gray for an unknown priority', () => {
    expect(buildIssueEmbed(makeIssue({ priority: 'bogus' }), 'id').data.color).toBe(0x808080);
  });

  it('sets the title to the issue summary and footer to the issue id', () => {
    const embed = buildIssueEmbed(makeIssue(), 'issue-123');
    expect(embed.data.title).toBe('Gmail sync is broken');
    expect(embed.data.footer.text).toBe('Issue ID: issue-123');
  });

  it('replaces underscores in category with spaces', () => {
    const embed = buildIssueEmbed(makeIssue({ category: 'integration_bug' }), 'id');
    const categoryField = embed.data.fields.find(f => f.name === 'Category');
    expect(categoryField.value).toBe('integration bug');
  });

  it('defaults category to "other" when missing', () => {
    const issue = makeIssue();
    delete issue.category;
    const embed = buildIssueEmbed(issue, 'id');
    const categoryField = embed.data.fields.find(f => f.name === 'Category');
    expect(categoryField.value).toBe('other');
  });

  it('adds a jump link when guild/channel/message ids are present', () => {
    const embed = buildIssueEmbed(makeIssue(), 'id');
    const linkField = embed.data.fields.find(f => f.name === 'Original Message');
    expect(linkField).toBeDefined();
    expect(linkField.value).toContain('https://discord.com/channels/g1/c1/m1');
  });

  it('shows "MCP Agent" source instead of a jump link when channelId is "mcp"', () => {
    const embed = buildIssueEmbed(
      makeIssue({ channelId: 'mcp', source: 'mcp' }),
      'id',
    );
    expect(embed.data.fields.find(f => f.name === 'Original Message')).toBeUndefined();
    const sourceField = embed.data.fields.find(f => f.name === 'Source');
    expect(sourceField.value).toBe('MCP Agent');
  });

  it('shows "MCP Agent" source when messageId starts with "mcp-"', () => {
    const embed = buildIssueEmbed(
      makeIssue({ messageId: 'mcp-abc', source: 'mcp' }),
      'id',
    );
    expect(embed.data.fields.find(f => f.name === 'Original Message')).toBeUndefined();
    expect(embed.data.fields.find(f => f.name === 'Source').value).toBe('MCP Agent');
  });

  it('includes an Assigned To field only when assigneeName is set', () => {
    const without = buildIssueEmbed(makeIssue(), 'id');
    expect(without.data.fields.find(f => f.name === 'Assigned To')).toBeUndefined();
    const withAssignee = buildIssueEmbed(makeIssue({ assigneeName: 'bob' }), 'id');
    expect(withAssignee.data.fields.find(f => f.name === 'Assigned To').value).toBe('bob');
  });

  it('sets the embed image to the first image attachment and lists all attachments', () => {
    const issue = makeIssue({
      attachments: [
        { name: 'log.txt', url: 'https://cdn.example.com/log.txt', isImage: false, size: 2048 },
        { name: 'screen.png', url: 'https://cdn.example.com/screen.png', isImage: true, size: 10240 },
      ],
    });
    const embed = buildIssueEmbed(issue, 'id');
    expect(embed.data.image.url).toBe('https://cdn.example.com/screen.png');
    const attField = embed.data.fields.find(f => f.name === 'Attachments');
    expect(attField.value).toContain('log.txt');
    expect(attField.value).toContain('screen.png');
    expect(attField.value).toContain('2KB');
    expect(attField.value).toContain('10KB');
  });

  it('does not set embed image when no image attachments exist', () => {
    const issue = makeIssue({
      attachments: [
        { name: 'log.txt', url: 'https://cdn.example.com/log.txt', isImage: false, size: 100 },
      ],
    });
    const embed = buildIssueEmbed(issue, 'id');
    expect(embed.data.image).toBeUndefined();
    const attField = embed.data.fields.find(f => f.name === 'Attachments');
    expect(attField.value).toContain('log.txt');
  });

  it('adds a "Context Complete" field when contextComplete is true', () => {
    const embed = buildIssueEmbed(makeIssue({ contextComplete: true }), 'id');
    expect(embed.data.fields.find(f => f.name === '✅ Context Complete')).toBeDefined();
  });

  it('adds a "Gathering Context" field for forum issues that are not yet complete', () => {
    const embed = buildIssueEmbed(makeIssue({ source: 'forum' }), 'id');
    expect(embed.data.fields.find(f => f.name === '⏳ Gathering Context')).toBeDefined();
  });
});
