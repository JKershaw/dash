/**
 * Dash - API Client Library
 * Centralized API wrapper with error handling and loading states
 */
/* global AbortController, URLSearchParams */

// Global API object
window.API = (function () {
  'use strict';

  // Base configuration
  const BASE_URL = ''; // Use relative URLs since we're on same domain
  const DEFAULT_TIMEOUT = 0; // No timeout for long operations

  // Loading state management
  let loadingCount = 0;
  const loadingCallbacks = [];

  // Utility: Update loading state
  function updateLoadingState(isLoading) {
    if (isLoading) {
      loadingCount++;
    } else {
      loadingCount = Math.max(0, loadingCount - 1);
    }

    const loading = loadingCount > 0;
    loadingCallbacks.forEach(callback => callback(loading));
  }

  // Add loading state listener
  function onLoadingChange(callback) {
    loadingCallbacks.push(callback);
  }

  // HTTP wrapper with error handling
  async function apiCall(endpoint, options = {}) {
    const url = BASE_URL + endpoint;
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: DEFAULT_TIMEOUT,
    };

    const requestOptions = { ...defaultOptions, ...options };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId =
      requestOptions.timeout > 0
        ? setTimeout(() => controller.abort(), requestOptions.timeout)
        : null;
    requestOptions.signal = controller.signal;

    updateLoadingState(true);

    try {
      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${requestOptions.timeout}ms`);
      }

      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    } finally {
      updateLoadingState(false);
    }
  }

  // Dashboard API (updated to use reports endpoints)
  function getDashboard() {
    return apiCall('/api/reports/dashboard');
  }

  function getRecommendations() {
    return apiCall('/api/reports/recommendations');
  }

  function getExecutiveSummary() {
    return apiCall('/api/reports/executive-summary');
  }

  function getNarrativeSummary() {
    return apiCall('/api/reports/narrative-summary');
  }

  function getAnalysisReport() {
    return apiCall('/api/reports/analysis');
  }

  function getRecommendationsReport() {
    return apiCall('/api/reports/recommendations');
  }

  function getCharts() {
    return apiCall('/api/charts');
  }

  function getMetadata() {
    return apiCall('/api/metadata');
  }

  function getAnalysisMetadata() {
    return apiCall('/api/analysis/metadata');
  }

  function getProjects() {
    return apiCall('/api/projects');
  }

  // Sessions API
  function getSessions(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/api/sessions?${queryString}` : '/api/sessions';
    return apiCall(endpoint);
  }

  function loadSessions() {
    return apiCall('/api/sessions', {
      method: 'POST',
    });
  }

  function getSession(sessionId) {
    return apiCall(`/api/sessions/${sessionId}`);
  }

  function getSessionScript(sessionId) {
    return apiCall(`/api/sessions/${sessionId}/script`);
  }

  // Analysis API
  function getAnalysis() {
    return apiCall('/api/analysis');
  }

  function runAnalysis(options = {}) {
    return apiCall('/api/analysis', {
      method: 'POST',
      body: JSON.stringify({ options }),
    });
  }

  function getAnalysisJob(jobId) {
    return apiCall(`/api/analysis/${jobId}`);
  }

  // Keep getAnalysisStatus for frontend compatibility
  function getAnalysisStatus(jobId) {
    return getAnalysisJob(jobId);
  }

  function getAnalysisHistory() {
    return apiCall('/api/analysis/history');
  }

  // Logs API
  function getLogsCount() {
    return apiCall('/api/logs/count');
  }

  function getLogs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/api/logs?${queryString}` : '/api/logs';
    return apiCall(endpoint);
  }

  function getLogContent(logId) {
    return apiCall(`/api/logs/${logId}/content`);
  }

  // Configuration
  function getConfigStatus() {
    return apiCall('/api/config/status');
  }

  function setTemporaryApiKey(apiKey) {
    return apiCall('/api/config/temporary-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  function validateDirectory(directory) {
    return apiCall('/api/config/validate-directory', {
      method: 'POST',
      body: JSON.stringify({ directory }),
    });
  }

  function setTemporaryDirectory(directory) {
    return apiCall('/api/config/temporary-directory', {
      method: 'POST',
      body: JSON.stringify({ directory }),
    });
  }

  function clearTemporaryDirectory() {
    return apiCall('/api/config/temporary-directory', {
      method: 'DELETE',
    });
  }

  // Chat API
  function sendChatMessage(message, conversationId = null) {
    return apiCall('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    });
  }

  // Health check
  function getHealth() {
    return apiCall('/health');
  }

  // Utility functions
  function showError(message, container) {
    showToast(message, 'danger', 8000);
  }

  function showSuccess(message, container) {
    showToast(message, 'success', 5000);
  }

  function showToast(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
      console.warn('Alert container not found, falling back to legacy method');
      showLegacyAlert(message, type);
      return;
    }

    const alertId = 'alert-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const iconClass =
      type === 'danger'
        ? 'bi-exclamation-triangle-fill'
        : type === 'success'
          ? 'bi-check-circle-fill'
          : type === 'warning'
            ? 'bi-exclamation-triangle'
            : 'bi-info-circle-fill';

    const alertClass =
      type === 'danger'
        ? 'alert-danger'
        : type === 'success'
          ? 'alert-success'
          : type === 'warning'
            ? 'alert-warning'
            : 'alert-primary';

    const titleText =
      type === 'danger'
        ? 'Error'
        : type === 'success'
          ? 'Success'
          : type === 'warning'
            ? 'Warning'
            : 'Info';

    const alertHtml = `
      <div id="${alertId}" class="alert ${alertClass} alert-dismissible fade show mb-2" role="alert" style="box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <div class="d-flex align-items-start">
          <i class="bi ${iconClass} me-2 flex-shrink-0" style="font-size: 1.1em; margin-top: 1px;"></i>
          <div class="flex-grow-1">
            <strong>${titleText}:</strong> ${message}
          </div>
          <button type="button" class="btn-close ms-2 flex-shrink-0" data-alert-id="${alertId}" aria-label="Close"></button>
        </div>
      </div>
    `;

    alertContainer.insertAdjacentHTML('beforeend', alertHtml);

    const alertElement = document.getElementById(alertId);

    // Add click handler for manual dismiss
    const closeBtn = alertElement.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => {
      dismissAlert(alertElement);
    });

    // Auto-dismiss after duration
    setTimeout(() => {
      if (alertElement.parentElement) {
        dismissAlert(alertElement);
      }
    }, duration);
  }

  function dismissAlert(alertElement) {
    if (!alertElement) return;

    // Add fade out animation
    alertElement.classList.remove('show');
    alertElement.classList.add('fade');

    // Remove after animation completes
    setTimeout(() => {
      if (alertElement.parentElement) {
        alertElement.remove();
      }
    }, 150); // Bootstrap fade transition duration
  }

  function showLegacyAlert(message, type) {
    const alertClass =
      type === 'danger'
        ? 'alert-danger'
        : type === 'success'
          ? 'alert-success'
          : type === 'warning'
            ? 'alert-warning'
            : 'alert-info';

    const iconClass =
      type === 'danger'
        ? 'bi-exclamation-triangle-fill'
        : type === 'success'
          ? 'bi-check-circle-fill'
          : type === 'warning'
            ? 'bi-exclamation-triangle'
            : 'bi-info-circle-fill';

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x`;
    alertDiv.style.zIndex = '1056';
    alertDiv.style.marginTop = '1rem';
    alertDiv.innerHTML = `
      <i class="bi ${iconClass} me-2"></i>
      <strong>${type === 'danger' ? 'Error:' : type === 'success' ? 'Success:' : 'Info:'}</strong> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(
      () => {
        if (alertDiv.parentElement) {
          alertDiv.remove();
        }
      },
      type === 'danger' ? 8000 : 5000
    );
  }

  function setLoadingState(element, isLoading) {
    if (isLoading) {
      element.classList.add('loading');
      element.style.pointerEvents = 'none';
    } else {
      element.classList.remove('loading');
      element.style.pointerEvents = '';
    }
  }

  // Public API
  return {
    // Dashboard
    getDashboard,
    getRecommendations,
    getExecutiveSummary,
    getNarrativeSummary,
    getAnalysisReport,
    getRecommendationsReport,
    getCharts,
    getMetadata,
    getAnalysisMetadata,
    getProjects,

    // Sessions
    getSessions,
    loadSessions,
    getSession,
    getSessionScript,

    // Analysis
    getAnalysis,
    runAnalysis,
    getAnalysisJob,
    getAnalysisStatus, // Frontend compatibility
    getAnalysisHistory,

    // Logs
    getLogsCount,
    getLogs,
    getLogContent,

    // Configuration
    getConfigStatus,
    setTemporaryApiKey,
    validateDirectory,
    setTemporaryDirectory,
    clearTemporaryDirectory,

    // Chat
    sendChatMessage,

    // Health
    getHealth,

    // Utilities
    showError,
    showSuccess,
    showToast,
    setLoadingState,
    onLoadingChange,

    // Direct access to low-level API call (for custom endpoints)
    call: apiCall,
  };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
  console.log('✅ API client library initialized');

  // Set up global loading indicator if present
  const globalSpinner = document.querySelector('#global-spinner');
  if (globalSpinner) {
    window.API.onLoadingChange(function (isLoading) {
      globalSpinner.style.display = isLoading ? 'block' : 'none';
    });
  }
});
