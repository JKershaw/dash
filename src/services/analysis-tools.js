/**
 * @file Analysis Tools for Enhanced Session Investigation
 * Provides tool definitions and handlers for LLM deep-dive analysis
 */

import { promises as fs } from 'fs';
import { findScriptFile } from '../infrastructure/file-management/paths.js';
import { calculateStruggleScore } from './llm/utilities.js';
import { searchSessions } from './enhanced-analysis-tools.js';
import { KnowledgeGraph, getKnowledgeGraphPath } from './knowledge-graph.js';
import { extractContentText } from './knowledge-extraction.js';

/**
 * Tool definitions for session analysis
 * These enable the LLM to investigate specific sessions and patterns
 */
export const analysisTools = [
  {
    name: 'search_sessions',
    description: 'Search and filter sessions using keywords, project names, duration, struggle patterns with relevance ranking',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to search for in conversation content (case-insensitive)',
        },
        project: {
          type: 'string',
          description: 'Filter by project name (partial match)',
        },
        minDuration: {
          type: 'number',
          description: 'Minimum session duration in seconds',
        },
        maxDuration: {
          type: 'number',
          description: 'Maximum session duration in seconds',
        },
        hasStruggle: {
          type: 'boolean',
          description: 'Filter by struggle indicator (true for struggling sessions, false for smooth sessions)',
        },
        strugglePattern: {
          type: 'string',
          description: 'Filter by specific struggle pattern (e.g., "compilation_errors", "long_session")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10,
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip for pagination',
          default: 0,
        },
      },
    },
  },
  {
    name: 'get_session_details',
    description: 'Get detailed information about a specific session by its ID',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to retrieve detailed information for',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'find_struggling_sessions',
    description: 'Find sessions that show struggle indicators (long duration, many tools, errors), with optional pattern search',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of struggling sessions to return',
          default: 5,
        },
        pattern: {
          type: 'string',
          description: 'Optional pattern to search for in project names, struggle indicators, or errors',
        },
      },
    },
  },
  {
    name: 'get_session_script',
    description:
      'Load the complete detailed script content for a specific session to analyze full conversation flow and tool usage patterns',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to load the script for',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'analyze_patterns',
    description: 'Automated clustering of struggle types, error patterns, and resolution strategies with quantified metrics',
    input_schema: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description: 'Analysis focus: "struggle_types", "errors", "tools", or "all"',
          default: 'all',
        },
        minFrequency: {
          type: 'number',
          description: 'Minimum frequency threshold for pattern inclusion (percentage)',
          default: 5,
        },
      },
    },
  },
  {
    name: 'analyze_error_patterns',
    description: 'Specialized error pattern analysis that automatically categorizes all error types, provides frequency counts, and suggests representative examples with actionable insights',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Error category focus: "syntax", "logic", "tooling", "file_operations", or "all"',
          default: 'all',
        },
        includeExamples: {
          type: 'boolean',
          description: 'Include representative session examples for each error pattern',
          default: true,
        },
        minOccurrences: {
          type: 'number',
          description: 'Minimum occurrences required to include an error pattern',
          default: 2,
        },
      },
    },
  },
  {
    name: 'find_similar_sessions',
    description: 'Find sessions with similar concepts, errors, or patterns. Useful for identifying recurring issues or related work.',
    input_schema: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technical concepts or topics to search for (e.g. ["react", "testing", "api"])'
        },
        errors: {
          type: 'array', 
          items: { type: 'string' },
          description: 'Error patterns or messages to match (e.g. ["module not found", "build failed"])'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of similar sessions to return',
          default: 5
        }
      },
      required: []
    }
  },
  {
    name: 'get_historical_solutions',
    description: 'Find solutions that worked for similar errors or issues in previous sessions.',
    input_schema: {
      type: 'object',
      properties: {
        errorPattern: {
          type: 'string',
          description: 'Error message or pattern to find solutions for'
        },
        contextConcepts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional context concepts to improve solution relevance'
        },
        limit: {
          type: 'integer', 
          description: 'Maximum number of solutions to return',
          default: 5
        }
      },
      required: ['errorPattern']
    }
  },
  {
    name: 'get_user_messages',
    description: 'Extract only user-submitted messages from a session, providing concentrated signal for intent and satisfaction analysis without the overwhelming context of AI responses.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to extract user messages from'
        },
        includeTimestamps: {
          type: 'boolean',
          description: 'Whether to include message timestamps in the response',
          default: true
        },
        maxLength: {
          type: 'number',
          description: 'Maximum character length for each message content (prevents token bloat)',
          default: 500
        }
      },
      required: ['sessionId']
    }
  }
];

/**
 * Handle tool calls from the LLM during analysis
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} toolInput - Input parameters for the tool
 * @param {Array} sessions - Array of session data to search/analyze
 * @returns {Promise<Object>} Tool execution result
 */
export async function handleToolCall(toolName, toolInput, sessions) {
  switch (toolName) {
    case 'search_sessions':
      return searchSessions(sessions, toolInput);

    case 'get_session_details':
      return getSessionById(sessions, toolInput.sessionId);

    case 'find_struggling_sessions':
      return findStruggingSessions(sessions, toolInput.limit || 5, toolInput.pattern);

    case 'get_session_script':
      return await getSessionScript(toolInput.sessionId);

    case 'analyze_patterns':
      return analyzePatterns(sessions, toolInput.focus || 'all', toolInput.minFrequency || 5);

    case 'analyze_error_patterns':
      return analyzeErrorPatterns(sessions, toolInput.category || 'all', toolInput.includeExamples !== false, toolInput.minOccurrences || 2);

    case 'find_similar_sessions':
      try {
        const knowledgeGraph = new KnowledgeGraph(getKnowledgeGraphPath());
        const results = await knowledgeGraph.findSimilarSessions(
          toolInput.concepts || [],
          toolInput.errors || []
        );
        
        return {
          similarSessions: results.slice(0, toolInput.limit || 5).map(result => ({
            sessionId: result.sessionId,
            project: result.project,
            concepts: result.concepts,
            errors: result.errors,
            solutions: result.solutions,
            similarityScore: result.similarityScore
          }))
        };
      } catch (error) {
        return { error: `Failed to find similar sessions: ${error.message}` };
      }

    case 'get_historical_solutions':
      try {
        const knowledgeGraph = new KnowledgeGraph(getKnowledgeGraphPath());
        const solutions = await knowledgeGraph.getSolutionsForError(
          toolInput.errorPattern,
          toolInput.contextConcepts || []
        );
        
        return {
          solutions: solutions.slice(0, toolInput.limit || 5).map(solution => ({
            solution: solution.solution,
            sessionId: solution.sessionId,
            project: solution.project,
            context: solution.context,
            relevanceScore: solution.relevanceScore,
            errorMatched: solution.errorMatched
          }))
        };
      } catch (error) {
        return { error: `Failed to get historical solutions: ${error.message}` };
      }

    case 'get_user_messages':
      return getUserMessages(
        sessions, 
        toolInput.sessionId,
        toolInput.includeTimestamps !== false,
        toolInput.maxLength || 500
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}


/**
 * Extract user messages from a specific session with safe truncation limits
 * @param {Array} sessions - Sessions to search
 * @param {string} sessionId - ID of session to extract messages from
 * @param {boolean} includeTimestamps - Whether to include timestamps (default: true)
 * @param {number} maxLength - Maximum character length for message content (default: 500)
 * @returns {Object} User messages with metadata or error
 */
function getUserMessages(sessions, sessionId, includeTimestamps = true, maxLength = 500) {
  const session = sessions.find(s => s.sessionId === sessionId);
  
  if (!session) {
    return {
      error: 'Session not found',
      sessionId: sessionId,
      message: `Session with ID '${sessionId}' not found. Available sessions: ${sessions.length}`
    };
  }

  // Safety limits to prevent massive outputs
  const MAX_TOTAL_CHARS = 15000;  // Total character limit across all messages (~3.7k tokens)
  // No message count limit - let tool caller decide via parameters

  const userMessages = [];
  let totalSignalChars = 0;

  // Handle missing or null conversation
  if (!session.conversation || !Array.isArray(session.conversation)) {
    return {
      sessionId: sessionId,
      userMessages: [],
      messageCount: 0,
      totalSignalChars: 0
    };
  }

  for (const message of session.conversation) {
    // Check if this is a user message (using both role and type fields)
    const isUserMessage = message.role === 'user' || message.type === 'user';
    
    if (isUserMessage) {
      const content = extractContentText(message);
      
      if (content && content.trim().length > 0) {
        let processedContent = content.trim();
        
        // Apply per-message length truncation
        if (processedContent.length > maxLength) {
          processedContent = processedContent.substring(0, maxLength) + '...';
        }

        // Check if adding this message would exceed total char limit
        if (totalSignalChars + processedContent.length > MAX_TOTAL_CHARS) {
          // Truncate this message to fit within total limit
          const remainingSpace = MAX_TOTAL_CHARS - totalSignalChars;
          if (remainingSpace > 10) { // Only add if we have meaningful space left
            processedContent = processedContent.substring(0, remainingSpace - 3) + '...';
          } else {
            break; // Skip this message entirely
          }
        }
        
        const userMessage = {
          content: processedContent,
          charCount: processedContent.length
        };
        
        // Add timestamp if requested and available
        if (includeTimestamps && message.timestamp) {
          userMessage.timestamp = message.timestamp;
        }
        
        userMessages.push(userMessage);
        totalSignalChars += processedContent.length;

        // Stop if we've hit total character limit (main safety mechanism)
        if (totalSignalChars >= MAX_TOTAL_CHARS) {
          break;
        }
      }
    }
  }

  return {
    sessionId: sessionId,
    userMessages: userMessages,
    messageCount: userMessages.length,
    totalSignalChars: totalSignalChars,
    truncated: totalSignalChars >= MAX_TOTAL_CHARS
  };
}

/**
 * Get detailed information about a specific session
 * @param {Array} sessions - Sessions to search
 * @param {string} sessionId - ID of session to retrieve
 * @returns {Object} Session details or error
 */
function getSessionById(sessions, sessionId) {
  const session = sessions.find(s => s.sessionId === sessionId);

  if (!session) {
    return {
      error: 'Session not found',
      sessionId: sessionId,
      availableSessions: sessions.length,
    };
  }

  return {
    sessionId: session.sessionId,
    projectName: session.projectName || 'Unknown',
    duration: Math.round(session.durationSeconds || 0),
    activeDuration: Math.round(session.activeDurationSeconds || 0),
    startTime: session.startTime,
    endTime: session.endTime,
    hasStruggle: session.hasStruggle || false,
    toolCount: session.toolCount || 0,
    toolOperations: (session.toolOperations || []).length,
    conversationMessages: (session.conversation || []).length,
    entryCount: session.entryCount || 0,
    humanMessageCount: session.humanMessageCount || 0,
    assistantMessageCount: session.assistantMessageCount || 0,
    errors: session.errors || [],
    struggleIndicators: session.struggleIndicators || [],
    dataQualityIssues: session.dataQualityIssues || [],
  };
}

/**
 * Find sessions with struggle indicators, optionally filtered by pattern
 * @param {Array} sessions - Sessions to analyze
 * @param {number} limit - Maximum results to return
 * @param {string} pattern - Optional pattern to search for in project names, indicators, errors
 * @returns {Array} Sessions showing struggle patterns
 */
function findStruggingSessions(sessions, limit = 5, pattern = null) {
  // Filter sessions that show struggle indicators
  let filteredSessions = sessions.filter(session => {
    return (
      session.hasStruggle ||
      (session.durationSeconds && session.durationSeconds > 1800) || // > 30 minutes
      (session.toolCount && session.toolCount > 30) || // Many tools
      (session.errors && session.errors.length > 0) ||
      (session.struggleIndicators && session.struggleIndicators.length > 0)
    );
  });

  // Apply pattern search if provided
  if (pattern) {
    try {
      const regex = new RegExp(pattern, 'i'); // Case-insensitive search
      filteredSessions = filteredSessions.filter(session => {
        // Search in project name
        if (session.projectName && regex.test(session.projectName)) {
          return true;
        }
        // Search in struggle indicators
        if (session.struggleIndicators && Array.isArray(session.struggleIndicators)) {
          if (session.struggleIndicators.some(indicator => regex.test(indicator))) {
            return true;
          }
        }
        // Search in errors
        if (session.errors && Array.isArray(session.errors)) {
          if (session.errors.some(error => regex.test(JSON.stringify(error)))) {
            return true;
          }
        }
        // Search in data quality issues
        if (session.dataQualityIssues && Array.isArray(session.dataQualityIssues)) {
          if (session.dataQualityIssues.some(issue => regex.test(issue))) {
            return true;
          }
        }
        return false;
      });
    } catch (error) {
      // If pattern is invalid, ignore it and proceed without filtering
      console.warn(`Invalid pattern '${pattern}': ${error.message}`);
    }
  }

  const strugglingSessions = filteredSessions;

  // Sort by duration (longest first) to prioritize most problematic sessions
  const strugglingSessionsSorted = strugglingSessions.sort(
    (a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0)
  );

  return strugglingSessionsSorted.slice(0, limit).map(session => ({
    sessionId: session.sessionId,
    projectName: session.projectName || 'Unknown',
    duration: Math.round(session.durationSeconds || 0),
    toolCount: session.toolCount || 0,
    errorCount: session.errors?.length || 0,
    indicators: session.struggleIndicators || [],
    issues: session.dataQualityIssues || [],
    hasStruggle: session.hasStruggle || false,
    // Struggle score for ranking
    struggleScore: calculateStruggleScore(session),
  }));
}

/**
 * Load detailed script content for a specific session
 * @param {string} sessionId - Session ID to load script for
 * @param {number} limit - Maximum number of lines to return
 * @returns {Promise<Object>} Script content or error
 */
async function getSessionScript(sessionId) {
  try {
    const scriptPath = await findScriptFile(sessionId);

    if (!scriptPath) {
      return {
        error: 'Script file not found',
        sessionId: sessionId,
        message: 'No script file exists for this session. It may not have been processed yet.',
      };
    }

    const scriptContent = await fs.readFile(scriptPath, 'utf-8');
    const lines = scriptContent.split('\n');

    // Smart truncation: preserve key sections and limit total length
    const {
      content: intelligentContent,
      truncated,
      summary,
    } = intelligentTruncation(scriptContent);

    // Debug: Track content size
    const originalChars = scriptContent.length;
    const truncatedChars = intelligentContent.length;
    const estimatedOriginalTokens = Math.ceil(originalChars / 4);
    const estimatedTruncatedTokens = Math.ceil(truncatedChars / 4);

    console.log(`🔍 Script Content Debug - Session: ${sessionId}`);
    console.log(
      `   Original: ${lines.length} lines, ${originalChars} chars (~${estimatedOriginalTokens} tokens)`
    );
    console.log(
      `   Returned: ${intelligentContent.split('\n').length} lines, ${truncatedChars} chars (~${estimatedTruncatedTokens} tokens)`
    );
    console.log(`   Truncated: ${truncated} ${truncated ? '✂️' : '✅'}`);

    return {
      sessionId: sessionId,
      scriptPath: scriptPath,
      totalLines: lines.length,
      returnedLines: intelligentContent.split('\n').length,
      truncated: truncated,
      content: intelligentContent,
      truncationSummary: summary,
    };
  } catch (error) {
    return {
      error: 'Failed to read script file',
      sessionId: sessionId,
      message: error.message,
    };
  }
}

/**
 * Intelligently truncate script content to preserve most important parts
 * @param {string} scriptContent - Full script content
 * @param {number} maxLines - Maximum number of lines to preserve (default: 1500, reduced from 2500)
 * @param {number} maxChars - Maximum number of characters to preserve (default: 50000, ~12.5k tokens)
 * @returns {Object} - Truncated content with metadata
 */
export function intelligentTruncation(scriptContent, maxLines = 1500, maxChars = 50000) {
  const lines = scriptContent.split('\n');
  
  // Apply character-based truncation first if content is too large
  let workingContent = scriptContent;
  let charTruncated = false;
  
  if (scriptContent.length > maxChars) {
    workingContent = scriptContent.substring(0, maxChars) + '\n\n[TRUNCATED: Content exceeded 50k characters]';
    charTruncated = true;
  }
  
  // Re-split after potential character truncation
  const workingLines = workingContent.split('\n');

  if (workingLines.length <= maxLines && !charTruncated) {
    return { content: workingContent, truncated: false, summary: null };
  }

  // Work with the potentially char-truncated content
  const linesToUse = workingLines;

  // Preserve header (first 20 lines - contains session metadata)
  const _header = linesToUse.slice(0, 20);

  // Find key sections to preserve
  const keyLineIndices = [];
  const keyPatterns = [
    /USER:/i, // User messages
    /CLAUDE:/i, // Claude responses
    /Tool:/i, // Tool operations
    /error/i, // Error messages
    /fail/i, // Failures
    /struggle/i, // Struggle indicators
    /problem/i, // Problem indicators
  ];

  linesToUse.forEach((line, index) => {
    if (keyPatterns.some(pattern => pattern.test(line))) {
      keyLineIndices.push(index);
    }
  });

  // Build truncated content with context around key lines
  const preservedLines = new Set();
  const contextRadius = 2; // Lines before/after key lines to preserve

  // Add header
  for (let i = 0; i < 20 && i < linesToUse.length; i++) {
    preservedLines.add(i);
  }

  // Add key lines with context
  keyLineIndices.forEach(keyIndex => {
    for (
      let i = Math.max(0, keyIndex - contextRadius);
      i <= Math.min(linesToUse.length - 1, keyIndex + contextRadius);
      i++
    ) {
      preservedLines.add(i);
    }
  });

  // Convert to sorted array and take first maxLines
  const sortedIndices = Array.from(preservedLines)
    .sort((a, b) => a - b)
    .slice(0, maxLines - 50);

  // Add footer summary
  const footerStart = Math.max(0, linesToUse.length - 30);
  for (let i = footerStart; i < linesToUse.length; i++) {
    if (sortedIndices.length < maxLines) {
      sortedIndices.push(i);
    }
  }

  // Build final content
  let truncatedContent = '';
  let lastIndex = -1;

  sortedIndices.forEach(index => {
    if (index > lastIndex + 1) {
      truncatedContent += '\n[... content truncated ...]\n\n';
    }
    truncatedContent += linesToUse[index] + '\n';
    lastIndex = index;
  });

  // Build comprehensive summary
  let summary = `Intelligently truncated from ${lines.length} to ${sortedIndices.length} lines`;
  if (charTruncated) {
    summary += ` and from ${scriptContent.length} to ${maxChars} characters`;
  }
  summary += ', preserving header, key interactions, and footer. Focused on user messages, tool operations, and error/struggle indicators.';

  return {
    content: truncatedContent,
    truncated: true,
    summary: summary,
  };
}

/**
 * Analyze patterns across sessions for automated clustering and metrics
 * @param {Array} sessions - Sessions to analyze
 * @param {string} focus - Analysis focus: "struggle_types", "errors", "tools", or "all"
 * @param {number} minFrequency - Minimum frequency threshold (percentage)
 * @returns {Object} Pattern analysis results with quantified metrics
 */
function analyzePatterns(sessions, focus = 'all', minFrequency = 5) {
  const totalSessions = sessions.length;
  const strugglingSessionsCount = sessions.filter(s => s.hasStruggle).length;
  const strugglingPercentage = Math.round((strugglingSessionsCount / totalSessions) * 100);

  const analysis = {
    overview: {
      totalSessions,
      strugglingSessionsCount,
      strugglingPercentage: `${strugglingPercentage}%`,
      analysisDate: new Date().toISOString().split('T')[0]
    },
    patterns: {}
  };

  // Analyze struggle types
  if (focus === 'struggle_types' || focus === 'all') {
    const struggleTypes = {};
    sessions.forEach(session => {
      if (session.struggleIndicators && Array.isArray(session.struggleIndicators)) {
        session.struggleIndicators.forEach(indicator => {
          struggleTypes[indicator] = (struggleTypes[indicator] || 0) + 1;
        });
      }
    });

    const significantStruggles = Object.entries(struggleTypes)
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / totalSessions) * 100),
        sessionsAffected: count
      }))
      .filter(item => item.percentage >= minFrequency)
      .sort((a, b) => b.count - a.count);

    analysis.patterns.struggleTypes = {
      totalUniqueTypes: Object.keys(struggleTypes).length,
      significantPatterns: significantStruggles,
      insights: [`Top struggle type affects ${significantStruggles[0]?.percentage || 0}% of sessions`]
    };
  }

  // Analyze error patterns
  if (focus === 'errors' || focus === 'all') {
    const errorPatterns = {};
    let totalErrors = 0;

    sessions.forEach(session => {
      if (session.errors && Array.isArray(session.errors)) {
        totalErrors += session.errors.length;
        session.errors.forEach(error => {
          const errorType = error.type || error.name || 'unknown_error';
          errorPatterns[errorType] = (errorPatterns[errorType] || 0) + 1;
        });
      }
    });

    const significantErrors = Object.entries(errorPatterns)
      .map(([type, count]) => ({
        errorType: type,
        count,
        percentage: Math.round((count / totalSessions) * 100),
        sessionsAffected: count
      }))
      .filter(item => item.percentage >= minFrequency)
      .sort((a, b) => b.count - a.count);

    analysis.patterns.errorPatterns = {
      totalErrors,
      totalUniqueErrorTypes: Object.keys(errorPatterns).length,
      significantPatterns: significantErrors,
      insights: [`${Math.round((totalErrors / totalSessions) * 100)}% average errors per session`]
    };
  }

  // Analyze tool usage patterns
  if (focus === 'tools' || focus === 'all') {
    const toolUsage = {};
    const problematicTools = {};

    sessions.forEach(session => {
      if (session.toolOperations && Array.isArray(session.toolOperations)) {
        session.toolOperations.forEach(op => {
          toolUsage[op.name] = (toolUsage[op.name] || 0) + 1;
          if (op.status === 'error') {
            problematicTools[op.name] = (problematicTools[op.name] || 0) + 1;
          }
        });
      }
    });

    const toolAnalysis = Object.entries(toolUsage)
      .map(([tool, usageCount]) => ({
        toolName: tool,
        totalUsage: usageCount,
        errorCount: problematicTools[tool] || 0,
        errorRate: problematicTools[tool] ? Math.round((problematicTools[tool] / usageCount) * 100) : 0,
        usagePercentage: Math.round((usageCount / totalSessions) * 100)
      }))
      .filter(item => item.usagePercentage >= minFrequency)
      .sort((a, b) => b.totalUsage - a.totalUsage);

    analysis.patterns.toolUsage = {
      totalUniqueTools: Object.keys(toolUsage).length,
      significantPatterns: toolAnalysis,
      insights: [
        `Most used tool: ${toolAnalysis[0]?.toolName || 'none'} (${toolAnalysis[0]?.usagePercentage || 0}% of sessions)`,
        `Highest error rate: ${toolAnalysis.sort((a, b) => b.errorRate - a.errorRate)[0]?.toolName || 'none'}`
      ]
    };
  }

  // Add summary insights
  analysis.summary = {
    keyFindings: [
      `${strugglingPercentage}% of sessions show struggle indicators`,
      `Analysis identified ${Object.keys(analysis.patterns).length} pattern categories`,
      `Patterns with >${minFrequency}% frequency included in results`
    ],
    recommendations: [
      'Focus improvement efforts on top struggle patterns identified',
      'Monitor high-error-rate tools for usability issues',
      'Consider automation for frequently repeated manual processes'
    ]
  };

  return analysis;
}


/**
 * Specialized error pattern analysis with automatic categorization and actionable insights
 * @param {Array} sessions - Sessions to analyze
 * @param {string} category - Category focus: "syntax", "logic", "tooling", "file_operations", or "all"
 * @param {boolean} includeExamples - Whether to include representative session examples
 * @param {number} minOccurrences - Minimum occurrences to include a pattern
 * @returns {Object} Detailed error pattern analysis with actionable insights
 */
function analyzeErrorPatterns(sessions, category = 'all', includeExamples = true, minOccurrences = 2) {
  const totalSessions = sessions.length;
  const analysis = {
    overview: {
      totalSessions,
      analysisCategory: category,
      minOccurrences,
      analysisDate: new Date().toISOString().split('T')[0]
    },
    errorCategories: {},
    actionableInsights: [],
    representativeExamples: {}
  };

  // Error pattern collectors
  const errorPatterns = {};
  const errorsByTool = {};
  const errorsBySession = {};
  let totalErrorOperations = 0;

  // Analyze all sessions for error patterns
  sessions.forEach(session => {
    const sessionErrors = [];
    
    // Analyze tool operation errors
    if (session.toolOperations && Array.isArray(session.toolOperations)) {
      session.toolOperations.forEach(op => {
        if (op.status === 'error' && op.output) {
          totalErrorOperations++;
          const errorPattern = categorizeError(op.name, op.output, op.input);
          
          // Track pattern frequency
          const patternKey = `${errorPattern.category}_${errorPattern.type}`;
          if (!errorPatterns[patternKey]) {
            errorPatterns[patternKey] = {
              category: errorPattern.category,
              type: errorPattern.type,
              toolName: op.name,
              description: errorPattern.description,
              count: 0,
              sessions: new Set(),
              examples: []
            };
          }
          
          errorPatterns[patternKey].count++;
          errorPatterns[patternKey].sessions.add(session.sessionId);
          
          // Store example if requested
          if (includeExamples && errorPatterns[patternKey].examples.length < 3) {
            errorPatterns[patternKey].examples.push({
              sessionId: session.sessionId,
              operationIndex: op.operationIndex,
              input: op.input,
              output: op.output?.substring(0, 200) + (op.output?.length > 200 ? '...' : '')
            });
          }
          
          // Track by tool
          if (!errorsByTool[op.name]) {
            errorsByTool[op.name] = { count: 0, patterns: new Set() };
          }
          errorsByTool[op.name].count++;
          errorsByTool[op.name].patterns.add(patternKey);
          
          sessionErrors.push(errorPattern);
        }
      });
    }
    
    // Track sessions with errors
    if (sessionErrors.length > 0) {
      errorsBySession[session.sessionId] = sessionErrors;
    }
  });

  // Filter patterns by category and minimum occurrences
  const filteredPatterns = Object.entries(errorPatterns)
    .filter(([_, pattern]) => {
      if (pattern.count < minOccurrences) return false;
      if (category === 'all') return true;
      return pattern.category === category;
    })
    .sort(([_, a], [__, b]) => b.count - a.count);

  // Organize by category
  filteredPatterns.forEach(([_patternKey, pattern]) => {
    const cat = pattern.category;
    if (!analysis.errorCategories[cat]) {
      analysis.errorCategories[cat] = {
        totalPatterns: 0,
        patterns: [],
        sessionsAffected: 0,
        topTools: []
      };
    }
    
    analysis.errorCategories[cat].patterns.push({
      type: pattern.type,
      description: pattern.description,
      occurrences: pattern.count,
      sessionsAffected: pattern.sessions.size,
      affectedPercentage: Math.round((pattern.sessions.size / totalSessions) * 100),
      primaryTool: pattern.toolName,
      examples: includeExamples ? pattern.examples : undefined
    });
    
    analysis.errorCategories[cat].totalPatterns++;
    analysis.errorCategories[cat].sessionsAffected = Math.max(
      analysis.errorCategories[cat].sessionsAffected, 
      pattern.sessions.size
    );
  });

  // Generate actionable insights
  const sessionsWithErrors = Object.keys(errorsBySession).length;
  const errorRate = Math.round((sessionsWithErrors / totalSessions) * 100);
  
  analysis.overview.sessionsWithErrors = sessionsWithErrors;
  analysis.overview.errorRate = `${errorRate}%`;
  analysis.overview.totalErrorOperations = totalErrorOperations;

  // Top error patterns for insights
  const topPatterns = filteredPatterns.slice(0, 3);
  
  if (topPatterns.length > 0) {
    analysis.actionableInsights.push(
      `${errorRate}% of sessions contain tool operation errors (${sessionsWithErrors}/${totalSessions} sessions)`
    );
    
    topPatterns.forEach(([_, pattern], index) => {
      const ranking = index === 0 ? 'Most common' : index === 1 ? 'Second most common' : 'Third most common';
      analysis.actionableInsights.push(
        `${ranking} error: ${pattern.description} (${pattern.count} occurrences across ${pattern.sessions.size} sessions)`
      );
    });
  }

  // Tool-specific insights
  const problematicTools = Object.entries(errorsByTool)
    .sort(([_, a], [__, b]) => b.count - a.count)
    .slice(0, 3);
    
  if (problematicTools.length > 0) {
    analysis.actionableInsights.push(
      `Tools with highest error rates: ${problematicTools.map(([tool, data]) => 
        `${tool} (${data.count} errors)`).join(', ')}`
    );
  }

  // Category-specific recommendations
  Object.entries(analysis.errorCategories).forEach(([cat, data]) => {
    if (data.patterns.length > 0) {
      const topPattern = data.patterns[0];
      switch (cat) {
        case 'file_operations':
          analysis.actionableInsights.push(
            `File operation issues: Focus on ${topPattern.type} - affects ${topPattern.affectedPercentage}% of sessions`
          );
          break;
        case 'string_operations':
          analysis.actionableInsights.push(
            `String matching problems: ${topPattern.description} suggests need for better file content validation`
          );
          break;
        case 'tooling':
          analysis.actionableInsights.push(
            `Tool execution issues: ${topPattern.description} may indicate environment or configuration problems`
          );
          break;
        case 'user_interruption':
          analysis.actionableInsights.push(
            `User workflow issues: ${topPattern.description} suggests UX improvements needed`
          );
          break;
      }
    }
  });

  return analysis;
}

/**
 * Categorize an error based on tool name, output, and input
 * @param {string} toolName - Name of the tool that errored
 * @param {string} errorOutput - Error message/output
 * @param {Object} toolInput - Input that caused the error
 * @returns {Object} Error categorization
 */
function categorizeError(toolName, errorOutput, _toolInput) {
  const output = errorOutput.toLowerCase();
  
  // File operation errors
  if (output.includes('string to replace not found')) {
    return {
      category: 'string_operations',
      type: 'string_replacement_failure',
      description: 'String replacement failed - target string not found in file'
    };
  }
  
  if (output.includes('file not found') || output.includes('no such file')) {
    return {
      category: 'file_operations',
      type: 'file_not_found',
      description: 'File operation failed - target file does not exist'
    };
  }
  
  if (output.includes('permission denied') || output.includes('access denied')) {
    return {
      category: 'file_operations',
      type: 'permission_denied',
      description: 'File operation failed - insufficient permissions'
    };
  }
  
  // User interruption
  if (output.includes("user doesn't want to proceed") || output.includes('user interrupted')) {
    return {
      category: 'user_interruption',
      type: 'user_cancelled',
      description: 'User cancelled or interrupted tool operation'
    };
  }
  
  // Command/tool execution errors
  if (output.includes('command not found') || output.includes('command failed')) {
    return {
      category: 'tooling',
      type: 'command_execution_failure',
      description: 'Command execution failed - command not available or failed to run'
    };
  }
  
  if (output.includes('syntax error') || output.includes('invalid syntax')) {
    return {
      category: 'syntax',
      type: 'syntax_error',
      description: 'Syntax error in code or command'
    };
  }
  
  if (output.includes('timeout') || output.includes('timed out')) {
    return {
      category: 'tooling',
      type: 'timeout',
      description: 'Operation timed out'
    };
  }
  
  // Network/connection errors
  if (output.includes('connection') && (output.includes('failed') || output.includes('refused'))) {
    return {
      category: 'network',
      type: 'connection_failure',
      description: 'Network connection failed'
    };
  }
  
  // Default categorization based on tool
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    return {
      category: 'file_operations',
      type: 'edit_operation_failure',
      description: 'File editing operation failed'
    };
  }
  
  if (toolName === 'Read') {
    return {
      category: 'file_operations', 
      type: 'read_operation_failure',
      description: 'File reading operation failed'
    };
  }
  
  if (toolName === 'Bash') {
    return {
      category: 'tooling',
      type: 'bash_command_failure', 
      description: 'Bash command execution failed'
    };
  }
  
  // Generic error
  return {
    category: 'unknown',
    type: 'unclassified_error',
    description: `Unclassified ${toolName} error`
  };
}
