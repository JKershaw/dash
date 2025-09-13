/**
 * @file Progress Debug Logger
 * Analyzes progress tracking accuracy and provides debug output
 */

/**
 * Progress Debug Logger class for analyzing estimation accuracy
 */
export class ProgressDebugLogger {
  /**
   * Generate and output a comprehensive progress debug report
   * @param {Object} job - Completed job object with progress history
   */
  static generateProgressReport(job) {
    if (!job || !job.progressHistory || job.progressHistory.length === 0) {
      console.log('📊 No progress history available for debug analysis');
      return;
    }

    const totalDuration = job.endTime
      ? new Date(job.endTime).getTime() - new Date(job.startTime).getTime()
      : Date.now() - new Date(job.startTime).getTime();

    // Get step definitions for comparison
    const expectedSteps = this.getExpectedSteps();

    // Group progress history by logical steps
    const stepAnalysis = this.analyzeProgressSteps(
      job.progressHistory,
      expectedSteps,
      totalDuration
    );

    this.outputProgressReport(job.id, stepAnalysis, totalDuration);
  }

  /**
   * Get expected step percentages from analysis runner
   * @returns {Object} Expected step definitions
   */
  static getExpectedSteps() {
    return {
      'initializeDirectories:start': { expectedPercent: 0, phase: 'setup' },
      'initializeDirectories:complete': { expectedPercent: 1, phase: 'setup' },
      'discoverLogFiles:start': { expectedPercent: 1, phase: 'setup' },
      'discoverLogFiles:complete': { expectedPercent: 2, phase: 'setup' },
      'analyzeSessions:start': { expectedPercent: 3, phase: 'analysis' },
      'analyzeSessions:progress': {
        expectedPercent: 5,
        phase: 'analysis',
        isRange: true,
        rangeEnd: 8,
      },
      'analyzeSessions:fileProgress': {
        expectedPercent: 5,
        phase: 'analysis',
        isRange: true,
        rangeEnd: 8,
      },
      'analyzeSessions:complete': { expectedPercent: 8, phase: 'analysis' },
      'generateRecommendations:start': { expectedPercent: 9, phase: 'recommendations' },
      'generateRecommendations:complete': { expectedPercent: 10, phase: 'recommendations' },
      'enhancedAnalysis:start': { expectedPercent: 11, phase: 'enhanced' },
      'enhancedAnalysis:progress': {
        expectedPercent: 40,
        phase: 'enhanced',
        isRange: true,
        rangeEnd: 70,
      },
      'enhancedAnalysis:complete': { expectedPercent: 70, phase: 'enhanced' },
      'generateReports:start': { expectedPercent: 71, phase: 'reports' },
      'generateReports:progress': {
        expectedPercent: 85,
        phase: 'reports',
        isRange: true,
        rangeEnd: 99,
      },
      'generateReports:complete': { expectedPercent: 100, phase: 'reports' },
    };
  }

  /**
   * Analyze progress steps and compare with expectations
   * @param {Array} progressHistory - Array of progress updates
   * @param {Object} expectedSteps - Expected step definitions
   * @param {number} totalDuration - Total job duration in ms
   * @returns {Array} Step analysis results
   */
  static analyzeProgressSteps(progressHistory, expectedSteps, totalDuration) {
    const stepAnalysis = [];
    const phases = { setup: [], analysis: [], recommendations: [], enhanced: [], reports: [] };

    // Group progress entries by phase
    progressHistory.forEach((entry, _index) => {
      const stepName = this.identifyStepFromMessage(entry.message, entry);
      const expectedStep = expectedSteps[stepName];

      if (expectedStep) {
        const analysis = {
          step: stepName,
          message: entry.message,
          actualPercent: entry.percentage,
          expectedPercent: expectedStep.expectedPercent,
          actualTime: entry.elapsedMs,
          expectedTime: (expectedStep.expectedPercent / 100) * totalDuration,
          phase: expectedStep.phase,
          accuracy: this.calculateAccuracy(entry.percentage, expectedStep.expectedPercent),
        };

        phases[expectedStep.phase].push(analysis);
        stepAnalysis.push(analysis);
      }
    });

    return { stepAnalysis, phases };
  }

  /**
   * Identify step name from progress message or step field
   * @param {string|undefined} message - Progress message
   * @param {Object} entry - Full progress entry (may contain step field)
   * @returns {string} Step identifier
   */
  static identifyStepFromMessage(message, entry = {}) {
    // First check if we have a step field directly (from new structure)
    if (entry.step && typeof entry.step === 'string') {
      return entry.step;
    }

    // Handle undefined, null, or non-string messages
    if (!message || typeof message !== 'string') {
      return 'unknown:unknown';
    }

    // Match actual progress messages from the current pipeline
    // These are the messages from analysis-runner.js
    if (
      message.includes('Initializing output directories') ||
      message.includes('Setting up output directories')
    )
      return 'initializeDirectories:start';
    if (
      message.includes('Output directories initialized') ||
      (message.includes('Created') && message.includes('directories'))
    )
      return 'initializeDirectories:complete';
    if (message.includes('Discovering log files') || message.includes('Scanning'))
      return 'discoverLogFiles:start';
    if (message.includes('Found') && message.includes('files')) return 'discoverLogFiles:complete';
    if (
      message.includes('Starting session analysis') ||
      message.includes('Processing conversation logs')
    )
      return 'analyzeSessions:start';
    if (message.includes('Processing session') && message.includes('of'))
      return 'analyzeSessions:progress';
    if (message.includes('Analyzed') && message.includes('sessions'))
      return 'analyzeSessions:complete';
    if (message.includes('Generating recommendations')) return 'generateRecommendations:start';
    if (message.includes('Generated') && message.includes('recommendations'))
      return 'generateRecommendations:complete';
    if (message.includes('Performing enhanced AI analysis') || message.includes('Starting enhanced AI analysis')) return 'enhancedAnalysis:start';
    if (
      message.includes('Analyzing patterns') || 
      message.includes('Running enhanced analysis') ||
      message.includes('Investigation round') ||
      message.includes('Synthesizing insights') ||
      message.includes('processing results')
    )
      return 'enhancedAnalysis:progress';
    if (message.includes('Enhanced analysis complete') || message.includes('Analysis complete')) return 'enhancedAnalysis:complete';
    if (message.includes('Generating final reports')) return 'generateReports:start';
    if (
      message.includes('Creating reports') ||
      message.includes('Creating main analysis report') ||
      message.includes('Generating executive summary') ||
      message.includes('Finalizing reports')
    ) return 'generateReports:progress';
    if (message.includes('Reports generated successfully')) return 'generateReports:complete';

    return 'unknown';
  }

  /**
   * Calculate accuracy percentage between actual and expected
   * @param {number} actual - Actual value
   * @param {number} expected - Expected value
   * @returns {number} Accuracy percentage (0-100)
   */
  static calculateAccuracy(actual, expected) {
    if (expected === 0) return actual === 0 ? 100 : 0;
    const diff = Math.abs(actual - expected);
    const accuracy = Math.max(0, 100 - (diff / expected) * 100);
    return Math.round(accuracy);
  }

  /**
   * Output formatted progress report to console
   * @param {string} jobId - Job ID
   * @param {Object} analysis - Step analysis results
   * @param {number} totalDuration - Total duration in ms
   */
  static outputProgressReport(jobId, analysis, totalDuration) {
    const { stepAnalysis, phases } = analysis;

    console.log('\n📊 PROGRESS TRACKING DEBUG REPORT');
    console.log('══════════════════════════════════════════════════════════════════════════════');
    console.log(`🔍 Job ID: ${jobId}`);
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('══════════════════════════════════════════════════════════════════════════════');

    // Prepare data for console.table
    const sortedSteps = stepAnalysis.sort((a, b) => a.actualTime - b.actualTime);

    const tableData = sortedSteps.map(step => ({
      Time: `${Math.round(step.actualTime / 1000)}s`,
      Phase: `${this.getPhaseIcon(step.phase)} ${step.phase}`,
      Message: step.message.length > 35 ? step.message.substring(0, 32) + '...' : step.message,
      'Expected %': `${step.expectedPercent}%`,
      'Actual %': `${step.actualPercent}%`,
      Accuracy: `${this.getAccuracyIcon(step.accuracy)} ${step.accuracy}%`,
    }));

    console.table(tableData);

    // Phase summary
    console.log('\n📈 PHASE ANALYSIS:');
    Object.entries(phases).forEach(([phaseName, phaseSteps]) => {
      if (phaseSteps.length > 0) {
        const avgAccuracy = Math.round(
          phaseSteps.reduce((sum, s) => sum + s.accuracy, 0) / phaseSteps.length
        );
        const phaseIcon = this.getPhaseIcon(phaseName);
        const accuracyIcon = this.getAccuracyIcon(avgAccuracy);
        console.log(
          `${phaseIcon} ${phaseName.toUpperCase().padEnd(15)} - Average Accuracy: ${accuracyIcon} ${avgAccuracy}%`
        );
      }
    });

    // Recommendations
    console.log('\n🔧 IMPROVEMENT RECOMMENDATIONS:');
    this.generateRecommendations(phases);

    console.log('══════════════════════════════════════════════════════════════════════════════\n');
  }

  /**
   * Get phase icon for display
   * @param {string} phase - Phase name
   * @returns {string} Icon character
   */
  static getPhaseIcon(phase) {
    const icons = {
      setup: '🚀',
      analysis: '🤖',
      recommendations: '💡',
      enhanced: '✨',
      reports: '📄',
    };
    return icons[phase] || '📋';
  }

  /**
   * Get accuracy icon based on percentage
   * @param {number} accuracy - Accuracy percentage
   * @returns {string} Icon character
   */
  static getAccuracyIcon(accuracy) {
    if (accuracy >= 95) return '✅';
    if (accuracy >= 80) return '⚠️';
    return '❌';
  }

  /**
   * Generate improvement recommendations based on phase analysis
   * @param {Object} phases - Phase analysis data
   */
  static generateRecommendations(phases) {
    let hasRecommendations = false;

    Object.entries(phases).forEach(([phaseName, phaseSteps]) => {
      if (phaseSteps.length === 0) return;

      const avgAccuracy = phaseSteps.reduce((sum, s) => sum + s.accuracy, 0) / phaseSteps.length;

      if (avgAccuracy < 80) {
        hasRecommendations = true;
        const avgActual = Math.round(
          phaseSteps.reduce((sum, s) => sum + s.actualPercent, 0) / phaseSteps.length
        );
        const avgExpected = Math.round(
          phaseSteps.reduce((sum, s) => sum + s.expectedPercent, 0) / phaseSteps.length
        );

        if (avgActual > avgExpected) {
          console.log(
            `  • ${phaseName.toUpperCase()} phase taking longer than expected - consider increasing allocation`
          );
        } else {
          console.log(
            `  • ${phaseName.toUpperCase()} phase faster than expected - consider decreasing allocation`
          );
        }
      }
    });

    if (!hasRecommendations) {
      console.log('  • Progress tracking appears well-calibrated! 🎯');
    }
  }
}
