const compilationErrorPatterns = [
  /error TS\d+:/i, // TypeScript errors
  /compilation error/i, // Generic compilation error
  /error:/i, // Generic error
  /SyntaxError:/i, // JavaScript syntax errors
  /ReferenceError:/i, // JavaScript reference errors
  /TypeError:/i, // JavaScript type errors
];

const struggleKeywords = [
  'doesn\'t work',
  'error',
  'problem',
  'why',
  'how',
  'what\'s wrong',
  'help',
  'can\'t',
  'unable',
];

/**
 * Classifies the type of struggle in a session based on tool results.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of classified problems.
 */
export function classifyStruggleByTool(session) {
  const classifications = [];

  if (!session || !session.conversation) {
    return classifications;
  }

  for (const entry of session.conversation) {
    if (entry.type === 'user' && entry.message && Array.isArray(entry.message.content)) {
      for (const contentItem of entry.message.content) {
        if (contentItem.type === 'tool_result' && contentItem.content) {
          for (const pattern of compilationErrorPatterns) {
            if (pattern.test(contentItem.content)) {
              classifications.push({
                type: 'Compilation Issue',
                confidence: 0.7, // Assign a base confidence
                details: contentItem.content.substring(0, 100) + '...' // Truncate for brevity
              });
              return classifications; // For now, return after the first match
            }
          }
        }
      }
    }
  }

  return classifications;
}

/**
 * Classifies the type of struggle in a session based on user conversation.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of classified problems.
 */
export function classifyStruggleFromConversation(session) {
  const classifications = [];

  if (!session || !session.conversation) {
    return classifications;
  }

  for (const entry of session.conversation) {
    if (entry.type === 'user' && entry.message && Array.isArray(entry.message.content)) {
      for (const contentItem of entry.message.content) {
        if (contentItem.type === 'text') {
          const text = contentItem.text.toLowerCase();
          for (const keyword of struggleKeywords) {
            if (text.includes(keyword)) {
              classifications.push({
                type: 'User Struggle',
                confidence: 0.6,
                details: `User expressed struggle with keyword: '${keyword}'`
              });
              return classifications; // For now, return after the first match
            }
          }
        }
      }
    }
  }

  return classifications;
}

/**
 * Classifies the type of struggle in a session.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of classified problems.
 */
export function classifyStruggle(session) {
    const toolStruggles = classifyStruggleByTool(session);
    if (toolStruggles.length > 0) {
        return toolStruggles;
    }

    const conversationStruggles = classifyStruggleFromConversation(session);
    if (conversationStruggles.length > 0) {
        return conversationStruggles;
    }

    return [];
}
