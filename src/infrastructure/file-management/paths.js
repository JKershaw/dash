/**
 * @file Simple Path Utilities
 * Clean, focused functions for file and directory paths
 */

import path from 'path';
import { promises as fs } from 'fs';
import { getSessionsDir, getReportsDir } from '../../config.js';

/**
 * Get session file path
 * @param {string} projectName - Project name
 * @param {string} filename - Session filename (including extension)
 * @returns {string} Full session file path
 */
export function getSessionFilePath(projectName, filename) {
  return path.join(getSessionsDir(), sanitizeFilename(projectName), filename);
}

/**
 * Get report file path
 * @param {string} reportName - Report name
 * @returns {string} Full report file path
 */
export function getReportFilePath(reportName) {
  return path.join(getReportsDir(), `${reportName}.md`);
}

/**
 * Get project directory path
 * @param {string} projectName - Project name
 * @returns {string} Project directory path
 */
export function getProjectDir(projectName) {
  return path.join(getSessionsDir(), sanitizeFilename(projectName));
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
export async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Sanitize filename for filesystem safety
 * @param {string} name - Raw name
 * @returns {string} Sanitized name
 */
export function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

/**
 * Find session file by ID across all projects
 * @param {string} sessionId - Session ID to find
 * @returns {string|null} Session file path or null
 */
export async function findSessionFile(sessionId) {
  try {
    const sessionsDir = getSessionsDir();
    const projects = await fs.readdir(sessionsDir);

    for (const project of projects) {
      const projectPath = path.join(sessionsDir, project);
      const sessionPath = path.join(projectPath, `${sessionId}.md`);

      try {
        await fs.access(sessionPath);
        return sessionPath;
      } catch {
        // Continue searching
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find script file by ID across all projects
 * @param {string} sessionId - Session ID to find script for
 * @returns {string|null} Script file path or null
 */
export async function findScriptFile(sessionId) {
  try {
    const sessionsDir = getSessionsDir();
    const projects = await fs.readdir(sessionsDir);

    for (const project of projects) {
      const projectPath = path.join(sessionsDir, project);
      const scriptPath = path.join(projectPath, `${sessionId}.script.md`);

      try {
        await fs.access(scriptPath);
        return scriptPath;
      } catch {
        // Continue searching
      }
    }

    return null;
  } catch {
    return null;
  }
}
