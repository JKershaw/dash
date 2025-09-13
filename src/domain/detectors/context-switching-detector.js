/**
 * Detects excessive context switching between different files or tasks.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected context switching patterns.
 */
export function detectContextSwitching(session) {
  if (!session || !session.toolOperations || session.toolOperations.length < 10) {
    return [];
  }

  const fileOperations = session.toolOperations.filter(
    op => op.input?.file_path && ['Read', 'Edit', 'Write', 'MultiEdit'].includes(op.name)
  );

  if (fileOperations.length < 8) {
    return [];
  }

  let switches = 0;
  let currentFile = null;
  const fileFrequency = new Map();

  fileOperations.forEach(op => {
    const file = op.input?.file_path;
    if (!file) return; // Skip operations without file path
    
    fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);

    if (currentFile && currentFile !== file) {
      switches++;
    }
    currentFile = file;
  });

  const uniqueFiles = fileFrequency.size;
  const avgOpsPerFile = fileOperations.length / uniqueFiles;
  const switchRate = switches / fileOperations.length;

  // High context switching: many files, low ops per file, high switch rate
  if (uniqueFiles > 5 && avgOpsPerFile < 3 && switchRate > 0.4) {
    return [
      {
        type: 'excessive_context_switching',
        uniqueFiles,
        totalFileOps: fileOperations.length,
        switches,
        avgOpsPerFile: Math.round(avgOpsPerFile * 10) / 10,
        switchRate: Math.round(switchRate * 100) / 100,
        topFiles: Array.from(fileFrequency.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([file, count]) => ({ file: file.split('/').pop(), count })),
        _provenance: {
          patternType: 'context_switching',
          detectionTimestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          sourceFile: session._provenance?.sourceFile,
          confidenceLevel: switchRate > 0.6 ? 'high' : 'medium',
        },
      },
    ];
  }

  return [];
}