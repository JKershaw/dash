/**
 * Analyzes struggle trend over time within a long session.
 * Simple approach: split operations into chunks and measure struggle per chunk.
 * @param {object} session - A normalized session object with toolOperations.
 * @returns {object|null} Trend analysis or null if session too short.
 */
export function analyzeStruggleTrend(session) {
  if (!session || !session.toolOperations || session.toolOperations.length < 100) {
    return null; // Need at least 100 operations for meaningful trend analysis
  }

  const CHUNK_SIZE = 50; // Analyze every 50 operations (good balance of granularity vs noise)
  const chunks = [];

  // Split operations into chunks
  for (let i = 0; i < session.toolOperations.length; i += CHUNK_SIZE) {
    chunks.push(session.toolOperations.slice(i, i + CHUNK_SIZE));
  }

  // Calculate struggle metrics per chunk
  const chunkMetrics = chunks.map((chunk, index) => {
    const errors = chunk.filter(op => op.status === 'error').length;
    const errorRate = errors / chunk.length;

    // Count tool switches (rapid tool jumping indicates struggle)
    let switches = 0;
    for (let i = 1; i < chunk.length; i++) {
      if (chunk[i].name !== chunk[i - 1].name) switches++;
    }
    const switchRate = switches / chunk.length;

    // Tool variety (too many different tools = frantic exploration)
    const uniqueTools = new Set(chunk.map(op => op.name)).size;
    const varietyPenalty = uniqueTools > 8 ? 0.5 : 0; // Penalty for high tool variety

    // Simple combined struggle score (higher = more struggle)
    const struggleScore = errorRate * 2 + switchRate * 1 + varietyPenalty;

    return {
      chunkIndex: index,
      operations: chunk.length,
      errorRate,
      switchRate,
      toolVariety: uniqueTools,
      struggleScore,
    };
  });

  // Need at least 3 chunks for trend analysis
  if (chunkMetrics.length < 3) {
    return { trend: 'too_short', chunks: chunkMetrics };
  }

  // Compare first third vs last third (ignore middle fluctuations)
  const firstThird = chunkMetrics.slice(0, Math.floor(chunkMetrics.length / 3));
  const lastThird = chunkMetrics.slice(-Math.floor(chunkMetrics.length / 3));

  const avgFirstThird = firstThird.reduce((sum, m) => sum + m.struggleScore, 0) / firstThird.length;
  const avgLastThird = lastThird.reduce((sum, m) => sum + m.struggleScore, 0) / lastThird.length;

  // Classify trend (with some tolerance to avoid noise)
  let trend;
  if (avgLastThird > avgFirstThird * 1.3) {
    trend = 'degrading'; // Getting significantly worse
  } else if (avgLastThird < avgFirstThird * 0.7) {
    trend = 'improving'; // Getting significantly better
  } else {
    trend = 'steady'; // Consistent work pattern
  }

  return {
    trend,
    chunks: chunkMetrics,
    avgFirstThird,
    avgLastThird,
    changeScore: avgLastThird - avgFirstThird,
    totalOperations: session.toolOperations.length,
  };
}