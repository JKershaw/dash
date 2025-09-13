/**
 * Detects repetitive editing of a plan file.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array of detected plan editing loops.
 */
export function detectPlanEditingLoops(session) {
  if (!session || !session.toolOperations || !Array.isArray(session.toolOperations)) {
    return [];
  }
  const editOperations = session.toolOperations.filter(
    op => op.name === 'Edit' && op.input && op.input.file_path && op.input.file_path.includes('plan')
  );
  if (editOperations.length < 2) {
    return [];
  }

  const loops = [];
  for (let i = 0; i < editOperations.length - 1; i++) {
    if (editOperations[i].input?.file_path === editOperations[i + 1].input?.file_path) {
      loops.push({
        file_path: editOperations[i].input?.file_path,
      });
    }
  }

  return loops;
}