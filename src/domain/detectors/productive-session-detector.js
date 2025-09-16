/**
 * Detects highly productive sessions that should be highlighted as success patterns.
 * Identifies systematic work, clean implementations, and effective problem-solving.
 * Now phase-aware to improve detection sensitivity
 * @param {object} session - A normalized session object
 * @param {Array} phaseInfo - Session phase information for enhanced detection
 * @returns {Array} An array of detected productivity patterns
 */
export function detectProductiveSessions(session, phaseInfo = []) {
  if (!session || !session.toolOperations || session.toolOperations.length < 4) {
    return [];
  }

  // Don't flag very short sessions as productive (need minimum substance)
  if (session.durationSeconds < 300) { // 5 minutes minimum
    return [];
  }

  const analysis = analyzeSessionProductivity(session);
  
  // Determine productivity type and score
  const productivityPattern = classifyProductivityPattern(analysis, session);
  
  if (productivityPattern) {
    return [{
      ...productivityPattern,
      sessionId: session.sessionId,
      duration: session.durationSeconds,
      toolCount: analysis.toolCount,
      errorRate: analysis.errorRate,
      toolErrorRatio: analysis.toolErrorRatio,
      productivityScore: analysis.productivityScore,
      _provenance: {
        patternType: 'productive_session',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        confidenceLevel: analysis.productivityScore > 0.8 ? 'high' : 'medium'
      }
    }];
  }

  return [];
}

/**
 * Analyzes session for productivity indicators
 * @param {object} session - Session object
 * @returns {object} Analysis results
 */
function analyzeSessionProductivity(session) {
  const toolOperations = session.toolOperations || [];
  const durationMinutes = session.durationSeconds / 60;
  
  // Basic metrics
  const toolCount = toolOperations.length;
  const errorCount = toolOperations.filter(op => op.status === 'error').length;
  const successCount = toolOperations.filter(op => op.status === 'success').length;
  const errorRate = toolCount > 0 ? errorCount / toolCount : 0;
  const toolErrorRatio = errorCount > 0 ? toolCount / errorCount : toolCount;
  
  // Pattern detection
  const hasSystematicProgression = detectSystematicProgression(toolOperations);
  const hasPlanningIndicators = detectPlanningIndicators(toolOperations);
  const hasCompletionSignals = detectCompletionSignals(toolOperations);
  const hasErrorResolution = detectErrorResolution(toolOperations);
  const isCleanImplementation = detectCleanImplementation(toolOperations, errorRate);
  
  // Calculate productivity score
  const productivityScore = calculateProductivityScore({
    toolCount,
    errorRate,
    hasSystematicProgression,
    hasPlanningIndicators,
    hasCompletionSignals,
    hasErrorResolution,
    isCleanImplementation,
    durationMinutes
  });

  return {
    toolCount,
    errorCount,
    successCount,
    errorRate,
    toolErrorRatio,
    productivityScore,
    hasSystematicProgression,
    hasPlanningIndicators,
    hasCompletionSignals,
    hasErrorResolution,
    isCleanImplementation,
    durationMinutes
  };
}

/**
 * Classifies the type of productivity pattern
 * @param {object} analysis - Analysis results
 * @param {object} session - Session object
 * @returns {object|null} Productivity pattern classification
 */
function classifyProductivityPattern(analysis) {
  // Prioritize specific patterns over general ones
  
  // Very high tool count with low error rate - prioritize this first for ultra-high productivity
  if (analysis.toolCount > 400 && analysis.errorRate < 0.02) {
    return {
      type: 'high_productivity',
      description: 'Ultra-high volume systematic development work',
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // Clean implementation (many operations, very low errors) - second priority
  if (analysis.isCleanImplementation && analysis.toolCount >= 100) {
    return {
      type: 'clean_implementation',
      description: 'Clean implementation with minimal errors',
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // Effective problem-solving (errors resolved efficiently) - prioritize over completion
  if (analysis.hasErrorResolution && analysis.errorRate > 0.1 && analysis.errorRate < 0.5) {
    return {
      type: 'effective_problem_solving',
      description: 'Efficient problem resolution',
      hasErrorResolution: analysis.hasErrorResolution,
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // Successful completion with clear signals
  if (analysis.hasCompletionSignals && analysis.errorRate < 0.3) {
    return {
      type: 'successful_completion',
      description: 'Task completed successfully with clear completion signals',
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // High tool count with low error rate (systematic complex work)
  if (analysis.toolCount > 200 && analysis.errorRate < 0.05) {
    return {
      type: 'high_productivity',
      description: 'High-volume systematic development work',
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // Well-organized small sessions with planning indicators
  if (analysis.hasPlanningIndicators && analysis.errorRate < 0.2 && analysis.toolCount >= 4) {
    return {
      type: 'high_productivity',
      description: 'Well-organized session with good planning',
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  // General high productivity (good metrics overall)
  if (analysis.productivityScore > 0.7) {
    return {
      type: 'high_productivity',
      description: 'High productivity session',
      hasSystematicProgression: analysis.hasSystematicProgression,
      hasPlanningIndicators: analysis.hasPlanningIndicators,
      hasCompletionSignals: analysis.hasCompletionSignals,
      hasErrorResolution: analysis.hasErrorResolution,
      isCleanImplementation: analysis.isCleanImplementation
    };
  }
  
  return null;
}

/**
 * Detects systematic progression patterns
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if systematic progression detected
 */
function detectSystematicProgression(toolOperations) {
  let readEditCycles = 0;
  let testingPatterns = 0;
  let writeOperations = 0;
  let todoWriteSequence = 0;
  
  for (let i = 0; i < toolOperations.length; i++) {
    const op = toolOperations[i];
    
    // Read-Edit/Write cycles
    if (op.name === 'Read' && i + 1 < toolOperations.length) {
      const nextOp = toolOperations[i + 1];
      if (nextOp.name === 'Edit' || nextOp.name === 'Write') {
        readEditCycles++;
      }
    }
    
    // Testing patterns
    if (op.name === 'Bash') {
      const command = op.input?.command?.toLowerCase() || '';
      if (command.includes('test') || command.includes('npm run')) {
        testingPatterns++;
      }
    }
    
    // Write operations (new file creation)
    if (op.name === 'Write') {
      writeOperations++;
    }
    
    // TodoWrite sequence patterns
    if (op.name === 'TodoWrite') {
      todoWriteSequence++;
    }
  }
  
  // More lenient criteria for systematic progression
  return readEditCycles >= 2 || testingPatterns >= 1 || writeOperations >= 2 || todoWriteSequence >= 2;
}

/**
 * Detects planning and organization indicators
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if planning indicators detected
 */
function detectPlanningIndicators(toolOperations) {
  let todoWriteCount = 0;
  let organizationalPatterns = 0;
  
  for (const op of toolOperations) {
    if (op.name === 'TodoWrite') {
      todoWriteCount++;
      
      // Any TodoWrite indicates some planning
      organizationalPatterns++;
      
      // Check for completion indicators in TodoWrite
      if (op.input?.todos) {
        const todos = Array.isArray(op.input.todos) ? op.input.todos : [op.input.todos];
        const hasCompletedTodos = todos.some(todo => 
          todo.status === 'completed' || 
          (typeof todo === 'string' && todo.includes('completed'))
        );
        if (hasCompletedTodos) {
          // Track completion patterns (variable kept for future use)
        }
      }
    }
  }
  
  // More lenient criteria - even 1 TodoWrite indicates planning
  return todoWriteCount >= 1;
}

/**
 * Detects completion signals in operations
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if completion signals detected
 */
function detectCompletionSignals(toolOperations) {
  // Check recent operations for success indicators
  const recentOps = toolOperations.slice(-10);
  
  for (const op of recentOps) {
    if (op.output) {
      const output = op.output.toLowerCase();
      if (output.includes('tests passed') ||
          output.includes('all tests passed') ||
          output.includes('✅') ||
          output.includes('completed successfully') ||
          output.includes('build completed') ||
          output.includes('success')) {
        return true;
      }
    }
    
    // TodoWrite with completed status
    if (op.name === 'TodoWrite' && op.input?.todos) {
      const todos = Array.isArray(op.input.todos) ? op.input.todos : [op.input.todos];
      if (todos.some(todo => todo.status === 'completed')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Detects effective error resolution patterns
 * @param {Array} toolOperations - Tool operations array
 * @returns {boolean} True if error resolution detected
 */
function detectErrorResolution(toolOperations) {
  // Look for error -> investigation -> fix -> success patterns
  for (let i = 0; i < toolOperations.length - 3; i++) {
    const ops = toolOperations.slice(i, i + 4);
    
    // Error followed by investigation and resolution
    if (ops[0].status === 'error' &&
        ops[1].name === 'Read' && // Investigation
        ops[2].name === 'Edit' && // Fix attempt
        ops[3].status === 'success') { // Success
      return true;
    }
  }
  
  // Alternative: Bash errors that get resolved
  let recentBashError = false;
  for (const op of toolOperations) {
    if (op.name === 'Bash' && op.status === 'error') {
      recentBashError = true;
    } else if (op.name === 'Bash' && op.status === 'success' && recentBashError) {
      // Same command type succeeded after failing
      return true;
    }
  }
  
  return false;
}

/**
 * Detects clean implementation patterns
 * @param {Array} toolOperations - Tool operations array
 * @param {number} errorRate - Error rate
 * @returns {boolean} True if clean implementation detected
 */
function detectCleanImplementation(toolOperations, errorRate) {
  // High tool count with very low error rate
  if (toolOperations.length >= 100 && errorRate < 0.02) {
    return true;
  }
  
  // Many Write/Edit operations with low errors (new code creation)
  const createOperations = toolOperations.filter(op => 
    op.name === 'Write' || op.name === 'Edit'
  ).length;
  
  return createOperations >= 20 && errorRate < 0.05;
}

/**
 * Calculates overall productivity score
 * @param {object} factors - Productivity factors
 * @returns {number} Productivity score (0-1)
 */
function calculateProductivityScore(factors) {
  let score = 0;
  
  // Error rate factor (lower is better)
  score += Math.max(0, (1 - factors.errorRate) * 0.3);
  
  // Tool volume factor
  if (factors.toolCount > 100) score += 0.2;
  if (factors.toolCount > 200) score += 0.1;
  
  // Pattern bonuses
  if (factors.hasSystematicProgression) score += 0.15;
  if (factors.hasPlanningIndicators) score += 0.1;
  if (factors.hasCompletionSignals) score += 0.15;
  if (factors.hasErrorResolution) score += 0.1;
  if (factors.isCleanImplementation) score += 0.2;
  
  // Duration efficiency (moderate duration with high output)
  if (factors.durationMinutes > 20 && factors.durationMinutes < 120) {
    score += 0.05;
  }
  
  return Math.min(1, score);
}