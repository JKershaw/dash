/**
 * @file Progress UI Generator Service
 * Converts job progress data into structured UI data for frontend rendering
 */

/**
 * Generate UI-ready data from job progress information
 * @param {Object} job - Job object from JobManager
 * @returns {Object} UI data structure
 */
export function generateProgressUI(job) {
  if (!job) {
    return null;
  }

  const elapsedMs = job.endTime
    ? new Date(job.endTime).getTime() - new Date(job.startTime).getTime()
    : Date.now() - new Date(job.startTime).getTime();

  // Check if completed job has LLM errors (convert to boolean)
  const hasLLMError = job.status === 'completed' && !!job.result?.llmError;

  return {
    progressBar: {
      percentage: job.progress?.percentage || 0,
      isComplete: job.status === 'completed',
      isError: job.status === 'failed',
      hasLLMError: hasLLMError, // Boolean flag for completed-with-LLM-errors state
    },

    status: {
      message: job.progress?.current || getDefaultStatusMessage(job.status, hasLLMError),
      details: job.progress?.details || '',
      level: getStatusLevel(job.status, hasLLMError),
      showSpinner: job.status === 'processing' || job.status === 'started',
    },

    steps: generateStepData(job.progress?.steps || {}),

    timing: {
      elapsedSeconds: Math.floor(elapsedMs / 1000),
      elapsedFormatted: formatElapsedTime(elapsedMs),
    },

    // Include tool activity if present
    toolActivity: job.progress?.toolActivity || null,
  };
}

/**
 * Get default status message for job status
 * @param {string} status - Job status
 * @param {boolean} hasLLMError - Whether completed job has LLM errors
 * @returns {string} Default message
 */
function getDefaultStatusMessage(status, hasLLMError = false) {
  const messages = {
    started: 'Starting analysis',
    processing: 'Processing',
    completed: hasLLMError ? 'Analysis completed with errors' : 'Analysis complete',
    failed: 'Analysis failed',
  };
  return messages[status] || 'Unknown status';
}

/**
 * Get status level for styling purposes
 * @param {string} status - Job status
 * @param {boolean} hasLLMError - Whether completed job has LLM errors
 * @returns {string} Status level
 */
function getStatusLevel(status, hasLLMError = false) {
  const levels = {
    started: 'info',
    processing: 'processing',
    completed: hasLLMError ? 'warning' : 'success',
    failed: 'error',
  };
  return levels[status] || 'info';
}

/**
 * Generate step data array from job steps object
 * @param {Object} steps - Job steps object
 * @returns {Array} Array of step data
 */
function generateStepData(steps) {
  const stepDefinitions = [
    { id: 'initializeDirectories', label: 'Initialize directories', order: 1 },
    { id: 'generateRecommendations', label: 'Generate recommendations', order: 2 },
    { id: 'enhancedAnalysis', label: 'Enhanced AI analysis', order: 3 },
    { id: 'generateReports', label: 'Generate reports', order: 4 },
  ];

  return stepDefinitions.map(def => ({
    id: def.id,
    label: def.label,
    status: mapStepStatus(steps[def.id] || 'pending'),
    order: def.order,
  }));
}

/**
 * Map internal step status to UI-friendly status
 * @param {string} internalStatus - Internal step status
 * @returns {string} UI-friendly status
 */
function mapStepStatus(internalStatus) {
  const statusMap = {
    pending: 'pending',
    running: 'processing',
    in_progress: 'processing',
    completed: 'completed',
    error: 'failed',
    failed: 'failed',
  };
  return statusMap[internalStatus] || 'pending';
}

/**
 * Format elapsed time in human-readable format
 * @param {number} elapsedMs - Elapsed time in milliseconds
 * @returns {string} Formatted time string
 */
function formatElapsedTime(elapsedMs) {
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
