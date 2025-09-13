/**
 * @file Simplified Path Management
 * Minimal path utilities for essential directory operations only.
 * Most functionality moved to file-utils.js for better separation of concerns.
 */

import path from 'path';

/**
 * Simplified PathManager - keeps only directory getter functionality
 * All file operations moved to file-utils.js
 */
export class PathManager {
  constructor(config) {
    this.config = config;
    this.baseDir = this.config.OUTPUT_DIRS.BASE;

    // Resolve paths once at construction
    this.paths = {
      base: path.resolve(this.baseDir),
      sessions: path.resolve(this.baseDir, 'sessions'),
      reports: path.resolve(this.baseDir, 'reports'),
      logs: this.config.LOG_PATHS.SEARCH_DIRS?.map(dir => path.resolve(dir)) || [],
    };
  }

  /**
   * Get absolute path for a directory type
   * @param {string} type - Directory type (sessions, reports, logs)
   * @returns {string} Absolute path
   */
  getDirectory(type) {
    if (!this.paths[type]) {
      throw new Error(`Unknown directory type: ${type}`);
    }
    return this.paths[type];
  }
}

/**
 * Create PathManager instance with current config
 * @param {Object} config - Configuration object
 * @returns {PathManager} PathManager instance
 */
export function createPathManager(config) {
  return new PathManager(config);
}
