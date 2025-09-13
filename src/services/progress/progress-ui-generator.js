/**
 * @file Progress UI Generator
 * Transforms progress state into UI-ready data structures
 */

import { formatElapsedTime, isCompletionStep } from './progress-utils.js';

/**
 * Generate UI-ready progress data from job state
 * @param {Object} state - Progress state object
 * @returns {Object|null} UI data structure or null if no state
 */
export function generateProgressUI(state) {
  if (!state) return null;
  
  const now = Date.now();
  const elapsedMs = now - state.startTime;
  const isComplete = state.percentage >= 100;
  const isProcessing = state.percentage > 0 && state.percentage < 100;
  
  return {
    progressBar: {
      percentage: state.percentage,
      isComplete,
      isError: false,
      hasLLMError: false
    },
    
    status: {
      message: state.message,
      details: state.details || '',
      level: getStatusLevel(state.percentage, isComplete),
      showSpinner: isProcessing
    },
    
    timing: {
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      elapsedFormatted: formatElapsedTime(elapsedMs)
    },
    
    steps: generateStepData(state.operation, state.percentage),
    
    toolActivity: state.toolActivity || null
  };
}

/**
 * Get status level for styling purposes
 * @param {number} percentage - Current percentage
 * @param {boolean} isComplete - Whether progress is complete
 * @returns {string} Status level (info, processing, success, error)
 */
function getStatusLevel(percentage, isComplete) {
  if (isComplete) return 'success';
  if (percentage > 0) return 'processing';
  return 'info';
}

/**
 * Generate step data array for progress indicators
 * @param {string} currentOperation - Current operation/step
 * @param {number} percentage - Current progress percentage
 * @returns {Array} Array of step data objects
 */
function generateStepData(currentOperation, percentage) {
  const stepDefinitions = [
    { id: 'initializeDirectories', label: 'Initialize directories', order: 1, range: [0, 2] },
    { id: 'discoverLogFiles', label: 'Discover log files', order: 2, range: [2, 5] },
    { id: 'analyzeSessions', label: 'Analyze sessions', order: 3, range: [5, 10] },
    { id: 'generateRecommendations', label: 'Generate recommendations', order: 4, range: [10, 11] },
    { id: 'enhancedAnalysis', label: 'Enhanced AI analysis', order: 5, range: [11, 77] },
    { id: 'generateReports', label: 'Generate reports', order: 6, range: [77, 100] },
  ];

  return stepDefinitions.map(def => ({
    id: def.id,
    label: def.label,
    status: getStepStatus(def.id, currentOperation, percentage, def.range),
    order: def.order,
  }));
}

/**
 * Determine the status of a specific step based on current progress
 * @param {string} stepId - Step identifier
 * @param {string} currentOperation - Current operation
 * @param {number} percentage - Current progress percentage
 * @param {Array} range - Step percentage range [start, end]
 * @returns {string} Step status (pending, processing, completed, failed)
 */
function getStepStatus(stepId, currentOperation, percentage, range) {
  const [start, end] = range;
  
  if (percentage < start) {
    return 'pending';
  } else if (percentage >= start && percentage < end) {
    return 'processing';
  } else if (percentage >= end) {
    return 'completed';
  } else {
    return 'pending';
  }
}

/**
 * Generate progress bar configuration
 * @param {Object} state - Progress state
 * @returns {Object} Progress bar config
 */
export function generateProgressBarConfig(state) {
  if (!state) return { percentage: 0, isComplete: false, isError: false };
  
  return {
    percentage: state.percentage,
    isComplete: state.percentage >= 100,
    isError: state.error || false,
    hasLLMError: state.llmError || false,
    animated: state.percentage > 0 && state.percentage < 100
  };
}

/**
 * Generate status message configuration
 * @param {Object} state - Progress state
 * @param {Object} options - Display options
 * @returns {Object} Status config
 */
export function generateStatusConfig(state, options = {}) {
  if (!state) {
    return {
      message: 'No progress data',
      details: '',
      level: 'info',
      showSpinner: false
    };
  }
  
  const isProcessing = state.percentage > 0 && state.percentage < 100;
  const showSpinner = options.showSpinner !== false && isProcessing;
  
  return {
    message: state.message || 'Processing...',
    details: state.details || '',
    level: getStatusLevel(state.percentage, state.percentage >= 100),
    showSpinner,
    context: state.context || 'unknown'
  };
}

/**
 * Generate timing information
 * @param {Object} state - Progress state
 * @returns {Object} Timing info
 */
export function generateTimingInfo(state) {
  if (!state || !state.startTime) {
    return {
      elapsedSeconds: 0,
      elapsedFormatted: '0s',
      estimatedRemaining: null
    };
  }
  
  const now = Date.now();
  const elapsedMs = now - state.startTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  
  // Simple ETA calculation based on current percentage
  let estimatedRemaining = null;
  if (state.percentage > 0 && state.percentage < 100) {
    const remainingPercentage = 100 - state.percentage;
    const msPerPercent = elapsedMs / state.percentage;
    const remainingMs = remainingPercentage * msPerPercent;
    estimatedRemaining = formatElapsedTime(remainingMs);
  }
  
  return {
    elapsedSeconds,
    elapsedFormatted: formatElapsedTime(elapsedMs),
    estimatedRemaining
  };
}

/**
 * Generate complete UI data with all sections
 * @param {Object} state - Progress state
 * @param {Object} options - Generation options
 * @returns {Object} Complete UI data structure
 */
export function generateCompleteUI(state, options = {}) {
  if (!state) return null;
  
  return {
    progressBar: generateProgressBarConfig(state),
    status: generateStatusConfig(state, options),
    timing: generateTimingInfo(state),
    toolActivity: state.toolActivity || null,
    context: state.context || 'unknown',
    operation: state.operation || 'unknown'
  };
}