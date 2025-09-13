/**
 * @file Knowledge Extraction Utilities
 * Extracts concepts, errors, and solutions from session conversations
 * for building cross-session knowledge connections
 */

/**
 * Extract concepts, errors, and solutions from session conversation
 * @param {Object} session - Parsed session object
 * @returns {Object} Extracted knowledge connections
 */
export function extractSessionKnowledge(session) {
  const concepts = new Set();
  const errors = new Set();
  const solutions = new Set();
  
  // Define common technical concepts to detect
  const TECH_CONCEPTS = [
    'react', 'vue', 'angular', 'javascript', 'typescript', 'node',
    'express', 'api', 'database', 'mongodb', 'postgres', 'mysql',
    'testing', 'jest', 'cypress', 'playwright', 'unit test', 'integration test',
    'docker', 'kubernetes', 'aws', 'github', 'git', 'deployment', 'deploying',
    'css', 'html', 'sass', 'tailwind', 'bootstrap',
    'webpack', 'vite', 'build', 'bundle', 'npm', 'yarn'
  ];
  
  // Define common error patterns
  const ERROR_PATTERNS = [
    'module not found', 'cannot resolve', 'syntax error', 'type error',
    'reference error', 'network error', 'connection refused', '404',
    'permission denied', 'access denied', 'authentication failed',
    'build failed', 'compilation error', 'test failed'
  ];
  
  // Handle missing or null conversation
  if (!session.conversation || !Array.isArray(session.conversation)) {
    return {
      concepts: [],
      errors: [],
      solutions: [],
      project: session.projectName
    };
  }

  session.conversation.forEach(message => {
    const content = extractContentText(message);
    
    if (content) {
      const contentLower = content.toLowerCase();
      
      // Extract concepts
      TECH_CONCEPTS.forEach(concept => {
        if (contentLower.includes(concept)) {
          concepts.add(concept);
        }
      });
      
      // Special handling for deployment variations
      if (contentLower.includes('deploy')) {
        concepts.add('deployment');
      }
      
      // Extract error patterns
      ERROR_PATTERNS.forEach(pattern => {
        if (contentLower.includes(pattern)) {
          errors.add(pattern);
        }
      });
      
      // Extract solutions using improved logic
      if (isResolutionIndicator(content)) {
        // Prefer assistant messages if role is available, but process all resolution messages
        const isFromAssistant = !message.role || message.role === 'assistant';
        
        const fullSolution = extractCompleteSolution(content);
        if (fullSolution) {
          // Apply stricter quality checks for assistant messages
          if (isFromAssistant && isActionableSolution(fullSolution)) {
            solutions.add(fullSolution);
          }
          // For test cases or uncertain roles, use basic length check
          else if (!message.role && fullSolution.length > 10) {
            solutions.add(fullSolution);
          }
        }
      }
    }
  });
  
  return {
    concepts: Array.from(concepts),
    errors: Array.from(errors),
    solutions: Array.from(solutions),
    project: session.projectName
  };
}

/**
 * Extract text content from various message content formats
 * @param {Object} message - Message object with potentially nested content
 * @returns {string} Extracted text content
 */
export function extractContentText(message) {
  // Handle direct string content
  if (typeof message.content === 'string') {
    return message.content;
  }
  
  // Handle message.message.content structure (common in real sessions)
  if (message.message?.content) {
    return extractContentText({ content: message.message.content });
  }
  
  // Handle array content (common in message formats)
  if (Array.isArray(message.content)) {
    let textContent = '';
    for (const item of message.content) {
      if (item?.type === 'text' && item?.text) {
        textContent += item.text + ' ';
      }
    }
    if (textContent.trim()) {
      return textContent.trim();
    }
  }
  
  // Handle nested message structure  
  if (message.content?.message?.content) {
    return extractContentText({ content: message.content.message.content });
  }
  
  // Handle direct text field
  if (message.text) {
    return message.text;
  }
  
  // Handle nested content object
  if (message.content && typeof message.content === 'object') {
    // Try to find text in nested structure
    if (message.content.text) {
      return message.content.text;
    }
    
    // Try to extract from nested message
    if (message.content.message) {
      return extractContentText(message.content.message);
    }
  }
  
  return '';
}

/**
 * Check if content contains resolution indicators
 * @param {string} content - Message content to check
 * @returns {boolean} True if content indicates a resolution
 */
function isResolutionIndicator(content) {
  const indicators = [
    '✅', 'fixed', 'solved', 'working now', 'success', 
    'resolved', 'completed', 'done', 'works', 'working'
  ];
  const contentLower = content.toLowerCase();
  return indicators.some(indicator => 
    contentLower.includes(indicator)
  );
}

/**
 * Extract complete solution block from content
 * @param {string} content - Message content
 * @returns {string|null} Extracted solution or null
 */
function extractCompleteSolution(content) {
  // Extract meaningful blocks instead of truncated sentences
  const blocks = content.split(/\n\n+/);
  
  // Find block with resolution indicator
  const solutionBlock = blocks.find(block => 
    block.length > 50 && // Minimum meaningful length
    block.length < 500 && // Maximum reasonable length  
    isResolutionIndicator(block)
  );
  
  if (solutionBlock) {
    return solutionBlock.trim();
  }
  
  // Fallback: look for sentences with resolution indicators
  const sentences = content.split(/[.!?]+/);
  const solutionSentences = sentences.filter(sentence => 
    sentence.length > 30 &&
    sentence.length < 300 &&
    isResolutionIndicator(sentence)
  );
  
  if (solutionSentences.length > 0) {
    return solutionSentences[0].trim();
  }
  
  return null;
}

/**
 * Check if a solution is actionable and not generic
 * @param {string} solution - Solution text to validate
 * @returns {boolean} True if solution is actionable
 */
function isActionableSolution(solution) {
  if (!solution || solution.length < 30) {
    return false;
  }
  
  // Filter out generic assistant responses
  const genericPhrases = [
    'let me', 'i will', 'i can', 'i\'ll', 'here is', 'this should',
    'let\'s', 'we can', 'we should', 'you can', 'you should'
  ];
  
  const solutionLower = solution.toLowerCase();
  const hasGeneric = genericPhrases.some(phrase => 
    solutionLower.includes(phrase)
  );
  
  // Filter out questions
  if (solution.includes('?')) {
    return false;
  }
  
  // Ensure it has some specificity (contains code, commands, or technical details)
  const hasSpecificity = /[{}()[\];`]|npm |git |cd |mkdir |touch |\.js|\.ts|\.css|\.html/.test(solution);
  
  return !hasGeneric && (hasSpecificity || solution.length > 80);
}