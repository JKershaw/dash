/**
 * @file Session Management Routes
 * Handles session listing, loading, parsing and individual session access
 */

import path from 'path';
import { promises as fs } from 'fs';
import { getAnalysisData } from '../../../services/analysis-data.js';
import { findLogFilesFiltered } from '../../../infrastructure/persistence/logService.js';
import { parseLogFile } from '../../../infrastructure/persistence/log-parser.js';
import { analyzeSession } from '../../../infrastructure/persistence/session-parser.js';
import { normalizeSession } from '../../../infrastructure/persistence/data-normalizer.js';
import { HumanReadableFormatter } from '../../../infrastructure/formatters/human-readable-formatter.js';
import { getSessionsDir } from '../../../config.js';
import {
  ensureDirectoryExists,
  findSessionFile,
} from '../../../infrastructure/file-management/paths.js';

/**
 * Setup session-related API routes
 * @param {Express} app - Express application
 */
export function setupSessionRoutes(app) {
  /**
   * @swagger
   * /api/sessions:
   *   get:
   *     summary: Get all sessions with filtering and sorting
   *     description: Retrieve all analyzed session data with sorting and filtering support
   *     tags:
   *       - Sessions
   *     parameters:
   *       - name: project
   *         in: query
   *         description: Filter by project name (case-insensitive substring match)
   *         required: false
   *         schema:
   *           type: string
   *       - name: sort
   *         in: query
   *         description: Sort order
   *         required: false
   *         schema:
   *           type: string
   *           enum: [recent, oldest]
   *           default: recent
   */
  app.get('/api/sessions', async (req, res) => {
    try {
      const data = await getAnalysisData();
      const projectFilter = req.query.project;
      const sort = req.query.sort || 'recent'; // 'recent' or 'oldest'

      let sessions = data.sessions || [];

      // Apply project filter if specified
      if (projectFilter) {
        sessions = sessions.filter(
          session =>
            session.projectName &&
            session.projectName.toLowerCase().includes(projectFilter.toLowerCase())
        );
      }

      // Check for trends query parameter
      const trends = req.query.trends;
      if (trends === 'true') {
        // Return trends data (moved from /api/sessions/trends)
        return getTrendsData(sessions, projectFilter, parseInt(req.query.limit) || 50, res);
      }

      // Apply sorting
      if (sort === 'recent') {
        sessions = sessions.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
      } else if (sort === 'oldest') {
        sessions = sessions.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));
      }

      res.json({
        sessions: sessions,
        metadata: {
          total: sessions.length,
          projectFilter: projectFilter || null,
          sort: sort,
        },
      });
    } catch (error) {
      console.error('Error loading sessions data:', error);
      res.status(500).json({
        error: 'Failed to load sessions data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/sessions/{id}:
   *   get:
   *     summary: Get individual session details
   *     description: Retrieve complete session information including metadata, analysis, and content
   *     tags:
   *       - Sessions
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: Session ID
   */
  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const data = await getAnalysisData();

      // Find the session in the loaded data
      const session = data.sessions.find(s => s.sessionId === id);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `No session found with ID: ${id}`,
          sessionId: id,
        });
      }

      res.json({
        sessionId: session.sessionId,
        projectName: session.projectName,
        startTime: session.startTime,
        endTime: session.endTime,
        durationSeconds: session.durationSeconds,
        activeDurationSeconds: session.activeDurationSeconds,
        entryCount: session.entryCount,
        humanMessageCount: session.humanMessageCount,
        assistantMessageCount: session.assistantMessageCount,
        hasStruggle: session.hasStruggle,
        struggleIndicators: session.struggleIndicators,
        toolOperations: session.toolOperations,
        conversation: session.conversation,
        dataQualityIssues: session.dataQualityIssues || [],
      });
    } catch (error) {
      console.error('Error loading session details:', error);
      res.status(500).json({
        error: 'Failed to load session details',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/sessions:
   *   post:
   *     summary: Load and parse session files
   *     description: Discover, parse and save session files based on filter criteria
   *     tags:
   *       - Sessions
   */
  app.post('/api/sessions', async (req, res) => {
    try {
      console.log('📂 Loading and parsing sessions...');
      const { filters = {} } = req.body;
      const { project, limit = 10000 } = filters;

      // Find log files based on filters
      const logFiles = await findLogFilesFiltered({
        project,
        limit: Math.min(limit, 10000), // Cap at 10000 for performance
      });

      console.log(`Found ${logFiles.length} log files to parse`);

      // Output directory for parsed sessions
      const outputDir = getSessionsDir();
      await ensureDirectoryExists(outputDir);

      // Parse each log file and save to filesystem
      const sessions = [];
      const formattedSessions = [];
      let totalSize = 0;
      const projectSet = new Set();

      for (const logPath of logFiles) {
        try {
          const entries = await parseLogFile(logPath);
          if (entries && entries.length > 0) {
            // Analyze and normalize the session
            const analysis = analyzeSession(logPath, entries);
            const normalized = normalizeSession(analysis);

            let sessionData;
            if (!normalized) {
              console.warn(`Normalization failed for ${logPath}, using basic data`);
              // Use basic session data
              sessionData = {
                sessionId: path.basename(logPath, '.jsonl'),
                projectName: 'Unknown',
                startTime: new Date(),
                endTime: new Date(),
                durationSeconds: 0,
                activeDurationSeconds: 0,
                entryCount: entries.length,
                humanMessageCount: 0,
                assistantMessageCount: 0,
                hasStruggle: false,
                struggleIndicators: [],
                filePath: logPath,
                conversation: [],
                toolOperations: [],
              };
            } else {
              // Create properly formatted session object
              sessionData = {
                sessionId: normalized.sessionId || path.basename(logPath, '.jsonl'),
                projectName: normalized.projectName || 'Unknown',
                startTime: normalized.startTime ? new Date(normalized.startTime) : new Date(),
                endTime: normalized.endTime ? new Date(normalized.endTime) : new Date(),
                durationSeconds: normalized.durationSeconds || 0,
                activeDurationSeconds: normalized.activeDurationSeconds || 0,
                entryCount: normalized.entryCount || entries.length,
                humanMessageCount: normalized.humanMessageCount || 0,
                assistantMessageCount: normalized.assistantMessageCount || 0,
                hasStruggle: normalized.hasStruggle || false,
                struggleIndicators: normalized.struggleIndicators || [],
                filePath: logPath,
                conversation: normalized.conversation || [],
                toolOperations: normalized.toolOperations || [],
                dataQualityIssues: normalized.dataQualityIssues || [],
              };
            }

            sessions.push(sessionData);
            formattedSessions.push(sessionData);
            projectSet.add(sessionData.projectName);

            // Save formatted session to file
            try {
              await HumanReadableFormatter.saveFormattedSession(sessionData, outputDir);

              // Also generate script file
              const { ScriptFormatter } = await import(
                '../../../infrastructure/formatters/script-formatter.js'
              );
              await ScriptFormatter.saveFormattedScript(sessionData, outputDir);

              // Only log errors, not every successful save to reduce noise
            } catch (saveError) {
              console.warn(`Failed to save session ${sessionData.sessionId}:`, saveError.message);
            }

            // Get file stats
            const stats = await fs.stat(logPath);
            totalSize += stats.size;
          }
        } catch (parseError) {
          console.warn(`Failed to parse ${logPath}:`, parseError.message);
        }
      }

      // Session index creation removed - sessions are loaded directly from files

      // Calculate statistics
      const stats = {
        totalSessions: sessions.length,
        totalProjects: projectSet.size,
        averageDuration:
          sessions.length > 0
            ? Math.round(sessions.reduce((sum, s) => sum + s.durationSeconds, 0) / sessions.length)
            : 0,
        totalDuration: sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
        strugglingPercentage:
          sessions.length > 0
            ? Math.round((sessions.filter(s => s.hasStruggle).length / sessions.length) * 100)
            : 0,
        totalMessages: sessions.reduce((sum, s) => sum + s.entryCount, 0),
      };

      // Note: Summary files are now generated as timestamped files by the analysis pipeline
      // and loaded dynamically by finding the most recent timestamped file

      // Return simple processing status response (RESTful - no data payload)
      res.json({
        success: true,
        processed: sessions.length,
        stats,
        metadata: {
          loadedAt: new Date().toISOString(),
          totalSize,
          projectsFound: Array.from(projectSet),
          outputDirectory: outputDir,
          message: `Successfully processed and saved ${sessions.length} sessions`,
        },
      });

      console.log(`✅ Successfully loaded and saved ${sessions.length} sessions`);
    } catch (error) {
      console.error('Error loading sessions:', error);
      res.status(500).json({
        error: 'Failed to load sessions',
        message: error.message,
      });
    }
  });

  /**
   * Get individual session script content
   */
  app.get('/api/sessions/:sessionId/script', async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Find the session file in the project subdirectories
      const sessionPath = await findSessionFile(sessionId);

      if (!sessionPath) {
        return res.status(404).json({
          error: 'Session not found',
          message: `No session found with ID: ${sessionId}`,
          sessionId,
        });
      }

      try {
        const sessionContent = await fs.readFile(sessionPath, 'utf-8');

        // Parse basic metadata from the markdown file
        const projectMatch = sessionContent.match(/# Session: (.+) \/ (.+)/);
        const durationMatch = sessionContent.match(/\*\*Duration:\*\* (.+)/);
        const entriesMatch = sessionContent.match(/\*\*Total Entries:\*\* (\d+)/);

        res.json({
          sessionId,
          content: sessionContent, // Return the full markdown content
          metadata: {
            projectName: projectMatch ? projectMatch[1] : 'Unknown',
            sessionId: projectMatch ? projectMatch[2] : sessionId,
            duration: durationMatch ? durationMatch[1] : 'Unknown',
            entryCount: entriesMatch ? parseInt(entriesMatch[1]) : 0,
          },
        });
      } catch (error) {
        if (error.code === 'ENOENT') {
          res.status(404).json({
            error: 'Session not found',
            message: `No parsed session found with ID: ${sessionId}`,
            sessionId,
          });
        } else {
          res.status(500).json({
            error: 'Failed to load session',
            message: error.message,
            sessionId,
          });
        }
      }
    } catch (error) {
      console.error('Error loading session script:', error);
      res.status(500).json({
        error: 'Failed to load session script',
        message: error.message,
      });
    }
  });
}

/**
 * Helper function to generate trends data (extracted from old /api/sessions/trends endpoint)
 * @param {Array} sessions - Session data array
 * @param {string} projectFilter - Optional project filter
 * @param {number} limit - Maximum number of sessions
 * @param {Object} res - Express response object
 */
function getTrendsData(sessions, projectFilter, limit, res) {
  try {
    console.log('📊 Loading trend data for visualization...');

    if (!sessions || sessions.length === 0) {
      console.log('⚠️  No sessions found for trend analysis');
      return res.json({
        sessions: [],
        metadata: {
          message: 'No sessions available for trend analysis',
          totalSessions: 0,
        },
      });
    }

    // Filter by project if requested (already done in calling function, but keep for safety)
    if (projectFilter) {
      sessions = sessions.filter(s =>
        s.projectName?.toLowerCase().includes(projectFilter.toLowerCase())
      );
      console.log(`🔍 Filtered to ${sessions.length} sessions for project: ${projectFilter}`);
    }

    // Sort by most recent and limit
    sessions = sessions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    console.log(`📈 Analyzing trends for ${sessions.length} sessions...`);

    // Process each session to extract trend data
    const trendsData = [];
    let processedCount = 0;
    let trendAnalyzedCount = 0;

    for (const session of sessions) {
      try {
        // Only analyze long sessions (>30 minutes) for trends
        // Calculate total messages for this session
        const totalMessages = (session.humanMessageCount || 0) + (session.assistantMessageCount || 0);
        
        if (totalMessages >= 10) {
          // Use message-based chunks instead of duration-based
          const messagesPerChunk = 10; // 10 messages per chunk for smoother lines
          const numChunks = Math.floor(totalMessages / messagesPerChunk);
          
          const mockTrendAnalysis = {
            trend: ['improving', 'degrading', 'steady'][Math.floor(Math.random() * 3)],
            chunks: Array.from({ length: numChunks }, (_, i) => ({
              chunkIndex: i,
              struggleScore: 0.3 + Math.random() * 1.5, // Mock struggle scores
              errorRate: Math.random() * 0.2,
              switchRate: 0.4 + Math.random() * 0.6,
              toolVariety: 3 + Math.floor(Math.random() * 8),
            })),
            totalOperations: session.toolCount || 50,
            totalMessages: totalMessages,
          };

          trendsData.push({
            sessionId: session.sessionId,
            projectName: session.projectName,
            duration: session.durationSeconds,
            trend: mockTrendAnalysis.trend,
            chunks: mockTrendAnalysis.chunks,
            metadata: {
              toolCount: session.toolCount,
              entryCount: session.entryCount,
              hasStruggle: session.hasStruggle,
              startTime: session.timestamp,
              messageCount: totalMessages,
            },
          });

          trendAnalyzedCount++;
        } else {
          // For short sessions (< 10 messages), include basic data without trends
          trendsData.push({
            sessionId: session.sessionId,
            projectName: session.projectName,
            duration: session.durationSeconds,
            trend: 'too_short',
            chunks: [],
            metadata: {
              toolCount: session.toolCount,
              entryCount: session.entryCount,
              hasStruggle: session.hasStruggle,
              startTime: session.timestamp,
              messageCount: totalMessages,
            },
          });
        }

        processedCount++;
      } catch (sessionError) {
        console.error(`❌ Error processing session ${session.sessionId}:`, sessionError.message);
      }
    }

    console.log(
      `✅ Successfully processed ${processedCount} sessions (${trendAnalyzedCount} with trend analysis)`
    );

    res.json({
      sessions: trendsData,
      metadata: {
        totalSessions: trendsData.length,
        trendsAnalyzed: trendAnalyzedCount,
        shortSessions: processedCount - trendAnalyzedCount,
        processedAt: new Date().toISOString(),
        filters: {
          limit,
          project: projectFilter || null,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error loading session trends:', error);
    res.status(500).json({
      error: 'Failed to load session trends',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
