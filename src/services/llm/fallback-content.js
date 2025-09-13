/**
 * @file Fallback Content Generator - Synthetic analysis when API unavailable
 * Functions for generating fallback content when LLM API is not available
 */

import { calculateStats } from './utilities.js';

/**
 * Generate synthetic enhanced analysis as fallback
 * @param {Object} sessionAnalysis - Session analysis data
 * @returns {Object} Synthetic enhanced analysis result
 */
export function generateSyntheticEnhancedAnalysis(sessionAnalysis) {
  const sessions = sessionAnalysis?.sessions || sessionAnalysis?.sessionAnalyses || [];
  const recommendations =
    sessionAnalysis?.recommendations || sessionAnalysis?.crossProjectPatterns || [];

  // Analyze actual patterns from session data
  const patterns = analyzeSessionPatterns(sessions);

  // Generate insights based on patterns
  const insights = generateInsightsFromPatterns(patterns, sessions.length);

  // Format as markdown
  let markdown = '# Enhanced Analysis\n\n';
  
  // Add summary section
  markdown += `## Summary\n\n${patterns.summary} Based on analysis of ${sessions.length} sessions.\n\n`;
  markdown += `*Generated using synthetic analysis strategy*\n\n`;
  
  // Add insights as separate sections
  insights.forEach(insight => {
    markdown += `## ${insight.title}\n\n`;
    markdown += insight.description;
    if (insight.recommendation) {
      markdown += `\n\n**Recommendation:** ${insight.recommendation}`;
    }
    markdown += '\n\n';
  });
  
  // Add statistics section
  markdown += `## Analysis Statistics\n\n`;
  markdown += `- **Sessions Analyzed:** ${sessions.length}\n`;
  markdown += `- **Recommendations:** ${recommendations.length}\n`;
  markdown += `- **Patterns Detected:** ${Object.keys(patterns.detected).length}\n`;
  markdown += `- **Generated:** ${new Date().toISOString()}\n\n`;

  return markdown;
}

/**
 * Create fallback executive summary
 * @param {Array} sessions - Session data
 * @param {Array} recommendations - Recommendations data
 * @returns {string} Executive summary markdown
 */
export function createFallbackExecutiveSummary(sessions, recommendations) {
  const stats = calculateStats(sessions, recommendations);
  const date = new Date().toLocaleDateString();

  return `# Executive Summary - Development Session Analysis

**Generated:** ${date}
**Sessions:** ${stats.totalSessions}
**Total Time:** ${stats.totalHours} hours
**Recommendations:** ${stats.recommendationCount}

## Key Metrics
- Average session: ${stats.avgSessionMinutes} minutes
- Projects analyzed: ${stats.projects.join(', ')}
- Improvement areas: ${stats.recommendationCount}

## Top Recommendations
${recommendations
  .slice(0, 3)
  .map((r, i) => `${i + 1}. **${r.type}**: ${r.description || 'See full analysis'}`)
  .join('\n')}

## Next Steps
Review recommendations and implement top priority items.`;
}

/**
 * Create fallback narrative summary
 * @param {Array} sessions - Session data
 * @param {Array} recommendations - Recommendations data
 * @returns {string} Narrative summary markdown
 */
export function createFallbackNarrativeSummary(sessions, recommendations) {
  const stats = calculateStats(sessions, recommendations);
  const date = new Date().toLocaleDateString();

  return `# Development Session Analysis

*Generated on ${date}*

## Overview

Analysis of ${stats.totalSessions} development sessions shows ${stats.totalHours} hours of collaborative work across ${stats.projects.length} projects. Sessions averaged ${stats.avgSessionMinutes} minutes each.

## Findings

${stats.recommendationCount} improvement opportunities were identified across key areas:
${recommendations
  .slice(0, 5)
  .map(r => `- ${r.type}: ${r.description || 'Optimization opportunity'}`)
  .join('\n')}

## Next Steps

Focus on implementing the most impactful improvements to enhance your collaborative development workflow.`;
}

/**
 * Analyze patterns from session data for synthetic content
 * @param {Array} sessions - Session data array
 * @returns {Object} Analyzed patterns object
 */
function analyzeSessionPatterns(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      detected: {},
      summary: 'No sessions available for pattern analysis',
      strugglingRate: 0,
      avgDuration: 0,
    };
  }

  const patterns = {
    detected: {},
    summary: '',
    strugglingRate: 0,
    avgDuration: 0,
  };

  // Calculate basic metrics
  const totalDuration = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  patterns.avgDuration = Math.round(totalDuration / sessions.length);

  // Count struggling sessions
  const strugglingCount = sessions.filter(
    s =>
      s.hasStruggle ||
      (s.durationSeconds && s.durationSeconds > 1800) ||
      (s.toolCount && s.toolCount > 50)
  ).length;

  patterns.strugglingRate = Math.round((strugglingCount / sessions.length) * 100);

  // Detect specific patterns
  if (patterns.strugglingRate > 30) {
    patterns.detected.highStruggleRate = {
      description: 'High rate of sessions with struggle indicators',
      impact: 'May indicate complex problems or inefficient workflows',
      recommendation: 'Focus on identifying common pain points and workflow optimization',
    };
  }

  if (patterns.avgDuration > 1200) {
    patterns.detected.longSessions = {
      description: 'Sessions tend to run longer than typical',
      impact: 'Could indicate complex problems or iterative debugging',
      recommendation: 'Consider breaking down large tasks into smaller, focused chunks',
    };
  }

  // Check for tool usage patterns
  const highToolUsage = sessions.filter(s => s.toolCount && s.toolCount > 30).length;
  if (highToolUsage > sessions.length * 0.2) {
    patterns.detected.heavyToolUsage = {
      description: 'Frequent use of development tools across sessions',
      impact: 'Suggests active debugging and iterative development approach',
      recommendation: 'Review tool efficiency and consider workflow automation opportunities',
    };
  }

  // Generate summary
  const detectedCount = Object.keys(patterns.detected).length;
  if (detectedCount === 0) {
    patterns.summary = 'Development patterns appear balanced with no significant issues detected.';
  } else {
    patterns.summary = `Analysis detected ${detectedCount} notable patterns that may benefit from attention.`;
  }

  return patterns;
}

/**
 * Generate insights from detected patterns
 * @param {Object} patterns - Detected patterns object
 * @param {number} sessionCount - Number of sessions analyzed
 * @returns {Array} Generated insights array
 */
function generateInsightsFromPatterns(patterns, sessionCount) {
  const insights = [];

  // Session volume insight
  if (sessionCount > 20) {
    insights.push({
      type: 'productivity',
      title: 'High Development Activity',
      description: `Analyzed ${sessionCount} development sessions, indicating consistent collaborative development activity`,
    });
  } else if (sessionCount < 5) {
    insights.push({
      type: 'awareness',
      title: 'Limited Session Data',
      description: `Only ${sessionCount} sessions analyzed. Patterns may become clearer with additional collaborative sessions`,
    });
  }

  // Pattern-based insights
  Object.entries(patterns.detected).forEach(([_key, pattern]) => {
    insights.push({
      type: 'pattern',
      title: pattern.description,
      description: pattern.impact,
      recommendation: pattern.recommendation,
    });
  });

  // Duration-based insights
  if (patterns.avgDuration > 1800) {
    insights.push({
      type: 'efficiency',
      title: 'Extended Session Duration',
      description: `Average session length of ${Math.round(patterns.avgDuration / 60)} minutes suggests complex problem-solving activities`,
      recommendation: 'Consider session planning and incremental progress tracking',
    });
  }

  // Default insight if none generated
  if (insights.length === 0) {
    insights.push({
      type: 'summary',
      title: 'Baseline Analysis Complete',
      description:
        'Collaborative development patterns appear within normal ranges based on current session data',
    });
  }

  return insights;
}

/**
 * Extract actionable recommendations from patterns
 * @param {Object} patterns - Patterns object with detected patterns
 * @returns {Array} Actionable recommendations array
 */
function extractRecommendationsFromPatterns(patterns) {
  const actions = [];

  Object.values(patterns.detected).forEach(pattern => {
    if (pattern.recommendation) {
      actions.push({
        description: pattern.recommendation,
        priority: 'medium',
      });
    }
  });

  // Add default recommendations if none found
  if (actions.length === 0) {
    actions.push(
      { description: 'Continue monitoring collaborative development patterns', priority: 'low' },
      { description: 'Focus on maintaining current effective practices', priority: 'low' }
    );
  }

  return actions;
}