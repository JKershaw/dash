/**
 * @file Simplified File Operations
 * Replaces FileRepository and PathManager complexity with essential functions only.
 * Provides config-driven paths and basic file operations using standard Node.js fs.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getSessionsDir, getReportsDir } from '../config.js';

/**
 * Create a directory if it doesn't exist
 * @param {string} dirPath - Directory path to create
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // EEXIST is okay, other errors should be thrown
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read file content as string with basic error handling
 * @param {string} filePath - Path to file
 * @param {string} encoding - File encoding (default: utf8)
 * @returns {Promise<string>} File content
 */
export async function readFileContent(filePath, encoding = 'utf8') {
  try {
    return await fs.readFile(filePath, encoding);
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

/**
 * Write content to file, creating directory if needed
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @param {string} encoding - File encoding (default: utf8)
 * @returns {Promise<void>}
 */
export async function writeFileContent(filePath, content, encoding = 'utf8') {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, encoding);
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error.message}`);
  }
}

/**
 * List directory contents with optional type filtering
 * @param {string} dirPath - Directory path
 * @param {string} type - Filter type: 'files', 'directories', or 'all' (default)
 * @returns {Promise<string[]>} Array of paths
 */
export async function listDirectory(dirPath, type = 'all') {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    let filtered = entries;
    if (type === 'files') {
      filtered = entries.filter(entry => entry.isFile());
    } else if (type === 'directories') {
      filtered = entries.filter(entry => entry.isDirectory());
    }
    
    return filtered.map(entry => path.join(dirPath, entry.name));
  } catch (error) {
    throw new Error(`Failed to list directory ${dirPath}: ${error.message}`);
  }
}

/**
 * Check if a path exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if path exists
 */
export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse JSONL file (JSON Lines)
 * @param {string} filePath - Path to JSONL file
 * @returns {Promise<Array>} Array of parsed JSON objects
 */
export async function readJsonLines(filePath) {
  try {
    const content = await readFileContent(filePath);
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (parseError) {
        throw new Error(`Invalid JSON on line ${index + 1} in ${filePath}: ${parseError.message}`);
      }
    });
  } catch (error) {
    throw new Error(`Failed to read JSONL file ${filePath}: ${error.message}`);
  }
}

// === Path Generation Functions (replaces useful PathManager functionality) ===

/**
 * Generate timestamped report file path
 * @param {string} reportType - Type of report (e.g., 'analysis', 'executive-summary')
 * @returns {string} Full file path with timestamp
 */
export function getTimestampedReportPath(reportType) {
  const timestamp = new Date().toISOString()
    .slice(0, 19)
    .replace(/[T:]/g, '-')
    .replace(/--/g, '-')
    .replace(/-$/, '');
  
  const filename = `${reportType}-${timestamp}.md`;
  return path.join(getReportsDir(), filename);
}

/**
 * Get configured directory path
 * @param {'sessions'|'reports'} type - Directory type
 * @returns {string} Directory path
 */
export function getConfiguredDir(type) {
  switch (type) {
    case 'sessions':
      return getSessionsDir();
    case 'reports':
      return getReportsDir();
    default:
      throw new Error(`Unknown directory type: ${type}`);
  }
}

/**
 * Initialize all required output directories
 * @returns {Promise<void>}
 */
export async function initializeOutputDirs() {
  await ensureDir(getSessionsDir());
  await ensureDir(getReportsDir());
}