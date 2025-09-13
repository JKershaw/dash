/**
 * Detects shotgun debugging patterns (many different tools used rapidly).
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected shotgun debugging patterns.
 */
export function detectShotgunDebugging(session) {
  if (!session || !session.toolOperations || session.toolOperations.length < 15) {
    return [];
  }

  // Filter out user-directed operations to focus on autonomous patterns
  const autonomousOperations = session.toolOperations.filter(op => 
    !op._contextMetadata || op._contextMetadata.initiationType !== 'user_directed'
  );
  
  // If most operations were user-directed, this isn't shotgun debugging
  if (autonomousOperations.length < 10) {
    return [];
  }
  
  // Use autonomous operations for analysis
  const toolVariety = new Set(autonomousOperations.map(op => op.name)).size;
  const totalTools = autonomousOperations.length;
  const durationMinutes = (session.durationSeconds || 0) / 60;

  // Shotgun debugging: high tool variety + high velocity + short bursts
  const diversityRatio = toolVariety / totalTools;
  const toolVelocity = totalTools / Math.max(durationMinutes, 1);

  if (
    toolVariety >= 6 &&
    totalTools >= 15 &&
    (toolVelocity > 3 || (diversityRatio > 0.4 && durationMinutes < 30))
  ) {
    return [
      {
        type: 'shotgun_debugging',
        toolVariety,
        totalTools,
        durationMinutes: Math.round(durationMinutes * 10) / 10,
        diversityRatio: Math.round(diversityRatio * 100) / 100,
        toolVelocity: Math.round(toolVelocity * 10) / 10,
        _provenance: {
          patternType: 'shotgun_debugging',
          detectionTimestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          sourceFile: session._provenance?.sourceFile,
          confidenceLevel: toolVelocity > 5 ? 'high' : 'medium',
        },
      },
    ];
  }

  return [];
}