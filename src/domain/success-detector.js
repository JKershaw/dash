// Import all success detectors
import { detectAiCollaborationEffectiveness } from './detectors/ai-collaboration-effectiveness-detector.js';
import { detectProblemSolvingSuccess } from './detectors/problem-solving-success-detector.js';

// Re-export to maintain backward compatibility
export {
  detectAiCollaborationEffectiveness,
  detectProblemSolvingSuccess,
};