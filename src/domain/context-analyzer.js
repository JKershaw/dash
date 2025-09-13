/**
 * Analyzes tool usage context to distinguish user-directed vs autonomous operations
 */

/**
 * Analyzes why a tool was called based on conversation context
 * @param {Object} toolOperation - The tool operation to analyze
 * @param {Array} conversationContext - Recent conversation messages
 * @returns {string} 'user_directed' | 'guided_autonomous' | 'fully_autonomous'
 */
export function analyzeToolIntent(toolOperation, conversationContext) {
  const userMessage = findPrecedingUserMessage(conversationContext);
  
  // Note: Session parser creates entries with structure { type, message: { content } }
  
  const hasContent = userMessage?.content || userMessage?.message?.content;
  if (!hasContent) {
    return 'fully_autonomous';
  }
  
  const userText = extractTextFromMessage(userMessage);
  
  // Check for explicit tool requests
  if (containsExplicitToolRequest(userText, toolOperation.name)) {
    return 'user_directed';
  }
  
  // Check for high-level requests that guide tool selection
  if (containsHighLevelGuidance(userText)) {
    return 'guided_autonomous';
  }
  
  return 'fully_autonomous';
}

/**
 * Detects explicit tool requests in user messages
 * @param {string} userText - User message text
 * @param {string} toolName - Name of the tool being analyzed
 * @returns {boolean} True if user explicitly requested this tool type
 */
function containsExplicitToolRequest(userText, toolName) {
  const text = userText.toLowerCase();
  
  const toolPatterns = {
    'Read': ['read', 'check', 'look at', 'examine', 'view', 'show me'],
    'Write': ['write', 'create', 'make a file', 'save to'],
    'Edit': ['edit', 'change', 'modify', 'update', 'fix'],
    'Bash': ['run', 'execute', 'test', 'build', 'install'],
    'Grep': ['search', 'find', 'grep', 'look for'],
    'Glob': ['list', 'find files', 'what files']
  };
  
  const patterns = toolPatterns[toolName] || [];
  return patterns.some(pattern => text.includes(pattern));
}

/**
 * Detects high-level requests that provide guidance but leave tool selection to Claude
 * @param {string} userText - User message text
 * @returns {boolean} True if message provides high-level guidance
 */
function containsHighLevelGuidance(userText) {
  const guidancePatterns = [
    'understand this', 'figure out', 'debug', 'investigate',
    'help me with', 'implement', 'fix the issue', 'add feature',
    'fix the failing', 'fix the', 'failing tests',
    // Add patterns for exploration requests
    'read through all', 'tell me about', 'tell me how',
    'check all', 'review these', 'go through',
    'what does this', 'how does this', 'explain',
    'configuration files', 'system setup'
  ];
  
  const text = userText.toLowerCase();
  return guidancePatterns.some(pattern => text.includes(pattern));
}

/**
 * Extracts text content from various message formats
 * @param {Object} message - User message object
 * @returns {string} Extracted text content
 */
function extractTextFromMessage(message) {
  // Handle session parser wrapper structure (message.message.content)
  const contentSource = message.message?.content || message.content;
  
  if (typeof contentSource === 'string') {
    return contentSource;
  }
  
  if (Array.isArray(contentSource)) {
    return contentSource
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join(' ');
  }
  
  return '';
}

/**
 * Finds the most recent user message before tool execution
 * @param {Array} conversationContext - Recent conversation messages
 * @returns {Object|null} The preceding user message or null
 */
function findPrecedingUserMessage(conversationContext) {
  if (!Array.isArray(conversationContext)) {
    return null;
  }
  
  // Find the most recent user message
  for (let i = conversationContext.length - 1; i >= 0; i--) {
    const msg = conversationContext[i];
    // Handle malformed entries gracefully
    if (!msg) continue;
    
    if (msg.type === 'user' || msg.role === 'user') {
      return msg;
    }
  }
  return null;
}