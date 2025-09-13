/**
 * @file Simplified Analysis Pipeline
 * Replaces complex pipeline pattern with direct functional approach
 * Maintains 100% API compatibility while eliminating 900+ lines of boilerplate
 */

import { promises as fs } from 'fs';
import { loadBasicSessionData, saveRecommendationsToMarkdown } from '../services/analysis-data.js';
import { generateRecommendations } from '../shared/utilities/report-generator.js';
import { generateEnhancedAnalysis } from '../services/llm-service.js';
import {
  generateMarkdownReport,
  generateExecutiveSummary,
} from '../application/services/report-service.js';
import { getSessionsDir, getReportsDir } from '../config.js';
import { getTimestampedReportPath, writeFileContent } from '../infrastructure/file-utils.js';
import { calculateProgressPercentage, getUnifiedProgressService } from '../services/unified-progress-service.js';
import {
  createMetadata,
  trackPhase,
  trackError,
  trackOutputFile,
  finalizeMetadata,
} from '../services/metadata-collector.js';
import { KnowledgeGraph, getKnowledgeGraphPath } from '../services/knowledge-graph.js';
import { extractSessionKnowledge } from '../services/knowledge-extraction.js';

/**
 * Process Claude Code logs through complete pipeline: discovery → analysis → recommendations → reports
 * @param {Object} options - Processing options
 * @param {Function} progressCallback - Progress callback function (legacy, optional)
 * @param {Object} deps - Dependencies (progressService, etc.)
 * @returns {Promise<Object>} Complete processing results with sessions, recommendations, and reports
 */
export async function processClaudeLogs(options = {}, progressCallback = null, deps = {}) {
  // Create metadata tracking for this analysis run
  const metadata = createMetadata();

  // Store input options
  metadata.input.options = options;
  
  // Generate job ID for this analysis run
  const jobId = `analysis-${Date.now()}`;
  
  // Get progress service (new system)
  const progressService = deps.progressService || getUnifiedProgressService();

  // Helper to emit progress events - supports both old and new systems
  const emitProgress = (step, data = {}) => {
    // New system: Always use UnifiedProgressService
    progressService.reportProgress('analysis', step, {
      jobId,
      ...data,
      percentage: data.percentage !== undefined ? data.percentage : calculateProgressPercentage('analysis', step, data)
    });
    
    // Legacy system: Support existing progressCallback if provided
    if (progressCallback) {
      progressCallback(step, {
        ...data,
        percentage: data.percentage !== undefined ? data.percentage : calculateProgressPercentage('analysis', step, data)
      });
    }
  };

  try {
    // Step 1: Initialize directories
    trackPhase(metadata, 'initializeDirectories', 'start');
    emitProgress('initializeDirectories:start', {
      message: 'Setting up output directories',
      details: 'Preparing workspace for analysis results',
    });

    const sessionsDir = getSessionsDir();
    const reportsDir = getReportsDir();

    // Create directories
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(reportsDir, { recursive: true });

    trackPhase(metadata, 'initializeDirectories', 'complete', {
      directoriesCreated: [sessionsDir, reportsDir],
    });
    emitProgress('initializeDirectories:complete', {
      message: 'Output directories ready',
      details: `Initialized ${[sessionsDir, reportsDir].length} directories`,
    });

    // Step 2: Load sessions from markdown files
    trackPhase(metadata, 'loadSessions', 'start');
    const { filters } = options;
    
    let message = 'Loading sessions from markdown files';
    let details = 'Reading previously processed session data';
    
    if (filters?.project) {
      message = `Loading sessions from project: ${filters.project}`;
      details = 'Filtering by project name';
    }
    
    emitProgress('loadSessions:start', { message, details });

    const sessionData = await loadBasicSessionData(filters);
    const sessions = sessionData.sessions;

    if (sessions.length === 0) {
      const error = new Error('No sessions found. Run "npm run sessions:load" first.');
      trackError(metadata, error, { phase: 'loadSessions' });
      throw error;
    }

    const strugglingSessionsCount = sessions.filter(s => s.hasStruggle).length;
    trackPhase(metadata, 'loadSessions', 'complete', {
      sessionsLoaded: sessions.length,
      strugglingSessionsFound: strugglingSessionsCount,
    });
    metadata.input.sessionsLoaded = sessions.length;

    emitProgress('loadSessions:complete', {
      count: sessions.length,
      message: `Loaded ${sessions.length} sessions`,
      details: `${strugglingSessionsCount} struggling sessions found`,
    });

    // Step 3: Build Knowledge Graph (part of analyzeSessions)
    trackPhase(metadata, 'buildKnowledgeGraph', 'start');
    emitProgress('analyzeSessions:progress', {
      message: 'Building cross-session knowledge connections',
      details: 'Extracting concepts, errors, and solutions for future analysis',
      current: 0,
      total: sessions.length
    });

    try {
      const knowledgeGraph = new KnowledgeGraph(getKnowledgeGraphPath());
      let processedConnections = 0;

      for (const session of sessions) {
        const knowledge = extractSessionKnowledge(session);
        await knowledgeGraph.addSessionConnections(session.sessionId, knowledge);
        processedConnections++;
        
        // Emit progress every 10 sessions
        if (processedConnections % 10 === 0 || processedConnections === sessions.length) {
          emitProgress('analyzeSessions:progress', {
            message: 'Building knowledge connections',
            details: `Processed ${processedConnections}/${sessions.length} sessions`,
            current: processedConnections,
            total: sessions.length
          });
        }
      }

      trackPhase(metadata, 'buildKnowledgeGraph', 'complete', {
        sessionsProcessed: processedConnections,
        connectionsBuilt: true
      });
      
      emitProgress('analyzeSessions:complete', {
        message: 'Knowledge connections built',
        details: `Connected ${processedConnections} sessions for cross-session learning`
      });
    } catch (error) {
      console.warn('⚠️ Knowledge graph building failed:', error.message);
      trackError(metadata, error, { phase: 'buildKnowledgeGraph' });
      trackPhase(metadata, 'buildKnowledgeGraph', 'error');
      
      emitProgress('analyzeSessions:complete', {
        message: 'Knowledge graph building completed with errors',
        details: 'Cross-session connections may be limited'
      });
    }

    // Step 4: Generate recommendations
    trackPhase(metadata, 'generateRecommendations', 'start');
    emitProgress('generateRecommendations:start', {
      message: 'Generating recommendations',
      details: `Analyzing ${sessions.length} sessions for patterns`,
    });

    const struggleRecommendations = generateRecommendations(sessions);
    const recommendations = struggleRecommendations;

    // Save recommendations to dedicated markdown file
    if (recommendations.length > 0) {
      try {
        const recommendationsPath = getTimestampedReportPath('recommendations');
        await saveRecommendationsToMarkdown(recommendations, recommendationsPath);

        // Track the recommendations file in metadata
        try {
          const stats = await fs.stat(recommendationsPath);
          trackOutputFile(metadata, 'recommendations', recommendationsPath, stats.size);
        } catch (statError) {
          console.warn('Could not track recommendations file:', statError.message);
        }
      } catch (error) {
        console.warn('⚠️ Failed to save recommendations file:', error.message);
        trackError(metadata, error, {
          phase: 'generateRecommendations',
          context: 'saving recommendations file',
        });
      }
    }

    const highImpact = recommendations.filter(r => r.impact === 'high').length;
    const mediumImpact = recommendations.filter(r => r.impact === 'medium').length;

    trackPhase(metadata, 'generateRecommendations', 'complete', {
      recommendationsGenerated: recommendations.length,
      highImpactCount: highImpact,
      mediumImpactCount: mediumImpact,
    });

    emitProgress('generateRecommendations:complete', {
      count: recommendations.length,
      message: `Generated ${recommendations.length} recommendations`,
      details: `${highImpact} high-impact, ${mediumImpact} medium-impact insights`,
    });

    // Step 5: Enhanced analysis (if enabled)
    let enhancedAnalysis = null;
    let llmError = null;
    if (options.includeEnhanced !== false) {
      // Default to enabled
      trackPhase(metadata, 'enhancedAnalysis', 'start');
      emitProgress('enhancedAnalysis:start', {
        message: 'Performing enhanced AI analysis',
        details: 'Generating deep insights with AI assistance',
      });

      try {
        enhancedAnalysis = await generateEnhancedAnalysis(
          { sessions, recommendations },
          options.includeEnhanced,
          emitProgress, // Pass the progress callback to enable enhanced progress updates
          metadata // Pass metadata to track LLM calls
        );

        // Capture LLM errors for frontend display
        if (enhancedAnalysis?.error) {
          llmError = enhancedAnalysis.error;
          trackError(metadata, enhancedAnalysis.error, { phase: 'enhancedAnalysis' });
          trackPhase(metadata, 'enhancedAnalysis', 'complete', { success: false });
          emitProgress('enhancedAnalysis:complete', {
            message: 'Enhanced analysis completed with issues',
            details: 'Using fallback content due to AI service issue',
          });
        } else {
          // Save enhanced analysis to disk for persistence
          try {
            // Enhanced analysis is now already in markdown format
            const enhancedAnalysisPath = getTimestampedReportPath('enhanced-analysis');
            await writeFileContent(enhancedAnalysisPath, enhancedAnalysis);
            console.log(`✅ Enhanced analysis saved to: ${enhancedAnalysisPath}`);
            trackOutputFile(metadata, 'enhanced-analysis', enhancedAnalysisPath);
          } catch (saveError) {
            console.warn('⚠️ Failed to save enhanced analysis:', saveError.message);
          }

          trackPhase(metadata, 'enhancedAnalysis', 'complete', { success: true });
          emitProgress('enhancedAnalysis:complete', {
            message: 'Enhanced analysis complete',
            details: 'Generated AI-powered insights and patterns',
          });
        }
      } catch (error) {
        console.warn('⚠️ Enhanced analysis failed:', error.message);
        trackError(metadata, error, { phase: 'enhancedAnalysis' });
        trackPhase(metadata, 'enhancedAnalysis', 'error');
        llmError = {
          type: 'llm_error',
          message: `Enhanced AI analysis failed: ${error.message}`,
          details: error.message,
        };
        emitProgress('enhancedAnalysis:complete', {
          message: 'Enhanced analysis completed with fallback',
          details: 'Used synthetic content due to AI unavailability',
        });
      }
    }

    // Step 6: Generate reports (if enabled)
    if (options.generateReports !== false) {
      trackPhase(metadata, 'generateReports', 'start');
      emitProgress('generateReports:start', {
        message: 'Generating final reports',
        details: 'Creating markdown reports and summaries',
      });

      try {
        // Generate main markdown report
        emitProgress('generateReports:progress', {
          message: 'Creating main analysis report',
          details: 'Compiling session data and recommendations',
          progress: 0.75,
        });
        
        const _reportPath = await generateMarkdownReport(
          sessions,
          recommendations,
          enhancedAnalysis,
          metadata // Pass metadata to track output files
        );

        // Generate executive summary (if requested)
        if (options.includeExecutiveSummary) {
          emitProgress('generateReports:progress', {
            message: 'Generating executive summary',
            details: 'Creating high-level insights with AI',
            progress: 0.85,
          });
          
          const summaryError = await generateExecutiveSummary(
            sessions,
            recommendations,
            enhancedAnalysis,
            metadata // Pass metadata to track LLM calls
          );
          // Merge executive summary error with existing LLM errors
          // Prioritize credit/API errors over Claude Code errors since they're more actionable
          if (summaryError) {
            trackError(metadata, summaryError, {
              phase: 'generateReports',
              context: 'executive summary',
            });
            if (!llmError || summaryError.message?.includes('credit balance')) {
              llmError = summaryError;
            }
          }
        }

        // Final progress update
        emitProgress('generateReports:progress', {
          message: 'Finalizing reports and metadata',
          details: 'Saving output files and completing analysis',
          progress: 0.95,
        });

        trackPhase(metadata, 'generateReports', 'complete', { success: true });
        emitProgress('generateReports:complete', {
          message: 'Reports generated successfully',
          details: 'Analysis reports and summaries ready',
        });
      } catch (error) {
        console.warn('⚠️ Report generation failed:', error.message);
        trackError(metadata, error, { phase: 'generateReports' });
        trackPhase(metadata, 'generateReports', 'error');
        emitProgress('generateReports:complete', {
          message: 'Report generation completed with errors',
          details: error.message,
        });
      }
    }

    // Finalize and save metadata
    try {
      // Add summary information to metadata
      metadata.summary = {
        ...metadata.summary,
        sessionsAnalyzed: sessions.length,
        recommendationsGenerated: recommendations.length,
        strugglingSessionsFound: sessions.filter(s => s.hasStruggle).length,
      };

      const finalMetadata = finalizeMetadata(metadata);

      // Save metadata JSON file
      const metadataPath = getTimestampedReportPath('metadata').replace('.md', '.json');
      await writeFileContent(metadataPath, JSON.stringify(finalMetadata, null, 2));

      console.log(`📊 Analysis metadata saved to ${metadataPath}`);
    } catch (error) {
      console.warn('⚠️ Failed to save metadata:', error.message);
    }

    // Return results in same format as original pipeline
    return {
      sessions,
      recommendations,
      enhancedAnalysis,
      executiveSummary: null, // Will be loaded separately if needed
      llmError, // Include LLM error info for frontend
      metadata: finalizeMetadata(metadata), // Include metadata in response
    };
  } catch (error) {
    // Track the top-level error
    trackError(metadata, error, { phase: 'overall' });

    // Try to save metadata even if analysis failed
    try {
      const finalMetadata = finalizeMetadata(metadata);
      const metadataPath = getTimestampedReportPath('metadata').replace('.md', '.json');
      await writeFileContent(metadataPath, JSON.stringify(finalMetadata, null, 2));
    } catch (metaError) {
      console.warn('⚠️ Failed to save error metadata:', metaError.message);
    }

    emitProgress('error', {
      error: error.message,
      phase: 'analysis',
    });
    throw error;
  }
}

// Pure functional approach - no backward compatibility needed for personal project
