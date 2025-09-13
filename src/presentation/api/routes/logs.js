/**
 * @file Log Discovery Routes
 * Handles log file discovery, metadata, and content retrieval
 */

import {
  findLogFilesWithMetadata,
  findLogFilesFiltered,
  getLogFileContent,
} from '../../../infrastructure/persistence/logService.js';

/**
 * Setup log-related API routes
 * @param {Express} app - Express application
 */
export function setupLogRoutes(app) {
  /**
   * Get log file count for display
   */
  app.get('/api/logs/count', async (req, res) => {
    try {
      const logFiles = await findLogFilesFiltered({ limit: 1000 });
      res.json({
        count: logFiles.length,
        message: `${logFiles.length} log files found`,
      });
    } catch (error) {
      console.error('Error counting log files:', error);
      res.json({
        count: 0,
        message: '0 log files found',
      });
    }
  });

  /**
   * @swagger
   * /api/logs:
   *   get:
   *     summary: Get log files
   *     description: Discover and filter log files with optional metadata
   *     tags:
   *       - Logs
   *     parameters:
   *       - name: project
   *         in: query
   *         description: Filter by project name (substring match)
   *         required: false
   *         schema:
   *           type: string
   *           example: "example-project"
   *       - name: since
   *         in: query
   *         description: Filter logs modified after this date
   *         required: false
   *         schema:
   *           type: string
   *           format: date
   *           example: "2024-01-01"
   *       - name: limit
   *         in: query
   *         description: Maximum number of logs to return
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 1000
   *           example: 50
   *       - name: metadata
   *         in: query
   *         description: Include detailed metadata (true/false)
   *         required: false
   *         schema:
   *           type: string
   *           enum: ["true", "false"]
   *           example: "true"
   */
  app.get('/api/logs', async (req, res) => {
    try {
      const { project, since, limit, metadata } = req.query;
      const includeMetadata = metadata === 'true';

      if (includeMetadata) {
        const logs = await findLogFilesWithMetadata({
          project,
          since,
          limit: limit ? parseInt(limit) : undefined,
        });

        // Calculate summary statistics
        const totalSize = logs.reduce((sum, log) => sum + (log.size || 0), 0);
        const projectCounts = logs.reduce((counts, log) => {
          const projectName = log.projectName || 'Unknown';
          counts[projectName] = (counts[projectName] || 0) + 1;
          return counts;
        }, {});

        const projects = Object.entries(projectCounts)
          .map(([name, count]) => ({
            name: name.toLowerCase().replace(/\s+/g, '-'),
            displayName: name,
            logCount: count,
          }))
          .sort((a, b) => b.logCount - a.logCount);

        // Calculate date range
        const dates = logs
          .map(log => log.lastModified)
          .filter(Boolean)
          .sort();
        const dateRange =
          dates.length > 0
            ? {
                earliest: dates[0],
                latest: dates[dates.length - 1],
              }
            : null;

        res.json({
          logs,
          total: logs.length,
          totalSize,
          projects,
          dateRange,
          project: project || null,
          since: since || null,
          limit: limit ? parseInt(limit) : null,
          includesMetadata: true,
        });
      } else {
        const logs = await findLogFilesFiltered({
          project,
          since,
          limit: limit ? parseInt(limit) : undefined,
        });
        res.json({
          logs,
          total: logs.length,
          project: project || null,
          since: since || null,
          limit: limit ? parseInt(limit) : null,
          includesMetadata: false,
        });
      }
    } catch (error) {
      console.error('Error loading logs:', error);
      res.status(500).json({
        error: 'Failed to load logs',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/logs/{logId}/content:
   *   get:
   *     summary: Get log file content
   *     description: Retrieve the raw content and parsed entries from a specific log file
   *     tags:
   *       - Logs
   *     parameters:
   *       - name: logId
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: Base64url encoded log file path (from logs endpoint)
   *         example: "L1VzZXJzL3dvcmsvLmNsYXVkZS9wcm9qZWN0cy9uLi4uanNvbmw"
   */
  app.get('/api/logs/:logId/content', async (req, res) => {
    try {
      const { logId } = req.params;

      // Decode the log file path
      let logPath;
      try {
        logPath = Buffer.from(logId, 'base64url').toString();
      } catch (error) {
        console.warn(`⚠️ Invalid log ID decoding attempt: ${logId}`, error.message);
        return res.status(400).json({
          error: 'Invalid log ID',
          message: 'Log ID must be a valid base64url encoded path',
        });
      }

      const result = await getLogFileContent(logPath);

      if (!result.success) {
        return res.status(404).json({
          error: 'Log file not found',
          message: result.error,
          path: logPath,
        });
      }

      res.json(result);
    } catch (error) {
      console.error('Error loading log content:', error);
      res.status(500).json({
        error: 'Failed to load log content',
        message: error.message,
      });
    }
  });
}
