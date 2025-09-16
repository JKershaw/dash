/**
 * Detects patterns of consecutive tool calls that result in errors.
 * Now phase-aware to reduce false positives during exploration.
 * @param {object} session - A normalized session object.
 * @param {Array} phaseInfo - Session phase information for context-aware detection.
 * @returns {Array} An array of detected error patterns.
 */
export function detectErrorPatterns(session, phaseInfo = []) {
  const errorPatterns = [];
  if (!session || !session.toolOperations || session.toolOperations.length < 2) {
    return errorPatterns;
  }

  // Track both traditional error status and string replacement failures
  const stringReplacementFailures = [];
  let currentErrorPattern = null;

  for (let i = 0; i < session.toolOperations.length; i++) {
    const tool = session.toolOperations[i];
    
    // Check if this error should be counted based on phase context
    if (tool.status === 'error' && !shouldCountError(tool, i, phaseInfo)) {
      continue; // Skip errors that are normal for current phase
    }
    
    // Check for string replacement failures in output
    const isStringReplacementFailure = tool.output && 
      (tool.output.includes('String to replace not found in file') ||
       tool.output.includes('<tool_use_error>String to replace not found'));

    if (isStringReplacementFailure) {
      stringReplacementFailures.push({
        operationIndex: i,
        toolName: tool.name,
        output: tool.output
      });
    }

    // Original error detection logic
    if (tool.status === 'error') {
      if (currentErrorPattern && currentErrorPattern.name === tool.name) {
        currentErrorPattern.count++;
        currentErrorPattern.endIndex = i;
      } else {
        if (currentErrorPattern) {
          errorPatterns.push(currentErrorPattern);
        }
        currentErrorPattern = {
          name: tool.name,
          count: 1,
          startIndex: i,
          endIndex: i,
        };
      }
    } else {
      if (currentErrorPattern) {
        errorPatterns.push(currentErrorPattern);
        currentErrorPattern = null;
      }
    }
  }

  if (currentErrorPattern) {
    errorPatterns.push(currentErrorPattern);
  }

  // Add string replacement failure pattern if we found multiple failures
  if (stringReplacementFailures.length >= 3) {
    errorPatterns.push({
      name: 'Edit',
      count: stringReplacementFailures.length,
      errorType: 'string_replacement_failure',
      errorDetails: 'Multiple Edit operations failed with "String to replace not found" errors',
      startIndex: stringReplacementFailures[0].operationIndex,
      endIndex: stringReplacementFailures[stringReplacementFailures.length - 1].operationIndex,
      failures: stringReplacementFailures
    });
  }

  // Enhanced pattern detection based on real session analysis
  
  // 1. Detect user interruption patterns (most common in real sessions)
  const userInterruptions = session.toolOperations.filter(op => 
    op.status === 'error' && op.output && (
      op.output.includes("The user doesn't want to proceed") ||
      op.output.includes("The user doesn't want to take this action") ||
      op.output.includes("[Request interrupted by user")
    )
  );
  
  if (userInterruptions.length >= 2) {
    errorPatterns.push({
      name: 'UserInterruption',
      count: userInterruptions.length,
      errorType: 'user_interruption',
      errorDetails: `User interrupted ${userInterruptions.length} tool operations, suggesting workflow friction or unclear intent`,
      startIndex: userInterruptions[0].operationIndex,
      endIndex: userInterruptions[userInterruptions.length - 1].operationIndex,
      interruptions: userInterruptions.map(op => ({
        tool: op.name,
        index: op.operationIndex,
        output: op.output?.slice(0, 100)
      }))
    });
  }
  
  // 2. Detect timeout errors (system resource issues)
  const timeoutErrors = session.toolOperations.filter(op =>
    op.status === 'error' && op.output && 
    op.output.includes('timed out after')
  );
  
  if (timeoutErrors.length >= 1) {
    errorPatterns.push({
      name: 'CommandTimeout',
      count: timeoutErrors.length,
      errorType: 'timeout',
      errorDetails: `${timeoutErrors.length} command timeout(s) indicating system resource or network issues`,
      startIndex: timeoutErrors[0].operationIndex,
      endIndex: timeoutErrors[timeoutErrors.length - 1].operationIndex,
      timeouts: timeoutErrors.map(op => ({
        tool: op.name,
        index: op.operationIndex,
        output: op.output?.slice(0, 150)
      }))
    });
  }
  
  // 3. Detect git-related error patterns
  const gitErrors = session.toolOperations.filter(op =>
    op.status === 'error' && op.output && (
      op.output.includes('github.com') ||
      op.output.includes('git pull') ||
      op.output.includes('merge conflict') ||
      op.output.includes('git push') ||
      (op.name === 'Bash' && op.input?.command?.includes('git'))
    )
  );
  
  if (gitErrors.length >= 1) {
    errorPatterns.push({
      name: 'GitOperation',
      count: gitErrors.length,
      errorType: 'git_error',
      errorDetails: `${gitErrors.length} git operation error(s) suggesting repository sync or permission issues`,
      startIndex: gitErrors[0].operationIndex,
      endIndex: gitErrors[gitErrors.length - 1].operationIndex,
      gitErrors: gitErrors.map(op => ({
        tool: op.name,
        index: op.operationIndex,
        command: op.input?.command || 'unknown',
        output: op.output?.slice(0, 100)
      }))
    });
  }
  
  // 4. Detect mixed tool error sequences (cross-tool failure chains)  
  const allErrors = session.toolOperations
    .map((op, idx) => ({ ...op, arrayIndex: idx }))
    .filter(op => op.status === 'error');
    
  // Find sequences of errors within 5 operations of each other
  const mixedErrorChains = [];
  for (let i = 0; i < allErrors.length; i++) {
    const chain = [allErrors[i]];
    for (let j = i + 1; j < allErrors.length; j++) {
      const gap = allErrors[j].arrayIndex - chain[chain.length - 1].arrayIndex;
      if (gap <= 5 && allErrors[j].name !== chain[chain.length - 1].name) {
        chain.push(allErrors[j]);
      } else if (gap > 5) {
        break;
      }
    }
    
    if (chain.length >= 3) { // At least 3 different tool types failing in sequence
      const toolTypes = [...new Set(chain.map(op => op.name))];
      if (toolTypes.length >= 2) {
        mixedErrorChains.push({
          name: 'MixedToolFailure',
          count: chain.length,
          errorType: 'cross_tool_failure',
          errorDetails: `${chain.length} errors across ${toolTypes.length} different tools (${toolTypes.join(', ')}), suggesting systematic workflow breakdown`,
          startIndex: chain[0].operationIndex,
          endIndex: chain[chain.length - 1].operationIndex,
          toolSequence: toolTypes.join(' → '),
          failures: chain.map(op => ({
            tool: op.name,
            index: op.operationIndex,
            output: op.output?.slice(0, 80)
          }))
        });
        i += chain.length - 1; // Skip processed errors
        break;
      }
    }
  }
  
  errorPatterns.push(...mixedErrorChains);
  
  // 5. Detect high error density sessions
  const errorCount = allErrors.length;
  const totalOperations = session.toolOperations.length;
  const errorRate = errorCount / totalOperations;
  
  if (errorRate >= 0.25 && errorCount >= 5) { // 25%+ error rate with at least 5 errors
    errorPatterns.push({
      name: 'HighErrorDensity',
      count: errorCount,
      errorType: 'session_quality',
      errorDetails: `High error density: ${errorCount}/${totalOperations} operations failed (${Math.round(errorRate * 100)}%), indicating significant workflow issues`,
      startIndex: allErrors[0].operationIndex,
      endIndex: allErrors[allErrors.length - 1].operationIndex,
      errorRate: Math.round(errorRate * 100),
      errorBreakdown: allErrors.reduce((acc, op) => {
        acc[op.name] = (acc[op.name] || 0) + 1;
        return acc;
      }, {})
    });
  }
  
  // 6. Include single significant errors (file access, permissions, etc.)
  const significantSingleErrors = allErrors.filter(op => 
    op.output && (
      op.output.includes('File does not exist') ||
      op.output.includes('exceeds maximum') ||  
      op.output.includes('permission denied') ||
      op.output.includes('ENOENT') ||
      op.output.includes('EACCES')
    )
  );
  
  // Add significant single errors, avoiding duplicates with existing patterns
  significantSingleErrors.forEach(op => {
    // Check if this error is already covered by an existing pattern
    const alreadyCovered = errorPatterns.find(p => 
      p.startIndex <= op.operationIndex && 
      p.endIndex >= op.operationIndex &&
      p.errorType !== 'significant_single_error'
    );
    
    if (!alreadyCovered) {
      errorPatterns.push({
        name: op.name,
        count: 1,
        errorType: 'significant_single_error',
        errorDetails: 'Critical system error that may block workflow progress',
        startIndex: op.operationIndex,
        endIndex: op.operationIndex,
        errorOutput: op.output?.slice(0, 200)
      });
    } else {
      // Enhance existing pattern with significance flag
      alreadyCovered.hasSignificantErrors = true;
      if (!alreadyCovered.significantErrorTypes) {
        alreadyCovered.significantErrorTypes = [];
      }
      if (op.output?.includes('File does not exist')) {
        alreadyCovered.significantErrorTypes.push('file_not_found');
      } else if (op.output?.includes('exceeds maximum')) {
        alreadyCovered.significantErrorTypes.push('file_too_large');
      }
    }
  });

  // Return all patterns, including single significant errors (remove the count > 1 filter)
  return errorPatterns;
}

/**
 * Determines if an error should be counted based on phase context.
 * Implements phase-aware error filtering to reduce false positives.
 * @param {object} operation - The tool operation that failed
 * @param {number} operationIndex - Index of the operation in the session
 * @param {Array} phaseInfo - Session phase information
 * @returns {boolean} True if error should be counted as problematic
 */
function shouldCountError(operation, operationIndex, phaseInfo) {
  if (!phaseInfo || phaseInfo.length === 0) {
    return true; // No phase info available, count all errors
  }

  // Find the phase this operation belongs to
  const currentPhase = findPhaseForOperation(operationIndex, phaseInfo);
  
  if (!currentPhase) {
    return true; // Unknown phase, count the error
  }

  // Phase-specific error filtering logic
  if (currentPhase.type === 'exploration') {
    // During exploration, Read/Grep/Glob failures are often normal (trying to find relevant files)
    if (['Read', 'Grep', 'Glob'].includes(operation.name)) {
      // Allow some exploration failures, but still catch excessive ones
      const explorationFailureThreshold = 0.4; // Allow 40% failure rate during exploration
      
      // Check exploration failure rate in this phase
      const phaseOps = getOperationsInPhase(currentPhase, phaseInfo);
      const explorationOps = phaseOps.filter(op => ['Read', 'Grep', 'Glob'].includes(op.name));
      const explorationErrors = explorationOps.filter(op => op.status === 'error');
      
      if (explorationOps.length > 0) {
        const errorRate = explorationErrors.length / explorationOps.length;
        return errorRate > explorationFailureThreshold; // Only count if exceeding threshold
      }
    }
    
    // Always count Edit/Write failures even during exploration
    if (['Edit', 'Write', 'MultiEdit'].includes(operation.name)) {
      return true;
    }
  } else if (currentPhase.type === 'implementation') {
    // During implementation, be stricter about all errors
    return true;
  } else if (currentPhase.type === 'testing') {
    // During testing, some test failures are expected, but system errors are not
    if (operation.name === 'Bash' && operation.output) {
      // Don't count test failures as problematic, but do count system issues
      const isTestFailure = operation.output.includes('test') && 
                           (operation.output.includes('failed') || operation.output.includes('FAIL'));
      const isSystemError = operation.output.includes('permission denied') ||
                           operation.output.includes('command not found') ||
                           operation.output.includes('timeout');
      
      return !isTestFailure || isSystemError;
    }
    return true;
  }

  // For mixed/unknown phases, count all errors
  return true;
}

/**
 * Finds the phase that contains a specific operation index.
 * @param {number} operationIndex - Index of the operation
 * @param {Array} phaseInfo - Session phase information
 * @returns {object|null} The phase containing this operation, or null if not found
 */
function findPhaseForOperation(operationIndex, phaseInfo) {
  return phaseInfo.find(phase => 
    operationIndex >= phase.startIndex && operationIndex <= phase.endIndex
  );
}

/**
 * Gets all operations that belong to a specific phase.
 * @param {object} phase - The phase to get operations for
 * @param {Array} phaseInfo - Session phase information  
 * @returns {Array} Operations in this phase
 */
function getOperationsInPhase(phase, phaseInfo) {
  // This would need access to session.toolOperations, but we don't have it in this context
  // For now, return empty array - this is a limitation we can improve later
  return [];
}