/**
 * @file Utilities for formatting timestamps and calculating durations
 */

/**
 * Format timestamp for script display
 * @param {Date|string} timestamp - The timestamp to format
 * @returns {string} Formatted time string (HH:MM:SS)
 */
export function formatScriptTime(timestamp) {
  if (!timestamp) return 'Unknown Time';
  
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (isNaN(date.getTime())) return 'Invalid Time';
  
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format duration between two timestamps
 * @param {Date|string} startTime - Start timestamp
 * @param {Date|string} endTime - End timestamp
 * @returns {string} Human readable duration
 */
export function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return 'Unknown Duration';
  
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Invalid Duration';
  
  const durationMs = end.getTime() - start.getTime();
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Calculate time elapsed from start to given timestamp
 * @param {Date|string} startTime - Session start time
 * @param {Date|string} currentTime - Current timestamp
 * @returns {string} Elapsed time string
 */
export function formatElapsedTime(startTime, currentTime) {
  if (!startTime || !currentTime) return '';
  
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const current = typeof currentTime === 'string' ? new Date(currentTime) : currentTime;
  
  if (isNaN(start.getTime()) || isNaN(current.getTime())) return '';
  
  const elapsedSeconds = Math.floor((current.getTime() - start.getTime()) / 1000);
  
  if (elapsedSeconds < 60) {
    return `+${elapsedSeconds}s`;
  } else {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `+${minutes}m${seconds}s`;
  }
}

/**
 * Format date for script header
 * @param {Date|string} timestamp - The timestamp to format
 * @returns {string} Formatted date string
 */
export function formatScriptDate(timestamp) {
  if (!timestamp) return 'Unknown Date';
  
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}