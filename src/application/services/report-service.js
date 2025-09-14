/**
 * @file Report Generation Service (Functional)
 * Provides report generation functions
 */

import { writeFileContent, getTimestampedReportPath } from '../../infrastructure/file-utils.js';
import { trackOutputFile } from '../../services/metadata-collector.js';
import { promises as fs } from 'fs';

// Track last report path at module level for backwards compatibility
let lastReportPath = null;

/**
 * Get the last generated report path
 * @returns {string} Last report path
 */
export function getLastReportPath() {
  return lastReportPath;
}

/**
 * Generate markdown report
 * @param {Array} sessions - Analyzed sessions
 * @param {Array} recommendations - Generated recommendations
 * @param {Object} enhancedAnalysis - Optional enhanced analysis
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {string} Report path
 */
export async function generateMarkdownReport(
  sessions,
  recommendations,
  enhancedAnalysis = null,
  metadata = null
) {
  const { generateMarkdownReport } = await import('../../shared/utilities/report-generator.js');

  let markdownReport = generateMarkdownReport(sessions, recommendations);

  // Add enhanced analysis if available (now in markdown format)
  if (enhancedAnalysis && typeof enhancedAnalysis === 'string') {
    markdownReport = markdownReport + '\n\n' + enhancedAnalysis;
  } else {
    // Include simple error note if enhanced analysis failed
    markdownReport =
      markdownReport +
      '\n\n## Analysis Notes\n\nEnhanced AI analysis was unavailable for this report.';
  }

  // Save the markdown report
  await saveMarkdownReport(markdownReport, metadata);
  return lastReportPath;
}

/**
 * Generate both executive and narrative summaries with integrated LLM
 * @param {Array} sessions - Analyzed sessions
 * @param {Array} recommendations - Generated recommendations
 * @param {Object} enhancedAnalysis - Optional enhanced analysis
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {Object|null} Combined error object if any LLM errors occurred, null otherwise
 */
export async function generateExecutiveSummary(
  sessions,
  recommendations,
  enhancedAnalysis = null,
  metadata = null
) {
  let executiveSummaryError = null;
  let narrativeSummaryError = null;

  try {
    const { generateExecutiveSummary, generateNarrativeSummary } = await import(
      '../../services/llm-service.js'
    );

    // Generate LLM-based executive summary
    const summaryResult = await generateExecutiveSummary(
      sessions,
      recommendations,
      enhancedAnalysis,
      metadata
    );

    // Handle both string and object return formats
    let executiveSummaryContent;
    if (typeof summaryResult === 'string') {
      executiveSummaryContent = summaryResult;
    } else if (summaryResult && summaryResult.content) {
      executiveSummaryContent = summaryResult.content;
      // Capture executive summary LLM error for potential return
      if (summaryResult.error) {
        executiveSummaryError = summaryResult.error;
      }
    } else {
      throw new Error('Invalid executive summary format received');
    }

    // Add note about enhanced analysis availability
    if (!enhancedAnalysis || typeof enhancedAnalysis !== 'string') {
      executiveSummaryContent +=
        '\n\n*Note: Enhanced AI analysis was unavailable during report generation.*';
    }

    await saveExecutiveSummary(executiveSummaryContent, metadata);

    // Generate LLM-based narrative summary
    const narrativeResult = await generateNarrativeSummary(
      sessions,
      recommendations,
      enhancedAnalysis,
      metadata
    );

    // Handle narrative summary format and capture errors
    let narrativeSummaryContent;
    if (typeof narrativeResult === 'string') {
      narrativeSummaryContent = narrativeResult;
    } else if (narrativeResult && narrativeResult.content) {
      narrativeSummaryContent = narrativeResult.content;
      // Capture narrative summary LLM error for potential return
      if (narrativeResult.error) {
        narrativeSummaryError = narrativeResult.error;
      }
    } else {
      narrativeSummaryContent = 'Narrative summary unavailable';
    }

    await saveNarrativeSummary(narrativeSummaryContent, metadata);

    // Return combined LLM errors for propagation if any are present
    if (executiveSummaryError || narrativeSummaryError) {
      return {
        executiveSummaryError,
        narrativeSummaryError,
        // Create combined message for backward compatibility with existing error tracking
        type: 'llm_error',
        message: [
          executiveSummaryError?.message,
          narrativeSummaryError?.message
        ]
          .filter(Boolean)
          .join('; '),
        details: {
          executive: executiveSummaryError,
          narrative: narrativeSummaryError
        }
      };
    }
    
    return null; // No errors
  } catch (error) {
    console.log('⚠️ Could not generate executive summary:', error.message);
    return {
      type: 'llm_error',
      message: `Report generation failed: ${error.message}`,
      details: error.message,
    };
  }
}

/**
 * Save markdown report to file
 * @param {string} content - Report content
 * @param {Object} metadata - Optional metadata object for tracking
 */
export async function saveMarkdownReport(content, metadata = null) {
  const reportPath = getTimestampedReportPath('analysis');
  await writeFileContent(reportPath, content);
  lastReportPath = reportPath;

  // Track output file
  if (metadata) {
    try {
      const stats = await fs.stat(reportPath);
      trackOutputFile(metadata, 'analysis-report', reportPath, stats.size);
    } catch (error) {
      console.warn('Could not track analysis report file:', error.message);
    }
  }
}

/**
 * Save executive summary to file
 * @param {string} content - Summary content
 * @param {Object} metadata - Optional metadata object for tracking
 */
export async function saveExecutiveSummary(content, metadata = null) {
  const summaryPath = getTimestampedReportPath('executive-summary');
  await writeFileContent(summaryPath, content);

  // Track output file
  if (metadata) {
    try {
      const stats = await fs.stat(summaryPath);
      trackOutputFile(metadata, 'executive-summary', summaryPath, stats.size);
    } catch (error) {
      console.warn('Could not track executive summary file:', error.message);
    }
  }
}

/**
 * Save narrative summary to file
 * @param {string} content - Summary content
 * @param {Object} metadata - Optional metadata object for tracking
 */
export async function saveNarrativeSummary(content, metadata = null) {
  const summaryPath = getTimestampedReportPath('narrative-summary');
  await writeFileContent(summaryPath, content);

  // Track output file
  if (metadata) {
    try {
      const stats = await fs.stat(summaryPath);
      trackOutputFile(metadata, 'narrative-summary', summaryPath, stats.size);
    } catch (error) {
      console.warn('Could not track narrative summary file:', error.message);
    }
  }
}

