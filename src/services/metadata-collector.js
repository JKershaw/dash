/**
 * @file Metadata Collection Service
 * Simple functional module for tracking analysis run metadata
 */

import { randomUUID } from 'crypto';
import { getLogsDir, getOutputDir } from '../config.js';

/**
 * Create a new metadata structure for an analysis run
 * @returns {Object} Initial metadata structure
 */
export function createMetadata() {
  return {
    run: {
      id: randomUUID(),
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      version: process.env.npm_package_version || 'unknown',
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      workingDirectory: process.cwd(),
      claudeLogsDir: getLogsDir(),
      outputDir: getOutputDir(),
    },
    input: {},
    processing: {
      phases: [],
      llmCalls: [],
      tokenUsage: {
        simple: { total: 0, byModel: {} },
        agentic: { total: 0, byModel: {} },
      },
    },
    output: {
      files: [],
      reports: {},
    },
    performance: {},
    errors: [],
  };
}

/**
 * Track a processing phase with timing
 * @param {Object} metadata - Metadata object
 * @param {string} phaseName - Name of the phase
 * @param {string} status - Phase status ('start', 'complete', 'error')
 * @param {Object} data - Additional phase data
 */
export function trackPhase(metadata, phaseName, status, data = {}) {
  const timestamp = new Date().toISOString();

  // Find existing phase or create new one
  let phase = metadata.processing.phases.find(p => p.name === phaseName);
  if (!phase) {
    phase = {
      name: phaseName,
      startTime: null,
      endTime: null,
      duration: null,
      status: 'pending',
    };
    metadata.processing.phases.push(phase);
  }

  if (status === 'start') {
    phase.startTime = timestamp;
    phase.status = 'running';
  } else if (status === 'complete' || status === 'error') {
    phase.endTime = timestamp;
    phase.status = status === 'error' ? 'failed' : 'completed';

    if (phase.startTime) {
      phase.duration = new Date(timestamp) - new Date(phase.startTime);
    }
  }

  // Add any additional data
  Object.assign(phase, data);
}

/**
 * Track an LLM API call
 * @param {Object} metadata - Metadata object
 * @param {Object} callData - LLM call data
 */
export function trackLLMCall(metadata, callData) {
  const llmCall = {
    timestamp: new Date().toISOString(),
    type: callData.type,
    strategy: callData.strategy || 'simple',
    provider: callData.provider || 'anthropic-api',
    model: callData.model,
    duration: callData.duration,
    success: callData.success,
    ...callData,
  };

  metadata.processing.llmCalls.push(llmCall);

  // Update token usage if available
  if (
    callData.strategy === 'simple' &&
    (callData.inputTokens || callData.outputTokens || callData.actualTokens)
  ) {
    const totalTokens =
      callData.actualTokens || (callData.inputTokens || 0) + (callData.outputTokens || 0);
    metadata.processing.tokenUsage.simple.total += totalTokens;

    const model = callData.model;
    if (!metadata.processing.tokenUsage.simple.byModel[model]) {
      metadata.processing.tokenUsage.simple.byModel[model] = {
        total: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    metadata.processing.tokenUsage.simple.byModel[model].total += totalTokens;
    metadata.processing.tokenUsage.simple.byModel[model].inputTokens += callData.inputTokens || 0;
    metadata.processing.tokenUsage.simple.byModel[model].outputTokens += callData.outputTokens || 0;
  }

  // Update agentic token usage for api-with-tools and agentic strategies
  if (
    (callData.strategy === 'agentic' || callData.strategy === 'api-with-tools') &&
    (callData.inputTokens || callData.outputTokens || callData.actualTokens)
  ) {
    const totalTokens =
      callData.actualTokens || (callData.inputTokens || 0) + (callData.outputTokens || 0);
    metadata.processing.tokenUsage.agentic.total += totalTokens;

    const model = callData.model;
    if (!metadata.processing.tokenUsage.agentic.byModel[model]) {
      metadata.processing.tokenUsage.agentic.byModel[model] = {
        total: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    metadata.processing.tokenUsage.agentic.byModel[model].total += totalTokens;
    metadata.processing.tokenUsage.agentic.byModel[model].inputTokens += callData.inputTokens || 0;
    metadata.processing.tokenUsage.agentic.byModel[model].outputTokens +=
      callData.outputTokens || 0;
  }
}

/**
 * Track an output file
 * @param {Object} metadata - Metadata object
 * @param {string} type - File type (e.g., 'analysis-report', 'executive-summary')
 * @param {string} path - File path
 * @param {number} size - File size in bytes
 */
export function trackOutputFile(metadata, type, path, size) {
  metadata.output.files.push({
    type,
    path,
    size,
    timestamp: new Date().toISOString(),
  });

  // Also track in reports object for easy access
  metadata.output.reports[type] = path;
}

/**
 * Track an error during analysis
 * @param {Object} metadata - Metadata object
 * @param {Error|Object} error - Error object or error data
 * @param {Object} context - Additional context about the error
 */
export function trackError(metadata, error, context = {}) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Handle different error types
  if (error && typeof error.toJSON === 'function') {
    // AppError or similar with toJSON method
    Object.assign(errorEntry, error.toJSON());
  } else if (error instanceof Error) {
    // Standard Error object
    errorEntry.name = error.name;
    errorEntry.message = error.message;
    errorEntry.stack = error.stack;
  } else if (typeof error === 'object') {
    // Plain error object
    Object.assign(errorEntry, error);
  } else {
    // String or other primitive
    errorEntry.message = String(error);
  }

  metadata.errors.push(errorEntry);
}

/**
 * Finalize metadata and calculate summary statistics
 * @param {Object} metadata - Metadata object
 * @returns {Object} Finalized metadata with summary
 */
export function finalizeMetadata(metadata) {
  metadata.run.endTime = new Date().toISOString();
  metadata.run.duration = new Date(metadata.run.endTime) - new Date(metadata.run.startTime);

  // Calculate performance summary
  metadata.performance = {
    totalDuration: metadata.run.duration,
    phaseTimings: {},
  };

  // Add phase timing summary
  for (const phase of metadata.processing.phases) {
    if (phase.duration !== null) {
      metadata.performance.phaseTimings[phase.name] = phase.duration;
    }
  }

  // Calculate LLM usage summary
  const llmSummary = {
    totalCalls: metadata.processing.llmCalls.length,
    successfulCalls: metadata.processing.llmCalls.filter(c => c.success).length,
    failedCalls: metadata.processing.llmCalls.filter(c => !c.success).length,
    strategies: {
      simple: {
        calls: metadata.processing.llmCalls.filter(c => c.strategy === 'simple').length,
        totalTokens: metadata.processing.tokenUsage.simple.total,
      },
      agentic: {
        calls: metadata.processing.llmCalls.filter(
          c => c.strategy === 'agentic' || c.strategy === 'api-with-tools'
        ).length,
        totalRetries: metadata.processing.llmCalls
          .filter(c => c.strategy === 'agentic' || c.strategy === 'api-with-tools')
          .reduce((sum, c) => sum + (c.attempt || 1) - 1, 0),
      },
    },
  };

  // Add summary section
  metadata.summary = {
    success: metadata.errors.length === 0,
    completedWithErrors: metadata.errors.length > 0,
    totalErrors: metadata.errors.length,
    outputFilesGenerated: metadata.output.files.length,
    llmUsage: llmSummary,
  };

  return metadata;
}
