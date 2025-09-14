/**
 * @file Analysis Execution Routes
 * Handles analysis job management, execution and status tracking
 */

import {
  loadLatestAnalysisMetadata,
  loadAnalysisHistory,
  loadAnalysisMetadataByRunId,
} from '../../../services/analysis-data.js';
// Removed: generateProgressUI - now using UnifiedProgressService.getProgressUI()

/**
 * Setup analysis-related API routes
 * @param {Express} app - Express application
 */
export function setupAnalysisRoutes(app) {
  /**
   * @swagger
   * /api/analysis:
   *   get:
   *     summary: Get all analysis jobs
   *     description: Retrieve list of all analysis jobs with their current status
   *     tags:
   *       - Analysis
   */
  app.get('/api/analysis', async (req, res) => {
    try {
      // Import the analysis runner
      const { getAllJobs } = await import('../../../application/services/analysis-runner.js');

      const jobs = getAllJobs();
      res.json({
        jobs: jobs.map(job => ({
          jobId: job.id,
          status: job.status,
          type: job.type,
        })),
        total: jobs.length,
      });
    } catch (error) {
      console.error('Error getting jobs list:', error);
      res.status(500).json({
        error: 'Failed to get jobs list',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/analysis:
   *   post:
   *     summary: Start a new analysis job (unified endpoint)
   *     description: Execute analysis pipeline with optional filtering and progress tracking
   *     tags:
   *       - Analysis
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               options:
   *                 type: object
   *                 properties:
   *                   includeExecutiveSummary:
   *                     type: boolean
   *                     default: true
   *                   maxFiles:
   *                     type: integer
   *                     default: 50
   *               filters:
   *                 type: object
   *                 description: Optional filters for targeted analysis
   *                 properties:
   *                   project:
   *                     type: string
   *                     description: Filter by project name
   *                   since:
   *                     type: string
   *                     format: date
   *                     description: Filter by date
   *                   limit:
   *                     type: integer
   *                     description: Limit number of files
   */
  app.post('/api/analysis', async (req, res) => {
    try {
      const { options = {}, filters } = req.body || {};
      console.log('🚨 ANALYSIS API: Received options:', JSON.stringify(options, null, 2));
      console.log('🚨 ANALYSIS API: Received filters:', JSON.stringify(filters, null, 2));

      // Add filter information to options for the runner
      if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
        console.log('🎯 Running filtered analysis with filters:', filters);
        
        // Validate that filters will return sessions by doing a quick check
        const { loadBasicSessionData } = await import('../../../services/analysis-data.js');
        const testData = await loadBasicSessionData(filters);
        
        if (testData.sessions.length === 0) {
          return res.status(400).json({
            error: 'No logs found',
            message: 'No logs match the specified filter criteria',
            filtersApplied: filters,
          });
        }
        
        console.log(`Found ${testData.sessions.length} sessions matching filters`);
        options.filters = filters;
      } else {
        console.log('🔄 Running comprehensive analysis (no filters)');
      }

      // Import the analysis runner functions
      const { runAnalysis } = await import('../../../application/services/analysis-runner.js');

      // Start the analysis job (runs in background)
      const jobInfo = await runAnalysis(options);

      // Add filter metadata to response if applicable
      if (filters) {
        jobInfo.filtersApplied = filters;
        jobInfo.analysisType = 'filtered';
      } else {
        jobInfo.analysisType = 'full';
      }

      res.json(jobInfo);
    } catch (error) {
      console.error('Failed to start analysis:', error);
      res.status(500).json({
        error: 'Failed to start analysis',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/analysis/metadata:
   *   get:
   *     summary: Get detailed analysis metadata (latest or by run ID)
   *     description: Retrieve comprehensive metadata from the most recent analysis run or a specific run by ID, including timings, LLM usage, performance metrics, and error information
   *     tags:
   *       - Analysis
   *     parameters:
   *       - name: runId
   *         in: query
   *         description: Specific analysis run ID to retrieve (if not provided, returns latest)
   *         required: false
   *         schema:
   *           type: string
   *           example: "a496b271-bc13-459b-b74e-d42c59428d36"
   */
  app.get('/api/analysis/metadata', async (req, res) => {
    try {
      const { runId } = req.query;
      let metadata;

      if (runId) {
        metadata = await loadAnalysisMetadataByRunId(runId);
        if (!metadata) {
          return res.status(404).json({
            error: 'Analysis run not found',
            message: `No analysis metadata found for run ID: ${runId}`,
            runId,
          });
        }
      } else {
        metadata = await loadLatestAnalysisMetadata();
        if (!metadata) {
          return res.status(404).json({
            error: 'No metadata found',
            message: 'No analysis metadata files are available. Run an analysis first.',
          });
        }
      }

      // Return the complete metadata with additional computed fields for the frontend
      res.json({
        ...metadata,
        computed: {
          totalDurationFormatted: formatDuration(metadata.performance?.totalDuration || 0),
          hasErrors: (metadata.errors?.length || 0) > 0,
          hasLLMCalls: (metadata.processing?.llmCalls?.length || 0) > 0,
          totalLLMCalls: metadata.processing?.llmCalls?.length || 0,
          totalTokens:
            (metadata.processing?.tokenUsage?.simple?.total || 0) +
            (metadata.processing?.tokenUsage?.agentic?.total || 0),
          totalInputTokens:
            Object.values(metadata.processing?.tokenUsage?.simple?.byModel || {}).reduce(
              (sum, model) => sum + (model.inputTokens || 0),
              0
            ) +
            Object.values(metadata.processing?.tokenUsage?.agentic?.byModel || {}).reduce(
              (sum, model) => sum + (model.inputTokens || 0),
              0
            ),
          totalOutputTokens:
            Object.values(metadata.processing?.tokenUsage?.simple?.byModel || {}).reduce(
              (sum, model) => sum + (model.outputTokens || 0),
              0
            ) +
            Object.values(metadata.processing?.tokenUsage?.agentic?.byModel || {}).reduce(
              (sum, model) => sum + (model.outputTokens || 0),
              0
            ),
          phaseCount: metadata.processing?.phases?.length || 0,
          outputFileCount: metadata.output?.files?.length || 0,
          requestedRunId: runId || null,
          isLatest: !runId,
        },
      });
    } catch (error) {
      console.error('Error loading analysis metadata:', error);
      res.status(500).json({
        error: 'Failed to load analysis metadata',
      });
    }
  });

  /**
   * @swagger
   * /api/analysis/history:
   *   get:
   *     summary: Get analysis run history
   *     description: Retrieve list of analysis runs with summary information
   *     tags:
   *       - Analysis
   */
  app.get('/api/analysis/history', async (req, res) => {
    try {
      const history = await loadAnalysisHistory();

      res.json({
        runs: history,
        total: history.length,
      });
    } catch (error) {
      console.error('Error loading analysis history:', error);
      res.status(500).json({
        error: 'Failed to load analysis history',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/analysis/{jobId}:
   *   get:
   *     summary: Get analysis job status and results
   *     description: Poll for the current status and progress of an analysis job, includes results when completed
   *     tags:
   *       - Analysis
   */
  app.get('/api/analysis/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;

      // Import the analysis runner and progress service
      const { getJobStatus } = await import('../../../application/services/analysis-runner.js');
      const { getUnifiedProgressService } = await import('../../../services/unified-progress-service.js');

      // Get job status from analysis runner
      const jobStatus = getJobStatus(jobId);
      if (!jobStatus) {
        return res.status(404).json({
          error: 'Job not found',
          message: `No analysis job found with ID: ${jobId}`,
        });
      }

      // Get progress data from UnifiedProgressService
      const progressService = getUnifiedProgressService();
      const progressData = progressService.getProgress(jobId);
      const uiData = progressService.getProgressUI(jobId);

      // Note: Error flags are now set correctly by the progress system
      // No override needed - UnifiedProgressService receives error info directly

      const response = {
        jobId,
        status: jobStatus.status,
        progress: progressData || {},
        ui: uiData,
      };

      // Note: Results will be available through progress data when completed
      // The new system doesn't separate results into a different structure
      if (jobStatus.status === 'completed' && progressData) {
        response.results = progressData;
        response.completedAt = progressData.endTime;
      }

      res.json(response);
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({
        error: 'Failed to get job status',
        message: error.message,
      });
    }
  });
}

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
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
