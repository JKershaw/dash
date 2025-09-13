/**
 * @file Progress Utilities
 * Pure utility functions for progress tracking system
 */

/**
 * Generate a unique job ID
 * @returns {string} Job ID in format: job_timestamp_random
 */
export function generateJobId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `job_${timestamp}_${random}`;
}

/**
 * Get default message for operation
 * @param {string} operation - Operation identifier (phase:step format)
 * @returns {string} Human-readable default message
 */
export function getDefaultMessage(operation) {
  const [phase, step] = operation.split(':');
  
  if (step === 'start') {
    return `Starting ${phase}`;
  } else if (step === 'complete') {
    return `${phase} complete`;
  } else if (step === 'progress') {
    return `Processing ${phase}`;
  } else {
    return `Running ${operation}`;
  }
}

/**
 * Format elapsed time in human-readable format
 * @param {number} elapsedMs - Elapsed time in milliseconds
 * @returns {string} Formatted time string (e.g., "2m 30s", "1h 15m")
 */
export function formatElapsedTime(elapsedMs) {
  const seconds = Math.floor(elapsedMs / 1000);

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

/**
 * Clamp percentage value to valid range
 * @param {number} percentage - Input percentage
 * @returns {number} Percentage clamped to 0-100 range
 */
export function clampPercentage(percentage) {
  return Math.max(0, Math.min(100, percentage));
}

/**
 * Check if operation represents a completion step
 * @param {string} operation - Operation identifier
 * @returns {boolean} True if operation is a completion step
 */
export function isCompletionStep(operation) {
  return operation.endsWith(':complete') || operation.includes('100');
}

/**
 * Check if operation represents a start step
 * @param {string} operation - Operation identifier
 * @returns {boolean} True if operation is a start step
 */
export function isStartStep(operation) {
  return operation.endsWith(':start');
}

/**
 * Extract phase name from operation
 * @param {string} operation - Operation identifier (phase:step format)
 * @returns {string} Phase name
 */
export function extractPhase(operation) {
  return operation.split(':')[0];
}

/**
 * Extract step name from operation
 * @param {string} operation - Operation identifier (phase:step format)
 * @returns {string} Step name
 */
export function extractStep(operation) {
  const parts = operation.split(':');
  return parts[1] || 'unknown';
}