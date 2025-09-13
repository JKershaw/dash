/**
 * @file Simplified Configuration
 * Direct environment variable access with essential path logic
 * Replaces 288-line configuration system with focused 70-line solution
 */

import path from 'path';
import os from 'os';
import { readFileSync, existsSync } from 'fs';
import { getUserConfigPath, decodeConfigValue } from './infrastructure/user-config.js';

// In-memory temporary configuration storage (lost on server restart)
const temporaryConfig = new Map();

/**
 * Get Claude Code logs directory with cross-platform support
 * @returns {string} Logs directory path
 */
export function getLogsDir() {
  if (process.env.CLAUDE_LOGS_DIR) {
    return process.env.CLAUDE_LOGS_DIR;
  }

  // Cross-platform default paths for Claude Code logs
  const platform = os.platform();
  if (platform === 'darwin') {
    return path.join(os.homedir(), '.claude', 'projects');
  } else if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'projects');
  } else {
    return path.join(os.homedir(), '.claude', 'projects');
  }
}

/**
 * Get output directory for processed data
 * @returns {string} Output directory path
 */
export function getOutputDir() {
  return process.env.OUTPUT_DIR || './output';
}

/**
 * Get sessions directory (builds on output directory)
 * @returns {string} Sessions directory path
 */
export function getSessionsDir() {
  return path.join(getOutputDir(), 'sessions');
}

/**
 * Get reports directory (builds on output directory)
 * @returns {string} Reports directory path
 */
export function getReportsDir() {
  return path.join(getOutputDir(), 'reports');
}

/**
 * Set temporary configuration value for current session (in-memory only)
 * @param {string} key - Configuration key to store
 * @param {any} value - Value to store temporarily
 */
export function setTemporaryConfig(key, value) {
  temporaryConfig.set(key, value);
}

/**
 * Get temporary configuration value
 * @param {string} key - Configuration key to retrieve
 * @returns {any|null} Temporary config value or null if not found
 */
export function getTemporaryConfig(key) {
  return temporaryConfig.has(key) ? temporaryConfig.get(key) : null;
}

/**
 * Clear temporary configuration value
 * @param {string} key - Configuration key to clear
 */
export function clearTemporaryConfig(key) {
  temporaryConfig.delete(key);
}

/**
 * Get effective logs directory with fallback chain
 * Priority: temporary override → environment variable → platform default
 * @returns {string} Effective logs directory path
 */
export function getEffectiveLogsDir() {
  // Check temporary override first
  const temporaryDir = getTemporaryConfig('CLAUDE_LOGS_DIR');
  if (temporaryDir && temporaryDir !== '' && temporaryDir !== null) {
    return temporaryDir;
  }
  
  // Fall back to standard logs directory logic
  return getLogsDir();
}

/**
 * Check if running in test environment
 * @returns {boolean} True if in test environment
 */
export function isTest() {
  return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'testing';
}

/**
 * Check if running in development environment
 * @returns {boolean} True if in development environment
 */
export function isDev() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production environment
 * @returns {boolean} True if in production environment
 */
export function isProd() {
  return !isTest() && !isDev();
}


/**
 * Get API key for Anthropic/Claude integration
 * Follows hierarchy: temporary → user config → environment variable
 * @param {string} userConfigPath - Optional path to user config file for testing
 * @returns {string|null} API key if configured, null otherwise
 */
export function getApiKey(userConfigPath = null) {
  // 1. Check temporary config first (highest priority)
  const temporaryKey = getTemporaryConfig('ANTHROPIC_API_KEY');
  if (temporaryKey) {
    return temporaryKey;
  }
  
  // 2. Check user config file (persistent user settings)
  try {
    const userConfigKey = getUserConfigValueSync('ANTHROPIC_API_KEY', userConfigPath);
    if (userConfigKey) {
      return userConfigKey;
    }
  } catch (error) {
    // Silently fall through to environment variable if user config fails
  }
  
  // 3. Check environment variable (from .env file)
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return envKey;
  }
  
  // 4. Return null if no key found anywhere
  return null;
}

/**
 * Get API key source for debugging and UI display
 * @param {string} userConfigPath - Optional path to user config file for testing
 * @returns {string|null} Source of the API key: 'temporary', 'user-config', 'environment', or null
 */
export function getApiKeySource(userConfigPath = null) {
  // Check temporary config first
  const temporaryKey = getTemporaryConfig('ANTHROPIC_API_KEY');
  if (temporaryKey) {
    return 'temporary';
  }
  
  // Check user config
  try {
    const userConfigKey = getUserConfigValueSync('ANTHROPIC_API_KEY', userConfigPath);
    if (userConfigKey) {
      return 'user-config';
    }
  } catch (error) {
    // Fall through to environment check
  }
  
  // Check environment variable
  if (process.env.ANTHROPIC_API_KEY) {
    return 'environment';
  }
  
  return null;
}

/**
 * Synchronously read user config value
 * @param {string} key - Config key to retrieve  
 * @param {string} userConfigPath - Optional path to user config file
 * @returns {string|null} Config value or null
 */
function getUserConfigValueSync(key, userConfigPath = null) {
  try {
    const configPath = userConfigPath || getUserConfigPath();
    
    if (!existsSync(configPath)) {
      return null;
    }
    
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    
    if (!config || !config[key]) {
      return null;
    }
    
    return decodeConfigValue(config[key]);
  } catch (error) {
    // File doesn't exist, is corrupted, or permission denied
    return null;
  }
}

/**
 * Set temporary API key for current session (in-memory only)
 * @param {string} key - API key to store temporarily
 */
export function setTemporaryApiKey(key) {
  setTemporaryConfig('ANTHROPIC_API_KEY', key);
}

/**
 * Clear temporary API key
 */
export function clearTemporaryApiKey() {
  clearTemporaryConfig('ANTHROPIC_API_KEY');
}

/**
 * Check if API integration is enabled and configured
 * @returns {boolean} True if API is enabled and has valid key
 */
export function isApiEnabled() {
  return Boolean(!isTest() && getApiKey() && getApiKey() !== 'your-key-here');
}

/**
 * Get Claude model configuration
 * @returns {string} Model name
 */
export function getModel() {
  return process.env.CLAUDE_CODE_MODEL || 'claude-sonnet-4-20250514';
}

/**
 * Initialize console.log emoji stripping for test environments
 *
 * WHY: Prevents Claude Code session crashes during AI tests. When tests output emojis
 * to console, those emojis get captured by bash commands and passed to Claude Code's
 * processing pipeline, causing 400 errors from problematic Unicode characters.
 *
 * This patches console.log to strip emojis in test mode, preventing the Unicode
 * characters from ever reaching Claude Code's context.
 *
 * Call this early in application startup to patch console.log globally
 */
export function initTestSafeLogging() {
  // Always patch when this function is called (AI tests call it explicitly)
  // The fact that AI tests import and call this means we want emoji stripping
  const shouldStripEmojis = true; // Force enable since AI tests explicitly request it

  if (!shouldStripEmojis) {
    return; // No patching needed in production
  }

  // Store original console.log
  const originalConsoleLog = console.log;

  // Override console.log to strip emojis in test mode
  console.log = (...args) => {
    const cleanArgs = args.map(arg => {
      if (typeof arg === 'string') {
        // Strip emojis and other problematic Unicode characters
        return arg
          .replace(
            /[\u{1F000}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
            '[EMOJI]'
          )
          .replace(/[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '[EMOJI]')
          .replace(
            /🤖|🔍|🧠|✅|❌|📊|📈|⚙️|🛠️|🔬|💡|🚨|🎯|⚡|🏗️|🧪|📝|📡|🎉|⏱️|⏭️|ℹ️|⚠️/g,
            '[EMOJI]'
          );
      }
      return arg;
    });

    // Call original console.log with cleaned arguments
    return originalConsoleLog.apply(console, cleanArgs);
  };

  console.log('[INIT] Test-safe logging enabled - emojis stripped to prevent Claude Code crashes');
}

