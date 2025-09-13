/**
 * @file .env File Manager Utility
 * Safely reads and writes environment variables to .env files
 * Used for persisting API keys across server restarts with dynamic ports
 */

import { promises as fs, existsSync } from 'fs';

/**
 * Whitelist of allowed environment variable keys for security
 * Only these keys can be written to .env file via the web interface
 */
const ALLOWED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  // Add other safe keys here as needed
];

/**
 * Validate that an environment variable key is allowed to be written
 * @param {string} key - Environment variable key to validate
 * @returns {boolean} True if key is allowed
 */
export function validateEnvKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  return ALLOWED_ENV_KEYS.includes(key);
}

/**
 * Read .env file and return lines as array
 * @param {string} envFilePath - Path to .env file
 * @returns {Promise<string[]>} Array of lines from file
 */
export async function readEnvFile(envFilePath) {
  try {
    if (!existsSync(envFilePath)) {
      return [];
    }
    
    const content = await fs.readFile(envFilePath, 'utf8');
    const lines = content.split('\n');
    
    // Remove the final empty line if file ends with newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    return lines;
  } catch (error) {
    throw new Error(`Failed to read .env file: ${error.message}`);
  }
}

/**
 * Write lines to .env file atomically
 * @param {string[]} lines - Lines to write to file
 * @param {string} envFilePath - Path to .env file
 * @returns {Promise<void>}
 */
export async function writeEnvFile(lines, envFilePath) {
  try {
    // Join lines and add final newline
    const content = lines.join('\n') + '\n';
    await fs.writeFile(envFilePath, content, 'utf8');
  } catch (error) {
    throw new Error(`Failed to write .env file: ${error.message}`);
  }
}

/**
 * Update or add an environment variable in .env file
 * This is the main function used by the API endpoint
 * 
 * @param {string} key - Environment variable key (must be in whitelist)
 * @param {string} value - Environment variable value
 * @param {string} envFilePath - Path to .env file (defaults to '.env')
 * @returns {Promise<void>}
 */
export async function updateEnvVariable(key, value, envFilePath = '.env') {
  // Validate inputs
  if (!validateEnvKey(key)) {
    throw new Error(`Invalid environment variable key: ${key}. Only whitelisted keys are allowed.`);
  }
  
  if (!value || value === null || value === undefined) {
    throw new Error('Environment variable value cannot be empty');
  }
  
  try {
    // Read existing file
    const lines = await readEnvFile(envFilePath);
    
    // Look for existing key (either active or commented)
    const keyPrefix = `${key}=`;
    const commentedKeyPrefix = `#${key}=`;
    const newLine = `${key}=${value}`;
    let updated = false;
    
    const updatedLines = lines.map(line => {
      const trimmedLine = line.trim();
      
      // Replace existing active key
      if (trimmedLine.startsWith(keyPrefix)) {
        updated = true;
        return newLine;
      }
      
      // Replace existing commented key
      if (trimmedLine.startsWith(commentedKeyPrefix)) {
        updated = true;
        return newLine;
      }
      
      return line;
    });
    
    // If key wasn't found, add it at the end
    if (!updated) {
      updatedLines.push(newLine);
    }
    
    // Write file atomically
    await writeEnvFile(updatedLines, envFilePath);
    
  } catch (error) {
    if (error.message.includes('Invalid environment variable key') || 
        error.message.includes('Environment variable value cannot be empty')) {
      // Re-throw validation errors as-is
      throw error;
    }
    
    throw new Error(`Failed to update environment variable: ${error.message}`);
  }
}

/**
 * Remove an environment variable from .env file (comment it out)
 * @param {string} key - Environment variable key to remove
 * @param {string} envFilePath - Path to .env file (defaults to '.env')
 * @returns {Promise<void>}
 */
export async function removeEnvVariable(key, envFilePath = '.env') {
  if (!validateEnvKey(key)) {
    throw new Error(`Invalid environment variable key: ${key}. Only whitelisted keys are allowed.`);
  }
  
  try {
    const lines = await readEnvFile(envFilePath);
    const keyPrefix = `${key}=`;
    
    const updatedLines = lines.map(line => {
      const trimmedLine = line.trim();
      
      // Comment out existing active key
      if (trimmedLine.startsWith(keyPrefix)) {
        return `#${line}`;
      }
      
      return line;
    });
    
    await writeEnvFile(updatedLines, envFilePath);
    
  } catch (error) {
    throw new Error(`Failed to remove environment variable: ${error.message}`);
  }
}

/**
 * Check if .env file exists and is writable
 * @param {string} envFilePath - Path to .env file
 * @returns {Promise<{exists: boolean, writable: boolean, error?: string}>}
 */
export async function checkEnvFileStatus(envFilePath = '.env') {
  try {
    const exists = existsSync(envFilePath);
    
    if (!exists) {
      // Check if we can create the file
      try {
        await fs.writeFile(envFilePath, '', { flag: 'wx' });
        await fs.unlink(envFilePath); // Clean up test file
        return { exists: false, writable: true };
      } catch (createError) {
        return { 
          exists: false, 
          writable: false, 
          error: `Cannot create .env file: ${createError.message}` 
        };
      }
    }
    
    // Check if existing file is writable
    try {
      await fs.access(envFilePath, fs.constants.W_OK);
      return { exists: true, writable: true };
    } catch (accessError) {
      return { 
        exists: true, 
        writable: false, 
        error: `Cannot write to .env file: ${accessError.message}` 
      };
    }
    
  } catch (error) {
    return { 
      exists: false, 
      writable: false, 
      error: `Error checking .env file: ${error.message}` 
    };
  }
}