/**
 * @file Session Loader Service
 * Handles loading sessions from JSONL files and saving to markdown format
 * Separated from analysis pipeline to allow manual session filtering
 */

import { findLogFiles } from '../infrastructure/persistence/log-discovery.js';
import { analyzeSessions } from '../application/pipelines/analysis-engine/session-analyzer.js';
import { calculateProgressPercentage } from './unified-progress-service.js';
import { trackPhase, trackError } from './metadata-collector.js';

/**
 * Load sessions from JSONL files and save to markdown format
 * @param {Function} progressCallback - Progress callback function
 * @param {Object} metadata - Optional metadata tracking object
 * @returns {Promise<Array>} Array of loaded session objects
 */
export async function loadAndSaveSessions(progressCallback = null, metadata = null) {
  // Helper to emit progress events with automatic percentage calculation
  const emitProgress = (step, data = {}) => {
    if (progressCallback) {
      // Add percentage if not provided
      if (data.percentage === undefined) {
        data.percentage = calculateProgressPercentage('analysis', step, data);
      }
      progressCallback(step, data);
    }
  };

  try {
    // Step 0: Clean up old processed sessions (but keep reports)
    emitProgress('cleanup:start', {
      message: 'Cleaning up old processed sessions',
      details: 'Removing previous session analysis to avoid duplicates',
    });

    const { getSessionsDir } = await import('../config.js');
    const { promises: fs } = await import('fs');
    const path = await import('path');

    const sessionsDir = getSessionsDir();
    try {
      // Read all directories in sessions folder
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
      const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

      // Remove all session directories (they'll be recreated with correct names)
      for (const dir of directories) {
        const dirPath = path.join(sessionsDir, dir);
        await fs.rm(dirPath, { recursive: true, force: true });
      }

      emitProgress('cleanup:complete', {
        count: directories.length,
        message: `Cleaned up ${directories.length} old session directories`,
        details: 'Ready for fresh session processing',
      });
    } catch (cleanupError) {
      // Non-fatal error - continue with session loading
      console.warn('⚠️ Cleanup warning:', cleanupError.message);
      emitProgress('cleanup:warning', {
        message: 'Cleanup had issues but continuing',
        details: cleanupError.message,
      });
    }

    // Step 1: Discover log files
    if (metadata) trackPhase(metadata, 'discoverLogFiles', 'start');
    emitProgress('discoverLogFiles:start', {
      message: 'Scanning for log files',
      details: 'Searching for Claude Code conversation logs',
    });

    const logFiles = await findLogFiles();

    if (logFiles.length === 0) {
      const error = new Error('No log files found');
      if (metadata) trackError(metadata, error, { phase: 'discoverLogFiles' });
      throw error;
    }

    if (metadata) {
      trackPhase(metadata, 'discoverLogFiles', 'complete', {
        logFilesFound: logFiles.length,
      });
      metadata.input.logFilesFound = logFiles.length;
    }

    emitProgress('discoverLogFiles:complete', {
      count: logFiles.length,
      message: `Found ${logFiles.length} conversation files`,
      details: `Ready for analysis`,
    });

    // Step 2: Analyze sessions (parse JSONL and save markdown)
    if (metadata) trackPhase(metadata, 'analyzeSessions', 'start');
    emitProgress('analyzeSessions:start', {
      message: 'Processing conversation logs',
      details: `Starting analysis of ${logFiles.length} conversation files`,
    });

    // Create progress callback that forwards session analysis progress
    const sessionProgressCallback = (step, data) => {
      emitProgress(step, data);
    };

    // This will parse JSONL files and save markdown files
    const sessions = await analyzeSessions(
      logFiles,
      { OUTPUT_DIRS: true },
      sessionProgressCallback
    );

    // Apply struggle detection to sessions
    await applyStruggleDetection(sessions);

    const strugglingSessionsCount = sessions.filter(s => s.hasStruggle).length;
    if (metadata) {
      trackPhase(metadata, 'analyzeSessions', 'complete', {
        sessionsParsed: sessions.length,
        strugglingSessionsFound: strugglingSessionsCount,
      });
      metadata.input.sessionsParsed = sessions.length;
    }

    emitProgress('analyzeSessions:complete', {
      count: sessions.length,
      message: `Analyzed ${sessions.length} sessions`,
      details: `${strugglingSessionsCount} struggling sessions found`,
    });

    return sessions;
  } catch (error) {
    if (metadata) trackError(metadata, error, { phase: 'sessionLoading' });
    emitProgress('error', {
      error: error.message,
      phase: 'sessionLoading',
    });
    throw error;
  }
}

/**
 * Apply struggle detection to analyzed sessions
 * @param {Array} sessions - Array of session objects
 */
async function applyStruggleDetection(sessions) {
  try {
    const { detectSimpleLoops, detectLongSessions } = await import(
      '../domain/struggle-detector.js'
    );
    const { classifyStruggle } = await import('../domain/problem-classifier.js');

    sessions.forEach(session => {
      const hasToolStruggles = detectSimpleLoops(session).length > 0;
      const hasDurationStruggles = detectLongSessions(session).length > 0;
      const hasConversationStruggles = classifyStruggle(session).length > 0;

      session.hasStruggle = hasToolStruggles || hasDurationStruggles || hasConversationStruggles;

      // Store struggle indicators for debugging
      const indicators = [];
      if (hasToolStruggles) indicators.push('repetitive_tools');
      if (hasDurationStruggles) indicators.push('long_session');
      if (hasConversationStruggles) indicators.push('conversation_issues');
      session.struggleIndicators = indicators;
    });
  } catch (error) {
    console.warn('⚠️ Struggle detection failed:', error.message);
  }
}
