/**
 * @file Adds struggle context and annotations to script sessions
 */
import {
  detectSimpleLoops,
  detectAdvancedLoops,
  detectErrorPatterns,
  detectStagnation,
  detectLongSessions,
  detectReadingSpirals,
  detectShotgunDebugging,
  detectRedundantSequences,
  detectContextSwitching,
} from '../../domain/struggle-detector.js';

/**
 * Analyzes struggles and generates annotations for script format
 * @param {object} session - Normalized session object
 * @returns {object} Struggle analysis with annotations
 */
export function analyzeSessionStruggles(session) {
  const struggles = {
    simpleLoops: detectSimpleLoops(session),
    advancedLoops: detectAdvancedLoops(session),
    errorPatterns: detectErrorPatterns(session),
    stagnation: detectStagnation(session),
    longSession: detectLongSessions(session),
    readingSpirals: detectReadingSpirals(session),
    shotgunDebugging: detectShotgunDebugging(session),
    redundantSequences: detectRedundantSequences(session),
    contextSwitching: detectContextSwitching(session),
    annotations: [],
  };

  // Generate inline annotations for the script
  struggles.annotations = generateStrugglesAnnotations(struggles, session);

  return struggles;
}

/**
 * Generate struggle annotations for inline display in script
 * @param {object} struggles - Detected struggle patterns
 * @param {object} session - Session data
 * @returns {Array} Array of annotation objects
 */
function generateStrugglesAnnotations(struggles, session) {
  const annotations = [];

  // Simple loops annotations
  struggles.simpleLoops.forEach(loop => {
    annotations.push({
      type: 'simple_loop',
      severity: 'warning',
      message: `🔄 **Loop Detected**: ${loop.name} called ${loop.count} times with identical parameters`,
      toolIndices: [loop.startIndex, loop.endIndex],
      suggestion: `Consider checking if the tool output changed or if there's a logic issue`,
    });
  });

  // Advanced loops annotations
  struggles.advancedLoops.forEach(loop => {
    annotations.push({
      type: 'advanced_loop',
      severity: 'warning',
      message: `🔄 **Pattern Loop**: Repeated sequence [${loop.toolSequence.join(' → ')}] ${loop.count} times`,
      toolIndices: [loop.startIndex, loop.endIndex],
      suggestion: `This pattern suggests getting stuck - consider changing approach`,
    });
  });

  // Error patterns annotations
  struggles.errorPatterns.forEach(pattern => {
    annotations.push({
      type: 'error_pattern',
      severity: 'error',
      message: `❌ **Error Streak**: ${pattern.name} failed ${pattern.count} consecutive times`,
      toolIndices: [pattern.startIndex, pattern.endIndex],
      suggestion: `Multiple failures suggest need for different approach or debugging`,
    });
  });

  // Stagnation annotations
  struggles.stagnation.forEach(stagnation => {
    annotations.push({
      type: 'stagnation',
      severity: 'warning',
      message: `🚫 **Stagnation**: ${stagnation.name} produced identical results`,
      toolIndices: [stagnation.startIndex, stagnation.endIndex],
      suggestion: `Same input/output suggests no progress - consider alternative approach`,
    });
  });

  // Long session annotation
  if (struggles.longSession.length > 0) {
    annotations.push({
      type: 'long_session',
      severity: 'info',
      message: `⏱️ **Long Session**: ${Math.round(session.durationSeconds / 60)} minutes`,
      suggestion: `Extended sessions may indicate complexity or inefficiency`,
    });
  }

  // Reading spiral annotations
  struggles.readingSpirals.forEach(spiral => {
    annotations.push({
      type: 'reading_spiral',
      severity: 'warning',
      message: `📖 **Reading Spiral**: ${spiral.readCount} reads with only ${spiral.actionCount} actions (${spiral.ratio.toFixed(1)}:1 ratio)`,
      suggestion: `Use Grep to search before reading files. Plan approach with TodoWrite first.`,
    });
  });

  // Shotgun debugging annotations
  struggles.shotgunDebugging.forEach(pattern => {
    annotations.push({
      type: 'shotgun_debugging',
      severity: 'error',
      message: `🎯 **Shotgun Debugging**: ${pattern.toolVariety} different tools in ${pattern.durationMinutes.toFixed(1)} minutes (${pattern.toolVelocity.toFixed(1)} tools/min)`,
      suggestion: `Slow down! Use TodoWrite to plan systematic debugging approach. Test one hypothesis at a time.`,
    });
  });

  // Redundant sequence annotations
  struggles.redundantSequences.forEach(sequence => {
    const indices = sequence.indices || [];
    annotations.push({
      type: 'redundant_sequence',
      severity: 'warning',
      message: `♻️ **Redundant Sequence**: ${sequence.type === 'unnecessary_re_read' ? 'Read→Edit→Read same file' : 'Duplicate command execution'}`,
      toolIndices: [indices[0], indices[indices.length - 1]],
      suggestion:
        sequence.type === 'unnecessary_re_read'
          ? `Edit tools keep file content in memory - no need to re-read immediately`
          : `Check if command succeeded before running again`,
    });
  });

  // Context switching annotations
  struggles.contextSwitching.forEach(switching => {
    annotations.push({
      type: 'context_switching',
      severity: 'warning',
      message: `🔀 **Context Switching**: ${switching.uniqueFiles} files, ${(switching.switchRate * 100).toFixed(0)}% switch rate`,
      suggestion: `Focus on completing all changes in one file before moving to the next. Use TodoWrite to plan file-by-file approach.`,
    });
  });

  return annotations.sort((a, b) => {
    // Sort by tool indices if available, otherwise by severity
    if (a.toolIndices && b.toolIndices) {
      return a.toolIndices[0] - b.toolIndices[0];
    }
    const severityOrder = { error: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Get annotation for a specific tool index
 * @param {Array} annotations - All session annotations
 * @param {number} toolIndex - Tool operation index
 * @returns {Array} Relevant annotations for this tool index
 */
export function getAnnotationsForTool(annotations, toolIndex) {
  return annotations.filter(annotation => {
    if (!annotation.toolIndices) return false;
    return toolIndex >= annotation.toolIndices[0] && toolIndex <= annotation.toolIndices[1];
  });
}

/**
 * Generate summary section for struggles
 * @param {object} struggles - Detected struggle patterns
 * @param {object} session - Session data
 * @returns {string} Formatted struggles summary
 */
export function generateStrugglesSection(struggles, session) {
  let section = `<div class="script-analysis-insights">\n`;
  section += `<div class="script-insight-header">🎯 Session Insights & Struggle Patterns</div>\n`;

  // What went well
  const positiveInsights = generatePositiveInsights(session, struggles);
  if (positiveInsights.length > 0) {
    section += `<div class="script-insight-section">\n`;
    section += `<h3>✅ What Went Well:</h3>\n`;
    section += `<ul class="script-insight-list">\n`;
    positiveInsights.forEach(insight => {
      section += `<li class="script-insight-item"><strong>${insight.title}</strong>: ${insight.description}</li>\n`;
    });
    section += `</ul>\n</div>\n`;
  }

  // Struggle patterns detected
  const hasStruggles = struggles.annotations.length > 0;
  if (hasStruggles) {
    section += `<div class="script-insight-section">\n`;
    section += `<h3>⚠️ Struggles Detected:</h3>\n`;
    section += `<ul class="script-insight-list">\n`;

    // Group by struggle type
    const groupedStruggles = groupAnnotationsByType(struggles.annotations);

    Object.entries(groupedStruggles).forEach(([type, annotations]) => {
      const typeTitle = getStruggleTypeTitle(type);
      section += `<li class="script-insight-item"><strong>${typeTitle}</strong>: ${annotations.length} instance${annotations.length > 1 ? 's' : ''}\n`;
      section += `<ul>\n`;
      annotations.forEach(annotation => {
        const cleanMessage = annotation.message.replace(/[🔄❌🚫⏱️]\s*\*\*[^*]+\*\*:\s*/, '');
        section += `<li>${cleanMessage}</li>\n`;
      });
      section += `</ul>\n</li>\n`;
    });
    section += `</ul>\n</div>\n`;
  }

  // Tool usage analysis
  section += generateToolUsageAnalysis(session);

  // Recommendations
  if (hasStruggles || struggles.longSession.length > 0) {
    section += `<div class="script-insight-section">\n`;
    section += `<h3>💡 Recommendations for Next Time:</h3>\n`;
    section += `<ol class="script-insight-list">\n`;

    const recommendations = generateRecommendations(struggles, session);
    recommendations.forEach(rec => {
      section += `<li class="script-insight-item"><strong>${rec.title}</strong>: ${rec.description}</li>\n`;
    });
    section += `</ol>\n</div>\n`;
  }

  section += `</div>\n`;
  return section;
}

/**
 * Generate positive insights from session
 */
function generatePositiveInsights(session, _struggles) {
  const insights = [];

  // Check for parallel tool execution
  const parallelToolGroups = findParallelToolUsage(session);
  if (parallelToolGroups > 0) {
    insights.push({
      title: 'Efficient Parallel Execution',
      description: `Used multiple tools simultaneously ${parallelToolGroups} times instead of sequentially`,
    });
  }

  // Check for systematic approach
  if (session.toolOperations.some(op => op.name === 'TodoWrite')) {
    insights.push({
      title: 'Systematic Approach',
      description: 'Used TodoWrite to structure work and track progress',
    });
  }

  // Check for appropriate tool selection
  const toolVariety = new Set(session.toolOperations.map(op => op.name)).size;
  if (toolVariety >= 3) {
    insights.push({
      title: 'Good Tool Variety',
      description: `Used ${toolVariety} different tools appropriately for the task`,
    });
  }

  return insights;
}

/**
 * Find parallel tool usage patterns
 */
function findParallelToolUsage(session) {
  let parallelGroups = 0;
  const _currentGroup = [];

  session.conversation.forEach(entry => {
    if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
      const toolUses = entry.message.content.filter(item => item.type === 'tool_use');
      if (toolUses.length > 1) {
        parallelGroups++;
      }
    }
  });

  return parallelGroups;
}

/**
 * Group annotations by type for summary
 */
function groupAnnotationsByType(annotations) {
  return annotations.reduce((groups, annotation) => {
    if (!groups[annotation.type]) {
      groups[annotation.type] = [];
    }
    groups[annotation.type].push(annotation);
    return groups;
  }, {});
}

/**
 * Get human readable title for struggle type
 */
function getStruggleTypeTitle(type) {
  const titles = {
    simple_loop: 'Repetitive Tool Calls',
    advanced_loop: 'Pattern Loops',
    error_pattern: 'Error Streaks',
    stagnation: 'Stagnation',
    long_session: 'Extended Duration',
  };
  return titles[type] || type;
}

/**
 * Generate tool usage analysis
 */
function generateToolUsageAnalysis(session) {
  let analysis = `<div class="script-insight-section">\n`;
  analysis += `<h3>🔧 Tool Usage Analysis:</h3>\n`;
  analysis += `<ul class="script-insight-list">\n`;

  const toolCounts = {};
  session.toolOperations.forEach(op => {
    toolCounts[op.name] = (toolCounts[op.name] || 0) + 1;
  });

  const mostUsedTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0];
  if (mostUsedTool) {
    analysis += `<li class="script-insight-item"><strong>Most Used Tool</strong>: ${mostUsedTool[0]} (${mostUsedTool[1]} times) - `;
    analysis += getToolUsageContext(mostUsedTool[0], mostUsedTool[1]) + '</li>\n';
  }

  const totalDurationMinutes = Math.round(session.durationSeconds / 60);
  const toolsPerMinute = session.toolOperations.length / Math.max(totalDurationMinutes, 1);

  analysis += `<li class="script-insight-item"><strong>Efficiency</strong>: ${session.toolOperations.length} total tool calls in `;
  analysis += `${session.durationSeconds < 60 ? session.durationSeconds + 's' : totalDurationMinutes + 'm'} `;
  analysis += `shows ${toolsPerMinute > 1 ? 'good' : 'steady'} pacing</li>\n`;

  // Detect workflow pattern
  const workflowPattern = detectWorkflowPattern(session.toolOperations);
  if (workflowPattern) {
    analysis += `<li class="script-insight-item"><strong>Pattern</strong>: ${workflowPattern}</li>\n`;
  }

  analysis += `</ul>\n</div>\n`;
  return analysis;
}

/**
 * Get context for tool usage frequency
 */
function getToolUsageContext(toolName, _count) {
  const contexts = {
    Read: 'appropriate for understanding documentation',
    LS: 'good for exploring project structure',
    Grep: 'efficient for searching codebase',
    TodoWrite: 'shows systematic task management',
    Edit: 'indicates active code modification',
    Bash: 'shows hands-on system interaction',
  };
  return contexts[toolName] || 'tool usage appropriate for task';
}

/**
 * Detect overall workflow pattern
 */
function detectWorkflowPattern(toolOperations) {
  const toolSequence = toolOperations.map(op => op.name);
  const _uniqueTools = [...new Set(toolSequence)];

  // Classic explore → understand → act pattern
  if (
    toolSequence.includes('LS') &&
    toolSequence.includes('Read') &&
    toolSequence.indexOf('LS') < toolSequence.indexOf('Read')
  ) {
    return 'Classic "explore → understand → act" workflow';
  }

  // Planning pattern
  if (toolSequence.includes('TodoWrite') && toolSequence.indexOf('TodoWrite') === 0) {
    return 'Planning-first approach with structured execution';
  }

  return null;
}

/**
 * Generate recommendations based on struggles
 */
function generateRecommendations(struggles, session) {
  const recommendations = [];

  // Loop-related recommendations
  if (struggles.simpleLoops.length > 0) {
    recommendations.push({
      title: 'Avoid Repetitive Tool Calls',
      description: 'Check tool outputs carefully before repeating the same action',
    });
  }

  if (struggles.advancedLoops.length > 0) {
    recommendations.push({
      title: 'Break Pattern Loops',
      description: 'When stuck in a pattern, step back and try a different approach',
    });
  }

  // Error-related recommendations
  if (struggles.errorPatterns.length > 0) {
    recommendations.push({
      title: 'Handle Errors Systematically',
      description: 'After 2-3 failures, pause to analyze the root cause before retrying',
    });
  }

  // Tool optimization recommendations
  const toolOptimizations = generateToolOptimizationRecommendations(session);
  recommendations.push(...toolOptimizations);

  return recommendations;
}

/**
 * Generate tool optimization recommendations
 */
function generateToolOptimizationRecommendations(session) {
  const recommendations = [];

  // Check for sequential tools that could be parallel
  const sequentialGroups = findSequentialToolsCandidate(session);
  if (sequentialGroups > 0) {
    recommendations.push({
      title: 'Use Parallel Tool Execution',
      description: 'Combine related read/search operations into single requests',
    });
  }

  return recommendations;
}

/**
 * Find sequential tool calls that could be parallelized
 */
function findSequentialToolsCandidate(session) {
  // This is a simplified check - could be more sophisticated
  const parallelizableTools = ['Read', 'LS', 'Grep', 'Glob'];
  let candidates = 0;

  for (let i = 0; i < session.toolOperations.length - 1; i++) {
    const current = session.toolOperations[i];
    const next = session.toolOperations[i + 1];

    if (parallelizableTools.includes(current.name) && parallelizableTools.includes(next.name)) {
      candidates++;
    }
  }

  return candidates;
}
