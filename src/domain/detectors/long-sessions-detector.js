const DEFAULT_LONG_SESSION_THRESHOLD_SECONDS = 600; // 10 minutes
const PROBLEMATIC_ERROR_RATE_THRESHOLD = 0.4; // 40% error rate indicates struggle
const HIGH_TOOL_COUNT_THRESHOLD = 100; // High tool count may indicate complex work

/**
 * Detects problematic long sessions using context-aware analysis.
 * Distinguishes between productive complex work and genuine productivity blockers.
 * @param {object} session - A normalized session object.
 * @param {number} [thresholdSeconds=DEFAULT_LONG_SESSION_THRESHOLD_SECONDS] - The duration threshold in seconds.
 * @returns {Array} An array containing flagged sessions with analysis data.
 */
export function detectLongSessions(
  session,
  thresholdSeconds = DEFAULT_LONG_SESSION_THRESHOLD_SECONDS
) {
  // Early exits for invalid or short sessions
  if (!session || !session.durationSeconds || session.durationSeconds <= thresholdSeconds) {
    return [];
  }

  // Handle sessions without tool operations
  if (!session.toolOperations || session.toolOperations.length === 0) {
    return [];
  }

  const analysis = analyzeSessionProductivity(session);
  
  // Don't flag productive long sessions
  if (isProductiveLongSession(analysis)) {
    return [];
  }

  // Flag problematic long sessions
  if (isProblematicLongSession(analysis)) {
    return [{
      type: 'problematic_long_session',
      sessionId: session.sessionId,
      duration: session.durationSeconds,
      errorRate: analysis.errorRate,
      toolsPerMinute: analysis.toolsPerMinute,
      repetitiveErrors: analysis.hasRepetitiveErrors,
      completionSignals: analysis.hasCompletionSignals,
      _provenance: {
        patternType: 'problematic_long_session',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        confidenceLevel: analysis.errorRate > 0.6 ? 'high' : 'medium'
      }
    }];
  }

  return [];
}

/**
 * Analyzes session productivity metrics
 * @param {object} session - Session object
 * @returns {object} Analysis results
 */
function analyzeSessionProductivity(session) {
  const toolOperations = session.toolOperations || [];
  const durationMinutes = session.durationSeconds / 60;
  
  // Calculate error rate
  const errorCount = toolOperations.filter(op => op.status === 'error').length;
  const errorRate = toolOperations.length > 0 ? errorCount / toolOperations.length : 0;
  
  // Calculate tool velocity
  const toolsPerMinute = durationMinutes > 0 ? toolOperations.length / durationMinutes : 0;
  
  // Detect repetitive errors (same command failing multiple times)
  const hasRepetitiveErrors = detectRepetitiveErrorPattern(toolOperations);
  
  // Detect completion signals
  const hasCompletionSignals = detectCompletionSignals(toolOperations);
  
  // Detect systematic progression
  const hasSystematicProgression = detectSystematicProgression(toolOperations);

  return {
    errorRate,
    toolsPerMinute,
    toolCount: toolOperations.length,
    errorCount,
    hasRepetitiveErrors,
    hasCompletionSignals, 
    hasSystematicProgression,
    durationMinutes
  };
}

/**
 * Determines if a long session is productive (should not be flagged)
 * @param {object} analysis - Session analysis results
 * @returns {boolean} True if session is productive
 */
function isProductiveLongSession(analysis) {
  // High tool count with low error rate indicates systematic work
  if (analysis.toolCount > HIGH_TOOL_COUNT_THRESHOLD && analysis.errorRate < 0.1) {
    return true;
  }
  
  // Sessions with completion signals are productive
  if (analysis.hasCompletionSignals) {
    return true;
  }
  
  // Systematic progression with moderate error rate is still productive  
  if (analysis.hasSystematicProgression && analysis.errorRate < 0.3) {
    return true;
  }
  
  // Fast-paced sessions with low errors are productive
  if (analysis.toolsPerMinute > 5 && analysis.errorRate < 0.2) {
    return true;
  }
  
  return false;
}

/**
 * Determines if a long session is problematic (should be flagged)
 * @param {object} analysis - Session analysis results  
 * @returns {boolean} True if session is problematic
 */
function isProblematicLongSession(analysis) {
  // High error rate indicates struggle
  if (analysis.errorRate > PROBLEMATIC_ERROR_RATE_THRESHOLD) {
    return true;
  }
  
  // Repetitive errors indicate stuck patterns
  if (analysis.hasRepetitiveErrors && analysis.errorRate > 0.2) {
    return true;
  }
  
  // Very long sessions with moderate errors and no progression
  if (analysis.durationMinutes > 60 && analysis.errorRate > 0.25 && !analysis.hasSystematicProgression) {
    return true;
  }
  
  return false;
}

/**
 * Detects repetitive error patterns (same command failing multiple times)
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if repetitive errors detected
 */
function detectRepetitiveErrorPattern(toolOperations) {
  const errorCommands = new Map();
  
  for (const op of toolOperations) {
    if (op.status === 'error' && op.input?.command) {
      const command = op.input.command;
      errorCommands.set(command, (errorCommands.get(command) || 0) + 1);
    }
  }
  
  // Check if any command failed 3+ times
  for (const count of errorCommands.values()) {
    if (count >= 3) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detects completion signals indicating successful work completion
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if completion signals detected
 */
function detectCompletionSignals(toolOperations) {
  // Look for success indicators in recent operations
  const recentOps = toolOperations.slice(-10);
  
  for (const op of recentOps) {
    if (op.output) {
      const output = op.output.toLowerCase();
      if (output.includes('tests passed') || 
          output.includes('success') ||
          output.includes('completed successfully') ||
          output.includes('✅')) {
        return true;
      }
    }
    
    // TodoWrite operations often signal completion/progress
    if (op.name === 'TodoWrite' && op.status === 'success') {
      return true;
    }
  }
  
  return false;
}

/**
 * Detects systematic progression patterns (organized workflow)
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if systematic progression detected
 */
function detectSystematicProgression(toolOperations) {
  // Look for common systematic patterns
  let todoWriteCount = 0;
  let readEditCycles = 0;
  let testingPatterns = 0;
  
  for (let i = 0; i < toolOperations.length; i++) {
    const op = toolOperations[i];
    
    // TodoWrite indicates planning and organization
    if (op.name === 'TodoWrite') {
      todoWriteCount++;
    }
    
    // Read-Edit cycles indicate systematic development
    if (op.name === 'Read' && i + 1 < toolOperations.length) {
      const nextOp = toolOperations[i + 1];
      if (nextOp.name === 'Edit') {
        readEditCycles++;
      }
    }
    
    // Testing patterns indicate structured development
    if (op.name === 'Bash' && op.input?.command) {
      const command = op.input.command.toLowerCase();
      if (command.includes('test') || command.includes('npm run')) {
        testingPatterns++;
      }
    }
  }
  
  // Systematic if multiple organization patterns present
  return todoWriteCount >= 2 || readEditCycles >= 3 || testingPatterns >= 2;
}