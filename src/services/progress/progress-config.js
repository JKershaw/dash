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
    analyzeSessions: { 
      start: 3, 
      end: 10,
      subPhases: {
        fileProcessing: { 
          weight: 1.0,
          estimatedSteps: 'dynamic', // Based on actual file count
          stepWeighting: 'uniform'
        }
      }
    },
    generateRecommendations: { 
      start: 10, 
      end: 11,
      subPhases: {
        patternDetection: { 
          weight: 1.0,
          estimatedSteps: 15, // Number of pattern detectors
          stepWeighting: 'uniform'
        }
      }
    },
    enhancedAnalysis: { 
      start: 11, 
      end: 77,
      subPhases: {
        initialization: { weight: 0.1 },
        agenticRounds: { 
          weight: 0.8,
          progressCap: 0.9,        // Don't reach 100% until complete
          estimatedSteps: 6,       // Configuration, not hardcoded
          maxRounds: 25,           // Maximum tool calling rounds
          stepWeighting: 'uniform'
        },
        synthesis: { weight: 0.1 }
      }
    },
    generateReports: { 
      start: 77, 
      end: 100,
      subPhases: {
        markdownGeneration: { weight: 0.6 },
        executiveSummary: { weight: 0.3 },
        finalization: { weight: 0.1 }
      }
    }
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

/**
 * Get sub-phase configuration for a specific phase
 * @param {string} context - Context name
 * @param {string} phase - Phase name
 * @returns {Object|null} Sub-phase configuration or null if not found
 */
export function getSubPhases(context, phase) {
  const contextPhases = getContextPhases(context);
  if (!contextPhases || !contextPhases[phase]) {
    return null;
  }
  return contextPhases[phase].subPhases || null;
}

/**
 * Get specific sub-phase configuration
 * @param {string} context - Context name
 * @param {string} phase - Phase name
 * @param {string} subPhase - Sub-phase name
 * @returns {Object|null} Sub-phase configuration or null if not found
 */
export function getSubPhase(context, phase, subPhase) {
  const subPhases = getSubPhases(context, phase);
  if (!subPhases || !subPhases[subPhase]) {
    return null;
  }
  return subPhases[subPhase];
}