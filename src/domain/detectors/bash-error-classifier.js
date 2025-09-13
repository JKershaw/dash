/**
 * Bash Error Classifier
 * Distinguishes between environment setup errors vs development workflow errors
 * Helps identify blocking infrastructure issues vs normal development process errors
 * @param {object} bashOperation - A bash tool operation with error status
 * @returns {object} Error classification with category, type, and suggestions
 */

/**
 * Classifies a single bash error operation
 * @param {object} bashOperation - Bash operation with error status
 * @returns {object} Classification result
 */
export function classifyBashError(bashOperation) {
  if (!bashOperation || bashOperation.name !== 'Bash' || bashOperation.status !== 'error') {
    return { category: 'unknown', type: 'not_bash_error' };
  }

  const command = bashOperation.input?.command?.toLowerCase() || '';
  const output = bashOperation.output?.toLowerCase() || '';

  // Expected Development Errors (check first, highest priority)
  if (isExpectedFailure(command, output)) {
    return {
      category: 'expected',
      type: 'expected_failure',
      actionable: false,
      suggestion: 'This appears to be an expected failure during development'
    };
  }

  // Environment Error Patterns
  if (isCommandNotFoundError(command, output)) {
    return {
      category: 'environment',
      type: 'command_not_found',
      actionable: true,
      suggestion: `install missing command: ${extractMissingCommand(output)}`
    };
  }

  if (isTimeoutDuringSetup(command, output)) {
    return {
      category: 'environment', 
      type: 'timeout_during_setup',
      actionable: true,
      suggestion: 'Check network connectivity or increase timeout'
    };
  }

  if (isMissingDependency(command, output)) {
    return {
      category: 'environment',
      type: 'missing_dependencies',
      actionable: true,
      suggestion: 'install missing dependencies or check system requirements'
    };
  }

  if (isServiceUnavailable(command, output)) {
    return {
      category: 'environment',
      type: 'service_unavailable', 
      actionable: true,
      suggestion: 'Start required services (Docker, database, etc.)'
    };
  }

  // Workflow Development Error Patterns  
  if (isTestFailure(command, output)) {
    return {
      category: 'workflow',
      type: 'test_failures',
      actionable: true,
      suggestion: 'Fix failing tests or update test expectations'
    };
  }

  if (isCompilationError(command, output)) {
    return {
      category: 'workflow',
      type: 'compilation_errors',
      actionable: true,
      suggestion: 'Fix compilation errors in source code'
    };
  }

  if (isRuntimeException(command, output)) {
    return {
      category: 'workflow',
      type: 'runtime_exceptions',
      actionable: true,
      suggestion: 'Debug runtime error and fix application logic'
    };
  }

  // Default to workflow error for unclassified bash errors
  return {
    category: 'workflow',
    type: 'unclassified_error',
    actionable: true,
    suggestion: 'Review error output and fix underlying issue'
  };
}

/**
 * Detects bash error patterns across an entire session
 * @param {object} session - Session object with tool operations
 * @returns {Array} Array of detected error patterns
 */
export function detectBashErrorPatterns(session) {
  if (!session || !session.toolOperations || session.toolOperations.length === 0) {
    return [];
  }

  const bashErrors = session.toolOperations.filter(op => 
    op.name === 'Bash' && op.status === 'error'
  );

  if (bashErrors.length === 0) {
    return [];
  }

  const results = [];
  const errorClassifications = bashErrors.map(error => classifyBashError(error));
  
  // Analyze environment error patterns
  const environmentErrors = errorClassifications.filter(c => c.category === 'environment');
  if (environmentErrors.length >= 2) {
    results.push({
      type: 'environment_setup_issues',
      sessionId: session.sessionId,
      environmentErrorCount: environmentErrors.length,
      errorTypes: [...new Set(environmentErrors.map(e => e.type))],
      description: 'Multiple environment setup issues detected',
      suggestion: 'Focus on environment setup before development work',
      _provenance: {
        patternType: 'environment_setup_issues',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        confidenceLevel: environmentErrors.length > 3 ? 'high' : 'medium'
      }
    });
  }

  // Analyze workflow error patterns
  const workflowErrors = errorClassifications.filter(c => c.category === 'workflow');
  if (workflowErrors.length >= 1) {
    const hasResolution = hasWorkflowErrorResolution(session.toolOperations, bashErrors);
    
    results.push({
      type: 'development_workflow_errors',
      sessionId: session.sessionId,
      workflowErrorCount: workflowErrors.length,
      errorTypes: [...new Set(workflowErrors.map(e => e.type))],
      hasResolution,
      description: hasResolution ? 
        'Development errors encountered but resolved' : 
        'Development errors need attention',
      suggestion: hasResolution ?
        'Good error resolution pattern' :
        'Focus on resolving workflow errors',
      _provenance: {
        patternType: 'development_workflow_errors',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        confidenceLevel: hasResolution ? 'low' : 'medium'
      }
    });
  }

  return results;
}

// Helper functions for error classification

function isCommandNotFoundError(command, output) {
  return output.includes('command not found') || 
         output.includes('not found') ||
         output.includes('is not recognized as an internal or external command');
}

function isTimeoutDuringSetup(command, output) {
  const setupCommands = ['install', 'setup', 'init', 'pull', 'push', 'clone', 'curl'];
  const isSetupCommand = setupCommands.some(cmd => command.includes(cmd));
  
  return isSetupCommand && (
    output.includes('timeout') ||
    output.includes('timed out') ||
    output.includes('no response') ||
    output.includes('connection timeout')
  );
}

function isMissingDependency(command, output) {
  // Only count as missing dependency if it's a setup/install command
  const setupCommands = ['install', 'setup', 'init'];
  const isSetupCommand = setupCommands.some(cmd => command.includes(cmd));
  
  return isSetupCommand && (
    output.includes('cannot find module') ||
    output.includes('no such file or directory') ||
    output.includes('missing dependency') ||
    output.includes('package not found')
  ) || (output.includes('python') && output.includes('not found')) ||
      (output.includes('node') && output.includes('not found'));
}

function isServiceUnavailable(command, output) {
  return output.includes('cannot connect to') ||
         output.includes('connection refused') ||
         output.includes('service unavailable') ||
         output.includes('docker daemon') ||
         output.includes('database connection failed');
}

function isTestFailure(command, output) {
  const testCommands = ['test', 'spec', 'jest', 'mocha', 'pytest', 'cargo test'];
  const isTestCommand = testCommands.some(cmd => command.includes(cmd));
  
  return isTestCommand && (
    output.includes('failing') ||
    output.includes('failed') ||
    output.includes('error') ||
    output.includes('assertion')
  );
}

function isCompilationError(command, output) {
  const buildCommands = ['build', 'compile', 'make', 'tsc', 'cargo build'];
  const isBuildCommand = buildCommands.some(cmd => command.includes(cmd));
  
  return isBuildCommand && (
    output.includes('compilation') ||
    output.includes('compile error') ||
    output.includes('syntax error') ||
    output.includes('type error') ||
    output.includes('ts2') // TypeScript error codes
  );
}

function isRuntimeException(command, output) {
  const runCommands = ['start', 'run', 'node', 'python', 'java'];
  const isRunCommand = runCommands.some(cmd => command.includes(cmd));
  
  return isRunCommand && (
    output.includes('exception') ||
    output.includes('error:') ||
    output.includes('typeerror') ||
    output.includes('referenceerror') ||
    output.includes('cannot read property') ||
    output.includes('cannot find module')
  );
}

function isExpectedFailure(command, output) {
  // TDD patterns or experimental commands
  return command.includes('experiment') ||
         command.includes('curl') && output.includes('404') ||
         output.includes('as expected') ||
         output.includes('expected during') ||
         output.includes('intentional') ||
         (command.includes('test') && (output.includes('failed as expected') || output.includes('tdd')));
}

function extractMissingCommand(output) {
  const match = output.match(/bash: ([^:]+): command not found/) || 
                output.match(/([^:]+): command not found/);
  return match ? match[1] : 'unknown command';
}

function hasWorkflowErrorResolution(toolOperations, bashErrors) {
  // Look for successful bash operations after the last error
  const lastErrorIndex = toolOperations.lastIndexOf(bashErrors[bashErrors.length - 1]);
  const subsequentOperations = toolOperations.slice(lastErrorIndex + 1);
  
  return subsequentOperations.some(op => 
    op.name === 'Bash' && 
    op.status === 'success' &&
    (op.output?.includes('passed') || op.output?.includes('success'))
  );
}