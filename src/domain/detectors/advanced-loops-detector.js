import isEqual from 'lodash-es/isEqual.js';

/**
 * Detects problematic advanced debugging loops where the same sequence of tools is called consecutively.
 * Now context-aware to avoid flagging productive exploration and systematic investigation.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected loop patterns.
 */
export function detectAdvancedLoops(session) {
  const loops = [];
  if (!session || !session.toolOperations || session.toolOperations.length < 4) {
    return loops;
  }

  const toolCalls = session.toolOperations.map((op, index) => ({
    name: op.name,
    input: op.input,
    status: op.status,
    originalIndex: index,
  }));

  // First, detect all potential loops
  const potentialLoops = [];

  // Iterate through all possible sequence lengths.
  for (let length = 2; length <= Math.floor(toolCalls.length / 2); length++) {
    // Iterate through all possible starting points for a sequence.
    for (let i = 0; i <= toolCalls.length - 2 * length; i++) {
      const sequence = toolCalls.slice(i, i + length);
      const nextSequence = toolCalls.slice(i + length, i + 2 * length);

      if (isEqual(sequence.map(s => ({ name: s.name, input: s.input })), 
                   nextSequence.map(s => ({ name: s.name, input: s.input })))) {
        let count = 2;
        let lookaheadIndex = i + 2 * length;
        // Look ahead to see how many times the sequence repeats.
        while (lookaheadIndex + length <= toolCalls.length) {
          const followingSequence = toolCalls.slice(lookaheadIndex, lookaheadIndex + length);
          if (isEqual(sequence.map(s => ({ name: s.name, input: s.input })),
                     followingSequence.map(s => ({ name: s.name, input: s.input })))) {
            count++;
            lookaheadIndex += length;
          } else {
            break;
          }
        }

        potentialLoops.push({
          toolSequence: sequence.map(s => s.name),
          sequence: sequence,
          count,
          startIndex: i,
          endIndex: i + count * length - 1,
          length: length,
        });

        i += count * length - 1; // Move past the detected loop to avoid overlapping loops.
      }
    }
  }

  // Filter out productive sequences that shouldn't be flagged as problematic loops
  const problematicLoops = potentialLoops.filter(loop => {
    return !isProductiveSequence(loop, session.toolOperations);
  });

  return problematicLoops.map(loop => ({
    toolSequence: loop.toolSequence,
    count: loop.count,
    startIndex: loop.startIndex,
    endIndex: loop.endIndex,
  }));
}

/**
 * Determines if a detected loop sequence represents productive work rather than problematic repetition.
 * Based on AI feedback about common false positives in advanced loops detection.
 * @param {object} loop - The detected loop pattern
 * @param {Array} allOperations - All tool operations in the session
 * @returns {boolean} True if sequence is productive (should not be flagged as problem)
 */
function isProductiveSequence(loop, allOperations) {
  const { sequence, count, _startIndex, _endIndex } = loop;

  // 1. TodoWrite sequences almost always represent legitimate progress tracking
  const hasProgressTracking = sequence.some(op => op.name === 'TodoWrite');
  if (hasProgressTracking) {
    return true; // AI feedback: "TodoWrite operations reflect legitimate progress tracking, not redundancy"
  }

  // 2. Systematic file exploration patterns are productive
  if (isSystematicExploration(sequence, allOperations)) {
    return true; // AI feedback: "systematic API endpoint examination - structured investigation"
  }

  // 3. Related file reading patterns (cross-referencing) are productive
  if (isRelatedFileExploration(sequence)) {
    return true; // AI feedback: "reading multiple related files are productive exploration, not loops"
  }

  // 4. Short sequences (2-3 length) with low repeat count in productive sessions
  if (sequence.length <= 3 && count <= 2 && showsSessionProgress(allOperations)) {
    return true; // Be lenient on short sequences in productive sessions
  }

  // 5. Check for failure vs success patterns - only flag if there's circular failure
  if (!hasCircularFailure(sequence, count)) {
    return true; // No clear failure pattern means it's likely productive work
  }

  // If we get here, it's likely a genuine problematic loop
  return false;
}

/**
 * Checks if the sequence represents systematic exploration of related components.
 * @param {Array} sequence - The sequence of operations 
 * @param {Array} allOperations - All operations in session
 * @returns {boolean} True if this is systematic exploration
 */
function isSystematicExploration(sequence, _allOperations) {
  // Look for patterns like reading related files in same directory or component family
  const readOperations = sequence.filter(op => op.name === 'Read');
  if (readOperations.length < 2) return false;

  const filePaths = readOperations
    .map(op => op.input?.file_path)
    .filter(path => path);

  if (filePaths.length < 2) return false;

  // Check if files are in same directory or related (e.g., routes/, components/, etc.)
  const directories = filePaths.map(path => path.split('/').slice(0, -1).join('/'));
  const uniqueDirs = new Set(directories);
  
  // If all files are in same directory or very few directories, likely systematic exploration
  if (uniqueDirs.size <= 2) {
    return true;
  }

  // Check for related component names (e.g., analysis.js, dashboard.js, sessions.js)
  const baseNames = filePaths.map(path => path.split('/').pop());
  const hasRelatedNames = baseNames.some(name => 
    baseNames.some(other => other !== name && areRelatedComponents(name, other))
  );

  return hasRelatedNames;
}

/**
 * Checks if sequence involves reading related files (cross-referencing).
 * @param {Array} sequence - The sequence of operations
 * @returns {boolean} True if this is related file exploration
 */
function isRelatedFileExploration(sequence) {
  const readOps = sequence.filter(op => op.name === 'Read');
  if (readOps.length < 2) return false;

  const filePaths = readOps
    .map(op => op.input?.file_path)
    .filter(path => path);

  // Check if reading same or related files repeatedly (cross-referencing pattern)
  const uniqueFiles = new Set(filePaths);
  
  // If reading between 2-4 related files repeatedly, it's likely productive cross-referencing
  return uniqueFiles.size >= 2 && uniqueFiles.size <= 4 && filePaths.length >= 4;
}

/**
 * Checks if the sequence has circular failure patterns that indicate genuine problems.
 * @param {Array} sequence - The sequence of operations
 * @param {number} count - How many times the sequence repeated
 * @returns {boolean} True if there are clear failure patterns
 */
function hasCircularFailure(sequence, count) {
  // Look for error patterns in the sequence
  const errorRate = sequence.filter(op => op.status === 'error').length / sequence.length;
  
  // If there are errors in the sequence and it repeats multiple times, it's likely problematic
  // Lower thresholds to catch genuine issues while being more lenient than before
  return (errorRate > 0.3 && count >= 3) || (errorRate > 0.5 && count >= 2);
}

/**
 * Checks if components are related by naming patterns.
 * @param {string} name1 - First component name
 * @param {string} name2 - Second component name  
 * @returns {boolean} True if components appear related
 */
function areRelatedComponents(name1, name2) {
  // Remove extensions
  const base1 = name1.replace(/\.[^.]+$/, '');
  const base2 = name2.replace(/\.[^.]+$/, '');
  
  // Check for common API/component patterns
  const apiPatterns = ['routes', 'api', 'controller', 'service', 'model'];
  const componentPatterns = ['component', 'page', 'view', 'layout'];
  
  const hasApiPattern = apiPatterns.some(pattern => 
    base1.toLowerCase().includes(pattern) && base2.toLowerCase().includes(pattern)
  );
  
  const hasComponentPattern = componentPatterns.some(pattern =>
    base1.toLowerCase().includes(pattern) && base2.toLowerCase().includes(pattern)
  );
  
  return hasApiPattern || hasComponentPattern;
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
      if (cmd.includes('git commit') || cmd.includes('git push') || cmd.includes('npm run build') || cmd.includes('npm test')) {
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