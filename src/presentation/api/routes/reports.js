/**
 * @file Reports Routes
 * Consolidated reporting endpoints for dashboard, summaries, and metadata
 */

import {
  getAnalysisData,
  loadLatestAnalysisMetadata,
  loadTimestampedFileByRunId,
} from '../../../services/analysis-data.js';
// NOTE: convertMarkdownToHtml removed - frontend now handles all markdown rendering

/**
 * Setup reports API routes
 * @param {Express} app - Express application
 */
export function setupReportsRoutes(app) {
  /**
   * @swagger
   * /api/reports:
   *   get:
   *     summary: List available reports
   *     description: Get information about available report types and their status
   *     tags:
   *       - Reports
   */
  app.get('/api/reports', async (req, res) => {
    try {
      const data = await getAnalysisData();
      const metadata = await loadLatestAnalysisMetadata();

      const reports = [
        {
          type: 'dashboard',
          title: 'Dashboard Metrics',
          available: true,
          endpoint: '/api/reports/dashboard',
        },
        {
          type: 'executive-summary',
          title: 'Executive Summary',
          available: !!data.executiveSummary,
          endpoint: '/api/reports/executive-summary',
        },
        {
          type: 'narrative-summary',
          title: 'Narrative Summary',
          available: !!data.narrativeSummary,
          endpoint: '/api/reports/narrative-summary',
        },
        {
          type: 'analysis',
          title: 'Analysis Report',
          available: !!data.analysisReport,
          endpoint: '/api/reports/analysis',
        },
        {
          type: 'recommendations',
          title: 'Recommendations Report',
          available: !!data.recommendationsReport,
          endpoint: '/api/reports/recommendations',
        },
      ];

      res.json({
        reports,
        total: reports.length,
        available: reports.filter(r => r.available).length,
        lastGenerated: data.generated,
        lastAnalysisRun: metadata
          ? {
              timestamp: metadata.run?.endTime || metadata.run?.startTime,
              successful: metadata.summary?.success || false,
            }
          : null,
      });
    } catch (error) {
      console.error('Error loading reports list:', error);
      res.status(500).json({
        error: 'Failed to load reports list',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/reports/dashboard:
   *   get:
   *     summary: Get dashboard metrics and overview
   *     description: Retrieve high-level statistics and metrics for the dashboard view
   *     tags:
   *       - Reports
   */
  app.get('/api/reports/dashboard', async (req, res) => {
    try {
      const data = await getAnalysisData();

      // Calculate unique projects count
      const uniqueProjects = new Set(
        data.sessions.map(s => s.projectName).filter(name => name && name !== 'Unknown Project')
      ).size;

      // Test mode: simulate no sessions found to trigger logs directory alert
      const forceLogsAlert = process.env.FORCE_LOGS_DIRECTORY_ALERT === 'true';
      const actualTotalSessions = forceLogsAlert ? 0 : data.sessions.length;

      res.json({
        stats: data.stats,
        generated: data.generated,
        totalSessions: actualTotalSessions,
        totalProjects: uniqueProjects,
        totalMessages: data.stats.totalMessages || 0,
        totalRecommendations: data.recommendations.length,
        executiveSummary: data.executiveSummary,
        narrativeSummary: data.narrativeSummary,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      res.status(500).json({
        error: 'Failed to load dashboard data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/reports/executive-summary:
   *   get:
   *     summary: Get executive summary content (latest or by run ID)
   *     description: Retrieve executive summary in both HTML and markdown format from the most recent analysis run or a specific run by ID
   *     tags:
   *       - Reports
   *     parameters:
   *       - name: runId
   *         in: query
   *         description: Specific analysis run ID to retrieve (if not provided, returns latest)
   *         required: false
   *         schema:
   *           type: string
   *           example: "a496b271-bc13-459b-b74e-d42c59428d36"
   */
  app.get('/api/reports/executive-summary', async (req, res) => {
    try {
      const { runId } = req.query;
      let executiveSummary, enhancedAnalysis, generated;

      if (runId) {
        executiveSummary = await loadTimestampedFileByRunId(runId, 'executive-summary');
        if (!executiveSummary) {
          return res.status(404).json({
            error: 'Executive summary not found',
            message: `No executive summary found for run ID: ${runId}`,
            runId,
          });
        }
        // Load enhanced analysis for specific run if available
        enhancedAnalysis = await loadTimestampedFileByRunId(runId, 'enhanced-analysis');
        generated = new Date().toISOString(); // Use current time for API call
      } else {
        const data = await getAnalysisData();
        executiveSummary = data.executiveSummary;
        enhancedAnalysis = data.enhancedAnalysis;
        generated = data.generated || new Date().toISOString();
      }

      res.json({
        executiveSummary: executiveSummary || null,
        enhancedAnalysis: enhancedAnalysis,
        generated: generated,
        requestedRunId: runId || null,
        isLatest: !runId,
      });
    } catch (error) {
      console.error('Error loading executive summary data:', error);
      res.status(500).json({
        error: 'Failed to load executive summary data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/reports/narrative-summary:
   *   get:
   *     summary: Get narrative summary content (latest or by run ID)
   *     description: Retrieve narrative summary in both HTML and markdown format from the most recent analysis run or a specific run by ID
   *     tags:
   *       - Reports
   *     parameters:
   *       - name: runId
   *         in: query
   *         description: Specific analysis run ID to retrieve (if not provided, returns latest)
   *         required: false
   *         schema:
   *           type: string
   *           example: "a496b271-bc13-459b-b74e-d42c59428d36"
   */
  app.get('/api/reports/narrative-summary', async (req, res) => {
    try {
      const { runId } = req.query;
      let narrativeSummary, generated;

      if (runId) {
        narrativeSummary = await loadTimestampedFileByRunId(runId, 'narrative-summary');
        if (!narrativeSummary) {
          return res.status(404).json({
            error: 'Narrative summary not found',
            message: `No narrative summary found for run ID: ${runId}`,
            runId,
          });
        }
        generated = new Date().toISOString();
      } else {
        const data = await getAnalysisData();
        narrativeSummary = data.narrativeSummary;
        generated = data.generated || new Date().toISOString();
      }

      res.json({
        narrativeSummary: narrativeSummary || null,
        generated: generated,
        requestedRunId: runId || null,
        isLatest: !runId,
      });
    } catch (error) {
      console.error('Error loading narrative summary data:', error);
      res.status(500).json({
        error: 'Failed to load narrative summary data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/reports/analysis:
   *   get:
   *     summary: Get analysis report content (latest or by run ID)
   *     description: Retrieve analysis report in both HTML and markdown format from the most recent analysis run or a specific run by ID
   *     tags:
   *       - Reports
   *     parameters:
   *       - name: runId
   *         in: query
   *         description: Specific analysis run ID to retrieve (if not provided, returns latest)
   *         required: false
   *         schema:
   *           type: string
   *           example: "a496b271-bc13-459b-b74e-d42c59428d36"
   */
  app.get('/api/reports/analysis', async (req, res) => {
    try {
      const { runId } = req.query;
      let analysisReport, generated;

      if (runId) {
        analysisReport = await loadTimestampedFileByRunId(runId, 'analysis');
        if (!analysisReport) {
          return res.status(404).json({
            error: 'Analysis report not found',
            message: `No analysis report found for run ID: ${runId}`,
            runId,
          });
        }
        generated = new Date().toISOString();
      } else {
        const data = await getAnalysisData();
        analysisReport = data.analysisReport;
        generated = data.generated || new Date().toISOString();
      }

      res.json({
        analysisReport: analysisReport || null,
        generated: generated,
        requestedRunId: runId || null,
        isLatest: !runId,
      });
    } catch (error) {
      console.error('Error loading analysis report data:', error);
      res.status(500).json({
        error: 'Failed to load analysis report data',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/reports/recommendations:
   *   get:
   *     summary: Get recommendations report content (latest or by run ID)
   *     description: Retrieve recommendations report in both HTML and markdown format, plus structured recommendations data from the most recent analysis run or a specific run by ID
   *     tags:
   *       - Reports
   *     parameters:
   *       - name: runId
   *         in: query
   *         description: Specific analysis run ID to retrieve (if not provided, returns latest)
   *         required: false
   *         schema:
   *           type: string
   *           example: "a496b271-bc13-459b-b74e-d42c59428d36"
   */
  app.get('/api/reports/recommendations', async (req, res) => {
    try {
      const { runId } = req.query;
      let recommendations, recommendationsReport, generated;

      if (runId) {
        recommendationsReport = await loadTimestampedFileByRunId(runId, 'recommendations');
        if (!recommendationsReport) {
          return res.status(404).json({
            error: 'Recommendations report not found',
            message: `No recommendations report found for run ID: ${runId}`,
            runId,
          });
        }
        // For specific runs, we don't have easy access to structured recommendations
        recommendations = [];
        generated = new Date().toISOString();
      } else {
        const data = await getAnalysisData();
        recommendations = data.recommendations;
        recommendationsReport = data.recommendationsReport;
        generated = data.generated || new Date().toISOString();
      }

      res.json({
        recommendations: recommendations,
        count: recommendations.length,
        categories: recommendations.reduce((acc, rec) => {
          acc[rec.category] = (acc[rec.category] || 0) + 1;
          return acc;
        }, {}),
        recommendationsReport: recommendationsReport || null,
        generated: generated,
        requestedRunId: runId || null,
        isLatest: !runId,
      });
    } catch (error) {
      console.error('Error loading recommendations data:', error);
      res.status(500).json({
        error: 'Failed to load recommendations data',
        message: error.message,
      });
    }
  });
}
