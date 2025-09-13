const NO_PROGRESS_THRESHOLD_CALLS = 10;

/**
 * Detects sessions with a high number of tool calls but no successful tool calls.
 * @param {object} session - A normalized session object.
 * @returns {Array} An array containing the session if it shows no progress, otherwise an empty array.
 */
export function detectNoProgressSessions(session) {
  if (
    !session ||
    !session.toolOperations ||
    session.toolOperations.length < NO_PROGRESS_THRESHOLD_CALLS
  ) {
    return [];
  }

  const successfulCalls = session.toolOperations.filter(op => op.status === 'success');

  if (successfulCalls.length === 0) {
    return [session];
  }

  return [];
}