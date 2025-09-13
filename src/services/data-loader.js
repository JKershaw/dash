/**
 * Utility functions for loading existing analysis data
 * Can be used by regeneration scripts or other tools
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Load the most recent analysis data from standard output locations
 * @returns {Object} Analysis data with sessions, recommendations, etc.
 */
export async function loadMostRecentAnalysisData() {
  const data = {
    sessions: [],
    recommendations: [],
    enhancedAnalysis: null,
    timestamp: new Date().toISOString(),
  };

  // Load sessions and recommendations from standard locations

  // Load sessions from parsed sessions directory
  try {
    const sessionFiles = await fs.readdir('./parsed-sessions');
    console.log(`📂 Found ${sessionFiles.length} session files`);

    // Load a reasonable sample (all files if < 50, or most recent 50)
    const filesToLoad = sessionFiles
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(-50); // Get the most recent 50

    for (const file of filesToLoad) {
      try {
        const content = await fs.readFile(path.join('./parsed-sessions', file), 'utf-8');
        const sessionData = parseSessionFromMarkdown(content, file);
        if (sessionData) {
          data.sessions.push(sessionData);
        }
      } catch (error) {
        console.log(`⚠️  Skipping ${file}: ${error.message}`);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('⚠️  No parsed sessions directory found - starting with empty project');
    } else {
      console.log('⚠️  Could not read parsed sessions directory:', error.message);
    }
  }

  // Load recommendations from analysis outputs
  try {
    // Check for output directories existence (results not needed, just error logging)
    await fs.readdir('./output').catch(err => {
      if (err.code !== 'ENOENT') console.log('⚠️  Could not read output directory:', err.message);
    });
    await fs.readdir('./output/reports').catch(err => {
      if (err.code !== 'ENOENT') console.log('⚠️  Could not read reports directory:', err.message);
    });

    // Try to find recommendations in various formats
    const recPaths = [
      './output/recommendations.json',
      './output/reports/recommendations.json',
      './output/analysis-results.json',
    ];

    for (const recPath of recPaths) {
      try {
        const content = await fs.readFile(recPath, 'utf-8');
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
          data.recommendations = parsed;
          console.log(`✅ Loaded ${parsed.length} recommendations from ${recPath}`);
          break;
        } else if (parsed.recommendations) {
          data.recommendations = parsed.recommendations;
          console.log(`✅ Loaded ${parsed.recommendations.length} recommendations from ${recPath}`);
          break;
        }
      } catch {
        // Try next location
      }
    }
  } catch {
    console.log('⚠️  No recommendations found in standard locations');
  }

  // Load enhanced analysis if available
  try {
    const enhancedPaths = [
      './output/enhanced-analysis.json',
      './output/reports/enhanced-analysis.json',
      './output/ai-insights.json',
    ];

    for (const enhancedPath of enhancedPaths) {
      try {
        const content = await fs.readFile(enhancedPath, 'utf-8');
        data.enhancedAnalysis = JSON.parse(content);
        console.log(`✅ Loaded enhanced analysis from ${enhancedPath}`);
        break;
      } catch {
        // Try next location
      }
    }
  } catch {
    console.log('⚠️  No enhanced analysis found');
  }

  return data;
}

/**
 * Parse session data from markdown files created by the analysis pipeline
 * @param {string} content - Markdown content
 * @param {string} filename - Filename for extracting metadata
 * @returns {Object} Session data object
 */
export function parseSessionFromMarkdown(content, filename) {
  // Extract project name from filename pattern
  const projectMatch = filename.match(/^-(.+?)_[a-f0-9-]+\.md$/);
  const projectName = projectMatch
    ? projectMatch[1].replace(/-/g, '/').replace(/^Users-work-development-/, '')
    : 'Unknown Project';

  // Extract session ID
  const sessionIdMatch = filename.match(/_([a-f0-9-]+)\.md$/);
  const sessionId = sessionIdMatch ? sessionIdMatch[1] : 'unknown';

  // Extract duration - look for various patterns
  let durationSeconds = 0;
  const durationPatterns = [
    /\*\*Duration:\*\*\s*(\d+(?:\.\d+)?)\s*s/i, // **Duration:** 13s
    /\*\*Duration\*\*:\s*(\d+(?:\.\d+)?)\s*minutes?/i, // **Duration**: 45 minutes
    /Duration:\s*(\d+(?:\.\d+)?)\s*seconds?/i, // Duration: 13 seconds
    /Session length:\s*(\d+)\s*minutes?/i, // Session length: 5 minutes
    /Total time:\s*(\d+)\s*min/i, // Total time: 5 min
    /Runtime:\s*(\d+)s/i, // Runtime: 30s
  ];

  for (const pattern of durationPatterns) {
    const match = content.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      // Check if the pattern indicates minutes
      durationSeconds =
        pattern.source.includes('minute') || pattern.source.includes('min') ? value * 60 : value;
      break;
    }
  }

  // Extract tool operations from markdown structure
  const toolOperations = [];

  // Look for various tool usage patterns
  const toolPatterns = [
    /\*\*Tool Used:\*\*\s*`([^`]+)`/g, // **Tool Used:** `toolName`
    /<invoke name="([^"]+)">/g, // <invoke name="toolName">
    /Using tool:\s*(\w+)/g, // Using tool: toolName
    /###\s+\d+\.\s+Assistant.*?(?:run_in_terminal|read_file|create_file|replace_string_in_file|semantic_search|grep_search|file_search|list_dir)/gs,
  ];

  // Try each pattern
  for (const pattern of toolPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const toolName = match[1] || extractToolFromContext(match[0]);
      if (toolName) {
        // Check the context around this match for success/error indicators
        const context = getContextAroundMatch(content, match.index, 200);
        const hasError = detectErrorInContext(context);

        toolOperations.push({
          name: toolName,
          status: hasError ? 'error' : 'success',
          input: extractToolInput(context),
          output: extractToolOutput(context),
        });
      }
    }
  }

  // If we didn't find tools using patterns, try a simpler approach
  if (toolOperations.length === 0) {
    // Count conversation entries as proxy for activity
    const conversationMatches = content.matchAll(/###\s+\d+\.\s+(Assistant|User)/g);
    let toolCount = 0;
    for (const _match of conversationMatches) {
      toolCount++;
      if (toolCount > 1) {
        // Skip the first entry which is usually just the prompt
        toolOperations.push({
          name: 'conversation',
          status: 'success',
          input: null,
          output: null,
        });
      }
    }
  }

  // Try to detect struggle patterns from content
  const hasErrors = (content.match(/error|failed|problem/gi) || []).length;
  const isLongSession = durationSeconds > 1800; // 30 minutes
  const hasLoops = toolOperations.some(
    tool => toolOperations.filter(t => t.name === tool.name).length > 3
  );

  return {
    sessionId,
    projectName,
    durationSeconds,
    toolOperations,
    filename,
    metadata: {
      hasErrors: hasErrors > 5,
      isLongSession,
      hasLoops,
      toolCount: toolOperations.length,
      errorRate:
        toolOperations.length > 0
          ? toolOperations.filter(t => t.status === 'error').length / toolOperations.length
          : 0,
    },
  };
}

/**
 * Extract tool name from context when not captured by pattern
 */
function extractToolFromContext(context) {
  const toolNames = [
    'run_in_terminal',
    'read_file',
    'create_file',
    'replace_string_in_file',
    'semantic_search',
    'grep_search',
    'file_search',
    'list_dir',
    'edit_file',
  ];

  for (const tool of toolNames) {
    if (context.includes(tool)) {
      return tool;
    }
  }
  return null;
}

/**
 * Get context around a match for better analysis
 */
function getContextAroundMatch(content, matchIndex, radius = 200) {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(content.length, matchIndex + radius);
  return content.slice(start, end);
}

/**
 * Extract tool input from markdown content
 */
function extractToolInput(content) {
  const inputMatch =
    content.match(/<parameter[^>]*>(.*?)<\/antml:parameter>/s) ||
    content.match(/Input:\s*`([^`]+)`/) ||
    content.match(/\*\*Input:\*\*\s*(.*?)(?=\n|$)/);

  return inputMatch ? inputMatch[1].trim() : null;
}

/**
 * Extract tool output from markdown content
 */
function extractToolOutput(content) {
  const outputMatch =
    content.match(/```[\s\S]*?```/) ||
    content.match(/Output:\s*(.*?)(?=\n\n|$)/s) ||
    content.match(/Result:\s*(.*?)(?=\n\n|$)/s);

  return outputMatch ? outputMatch[0] : null;
}

/**
 * Generate synthetic recommendations if none are found
 * This helps when working with incomplete data sets
 */
export function generateSyntheticRecommendations(sessions) {
  const recommendations = [];

  // Analyze sessions to generate basic recommendations
  const longSessions = sessions.filter(s => s.durationSeconds > 1800);
  const errorProneSessions = sessions.filter(s => s.metadata?.errorRate > 0.3);
  const loopySessions = sessions.filter(s => s.metadata?.hasLoops);

  if (longSessions.length > sessions.length * 0.3) {
    recommendations.push({
      type: 'Task Breakdown',
      description: `${longSessions.length} sessions were longer than 30 minutes. Consider breaking down complex tasks into smaller, manageable pieces.`,
      sessions: longSessions.map(s => s.sessionId),
    });
  }

  if (errorProneSessions.length > 0) {
    recommendations.push({
      type: 'Error Pattern Detected',
      description: `${errorProneSessions.length} sessions had high error rates (>30%). Review tool usage patterns and error handling.`,
      sessions: errorProneSessions.map(s => s.sessionId),
    });
  }

  if (loopySessions.length > 0) {
    recommendations.push({
      type: 'Review Tool Logic',
      description: `${loopySessions.length} sessions showed repetitive tool usage patterns. Consider checking tool logic and avoiding unnecessary repetition.`,
      sessions: loopySessions.map(s => s.sessionId),
    });
  }

  return recommendations;
}

/**
 * Improved error detection in context text
 * Uses more sophisticated patterns than simple keyword matching
 */
function detectErrorInContext(context) {
  if (!context) return false;
  
  // Look for actual error patterns, not just keywords
  const errorPatterns = [
    // Tool use errors
    /<tool_use_error>/i,
    /tool.*(?:failed|error)/i,
    /operation.*(?:failed|unsuccessful)/i,
    
    // Specific error types
    /string to replace not found/i,
    /file not found/i,
    /permission denied/i,
    /command not found/i,
    /syntax error/i,
    
    // Status indicators
    /❌/,
    /\bfailed\b/i,
    /\berror\b.*:/i, // "Error: message" pattern
    /unsuccessful/i,
    
    // But NOT these false positives:
  ];
  
  // Exclusion patterns (things that mention "error" but aren't actually errors)
  const exclusionPatterns = [
    /no error/i,
    /without error/i,
    /fix.*error/i,
    /handle.*error/i,
    /error.*handling/i,
    /error.*message.*for/i, // "error message for debugging"
  ];
  
  // Check if any exclusion patterns match first
  for (const pattern of exclusionPatterns) {
    if (pattern.test(context)) return false;
  }
  
  // Then check for actual error patterns
  for (const pattern of errorPatterns) {
    if (pattern.test(context)) return true;
  }
  
  return false;
}
