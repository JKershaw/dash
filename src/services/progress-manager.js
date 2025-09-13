/**
 * Progress Manager - Event-based progress tracking system
 * Replaces the callback-threaded progress pattern with clean event emission
 */

import { EventEmitter } from 'events';

/**
 * Progress Manager class that centralizes progress tracking
 * Eliminates the need to thread progress callbacks through multiple layers
 */
export class ProgressManager extends EventEmitter {
	constructor() {
		super();
		this.currentProgress = {
			phase: 'idle',
			percentage: 0,
			details: '',
			step: '',
			timestamp: Date.now()
		};
	}

	/**
	 * Report progress for a specific step
	 * @param {string} step - The step being performed
	 * @param {Object} data - Progress data
	 */
	reportProgress(step, data = {}) {
		const progressData = {
			step,
			phase: data.phase || this.currentProgress.phase,
			percentage: data.percentage || data.progress || this.currentProgress.percentage,
			details: data.details || data.message || '',
			current: data.current,
			total: data.total,
			timestamp: Date.now(),
			...data
		};

		// Update current progress state
		this.currentProgress = progressData;

		// Emit progress event for listeners
		this.emit('progress', progressData);
	}

	/**
	 * Start a new phase of operation
	 * @param {string} phase - The phase being started
	 * @param {Object} options - Additional options
	 */
	startPhase(phase, options = {}) {
		this.reportProgress(`${phase}:start`, {
			phase,
			percentage: 0,
			details: options.details || `Starting ${phase}`,
			...options
		});
	}

	/**
	 * Complete a phase of operation
	 * @param {string} phase - The phase being completed
	 * @param {Object} options - Additional options
	 */
	completePhase(phase, options = {}) {
		this.reportProgress(`${phase}:complete`, {
			phase,
			percentage: 100,
			details: options.details || `Completed ${phase}`,
			...options
		});
	}

	/**
	 * Report an error in progress
	 * @param {string} step - The step that failed
	 * @param {Error|string} error - The error that occurred
	 * @param {Object} data - Additional error data
	 */
	reportError(step, error, data = {}) {
		const errorData = {
			step,
			phase: data.phase || this.currentProgress.phase,
			error: error instanceof Error ? error.message : error,
			details: `Error in ${step}: ${error instanceof Error ? error.message : error}`,
			timestamp: Date.now(),
			...data
		};

		this.currentProgress = { ...this.currentProgress, ...errorData };
		this.emit('error', errorData);
		this.emit('progress', errorData);
	}

	/**
	 * Get current progress state
	 * @returns {Object} Current progress data
	 */
	getCurrentProgress() {
		return { ...this.currentProgress };
	}

	/**
	 * Reset progress to idle state
	 */
	reset() {
		this.currentProgress = {
			phase: 'idle',
			percentage: 0,
			details: '',
			step: '',
			timestamp: Date.now()
		};
		this.emit('reset');
	}

	/**
	 * Set up a progress listener for WebSocket or API responses
	 * @param {Function} callback - Callback function to handle progress updates
	 */
	onProgress(callback) {
		this.on('progress', callback);
	}

	/**
	 * Set up an error listener
	 * @param {Function} callback - Callback function to handle errors
	 */
	onError(callback) {
		this.on('error', callback);
	}

	/**
	 * Remove a progress listener
	 * @param {Function} callback - The callback to remove
	 */
	offProgress(callback) {
		this.off('progress', callback);
	}

	/**
	 * Remove an error listener
	 * @param {Function} callback - The callback to remove
	 */
	offError(callback) {
		this.off('error', callback);
	}
}

/**
 * Singleton progress manager instance
 * Provides a global progress manager that can be used across the application
 */
let globalProgressManager = null;

/**
 * Get the global progress manager instance
 * @returns {ProgressManager} The global progress manager
 */
export function getProgressManager() {
	if (!globalProgressManager) {
		globalProgressManager = new ProgressManager();
	}
	return globalProgressManager;
}

/**
 * Create a new progress manager instance (for testing or isolated operations)
 * @returns {ProgressManager} A new progress manager instance
 */
export function createProgressManager() {
	return new ProgressManager();
}

/**
 * Progress Context - Utility for running operations with progress tracking
 * Provides AOP-style progress injection without threading callbacks
 */
export class ProgressContext {
	static currentManager = null;

	/**
	 * Run a callback with a specific progress manager in context
	 * @param {ProgressManager} manager - The progress manager to use
	 * @param {Function} callback - The callback to execute
	 * @param {Object} metadata - Optional metadata for the operation
	 * @returns {Promise} The result of the callback
	 */
	static async runWithProgress(manager, callback, metadata = {}) {
		const previousManager = ProgressContext.currentManager;
		ProgressContext.currentManager = manager;
		
		if (metadata.phase) {
			manager.startPhase(metadata.phase, metadata);
		}

		try {
			const result = await callback();
			
			if (metadata.phase) {
				manager.completePhase(metadata.phase);
			}
			
			return result;
		} catch (error) {
			if (metadata.phase) {
				manager.reportError(`${metadata.phase}:error`, error);
			}
			throw error;
		} finally {
			ProgressContext.currentManager = previousManager;
		}
	}

	/**
	 * Get the current progress manager from context
	 * @returns {ProgressManager|null} The current progress manager or null
	 */
	static getCurrentManager() {
		return ProgressContext.currentManager;
	}

	/**
	 * Report progress using the current context manager
	 * @param {string} step - The step being performed
	 * @param {Object} data - Progress data
	 */
	static reportProgress(step, data = {}) {
		const manager = ProgressContext.getCurrentManager();
		if (manager) {
			manager.reportProgress(step, data);
		}
	}
}

/**
 * Legacy callback adapter - helps transition from callback-based to event-based
 * @param {ProgressManager} manager - The progress manager
 * @param {Function} callback - The legacy progress callback
 * @returns {Function} Cleanup function to remove the listener
 */
export function createProgressCallback(manager, callback) {
	const progressListener = (data) => {
		if (callback && typeof callback === 'function') {
			callback(data);
		}
	};
	
	manager.onProgress(progressListener);
	
	// Return cleanup function
	return () => manager.offProgress(progressListener);
}