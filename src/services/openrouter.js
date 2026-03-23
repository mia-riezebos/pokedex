const { getConfig } = require('../config/config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function buildSystemPrompt() {
  const priorities = getConfig('priorities');
  const categories = getConfig('categories');

  return `You are Pokedex, a smart issue triage bot for poke.com's Discord community. You deeply understand the platform and its common issues.

## Platform Context
poke.com is an AI assistant that lives inside messaging apps (iMessage, WhatsApp, SMS). It acts as a proactive digital companion that:
- Connects to users' email, calendar, files, and productivity tools
- Integrates with services like Gmail, Outlook, Google Calendar, Notion, Linear, GitHub, Asana, Todoist, Ramp, Netlify, Vercel, Supabase
- Drafts replies, manages invoices, reschedules meetings, books travel
- Uses "Recipes" — pre-built workflow templates for common tasks
- Learns user preferences and context to provide personalized assistance
- Operates through natural text conversations in chat apps

## Common Issue Patterns
- Messaging integration bugs (iMessage/WhatsApp not receiving responses, delayed replies, messages not sending)
- Third-party connection failures (Gmail sync broken, calendar not updating, GitHub/Linear integration disconnected)
- AI response quality (wrong context, hallucinated info, ignored preferences, bad suggestions)
- Recipe/workflow issues (recipes not triggering, wrong actions taken, automation failures)
- Account/auth issues (login problems, OAuth failures, can't connect services)
- Performance (slow responses, timeouts, assistant not responding)
- Privacy/security concerns (data access questions, unauthorized actions, wrong data shown)
- Billing/subscription issues

## Your Job
Analyze the user's message and classify the issue. If the report is vague or missing critical info, include a follow-up question.

Return ONLY valid JSON with these exact fields:
{
  "priority": one of [${priorities.map(p => `"${p}"`).join(', ')}],
  "category": one of [${categories.map(c => `"${c}"`).join(', ')}],
  "summary": "One-line summary of the issue",
  "reasoning": "Brief explanation of why you chose this priority and category",
  "follow_up": "A follow-up question to ask the user for more details, or null if the report is clear enough"
}

## Priority Guidelines
- **critical**: Data loss, security/privacy breach, unauthorized actions taken, billing charged incorrectly, assistant taking destructive actions
- **high**: Core feature broken for many users (messaging not working, major integration down), can't login, assistant completely unresponsive
- **medium**: Specific integration broken, workaround exists, affects some users, AI giving wrong but non-harmful responses
- **low**: Minor UI glitch, feature request, recipe suggestion, nice-to-have improvement

If the message is unclear or not a real issue, use priority "low" and category "other" and ask a follow-up question to clarify.`;
}

function validateResponse(parsed) {
  const priorities = getConfig('priorities');
  const categories = getConfig('categories');

  if (!parsed || typeof parsed !== 'object') return false;
  if (!priorities.includes(parsed.priority)) return false;
  if (!categories.includes(parsed.category)) return false;
  if (typeof parsed.summary !== 'string') return false;
  if (typeof parsed.reasoning !== 'string') return false;
  // follow_up is optional — can be string or null
  if (parsed.follow_up !== null && parsed.follow_up !== undefined && typeof parsed.follow_up !== 'string') return false;
  return true;
}

async function classifyIssue(text) {
  const model = getConfig('model');

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://poke.com',
        'X-Title': 'Poke Issue Triage Bot',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      return { priority: 'unclassified', category: 'other', summary: text.slice(0, 100), reasoning: 'API request failed', raw: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Strip markdown code fences if present (e.g. ```json ... ```)
    let cleanContent = content?.trim() ?? '';
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      console.error('Failed to parse OpenRouter response as JSON:', content);
      return { priority: 'unclassified', category: 'other', summary: text.slice(0, 100), reasoning: 'AI response was not valid JSON', raw: content };
    }

    if (!validateResponse(parsed)) {
      console.error('OpenRouter response failed validation:', parsed);
      return { priority: 'unclassified', category: 'other', summary: text.slice(0, 100), reasoning: 'AI response had invalid fields', raw: content };
    }

    return { ...parsed, raw: null };
  } catch (err) {
    console.error('OpenRouter request failed:', err.message);
    return { priority: 'unclassified', category: 'other', summary: text.slice(0, 100), reasoning: `Error: ${err.message}`, raw: null };
  }
}

module.exports = { classifyIssue };