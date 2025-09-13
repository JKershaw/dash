/**
 * @file Enhanced Analysis Tools for Chat Functionality
 * Provides advanced search and analysis capabilities for interactive chat
 */

/**
 * Search sessions with advanced filtering and ranking
 * @param {Array} sessions - Array of session objects to search
 * @param {Object} options - Search options
 * @param {string} options.keyword - Keyword to search for in conversation content
 * @param {string} options.project - Filter by project name
 * @param {number} options.minDuration - Minimum duration in seconds
 * @param {number} options.maxDuration - Maximum duration in seconds
 * @param {boolean} options.hasStruggle - Filter by struggle indicator
 * @param {string} options.strugglePattern - Specific struggle pattern to filter by
 * @param {number} options.limit - Maximum number of results to return (default: 10)
 * @param {number} options.offset - Number of results to skip for pagination (default: 0)
 * @returns {Array} Array of search results with relevance scores and context
 */
export function searchSessions(sessions, options = {}) {
  // Validate parameters
  validateSearchOptions(options);
  
  // Default values
  const {
    keyword,
    project,
    minDuration,
    maxDuration, 
    hasStruggle,
    strugglePattern,
    limit = 10,
    offset = 0
  } = options;

  // Handle empty sessions
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  let filteredSessions = [...sessions];

  // Apply filters
  if (project) {
    filteredSessions = filteredSessions.filter(session => 
      session.projectName && session.projectName.toLowerCase().includes(project.toLowerCase())
    );
  }

  if (minDuration !== undefined) {
    filteredSessions = filteredSessions.filter(session => 
      session.durationSeconds >= minDuration
    );
  }

  if (maxDuration !== undefined) {
    filteredSessions = filteredSessions.filter(session => 
      session.durationSeconds <= maxDuration
    );
  }

  if (hasStruggle !== undefined) {
    filteredSessions = filteredSessions.filter(session => 
      Boolean(session.hasStruggle) === hasStruggle
    );
  }

  if (strugglePattern) {
    filteredSessions = filteredSessions.filter(session => 
      session.struggleIndicators && 
      session.struggleIndicators.includes(strugglePattern)
    );
  }

  // Search and rank by keyword if provided
  let results;
  if (keyword) {
    results = searchByKeyword(filteredSessions, keyword);
  } else {
    // No keyword search - return sessions with basic info
    results = filteredSessions.map(session => ({
      sessionId: session.sessionId,
      projectName: session.projectName,
      durationSeconds: session.durationSeconds,
      hasStruggle: session.hasStruggle,
      struggleIndicators: session.struggleIndicators || [],
      relevanceScore: 1.0, // Base relevance when no keyword search
      matchContext: '',
      summary: generateSessionSummary(session)
    }));
  }

  // Sort by relevance score (highest first)
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Apply pagination
  const startIndex = Math.max(0, offset);
  const endIndex = startIndex + limit;
  
  return results.slice(startIndex, endIndex);
}

/**
 * Search sessions by keyword and calculate relevance scores
 * @param {Array} sessions - Sessions to search
 * @param {string} keyword - Keyword to search for
 * @returns {Array} Sessions with relevance scores and match context
 */
function searchByKeyword(sessions, keyword) {
  const results = [];
  const lowerKeyword = keyword.toLowerCase();

  for (const session of sessions) {
    const matches = findKeywordMatches(session, lowerKeyword);
    
    if (matches.totalScore > 0) {
      results.push({
        sessionId: session.sessionId,
        projectName: session.projectName,
        durationSeconds: session.durationSeconds,
        hasStruggle: session.hasStruggle,
        struggleIndicators: session.struggleIndicators || [],
        relevanceScore: matches.totalScore,
        matchContext: matches.context,
        summary: generateSessionSummary(session)
      });
    }
  }

  return results;
}

/**
 * Find keyword matches in session content and calculate relevance
 * @param {Object} session - Session to search
 * @param {string} lowerKeyword - Lowercase keyword
 * @returns {Object} Match information with score and context
 */
function findKeywordMatches(session, lowerKeyword) {
  let totalScore = 0;
  let matchContext = '';
  const maxContextLength = 150;

  // Search in conversation content
  if (session.conversation && Array.isArray(session.conversation)) {
    for (const message of session.conversation) {
      if (message.content) {
        const content = message.content.toLowerCase();
        const keywordCount = (content.match(new RegExp(lowerKeyword, 'g')) || []).length;
        
        if (keywordCount > 0) {
          // Score based on frequency and message type
          const messageScore = keywordCount * (message.type === 'user' ? 2 : 1);
          totalScore += messageScore;
          
          // Extract context around first match if not already set
          if (!matchContext) {
            const keywordIndex = content.indexOf(lowerKeyword);
            const contextStart = Math.max(0, keywordIndex - 50);
            const contextEnd = Math.min(content.length, keywordIndex + maxContextLength - 50);
            matchContext = message.content.substring(contextStart, contextEnd);
            
            // Truncate if needed
            if (matchContext.length >= maxContextLength) {
              matchContext = matchContext.substring(0, maxContextLength - 3) + '...';
            }
          }
        }
      }
    }
  }

  // Bonus points for project name matches
  if (session.projectName && session.projectName.toLowerCase().includes(lowerKeyword)) {
    totalScore += 3;
    if (!matchContext) {
      matchContext = `Project: ${session.projectName}`;
    }
  }

  // Bonus points for struggle indicator matches
  if (session.struggleIndicators && Array.isArray(session.struggleIndicators)) {
    for (const indicator of session.struggleIndicators) {
      if (indicator.toLowerCase().includes(lowerKeyword)) {
        totalScore += 2;
        if (!matchContext) {
          matchContext = `Struggle pattern: ${indicator}`;
        }
      }
    }
  }

  return {
    totalScore,
    context: matchContext
  };
}

/**
 * Generate a summary of session information
 * @param {Object} session - Session to summarize
 * @returns {string} Session summary
 */
function generateSessionSummary(session) {
  const parts = [];
  
  parts.push(`${Math.round(session.durationSeconds / 60)}min session`);
  
  if (session.projectName) {
    parts.push(`Project: ${session.projectName}`);
  }
  
  if (session.toolCount) {
    parts.push(`${session.toolCount} tools`);
  }
  
  if (session.conversation && session.conversation.length) {
    parts.push(`${session.conversation.length} messages`);
  }
  
  if (session.hasStruggle) {
    parts.push('Had struggles');
  }

  return parts.join(' • ');
}

/**
 * Validate search options
 * @param {Object} options - Search options to validate
 * @throws {Error} If options are invalid
 */
function validateSearchOptions(options) {
  if (options.limit !== undefined) {
    if (typeof options.limit !== 'number' || options.limit <= 0) {
      throw new Error('limit must be positive');
    }
  }

  if (options.offset !== undefined) {
    if (typeof options.offset !== 'number' || options.offset < 0) {
      throw new Error('offset must be non-negative');  
    }
  }

  if (options.minDuration !== undefined && options.maxDuration !== undefined) {
    if (options.minDuration > options.maxDuration) {
      throw new Error('minDuration cannot be greater than maxDuration');
    }
  }
}