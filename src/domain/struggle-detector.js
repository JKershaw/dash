// Import all detectors
import { detectSimpleLoops } from './detectors/simple-loops-detector.js';
import { detectAdvancedLoops } from './detectors/advanced-loops-detector.js';
import { detectLongSessions } from './detectors/long-sessions-detector.js';
import { detectErrorPatterns } from './detectors/error-patterns-detector.js';
import { detectNoProgressSessions } from './detectors/no-progress-detector.js';
import { detectStagnation } from './detectors/stagnation-detector.js';
import { detectPlanEditingLoops } from './detectors/plan-editing-loops-detector.js';
import { detectReadingSpirals } from './detectors/reading-spirals-detector.js';
import { detectShotgunDebugging } from './detectors/shotgun-debugging-detector.js';
import { detectRedundantSequences } from './detectors/redundant-sequences-detector.js';
import { detectContextSwitching } from './detectors/context-switching-detector.js';
import { analyzeStruggleTrend } from './detectors/struggle-trend-analyzer.js';
import { detectSessionPhases } from './detectors/phase-detector.js';

// Re-export to maintain backward compatibility
export {
  detectSimpleLoops,
  detectAdvancedLoops,
  detectLongSessions,
  detectErrorPatterns,
  detectNoProgressSessions,
  detectStagnation,
  detectPlanEditingLoops,
  detectReadingSpirals,
  detectShotgunDebugging,
  detectRedundantSequences,
  detectContextSwitching,
  analyzeStruggleTrend,
  detectSessionPhases,
};
