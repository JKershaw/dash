import {
  pathExists,
  listDirectory,
  readFileContent,
  writeFileContent,
} from '../infrastructure/file-utils.js';
import path from 'path';
import { analyzeSession } from '../infrastructure/persistence/session-parser.js';
import { parseLogFile } from '../infrastructure/persistence/log-parser.js';
import { normalizeSession } from '../infrastructure/persistence/data-normalizer.js';
import { getSessionsDir, getReportsDir } from '../config.js';

/**
 * Data service to extract analysis data for dynamic report generation
 */

/**
 * Get current analysis data from most recent files
 * @param {Object} options - Optional filtering options
 * @param {Object} options.temporal - Temporal filtering options { period: 'today'|'yesterday'|'week', offset: number }
 * @returns {Object} Complete analysis data
 */
export async function getAnalysisData(options = {}) {
  console.log('📊 Loading current analysis data...');
  const data = await buildCurrentAnalysisData();
  
  // Add temporal filtering if requested
  if (options.temporal) {
    data.filteredSessions = filterSessionsByTemporal(data.sessions, options.temporal);
    data.filteredStats = calculateStats(data.filteredSessions);
  }
  
  return data;
}

/**
 * Load basic session data efficiently for dashboard metrics
 * @returns {Object} Basic dashboard data with sessions and recommendations
 */
export async function loadBasicSessionData(filters = null) {
  const sessions = await loadSessionsFromFiles(filters);
  const stats = calculateStats(sessions);

  return {
    sessions: sessions,
    recommendations: [],
    stats: stats,
    generated: sessions.length > 0 ? new Date().toISOString() : null,
  };
}

/**
 * Build current analysis data from most recent results
 * @returns {Object} Analysis data structure
 */
async function buildCurrentAnalysisData() {
  const data = {
    sessions: [],
    stats: {},
    executiveSummary: null,
    narrativeSummary: null,
    analysisReport: null,
    recommendationsReport: null,
    recommendations: [],
    enhancedAnalysis: null,
    generated: new Date().toISOString(),
    chartData: null,
  };

  try {
    // Load basic session data for metrics
    data.sessions = await loadSessionsFromFiles();

    // Load key recommendations (simplified)
    data.recommendations = await loadKeyRecommendations();

    // Calculate current stats
    data.stats = calculateStats(data.sessions, data.recommendations);

    // Load pre-generated summaries from files (do NOT generate on-demand)
    console.log('📖 Loading pre-generated summaries from files...');
    data.executiveSummary = await loadExecutiveSummary();
    data.narrativeSummary = await loadNarrativeSummary();
    data.analysisReport = await loadAnalysisReport();
    data.recommendationsReport = await loadRecommendationsReport();
    data.enhancedAnalysis = await loadEnhancedAnalysisFromFile();

    // Prepare chart data
    data.chartData = prepareChartData(data.sessions);

    // Generate temporal summaries
    data.temporalSummary = await generateTemporalSummary(data.sessions);

    console.log(
      `✅ Current data loaded: ${data.sessions.length} sessions, ${data.recommendations.length} recommendations`
    );
  } catch (error) {
    console.error('❌ Error loading current analysis:', error);
    // Return partial data on error
  }

  return data;
}

/**
 * Load session data directly from session files (simple count)
 * @param {Object} filters - Optional filters to apply
 * @param {string} filters.project - Project name to filter by
 */
async function loadSessionsFromFiles(filters = null) {
  try {
    const sessionsDir = getSessionsDir();

    if (!(await pathExists(sessionsDir))) {
      return [];
    }

    const sessions = [];
    const projectDirs = await listDirectory(sessionsDir, 'directories');

    for (const projectDir of projectDirs) {
      const projectName = path.basename(projectDir);
      
      // Apply project filter if specified
      if (filters?.project && typeof filters.project === 'string' && filters.project.trim()) {
        const projectFilter = filters.project.toLowerCase().trim();
        if (!projectName.toLowerCase().includes(projectFilter)) {
          continue; // Skip this project directory
        }
      }

      // Filter out low-value summary-session projects
      if (projectName === 'summary-session') {
        continue;
      }

      const allFiles = await listDirectory(projectDir, 'files');
      const sessionFiles = allFiles.filter(
        file => file.endsWith('.md') && file.includes('session-') && !file.includes('.script.md')
      );

      for (const sessionFile of sessionFiles) {
        try {
          const content = await readFileContent(sessionFile, 'utf-8');
          const filename = path.basename(sessionFile, '.md');

          // Extract metadata from markdown content
          const durationMatch = content.match(/\*\*Duration:\*\* ([0-9hmins ]+)/);
          const toolMatch = content.match(/\*\*Tool Operations:\*\* (\d+)/);
          const entryMatch = content.match(/\*\*Total Entries:\*\* (\d+)/);

          // Parse duration from format like "10m 14s"
          let durationSeconds = 60; // default
          if (durationMatch) {
            const durationStr = durationMatch[1];
            const hours = (durationStr.match(/(\d+)h/) || [0, 0])[1];
            const minutes = (durationStr.match(/(\d+)m/) || [0, 0])[1];
            const seconds = (durationStr.match(/(\d+)s/) || [0, 0])[1];
            durationSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
          }

          // Parse conversation content for LLM analysis
          const conversation = parseConversationFromMarkdown(content);

          // Extract tool operations from markdown table (enhanced) with fallback to conversation parsing
          let toolOperations = extractToolOperationsFromMarkdownTable(content);

          // Fallback to conversation parsing if table parsing failed or returned no results
          if (toolOperations.length === 0) {
            toolOperations = extractToolOperationsFromConversation(conversation.messages);
          }
          const actualToolCount = toolOperations.length;

          sessions.push({
            sessionId: filename,
            projectName: projectName,
            durationSeconds: durationSeconds,
            entryCount: entryMatch ? parseInt(entryMatch[1]) : 5,
            toolCount:
              actualToolCount > 0 ? actualToolCount : toolMatch ? parseInt(toolMatch[1]) : 0,
            // Tool operations array for pattern detection
            toolOperations: toolOperations,
            // Enhanced conversation data for LLM analysis
            humanMessageCount: conversation.humanMessageCount,
            assistantMessageCount: conversation.assistantMessageCount,
            conversation: conversation.messages,
            conversationSummary: conversation.summary,
          });
        } catch (error) {
          // If we can't read the file, use defaults - but log for debugging
          console.warn(`⚠️ Failed to read session file ${sessionFile}:`, error.message);
          const filename = path.basename(sessionFile, '.md');
          sessions.push({
            sessionId: filename,
            projectName: path.basename(projectDir),
            durationSeconds: 60,
            entryCount: 5,
            toolCount: 0,
            // Empty tool operations for consistency
            toolOperations: [],
            // Default conversation data
            humanMessageCount: 2,
            assistantMessageCount: 3,
            conversation: [],
            conversationSummary: 'Failed to parse conversation content',
          });
        }
      }
    }

    // Apply struggle detection to loaded sessions
    try {
      const { detectSimpleLoops, detectLongSessions } = await import(
        '../domain/struggle-detector.js'
      );
      const { classifyStruggle } = await import('../domain/problem-classifier.js');

      sessions.forEach(session => {
        const hasToolStruggles = detectSimpleLoops(session).length > 0;
        const hasDurationStruggles = detectLongSessions(session).length > 0;
        const hasConversationStruggles = classifyStruggle(session).length > 0;

        session.hasStruggle = hasToolStruggles || hasDurationStruggles || hasConversationStruggles;

        // Store struggle indicators for debugging
        const indicators = [];
        if (hasToolStruggles) indicators.push('repetitive_tools');
        if (hasDurationStruggles) indicators.push('long_session');
        if (hasConversationStruggles) indicators.push('conversation_issues');
        session.struggleIndicators = indicators;
      });
    } catch (error) {
      console.warn('Failed to apply struggle detection to loaded sessions:', error.message);
      // Sessions keep hasStruggle: false (default)
      sessions.forEach(session => {
        session.hasStruggle = false;
        session.struggleIndicators = [];
      });
    }

    return sessions;
  } catch (error) {
    console.warn('⚠️ Failed to load sessions from files:', error.message);
    return [];
  }
}

/**
 * Load rich session data with all metadata for comprehensive LLM analysis
 * This function directly parses log files to preserve all context information
 * @returns {Array} Array of rich session objects with full metadata
 */
export async function loadRichSessionDataForAnalysis() {
  console.log('🔍 Loading rich session data for LLM analysis...');
  try {
    const { findLogFiles } = await import('../infrastructure/persistence/log-discovery.js');
    const logFiles = await findLogFiles();

    console.log(`📁 Found ${logFiles.length} log files to analyze`);

    const richSessions = [];
    let processedCount = 0;

    for (const logFile of logFiles) {
      try {
        // Use the same parsing pipeline as the main analysis
        const logEntries = await parseLogFile(logFile);

        if (logEntries.length > 0) {
          const session = analyzeSession(logFile, logEntries);

          if (session && !session.isSelfGenerated) {
            const normalizedSession = normalizeSession(session);

            // Extract additional metadata from log entries for LLM analysis
            const firstEntry = logEntries[0];
            const enhancedSession = {
              ...normalizedSession,
              // Core identifiers
              sessionId: normalizedSession.sessionId || firstEntry.sessionId,
              projectPath: normalizedSession.projectName,

              // Rich metadata from real logs
              cwd: firstEntry.cwd,
              version: firstEntry.version,
              gitBranch: firstEntry.gitBranch,
              userType: firstEntry.userType,

              // Analysis metadata
              toolCount: normalizedSession.toolOperations?.length || 0,
              entryCount: normalizedSession.entryCount,
              durationSeconds: normalizedSession.durationSeconds,
              activeDurationSeconds: normalizedSession.activeDurationSeconds,

              // Quality and provenance
              dataQualityIssues: normalizedSession.dataQualityIssues || [],
              hasRichMetadata: true,
              _metadata: normalizedSession._metadata,
              _provenance: normalizedSession._provenance,

              // Request tracking
              requestIds: logEntries.filter(e => e.requestId).map(e => e.requestId),

              // Conversation flow
              conversationFlow: logEntries
                .filter(e => e.parentUuid)
                .map(e => ({
                  uuid: e.uuid,
                  parentUuid: e.parentUuid,
                  type: e.type,
                })),
            };

            richSessions.push(enhancedSession);
          }
        }

        processedCount++;
        if (processedCount % 100 === 0) {
          console.log(`📊 Processed ${processedCount}/${logFiles.length} log files...`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to parse log file ${logFile}:`, error.message);
        // Continue with other files
      }
    }

    console.log(
      `✅ Loaded ${richSessions.length} rich sessions with full metadata for LLM analysis`
    );
    return richSessions;
  } catch (error) {
    console.error('❌ Error loading rich session data:', error);
    return [];
  }
}

/**
 * Extract project name from session path/ID
 */
export function extractProjectName(sessionId) {
  // Extract from session filename pattern like "-Users-work-development-PROJECT_sessionId"

  // Try to extract from session ID pattern
  const parts = sessionId.split('_');
  if (parts.length > 0) {
    const projectPart = parts[0];
    // Look for project name patterns like "-users-work-development-PROJECT"
    // Match the last segment after the development directory
    const projectMatch = projectPart.match(/-users-work-development-([^-]+(?:-[^-]+)*)$/i);
    if (projectMatch) {
      const projectName = projectMatch[1];
      // Return cleaned up version
      return projectName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // Fallback: try to get the last meaningful segment
    const segments = projectPart.split('-');
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.length > 2) {
        return lastSegment.replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  }

  return 'Unknown Project';
}

/**
 * Load executive summary
 */
async function loadExecutiveSummary() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent executive-summary-*.md file
    const summaryFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('executive-summary-') && filename.endsWith('.md');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (summaryFiles.length === 0) {
      console.warn('⚠️  No executive summary files found');
      return null;
    }

    // summaryFiles[0] is already the full path, no need to join with reportsDir
    return await readFileContent(summaryFiles[0], 'utf-8');
  } catch (error) {
    console.warn('⚠️  Could not load executive summary:', error.message);
    return null;
  }
}

/**
 * Load narrative summary
 */
async function loadNarrativeSummary() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent narrative-summary-*.md file
    const summaryFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('narrative-summary-') && filename.endsWith('.md');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (summaryFiles.length === 0) {
      console.warn('⚠️  No narrative summary files found');
      return null;
    }

    // summaryFiles[0] is already the full path, no need to join with reportsDir
    return await readFileContent(summaryFiles[0], 'utf-8');
  } catch (error) {
    console.warn('⚠️  Could not load narrative summary:', error.message);
    return null;
  }
}

/**
 * Load enhanced analysis from file
 */
async function loadEnhancedAnalysisFromFile() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent enhanced-analysis-*.md file
    const enhancedFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('enhanced-analysis-') && filename.endsWith('.md');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (enhancedFiles.length === 0) {
      console.log('ℹ️  No enhanced analysis files found');
      return null;
    }

    const latestFile = enhancedFiles[0];
    console.log(`✅ Loading enhanced analysis from: ${path.basename(latestFile)}`);

    const content = await readFileContent(latestFile, 'utf-8');
    return content; // Return markdown content directly
  } catch (error) {
    console.log('ℹ️  Could not load enhanced analysis:', error.message);
    return null;
  }
}

/**
 * Load latest analysis metadata from JSON files
 * @returns {Object|null} Latest analysis metadata or null if not found
 */
export async function loadLatestAnalysisMetadata() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent metadata-*.json file
    const metadataFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('metadata-') && filename.endsWith('.json');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (metadataFiles.length === 0) {
      console.warn('⚠️  No metadata files found');
      return null;
    }

    const latestFile = metadataFiles[0];
    console.log(`📖 Loading latest metadata from: ${path.basename(latestFile)}`);

    const metadataContent = await readFileContent(latestFile);
    return JSON.parse(metadataContent);
  } catch (error) {
    console.error('❌ Error loading latest metadata:', error);
    return null;
  }
}

/**
 * Load analysis metadata by run ID
 * @param {string} runId - The run ID to look up
 * @returns {Object|null} Analysis metadata for the specific run or null if not found
 */
export async function loadAnalysisMetadataByRunId(runId) {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find all metadata-*.json files
    const metadataFiles = files.filter(file => {
      const filename = path.basename(file);
      return filename.startsWith('metadata-') && filename.endsWith('.json');
    });

    // Search through metadata files to find the one with matching run ID
    for (const file of metadataFiles) {
      try {
        const content = await readFileContent(file);
        const metadata = JSON.parse(content);

        if (metadata.run?.id === runId) {
          console.log(`📖 Found metadata for run ID ${runId} in: ${path.basename(file)}`);
          return metadata;
        }
      } catch (error) {
        console.warn(`⚠️  Could not parse metadata file ${path.basename(file)}:`, error.message);
        // Continue searching
      }
    }

    console.warn(`⚠️  No metadata found for run ID: ${runId}`);
    return null;
  } catch (error) {
    console.error('❌ Error loading metadata by run ID:', error);
    return null;
  }
}

/**
 * Load timestamped file by run ID and file type
 * @param {string} runId - The run ID to look up
 * @param {string} fileType - The file type (e.g., 'executive-summary', 'narrative-summary')
 * @returns {string|null} File content or null if not found
 */
export async function loadTimestampedFileByRunId(runId, fileType) {
  try {
    // First, get the metadata to find the actual filename
    const metadata = await loadAnalysisMetadataByRunId(runId);
    if (!metadata) {
      return null;
    }

    // Look up the actual filename from metadata instead of guessing timestamps
    let filePath = null;

    // Check output.reports object first (more reliable)
    if (metadata.output && metadata.output.reports) {
      // Map API fileType to metadata keys
      const typeMapping = {
        'executive-summary': 'executive-summary',
        'narrative-summary': 'narrative-summary',
        analysis: 'analysis-report',
        recommendations: 'recommendations',
        'enhanced-analysis': 'enhanced-analysis',
      };

      const metadataKey = typeMapping[fileType];
      if (metadataKey && metadata.output.reports[metadataKey]) {
        filePath = metadata.output.reports[metadataKey];
      }
    }

    // Fallback: check output.files array
    if (!filePath && metadata.output && metadata.output.files) {
      const typeMapping = {
        'executive-summary': 'executive-summary',
        'narrative-summary': 'narrative-summary',
        analysis: 'analysis-report',
        recommendations: 'recommendations',
        'enhanced-analysis': 'enhanced-analysis',
      };

      const metadataType = typeMapping[fileType];
      const fileEntry = metadata.output.files.find(f => f.type === metadataType);
      if (fileEntry) {
        filePath = fileEntry.path;
      }
    }

    if (filePath) {
      console.log(`📖 Found ${fileType} for run ID ${runId}: ${path.basename(filePath)}`);
      return await readFileContent(filePath, 'utf-8');
    }

    console.warn(`⚠️  No ${fileType} file found in metadata for run ID: ${runId}`);
    return null;
  } catch (error) {
    console.error(`❌ Error loading ${fileType} by run ID:`, error);
    return null;
  }
}

/**
 * Load analysis history from all metadata files
 * @returns {Array} Array of analysis run summaries, sorted by date descending
 */
export async function loadAnalysisHistory() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find all metadata-*.json files
    const metadataFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('metadata-') && filename.endsWith('.json');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first), no limit

    const history = [];
    for (const file of metadataFiles) {
      try {
        const content = await readFileContent(file);
        const metadata = JSON.parse(content);

        // Extract comprehensive information for display
        history.push({
          id: metadata.run?.id || 'unknown',
          startTime: metadata.run?.startTime,
          duration: metadata.run?.duration || 0,
          sessionsAnalyzed: metadata.input?.sessionsLoaded || 0,
          status: metadata.summary?.success ? 'success' : 'failed',
          // Additional helpful metadata
          strugglingSessionsFound:
            metadata.processing?.phases?.find(p => p.name === 'analyzeSessions')
              ?.strugglingSessionsFound || 0,
          recommendationsGenerated:
            metadata.processing?.phases?.find(p => p.name === 'generateRecommendations')
              ?.recommendationsGenerated || 0,
          llmCallsTotal: metadata.summary?.llmUsage?.totalCalls || 0,
          errorsTotal: metadata.summary?.totalErrors || 0,
          version: metadata.run?.version || 'unknown',
          // Project filter information
          projectFilter: metadata.input?.options?.filters?.project || null,
        });
      } catch (error) {
        console.warn(`⚠️  Could not parse metadata file ${path.basename(file)}:`, error.message);
        // Skip invalid files
      }
    }

    console.log(`📊 Loaded ${history.length} analysis runs for history`);
    return history;
  } catch (error) {
    console.error('❌ Error loading analysis history:', error);
    return [];
  }
}

/**
 * Load analysis report
 */
async function loadAnalysisReport() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent analysis-*.md file
    const reportFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('analysis-') && filename.endsWith('.md');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (reportFiles.length === 0) {
      console.warn('⚠️  No analysis report files found');
      return null;
    }

    // reportFiles[0] is already the full path, no need to join with reportsDir
    return await readFileContent(reportFiles[0], 'utf-8');
  } catch (error) {
    console.warn('⚠️  Could not load analysis report:', error.message);
    return null;
  }
}

/**
 * Load recommendations report
 */
async function loadRecommendationsReport() {
  try {
    const reportsDir = getReportsDir();
    const files = await listDirectory(reportsDir, 'files');

    // Find most recent recommendations-*.md file
    const reportFiles = files
      .filter(file => {
        const filename = path.basename(file);
        return filename.startsWith('recommendations-') && filename.endsWith('.md');
      })
      .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

    if (reportFiles.length === 0) {
      console.warn('⚠️  No recommendations report files found');
      return null;
    }

    // reportFiles[0] is already the full path, no need to join with reportsDir
    return await readFileContent(reportFiles[0], 'utf-8');
  } catch (error) {
    console.warn('⚠️  Could not load recommendations report:', error.message);
    return null;
  }
}

/**
 * Save recommendations to structured markdown file
 * @param {Array} recommendations - Array of recommendation objects
 * @param {string} filePath - Path to save the markdown file
 */
export async function saveRecommendationsToMarkdown(recommendations, filePath) {
  try {
    const timestamp = new Date().toISOString();
    const count = recommendations.length;

    // TODO: Replace hardcoded impact level thresholds with calculated percentiles
    // Current assumption: Critical=80+, High=60-79, Medium=40-59, Low=0-39
    // Future: Calculate thresholds from distribution of recommendation scores:
    //   - Use percentiles (e.g., top 10% = Critical, next 20% = High)
    //   - Adjust based on user's historical engagement with different priority levels
    //   - Consider team/organization-specific priority calibration

    // Helper function for consistent impact level grouping
    const groupByImpactLevel = recs => ({
      critical: recs.filter(r => r.impactScore >= 80),
      high: recs.filter(r => r.impactScore >= 60 && r.impactScore < 80),
      medium: recs.filter(r => r.impactScore >= 40 && r.impactScore < 60),
      low: recs.filter(r => r.impactScore < 40),
    });

    // Group recommendations by impact level for better organization
    const groups = groupByImpactLevel(recommendations);
    const { critical: criticalRecs, high: highRecs, medium: mediumRecs, low: lowRecs } = groups;

    // Build markdown content
    let markdown = `# Recommendations (Prioritized by Impact)

*Generated on: ${timestamp}*
*Total Recommendations: ${count}*

`;

    // Add impact-grouped recommendations
    if (criticalRecs.length > 0) {
      markdown += `## 🔥 Critical Impact (80+ Score)
*These recommendations have the highest potential for improvement*

`;
      for (const rec of criticalRecs) {
        markdown += `**${rec.priority}. ${rec.type}** • Score: ${rec.impactScore} • ${rec.estimatedTimeSaved} saved
**Description**: ${rec.description}
${rec.implementation ? `**How to Fix**: ${rec.implementation}` : ''}

`;
      }
      markdown += '\n';
    }

    if (highRecs.length > 0) {
      markdown += `## ⚡ High Impact (60-79 Score)
*Important improvements with good ROI*

`;
      for (const rec of highRecs) {
        markdown += `**${rec.priority}. ${rec.type}** • Score: ${rec.impactScore} • ${rec.estimatedTimeSaved} saved
**Description**: ${rec.description}
${rec.implementation ? `**How to Fix**: ${rec.implementation}` : ''}

`;
      }
      markdown += '\n';
    }

    if (mediumRecs.length > 0) {
      markdown += `## 📊 Medium Impact (40-59 Score)
*Moderate improvements worth considering*

`;
      for (const rec of mediumRecs) {
        markdown += `**${rec.priority}. ${rec.type}** • Score: ${rec.impactScore} • ${rec.estimatedTimeSaved} saved
**Description**: ${rec.description}
${rec.implementation ? `**How to Fix**: ${rec.implementation}` : ''}

`;
      }
      markdown += '\n';
    }

    if (lowRecs.length > 0) {
      markdown += `## 📝 Lower Priority (0-39 Score)
*Minor issues or edge cases*

`;
      for (const rec of lowRecs) {
        markdown += `**${rec.priority}. ${rec.type}** • Score: ${rec.impactScore} • ${rec.estimatedTimeSaved} saved
**Description**: ${rec.description}
${rec.implementation ? `**How to Fix**: ${rec.implementation}` : ''}

`;
      }
    }

    await writeFileContent(filePath, markdown);
    console.log(`📝 Saved ${count} recommendations to ${filePath}`);
  } catch (error) {
    console.error('❌ Error saving recommendations to markdown:', error.message);
    throw error;
  }
}

/**
 * Load recommendations from structured markdown file
 * @param {string} filePath - Path to the markdown file
 * @returns {Array} Array of recommendation objects
 */
export async function loadRecommendationsFromMarkdown(filePath) {
  try {
    if (!(await fileExists(filePath))) {
      return [];
    }

    const content = await readFileContent(filePath, 'utf-8');
    const recommendations = [];

    // Parse markdown content for recommendations (new priority format only)
    const lines = content.split('\n');
    let currentType = null;
    let currentDescription = null;
    let currentImpact = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip headers, metadata, and empty lines
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('*Generated') || trimmed.startsWith('*Total')) continue;
      if (trimmed.length === 0) continue;

      // Extract recommendation type from priority format: **1. Type Name** • Score: 45 • 15min/week saved
      if (trimmed.match(/^\*\*\d+\.\s+(.+?)\*\*\s+•/)) {
        // Save previous recommendation if exists
        if (currentType && currentDescription) {
          recommendations.push({
            type: currentType,
            description: currentDescription,
            impact: currentImpact || 0,
          });
        }

        // Extract type name and score from: **1. Integration Test** • Score: 45 • 15min/week saved
        const match = trimmed.match(/^\*\*\d+\.\s+(.+?)\*\*\s+•\s*Score:\s*(\d+)/);
        if (match) {
          currentType = match[1].trim();
          currentImpact = parseInt(match[2], 10);
        } else {
          // Fallback for lines without score
          const simpleMatch = trimmed.match(/^\*\*\d+\.\s+(.+?)\*\*\s+•/);
          currentType = simpleMatch ? simpleMatch[1].trim() : null;
          currentImpact = 0;
        }
        currentDescription = null;
      }
      // Extract description
      else if (trimmed.startsWith('**Description**: ')) {
        currentDescription = trimmed.substring(17).trim();
      }
      // Handle multi-line descriptions
      else if (currentType && trimmed.length > 0 && !trimmed.startsWith('**')) {
        if (currentDescription) {
          currentDescription += ' ' + trimmed;
        }
      }
    }

    // Don't forget the last recommendation
    if (currentType && currentDescription) {
      recommendations.push({
        type: currentType,
        description: currentDescription,
        impact: currentImpact || 0,
      });
    }

    console.log(`📖 Loaded ${recommendations.length} recommendations from ${filePath}`);
    return recommendations;
  } catch (error) {
    console.warn('⚠️ Could not load recommendations from markdown:', error.message);
    return [];
  }
}

/**
 * Find the most recent timestamped recommendations file
 * @param {string} reportsDir - Reports directory path
 * @returns {Promise<string|null>} Path to most recent file or null
 */
async function findMostRecentRecommendationsFile(reportsDir) {
  try {
    const files = await listDirectory(reportsDir, 'files');
    const recommendationFiles = files
      .map(filePath => path.basename(filePath)) // Extract just the filename
      .filter(filename => filename.startsWith('recommendations-') && filename.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a)); // Sort descending to get most recent first

    return recommendationFiles.length > 0 ? path.join(reportsDir, recommendationFiles[0]) : null;
  } catch (error) {
    console.warn('⚠️ Failed to find timestamped recommendations files:', error.message);
    return null;
  }
}

/**
 * Load key recommendations from executive summary or dedicated recommendations file
 */
async function loadKeyRecommendations() {
  // First try to find the most recent timestamped recommendations file
  const reportsDir = getReportsDir();
  const timestampedFile = await findMostRecentRecommendationsFile(reportsDir);

  if (timestampedFile) {
    console.log(`📖 Loading recommendations from timestamped file: ${timestampedFile}`);
    return await loadRecommendationsFromMarkdown(timestampedFile);
  }

  // No static file fallbacks - only use timestamped files
  console.warn('⚠️  No timestamped recommendations files found');

  // Try extracting from executive summary as final fallback
  try {
    console.log('📖 Falling back to recommendations from executive summary...');
    const summaryData = await loadExecutiveSummary();
    if (!summaryData) {
      console.warn('⚠️  No executive summary available either');
      return [];
    }
    const content = summaryData;

    const recommendations = [];

    // Extract from Critical Issues section
    const criticalMatch = content.match(
      /## 🔴 Critical Issues Requiring Immediate Action([\s\S]*?)(?=\n## |$)/
    );
    if (criticalMatch) {
      const criticalSection = criticalMatch[1];
      const issueMatches = criticalSection.matchAll(
        /### (.+?)\n\n([\s\S]*?)(?=\n### |\n---|\n## |$)/g
      );

      for (const match of issueMatches) {
        if (match[1] && match[2]) {
          const description =
            match[2].trim().split('\n').slice(0, 3).join(' ').substring(0, 150) + '...';
          recommendations.push({
            type: match[1].trim(),
            description: description,
            priority: 'high',
          });
        }
      }
    }

    // Extract from Quick Wins section
    const quickWinsMatch = content.match(/## ⚡ Quick Wins.*?\n([\s\S]*?)(?=\n## |$)/);
    if (quickWinsMatch) {
      const quickWinsSection = quickWinsMatch[1];
      const winMatches = quickWinsSection.matchAll(/### (.+?)\n\n([\s\S]*?)(?=\n### |\n## |$)/g);

      for (const match of winMatches) {
        if (match[1] && match[2]) {
          const description =
            match[2].trim().split('\n').slice(0, 2).join(' ').substring(0, 120) + '...';
          recommendations.push({
            type: match[1].trim(),
            description: description,
            priority: 'medium',
          });
        }
      }
    }

    return recommendations.slice(0, 8);
  } catch (error) {
    console.warn('⚠️  Could not load key recommendations:', error.message);
    return [];
  }
}

/**
 * Calculate statistics from sessions
 */
function calculateStats(sessions, recommendations = []) {
  // Defensive coding: ensure sessions is always an array
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const totalSessions = safeSessions.length;
  const totalDuration = safeSessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const averageDuration = totalDuration / totalSessions || 0;

  // Struggle detection
  const strugglingSessions = safeSessions.filter(
    s => (s.toolCount && s.toolCount > 20) || s.durationSeconds > 1800
  ).length;

  // Count unique projects
  const projectSet = new Set(safeSessions.map(s => s.projectName));
  const totalProjects = projectSet.size;

  // Calculate total messages across all sessions
  const totalMessages = safeSessions.reduce((sum, s) => {
    const humanMessages = s.humanMessageCount || 0;
    const assistantMessages = s.assistantMessageCount || 0;
    return sum + humanMessages + assistantMessages;
  }, 0);

  // Defensive coding: ensure recommendations is always an array
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];

  return {
    totalSessions,
    totalProjects,
    totalDuration: Math.round(totalDuration),
    averageDuration: Math.round(averageDuration),
    strugglingPercentage: Math.round((strugglingSessions / totalSessions) * 100),
    totalMessages,
    totalRecommendations: safeRecommendations.length,
  };
}

/**
 * Generate consistent colors for projects using hash-based color assignment
 */
function getProjectColor(projectName) {
  // Hash the project name to generate a consistent color
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    const char = projectName.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Define a palette of pleasing colors
  const colorPalette = [
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#ec4899', // Pink
    '#6366f1', // Indigo
    '#14b8a6', // Teal
    '#f97316', // Orange
    '#8b5a2b', // Brown
    '#64748b', // Slate
    '#dc2626', // Red variant
    '#059669', // Emerald variant
    '#7c3aed', // Violet variant
  ];

  // Use hash to select color consistently
  const colorIndex = Math.abs(hash) % colorPalette.length;
  return colorPalette[colorIndex];
}

/**
 * Prepare chart data (same as HTML generator)
 */
function prepareChartData(sessions) {
  // Extract startTime from sessionId pattern and filter valid sessions
  const sessionsWithTime = sessions
    .filter(session => session.durationSeconds > 0)
    .map(session => {
      // Extract time from sessionId pattern like "session-20250805-131352"
      if (!session.startTime && session.sessionId) {
        const timeMatch = session.sessionId.match(/session-(\d{8})-(\d{6})/);
        if (timeMatch) {
          const [, dateStr, timeStr] = timeMatch;
          // Parse YYYYMMDD and HHMMSS
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          const hour = timeStr.substring(0, 2);
          const minute = timeStr.substring(2, 4);
          const second = timeStr.substring(4, 6);
          session.startTime = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
        }
      }
      return session;
    })
    .filter(session => session.startTime)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const sortedSessions = sessionsWithTime;

  const durationData = [];
  const messageData = [];
  const sessionLabels = [];
  const timelineData = [];
  const messageTimelineData = [];
  const sessionInfo = [];
  const durationColors = [];
  const messageColors = [];

  sortedSessions.forEach((session, index) => {
    // Use active duration if available and reliable, otherwise fall back to raw duration
    const useActiveDuration =
      session.activeDurationSeconds &&
      session.durationAnalysis &&
      session.durationAnalysis.confidence !== 'low' &&
      session.durationAnalysis.excludedGaps.length > 0;

    const effectiveDurationSeconds = useActiveDuration
      ? session.activeDurationSeconds
      : session.durationSeconds;
    const durationMinutes = Math.round(effectiveDurationSeconds / 60);
    const rawDurationMinutes = Math.round(session.durationSeconds / 60);
    const messageCount = session.conversation ? session.conversation.length : 0;

    // Color by project instead of length
    const projectColor = getProjectColor(session.projectName);
    const durationColor = projectColor;
    const messageColor = projectColor;

    // Create session labels and timeline data points
    sessionLabels.push(`#${index + 1}`);
    const sessionStartDate = new Date(session.startTime);

    // For sessions mode: simple arrays
    durationData.push(durationMinutes);
    messageData.push(messageCount);
    durationColors.push(durationColor + '80');
    messageColors.push(messageColor + '80');

    // For timeline mode: {x: date, y: value} format
    timelineData.push({
      x: sessionStartDate,
      y: durationMinutes,
    });
    messageTimelineData.push({
      x: sessionStartDate,
      y: messageCount,
    });

    sessionInfo.push({
      sessionId: session.sessionId.substring(0, 8),
      fullSessionId: session.sessionId,
      duration: durationMinutes,
      rawDuration: rawDurationMinutes,
      messageCount: messageCount,
      toolCount: session.toolCount || 0,
      projectName: session.projectName,
      usingActiveDuration: useActiveDuration,
      durationAnalysis: session.durationAnalysis
        ? {
            confidence: session.durationAnalysis.confidence,
            excludedBreaks: session.durationAnalysis.excludedGaps.length,
            analysis: session.durationAnalysis.metadata.analysis,
          }
        : null,
    });
  });

  return {
    data: {
      labels: sessionLabels, // Start with session count labels
      sessionLabels,
      datasets: [
        {
          label: 'Messages',
          data: messageData,
          sessionData: messageData, // For sessions mode
          timelineData: messageTimelineData, // For timeline mode
          backgroundColor: messageColors,
          sessionInfo,
        },
        {
          label: 'Duration (minutes)',
          data: durationData,
          sessionData: durationData, // For sessions mode
          timelineData: timelineData, // For timeline mode
          backgroundColor: durationColors,
          sessionInfo,
          hidden: true,
        },
      ],
    },
  };
}

/**
 * Helper functions
 */
async function fileExists(filePath) {
  return await pathExists(filePath);
}

/**
 * Parse conversation content from markdown session files
 * @param {string} markdownContent - Full markdown content
 * @returns {Object} Parsed conversation with message counts and content
 */
function parseConversationFromMarkdown(markdownContent) {
  const lines = markdownContent.split('\n');
  let humanMessageCount = 0;
  let assistantMessageCount = 0;
  const messages = [];
  let currentMessage = null;
  let conversationStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start parsing after conversation section begins
    if (line.includes('## Conversation')) {
      conversationStarted = true;
      continue;
    }

    if (!conversationStarted) continue;

    // Match message headers: ### 1. User (2:13:52 PM) or ### 2. Assistant (2:13:55 PM)
    const messageMatch = line.match(/^### (\d+)\. (User|Assistant) \(([^)]+)\)/);
    if (messageMatch) {
      // Save previous message if exists
      if (currentMessage) {
        messages.push(currentMessage);
      }

      const messageNumber = parseInt(messageMatch[1]);
      const messageType = messageMatch[2].toLowerCase();
      const timestamp = messageMatch[3];

      // Count messages
      if (messageType === 'user') {
        humanMessageCount++;
      } else if (messageType === 'assistant') {
        assistantMessageCount++;
      }

      // Start new message
      currentMessage = {
        number: messageNumber,
        type: messageType,
        timestamp: timestamp,
        content: [],
      };
      continue;
    }

    // Collect content lines for current message
    if (currentMessage && line.trim().length > 0 && !line.startsWith('#')) {
      currentMessage.content.push(line);
    }
  }

  // Add final message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  // Create conversation summary for LLM analysis
  const totalMessages = humanMessageCount + assistantMessageCount;
  const avgMessageLength =
    messages.length > 0
      ? Math.round(
          messages.reduce((sum, msg) => sum + msg.content.join('\n').length, 0) / messages.length
        )
      : 0;

  const summary = `${totalMessages} messages (${humanMessageCount} human, ${assistantMessageCount} assistant), avg length: ${avgMessageLength} chars`;

  return {
    humanMessageCount,
    assistantMessageCount,
    messages: messages.map(msg => ({
      ...msg,
      content: msg.content.join('\n').trim(),
    })),
    summary,
    totalMessages,
  };
}

/**
 * Extract basic tool operations from conversation messages
 * @param {Array} messages - Conversation messages
 * @returns {Array} Tool operations array
 */
function extractToolOperationsFromConversation(messages) {
  const toolOperations = [];
  let operationIndex = 0;

  messages.forEach((message, messageIndex) => {
    if (message.type === 'assistant' && message.content) {
      // Look for tool use patterns in assistant messages
      const toolUsePattern = /🔧 \*\*Tool Use: ([^*]+)\*\*/g;
      let match;

      while ((match = toolUsePattern.exec(message.content)) !== null) {
        const toolName = match[1].trim();

        // Create a basic tool operation object
        toolOperations.push({
          name: toolName,
          operationIndex: operationIndex++,
          messageIndex: messageIndex,
          timestamp: message.timestamp || null,
          status: 'success', // Default to success since we can't determine failures from markdown
          input: null, // Input details not available in markdown format
          output: null, // Output details not available in markdown format
          duration: null, // Duration not available in markdown format
        });
      }
    }
  });

  return toolOperations;
}

/**
 * Extract tool operations from markdown table format (enhanced version)
 * Parses the "## Tool Operations Summary" table to preserve actual input/output data
 * @param {string} markdownContent - Full markdown content of session file
 * @returns {Array} Tool operations array with real input/output data
 */
function extractToolOperationsFromMarkdownTable(markdownContent) {
  const toolOperations = [];
  let operationIndex = 0;

  try {
    // Find the Tool Operations Summary section start
    const sectionStart = markdownContent.indexOf('## Tool Operations Summary');
    if (sectionStart === -1) {
      console.log(
        '📝 No Tool Operations Summary table found, falling back to conversation parsing'
      );
      return []; // Fallback to old method will happen in calling code
    }

    // Extract all lines from the table section until next section or end of file
    const fromSection = markdownContent.substring(sectionStart);
    const lines = fromSection.split('\n');
    
    // Find table header (first | line after the section header)
    let tableStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('| Tool Name |')) {
        tableStartIndex = i;
        break;
      }
    }
    
    if (tableStartIndex === -1) {
      console.log('📝 No table header found in Tool Operations Summary');
      return [];
    }
    
    // Extract all table rows (skip header and separator)
    const tableLines = [];
    for (let i = tableStartIndex + 2; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Stop if we hit another section header or end of content
      if (line.startsWith('##') || line.startsWith('---') && lines[i+1]?.trim().startsWith('##')) {
        break;
      }
      
      // Include lines that look like table rows
      if (line.includes('|') && line.split('|').length >= 4) {
        tableLines.push(line);
      }
    }

    for (const line of tableLines) {
      const cells = line
        .split('|')
        .map(cell => cell.trim())
        .filter(cell => cell);

      if (cells.length >= 4) {
        const [toolName, status, inputStr, outputStr] = cells;

        // Skip empty rows or header-like rows
        if (toolName === 'Tool Name' || !toolName) continue;

        // Parse input JSON if available
        let parsedInput = null;
        if (inputStr && inputStr !== '---' && inputStr.length > 0) {
          try {
            // Handle truncated JSON (common in tables)
            let jsonStr = inputStr;
            if (jsonStr.endsWith('...')) {
              jsonStr = jsonStr.slice(0, -3) + '"}'; // Simple truncation handling
            }
            parsedInput = JSON.parse(jsonStr);
          } catch (_parseError) {
            // If JSON parsing fails, keep as string
            parsedInput = { raw: inputStr };
          }
        }

        // Parse output (usually text, not JSON)
        let parsedOutput = null;
        if (outputStr && outputStr !== '---' && outputStr.length > 0) {
          parsedOutput = outputStr;
        }

        toolOperations.push({
          name: toolName,
          operationIndex: operationIndex++,
          status: status === 'success' ? 'success' : 'error',
          input: parsedInput,
          output: parsedOutput,
          // Default values for compatibility
          messageIndex: null,
          timestamp: null,
          duration: null,
        });
      }
    }

    //console.log(`📊 Extracted ${toolOperations.length} tool operations from markdown table`);
    return toolOperations;
  } catch (error) {
    console.warn('⚠️ Failed to parse tool operations table:', error.message);
    return []; // Fallback to old method will happen in calling code
  }
}

/**
 * Generate temporal summaries for different time periods
 * @param {Array} sessions - Array of session objects
 * @returns {Object} Temporal summary with today, yesterday, thisWeek, lastWeek, and trends
 */
export async function generateTemporalSummary(sessions) {
  const now = new Date();
  
  // Get sessions for different periods
  const todaySessions = filterSessionsByTemporal(sessions, { period: 'today' });
  const yesterdaySessions = filterSessionsByTemporal(sessions, { period: 'yesterday' });
  const thisWeekSessions = filterSessionsByTemporal(sessions, { period: 'week', offset: 0 });
  const lastWeekSessions = filterSessionsByTemporal(sessions, { period: 'week', offset: -1 });

  // Calculate summaries for each period
  const today = calculatePeriodSummary(todaySessions);
  const yesterday = calculatePeriodSummary(yesterdaySessions);
  const thisWeek = calculatePeriodSummary(thisWeekSessions);
  const lastWeek = calculatePeriodSummary(lastWeekSessions);

  // Calculate trends (negative = improvement)
  const trends = {
    errorTrend: calculateTrendPercentage(yesterday.errorCount, today.errorCount),
    sessionDurationTrend: calculateTrendPercentage(yesterday.avgDuration, today.avgDuration),
    weeklyErrorTrend: calculateTrendPercentage(lastWeek.errorCount, thisWeek.errorCount),
  };

  // Pattern evolution analysis
  const patternEvolution = await analyzePatternEvolution(thisWeekSessions, lastWeekSessions);

  return {
    today,
    yesterday,
    thisWeek,
    lastWeek,
    trends,
    patternEvolution,
    generated: now.toISOString(),
  };
}

/**
 * Filter sessions by temporal criteria
 * @param {Array} sessions - Array of session objects
 * @param {Object} temporal - Temporal filter { period: 'today'|'yesterday'|'week', offset: number }
 * @returns {Array} Filtered sessions
 */
export function filterSessionsByTemporal(sessions, temporal) {
  if (!temporal || !sessions || sessions.length === 0) {
    return sessions || [];
  }

  const { period, offset = 0 } = temporal;
  const now = new Date();
  
  return sessions.filter(session => {
    const sessionDate = extractSessionDate(session);
    if (!sessionDate) return false;

    switch (period) {
      case 'today':
        return isSameDay(sessionDate, now);
      
      case 'yesterday':
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return isSameDay(sessionDate, yesterday);
      
      case 'week':
        const targetWeekStart = getWeekStart(now);
        targetWeekStart.setDate(targetWeekStart.getDate() + (offset * 7));
        const targetWeekEnd = new Date(targetWeekStart);
        targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
        return sessionDate >= targetWeekStart && sessionDate <= targetWeekEnd;
      
      default:
        return true;
    }
  });
}

/**
 * Calculate summary statistics for a period's sessions
 * @param {Array} sessions - Sessions for the period
 * @returns {Object} Period summary
 */
function calculatePeriodSummary(sessions) {
  const sessionCount = sessions.length;
  const errorCount = sessions.reduce((total, session) => {
    if (!session.toolOperations) return total;
    return total + session.toolOperations.filter(op => op.status === 'error').length;
  }, 0);
  
  const totalDuration = sessions.reduce((total, session) => total + (session.durationSeconds || 0), 0);
  const avgDuration = sessionCount > 0 ? totalDuration / sessionCount : 0;

  const topIssues = getTopIssues(sessions);

  return {
    sessionCount,
    errorCount,
    totalDuration,
    avgDuration,
    topIssues,
  };
}

/**
 * Calculate trend percentage (negative = improvement)
 * @param {number} previous - Previous period value
 * @param {number} current - Current period value
 * @returns {number} Percentage change (negative = improvement)
 */
function calculateTrendPercentage(previous, current) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Extract session date from session object
 * @param {Object} session - Session object
 * @returns {Date|null} Session date
 */
function extractSessionDate(session) {
  // Try startTime first
  if (session.startTime) {
    return new Date(session.startTime);
  }
  
  // Try extracting from sessionId if it contains date
  if (session.sessionId && session.sessionId.includes('-')) {
    const dateMatch = session.sessionId.match(/(\d{4})(\d{2})(\d{2})/);
    if (dateMatch) {
      return new Date(dateMatch[1], dateMatch[2] - 1, dateMatch[3]);
    }
  }
  
  return null;
}

/**
 * Analyze pattern evolution between two time periods
 * @param {Array} thisWeekSessions - Current week sessions
 * @param {Array} lastWeekSessions - Previous week sessions
 * @returns {Object} Pattern evolution analysis
 */
async function analyzePatternEvolution(thisWeekSessions, lastWeekSessions) {
  // Import pattern detectors dynamically
  const [productiveModule, longSessionsModule, bashErrorsModule] = await Promise.all([
    import('../domain/detectors/productive-session-detector.js'),
    import('../domain/detectors/long-sessions-detector.js'), 
    import('../domain/detectors/bash-error-classifier.js'),
  ]);

  const detectorModules = {
    productive: productiveModule,
    longSessions: longSessionsModule,
    bashErrors: bashErrorsModule,
  };

  // Analyze patterns in both periods
  const thisWeekPatterns = analyzeSessionPatterns(thisWeekSessions, detectorModules);
  const lastWeekPatterns = analyzeSessionPatterns(lastWeekSessions, detectorModules);

  // Compare pattern frequencies and identify trends
  const changes = comparePatternFrequencies(thisWeekPatterns, lastWeekPatterns);

  // Analyze learning vs stagnation indicators
  const learningIndicators = analyzeLearningIndicators(thisWeekSessions, lastWeekSessions);

  return {
    thisWeek: thisWeekPatterns,
    lastWeek: lastWeekPatterns,
    changes,
    learningIndicators: learningIndicators.hasLearning,
    complexityProgression: learningIndicators.complexityProgression,
  };
}

/**
 * Analyze patterns in a set of sessions using available detectors
 * @param {Array} sessions - Sessions to analyze
 * @param {Object} detectorModules - Available detector modules
 * @returns {Object} Pattern analysis results
 */
function analyzeSessionPatterns(sessions, detectorModules) {
  let productiveSessionCount = 0;
  let problematicLongSessionCount = 0;
  let environmentErrorCount = 0;
  let workflowErrorCount = 0;

  sessions.forEach(session => {
    try {
      // Analyze with productive session detector
      if (detectorModules.productive?.detectProductiveSessions) {
        const productiveResults = detectorModules.productive.detectProductiveSessions(session);
        if (productiveResults.length > 0) {
          productiveSessionCount++;
        }
      }

      // Analyze with long session detector
      if (detectorModules.longSessions?.detectLongSessions) {
        const longSessionResults = detectorModules.longSessions.detectLongSessions(session);
        if (longSessionResults.length > 0) {
          problematicLongSessionCount++;
        }
      }

      // Analyze with bash error classifier
      if (detectorModules.bashErrors?.detectBashErrorPatterns) {
        const errorResults = detectorModules.bashErrors.detectBashErrorPatterns(session);
        errorResults.forEach(result => {
          if (result.type === 'environment_setup_issues') {
            environmentErrorCount++;
          } else if (result.type === 'development_workflow_errors') {
            workflowErrorCount++;
          }
        });
      }
    } catch (error) {
      // Skip sessions that cause detector errors
      console.warn(`Pattern detection error for session ${session.sessionId}:`, error.message);
    }
  });

  return {
    productiveSessionCount,
    problematicLongSessionCount,
    environmentErrorCount,
    workflowErrorCount,
    totalSessions: sessions.length,
  };
}

/**
 * Compare pattern frequencies between two periods
 * @param {Object} current - Current period patterns
 * @param {Object} previous - Previous period patterns
 * @returns {Array} Array of pattern changes
 */
function comparePatternFrequencies(current, previous) {
  const changes = [];

  // Compare productive sessions
  const productiveChange = calculatePatternTrend(
    current.productiveSessionCount, 
    previous.productiveSessionCount
  );
  if (productiveChange) {
    changes.push({
      pattern: 'productive_sessions',
      current: current.productiveSessionCount,
      previous: previous.productiveSessionCount,
      trend: productiveChange,
    });
  }

  // Compare problematic long sessions
  const problematicChange = calculatePatternTrend(
    current.problematicLongSessionCount,
    previous.problematicLongSessionCount
  );
  if (problematicChange) {
    changes.push({
      pattern: 'problematic_long_sessions',
      current: current.problematicLongSessionCount,
      previous: previous.problematicLongSessionCount,
      trend: problematicChange,
    });
  }

  // Compare environment errors
  const envErrorChange = calculatePatternTrend(
    current.environmentErrorCount,
    previous.environmentErrorCount
  );
  if (envErrorChange) {
    changes.push({
      pattern: 'environment_errors',
      current: current.environmentErrorCount,
      previous: previous.environmentErrorCount,
      trend: envErrorChange,
    });
  }

  return changes;
}

/**
 * Calculate trend for pattern occurrence
 * @param {number} current - Current period count
 * @param {number} previous - Previous period count
 * @returns {string|null} 'increasing', 'decreasing', 'stable', or null if no significant change
 */
function calculatePatternTrend(current, previous) {
  if (current === previous) {
    return 'stable';
  } else if (current > previous) {
    return 'increasing';
  } else if (current < previous) {
    return 'decreasing';
  }
  return null;
}

/**
 * Analyze learning indicators vs stagnation patterns
 * @param {Array} currentSessions - Current period sessions
 * @param {Array} previousSessions - Previous period sessions
 * @returns {Object} Learning analysis
 */
function analyzeLearningIndicators(currentSessions, previousSessions) {
  // Simple heuristics for learning vs stagnation
  const currentToolDiversity = calculateToolDiversity(currentSessions);
  const previousToolDiversity = calculateToolDiversity(previousSessions);
  
  const currentFilesDiversity = calculateFilesDiversity(currentSessions);
  const previousFilesDiversity = calculateFilesDiversity(previousSessions);

  // Learning indicators: new tools being used, new files being worked on
  const hasLearning = currentToolDiversity > previousToolDiversity || 
                     currentFilesDiversity > previousFilesDiversity;

  // Complexity progression: working with more diverse patterns
  const complexityProgression = currentToolDiversity > previousToolDiversity ? 'increasing' : 'stable';

  return {
    hasLearning,
    complexityProgression,
    currentToolDiversity,
    previousToolDiversity,
    currentFilesDiversity,
    previousFilesDiversity,
  };
}

/**
 * Calculate tool diversity in sessions (unique tool types used)
 * @param {Array} sessions - Sessions to analyze
 * @returns {number} Number of unique tools used
 */
function calculateToolDiversity(sessions) {
  const uniqueTools = new Set();
  sessions.forEach(session => {
    session.toolOperations?.forEach(op => {
      if (op.name) {
        uniqueTools.add(op.name);
      }
    });
  });
  return uniqueTools.size;
}

/**
 * Calculate files diversity in sessions (unique files worked on)
 * @param {Array} sessions - Sessions to analyze
 * @returns {number} Number of unique files accessed
 */
function calculateFilesDiversity(sessions) {
  const uniqueFiles = new Set();
  sessions.forEach(session => {
    session.toolOperations?.forEach(op => {
      if (op.input?.file_path) {
        uniqueFiles.add(op.input.file_path);
      }
    });
  });
  return uniqueFiles.size;
}

/**
 * Check if two dates are the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date 
 * @returns {boolean} True if same day
 */
function isSameDay(date1, date2) {
  return date1.toDateString() === date2.toDateString();
}

/**
 * Get start of week (Sunday) for a given date
 * @param {Date} date - Input date
 * @returns {Date} Start of week
 */
function getWeekStart(date) {
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

/**
 * Get top issues for a set of sessions
 * @param {Array} sessions - Sessions to analyze
 * @returns {Array} Top issues/error types
 */
function getTopIssues(sessions) {
  const issueMap = {};
  
  sessions.forEach(session => {
    if (!session.toolOperations) return;
    
    session.toolOperations.forEach(op => {
      if (op.status === 'error') {
        const issue = `${op.name} errors`;
        issueMap[issue] = (issueMap[issue] || 0) + 1;
      }
    });
  });

  return Object.entries(issueMap)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([issue, count]) => ({ issue, count }));
}
