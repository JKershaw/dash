/**
 * @file User Config Manager
 * Persistent user configuration stored in platform-specific user data directories
 * All values are base64 encoded to prevent automated key scanning
 * Solves Electron ASAR archive limitation where .env files cannot be written
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Whitelist of allowed config keys for security
 * Only these keys can be written to user config file
 * Reuses the same security model as env-file-manager.js
 */
const ALLOWED_CONFIG_KEYS = [
  'ANTHROPIC_API_KEY',
  // Add other safe keys here as needed
];

/**
 * Get platform-specific user config file path
 * @returns {string} Absolute path to user config file
 */
export function getUserConfigPath() {
  // Use test isolation when explicitly requested OR in test environment
  if (process.env.NODE_ENV === 'test' || process.env.CLAUDE_TEST_ISOLATION === 'true') {
    return path.join(os.tmpdir(), `claude-test-user-config-${process.pid}-${Date.now()}.json`);
  }
  
  const platform = os.platform();
  const homedir = os.homedir();
  
  let configDir;
  if (platform === 'darwin') {
    configDir = path.join(homedir, '.claude');
  } else if (platform === 'win32') {
    configDir = path.join(homedir, 'AppData', 'Roaming', 'Claude');
  } else {
    configDir = path.join(homedir, '.claude');
  }
  
  return path.join(configDir, 'user-config.json');
}

/**
 * Encode config value using base64 to prevent automated key scanning
 * @param {string|null|undefined} value - Value to encode
 * @returns {string|null} Base64 encoded value or null
 */
export function encodeConfigValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value !== 'string') {
    return null;
  }
  
  return Buffer.from(value, 'utf8').toString('base64');
}

/**
 * Decode config value from base64
 * @param {string|null|undefined} encodedValue - Base64 encoded value to decode
 * @returns {string|null} Decoded value or null
 */
export function decodeConfigValue(encodedValue) {
  if (encodedValue === null || encodedValue === undefined) {
    return null;
  }
  
  if (typeof encodedValue !== 'string') {
    return null;
  }
  
  try {
    return Buffer.from(encodedValue, 'base64').toString('utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Validate that a config key is allowed to be written
 * @param {string} key - Config key to validate
 * @returns {boolean} True if key is allowed
 */
export function validateConfigKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  return ALLOWED_CONFIG_KEYS.includes(key);
}

/**
 * Read user config file and return parsed object
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<Object|null>} Parsed config object or null if file doesn't exist or is corrupted
 */
export async function readUserConfig(configPath = null) {
  const filePath = configPath || getUserConfigPath();
  
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (_error) {
    // File doesn't exist, is corrupted, or permission denied
    return null;
  }
}

/**
 * Write user config to file atomically
 * @param {Object} config - Config object to write
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<void>}
 */
export async function writeUserConfig(config, configPath = null) {
  const filePath = configPath || getUserConfigPath();
  const configDir = path.dirname(filePath);
  
  // Create directory if it doesn't exist
  await fs.mkdir(configDir, { recursive: true });
  
  // Atomic write: write to temp file then rename
  const tempFilePath = `${filePath}.tmp`;
  
  try {
    await fs.writeFile(tempFilePath, JSON.stringify(config, null, 2), 'utf8');
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to write user config: ${error.message}`);
  }
}

/**
 * Update or add a config value in user config file
 * This is the main function used by the API endpoint
 * 
 * @param {string} key - Config key (must be in whitelist)
 * @param {string} value - Config value
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<void>}
 */
export async function updateUserConfig(key, value, configPath = null) {
  // Validate inputs
  if (!validateConfigKey(key)) {
    throw new Error(`Invalid config key: ${key}. Only whitelisted keys are allowed.`);
  }
  
  if (!value || value === null || value === undefined) {
    throw new Error('Config value cannot be empty');
  }
  
  try {
    const filePath = configPath || getUserConfigPath();
    
    // Read existing config or start with empty object
    let config = await readUserConfig(filePath);
    if (!config || typeof config !== 'object') {
      config = {};
    }
    
    // Update the value (encode for security)
    config[key] = encodeConfigValue(value);
    
    // Write config atomically
    await writeUserConfig(config, filePath);
    
  } catch (error) {
    if (error.message.includes('Invalid config key') || 
        error.message.includes('Config value cannot be empty')) {
      // Re-throw validation errors as-is
      throw error;
    }
    
    throw new Error(`Failed to update user config: ${error.message}`);
  }
}

/**
 * Get config value from user config file
 * @param {string} key - Config key to retrieve
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<string|null>} Decoded config value or null if not found
 */
export async function getUserConfigValue(key, configPath = null) {
  try {
    const config = await readUserConfig(configPath);
    if (!config || !config[key]) {
      return null;
    }
    
    return decodeConfigValue(config[key]);
  } catch (error) {
    return null;
  }
}

/**
 * Remove a config value from user config file
 * @param {string} key - Config key to remove
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<void>}
 */
export async function removeUserConfigValue(key, configPath = null) {
  if (!validateConfigKey(key)) {
    throw new Error(`Invalid config key: ${key}. Only whitelisted keys are allowed.`);
  }
  
  try {
    const filePath = configPath || getUserConfigPath();
    const config = await readUserConfig(filePath);
    
    if (!config || typeof config !== 'object') {
      return; // Nothing to remove
    }
    
    // Remove the key
    delete config[key];
    
    // Write updated config
    await writeUserConfig(config, filePath);
    
  } catch (error) {
    throw new Error(`Failed to remove config value: ${error.message}`);
  }
}

/**
 * Check if user config file exists and is writable
 * @param {string} configPath - Path to config file (optional, uses default if not provided)
 * @returns {Promise<{exists: boolean, writable: boolean, error?: string}>}
 */
export async function checkUserConfigStatus(configPath = null) {
  const filePath = configPath || getUserConfigPath();
  const configDir = path.dirname(filePath);
  
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
      // File exists, check if writable
      try {
        await fs.access(filePath, fs.constants.W_OK);
        return { exists: true, writable: true };
      } catch (writeError) {
        return { 
          exists: true, 
          writable: false, 
          error: `Cannot write to config file: ${writeError.message}` 
        };
      }
    } catch (accessError) {
      // File doesn't exist, check if we can create it
      try {
        await fs.mkdir(configDir, { recursive: true });
        
        // Try to create a test file
        const testFile = `${filePath}.test`;
        await fs.writeFile(testFile, '{}');
        await fs.unlink(testFile);
        
        return { exists: false, writable: true };
      } catch (createError) {
        return { 
          exists: false, 
          writable: false, 
          error: `Cannot create config file: ${createError.message}` 
        };
      }
    }
  } catch (error) {
    return { 
      exists: false, 
      writable: false, 
      error: `Error checking config file: ${error.message}` 
    };
  }
}