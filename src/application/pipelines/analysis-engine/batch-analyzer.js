/**
 * @file BatchAnalyzer - Orchestrates batch analysis of multiple session files
 */

import { parseLogFile } from "../../../infrastructure/persistence/log-parser.js";
import { analyzeSession } from "../../../infrastructure/persistence/session-parser.js";
import { normalizeSession } from "../../../infrastructure/persistence/data-normalizer.js";
import { getConfiguredDir } from "../../../infrastructure/file-utils.js";

/**
 * BatchAnalyzer class - handles batch analysis of multiple session files
 */
export class BatchAnalyzer {
	constructor(config = {}, progressCallback = null) {
		this.config = config;
		this.progressCallback = progressCallback;
		this.sessions = [];
	}

	/**
	 * Emit progress updates
	 */
	emitProgress(step, data) {
		if (this.progressCallback) {
			this.progressCallback(step, data);
		}
	}

	/**
	 * Analyze multiple log files with progress tracking
	 * @param {Array} logFiles - Array of log file paths
	 * @returns {Array} Array of analyzed sessions
	 */
	async analyzeFiles(logFiles) {
		const sessions = [];
		
		// Always emit progress updates for accurate tracking
		// This ensures users see continuous progress from 5% to 75%
		for (let i = 0; i < logFiles.length; i++) {
			const logFile = logFiles[i];

			// Emit progress for each file being analyzed
			this.emitProgress('analyzeSessions:progress', {
				current: i + 1,
				total: logFiles.length,
				message: `Analyzing session ${i + 1} of ${logFiles.length}`
			});

			const session = await this.analyzeSingleFile(logFile);
			if (session) {
				sessions.push(session);
				await this.saveFormattedSessions(session);
			}
		}

		// Emit completion signal
		this.emitProgress('analyzeSessions:complete', {
			count: sessions.length
		});

		this.sessions = sessions;
		return sessions;
	}

	/**
	 * Analyze a single log file
	 * @param {string} logFile - Path to log file
	 * @returns {Object|null} Analyzed session or null
	 */
	async analyzeSingleFile(logFile) {
		const logEntries = await parseLogFile(logFile);

		if (logEntries.length > 0) {
			const session = analyzeSession(logFile, logEntries);
			if (session) {
				return normalizeSession(session);
			}
		}
		return null;
	}

	/**
	 * Save formatted sessions (can be mocked for testing)
	 * @param {Object} session - Session to save
	 */
	async saveFormattedSessions(session) {
		// Skip saving in test mode
		if (process.env.NODE_ENV === 'test' || !this.config.OUTPUT_DIRS) {
			return;
		}

		const { HumanReadableFormatter } = await import(
			"../log-processing/human-readable-formatter.js"
		);
		const { ScriptFormatter } = await import(
			"../log-processing/script-formatter.js"
		);

		try {
			const outputDir = getConfiguredDir('sessions');
			
			await HumanReadableFormatter.saveFormattedSession(session, outputDir);
			await ScriptFormatter.saveFormattedScript(session, outputDir);
		} catch (error) {
			console.error(`❌ Error saving formatted session: ${error.message}`);
		}
	}

	// Session index creation removed - sessions are loaded directly from files

	/**
	 * Get progress events emitted (for testing)
	 * @returns {Array} Array of progress events if tracking is enabled
	 */
	getProgressEvents() {
		return this._progressEvents || [];
	}

	/**
	 * Enable progress tracking for testing
	 */
	enableProgressTracking() {
		this._progressEvents = [];
		const originalCallback = this.progressCallback;
		this.progressCallback = (step, data) => {
			this._progressEvents.push({ step, data, timestamp: Date.now() });
			if (originalCallback) {
				originalCallback(step, data);
			}
		};
	}
}

/**
 * Factory function for creating batch analyzer instances
 * @param {Object} config - Configuration object
 * @param {Function} progressCallback - Progress callback function
 * @returns {BatchAnalyzer} New BatchAnalyzer instance
 */
export function createBatchAnalyzer(config = {}, progressCallback = null) {
	return new BatchAnalyzer(config, progressCallback);
}