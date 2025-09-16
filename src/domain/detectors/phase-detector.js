/**
 * Detects session phases using tool operation pattern analysis.
 * Provides context to reduce false positives in other detectors.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected phase objects with type, range, and confidence.
 */
export function detectSessionPhases(session) {
  if (!session || !session.toolOperations || session.toolOperations.length === 0) {
    return [];
  }

  const operations = session.toolOperations;
  const windowSize = Math.max(3, Math.min(8, Math.ceil(operations.length / 4))); // Adaptive window size
  const phases = [];

  // Slide window over operations to classify segments
  for (let i = 0; i < operations.length; i += Math.max(1, Math.floor(windowSize / 2))) {
    const windowEnd = Math.min(i + windowSize, operations.length);
    const window = operations.slice(i, windowEnd);
    
    if (window.length === 0) break;

    const classification = classifyWindow(window);
    
    phases.push({
      type: classification.type,
      startIndex: i,
      endIndex: windowEnd - 1,
      confidence: classification.confidence,
      signals: classification.signals,
      _provenance: {
        patternType: 'session_phase',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        sourceFile: session._provenance?.sourceFile,
        confidenceLevel: classification.confidence >= 0.7 ? 'high' : classification.confidence >= 0.4 ? 'medium' : 'low',
        windowSize: window.length,
        detectionMethod: 'signal-based'
      }
    });
  }

  // Consolidate adjacent similar phases
  const consolidatedPhases = consolidatePhases(phases);
  
  return consolidatedPhases;
}

/**
 * Classifies a window of operations into a phase type.
 * @param {Array} operations - Window of tool operations to classify
 * @returns {Object} Classification with type, confidence, and signals
 */
function classifyWindow(operations) {
  if (!operations || operations.length === 0) {
    return { type: 'unknown', confidence: 0, signals: {} };
  }

  // Count tool types and patterns
  const toolCounts = {};
  const signals = {
    readOperations: 0,
    searchOperations: 0, 
    editOperations: 0,
    testOperations: 0,
    buildOperations: 0,
    explorationPatterns: 0,
    implementationPatterns: 0,
    testingPatterns: 0
  };

  operations.forEach(op => {
    toolCounts[op.name] = (toolCounts[op.name] || 0) + 1;
    
    // Count exploration signals
    if (['Read', 'Grep', 'Glob'].includes(op.name)) {
      signals.readOperations++;
      signals.explorationPatterns++;
    }
    
    if (op.name === 'Grep' || op.name === 'Glob') {
      signals.searchOperations++;
      signals.explorationPatterns++;
    }
    
    // Count implementation signals
    if (['Edit', 'Write', 'MultiEdit'].includes(op.name)) {
      signals.editOperations++;
      signals.implementationPatterns++;
    }
    
    // Count testing signals
    if (op.name === 'Bash') {
      const command = op.input?.command || '';
      if (command.includes('test') || command.includes('build') || command.includes('npm run')) {
        signals.testOperations++;
        signals.testingPatterns++;
      }
      if (command.includes('build') || command.includes('compile')) {
        signals.buildOperations++;
        signals.testingPatterns++;
      }
    }
  });

  // Calculate phase scores based on signal strength
  const totalOps = operations.length;
  const explorationScore = (signals.explorationPatterns / totalOps) * 1.2; // Slight boost for exploration
  const implementationScore = (signals.implementationPatterns / totalOps) * 1.1; // Boost for implementation
  const testingScore = (signals.testingPatterns / totalOps) * 1.0;

  // Determine dominant phase
  const scores = {
    exploration: explorationScore,
    implementation: implementationScore,  
    testing: testingScore
  };

  const maxScore = Math.max(...Object.values(scores));
  const dominantPhase = Object.keys(scores).find(phase => scores[phase] === maxScore);

  // Calculate confidence based on score strength and signal clarity
  let confidence = maxScore;
  
  // Boost confidence for clear patterns
  if (signals.explorationPatterns >= 3 && signals.editOperations === 0) {
    confidence = Math.min(0.9, confidence + 0.2); // Clear exploration
  } else if (signals.editOperations >= 2 && signals.searchOperations <= 1) {
    confidence = Math.min(0.9, confidence + 0.15); // Clear implementation
  } else if (signals.testOperations >= 1 && totalOps <= 5) {
    confidence = Math.min(0.8, confidence + 0.1); // Clear testing
  }

  // Reduce confidence for mixed signals
  const signalTypes = [signals.explorationPatterns, signals.implementationPatterns, signals.testingPatterns]
    .filter(count => count > 0).length;
  if (signalTypes >= 3) {
    confidence *= 0.7; // Mixed signals reduce confidence
  }

  // Determine final phase type
  let phaseType = dominantPhase;
  if (confidence < 0.3 || maxScore < 0.2) {
    phaseType = signalTypes >= 2 ? 'mixed' : 'unknown';
    confidence = Math.max(0.1, confidence);
  }

  return {
    type: phaseType,
    confidence: Math.min(1.0, confidence),
    signals
  };
}

/**
 * Consolidates adjacent phases of the same type to reduce fragmentation.
 * @param {Array} phases - Array of detected phase segments
 * @returns {Array} Consolidated phases
 */
function consolidatePhases(phases) {
  if (phases.length <= 1) return phases;

  const consolidated = [];
  let currentPhase = { ...phases[0] };

  for (let i = 1; i < phases.length; i++) {
    const nextPhase = phases[i];
    
    // Merge if same type and adjacent/overlapping
    if (currentPhase.type === nextPhase.type && 
        nextPhase.startIndex <= currentPhase.endIndex + 2) { // Allow small gaps
      
      currentPhase.endIndex = nextPhase.endIndex;
      
      // Average confidence weighted by phase length
      const currentLength = currentPhase.endIndex - currentPhase.startIndex + 1;
      const nextLength = nextPhase.endIndex - nextPhase.startIndex + 1;
      const totalLength = currentLength + nextLength;
      
      currentPhase.confidence = (
        (currentPhase.confidence * currentLength) + 
        (nextPhase.confidence * nextLength)
      ) / totalLength;
      
      // Merge signals
      Object.keys(currentPhase.signals).forEach(key => {
        if (typeof currentPhase.signals[key] === 'number' && typeof nextPhase.signals[key] === 'number') {
          currentPhase.signals[key] += nextPhase.signals[key];
        }
      });
      
    } else {
      // Different type or non-adjacent, start new phase
      consolidated.push(currentPhase);
      currentPhase = { ...nextPhase };
    }
  }
  
  consolidated.push(currentPhase);
  
  return consolidated;
}