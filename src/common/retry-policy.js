/**
 * Retry Policy - Reusable retry logic for any async operation
 * Extracted from anthropic-client for general use across the system
 */

// ==================== JSDoc Interface Definitions ====================

/**
 * Retry policy configuration options
 * @typedef {Object} RetryPolicyOptions
 * @property {number} [maxRetries=2] - Maximum number of retry attempts
 * @property {number} [baseDelay=1000] - Base delay in milliseconds
 * @property {number} [maxDelay=30000] - Maximum delay in milliseconds
 * @property {BackoffStrategy} [backoffStrategy='exponential'] - Backoff strategy to use
 * @property {number} [backoffMultiplier=2] - Multiplier for backoff calculation
 * @property {boolean} [jitter=false] - Whether to add random jitter to delays
 */

/**
 * Backoff strategy enumeration
 * @typedef {'exponential' | 'linear' | 'fixed'} BackoffStrategy
 */

/**
 * Retry execution context for callbacks and logging
 * @typedef {Object} RetryExecutionContext
 * @property {function(Error, number, number, number): void} [onRetry] - Called before each retry
 * @property {function(Error, number): void} [onFailure] - Called when all retries fail
 */

/**
 * Async operation function signature for retry execution
 * @typedef {function(number): Promise<*>} RetryableOperation
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {Promise<*>} Operation result
 */

/**
 * Create a retry policy with configuration
 * @param {RetryPolicyOptions} options - Retry configuration
 * @returns {Object} Retry policy instance with execute, isRetryable, markRetryable methods
 */
export function createRetryPolicy(options = {}) {
  const {
    maxRetries = 2,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffStrategy = 'exponential', // 'exponential' | 'linear' | 'fixed'
    backoffMultiplier = 2,
    jitter = false
  } = options;

  return {
    /**
     * Execute operation with retry logic
     * @param {RetryableOperation} operation - Async operation to execute
     * @param {RetryExecutionContext} context - Optional context for logging and callbacks
     * @returns {Promise<any>} Operation result
     */
    async execute(operation, context = {}) {
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await operation(attempt);
          return result;
          
        } catch (error) {
          lastError = error;
          
          // Don't retry on last attempt
          if (attempt === maxRetries) {
            break;
          }
          
          // Check if error is retryable
          if (!this.isRetryable(error)) {
            throw error;
          }
          
          // Calculate delay
          const delay = this.calculateDelay(attempt);
          
          // Optional logging
          if (context.onRetry) {
            context.onRetry(error, attempt + 1, maxRetries + 1, delay);
          }
          
          // Wait before retrying
          await this.delay(delay);
        }
      }
      
      // All retries exhausted
      if (context.onFailure) {
        context.onFailure(lastError, maxRetries + 1);
      }
      throw lastError;
    },

    /**
     * Check if an error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if retryable
     */
    isRetryable(error) {
      // Explicit retryable flag
      if (error.hasOwnProperty('isRetryable')) {
        return error.isRetryable === true;
      }
      
      // HTTP status codes that are generally retryable
      if (error.status) {
        // Rate limiting
        if (error.status === 429) return true;
        
        // Service unavailable
        if (error.status === 503) return true;
        
        // Gateway errors
        if (error.status >= 502 && error.status <= 504) return true;
      }
      
      // Network errors
      if (error.code === 'ECONNRESET' || 
          error.code === 'ENOTFOUND' || 
          error.code === 'ECONNREFUSED' ||
          error.code === 'TIMEOUT') {
        return true;
      }
      
      return false;
    },

    /**
     * Calculate delay for retry attempt
     * @param {number} attempt - Current attempt number (0-based)
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt) {
      let delay;
      
      switch (backoffStrategy) {
        case 'exponential':
          delay = baseDelay * Math.pow(backoffMultiplier, attempt);
          break;
          
        case 'linear':
          delay = baseDelay + (baseDelay * backoffMultiplier * attempt);
          break;
          
        case 'fixed':
        default:
          delay = baseDelay;
          break;
      }
      
      // Apply jitter if enabled
      if (jitter) {
        delay *= (0.5 + Math.random() * 0.5);
      }
      
      // Respect max delay
      return Math.min(delay, maxDelay);
    },

    /**
     * Create a delay promise
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>} Delay promise
     */
    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Mark an error as retryable
     * @param {Error} error - Error to mark
     * @param {boolean} retryable - Whether error is retryable
     * @returns {Error} Marked error
     */
    markRetryable(error, retryable = true) {
      error.isRetryable = retryable;
      return error;
    }
  };
}

// Convenience factory functions
export function createExponentialBackoff(options = {}) {
  return createRetryPolicy({
    backoffStrategy: 'exponential',
    ...options
  });
}

export function createLinearBackoff(options = {}) {
  return createRetryPolicy({
    backoffStrategy: 'linear',  
    ...options
  });
}

export function createFixedDelay(options = {}) {
  return createRetryPolicy({
    backoffStrategy: 'fixed',
    ...options
  });
}