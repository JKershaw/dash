/**
 * @file Progress Services Entry Point
 * Clean exports and singleton management for progress tracking system
 */

// Export the main service class
export { UnifiedProgressService } from './progress-service.js';

// Export configuration
export { CONTEXT_PHASES, getContextPhases, getAvailableContexts, isValidContext } from './progress-config.js';

// Export utilities (for advanced usage)
export { 
  generateJobId, 
  getDefaultMessage, 
  formatElapsedTime, 
  clampPercentage,
  isCompletionStep,
  isStartStep,
  extractPhase,
  extractStep
} from './progress-utils.js';

// Export calculator (for advanced usage)
export { 
  calculateProgressPercentage, 
  calculateFallbackProgress, 
  validateProgressInputs 
} from './progress-calculator.js';

// Export UI generator (for custom UI implementations)
export { 
  generateProgressUI, 
  generateProgressBarConfig, 
  generateStatusConfig, 
  generateTimingInfo,
  generateCompleteUI
} from './progress-ui-generator.js';

// Singleton instance management
import { UnifiedProgressService } from './progress-service.js';

let instance = null;

/**
 * Get the global UnifiedProgressService instance
 * @returns {UnifiedProgressService}
 */
export function getUnifiedProgressService() {
  if (!instance) {
    instance = new UnifiedProgressService();
  }
  return instance;
}

/**
 * Reset the global instance (for testing)
 */
export function resetUnifiedProgressService() {
  if (instance) {
    instance.removeAllListeners();
    instance.jobStates.clear();
    instance.contextListeners.clear();
  }
  instance = null;
}