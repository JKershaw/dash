/**
 * @file LLM Utilities - Helper functions for LLM service
 * Pure utility functions for statistics, error parsing, and data processing
 */

/**
 * Calculate basic stats for sessions and recommendations
 * @param {Array} sessions - Session data array
 * @param {Array} recommendations - Recommendations data array
 * @returns {Object} Calculated statistics
 */
export function calculateStats(sessions, recommendations) {
  const totalSessions = sessions.length;
  const totalTime = sessions.reduce((sum, s) => sum + (s.durationSeconds || s.duration || 0), 0);
  const totalHours = Math.round((totalTime / 3600) * 10) / 10;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalTime / totalSessions / 60) : 0;
  const projects = [...new Set(sessions.map(s => s.projectName || s.project || 'Unknown'))];

  return {
    totalSessions,
    totalHours,
    avgSessionMinutes,
    recommendationCount: recommendations.length,
    projects,
  };
}

/**
 * Parse API error into user-friendly message
 * @param {Error} error - The error object
 * @param {string} context - Context (e.g., "Executive summary")
 * @returns {string} User-friendly error message
 */
export function parseUserFriendlyMessage(error, context = 'AI analysis') {
  const errorMessage = error.message || '';
  const errorString = error.toString?.() || '';

  // Credit balance error
  if (
    errorMessage.includes('credit balance is too low') ||
    errorMessage.includes('insufficient_credit_balance')
  ) {
    return `${context} failed: Your Anthropic credit balance is too low. Please add credits at https://console.anthropic.com/settings/billing`;
  }

  // Invalid API key
  if (
    errorMessage.includes('invalid_request_error') &&
    (errorMessage.includes('api_key') || errorMessage.includes('authentication'))
  ) {
    return `${context} failed: Invalid API key. Please check your ANTHROPIC_API_KEY environment variable`;
  }

  // Rate limit
  if (errorMessage.includes('rate_limit') || errorMessage.includes('too_many_requests')) {
    return `${context} failed: API rate limit exceeded. Please wait a moment and try again`;
  }

  // Overloaded service
  if (errorMessage.includes('overloaded_error') || errorMessage.includes('Overloaded')) {
    return `${context} failed: AI service is temporarily overloaded. Please try again in a few moments`;
  }

  // Network/timeout issues
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('ECONNREFUSED')
  ) {
    return `${context} failed: Network connection issue. Please check your internet connection and try again`;
  }

  // Generic API error with JSON details
  if (errorMessage.includes('400') || errorMessage.includes('500')) {
    // Try to extract specific error from JSON response
    try {
      const jsonMatch = errorString.match(/\{[^}]*"message"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.message) {
          return `${context} failed: ${parsed.message}`;
        }
      }
    } catch {
      // Fall through to generic message
    }

    return `${context} failed: API request failed. Please check your API key and try again`;
  }

  // Generic fallback
  return `${context} failed: ${errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage}`;
}

/**
 * Calculate a simple struggle score for ranking sessions
 * @param {Object} session - Session to score
 * @returns {number} Struggle score (higher = more struggle)
 */
export function calculateStruggleScore(session) {
  let score = 0;

  // Long duration penalty
  if (session.durationSeconds > 3600)
    score += 3; // > 1 hour
  else if (session.durationSeconds > 1800)
    score += 2; // > 30 minutes
  else if (session.durationSeconds > 900) score += 1; // > 15 minutes

  // High tool usage penalty
  const toolCount = session.toolCount || 0;
  if (toolCount > 50) score += 3;
  else if (toolCount > 30) score += 2;
  else if (toolCount > 20) score += 1;

  // Error penalty
  score += session.errors?.length || 0;

  // Struggle indicators penalty
  score += session.struggleIndicators?.length || 0;

  // Data quality issues penalty
  score += (session.dataQualityIssues?.length || 0) * 0.5;

  return Math.round(score * 10) / 10; // Round to 1 decimal
}