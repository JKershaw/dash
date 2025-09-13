/**
 * @file Progress Configuration
 * Single source of truth for all progress phase definitions across contexts
 */

/**
 * Context-specific phase definitions
 * Each context defines phases with start/end percentages for accurate progress tracking
 */
export const CONTEXT_PHASES = {
  analysis: {
    initializeDirectories: { start: 0, end: 2 },
    discoverLogFiles: { start: 2, end: 3 },
    analyzeSessions: { start: 3, end: 10 },
    generateRecommendations: { start: 10, end: 11 },
    enhancedAnalysis: { start: 11, end: 77 },
    generateReports: { start: 77, end: 100 }
  },
  
  chat: {
    initialization: { start: 0, end: 10 },
    processing: { start: 10, end: 80 },
    synthesis: { start: 80, end: 100 }
  },
  
  // Future contexts can be easily added here
  reports: {
    dataCollection: { start: 0, end: 20 },
    processing: { start: 20, end: 80 },
    rendering: { start: 80, end: 100 }
  },
  
  export: {
    preparation: { start: 0, end: 20 },
    export: { start: 20, end: 90 },
    compression: { start: 90, end: 100 }
  }
};

/**
 * Get phase configuration for a specific context
 * @param {string} context - Context name
 * @returns {Object|null} Phase configuration or null if not found
 */
export function getContextPhases(context) {
  return CONTEXT_PHASES[context] || null;
}

/**
 * Get all available contexts
 * @returns {string[]} Array of context names
 */
export function getAvailableContexts() {
  return Object.keys(CONTEXT_PHASES);
}

/**
 * Validate if a context exists
 * @param {string} context - Context name to validate
 * @returns {boolean} True if context exists
 */
export function isValidContext(context) {
  return context in CONTEXT_PHASES;
}