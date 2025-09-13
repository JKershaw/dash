/**
 * @file Standardized Error Types
 * Consistent error hierarchy for the application
 */

/**
 * Base error class for application errors
 */
export class AppError extends Error {
  constructor(message, code = null, cause = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
    this.timestamp = new Date().toISOString();
    
    // Maintain stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * File system operation errors
 */
export class FileSystemError extends AppError {
  constructor(message, code = null, filePath = null, cause = null) {
    super(message, code, cause);
    this.filePath = filePath;
  }
  
  static fromNodeError(nodeError, filePath = null) {
    const codeMap = {
      'ENOENT': 'FILE_NOT_FOUND',
      'EACCES': 'PERMISSION_DENIED', 
      'EISDIR': 'IS_DIRECTORY',
      'ENOTDIR': 'NOT_DIRECTORY',
      'EMFILE': 'TOO_MANY_FILES',
      'ENOSPC': 'NO_SPACE',
      'EROFS': 'READ_ONLY'
    };
    
    const code = codeMap[nodeError.code] || nodeError.code;
    const message = `File operation failed: ${nodeError.message}`;
    
    return new FileSystemError(message, code, filePath, nodeError);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends AppError {
  constructor(message, configKey = null, cause = null) {
    super(message, 'CONFIG_ERROR', cause);
    this.configKey = configKey;
  }
}

/**
 * LLM/AI service errors
 */
export class LLMError extends AppError {
  constructor(message, code = null, retryable = false, cause = null) {
    super(message, code, cause);
    this.retryable = retryable;
  }
}

/**
 * Analysis processing errors
 */
export class AnalysisError extends AppError {
  constructor(message, phase = null, sessionId = null, cause = null) {
    super(message, 'ANALYSIS_ERROR', cause);
    this.phase = phase;
    this.sessionId = sessionId;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

/**
 * JSON parsing errors
 */
export class JsonError extends FileSystemError {
  constructor(message, filePath = null, cause = null) {
    super(message, 'INVALID_JSON', filePath, cause);
  }
}