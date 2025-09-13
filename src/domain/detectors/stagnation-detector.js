import isEqual from 'lodash-es/isEqual.js';

/**
 * Detects genuine stagnation in a session - repeated actions with no forward progress.
 * Now context-aware to avoid flagging productive exploration and methodical development.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected stagnation patterns.
 */
export function detectStagnation(session) {
  const stagnationPatterns = [];
  if (!session || !session.toolOperations || session.toolOperations.length < 2) {
    return stagnationPatterns;
  }

  // Find potential repeated patterns
  const repeatedPatterns = [];
  for (let i = 1; i < session.toolOperations.length; i++) {
    const prevTool = session.toolOperations[i - 1];
    const currentTool = session.toolOperations[i];

    // Enhanced comparison that considers tool-specific semantics
    if (areOperationsIdentical(prevTool, currentTool)) {
      repeatedPatterns.push({
        name: currentTool.name,
        input: currentTool.input,
        output: currentTool.output,
        startIndex: i - 1,
        endIndex: i,
        operationIndex: i,
      });
    }
  }

  // Filter out productive patterns that shouldn't be flagged as stagnation
  const genuineStagnation = repeatedPatterns.filter(pattern => {
    return !isProductivePattern(pattern, session.toolOperations);
  });

  return genuineStagnation;
}

/**
 * Enhanced comparison that considers tool-specific semantics to avoid false positives.
 * Based on AI feedback about git workflow commands with null input/output.
 * @param {object} op1 - First operation 
 * @param {object} op2 - Second operation
 * @returns {boolean} True if operations are truly identical
 */
function areOperationsIdentical(op1, op2) {
  // Different tool types are not identical
  if (op1.name !== op2.name) {
    return false;
  }

  // For Bash operations, we need special handling since git commands 
  // often have null input/output but are different commands
  if (op1.name === 'Bash') {
    // If both have null input/output, we cannot determine if they're identical
    // This is common with git commands where actual command text isn't captured
    // Based on AI feedback: "git commands often have meaningful but unparsed output"
    // Enhanced logic: assume Bash operations with null input/output are different commands
    if ((op1.input === null || op1.input === undefined) && 
        (op2.input === null || op2.input === undefined) &&
        (op1.output === null || op1.output === undefined) && 
        (op2.output === null || op2.output === undefined)) {
      // Conservative approach: don't flag consecutive Bash commands with null data as identical
      // This avoids false positives on git workflows like: git status → git diff → git add
      return false;
    }
    
    // If we have command information, compare that
    if (op1.input?.command && op2.input?.command) {
      return op1.input.command === op2.input.command;
    }
  }

  // For Grep operations, use semantic comparison instead of just input/output
  // Based on LLM-TDD feedback: "compare operation targets (file paths, commands) rather than just input/output fields"
  if (op1.name === 'Grep') {
    // If both have null input/output, check if they have different semantic content
    if ((op1.input === null || op1.input === undefined) && 
        (op2.input === null || op2.input === undefined) &&
        (op1.output === null || op1.output === undefined) && 
        (op2.output === null || op2.output === undefined)) {
      
      // Check metadata for actual search patterns and file targets
      if (op1.metadata && op2.metadata) {
        // Different search patterns indicate different operations
        if (op1.metadata.pattern !== op2.metadata.pattern) {
          return false;
        }
        
        // Different file targets indicate different operations
        const files1 = op1.metadata.files || [];
        const files2 = op2.metadata.files || [];
        if (!isEqual(files1, files2)) {
          return false;
        }
      }
      
      // If we have input with pattern/file information, compare that
      if (op1.input?.pattern && op2.input?.pattern) {
        if (op1.input.pattern !== op2.input.pattern) {
          return false;
        }
        
        // Check file paths or glob patterns
        if (op1.input.glob !== op2.input.glob) {
          return false;
        }
        
        if (op1.input.path !== op2.input.path) {
          return false;
        }
      }
      
      // Conservative approach: if Grep operations have null input/output and no differentiating metadata,
      // assume they are different search operations (similar to Bash approach)
      // This avoids flagging productive exploration patterns as stagnation
      return false;
    }
    
    // If we have actual input/output data, use semantic comparison
    if (op1.input && op2.input) {
      // Compare search patterns
      if (op1.input.pattern !== op2.input.pattern) {
        return false;
      }
      
      // Compare file targets (glob patterns, paths, etc.)
      if (op1.input.glob !== op2.input.glob || op1.input.path !== op2.input.path) {
        return false;
      }
    }
  }

  // For other tools, use standard comparison
  return (
    isEqual(op1.input, op2.input) &&
    isEqual(op1.output, op2.output)
  );
}

/**
 * Determines if a repeated pattern represents productive work rather than stagnation.
 * Based on AI feedback about common false positives.
 * @param {object} pattern - The repeated pattern to analyze
 * @param {Array} allOperations - All tool operations in the session
 * @returns {boolean} True if pattern is productive (should not be flagged)
 */
function isProductivePattern(pattern, allOperations) {
  const { name, input, operationIndex } = pattern;

  // 1. Successful Edit operations indicate progress, not stagnation  
  // Based on LLM-TDD feedback: "Detector flags Edit operations with null input/output as 'stagnant'"
  // Fix: "Skip stagnation check - successful edits indicate progress"
  if (name === 'Edit' && allOperations[operationIndex]?.status === 'success') {
    return true; // Successful Edit operations represent productive file modifications
  }

  // 2. TodoWrite patterns show progress tracking, not struggle
  if (name === 'TodoWrite') {
    return true; // AI feedback: "TodoWrite pattern actually shows progress tracking, not struggle"
  }

  // 3. Read-after-Edit cycles are normal development workflow
  if (name === 'Read' && input?.file_path) {
    const prevOp = allOperations[operationIndex - 1];
    const nextOp = allOperations[operationIndex + 1];
    
    // Check if this read is part of a Read->Edit->Read sequence (verification reads)
    if (prevOp && ['Edit', 'MultiEdit', 'Write'].includes(prevOp.name) && prevOp.input?.file_path === input.file_path) {
      return true; // Reading after editing same file is verification, not stagnation
    }
    
    if (nextOp && ['Edit', 'MultiEdit', 'Write'].includes(nextOp.name) && nextOp.input?.file_path === input.file_path) {
      return true; // Reading before editing same file is preparation, not stagnation  
    }
  }

  // 4. Initial exploration phase (first ~30% of operations) should be excluded
  if (isInitialExplorationPhase(operationIndex, allOperations.length)) {
    if (name === 'Read') {
      return true; // AI feedback: "Legitimate project exploration - reading files to understand system"
    }
  }

  // 5. Successful operations (especially with different files) show progress
  if (pattern.output && !pattern.output.includes('error') && !pattern.output.includes('Error')) {
    // If same tool succeeds on different inputs nearby, it's methodical work
    const nearbyOps = allOperations.slice(Math.max(0, operationIndex - 3), operationIndex + 4);
    const sameToolDifferentInputs = nearbyOps.filter(op => 
      op.name === name && 
      op.status === 'success' && 
      !isEqual(op.input, input)
    );
    
    if (sameToolDifferentInputs.length > 0) {
      return true; // Methodical exploration of different targets
    }
  }

  // 6. If there's evidence of forward progress in the session, be lenient
  if (showsOverallProgress(allOperations)) {
    // Don't flag simple repeats if the session overall shows progress
    return operationIndex < allOperations.length * 0.8; // Allow repeats in first 80% if progress evident
  }

  return false; // This pattern should be flagged as potential stagnation
}

/**
 * Checks if an operation is in the initial exploration phase.
 * @param {number} operationIndex - Index of the operation
 * @param {number} totalOperations - Total number of operations
 * @returns {boolean} True if in initial exploration phase
 */
function isInitialExplorationPhase(operationIndex, totalOperations) {
  return operationIndex < totalOperations * 0.3; // First 30% of session
}

/**
 * Checks if the session shows overall forward progress indicators.
 * @param {Array} allOperations - All tool operations in session
 * @returns {boolean} True if session shows progress indicators
 */
function showsOverallProgress(allOperations) {
  // Look for progress indicators: commits, successful builds, file changes
  const progressIndicators = allOperations.filter(op => {
    if (op.name === 'Bash' && op.status === 'success') {
      const cmd = op.input?.command || '';
      if (cmd.includes('git commit') || cmd.includes('git push') || cmd.includes('npm run build')) {
        return true;
      }
    }
    
    if (['Edit', 'Write', 'MultiEdit'].includes(op.name) && op.status === 'success') {
      return true; // File modifications show progress
    }
    
    return false;
  });

  return progressIndicators.length > 0;
}