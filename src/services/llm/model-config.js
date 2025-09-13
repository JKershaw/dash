/**
 * @file Model Configuration - Token limits & model capabilities
 * Pure functions for managing Claude model configurations and token limits
 */

/**
 * Get max tokens based on model capabilities (updated with 2025 API limits)
 * @param {string} model - Model name
 * @param {boolean} isToolEnabled - Whether this is for tool-enabled (agentic) analysis
 * @returns {number} Maximum tokens supported by the model
 */
export function getModelMaxTokens(model, isToolEnabled = false) {
  // Map models to their actual max_token limits based on 2025 Anthropic API documentation
  let baseLimit;
  
  // Claude 4 models (latest generation)
  if (model.includes('sonnet-4') || model.includes('sonnet') && model.includes('2025')) {
    baseLimit = 64000; // Claude Sonnet 4: 64k tokens
  } else if (model.includes('opus-4') || model.includes('opus') && model.includes('2025')) {
    baseLimit = 32000; // Claude Opus 4: 32k tokens
  }
  // Claude 3.7 models
  else if (model.includes('sonnet') && model.includes('3.7')) {
    baseLimit = 128000; // Claude Sonnet 3.7: 128k tokens (with beta header)
  }
  // Claude 3.5 models  
  else if (model.includes('haiku') && model.includes('3.5')) {
    baseLimit = 8192; // Claude 3.5 Haiku: 8k tokens
  } else if (model.includes('sonnet') && model.includes('3.5')) {
    baseLimit = 8192; // Claude 3.5 Sonnet: 8k tokens
  }
  // Claude 3 models (legacy)
  else if (model.includes('haiku')) {
    baseLimit = 4096; // Claude 3 Haiku: 4k tokens
  } else if (model.includes('sonnet')) {
    baseLimit = 4096; // Claude 3 Sonnet: 4k tokens  
  } else if (model.includes('opus')) {
    baseLimit = 4096; // Claude 3 Opus: 4k tokens
  } else {
    // Default for unknown models - assume modern Claude 4 capabilities
    baseLimit = 32000;
  }
  
  // For tool-enabled (agentic) analysis, use a substantial portion of model capacity
  // since multi-round analysis with rich context requires significant output space
  if (isToolEnabled) {
    // Use 75% of model capacity for tool rounds, allowing room for conversation growth
    return Math.floor(baseLimit * 0.75);
  }
  
  // For simple analysis, use 50% of model capacity
  return Math.floor(baseLimit * 0.5);
}