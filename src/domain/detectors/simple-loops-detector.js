import isEqual from 'lodash-es/isEqual.js';

/**
 * Detects problematic simple debugging loops where the same tool is called consecutively
 * with the same parameters. Now context-aware to avoid flagging productive patterns.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected loop patterns with provenance.
 */
export function detectSimpleLoops(session) {
  const loops = [];
  if (!session || !session.toolOperations || session.toolOperations.length < 2) {
    return loops;
  }

  // First, detect all potential loops
  const potentialLoops = [];
  let currentLoop = null;

  for (let i = 1; i < session.toolOperations.length; i++) {
    const prevTool = session.toolOperations[i - 1];
    const currentTool = session.toolOperations[i];

    // A simple loop is defined as the same tool being called with the same input.
    if (prevTool.name === currentTool.name && isEqual(prevTool.input, currentTool.input)) {
      if (currentLoop) {
        currentLoop.count++;
        currentLoop.endIndex = i;
        currentLoop.toolOperationIndices.push(i);
      } else {
        currentLoop = {
          name: prevTool.name,
          input: prevTool.input,
          count: 2,
          startIndex: i - 1,
          endIndex: i,
          toolOperationIndices: [i - 1, i],
          // Provenance tracking
          _provenance: {
            patternType: 'simple_loop',
            detectionTimestamp: new Date().toISOString(),
            sessionId: session.sessionId,
            sourceFile: session._provenance?.sourceFile,
            confidenceLevel: 'high', // Will be adjusted based on context
          },
        };
      }
    } else {
      if (currentLoop) {
        // Add final metadata to completed loop
        currentLoop._provenance.duration = {
          toolOperationSpan: currentLoop.endIndex - currentLoop.startIndex + 1,
          repeatCount: currentLoop.count,
        };
        potentialLoops.push(currentLoop);
        currentLoop = null;
      }
    }
  }

  // Add the last loop if the session ends with one.
  if (currentLoop) {
    currentLoop._provenance.duration = {
      toolOperationSpan: currentLoop.endIndex - currentLoop.startIndex + 1,
      repeatCount: currentLoop.count,
    };
    potentialLoops.push(currentLoop);
  }

  // Filter out productive loops that shouldn't be flagged as problems
  const problematicLoops = potentialLoops.filter(loop => {
    return !isProductiveLoop(loop, session.toolOperations);
  });

  return problematicLoops;
}

/**
 * Determines if a detected loop represents productive work rather than problematic repetition.
 * Based on AI feedback about common false positives in simple loops detection.
 * @param {object} loop - The detected loop pattern
 * @param {Array} allOperations - All tool operations in the session
 * @returns {boolean} True if loop is productive (should not be flagged as problem)
 */
function isProductiveLoop(loop, allOperations) {
  const { name, startIndex, endIndex, count } = loop;

  // Enhanced logic based on AI feedback: "if same tool has significantly different inputs or outputs, don't flag as loop"
  // Check for input/output diversity in operations even when they share the same tool and basic inputs
  if (name === 'Grep') {
    const loopOps = allOperations.slice(startIndex, endIndex + 1);
    
    // Check for output diversity - different results indicate productive exploration
    const uniqueOutputs = new Set(loopOps.map(op => op.output?.trim() || 'no-output'));
    const outputDiversityRatio = uniqueOutputs.size / loopOps.length;
    
    // If 70%+ of outputs are different, this is productive exploration
    if (outputDiversityRatio >= 0.7) {
      return true; // Don't flag as problematic loop
    }
    
    // Also check for input pattern diversity (different search terms within same tool)
    const patterns = loopOps.map(op => op.input?.pattern || op.input?.query || 'no-pattern');
    const uniquePatterns = new Set(patterns);
    const patternDiversityRatio = uniquePatterns.size / loopOps.length;
    
    // AI feedback: "systematic investigation of large report file with different search criteria"
    if (patternDiversityRatio >= 0.7) {
      return true; // Don't flag different search patterns as problematic
    }
  }

  // 1. Edit loops need semantic context analysis (based on enhanced LLM-TDD feedback)
  if (name === 'Edit') {
    // Enhanced LLM-TDD Fix: "Add file context awareness for Edit sequences"
    // "Root Cause: only counts tool frequency without considering file targets or semantic context"
    
    // Get the actual Edit operations from the loop
    const loopOps = allOperations.slice(startIndex, endIndex + 1);
    
    // Check if operations have different semantic purposes based on outputs
    const hasSemanticDiversity = loopOps.some((op, index) => {
      if (index === 0) return false; // Skip first operation
      
      const prevOp = loopOps[index - 1];
      const currentOp = op;
      
      // Different file targets indicate coordinated multi-file work
      const prevFile = extractFilenameFromOutput(prevOp.output);
      const currentFile = extractFilenameFromOutput(currentOp.output);
      
      if (prevFile && currentFile && prevFile !== currentFile) {
        return true; // Different files = coordinated feature implementation
      }
      
      // Different semantic actions in outputs indicate progressive work
      const prevAction = extractSemanticAction(prevOp.output);
      const currentAction = extractSemanticAction(currentOp.output);
      
      if (prevAction && currentAction && prevAction !== currentAction) {
        return true; // Different actions = progressive development
      }
      
      return false;
    });
    
    if (hasSemanticDiversity) {
      return true; // AI feedback: "Sequential edits on different files for coordinated feature is productive"
    }
    
    // Also check if all edits are successful and part of development workflow
    const allSuccessful = loopOps.every(op => op.status === 'success');
    if (allSuccessful && showsSessionProgress(allOperations)) {
      return true; // Successful consecutive edits in productive session are likely coordinated work
    }
  }

  // 2. TodoWrite loops almost always represent progress tracking workflow
  if (name === 'TodoWrite') {
    return true; // AI feedback: "TodoWrite pattern actually shows progress tracking, not struggle"
  }

  // 2. Read loops in development workflow are often productive
  if (name === 'Read') {
    // Check if Read loops are part of development workflow with nearby edits
    const contextWindow = 5; // Look for edits within 5 operations before/after
    const contextStart = Math.max(0, startIndex - contextWindow);
    const contextEnd = Math.min(allOperations.length - 1, endIndex + contextWindow);
    const contextOps = allOperations.slice(contextStart, contextEnd + 1);
    
    // If there are edits in the context, this is likely productive read-verify-edit workflow
    const hasNearbyEdits = contextOps.some(op => 
      ['Edit', 'MultiEdit', 'Write'].includes(op.name)
    );
    
    if (hasNearbyEdits) {
      return true; // AI feedback: "Read/Edit cycles are normal development workflow"
    }

    // Also check if overall session shows progress - be lenient during productive sessions
    if (showsSessionProgress(allOperations) && count < 5) {
      return true; // Short read loops in productive sessions are normal verification
    }
  }

  // 3. Be lenient on short loops (2-3 iterations) if session shows overall progress
  if (count <= 3 && showsSessionProgress(allOperations)) {
    return true; // Short repetitions in productive sessions are often normal workflow
  }

  // 4. Bash/command loops - check if they're error-related
  if (name === 'Bash') {
    // If all operations in loop have errors, it's likely problematic
    const loopOps = allOperations.slice(startIndex, endIndex + 1);
    const errorCount = loopOps.filter(op => op.status === 'error').length;
    
    // If most are errors, it's genuinely problematic
    if (errorCount / loopOps.length >= 0.7) {
      return false; // This is a genuine problem loop
    }
    
    // If successful commands repeated, might be intentional (e.g., testing, deployment)
    return true;
  }

  // 5. Check for exploration vs stagnation
  if (isExplorationPhase(startIndex, endIndex, allOperations.length)) {
    // During exploration, some repetition is normal
    return count < 4; // Allow some exploration repetition, but flag excessive
  }

  // Default: if we get here and count is very high, it's likely problematic
  return count < 4;
}

/**
 * Checks if the session shows overall forward progress indicators.
 * @param {Array} allOperations - All tool operations in session  
 * @returns {boolean} True if session shows progress indicators
 */
function showsSessionProgress(allOperations) {
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

/**
 * Checks if the loop occurs during exploration phase of session.
 * @param {number} startIndex - Loop start index
 * @param {number} endIndex - Loop end index  
 * @param {number} totalOperations - Total operations in session
 * @returns {boolean} True if loop is in exploration phase
 */
function isExplorationPhase(startIndex, endIndex, totalOperations) {
  const loopMidpoint = (startIndex + endIndex) / 2;
  return loopMidpoint < totalOperations * 0.3; // First 30% of session
}

/**
 * Extracts filename from Edit operation output for semantic analysis.
 * @param {string} output - The output text from Edit operation
 * @returns {string|null} Filename if found, null otherwise
 */
function extractFilenameFromOutput(output) {
  if (!output || typeof output !== 'string') return null;
  
  // Common patterns in Edit outputs that indicate file being edited
  const filePatterns = [
    /to (\w+\.\w+)/i,           // "Added alert UI to dashboard.ejs"
    /in (\w+\.\w+)/i,           // "Updated initialization in dashboard.js"
    /(\w+\.\w+)/i               // "dashboard.js"
  ];
  
  for (const pattern of filePatterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Extracts semantic action from Edit operation output for diversity analysis.
 * @param {string} output - The output text from Edit operation  
 * @returns {string|null} Action type if found, null otherwise
 */
function extractSemanticAction(output) {
  if (!output || typeof output !== 'string') return null;
  
  // Common action patterns in Edit outputs
  const actionPatterns = [
    { pattern: /added|created|implementing/i, action: 'add' },
    { pattern: /updated|modified|changed/i, action: 'update' },
    { pattern: /function|method/i, action: 'function' },
    { pattern: /UI|interface|component/i, action: 'ui' },
    { pattern: /initialization|init|setup/i, action: 'init' },
    { pattern: /alert|notification/i, action: 'feature' }
  ];
  
  for (const { pattern, action } of actionPatterns) {
    if (pattern.test(output)) {
      return action;
    }
  }
  
  return null;
}