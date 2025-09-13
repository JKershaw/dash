/**
 * Detects excessive file reading without meaningful action (reading spirals).
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected reading spiral patterns.
 */
export function detectReadingSpirals(session) {
  if (!session || !session.toolOperations || session.toolOperations.length < 5) {
    return [];
  }

  // Filter to autonomous operations only
  const autonomousOperations = session.toolOperations.filter(op => 
    !op._contextMetadata || op._contextMetadata.initiationType !== 'user_directed'
  );

  const reads = autonomousOperations.filter(op => op.name === 'Read');
  const actions = autonomousOperations.filter(op =>
    ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(op.name)
  );

  // Add context awareness to the detection logic
  const userDirectedReads = session.toolOperations.filter(op => 
    op.name === 'Read' && op._contextMetadata?.initiationType === 'user_directed'
  ).length;

  // If most reads were user-directed, adjust thresholds
  const readActionRatio = reads.length / Math.max(actions.length, 1);
  const adjustedRatio = userDirectedReads > 5 ? readActionRatio * 1.5 : readActionRatio; // Be more lenient

  // Detect reading spiral: > 10 reads with < 3 actions, or ratio > 5:1
  // Use adjusted ratio that accounts for user-directed reading
  if (reads.length > 10 && (actions.length < 3 || adjustedRatio > 5)) {
    return [
      {
        type: 'reading_spiral',
        readCount: reads.length,
        actionCount: actions.length,
        ratio: Math.round(adjustedRatio * 10) / 10,
        uniqueFiles: new Set(reads.map(r => r.input?.file_path).filter(Boolean)).size,
        _provenance: {
          patternType: 'reading_spiral',
          detectionTimestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          sourceFile: session._provenance?.sourceFile,
          confidenceLevel: adjustedRatio > 10 ? 'high' : 'medium',
        },
      },
    ];
  }

  return [];
}