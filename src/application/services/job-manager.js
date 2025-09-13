/**
 * @file Simple Single-Job Manager (In-Memory)
 * Manages one analysis job at a time with reliable state tracking
 * Pure in-memory approach - simple and fast
 */

/**
 * Simple JobManager that handles one job at a time
 * Fixes the LLM error propagation bug by eliminating complex ID management
 */
export class JobManager {
  constructor() {
    // Store single job - much simpler than Map with broken ID logic
    this.currentJob = null;
  }

  /**
   * Create a new job (replaces any existing job)
   * @param {string} jobIdOrType - Job ID (ignored) or job type
   * @param {string} [type] - Job type (if first param is jobId)
   * @returns {string} Generated job ID
   */
  createJob(jobIdOrType, type) {
    // Handle both old (jobId, type) and new (type) signatures
    const jobType = type || jobIdOrType || 'analysis';

    // Always generate unique job ID to avoid conflicts
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const jobId = `${jobType}_${timestamp}_${random}`;

    this.currentJob = {
      id: jobId,
      type: jobType,
      status: 'started',
      progress: {
        current: 'Initializing',
        percentage: 0,
        steps: {
          initializeDirectories: 'pending',
          discoverLogFiles: 'pending',
          analyzeSessions: 'pending',
          generateRecommendations: 'pending',
          enhancedAnalysis: 'pending',
          generateReports: 'pending',
        },
      },
      progressHistory: [],
      startTime: new Date().toISOString(),
      endTime: null,
      result: null,
      error: null,
    };

    return jobId;
  }

  /**
   * Get job by ID (returns current job if ID matches, null otherwise)
   * @param {string} jobId - Job ID
   * @returns {Object|null} Job data or null
   */
  getJob(jobId) {
    if (!this.currentJob) return null;

    // Match by ID if provided, otherwise return current job (backward compatibility)
    if (jobId && this.currentJob.id !== jobId) {
      return null;
    }

    return this.currentJob;
  }

  /**
   * Complete the current job with results
   * @param {string} jobId - Job ID (ignored in single-job system)
   * @param {Object} result - Job result data
   */
  completeJob(jobId, result) {
    if (!this.currentJob) return;

    this.currentJob.status = 'completed';
    this.currentJob.progress.percentage = 100;
    this.currentJob.progress.current = 'Analysis complete';
    this.currentJob.endTime = new Date().toISOString();
    this.currentJob.result = result; // This preserves llmError!
  }

  /**
   * Mark job as failed
   * @param {string} jobId - Job ID (ignored)
   * @param {Error} error - Error that caused failure
   */
  failJob(jobId, error) {
    if (!this.currentJob) return;

    this.currentJob.status = 'failed';
    this.currentJob.endTime = new Date().toISOString();
    // Store error as object like tests expect
    this.currentJob.error = error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Update job progress (handles both old and new calling patterns)
   * @param {string} jobId - Job ID (ignored in single-job system)
   * @param {string|Object} stepOrData - Either step name OR progress data object
   * @param {Object} data - Progress data (only used in old 3-param pattern)
   */
  updateProgress(jobId, stepOrData, data = {}) {
    if (!this.currentJob) return;

    // Handle both calling patterns to maintain compatibility with analysis runner
    let step, progressData;
    if (typeof stepOrData === 'object' && stepOrData !== null) {
      // New pattern: updateProgress(jobId, dataObject) - used by analysis runner
      step = stepOrData.step || 'progress';
      progressData = stepOrData;
    } else {
      // Old pattern: updateProgress(jobId, step, data) - used by tests
      step = stepOrData;
      progressData = data;
    }

    // DEBUG: Log progress flow to trace where tool activity gets lost
    console.log(`🐛 PROGRESS: step="${step}", has_toolActivity=${!!progressData.toolActivity}, current_toolActivity=${!!this.currentJob.progress.toolActivity}`);
    if (progressData.toolActivity) {
      console.log(`🐛 PROGRESS: toolActivity details - originalStep="${progressData.toolActivity.originalStep}", toolName="${progressData.toolActivity.toolName}", message="${progressData.toolActivity.message}"`);
    }

    // Handle tool activity updates separately
    if (step === 'enhancedAnalysis:toolActivity' && progressData.toolActivity) {
      // Store tool activity without affecting main progress
      this.currentJob.progress.toolActivity = progressData.toolActivity;
      return;
    }

    // Track progress history in format expected by ProgressDebugLogger
    const historyEntry = {
      timestamp: new Date().toISOString(),
      message: progressData.message || progressData.current || step,
      percentage: progressData.percentage || 0,
      elapsedMs: Date.now() - new Date(this.currentJob.startTime).getTime(),
      step: step,
      details: progressData.details || '',
    };
    this.currentJob.progressHistory.push(historyEntry);

    // Update progress state (handle both data.message and data.current)
    this.currentJob.progress.current = progressData.current || progressData.message || step;
    this.currentJob.progress.details = progressData.details || '';

    if (progressData.percentage !== undefined) {
      this.currentJob.progress.percentage = Math.min(100, Math.max(0, progressData.percentage));
    }

    // Store file processing info for frontend display
    if (progressData.filesProcessed !== undefined) {
      this.currentJob.progress.filesProcessed = progressData.filesProcessed;
    }
    if (progressData.totalFiles !== undefined) {
      this.currentJob.progress.totalFiles = progressData.totalFiles;
    }

    // Update step status if it's a known step
    if (typeof step === 'string' && step.includes(':')) {
      const stepName = step.split(':')[0];
      if (this.currentJob.progress.steps[stepName] !== undefined) {
        if (step.includes(':start')) {
          this.currentJob.progress.steps[stepName] = 'running';
        } else if (step.includes(':complete')) {
          this.currentJob.progress.steps[stepName] = 'completed';
        }
        // :progress events don't change the step status - keep current state
      }
    }
  }

  /**
   * Get all jobs (returns array with current job or empty array)
   * @returns {Array} Array of jobs
   */
  getAllJobs() {
    return this.currentJob ? [this.currentJob] : [];
  }

  /**
   * Clear all jobs (for testing)
   */
  clear() {
    this.currentJob = null;
  }

  /**
   * No-op cleanup method (for compatibility)
   */
  stopCleanup() {
    // No cleanup needed for single job
  }

  /**
   * Update step status (for compatibility with analysis runner)
   * @param {string} jobId - Job ID (ignored)
   * @param {string} step - Step name
   * @param {string} status - Step status
   */
  updateStep(jobId, step, status) {
    // Simple progress update for single job system
    if (this.currentJob) {
      this.currentJob.progress.current = `${step}: ${status}`;
    }
  }
}

// Create singleton instance
let jobManagerInstance = null;

/**
 * Get the singleton JobManager instance
 * @returns {JobManager} JobManager instance
 */
export function getJobManager() {
  if (!jobManagerInstance) {
    jobManagerInstance = new JobManager();
  }
  return jobManagerInstance;
}

/**
 * Reset the JobManager (mainly for testing)
 */
export function resetJobManager() {
  jobManagerInstance = null;
}
