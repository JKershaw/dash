/**
 * @file Dashboard and Metadata Routes
 * Handles dashboard metrics, charts, recommendations, and system metadata
 */

import { getAnalysisData, loadLatestAnalysisMetadata } from '../../../services/analysis-data.js';
import { findLogFilesFiltered } from '../../../infrastructure/persistence/logService.js';

/**
 * Setup dashboard and metadata API routes
 * @param {Express} app - Express application
 */
export function setupDashboardRoutes(app) {
  /**
   * System metadata with recent analysis information
   */
  app.get('/api/metadata', async (req, res) => {
    try {
      const data = await getAnalysisData();
      const latestMetadata = await loadLatestAnalysisMetadata();

      // For empty projects, don't show default dates/times
      const hasData = data.sessions.length > 0 || data.recommendations.length > 0;

      // Enhanced metadata with analysis run information
      const metadata = {
        generated: hasData ? data.generated || null : null,
        sessionCount: data.sessions.length,
        recommendationCount: data.recommendations.length,
        totalDuration: hasData ? data.stats?.totalDuration || 0 : 0,
        hasExecutiveSummary: !!data.executiveSummary,
        hasNarrativeSummary: !!data.narrativeSummary,
        hasEnhancedAnalysis: !!data.enhancedAnalysis,
        isEmpty: !hasData,
      };

      // Add latest analysis run metadata if available
      if (latestMetadata) {
        metadata.lastAnalysisRun = {
          timestamp: latestMetadata.run?.endTime || latestMetadata.run?.startTime,
          duration: latestMetadata.performance?.totalDuration || 0,
          durationFormatted: formatAnalysisDuration(latestMetadata.performance?.totalDuration || 0),
          successful: latestMetadata.summary?.success || false,
          hasErrors: (latestMetadata.errors?.length || 0) > 0,
          errorCount: latestMetadata.errors?.length || 0,
          phaseCount: latestMetadata.processing?.phases?.length || 0,
          llmCallCount: latestMetadata.processing?.llmCalls?.length || 0,
          totalTokens:
            (latestMetadata.processing?.tokenUsage?.simple?.total || 0) +
            (latestMetadata.processing?.tokenUsage?.agentic?.total || 0),
          sessionsParsed: latestMetadata.input?.sessionsParsed || 0,
          outputFilesGenerated: latestMetadata.summary?.outputFilesGenerated || 0,
        };
      }

      res.json(metadata);
    } catch (error) {
      console.error('Error loading metadata:', error);
      res.status(500).json({
        error: 'Failed to load metadata',
        message: error.message,
      });
    }
  });

  /**
   * Projects list for filtering
   */
  app.get('/api/projects', async (req, res) => {
    try {
      const data = await getAnalysisData();

      // Validate data structure
      if (!data || !Array.isArray(data.sessions)) {
        console.error('Invalid analysis data structure:', data);
        return res.status(500).json({
          error: 'Invalid data structure',
          message: 'Analysis data is not properly formatted',
        });
      }

      // Extract unique projects with stats
      const projectStats = data.sessions.reduce((stats, session) => {
        // Validate session structure
        if (!session || typeof session !== 'object') {
          console.warn('Invalid session object:', session);
          return stats;
        }

        const projectName = session.projectName || 'Unknown';
        if (!stats[projectName]) {
          stats[projectName] = {
            name: projectName,
            displayName: projectName,
            sessionCount: 0,
            totalDuration: 0,
            hasStruggle: 0,
          };
        }
        stats[projectName].sessionCount++;
        stats[projectName].totalDuration += session.durationSeconds || 0;
        if (session.hasStruggle) stats[projectName].hasStruggle++;
        return stats;
      }, {});

      // Convert to array and sort by session count
      const projects = Object.values(projectStats)
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .map(project => ({
          ...project,
          averageDuration:
            project.sessionCount > 0 ? Math.round(project.totalDuration / project.sessionCount) : 0,
          strugglePercentage:
            project.sessionCount > 0
              ? Math.round((project.hasStruggle / project.sessionCount) * 100)
              : 0,
        }));

      res.json({
        projects,
        total: projects.length,
      });
    } catch (error) {
      console.error('Error loading projects:', error);
      res.status(500).json({
        error: 'Failed to load projects',
        message: error.message,
      });
    }
  });

  /**
   * Chart data for visualizations
   */
  app.get('/api/charts', async (req, res) => {
    try {
      const data = await getAnalysisData();

      // Use the correct chart data preparation from analysis-data.js
      // This creates Chart.js compatible data structure with proper datasets and sessionInfo
      const chartData = data.chartData;

      res.json({
        chartData,
        generated: data.generated || new Date().toISOString(),
        sessionCount: data.sessions.length,
      });
    } catch (error) {
      console.error('Error loading chart data:', error);
      res.status(500).json({
        error: 'Failed to load chart data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/config/status:
   *   get:
   *     summary: Get API configuration status
   *     description: Check if Anthropic API key is configured and valid
   *     tags:
   *       - Configuration
   */
  app.get('/api/config/status', async (req, res) => {
    try {
      const { isApiEnabled, getLogsDir } = await import('../../../config.js');
      res.json({
        apiKeyValid: isApiEnabled(),
        logsDirectory: getLogsDir(),
      });
    } catch (error) {
      console.error('Error checking API configuration:', error);
      res.status(500).json({
        error: 'Failed to check API configuration',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/config/temporary-key:
   *   post:
   *     summary: Set temporary API key for current session
   *     description: Store API key in memory for the current session (lost on restart)
   *     tags:
   *       - Configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               apiKey:
   *                 type: string
   *                 description: Anthropic API key (empty string to clear)
   */
  app.post('/api/config/temporary-key', async (req, res) => {
    try {
      const { apiKey } = req.body;
      const { setTemporaryApiKey, clearTemporaryApiKey } = await import('../../../config.js');

      if (!apiKey || apiKey === '') {
        clearTemporaryApiKey();
        res.json({ success: true, message: 'Temporary API key cleared' });
      } else {
        setTemporaryApiKey(apiKey);
        res.json({ success: true, message: 'Temporary API key set' });
      }
    } catch (error) {
      console.error('Error setting temporary API key:', error);
      res.status(500).json({
        error: 'Failed to set temporary key',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/config/env-variable:
   *   post:
   *     summary: Write environment variable to .env file
   *     description: Persist environment variables (like API keys) to .env file for cross-port persistence
   *     tags:
   *       - Configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - key
   *               - value
   *             properties:
   *               key:
   *                 type: string
   *                 description: Environment variable key (must be whitelisted)
   *                 example: ANTHROPIC_API_KEY
   *               value:
   *                 type: string
   *                 description: Environment variable value
   *                 example: "Your Anthropic API key"
   *     responses:
   *       200:
   *         description: Environment variable written successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: Environment variable updated successfully
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   *       400:
   *         description: Invalid input (unauthorized key, invalid format, etc.)
   *       500:
   *         description: File write error or internal server error
   */
  app.post('/api/config/env-variable', async (req, res) => {
    try {
      const { key, value } = req.body;

      // Validate inputs
      if (!key || typeof key !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Environment variable key is required and must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Environment variable value must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      // Handle empty string as a clear/remove operation
      if (value.trim() === '') {
        const { removeEnvVariable } = await import('../../../infrastructure/env-file-manager.js');
        const envFilePath = process.env.TEST_ENV_FILE || '.env';
        
        await removeEnvVariable(key, envFilePath);
        
        // Also clear from process.env
        delete process.env[key];

        return res.json({
          success: true,
          message: 'Environment variable cleared successfully',
          timestamp: new Date().toISOString(),
        });
      }

      // Special validation for API keys
      if (key === 'ANTHROPIC_API_KEY') {
        if (!value.startsWith('sk-ant-') || value.length < 50) {
          return res.status(400).json({
            success: false,
            message: 'Invalid API key format. Please check your Anthropic API key.',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Import and use the env-file-manager
      const { updateEnvVariable } = await import('../../../infrastructure/env-file-manager.js');
      
      // Use test-specific .env file path if in test environment
      const envFilePath = process.env.TEST_ENV_FILE || '.env';
      
      // Update .env file
      await updateEnvVariable(key, value, envFilePath);
      
      // Also update process.env for immediate effect in current session
      process.env[key] = value;

      res.json({
        success: true,
        message: 'Environment variable updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating environment variable:', error);
      
      // Handle validation errors with 400 status
      if (error.message.includes('Invalid environment variable key') || 
          error.message.includes('Environment variable value cannot be empty')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Handle all other errors with 500 status
      res.status(500).json({
        success: false,
        message: 'Failed to update environment variable',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * @swagger
   * /api/config/validate-directory:
   *   post:
   *     summary: Validate directory for logs storage
   *     description: Check if directory exists, is readable, and count log files
   *     tags:
   *       - Configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               directory:
   *                 type: string
   *                 description: Directory path to validate
   */
  app.post('/api/config/validate-directory', async (req, res) => {
    try {
      const { directory } = req.body;

      // Validate input
      if (!directory || typeof directory !== 'string' || directory.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Directory parameter is required and must be a non-empty string',
          message: 'Please provide a valid directory path',
        });
      }

      const trimmedDirectory = directory.trim();

      // Import file system modules
      const { promises: fs } = await import('fs');

      let exists = false;
      let readable = false;
      let logFileCount = 0;
      let error = null;

      try {
        // Check if directory exists and is a directory
        const stats = await fs.stat(trimmedDirectory);
        exists = stats.isDirectory();

        if (exists) {
          // Try to use proper log discovery by temporarily setting the directory
          try {
            // Store current env value
            const originalLogDir = process.env.CLAUDE_LOGS_DIR;
            
            // Temporarily set the directory for discovery
            process.env.CLAUDE_LOGS_DIR = trimmedDirectory;
            
            // Use the proper log discovery
            const logFiles = await findLogFilesFiltered({ limit: 1000 });
            logFileCount = logFiles.length;
            readable = true;
            
            // Restore original env value
            if (originalLogDir) {
              process.env.CLAUDE_LOGS_DIR = originalLogDir;
            } else {
              delete process.env.CLAUDE_LOGS_DIR;
            }
          } catch (readError) {
            readable = false;
            error = `Directory exists but is not readable: ${readError.message}`;
          }
        } else {
          error = 'Path exists but is not a directory';
        }
      } catch (statError) {
        exists = false;
        readable = false;
        error = `Directory does not exist or is not accessible: ${statError.message}`;
      }

      // Generate appropriate message
      let message;
      if (exists && readable) {
        if (logFileCount === 0) {
          message = 'Directory is valid but contains no log files (.jsonl)';
        } else if (logFileCount === 1) {
          message = 'Directory is valid and contains 1 log file';
        } else {
          message = `Directory is valid and contains ${logFileCount} log files`;
        }
      } else {
        message = error || 'Directory validation failed';
      }

      const response = {
        success: exists && readable,
        directory: trimmedDirectory,
        exists,
        readable,
        logFileCount,
        message,
      };

      // Include error field for failures
      if (!response.success && error) {
        response.error = error;
      }

      res.json(response);
    } catch (error) {
      console.error('Error validating directory:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during directory validation',
        message: 'Failed to validate directory due to server error',
      });
    }
  });

  /**
   * @swagger
   * /api/config/temporary-directory:
   *   post:
   *     summary: Set temporary logs directory for current session
   *     description: Store directory path in memory for the current session (lost on restart)
   *     tags:
   *       - Configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               directory:
   *                 type: string
   *                 description: Directory path (empty string to clear)
   *   delete:
   *     summary: Clear temporary logs directory
   *     description: Remove temporary directory override from memory
   *     tags:
   *       - Configuration
   */
  app.post('/api/config/temporary-directory', async (req, res) => {
    try {
      const { directory } = req.body;
      const { setTemporaryConfig, clearTemporaryConfig } = await import('../../../config.js');

      if (!directory || directory === '') {
        clearTemporaryConfig('CLAUDE_LOGS_DIR');
        res.json({ success: true, message: 'Temporary logs directory cleared' });
      } else {
        setTemporaryConfig('CLAUDE_LOGS_DIR', directory);
        res.json({ success: true, message: 'Temporary logs directory set' });
      }
    } catch (error) {
      console.error('Error setting temporary logs directory:', error);
      res.status(500).json({
        error: 'Failed to set temporary directory',
        message: error.message,
      });
    }
  });

  app.delete('/api/config/temporary-directory', async (req, res) => {
    try {
      const { clearTemporaryConfig } = await import('../../../config.js');
      clearTemporaryConfig('CLAUDE_LOGS_DIR');
      res.json({ success: true, message: 'Temporary logs directory cleared' });
    } catch (error) {
      console.error('Error clearing temporary logs directory:', error);
      res.status(500).json({
        error: 'Failed to clear temporary directory',
        message: error.message,
      });
    }
  });

  /**
   * Health check endpoint
   */
  app.get('/health', async (req, res) => {
    try {
      const data = await getAnalysisData();

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        data: {
          sessions: data.sessions.length,
          recommendations: data.recommendations.length,
          lastGenerated: data.generated,
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

// Helper functions for chart data generation

function _generateProjectActivity(sessions) {
  // TODO: This function is defined but not used - consider removing or implementing
  return sessions.reduce((activity, session) => {
    const project = session.projectName || 'Unknown';
    if (!activity[project]) {
      activity[project] = { sessionCount: 0, totalDuration: 0, struggles: 0 };
    }
    activity[project].sessionCount++;
    activity[project].totalDuration += session.durationSeconds || 0;
    if (session.hasStruggle) activity[project].struggles++;
    return activity;
  }, {});
}

/**
 * Format analysis duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatAnalysisDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
