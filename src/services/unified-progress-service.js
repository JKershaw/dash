/**
 * @file Unified Progress Service - Compatibility Layer
 * Re-exports from the new modular progress system for backward compatibility
 * 
 * This file maintains the original API while delegating to the new modular implementation:
 * - src/services/progress/progress-service.js (core service)
 * - src/services/progress/progress-config.js (phase definitions)  
 * - src/services/progress/progress-calculator.js (percentage logic)
 * - src/services/progress/progress-ui-generator.js (UI transformations)
 * - src/services/progress/progress-utils.js (helper functions)
 */

// Re-export everything from the new modular system
export {
  UnifiedProgressService,
  getUnifiedProgressService,
  resetUnifiedProgressService,
  CONTEXT_PHASES,
  getContextPhases,
  getAvailableContexts,
  isValidContext,
  generateJobId,
  getDefaultMessage,
  formatElapsedTime,
  clampPercentage,
  isCompletionStep,
  isStartStep,
  extractPhase,
  extractStep,
  calculateProgressPercentage,
  calculateFallbackProgress,
  validateProgressInputs,
  generateProgressUI,
  generateProgressBarConfig,
  generateStatusConfig,
  generateTimingInfo,
  generateCompleteUI
} from './progress/index.js';