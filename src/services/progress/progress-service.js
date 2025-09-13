/**
 * @file Unified Progress Service
 * Core service for context-aware progress tracking
 */

import { EventEmitter } from 'events';
import { calculateProgressPercentage } from './progress-calculator.js';
import { generateProgressUI } from './progress-ui-generator.js';
import { generateJobId, getDefaultMessage, clampPercentage } from './progress-utils.js';

/**
 * Unified Progress Service - Core Implementation
 * Handles all progress tracking with context-aware phase management
 */
export class UnifiedProgressService extends EventEmitter {
  constructor() {
    super();
    
    // Store current progress state for each job
    this.jobStates = new Map();
    
    // Context-specific listeners
    this.contextListeners = new Map();
  }

  /**
   * Report progress for any context
   * @param {string} context - Context type ('analysis', 'chat', etc.)
   * @param {string} operation - Operation in 'phase:step' format
   * @param {Object} data - Progress data
   */
  reportProgress(context, operation, data = {}) {
    const jobId = data.jobId || generateJobId();
    const timestamp = Date.now();
    
    // Calculate percentage with clamping
    const percentage = data.percentage !== undefined 
      ? clampPercentage(data.percentage)
      : calculateProgressPercentage(context, operation, data);
    
    // Create progress event
    const event = {
      jobId,
      context,
      operation,
      timestamp,
      message: data.message || getDefaultMessage(operation),
      details: data.details || '',
      ...data, // Include all additional fields first
      percentage // Override percentage last to ensure clamping
    };
    
    // Update job state
    this.updateJobState(jobId, event);
    
    // Emit events
    this.emit('progress', event);
    this.emitContextSpecific(context, event);
  }

  /**
   * Listen to progress events for specific context or all contexts
   * @param {string} contextOrPattern - Context name or '*' for all
   * @param {Function} callback - Event callback
   */
  onProgress(contextOrPattern, callback) {
    if (contextOrPattern === '*') {
      this.on('progress', callback);
    } else {
      // Store context-specific listeners
      if (!this.contextListeners.has(contextOrPattern)) {
        this.contextListeners.set(contextOrPattern, []);
      }
      this.contextListeners.get(contextOrPattern).push(callback);
    }
  }

  /**
   * Remove progress listener
   * @param {string} contextOrPattern - Context name or '*' for all
   * @param {Function} callback - Event callback to remove
   */
  offProgress(contextOrPattern, callback) {
    if (contextOrPattern === '*') {
      this.off('progress', callback);
    } else if (this.contextListeners.has(contextOrPattern)) {
      const listeners = this.contextListeners.get(contextOrPattern);
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.contextListeners.delete(contextOrPattern);
        }
      }
    }
  }

  /**
   * Get current progress state for a job
   * @param {string} jobId - Job identifier
   * @returns {Object|null} Progress state or null if not found
   */
  getProgress(jobId) {
    return this.jobStates.get(jobId) || null;
  }

  /**
   * Get UI-ready progress data
   * @param {string} jobId - Job identifier
   * @returns {Object|null} UI data structure or null if not found
   */
  getProgressUI(jobId) {
    const state = this.getProgress(jobId);
    return generateProgressUI(state);
  }

  /**
   * Clean up old job states (memory management)
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {number} Number of jobs cleaned up
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const now = Date.now();
    const jobsToRemove = [];
    
    for (const [jobId, state] of this.jobStates.entries()) {
      if (state.lastUpdate && (now - state.lastUpdate) > maxAge) {
        jobsToRemove.push(jobId);
      }
    }
    
    jobsToRemove.forEach(jobId => {
      this.jobStates.delete(jobId);
    });
    
    return jobsToRemove.length;
  }

  // Helper methods

  /**
   * Update job state with new event
   * @param {string} jobId - Job identifier
   * @param {Object} event - Progress event
   */
  updateJobState(jobId, event) {
    const existingState = this.jobStates.get(jobId);
    const now = Date.now();
    
    if (existingState) {
      // Update existing state
      Object.assign(existingState, {
        ...event,
        lastUpdate: now
      });
    } else {
      // Create new state
      this.jobStates.set(jobId, {
        ...event,
        startTime: now,
        lastUpdate: now
      });
    }
  }

  /**
   * Emit context-specific events
   * @param {string} context - Context name
   * @param {Object} event - Progress event
   */
  emitContextSpecific(context, event) {
    if (this.contextListeners.has(context)) {
      const listeners = this.contextListeners.get(context);
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in context-specific progress listener:', error);
        }
      });
    }
  }
}