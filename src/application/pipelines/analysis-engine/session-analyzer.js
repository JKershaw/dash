/**
 * @file Session Analyzer Functions
 * Simple functions for batch analysis of multiple session files
 */

import { parseLogFile } from '../../../infrastructure/persistence/log-parser.js';
import { analyzeSession } from '../../../infrastructure/persistence/session-parser.js';
import { normalizeSession } from '../../../infrastructure/persistence/data-normalizer.js';
import { getConfiguredDir } from '../../../infrastructure/file-utils.js';

/**
 * Analyze multiple log files with progress tracking
 * @param {Array} logFiles - Array of log file paths
 * @param {Object} config - Configuration object
 * @param {Function} progressCallback - Progress callback function
 * @returns {Array} Array of analyzed sessions
 */
export async function analyzeSessions(logFiles, config = {}, progressCallback = null) {
  const sessions = [];

  // Progress callback helper
  const emitProgress = (step, data) => {
    if (progressCallback) {
      progressCallback(step, data);
    }
  };

  // Analyze each file with progress updates
  for (let i = 0; i < logFiles.length; i++) {
    const logFile = logFiles[i];

    // Extract basic metadata before processing for progress details
    const sessionMetadata = await extractSessionMetadata(logFile);

    // Emit progress for each file being analyzed with rich details
    emitProgress('analyzeSessions:progress', {
      current: i + 1,
      total: logFiles.length,
      message: `Analyzing session ${i + 1} of ${logFiles.length}`,
      currentFile: logFile,
      filesProcessed: i,
      sessionMetadata: sessionMetadata,
    });

    const session = await analyzeSingleFile(logFile);
    if (session && !session.isSelfGenerated) {
      sessions.push(session);
      await saveFormattedSession(session, config);
    }
  }

  // Note: Progress completion is now handled by the main pipeline
  // with enhanced details, so we don't emit duplicate progress here

  return sessions;
}

/**
 * Extract basic metadata from a log file for progress display
 * @param {string} logFile - Path to log file
 * @returns {Promise<Object>} Session metadata
 */
async function extractSessionMetadata(logFile) {
  try {
    const logEntries = await parseLogFile(logFile);
    if (!logEntries || logEntries.length === 0) {
      return { messageCount: 0, duration: '0m' };
    }

    // Count conversation messages (exclude system messages)
    const messageCount = logEntries
      .filter(
        entry =>
          entry.type === 'conversation' && entry.conversation && entry.conversation.length > 0
      )
      .reduce((count, entry) => count + entry.conversation.length, 0);

    // Calculate duration from first to last timestamp
    const timestamps = logEntries
      .filter(entry => entry.timestamp)
      .map(entry => new Date(entry.timestamp))
      .filter(date => !isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    let duration = '0m';
    if (timestamps.length >= 2) {
      const durationMs = timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime();
      const minutes = Math.round(durationMs / (1000 * 60));

      if (minutes < 60) {
        duration = `${minutes}m`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        duration = remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
      }
    }

    return {
      messageCount,
      duration,
      fileSize: await getFileSize(logFile),
    };
  } catch (error) {
    // Fallback for files that can't be parsed - log for debugging
    console.debug(`Failed to extract session metadata from ${logFile}:`, error.message);
    return {
      messageCount: 0,
      duration: '0m',
      fileSize: 'unknown',
    };
  }
}

/**
 * Get file size for display
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Formatted file size
 */
async function getFileSize(filePath) {
  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(filePath);
    const bytes = stats.size;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return 'unknown';
  }
}

/**
 * Analyze a single log file
 * @param {string} logFile - Path to log file
 * @returns {Object|null} Analyzed session or null
 */
export async function analyzeSingleFile(logFile) {
  const logEntries = await parseLogFile(logFile);

  if (logEntries.length > 0) {
    const session = analyzeSession(logFile, logEntries);
    if (session) {
      return normalizeSession(session);
    }
  }
  return null;
}

/**
 * Save formatted sessions
 * @param {Object} session - Session to save
 * @param {Object} config - Configuration object
 */
async function saveFormattedSession(session, config) {
  // Skip saving if no output directories configured
  if (!config.OUTPUT_DIRS) {
    return;
  }

  const { HumanReadableFormatter } = await import(
    '../../../infrastructure/formatters/human-readable-formatter.js'
  );
  const { ScriptFormatter } = await import(
    '../../../infrastructure/formatters/script-formatter.js'
  );

  try {
    const outputDir = getConfiguredDir('sessions');

    console.log(`📝 Saving session: ${session.sessionId} (${session.projectName})`);
    await HumanReadableFormatter.saveFormattedSession(session, outputDir);

    console.log(`🎬 Generating script for: ${session.sessionId}`);
    await ScriptFormatter.saveFormattedScript(session, outputDir);
    console.log(`✅ Script saved for: ${session.sessionId}`);
  } catch (error) {
    console.error(`❌ Error saving formatted session ${session.sessionId}: ${error.message}`);
    console.error(`❌ Stack trace:`, error.stack);
  }
}

// Session index creation removed - sessions are loaded directly from files
