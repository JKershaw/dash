import path from 'path';
import { calculateActiveDuration } from '../../domain/active-duration-calculator.js';
import { analyzeToolIntent } from '../../domain/context-analyzer.js';

/**
 * Extracts a text summary from various message content formats
 * @param {Object} msg - Message object
 * @returns {string} Content summary
 */
function extractContentSummary(msg) {
  // Handle direct string content
  if (typeof msg.content === 'string') {
    return msg.content.substring(0, 100);
  }
  
  // Handle array content (common in message formats)
  if (Array.isArray(msg.content)) {
    for (const item of msg.content) {
      if (item?.type === 'text' && item?.text) {
        return item.text.substring(0, 100);
      }
    }
  }
  
  // Handle nested message structure
  if (msg.message) {
    return extractContentSummary(msg.message);
  }
  
  return '[complex content]';
}

/**
 * Extracts project name from log entries, with fallback to file path.
 * @param {Array} logEntries - An array of log entries from the file.
 * @param {string} filePath - The path to the log file as fallback.
 * @returns {string} The extracted project name.
 */
function extractProjectName(logEntries, filePath) {
  // Try to extract from first few log entries that have a cwd field
  for (const entry of logEntries.slice(0, 5)) {
    // Check first 5 entries
    if (entry?.cwd && typeof entry.cwd === 'string' && entry.cwd.trim()) {
      const projectName = path.basename(entry.cwd.trim());

      // Skip empty or invalid project names
      if (projectName && projectName !== '.' && projectName !== '..') {
        return projectName;
      }
    }
  }

  // For summary-only files, mark them as low-value sessions
  if (logEntries.length > 0 && logEntries.every(entry => entry.type === 'summary')) {
    // These are typically summary-only sessions with limited value
    // Use "summary-session" as a generic project name that can be filtered out later
    return 'summary-session';
  }

  // Fallback to path-based extraction with improved logic
  const parts = filePath.split(path.sep);
  if (parts.length >= 2) {
    const fallbackName = parts[parts.length - 2];

    // If fallback is "logs" or similar generic names, extract from path above logs
    if (fallbackName === 'logs' || fallbackName === 'log' || fallbackName === 'sessions') {
      // Try to get project name from path above logs directory
      if (parts.length >= 3) {
        const parentName = path.basename(parts[parts.length - 3]);
        // Avoid returning problematic path segments that start with -
        if (
          parentName &&
          !parentName.startsWith('-') &&
          parentName !== '.' &&
          parentName !== '..'
        ) {
          return parentName;
        }
      }
      // If path above logs isn't helpful, use session ID as project name
      return path.basename(filePath, '.jsonl');
    }

    // Handle Claude Code project structure: -Users-work-development-project-name
    if (fallbackName.startsWith('-')) {
      // Extract project name from path like "-Users-work-development-ai-self-improvement-system"
      const pathSegments = fallbackName.substring(1).split('-'); // Remove leading - and split
      if (pathSegments.length >= 4) {
        // For "-Users-work-development-project-name", take everything after "development"
        const developmentIndex = pathSegments.findIndex(seg => seg === 'development');
        if (developmentIndex >= 0 && developmentIndex < pathSegments.length - 1) {
          return pathSegments.slice(developmentIndex + 1).join('-');
        }
      }
      // Fallback: just remove the leading - and take the last meaningful part
      const cleanedName = fallbackName.substring(1);
      if (cleanedName.includes('development-')) {
        return cleanedName.split('development-')[1];
      }
      // If can't parse the structure, fall back to session ID
      return path.basename(filePath, '.jsonl');
    }

    // Normal path segment (doesn't start with -)
    return fallbackName;
  }

  // Last resort: use filename without extension
  return path.basename(filePath, '.jsonl');
}

/**
 * Parses log entries and extracts session information.
 * @param {string} filePath - The path to the log file.
 * @param {Array} logEntries - An array of log entries from the file.
 * @returns {object|null} A parsed session object, or null if the log is empty.
 */
export function analyzeSession(filePath, logEntries) {
  if (!logEntries || logEntries.length === 0) {
    return null;
  }

  const session = {
    filePath,
    projectName: '',
    sessionId: '',
    startTime: null,
    endTime: null,
    durationSeconds: 0,
    activeDurationSeconds: 0,
    durationAnalysis: null,
    toolOperations: [],
    conversation: [],
    entryCount: logEntries.length,
    dataQualityIssues: [],
    // Enhanced metadata preservation
    _metadata: {
      analysisTimestamp: new Date().toISOString(),
      sourceEntryCount: logEntries.length,
      corruptedEntryCount: 0,
      provenanceTracking: true,
    },
    _provenance: {
      sourceFile: filePath,
      entryLineNumbers: [],
      corruptedEntries: [],
    },
  };

  // Extract session ID from file name
  session.sessionId = path.basename(filePath, '.jsonl');

  // Extract project name using improved logic that checks log entries first
  session.projectName = extractProjectName(logEntries, filePath);

  // Debug: Log project extraction for testing
  if (process.env.NODE_ENV === 'test') {
    console.log(`🔍 Project extraction: ${filePath} -> "${session.projectName}"`);
  }

  const pendingToolUses = new Map();

  // Process entries to extract timestamps, conversation, and tool operations.
  logEntries.forEach((entry, index) => {
    // Track provenance information
    if (entry._provenance) {
      session._provenance.entryLineNumbers.push(entry._provenance.lineNumber);
    }

    // Track corrupted entries for quality analysis
    if (entry._isCorrupted) {
      session._metadata.corruptedEntryCount++;
      session._provenance.corruptedEntries.push({
        index,
        lineNumber: entry._provenance?.lineNumber,
        error: entry._provenance?.parseError,
      });
      return; // Skip processing corrupted entries
    }

    const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
    if (timestamp) {
      if (!session.startTime || timestamp < session.startTime) {
        session.startTime = timestamp;
      }
      if (!session.endTime || timestamp > session.endTime) {
        session.endTime = timestamp;
      }
    } else if (entry.type !== 'summary') {
      session.dataQualityIssues.push(`Missing timestamp in an entry (type: ${entry.type}).`);
    }

    // Capture conversation context BEFORE adding current entry (for tool intent analysis)
    const conversationContext = [...session.conversation]; // Current conversation state

    if (entry.type !== 'summary') {
      // Preserve provenance and metadata in conversation entries
      const conversationEntry = {
        ...entry,
        _metadata: {
          entryIndex: session.conversation.length,
          timestamp: timestamp?.toISOString(),
          processingTimestamp: new Date().toISOString(),
        },
      };

      // Keep provenance if it exists
      if (entry._provenance) {
        conversationEntry._provenance = entry._provenance;
      }

      session.conversation.push(conversationEntry);
    }

    // Track tool uses that are initiated by the assistant.
    if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
      entry.message.content.forEach(contentItem => {
        if (contentItem.type === 'tool_use') {
          pendingToolUses.set(contentItem.id, contentItem);
        }
      });
    }

    // When a tool result is received, match it with the pending tool use.
    if (entry.type === 'user' && entry.message && Array.isArray(entry.message.content)) {
      entry.message.content.forEach(contentItem => {
        if (contentItem.type === 'tool_result' && contentItem.tool_use_id) {
          const toolUse = pendingToolUses.get(contentItem.tool_use_id);
          if (toolUse) {
            // Use conversation context from before current entry was added
            const relevantContext = conversationContext.slice(-5); // Last 5 messages

            const toolOperation = {
              name: toolUse.name,
              input: toolUse.input,
              output: contentItem.content,
              status: entry.toolUseResult?.status || (contentItem.is_error ? 'error' : 'success'),
              ...entry.toolUseResult,
              // Enhanced metadata and provenance tracking
              _metadata: {
                toolUseId: contentItem.tool_use_id,
                timestamp: timestamp?.toISOString(),
                operationIndex: session.toolOperations.length,
                processingTimestamp: new Date().toISOString(),
                errorCode: contentItem.is_error ? 'TOOL_ERROR' : null,
                outputSize: JSON.stringify(contentItem.content).length,
              },
              _provenance: {
                toolUseEntry: entry._provenance,
                resultEntry: entry._provenance,
                conversationIndex: session.conversation.length - 1,
              },
              // NEW: Context analysis
              _contextMetadata: {
                initiationType: analyzeToolIntent({ name: toolUse.name, input: toolUse.input }, relevantContext),
                precedingUserMessage: relevantContext.find(msg => msg.type === 'user' || msg.role === 'user') || null,
                conversationContext: relevantContext.map(msg => ({
                  type: msg.type || msg.role,
                  timestamp: msg.timestamp,
                  contentSummary: extractContentSummary(msg)
                }))
              }
            };
            session.toolOperations.push(toolOperation);
            pendingToolUses.delete(contentItem.tool_use_id);
          }
        }
      });
    }
  });

  // Calculate message counts from conversation entries
  let humanMessageCount = 0;
  let assistantMessageCount = 0;

  session.conversation.forEach(entry => {
    if (entry.type === 'user') {
      humanMessageCount++;
    } else if (entry.type === 'assistant') {
      assistantMessageCount++;
    }
  });

  session.humanMessageCount = humanMessageCount;
  session.assistantMessageCount = assistantMessageCount;

  // Check for programmatically triggered LLM analysis sessions (not human sessions)
  const isProgrammaticAnalysis = session.conversation.some(entry => {
    if (entry.type === 'user' && entry.content) {
      const content =
        typeof entry.content === 'string'
          ? entry.content
          : Array.isArray(entry.content) &&
              entry.content.length > 0 &&
              typeof entry.content[0] === 'string'
            ? entry.content[0]
            : Array.isArray(entry.content) && entry.content.length > 0 && entry.content[0].text
              ? entry.content[0].text
              : '';

      // Only filter programmatically generated analysis prompts, not human conversations
      return (
        (content.includes('AI Code Analysis Task') &&
          content.includes('Enhanced Structured Analysis')) ||
        (content.includes('You are an expert AI assistant analyzing developer productivity data') &&
          content.includes('Analysis Data Summary')) ||
        (content.includes('Data Provenance & Quality Assessment') &&
          content.includes('Source File Distribution'))
      );
    }
    return false;
  });

  if (isProgrammaticAnalysis) {
    session.isSelfGenerated = true;
    session.dataQualityIssues.push(
      'Programmatically triggered analysis session (excluded from user session analysis)'
    );
  }

  // Calculate duration
  if (session.startTime && session.endTime) {
    session.durationSeconds = (session.endTime - session.startTime) / 1000;
  } else if (session.conversation.length > 0) {
    // only flag if there are messages
    session.dataQualityIssues.push(
      'Could not determine session duration due to missing timestamps.'
    );
  }

  // Calculate active duration (excludes user response time and breaks)
  try {
    const durationAnalysis = calculateActiveDuration(session.conversation, {
      maxGapMinutes: 30, // Consider gaps > 30 minutes as breaks
      minActiveSeconds: 10, // Minimum segment duration to consider
    });

    session.durationAnalysis = durationAnalysis;
    session.activeDurationSeconds = durationAnalysis.activeDurationSeconds;

    // If active duration is significantly less than raw duration, it's likely more accurate
    if (durationAnalysis.excludedGaps.length > 0 && durationAnalysis.confidence !== 'low') {
      // Use active duration for timeline chart (better user experience)
      // Keep raw duration for compatibility and detailed analysis
    }
  } catch (error) {
    session.dataQualityIssues.push(`Active duration calculation failed: ${error.message}`);
    session.activeDurationSeconds = session.durationSeconds; // Fallback to raw duration
  }

  // Initialize struggle fields (struggle detection will be done later in pipeline)
  session.hasStruggle = false;
  session.struggleIndicators = [];

  return session;
}
