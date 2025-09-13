/**
 * @file Progress State Management
 * Centralized progress tracking with testable state management
 */

export class ProgressState {
  constructor(steps) {
    this.steps = new Map(steps.map(s => [s, 'pending']));
    this.percentage = 0;
    this.message = '';
    this.details = '';
    this.currentStep = null;
  }

  /**
   * Update step status and recalculate percentage
   * @param {string} stepName - Step identifier
   * @param {string} status - Step status (pending/in_progress/completed/error)
   * @param {Object} data - Additional step data
   * @returns {Object} Update result
   */
  updateStep(stepName, status, data = {}) {
    if (this.steps.has(stepName)) {
      this.steps.set(stepName, status);
      this.currentStep = stepName;
      this.calculatePercentage();
      return { stepName, status, ...data };
    }
    return null;
  }

  /**
   * Set progress percentage and message
   * @param {number} percentage - Progress percentage (0-100)
   * @param {string} message - Progress message
   * @param {string} details - Additional details
   */
  setProgress(percentage, message, details = '') {
    if (percentage !== null && percentage !== undefined) {
      this.percentage = Math.max(0, Math.min(100, percentage));
    }
    if (message) this.message = message;
    if (details) this.details = details;
  }

  /**
   * Calculate percentage based on completed steps
   */
  calculatePercentage() {
    const completed = Array.from(this.steps.values()).filter(s => s === 'completed').length;
    this.percentage = Math.round((completed / this.steps.size) * 100);
  }

  /**
   * Get current progress state
   * @returns {Object} Complete progress state
   */
  getState() {
    return {
      steps: Object.fromEntries(this.steps),
      percentage: this.percentage,
      message: this.message,
      details: this.details,
      currentStep: this.currentStep
    };
  }

  /**
   * Reset progress to initial state
   */
  reset() {
    this.steps.forEach((_, key) => this.steps.set(key, 'pending'));
    this.percentage = 0;
    this.message = '';
    this.details = '';
    this.currentStep = null;
  }

  /**
   * Check if all steps are completed
   * @returns {boolean} True if all steps completed
   */
  isComplete() {
    return Array.from(this.steps.values()).every(status => status === 'completed');
  }

  /**
   * Check if any step has error status
   * @returns {boolean} True if any step has error
   */
  hasError() {
    return Array.from(this.steps.values()).some(status => status === 'error');
  }
}