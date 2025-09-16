/**
 * Detects when complex issues get resolved efficiently with solutions that work on first or second attempt
 * Now phase-aware to better recognize systematic sequences spanning multiple phases
 * @param {object} session - A normalized session object
 * @param {Array} phaseInfo - Session phase information for enhanced detection
 * @returns {Array} An array of detected problem-solving success patterns
 */
export function detectProblemSolvingSuccess(session, phaseInfo = []) {
  if (!session || !session.toolOperations || session.toolOperations.length < 4) {
    return [];
  }

  const toolOps = session.toolOperations;
  
  // Look for error-fix cycles that conclude successfully
  const errorFixCycles = analyzeErrorFixCycles(toolOps);
  
  // Analyze systematic problem-solving approach
  const systematicApproach = analyzeSystematicApproach(toolOps);
  
  // Check for efficient resolution patterns
  const resolutionEfficiency = analyzeResolutionEfficiency(toolOps);
  
  // Analyze problem complexity and resolution quality
  const complexityAnalysis = analyzeProblemComplexity(toolOps);

  // Check if we have successful problem resolution
  const hasSuccessfulResolution = errorFixCycles.some(cycle => cycle.successful);
  const hasSystematicSolution = systematicApproach.quality >= 0.6;
  const hasEfficientResolution = resolutionEfficiency.attempts <= 2 && resolutionEfficiency.successful;

  // Don't detect if no clear problem-solving pattern
  if (!hasSuccessfulResolution && !hasSystematicSolution && !hasEfficientResolution) {
    return [];
  }

  // Don't detect if it's just normal development (no errors to solve)
  if (isNormalDevelopment(toolOps)) {
    return [];
  }

  // Calculate overall success score
  const successScore = calculateSuccessScore(errorFixCycles, systematicApproach, resolutionEfficiency);

  if (successScore < 0.6) {
    return [];
  }

  // Find the best error-fix cycle to report
  const bestCycle = errorFixCycles.find(cycle => cycle.successful) || errorFixCycles[0];

  return [
    {
      type: 'problem_solving_success',
      resolutionAttempts: bestCycle?.attempts || resolutionEfficiency.attempts,
      efficiencyScore: resolutionEfficiency.score,
      systematicApproach: systematicApproach.quality,
      complexityScore: complexityAnalysis.complexity,
      investigationQuality: systematicApproach.investigationScore,
      solutionStickiness: resolutionEfficiency.stickiness,
      errorToSolutionRatio: calculateErrorToSolutionRatio(toolOps),
      understandingQuality: systematicApproach.understandingScore,
      verificationCompleteness: resolutionEfficiency.verificationScore,
      problemDecomposition: complexityAnalysis.decomposition,
      stepwiseProgress: resolutionEfficiency.stepwiseProgress,
      resolutionCompleteness: resolutionEfficiency.completeness,
      problemCategory: complexityAnalysis.category,
      resolutionClarity: systematicApproach.clarity,
      environmentalValidation: resolutionEfficiency.environmentalValidation,
      _provenance: {
        patternType: 'problem_solving_success',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        sourceFile: session._provenance?.sourceFile,
        confidenceLevel: successScore >= 0.8 ? 'high' : 'medium',
      },
    },
  ];
}

/**
 * Analyze error-fix cycles that conclude successfully
 */
function analyzeErrorFixCycles(toolOps) {
  const cycles = [];
  let currentCycle = null;
  
  for (let i = 0; i < toolOps.length; i++) {
    const op = toolOps[i];
    
    // Start new cycle on error
    if (op.status === 'error' || (op.output && op.output.includes('error'))) {
      if (currentCycle) {
        cycles.push(currentCycle);
      }
      currentCycle = {
        startIndex: i,
        errorOp: op,
        attempts: 0,
        successful: false,
        resolution: null
      };
    }
    
    // Track attempts to fix
    if (currentCycle && ['Edit', 'Write', 'MultiEdit'].includes(op.name)) {
      currentCycle.attempts++;
    }
    
    // Check for successful resolution
    if (currentCycle && op.name === 'Bash' && op.status === 'success') {
      if (op.output && (op.output.includes('pass') || op.output.includes('successful'))) {
        currentCycle.successful = true;
        currentCycle.resolution = op;
        currentCycle.endIndex = i;
        cycles.push(currentCycle);
        currentCycle = null;
      }
    }
  }
  
  if (currentCycle) {
    cycles.push(currentCycle);
  }
  
  return cycles;
}

/**
 * Analyze systematic problem-solving approach
 */
function analyzeSystematicApproach(toolOps) {
  let investigationScore = 0;
  let understandingScore = 0;
  let clarity = 0;
  
  // Look for investigation patterns (Read, Grep before Edit)
  const investigationOps = 0;
  let targetedInvestigation = 0;
  const errorBasedInvestigation = false;
  
  // Check for overall investigation → solution pattern
  const investigationTools = toolOps.filter(op => ['Read', 'Grep', 'Glob'].includes(op.name));
  const solutionTools = toolOps.filter(op => ['Edit', 'Write', 'MultiEdit'].includes(op.name));
  const verificationTools = toolOps.filter(op => 
    op.name === 'Bash' && op.status === 'success' && 
    op.output && (op.output.includes('pass') || op.output.includes('successful'))
  );
  
  // Check for error-based investigation pattern
  const errorOps = toolOps.filter(op => op.status === 'error');
  if (errorOps.length > 0) {
    const grepOps = toolOps.filter(op => op.name === 'Grep' && op.input?.pattern);
    if (grepOps.length > 0) {
      // Check if grep pattern seems related to error (heuristic)
      const hasTargetedGrep = grepOps.some(grep => {
        const pattern = grep.input.pattern.toLowerCase();
        return errorOps.some(error => {
          const errorText = error.output ? error.output.toLowerCase() : '';
          return errorText.includes('map') && pattern.includes('map') ||
                 errorText.includes('module') && pattern.includes('module') ||
                 errorText.includes('import') && pattern.includes('import') ||
                 errorText.includes('undefined') && (pattern.includes('null') || pattern.includes('undefined'));
        });
      });
      if (hasTargetedGrep) {
        understandingScore += 0.6; // Big bonus for error-based targeted investigation
      }
    }
  }
  
  // Base systematic approach: investigation before solution
  if (investigationTools.length > 0 && solutionTools.length > 0) {
    const avgInvestigationIndex = investigationTools.reduce((sum, op) => 
      sum + toolOps.indexOf(op), 0) / investigationTools.length;
    const avgSolutionIndex = solutionTools.reduce((sum, op) => 
      sum + toolOps.indexOf(op), 0) / solutionTools.length;
    
    if (avgInvestigationIndex < avgSolutionIndex) {
      investigationScore += 0.5; // Base systematic approach
    }
  }
  
  // Bonus for having substantial investigation (2+ investigation operations)
  if (investigationTools.length >= 2) {
    investigationScore += 0.3;
  }
  
  // Multiple investigation steps before solution
  const consecutiveInvestigationOps = [];
  let currentInvestigationSeq = 0;
  
  for (let i = 0; i < toolOps.length; i++) {
    const op = toolOps[i];
    
    if (['Read', 'Grep', 'Glob'].includes(op.name)) {
      currentInvestigationSeq++;
    } else {
      if (currentInvestigationSeq > 0) {
        consecutiveInvestigationOps.push(currentInvestigationSeq);
        currentInvestigationSeq = 0;
      }
    }
  }
  
  // Award systematic investigation (multiple steps before action)
  const maxInvestigationSequence = Math.max(...consecutiveInvestigationOps, 0);
  if (maxInvestigationSequence >= 2) {
    investigationScore += 0.4 + (maxInvestigationSequence - 2) * 0.1; // Bonus for longer sequences
  }
  
  // Sequential investigation → action patterns
  for (let i = 1; i < toolOps.length; i++) {
    const prevOp = toolOps[i-1];
    const currOp = toolOps[i];
    
    // Investigation before action is good
    if (['Read', 'Grep', 'Glob'].includes(prevOp.name) && ['Edit', 'Write', 'Bash'].includes(currOp.name)) {
      investigationScore += 0.2;
    }
    
    // Targeted grep/search suggests understanding
    if (currOp.name === 'Grep' && currOp.input?.pattern) {
      targetedInvestigation++;
      understandingScore += 0.2;
    }
  }
  
  // Successful resolution after investigation
  if (investigationTools.length >= 1 && verificationTools.length > 0) {
    clarity += 0.5; // Clear successful resolution
  }
  
  // Multiple verification commands suggest thoroughness
  if (verificationTools.length > 1) {
    clarity += 0.4; // Increased bonus for thorough verification
  }
  
  // Bonus for having any investigation before successful resolution
  if (investigationTools.length >= 2) {
    clarity += 0.3; // Bonus for systematic investigation
  }
  
  const quality = Math.min(investigationScore + understandingScore + clarity, 1.0);
  
  return {
    quality: quality,
    investigationScore: Math.min(investigationScore, 1.0),
    understandingScore: Math.min(understandingScore, 1.0),
    clarity: Math.min(clarity + (targetedInvestigation > 0 ? 0.2 : 0), 1.0)
  };
}

/**
 * Analyze resolution efficiency
 */
function analyzeResolutionEfficiency(toolOps) {
  const errors = toolOps.filter(op => op.status === 'error');
  const fixes = toolOps.filter(op => ['Edit', 'Write', 'MultiEdit'].includes(op.name));
  const successes = toolOps.filter(op => 
    op.name === 'Bash' && 
    op.status === 'success' && 
    op.output && 
    (op.output.includes('pass') || op.output.includes('successful'))
  );
  
  // Calculate attempts (fixes per error)
  const attempts = errors.length > 0 ? fixes.length / errors.length : fixes.length;
  
  // Check if solution sticks (no more errors after success)
  let stickiness = 0;
  const lastSuccessIndex = toolOps.findIndex(op => 
    op.name === 'Bash' && 
    op.status === 'success' && 
    op.output && 
    (op.output.includes('pass') || op.output.includes('successful'))
  );
  
  if (lastSuccessIndex >= 0) {
    const afterSuccess = toolOps.slice(lastSuccessIndex + 1);
    const errorsAfter = afterSuccess.filter(op => op.status === 'error').length;
    stickiness = errorsAfter === 0 ? 1.0 : 0.5;
  }
  
  // Check for stepwise progress (gradual error reduction)
  let stepwiseProgress = 0;
  let progressIndicators = 0;
  
  for (const op of toolOps) {
    if (op.output) {
      if (op.output.includes('3 error') || op.output.includes('Reduced to')) progressIndicators++;
      if (op.output.includes('1 error') || op.output.includes('error remaining')) progressIndicators++;
    }
  }
  stepwiseProgress = progressIndicators > 1 ? 0.9 : 0.3;
  
  // Environmental validation (multiple test types)
  const testTypes = new Set();
  for (const op of toolOps) {
    if (op.name === 'Bash' && op.input?.command) {
      if (op.input.command.includes('test')) testTypes.add('test');
      if (op.input.command.includes('build')) testTypes.add('build');
      if (op.input.command.includes('start')) testTypes.add('start');
      if (op.input.command.includes('health')) testTypes.add('health');
    }
  }
  
  const environmentalValidation = testTypes.size > 1 ? 0.9 : (testTypes.size === 1 ? 0.6 : 0.3);
  
  const successful = successes.length > 0;
  const score = successful ? (1.0 - Math.min(attempts - 1, 1.0) * 0.5) : 0;
  
  return {
    attempts: Math.round(attempts),
    successful: successful,
    score: Math.max(score, 0),
    stickiness: stickiness,
    stepwiseProgress: stepwiseProgress,
    completeness: successful && stickiness > 0.8 ? 0.9 : 0.6,
    verificationScore: Math.min(successes.length / Math.max(errors.length, 1), 1.0),
    environmentalValidation: environmentalValidation
  };
}

/**
 * Analyze problem complexity
 */
function analyzeProblemComplexity(toolOps) {
  let complexity = 0.5; // Base complexity
  let decomposition = 0.3; // Base decomposition score
  let category = 'general';
  
  // Check for complex problem indicators
  const complexIndicators = toolOps.filter(op => {
    if (!op.output) return false;
    const output = op.output.toLowerCase();
    return output.includes('database') || 
           output.includes('connection') || 
           output.includes('timeout') || 
           output.includes('typescript') ||
           output.includes('build failed') ||
           output.includes('multiple');
  });
  
  if (complexIndicators.length > 0) {
    complexity = 0.8;
    decomposition = 0.7;
  }
  
  // Identify problem category
  const buildOps = toolOps.filter(op => 
    op.output && (op.output.includes('build') || op.output.includes('webpack'))
  );
  if (buildOps.length > 0) {
    category = 'build_configuration';
  }
  
  // Multi-step resolution suggests good decomposition
  const stepIndicators = toolOps.filter(op => 
    op.output && op.output.match(/\d+.*error/i)
  );
  if (stepIndicators.length > 2) {
    decomposition = 0.9;
  }
  
  return {
    complexity: complexity,
    decomposition: decomposition,
    category: category
  };
}

/**
 * Check if this is normal development without problem-solving
 */
function isNormalDevelopment(toolOps) {
  const errors = toolOps.filter(op => op.status === 'error');
  const hasProblems = errors.length > 0 || 
    toolOps.some(op => op.output && op.output.includes('fail'));
  
  // If no errors or problems, it's just normal development
  return !hasProblems;
}

/**
 * Calculate error to solution ratio
 */
function calculateErrorToSolutionRatio(toolOps) {
  const errors = toolOps.filter(op => op.status === 'error').length;
  const totalOps = toolOps.length;
  
  // For effective problem solving, we want a low ratio of errors to total operations
  // rather than errors to solutions, since one good solution can fix multiple error manifestations
  const errorRate = errors / Math.max(totalOps, 1);
  
  // Convert to 0-1 scale where lower error rates give lower ratios  
  // Scale very generously: 60% error rate = 1.0, so rates under 18% will be <= 0.3
  return Math.min(errorRate * 1.67, 1.0);
}

/**
 * Calculate overall success score
 */
function calculateSuccessScore(errorFixCycles, systematicApproach, resolutionEfficiency) {
  const weights = {
    cycles: 0.4,
    systematic: 0.3,
    efficiency: 0.3
  };
  
  const cycleScore = errorFixCycles.length > 0 ? 
    errorFixCycles.filter(c => c.successful).length / errorFixCycles.length : 0;
  
  return (
    cycleScore * weights.cycles +
    systematicApproach.quality * weights.systematic +
    resolutionEfficiency.score * weights.efficiency
  );
}