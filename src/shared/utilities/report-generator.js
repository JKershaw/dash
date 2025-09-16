import {
  detectSimpleLoops,
  detectAdvancedLoops,
  detectLongSessions,
  detectErrorPatterns,
  detectNoProgressSessions,
  detectStagnation,
  detectPlanEditingLoops,
  detectReadingSpirals,
  detectShotgunDebugging,
  detectRedundantSequences,
  detectContextSwitching,
  analyzeStruggleTrend,
} from '../../domain/struggle-detector.js';
import { detectSessionPhases } from '../../domain/detectors/phase-detector.js';
import {
  detectAiCollaborationEffectiveness,
  detectProblemSolvingSuccess,
} from '../../domain/success-detector.js';
import { classifyStruggle } from '../../domain/problem-classifier.js';
import { reportSubPhase } from '../../services/progress/progress-calculator.js';

/**
 * @file This file contains functions for generating reports and recommendations.
 */

/**
 * Generates a markdown report from the analysis results.
 * @param {Array} sessions - An array of all analyzed sessions.
 * @param {Array} recommendations - An array of generated recommendations.
 * @param {string|null} [summary=null] - An optional AI-generated summary.
 * @returns {string} A markdown formatted report.
 */
export function generateMarkdownReport(sessions, recommendations, summary = null) {
  let report = `# Claude Code Self-Improvement Report\n\n`;

  if (summary) {
    report += `## AI Summary\n\n${summary}\n\n`;
  }

  report += `Analyzed ${sessions.length} sessions.\n\n`;

  report += `## Key Findings\n\n`;
  sessions.forEach((session, index) => {
    report += `### Session ${index + 1}: ${session.projectName} / ${session.sessionId}\n\n`;
    report += `**Duration:** ${session.durationSeconds.toFixed(2)}s\n`;
    report += `**Tool Operations:**\n`;
    const toolCount = session.toolCount || 0;
    if (toolCount > 0) {
      report += `_This session used ${toolCount} tool operations. Detailed tool logs are available in the session script._\n`;
    } else {
      report += '_No tool operations in this session._\n';
    }
    report += '\n';
  });

  if (recommendations.length > 0) {
    report += `## Recommendations\n\n`;
    recommendations.forEach((rec, index) => {
      report += `${index + 1}. **${rec.type}**: ${rec.description}\n`;
    });
  } else {
    report += `## No specific recommendations at this time.\n`;
  }

  return report;
}

/**
 * Generates recommendations based on the analysis of struggle patterns.
 * @param {Array} sessions - An array of all analyzed sessions.
 * @param {Function} progressCallback - Optional progress callback for pattern detection
 * @returns {Array} An array of recommendation objects.
 */
export function generateRecommendations(sessions, progressCallback = null) {
  // First collect all individual patterns with progress reporting
  const patterns = collectPatterns(sessions, progressCallback);

  // Then aggregate and deduplicate them
  return aggregateRecommendations(patterns, sessions);
}

/**
 * Collect all struggle patterns from sessions without generating individual recommendations
 * @param {Array} sessions - Array of session objects
 * @param {Function} progressCallback - Optional progress callback for pattern detection
 * @returns {Object} Collected patterns grouped by type
 */
function collectPatterns(sessions, progressCallback = null) {
  // Helper function to emit progress for each pattern detector
  let detectorStep = 0;
  const totalDetectors = 15; // Total number of pattern detectors
  
  const emitDetectorProgress = (detectorName) => {
    detectorStep++;
    if (progressCallback) {
      const progress = reportSubPhase('analysis', 'generateRecommendations', 'patternDetection', {
        currentStep: detectorStep,
        totalSteps: totalDetectors,
        message: `Analyzing ${detectorName} patterns`,
        details: `Processing ${sessions.length} sessions (${detectorStep}/${totalDetectors} detectors)`
      });
      
      progressCallback('generateRecommendations:progress', {
        message: progress.message,
        details: progress.details,
        percentage: progress.percentage,
        detector: detectorName,
        step: detectorStep,
        total: totalDetectors
      });
    }
  };

  const patterns = {
    simpleLoops: [],
    advancedLoops: [],
    longSessions: [],
    noProgressSessions: [],
    stagnationSessions: [],
    compilationIssues: [],
    userStruggles: [],
    planEditingLoops: [],
    errorPatterns: [],
    readingSpirals: [],
    shotgunDebugging: [],
    redundantSequences: [],
    contextSwitching: [],
    // Success patterns
    aiCollaborationEffectiveness: [],
    problemSolvingSuccess: [],
  };

  // Report progress before starting pattern detection
  emitDetectorProgress('simple loops');
  emitDetectorProgress('advanced loops');
  emitDetectorProgress('long sessions');
  emitDetectorProgress('no progress sessions');
  emitDetectorProgress('stagnation patterns');
  emitDetectorProgress('compilation issues');
  emitDetectorProgress('user struggles');
  emitDetectorProgress('plan editing loops');
  emitDetectorProgress('error patterns');
  emitDetectorProgress('reading spirals');
  emitDetectorProgress('shotgun debugging');
  emitDetectorProgress('redundant sequences');
  emitDetectorProgress('context switching');
  emitDetectorProgress('AI collaboration effectiveness');
  emitDetectorProgress('problem solving success');

  sessions.forEach(session => {
    // Detect session phases for context-aware analysis
    const phaseInfo = detectSessionPhases(session);
    
    // Collect simple loops
    const simpleLoops = detectSimpleLoops(session);
    if (simpleLoops.length > 0) {
      patterns.simpleLoops.push({
        session,
        tools: simpleLoops.map(loop => loop.name),
        count: simpleLoops.length,
      });
    }

    // Collect advanced loops
    const advancedLoops = detectAdvancedLoops(session);
    if (advancedLoops.length > 0) {
      patterns.advancedLoops.push({
        session,
        loops: advancedLoops,
        count: advancedLoops.length,
      });
    }

    // Collect long sessions with trend analysis
    const longSessions = detectLongSessions(session);
    if (longSessions.length > 0) {
      const trendAnalysis = analyzeStruggleTrend(session);
      patterns.longSessions.push({
        session,
        duration: session.durationSeconds,
        trend: trendAnalysis,
      });
    }

    // Collect no progress sessions
    const noProgressSessions = detectNoProgressSessions(session);
    if (noProgressSessions.length > 0) {
      patterns.noProgressSessions.push({ session });
    }

    // Collect stagnation patterns
    const stagnation = detectStagnation(session);
    if (stagnation.length > 0) {
      patterns.stagnationSessions.push({
        session,
        stagnationPatterns: stagnation,
      });
    }

    // Collect compilation issues
    const classifications = classifyStruggle(session);
    const compilationIssue = classifications.find(c => c.type === 'Compilation Issue');
    if (compilationIssue) {
      patterns.compilationIssues.push({
        session,
        details: compilationIssue.details,
      });
    }

    // Collect user struggles
    const userStruggle = classifications.find(c => c.type === 'User Struggle');
    if (userStruggle) {
      patterns.userStruggles.push({
        session,
        details: userStruggle.details,
      });
    }

    // Collect plan editing loops
    const planEditingLoops = detectPlanEditingLoops(session);
    if (planEditingLoops.length > 0) {
      patterns.planEditingLoops.push({
        session,
        loops: planEditingLoops,
      });
    }

    // Collect error patterns (phase-aware)
    const errorPatterns = detectErrorPatterns(session, phaseInfo);
    if (errorPatterns.length > 0) {
      patterns.errorPatterns.push({
        session,
        patterns: errorPatterns,
        phaseInfo, // Include phase info for debugging
      });
    }

    // Collect reading spirals
    const readingSpirals = detectReadingSpirals(session);
    if (readingSpirals.length > 0) {
      patterns.readingSpirals.push({
        session,
        spirals: readingSpirals,
        readCount: readingSpirals[0]?.readCount || 0,
        ratio: readingSpirals[0]?.ratio || 0,
      });
    }

    // Collect shotgun debugging patterns
    const shotgunDebugging = detectShotgunDebugging(session);
    if (shotgunDebugging.length > 0) {
      patterns.shotgunDebugging.push({
        session,
        patterns: shotgunDebugging,
        toolVariety: shotgunDebugging[0]?.toolVariety || 0,
        toolVelocity: shotgunDebugging[0]?.toolVelocity || 0,
      });
    }

    // Collect redundant sequences (phase-aware)
    const redundantSequences = detectRedundantSequences(session, phaseInfo);
    if (redundantSequences.length > 0) {
      patterns.redundantSequences.push({
        session,
        sequences: redundantSequences,
        count: redundantSequences.length,
        phaseInfo, // Include phase info for debugging
      });
    }

    // Collect context switching patterns
    const contextSwitching = detectContextSwitching(session);
    if (contextSwitching.length > 0) {
      patterns.contextSwitching.push({
        session,
        switching: contextSwitching,
        switchRate: contextSwitching[0]?.switchRate || 0,
        uniqueFiles: contextSwitching[0]?.uniqueFiles || 0,
      });
    }

    // Collect success patterns (phase-aware)
    const aiCollaboration = detectAiCollaborationEffectiveness(session, phaseInfo);
    if (aiCollaboration.length > 0) {
      patterns.aiCollaborationEffectiveness.push({
        session,
        patterns: aiCollaboration,
        phaseInfo, // Include phase info for debugging
      });
    }

    const problemSolving = detectProblemSolvingSuccess(session, phaseInfo);
    if (problemSolving.length > 0) {
      patterns.problemSolvingSuccess.push({
        session,
        patterns: problemSolving,
        phaseInfo, // Include phase info for debugging
      });
    }
  });

  return patterns;
}

/**
 * Aggregate collected patterns into meaningful recommendations
 * @param {Object} patterns - Collected patterns from sessions
 * @param {Array} sessions - Original sessions array for context
 * @returns {Array} Array of aggregated recommendation objects
 */
function aggregateRecommendations(patterns, sessions) {
  const recommendations = [];

  // Aggregate long sessions
  if (patterns.longSessions.length > 0) {
    const totalSessions = sessions.length;
    const avgDuration =
      patterns.longSessions.reduce((sum, p) => sum + p.duration, 0) / patterns.longSessions.length;
    const projectBreakdown = groupBy(patterns.longSessions, p => p.session.projectName);
    // TODO: Replace hardcoded limit of 3 projects with dynamic calculation
    // Current assumption: Show top 3 affected projects in descriptions
    // Future: Base on available space or percentage threshold (e.g., projects with >10% of occurrences)
    const topProjects = Object.entries(projectBreakdown)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([project]) => project);

    // Calculate scores
    const frequencyScore = calculateFrequencyScore(patterns.longSessions.length, totalSessions);
    const timeScore = calculateTimeScore('Task Breakdown Pattern', { avgDuration });
    const easeScore = calculateEaseScore('Task Breakdown Pattern');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    // TODO: Replace hardcoded 600s baseline with calculated optimal session duration
    // Current assumption: 10 minutes is ideal session baseline
    // Future: Calculate from user's efficient session patterns
    const timeSaved = estimateTimeSaved(patterns.longSessions.length, avgDuration - 600); // excess time

    recommendations.push({
      type: 'Task Breakdown Pattern',
      // TODO: Replace hardcoded "30 minutes" threshold with calculated value
      // Current assumption: 30-minute threshold for "long" sessions
      // Future: Calculate from user's session duration distribution
      description: `${patterns.longSessions.length} of ${totalSessions} sessions (${Math.round((patterns.longSessions.length / totalSessions) * 100)}%) exceeded 30 minutes. Average duration: ${Math.round(avgDuration / 60)}min. Most affected projects: ${topProjects.join(', ')}.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.longSessions.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation: generateLongSessionAdvice(patterns.longSessions),
      examples: patterns.longSessions.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        duration: Math.round(p.duration / 60) + 'min',
        trend: p.trend?.trend || 'unknown',
      })),
    });
  }

  // Aggregate simple tool loops
  if (patterns.simpleLoops.length > 0) {
    const toolFrequency = {};
    let totalRepetitions = 0;
    patterns.simpleLoops.forEach(p => {
      p.tools.forEach(tool => {
        toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
        totalRepetitions++;
      });
    });

    const topTools = Object.entries(toolFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]) => `${tool} (${count}x)`);

    const projectBreakdown = groupBy(patterns.simpleLoops, p => p.session.projectName);

    // Calculate scores
    const totalSessions = sessions.length;
    const frequencyScore = calculateFrequencyScore(patterns.simpleLoops.length, totalSessions);
    const timeScore = calculateTimeScore('Tool Loop Pattern', {
      totalRepetitions,
      affectedSessions: patterns.simpleLoops.length,
    });
    const easeScore = calculateEaseScore('Tool Loop Pattern');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.simpleLoops.length, totalRepetitions * 30); // assume 30s per repetition

    recommendations.push({
      type: 'Tool Loop Pattern',
      description: `${patterns.simpleLoops.length} sessions showed repetitive tool usage. Most common: ${topTools.join(', ')}. Affected projects: ${Object.keys(projectBreakdown).length}.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.simpleLoops.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.simpleLoops.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        tools: p.tools.slice(0, 2),
      })),
    });
  }

  // Aggregate error patterns
  if (patterns.errorPatterns.length > 0) {
    const toolErrors = {};
    let totalErrors = 0;
    patterns.errorPatterns.forEach(p => {
      p.patterns.forEach(pattern => {
        const key = pattern.name;
        if (!toolErrors[key]) {
          toolErrors[key] = { tool: pattern.name, count: 0, sessions: 0 };
        }
        toolErrors[key].count += pattern.count;
        toolErrors[key].sessions += 1;
        totalErrors += pattern.count;
      });
    });

    const topErrorTools = Object.values(toolErrors)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(t => `${t.tool} (${t.count} errors)`);

    const projectBreakdown = groupBy(patterns.errorPatterns, p => p.session.projectName);

    // Calculate scores
    const totalSessions = sessions.length;
    const frequencyScore = calculateFrequencyScore(patterns.errorPatterns.length, totalSessions);
    const timeScore = calculateTimeScore('Error Pattern Analysis', {
      totalErrors,
      affectedSessions: patterns.errorPatterns.length,
    });
    const easeScore = calculateEaseScore('Error Pattern Analysis');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.errorPatterns.length, totalErrors * 45); // assume 45s per error

    recommendations.push({
      type: 'Error Pattern Analysis',
      description: `${patterns.errorPatterns.length} sessions experienced repeated tool failures. Problem tools: ${topErrorTools.join(', ')}. Affected projects: ${Object.keys(projectBreakdown).length}.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.errorPatterns.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.errorPatterns.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        errorTools: p.patterns.map(pat => pat.name),
      })),
    });
  }

  // Aggregate stagnation patterns
  if (patterns.stagnationSessions.length > 0) {
    const stagnantTools = {};
    let totalStagnations = 0;
    patterns.stagnationSessions.forEach(p => {
      p.stagnationPatterns.forEach(pattern => {
        stagnantTools[pattern.name] = (stagnantTools[pattern.name] || 0) + 1;
        totalStagnations++;
      });
    });

    const topStagnantTools = Object.entries(stagnantTools)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool, count]) => `${tool} (${count}x)`);

    const projectBreakdown = groupBy(patterns.stagnationSessions, p => p.session.projectName);

    // Calculate scores
    const totalSessions = sessions.length;
    const frequencyScore = calculateFrequencyScore(
      patterns.stagnationSessions.length,
      totalSessions
    );
    const timeScore = calculateTimeScore('Stagnation Pattern', {
      totalRepetitions: totalStagnations,
      affectedSessions: patterns.stagnationSessions.length,
    });
    const easeScore = calculateEaseScore('Stagnation Pattern');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.stagnationSessions.length, totalStagnations * 60); // assume 1min per stagnation

    recommendations.push({
      type: 'Stagnation Pattern',
      description: `${patterns.stagnationSessions.length} sessions showed stagnation (same tool, input, output). Common stagnant tools: ${topStagnantTools.join(', ')}. Affected projects: ${Object.keys(projectBreakdown).length}.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.stagnationSessions.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.stagnationSessions.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        stagnantTools: p.stagnationPatterns.map(pat => pat.name),
      })),
    });
  }

  // Aggregate compilation issues
  if (patterns.compilationIssues.length > 0) {
    const projectBreakdown = groupBy(patterns.compilationIssues, p => p.session.projectName);
    const totalSessions = sessions.length;

    // Calculate scores
    const frequencyScore = calculateFrequencyScore(
      patterns.compilationIssues.length,
      totalSessions
    );
    const timeScore = calculateTimeScore('Build Process Issues', {});
    const easeScore = calculateEaseScore('Build Process Issues');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.compilationIssues.length, 300); // assume 5min per build issue

    recommendations.push({
      type: 'Build Process Issues',
      description: `${patterns.compilationIssues.length} of ${totalSessions} sessions (${Math.round((patterns.compilationIssues.length / totalSessions) * 100)}%) encountered compilation issues. Affected projects: ${Object.keys(projectBreakdown).length}. Consider improving build process and adding linting.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.compilationIssues.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.compilationIssues.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
      })),
    });
  }

  // Aggregate no progress sessions
  if (patterns.noProgressSessions.length > 0) {
    const projectBreakdown = groupBy(patterns.noProgressSessions, p => p.session.projectName);
    const totalSessions = sessions.length;

    // Calculate scores
    const frequencyScore = calculateFrequencyScore(
      patterns.noProgressSessions.length,
      totalSessions
    );
    const timeScore = 60; // Medium-high time score for productivity issues
    const easeScore = calculateEaseScore('Productivity Issues');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.noProgressSessions.length, 600); // assume 10min per unproductive session

    recommendations.push({
      type: 'Productivity Issues',
      description: `${patterns.noProgressSessions.length} of ${totalSessions} sessions (${Math.round((patterns.noProgressSessions.length / totalSessions) * 100)}%) made many tool calls without progress. Affected projects: ${Object.keys(projectBreakdown).length}. Users may benefit from clearer task definition or different approaches.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.noProgressSessions.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.noProgressSessions.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
      })),
    });
  }

  // Aggregate plan editing loops
  if (patterns.planEditingLoops.length > 0) {
    const projectBreakdown = groupBy(patterns.planEditingLoops, p => p.session.projectName);

    // Calculate scores
    const totalSessions = sessions.length;
    const frequencyScore = calculateFrequencyScore(patterns.planEditingLoops.length, totalSessions);
    const timeScore = 40; // Medium time score for plan editing
    const easeScore = calculateEaseScore('Plan Definition Issues');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.planEditingLoops.length, 180); // assume 3min per plan editing loop

    recommendations.push({
      type: 'Plan Definition Issues',
      description: `${patterns.planEditingLoops.length} sessions showed repetitive plan editing. Affected projects: ${Object.keys(projectBreakdown).length}. Consider providing structured plan templates with clear sections for goals, deliverables, and acceptance criteria.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.planEditingLoops.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.planEditingLoops.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        planFiles: p.loops.map(l => l.file_path),
      })),
    });
  }

  // Aggregate user expressed struggles
  if (patterns.userStruggles.length > 0) {
    const projectBreakdown = groupBy(patterns.userStruggles, p => p.session.projectName);
    const totalSessions = sessions.length;

    // Calculate scores
    const frequencyScore = calculateFrequencyScore(patterns.userStruggles.length, totalSessions);
    const timeScore = 75; // High time score for user frustration (indicates deeper issues)
    const easeScore = calculateEaseScore('User Frustration Pattern');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.userStruggles.length, 900); // assume 15min per frustrated session

    recommendations.push({
      type: 'User Frustration Pattern',
      description: `${patterns.userStruggles.length} of ${totalSessions} sessions (${Math.round((patterns.userStruggles.length / totalSessions) * 100)}%) included explicit user struggle expressions. Affected projects: ${Object.keys(projectBreakdown).length}. Consider investigating root causes and providing better guidance.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.userStruggles.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.userStruggles.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
      })),
    });
  }

  // Aggregate advanced loops
  if (patterns.advancedLoops.length > 0) {
    const projectBreakdown = groupBy(patterns.advancedLoops, p => p.session.projectName);
    const totalLoops = patterns.advancedLoops.reduce((sum, p) => sum + p.count, 0);

    // Calculate scores
    const totalSessions = sessions.length;
    const frequencyScore = calculateFrequencyScore(patterns.advancedLoops.length, totalSessions);
    const timeScore = 55; // Medium-high time score for complex workflows
    const easeScore = calculateEaseScore('Complex Workflow Issues');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.advancedLoops.length, totalLoops * 120); // assume 2min per complex loop

    recommendations.push({
      type: 'Complex Workflow Issues',
      description: `${patterns.advancedLoops.length} sessions had complex tool loops (${totalLoops} total sequences). Affected projects: ${Object.keys(projectBreakdown).length}. May indicate workflow inefficiencies or complex problem-solving patterns.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.advancedLoops.length,
      affectedProjects: Object.keys(projectBreakdown),
      examples: patterns.advancedLoops.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        loopCount: p.count,
      })),
    });
  }

  // Aggregate reading spirals
  if (patterns.readingSpirals.length > 0) {
    const projectBreakdown = groupBy(patterns.readingSpirals, p => p.session.projectName);
    const totalSessions = sessions.length;
    const avgRatio =
      patterns.readingSpirals.reduce((sum, p) => sum + p.ratio, 0) / patterns.readingSpirals.length;
    const totalReads = patterns.readingSpirals.reduce((sum, p) => sum + p.readCount, 0);

    const frequencyScore = calculateFrequencyScore(patterns.readingSpirals.length, totalSessions);
    const timeScore = 70; // High time score for inefficient reading patterns
    const easeScore = calculateEaseScore('Reading Efficiency');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.readingSpirals.length, totalReads * 10); // 10sec per excess read

    recommendations.push({
      type: 'Reading Efficiency',
      description: `${patterns.readingSpirals.length} sessions showed excessive reading without action (avg ${avgRatio.toFixed(1)}:1 read-to-action ratio). Consider using targeted searches with Grep tool before reading files. Use TodoWrite to plan approach before exploration.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.readingSpirals.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation: generateContextualReadingAdvice(patterns.readingSpirals),
      examples: patterns.readingSpirals.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        ratio: p.ratio,
        readCount: p.readCount,
      })),
    });
  }

  // Aggregate shotgun debugging
  if (patterns.shotgunDebugging.length > 0) {
    const projectBreakdown = groupBy(patterns.shotgunDebugging, p => p.session.projectName);
    const totalSessions = sessions.length;
    const avgVelocity =
      patterns.shotgunDebugging.reduce((sum, p) => sum + p.toolVelocity, 0) /
      patterns.shotgunDebugging.length;

    const frequencyScore = calculateFrequencyScore(patterns.shotgunDebugging.length, totalSessions);
    const timeScore = 75; // High time score for panic debugging
    const easeScore = calculateEaseScore('Debugging Strategy');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.shotgunDebugging.length, 600); // 10min per panicked session

    recommendations.push({
      type: 'Debugging Strategy',
      description: `${patterns.shotgunDebugging.length} sessions showed shotgun debugging (rapid tool switching, avg ${avgVelocity.toFixed(1)} tools/min). Slow down, use TodoWrite to plan debugging approach, and focus on systematic investigation.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.shotgunDebugging.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation: generateContextualDebuggingAdvice(patterns.shotgunDebugging),
      examples: patterns.shotgunDebugging.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        toolVelocity: p.toolVelocity,
        toolVariety: p.toolVariety,
      })),
    });
  }

  // Aggregate redundant sequences
  if (patterns.redundantSequences.length > 0) {
    const projectBreakdown = groupBy(patterns.redundantSequences, p => p.session.projectName);
    const totalSessions = sessions.length;
    const totalRedundancies = patterns.redundantSequences.reduce((sum, p) => sum + p.count, 0);

    const frequencyScore = calculateFrequencyScore(
      patterns.redundantSequences.length,
      totalSessions
    );
    const timeScore = 50; // Medium time score for workflow optimization
    const easeScore = calculateEaseScore('Workflow Efficiency');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.redundantSequences.length, totalRedundancies * 30); // 30sec per redundancy

    recommendations.push({
      type: 'Workflow Efficiency',
      description: `${patterns.redundantSequences.length} sessions had redundant tool sequences (${totalRedundancies} total). Common: Read→Edit→Read same file. Edit tools keep file content in memory - no need to re-read immediately.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.redundantSequences.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation:
        'Trust edit results. Avoid re-reading just-edited files. Use MultiEdit for multiple changes.',
      examples: patterns.redundantSequences.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        redundancyCount: p.count,
      })),
    });
  }

  // Aggregate context switching
  if (patterns.contextSwitching.length > 0) {
    const projectBreakdown = groupBy(patterns.contextSwitching, p => p.session.projectName);
    const totalSessions = sessions.length;
    const avgSwitchRate =
      patterns.contextSwitching.reduce((sum, p) => sum + p.switchRate, 0) /
      patterns.contextSwitching.length;

    const frequencyScore = calculateFrequencyScore(patterns.contextSwitching.length, totalSessions);
    const timeScore = 65; // High time score for context switching cost
    const easeScore = calculateEaseScore('Focus Management');
    const impactScore = calculateImpactScore(frequencyScore, timeScore, easeScore);
    const timeSaved = estimateTimeSaved(patterns.contextSwitching.length, 300); // 5min per scattered session

    recommendations.push({
      type: 'Focus Management',
      description: `${patterns.contextSwitching.length} sessions showed excessive context switching (${(avgSwitchRate * 100).toFixed(0)}% switch rate). Focus on completing changes in one file before moving to the next.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      frequencyScore,
      timeScore,
      easeScore,
      estimatedTimeSaved: timeSaved,
      count: patterns.contextSwitching.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation:
        'Complete all changes in one file before switching. Use TodoWrite to plan file-by-file approach.',
      examples: patterns.contextSwitching.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        switchRate: `${(p.switchRate * 100).toFixed(0)}%`,
        uniqueFiles: p.uniqueFiles,
      })),
    });
  }

  // Add success pattern recommendations
  addSuccessPatternRecommendations(recommendations, patterns, sessions);

  // Sort recommendations by impact score (highest first) and add priority numbers
  const sortedRecommendations = recommendations
    .sort((a, b) => b.impactScore - a.impactScore)
    .map((rec, index) => ({
      ...rec,
      priority: index + 1,
    }));

  return sortedRecommendations;
}

/**
 * Calculate frequency score based on affected sessions vs total sessions
 * @param {number} affectedSessions - Number of sessions with this pattern
 * @param {number} totalSessions - Total number of sessions analyzed
 * @returns {number} Score from 0-100
 */
function calculateFrequencyScore(affectedSessions, totalSessions) {
  return Math.round((affectedSessions / totalSessions) * 100);
}

/**
 * Calculate time score based on time wasted by this pattern
 * @param {string} patternType - Type of pattern
 * @param {Object} patternData - Pattern-specific data for scoring
 * @returns {number} Score from 0-100
 */
function calculateTimeScore(patternType, patternData) {
  // TODO: Replace hardcoded time scoring formulas with calculated values
  // Current assumption: Manual estimates of time impact per pattern
  // Future: Calculate from actual session data:
  //   - Measure actual time lost per pattern occurrence
  //   - Factor in context switching costs
  //   - Analyze productivity metrics before/after pattern resolution
  switch (patternType) {
    case 'Task Breakdown Pattern':
      // TODO: Replace 600s threshold and 2-point multiplier with data-driven values
      // Score based on average duration excess (minutes over 10min threshold)
      const excessMinutes = Math.max(0, (patternData.avgDuration - 600) / 60);
      return Math.min(100, Math.round(excessMinutes * 2)); // 2 points per excess minute, cap at 100

    case 'Error Pattern Analysis':
      // TODO: Replace 10-point multiplier with calculated impact per error
      // Score based on error frequency
      const avgErrorsPerSession = patternData.totalErrors / patternData.affectedSessions;
      return Math.min(100, Math.round(avgErrorsPerSession * 10)); // 10 points per average error

    case 'Tool Loop Pattern':
    case 'Stagnation Pattern':
      // TODO: Replace 15-point multiplier with measured time cost per repetition
      // Score based on repetition count
      const avgRepetitions = patternData.totalRepetitions / patternData.affectedSessions;
      return Math.min(100, Math.round(avgRepetitions * 15)); // 15 points per repetition

    case 'Build Process Issues':
      // TODO: Replace hardcoded 85 with calculated workflow blocking impact
      // High time score for compilation issues (blocks entire workflow)
      return 85;

    default:
      // TODO: Replace default 50 with pattern-specific calculation
      return 50; // Default medium time score
  }
}

/**
 * Calculate ease score based on how difficult this pattern is to fix
 * @param {string} patternType - Type of pattern
 * @returns {number} Score from 0-100 (higher = easier to fix)
 */
function calculateEaseScore(patternType) {
  // TODO: Replace hardcoded ease scores with calculated values
  // Current assumption: Manual estimates of fix difficulty
  // Future: Calculate from historical data:
  //   - Time to implement similar fixes
  //   - Code complexity of affected areas
  //   - Number of systems/files involved
  //   - User adoption rates of similar recommendations
  const EASE_SCORES = {
    'Plan Definition Issues': 85, // Easy - provide templates/documentation
    'Build Process Issues': 70, // Medium-Easy - add linting/build improvements
    'Tool Loop Pattern': 60, // Medium - tool usage education/warnings
    'Stagnation Pattern': 60, // Medium - tool improvements or user guidance
    'Error Pattern Analysis': 50, // Medium - mix of tool fixes and user education
    'Task Breakdown Pattern': 40, // Medium-Hard - requires workflow habit changes
    'Complex Workflow Issues': 35, // Hard - deep workflow redesign
    'User Frustration Pattern': 30, // Hard - requires investigation and systemic fixes
    'Productivity Issues': 45, // Medium-Hard - task planning and approach changes
  };

  return EASE_SCORES[patternType] || 50; // Default to medium difficulty
}

/**
 * Calculate composite impact score from frequency, time, and ease scores
 * @param {number} frequencyScore - How often this occurs (0-100)
 * @param {number} timeScore - How much time is wasted (0-100)
 * @param {number} easeScore - How easy to fix (0-100)
 * @returns {number} Composite score from 0-100
 */
function calculateImpactScore(frequencyScore, timeScore, easeScore) {
  // TODO: Replace hardcoded weights with calculated values based on historical data
  // Current assumption: frequency=40%, time=40%, ease=20%
  // Future: Analyze which factors correlate most with actual user productivity gains
  // Weighted formula: frequency (40%) + time (40%) + ease (20%)
  return Math.round(frequencyScore * 0.4 + timeScore * 0.4 + easeScore * 0.2);
}

/**
 * Convert impact score to impact level string
 * @param {number} impactScore - Impact score from 0-100
 * @returns {string} Impact level: "critical", "high", "medium", or "low"
 */
function getImpactLevel(impactScore) {
  // TODO: Replace hardcoded thresholds with calculated percentiles
  if (impactScore >= 80) return 'critical';
  if (impactScore >= 60) return 'high';
  if (impactScore >= 40) return 'medium';
  return 'low';
}

/**
 * Estimate time savings per week if this pattern were resolved
 * @param {number} affectedSessions - Number of affected sessions
 * @param {number} avgTimeWasted - Average time wasted per session (seconds)
 * @param {number} sessionFrequency - How often sessions occur per week
 * @returns {string} Human readable time savings estimate
 */
function estimateTimeSaved(affectedSessions, avgTimeWasted, sessionFrequency = 0.5) {
  // TODO: Replace hardcoded session frequency (0.5) with calculated user-specific frequency
  // Current assumption: User has ~2 sessions per month (0.5 per week)
  // Future: Calculate from user's historical session data
  const weeklyMinutesWasted = (affectedSessions * avgTimeWasted * sessionFrequency) / 60;

  // TODO: Replace hardcoded 60-minute threshold with dynamic formatting
  // Future: Consider user preferences for time display format
  if (weeklyMinutesWasted < 60) {
    return `${Math.round(weeklyMinutesWasted)}min/week`;
  } else {
    return `${(weeklyMinutesWasted / 60).toFixed(1)}hrs/week`;
  }
}

/**
 * Group array elements by a key function
 * @param {Array} array - Array to group
 * @param {Function} keyFn - Function that returns grouping key
 * @returns {Object} Grouped object
 */
function groupBy(array, keyFn) {
  return array.reduce((groups, item) => {
    const key = typeof keyFn === 'function' ? keyFn(item) : keyFn;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

/**
 * Generate contextual advice for reading efficiency based on actual session patterns
 * @param {Array} readingSpirals - Array of reading spiral patterns
 * @returns {string} Specific, actionable implementation advice
 */
function generateContextualReadingAdvice(readingSpirals) {
  // Analyze common file patterns to provide specific grep commands
  const commonFiles = [];
  const searchIntents = [];

  readingSpirals.forEach(spiral => {
    if (spiral.session.tools) {
      const reads = spiral.session.tools.filter(t => t.name === 'Read');
      reads.forEach(read => {
        if (read.input?.file_path) {
          const filename = read.input.file_path.split('/').pop();
          commonFiles.push(filename);

          // Infer search intent from file patterns
          if (filename.includes('test')) searchIntents.push('test files');
          if (filename.includes('config')) searchIntents.push('configuration');
          if (filename.endsWith('.js') || filename.endsWith('.ts'))
            searchIntents.push('source code');
        }
      });
    }
  });

  const topFiles = [...new Set(commonFiles)].slice(0, 3);
  const topIntents = [...new Set(searchIntents)].slice(0, 2);

  let advice = 'SPECIFIC ACTIONS:\n';

  if (topFiles.length > 0) {
    advice += `• Instead of reading ${topFiles.join(', ')}, use: \`Grep pattern="your-search-term" glob="**/*.js"\`\n`;
  }

  if (topIntents.includes('test files')) {
    advice +=
      '• For test debugging: \`Grep pattern="describe|it|test" glob="**/*.test.js"\` to find specific tests\n';
  }

  if (topIntents.includes('configuration')) {
    advice +=
      '• For config issues: \`Grep pattern="export.*config" glob="**/config*"\` to find config exports\n';
  }

  advice +=
    '• Use TodoWrite BEFORE exploring: "Find function that handles X", then search systematically\n';
  advice += '• Limit to 3-5 Read operations per investigation phase';

  return advice;
}

/**
 * Generate contextual advice for debugging strategy based on session patterns
 * @param {Array} shotgunPatterns - Array of shotgun debugging patterns
 * @returns {string} Specific debugging methodology
 */
function generateContextualDebuggingAdvice(shotgunPatterns) {
  // Analyze tool switching patterns to provide specific guidance
  const toolSwitches = [];
  const errorPatterns = [];

  shotgunPatterns.forEach(pattern => {
    if (pattern.session.tools) {
      const tools = pattern.session.tools;

      // Track tool switching patterns
      for (let i = 1; i < tools.length; i++) {
        const prev = tools[i - 1];
        const curr = tools[i];
        if (prev.name !== curr.name) {
          toolSwitches.push(`${prev.name}→${curr.name}`);
        }

        // Look for error indicators
        if (curr.status === 'error' || curr.output?.includes('error')) {
          errorPatterns.push(curr.name);
        }
      }
    }
  });

  const commonSwitches = toolSwitches.reduce((acc, switch_) => {
    acc[switch_] = (acc[switch_] || 0) + 1;
    return acc;
  }, {});
  const topSwitches = Object.entries(commonSwitches)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  let advice = 'DEBUGGING METHODOLOGY:\n';

  if (topSwitches.some(([switch_]) => switch_.includes('Bash→Edit'))) {
    advice +=
      '• STOP editing immediately after bash errors. First: read the error output completely\n';
    advice += '• Then: Use Grep to find similar error patterns before making changes\n';
  }

  if (topSwitches.some(([switch_]) => switch_.includes('Read→Bash'))) {
    advice +=
      '• After Read operations: Use TodoWrite to document what you learned before testing\n';
  }

  advice += '• Use this debugging sequence:\n';
  advice += '  1. TodoWrite: "Debug issue X - hypothesis is Y"\n';
  advice += '  2. Read/Grep: Gather evidence for hypothesis\n';
  advice += '  3. Edit: Make ONE focused change\n';
  advice += '  4. Bash: Test the change\n';
  advice += '  5. TodoWrite: Update with results before next hypothesis\n';

  if (errorPatterns.includes('Bash')) {
    advice +=
      '• For failed tests: Read test output first, then locate the failing test file, THEN make changes';
  }

  return advice;
}

/**
 * Generate contextual advice for long sessions based on struggle trend analysis
 * @param {Array} longSessions - Array of long session patterns with trend data
 * @returns {string} Specific, actionable implementation advice
 */
function generateLongSessionAdvice(longSessions) {
  // Categorize sessions by trend
  const trends = { degrading: [], improving: [], steady: [], unknown: [] };

  longSessions.forEach(pattern => {
    if (pattern.trend && pattern.trend.trend) {
      const trendType = pattern.trend.trend;
      if (trends[trendType]) {
        trends[trendType].push(pattern);
      } else {
        trends.unknown.push(pattern);
      }
    } else {
      trends.unknown.push(pattern);
    }
  });

  const total = longSessions.length;
  const degradingCount = trends.degrading.length;
  const improvingCount = trends.improving.length;
  const steadyCount = trends.steady.length;

  let advice = 'LONG SESSION ANALYSIS:\n';

  if (degradingCount > 0) {
    const pct = Math.round((degradingCount / total) * 100);
    advice += `• ${degradingCount} sessions (${pct}%) showed INCREASING struggle over time\n`;
    advice += '  → Take breaks every 30-45 minutes when debugging complex issues\n';
    advice += '  → Use TodoWrite to reset focus: "Taking 10min break, current status: X"\n';
  }

  if (improvingCount > 0) {
    const pct = Math.round((improvingCount / total) * 100);
    advice += `• ${improvingCount} sessions (${pct}%) showed DECREASING struggle - you found your flow!\n`;
    advice += '  → These longer sessions were productive, keep going when in flow state\n';
    advice += '  → Your exploration → focused work pattern is working well\n';
  }

  if (steadyCount > 0) {
    const pct = Math.round((steadyCount / total) * 100);
    advice += `• ${steadyCount} sessions (${pct}%) maintained consistent work patterns\n`;
    advice += '  → Consider shorter focused sessions (20-30min) for better mental freshness\n';
  }

  if (trends.unknown.length > 0) {
    advice += `• ${trends.unknown.length} sessions need more tool data for trend analysis\n`;
  }

  // Add general guidance
  advice += '\nGENERAL GUIDANCE:\n';
  advice += '• Monitor your energy: if errors increase, take a break\n';
  advice += "• Long sessions are OK when you're making progress and staying focused\n";
  advice += '• Use TodoWrite to track progress and maintain momentum across breaks';

  return advice;
}

/**
 * Add success pattern recommendations to the list
 */
function addSuccessPatternRecommendations(recommendations, patterns, sessions) {
  const totalSessions = sessions.length;

  // AI Collaboration Effectiveness recommendations
  if (patterns.aiCollaborationEffectiveness.length > 0) {
    const projectBreakdown = groupBy(patterns.aiCollaborationEffectiveness, p => p.session.projectName);
    const avgEffectiveness = patterns.aiCollaborationEffectiveness.reduce((sum, p) => 
      sum + (p.patterns[0]?.conversationEfficiency || 0.5), 0) / patterns.aiCollaborationEffectiveness.length;

    // Success patterns get inverted scoring - higher frequency = positive impact
    const frequencyScore = calculateFrequencyScore(patterns.aiCollaborationEffectiveness.length, totalSessions);
    const impactScore = Math.min(frequencyScore + 40, 90); // Boost positive patterns

    recommendations.push({
      type: 'AI Collaboration Success',
      description: `${patterns.aiCollaborationEffectiveness.length} sessions showed highly effective AI collaboration (${(avgEffectiveness * 100).toFixed(0)}% avg effectiveness). Continue leveraging AI suggestions and systematic approaches in affected projects: ${Object.keys(projectBreakdown).join(', ')}.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      category: 'success',
      count: patterns.aiCollaborationEffectiveness.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation: 'Continue current collaboration patterns: ask specific questions, implement AI suggestions, provide feedback on results.',
      examples: patterns.aiCollaborationEffectiveness.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        effectiveness: `${((p.patterns[0]?.conversationEfficiency || 0.5) * 100).toFixed(0)}%`,
      })),
    });
  }


  // Problem-Solving Success recommendations
  if (patterns.problemSolvingSuccess.length > 0) {
    const projectBreakdown = groupBy(patterns.problemSolvingSuccess, p => p.session.projectName);
    const avgEfficiency = patterns.problemSolvingSuccess.reduce((sum, p) => 
      sum + (p.patterns[0]?.efficiencyScore || 0.5), 0) / patterns.problemSolvingSuccess.length;

    const frequencyScore = calculateFrequencyScore(patterns.problemSolvingSuccess.length, totalSessions);
    const impactScore = Math.min(frequencyScore + 30, 80);

    recommendations.push({
      type: 'Problem-Solving Excellence',
      description: `${patterns.problemSolvingSuccess.length} sessions demonstrated efficient problem resolution (${(avgEfficiency * 100).toFixed(0)}% avg efficiency). Apply systematic debugging approaches from these successful sessions.`,
      impact: getImpactLevel(impactScore),
      impactScore,
      category: 'success',
      count: patterns.problemSolvingSuccess.length,
      affectedProjects: Object.keys(projectBreakdown),
      implementation: 'Replicate systematic approach: error investigation→targeted solution→verification. Document successful debugging strategies.',
      examples: patterns.problemSolvingSuccess.slice(0, 2).map(p => ({
        sessionId: p.session.sessionId,
        project: p.session.projectName,
        efficiency: `${((p.patterns[0]?.efficiencyScore || 0.5) * 100).toFixed(0)}%`,
      })),
    });
  }
}
