/**
 * @file Settings API Routes
 * Handles configuration and settings display endpoints
 */

import os from 'os';
import { promises as fs } from 'fs';
import {
  getLogsDir,
  getOutputDir,
  getSessionsDir,
  getReportsDir,
  getApiKey,
  getApiKeySource,
  getModel,
  isTest,
  isDev,
  isProd,
  getTemporaryConfig,
  getEffectiveLogsDir,
} from '../../../config.js';
import { findLogFilesFiltered } from '../../../infrastructure/persistence/logService.js';
import { updateUserConfig, removeUserConfigValue } from '../../../infrastructure/user-config.js';

/**
 * Setup settings API routes
 * @param {Express} app - Express application
 */
export function setupSettingsRoutes(app) {
  /**
   * @swagger
   * /api/settings:
   *   get:
   *     summary: Get current system configuration and settings
   *     description: Retrieve all configurable options with current values, security-filtered
   *     tags:
   *       - Settings
   */
  app.get('/api/settings', async (req, res) => {
    try {
      // Environment Variables (with security filtering)
      const environment = {
        ANTHROPIC_API_KEY: {
          // SECURITY: Never expose the actual API key value
          hasKey: Boolean(getApiKey()),
          isValid: Boolean(getApiKey() && getApiKey() !== 'your-key-here'),
          source: getApiKeySource(),
          description: 'Anthropic API key for Claude AI integration',
        },
        CLAUDE_LOGS_DIR: {
          value: process.env.CLAUDE_LOGS_DIR || null,
          default: getDefaultLogsPathForPlatform(),
          current: getLogsDir(),
          temporary: getTemporaryConfig('CLAUDE_LOGS_DIR') || null,
          effective: getEffectiveLogsDir(),
          validation: await getDirectoryValidationStatus(getEffectiveLogsDir()),
          description: 'Path to Claude Code conversation logs directory',
          fallbackChain: [
            { source: 'temporary override', value: getTemporaryConfig('CLAUDE_LOGS_DIR') || null },
            { source: 'environment variable', value: process.env.CLAUDE_LOGS_DIR || null },
            { source: 'platform default', value: getDefaultLogsPathForPlatform() }
          ].filter(item => item.value !== null),
        },
        OUTPUT_DIR: {
          value: process.env.OUTPUT_DIR || null,
          default: './output',
          current: getOutputDir(),
          description: 'Directory for analysis output files',
        },
        NODE_ENV: {
          value: process.env.NODE_ENV || 'production',
          current: process.env.NODE_ENV || 'production',
          description: 'Node.js environment mode',
        },
        CLAUDE_CODE_MODEL: {
          value: process.env.CLAUDE_CODE_MODEL || null,
          default: 'claude-sonnet-4-20250514',
          current: getModel(),
          description: 'Claude model to use for enhanced analysis',
        },
        PORT: {
          value: process.env.PORT || null,
          default: 'Dynamic allocation',
          current: req.app.locals.currentPort || 'Unknown',
          description: 'Server port (0 for dynamic allocation)',
        },
        DEBUG_SELF_REFLECTION: {
          value: process.env.DEBUG_SELF_REFLECTION === 'true',
          current: process.env.DEBUG_SELF_REFLECTION === 'true',
          description: 'Enable debug mode for self-reflection analysis',
        },
      };

      // Runtime Settings
      const runtime = {
        port: req.socket?.localPort || 'Unknown',
        uptime: Math.floor(process.uptime()),
        logsDirectoryValid: await checkDirectoryExists(getLogsDir()),
        outputDirectoryValid: await checkDirectoryExists(getOutputDir()),
        sessionsDirectoryValid: await checkDirectoryExists(getSessionsDir()),
        reportsDirectoryValid: await checkDirectoryExists(getReportsDir()),
        temporaryApiKeySet: Boolean(getApiKey() && !process.env.ANTHROPIC_API_KEY),
        environment: {
          isTest: isTest(),
          isDev: isDev(),
          isProd: isProd(),
        },
      };

      // System Information
      const system = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        defaultLogsPath: getDefaultLogsPathForPlatform(),
        memory: process.memoryUsage(),
        cpuCount: os.cpus().length,
        hostname: os.hostname(),
        homedir: os.homedir(),
        userInfo: getUserInfoSafe(),
      };

      // CLI Options Documentation
      const cliOptions = {
        analysis: [
          {
            flag: '--project=<name>',
            description: 'Filter analysis by project name',
            example: 'npm run analysis -- --project=my-app',
          },
          {
            flag: '--no-enhanced',
            description: 'Disable enhanced AI analysis to save API costs',
            example: 'npm run analysis -- --no-enhanced',
          },
          {
            flag: '--no-reports',
            description: 'Skip report generation for faster processing',
            example: 'npm run analysis -- --no-reports',
          },
        ],
        server: [
          {
            flag: '--port=<number>',
            description: 'Override server port (default: dynamic allocation)',
            example: 'npm start -- --port=3000',
          },
        ],
        sessionLoading: [
          {
            flag: 'project filter',
            description: 'Load sessions from specific project only',
            example: 'Available in dashboard UI project filter',
          },
          {
            flag: 'limit sessions',
            description: 'Limit number of sessions to process',
            example: 'Configurable via API (default: 10000)',
          },
        ],
      };

      res.json({
        environment,
        runtime,
        system,
        cliOptions,
        generated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      res.status(500).json({
        error: 'Failed to load settings',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * @swagger
   * /api/config/user-settings:
   *   post:
   *     summary: Write configuration to user config file
   *     description: Persist configuration (like API keys) to user config file for cross-platform persistence
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
   *                 description: Config key (must be whitelisted)
   *                 example: ANTHROPIC_API_KEY
   *               value:
   *                 type: string
   *                 description: Config value
   *                 example: "Your Anthropic API key"
   *     responses:
   *       200:
   *         description: Config variable written successfully
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
   *                   example: Config variable updated successfully
   *                 timestamp:
   *                   type: string
   *                   format: date-time
   *       400:
   *         description: Invalid input (unauthorized key, invalid format, etc.)
   *       500:
   *         description: File write error or internal server error
   */
  app.post('/api/config/user-settings', async (req, res) => {
    try {
      const { key, value } = req.body;

      // Validate inputs
      if (!key || typeof key !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Config key is required and must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Config value must be a string',
          timestamp: new Date().toISOString(),
        });
      }

      // Don't allow empty values for user config (unlike env files)
      if (value.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Config value cannot be empty',
          timestamp: new Date().toISOString(),
        });
      }

      // Special validation for API keys (same as env-file endpoint)
      if (key === 'ANTHROPIC_API_KEY') {
        if (!value.startsWith('sk-ant-') || value.length < 50) {
          return res.status(400).json({
            success: false,
            message: 'Invalid API key format. Please check your Anthropic API key.',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Use test-specific config file path if in test environment
      const configPath = process.env.TEST_USER_CONFIG_PATH || null;
      
      // Update user config file
      await updateUserConfig(key, value, configPath);

      res.json({
        success: true,
        message: 'Config variable updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating user config:', error);
      
      // Handle validation errors with 400 status
      if (error.message.includes('Invalid config key') || 
          error.message.includes('Config value cannot be empty')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Handle all other errors with 500 status
      res.status(500).json({
        success: false,
        message: 'Failed to update user config',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * @swagger
   * /api/config/user-settings:
   *   delete:
   *     summary: Remove configuration from user config file
   *     description: Delete a configuration key from user config file
   *     tags:
   *       - Configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               key:
   *                 type: string
   *                 description: Configuration key to remove
   *             required:
   *               - key
   */
  app.delete('/api/config/user-settings', async (req, res) => {
    try {
      const { key } = req.body;
      
      // Validate inputs
      if (!key || typeof key !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Config key is required and must be a string',
          timestamp: new Date().toISOString(),
        });
      }
      
      // Use test-specific config file path if in test environment
      const configPath = process.env.TEST_USER_CONFIG_PATH || null;
      
      // Remove from user config file
      await removeUserConfigValue(key, configPath);

      res.json({
        success: true,
        message: 'Config variable removed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error removing user config:', error);
      
      // Handle validation errors with 400 status
      if (error.message.includes('Invalid config key')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Handle all other errors with 500 status
      res.status(500).json({
        success: false,
        message: 'Failed to remove user config',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

/**
 * Get default logs path for current platform
 * @returns {string} Platform-specific default logs path
 */
function getDefaultLogsPathForPlatform() {
  // Use the same logic as getLogsDir() from config.js
  const platform = os.platform();
  const homedir = os.homedir();

  if (platform === 'darwin') {
    return `${homedir}/.claude/projects`;
  } else if (platform === 'win32') {
    return `${homedir}/AppData/Roaming/Claude/projects`;
  } else {
    return `${homedir}/.claude/projects`;
  }
}

/**
 * Check if directory exists and is accessible
 * @param {string} path - Directory path to check
 * @returns {Promise<boolean>} True if directory exists and is accessible
 */
async function checkDirectoryExists(path) {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Get directory validation status for settings display using proper log discovery
 * @param {string} dirPath - Directory path to validate
 * @returns {Promise<Object>} Validation status object
 */
async function getDirectoryValidationStatus(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    const isDirectory = stats.isDirectory();
    
    if (!isDirectory) {
      return {
        valid: false,
        exists: true,
        readable: false,
        logFileCount: 0,
        error: 'Path exists but is not a directory'
      };
    }
    
    // Try to use the proper log discovery by temporarily setting the directory
    try {
      // Store current env value
      const originalLogDir = process.env.CLAUDE_LOGS_DIR;
      
      // Temporarily set the directory for discovery
      process.env.CLAUDE_LOGS_DIR = dirPath;
      
      // Use the proper log discovery
      const logFiles = await findLogFilesFiltered({ limit: 1000 });
      const logFileCount = logFiles.length;
      
      // Restore original env value
      if (originalLogDir) {
        process.env.CLAUDE_LOGS_DIR = originalLogDir;
      } else {
        delete process.env.CLAUDE_LOGS_DIR;
      }
      
      return {
        valid: true,
        exists: true,
        readable: true,
        logFileCount,
        message: logFileCount === 0 
          ? 'Directory is valid but contains no log files'
          : `Directory is valid and contains ${logFileCount} log file${logFileCount !== 1 ? 's' : ''}`
      };
    } catch (readError) {
      return {
        valid: false,
        exists: true,
        readable: false,
        logFileCount: 0,
        error: `Directory exists but is not readable: ${readError.message}`
      };
    }
  } catch (statError) {
    return {
      valid: false,
      exists: false,
      readable: false,
      logFileCount: 0,
      error: `Directory does not exist or is not accessible: ${statError.message}`
    };
  }
}

/**
 * Get safe user information (no sensitive data)
 * @returns {Object} Safe user info object
 */
function getUserInfoSafe() {
  try {
    const userInfo = os.userInfo();
    return {
      username: userInfo.username,
      shell: userInfo.shell || null,
      // Don't include uid/gid as they could be considered sensitive
    };
  } catch (error) {
    return {
      username: 'Unknown',
      shell: null,
    };
  }
}