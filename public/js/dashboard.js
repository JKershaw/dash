/**
 * Dashboard Page JavaScript
 * Handles dashboard initialization, data loading, and user interactions
 */

// localStorage utilities no longer needed - API keys persist via .env file

document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.API !== 'undefined') {
    initializeDashboard();
  }
});

// Cleanup polling interval on page unload to prevent memory leaks
window.addEventListener('beforeunload', function () {
  if (globalPollInterval) {
    clearInterval(globalPollInterval);
    globalPollInterval = null;
  }
});

// Also cleanup on page hide (mobile/tab switch)
window.addEventListener('pagehide', function () {
  if (globalPollInterval) {
    clearInterval(globalPollInterval);
    globalPollInterval = null;
  }
});

async function initializeDashboard() {
  document.getElementById('loadSessionsBtn').addEventListener('click', loadSessions);
  document.getElementById('filterToggleBtn').addEventListener('click', toggleFilterSection);
  document.getElementById('runAnalysisBtn').addEventListener('click', runAnalysis);
  document.getElementById('viewResultsBtn').addEventListener('click', viewResults);
  refreshData();
  // Check for any running jobs on page load
  checkForRunningJob();
  // API key now persists via .env file - no client-side restore needed
  // Check API configuration
  checkAPIConfiguration();
  // Check logs directory status
  checkLogsDirectoryStatus();
  // Load analysis history
  loadAnalysisHistory();
  // Initialize chart controls
  setupChartControls();
  // Load chart data
  loadChartData();
  
  // Setup history toggle button
  const historyToggleBtn = document.getElementById('historyToggleBtn');
  if (historyToggleBtn) {
    historyToggleBtn.addEventListener('click', function() {
      const historyDiv = document.getElementById('analysisHistory');
      const btn = this;
      const icon = btn.querySelector('i');
      const span = btn.querySelector('span');
      const isExpanded = historyDiv.classList.contains('history-expanded');
      
      if (isExpanded) {
        historyDiv.classList.remove('history-expanded');
        icon.className = 'bi bi-chevron-down me-1';
        const hiddenCount = document.querySelectorAll('.history-overflow').length;
        span.innerHTML = `Show All (<span id="hiddenCount">${hiddenCount}</span> more)`;
      } else {
        historyDiv.classList.add('history-expanded');
        icon.className = 'bi bi-chevron-up me-1';
        span.textContent = 'Show Less';
      }
    });
  }
}

// Auto-restore logic removed - API key persists via .env file and loads on server startup

async function refreshData(silent = false) {
  try {
    const data = await window.API.getDashboard();
    updateMetrics(data);
    
    // If we have sessions, also load project options for the dropdown
    if (data.totalSessions > 0) {
      console.log('🔍 DEBUG: Found existing sessions, loading project options...');
      loadProjectOptions();
    }
  } catch (error) {
    showStatusError(`Failed to refresh data: ${error.message}`, true);
  }
}

function updateMetrics(data) {
  document.getElementById('totalSessions').textContent = data.totalSessions || 0;
  document.getElementById('totalProjects').textContent = data.totalProjects || 0;
  document.getElementById('totalMessages').textContent = formatNumber(data.totalMessages || 0);
  const totalSeconds = data.stats?.totalDuration || 0;
  document.getElementById('avgDuration').textContent = formatDuration(totalSeconds);
}

function formatNumber(number) {
  return number.toLocaleString();
}

function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function viewResults() {
  console.log('📊 Navigating to results page...');
  window.location.href = '/results';
}

async function loadSessions() {
  const btn = document.getElementById('loadSessionsBtn');
  const originalText = btn.innerHTML;
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    console.log('🔍 DEBUG: Starting to load sessions...');
    await window.API.loadSessions();
    console.log('🔍 DEBUG: Sessions loaded successfully, setting up callbacks...');
    showStatusSuccess('Sessions loaded successfully');
    setTimeout(() => {
      console.log('🔍 DEBUG: Timeout callback executing - refreshing data and loading projects...');
      refreshData(true);
      // Load project options now that we have session data
      loadProjectOptions();
      // Check if we still have 0 sessions after loading
      checkLogsDirectoryStatus();
    }, 100);
  } catch (error) {
    console.error('🔍 DEBUG: Error loading sessions:', error);
    showStatusError(`Failed to load sessions: ${error.message}`, true);
    // Also check logs directory status on error
    checkLogsDirectoryStatus();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Global polling interval reference for cleanup
let globalPollInterval = null;

// Check for running jobs on page load
async function checkForRunningJob() {
  try {
    const response = await window.API.getAnalysis();
    if (response.jobs && response.jobs.length > 0) {
      // Find any job that's currently running
      const activeJob = response.jobs.find(
        j => j.status === 'started' || j.status === 'running' || j.status === 'in_progress' || j.status === 'processing'
      );

      if (activeJob) {
        console.log('Found active job:', activeJob.jobId);

        // Update UI to show job is running
        const btn = document.getElementById('runAnalysisBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running...';

        // Show progress section
        showProgressSection();

        // Resume polling for this job
        resumeJobPolling(activeJob.jobId);
      }
    }
  } catch (error) {
    console.warn('Could not check for running jobs:', error);
    // Silent fail - not critical for page load
  }
}

// Resume polling for an existing job
function resumeJobPolling(jobId) {
  console.log('Resuming polling for job:', jobId);

  // Start polling for progress
  const pollInterval = setInterval(async () => {
    try {
      const status = await window.API.getAnalysisStatus(jobId);
      updateProgressDisplay(status);

      if (status.status === 'completed') {
        clearInterval(pollInterval);
        globalPollInterval = null;
        const results = status.results || status;
        handleAnalysisComplete(results);
      } else if (status.status === 'failed') {
        clearInterval(pollInterval);
        globalPollInterval = null;
        handleAnalysisError(status.error || 'Analysis failed');
      }
    } catch (error) {
      console.warn('Progress polling error:', error);
      // Continue polling on network errors
    }
  }, 1500); // Poll every 1.5 seconds

  // Store global reference for cleanup
  globalPollInterval = pollInterval;
}

async function runAnalysis() {
  const btn = document.getElementById('runAnalysisBtn');
  const originalText = btn.innerHTML;
  let pollInterval = null;

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Starting...';

    // Get project filter selection
    const projectFilter = document.getElementById('projectFilter');
    const selectedProject = projectFilter ? projectFilter.value : '';
    
    // Build request options
    const options = { includeExecutiveSummary: true };
    const requestBody = { options };
    
    // Add filters if project is selected
    if (selectedProject && selectedProject.trim()) {
      // Extract project name from "project-name (N sessions)" format
      const projectName = selectedProject.replace(/\s*\(\d+\s+sessions?\)$/, '').trim();
      requestBody.filters = { project: projectName };
      console.log(`🎯 Running filtered analysis for project: "${projectName}"`);
    } else {
      console.log('🌐 Running comprehensive analysis (all projects)');
    }
    
    // Start analysis and capture job ID
    const response = await window.API.call('/api/analysis', {
      method: 'POST',
      body: JSON.stringify(requestBody)
    });
    const jobId = response.jobId;

    if (!jobId) {
      throw new Error('No job ID returned from analysis start');
    }

    // Show progress section
    showProgressSection();

    // Update button to show it's running
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running...';

    // Start polling for progress
    pollInterval = setInterval(async () => {
      try {
        const status = await window.API.getAnalysisStatus(jobId);
        updateProgressDisplay(status);

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          pollInterval = null;
          globalPollInterval = null;
          // Handle both status.results (from status API) and status itself (which contains the job data)
          const results = status.results || status;
          handleAnalysisComplete(results);
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          pollInterval = null;
          globalPollInterval = null;
          handleAnalysisError(status.error || 'Analysis failed');
        }
      } catch (error) {
        console.warn('Progress polling error:', error);
        // Continue polling on network errors - don't break the flow
      }
    }, 1500); // Poll every 1.5 seconds

    // Store global reference for cleanup
    globalPollInterval = pollInterval;
  } catch (error) {
    showStatusError(`Failed to start analysis: ${error.message}`, true);
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      globalPollInterval = null;
    }
    hideProgressSection();
  } finally {
    // Only re-enable button and reset text if polling has completed
    if (!pollInterval) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

function showStatusError(message, _showRetry) {
  console.log('🚨 showStatusError called with:', message);
  window.API.showError(message);
  console.log('✅ showStatusError: showError call completed');
}

function showStatusSuccess(message) {
  console.log('✅ showStatusSuccess called with:', message);
  window.API.showSuccess(message);
  console.log('✅ showStatusSuccess: showSuccess call completed');
}

function showLLMError(errorInfo) {
  console.log('🚨 showLLMError called with:', errorInfo);

  if (!errorInfo || !errorInfo.message) {
    console.log('❌ showLLMError: No error info or message, returning early');
    return;
  }

  // Show detailed error message with actionable advice
  const message = errorInfo.message;
  console.log('⚠️ showLLMError: Calling window.API.showToast with message:', message);

  // Use warning type for LLM errors since analysis still completed with fallback
  window.API.showToast(message, 'warning', 10000); // Show for 10 seconds

  console.log('✅ showLLMError: showToast call completed');

  // Also log to console for debugging
  console.warn('LLM Error Details:', errorInfo);
}

// Progress tracking functions
function showProgressSection() {
  const progressSection = document.getElementById('progressSection');
  if (progressSection) {
    progressSection.classList.remove('d-none');

    // Initialize progress display
    updateProgressElements(0, 'Starting analysis...', '');

    // Hide View Results button when starting new analysis
    hideViewResultsButton();
  }
}

function hideProgressSection() {
  const progressSection = document.getElementById('progressSection');
  if (progressSection) {
    progressSection.classList.add('d-none');
    // Hide View Results button when hiding progress section
    hideViewResultsButton();
  }
}

function showViewResultsButton() {
  const container = document.getElementById('viewResultsContainer');
  if (container) {
    container.classList.remove('d-none');
  }
}

function hideViewResultsButton() {
  const container = document.getElementById('viewResultsContainer');
  if (container) {
    container.classList.add('d-none');
  }
}

function toggleFilterSection() {
  const filterSection = document.getElementById('filterSection');
  const toggleBtn = document.getElementById('filterToggleBtn');
  
  if (filterSection.classList.contains('d-none')) {
    // Show filter section
    filterSection.classList.remove('d-none');
    toggleBtn.innerHTML = '<i class="bi bi-funnel-fill"></i>';
    toggleBtn.title = 'Hide Filter';
  } else {
    // Hide filter section
    filterSection.classList.add('d-none');
    toggleBtn.innerHTML = '<i class="bi bi-funnel"></i>';
    toggleBtn.title = 'Filter by Project';
  }
}

function updateProgressDisplay(status) {
  if (!status || !status.ui) {
    return;
  }

  const ui = status.ui;
  const progressData = ui.progressBar || {};
  const statusInfo = ui.status || {};
  const timing = ui.timing || {};
  const steps = ui.steps || [];
  const progress = status.progress || {};

  // Update progress bar and labels
  const percentage = Math.min(100, Math.max(0, progressData.percentage || 0));
  const message = statusInfo.message || 'Processing...';
  let details = statusInfo.details || '';
  const elapsed = timing.elapsedFormatted || '';

  // Add tool activity (without icons) to details
  if (ui.toolActivity) {
    const toolActivity = ui.toolActivity;
    let toolInfo = '';
    
    if (toolActivity.originalStep === 'tool:start') {
      toolInfo = toolActivity.message || `Using ${toolActivity.toolName || 'unknown tool'}`;
    } else if (toolActivity.originalStep === 'llm:round') {
      toolInfo = `Round ${toolActivity.round}: Processing ${toolActivity.toolCount} tools`;
    } else if (toolActivity.message) {
      toolInfo = toolActivity.message;
    }
    
    if (toolInfo) {
      details = details ? `${details} - ${toolInfo}` : toolInfo;
    }
  }
  
  // Add file processing info
  if (progress.filesProcessed && progress.totalFiles && progress.totalFiles > 0) {
    const fileInfo = `Processing file ${progress.filesProcessed} of ${progress.totalFiles}`;
    details = details ? `${details} - ${fileInfo}` : fileInfo;
  }

  // Append elapsed time to final details
  const detailsWithTime = details && elapsed ? `${details} (${elapsed})` : details || (elapsed ? `(${elapsed})` : '');

  updateProgressElements(percentage, message, detailsWithTime);

  // Update enhanced progress elements
  updateEnhancedProgress(steps, details, progress, ui.toolActivity);

  // Update progress bar color based on status
  const progressBarElement = document.getElementById('progressBar');
  if (progressBarElement) {
    // Reset classes
    progressBarElement.classList.remove('bg-success', 'bg-danger', 'bg-warning');

    if (progressData.isError) {
      progressBarElement.classList.add('bg-danger');
    } else if (progressData.hasLLMError) {
      progressBarElement.classList.add('bg-warning'); // Warning for completed-with-errors
    } else if (progressData.isComplete) {
      progressBarElement.classList.add('bg-success');
    } else {
      // Keep default blue color for in-progress
    }
  }
}

function updateProgressElements(percentage, message, details) {
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressPercent = document.getElementById('progressPercent');

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', percentage);
  }

  if (progressLabel) {
    // Show both message and details when both are available
    if (message && details) {
      progressLabel.textContent = `${message} - ${details}`;
    } else {
      progressLabel.textContent = details || message;
    }
  }

  if (progressPercent) {
    progressPercent.textContent = `${Math.round(percentage)}%`;
  }
}

function handleAnalysisComplete(results) {
  const btn = document.getElementById('runAnalysisBtn');
  const originalText = '<i class="bi bi-gear-wide me-2"></i>Run Analysis';

  // Check for LLM errors FIRST to preserve error progress states
  // Handle multiple API response formats and get actual error object
  let llmErrorObject = null;
  let hasLLMError = false;

  // Check each possible location for the actual error object
  if (results && results.results && results.results.llmError) {
    llmErrorObject = results.results.llmError;
    hasLLMError = true;
  } else if (results && results.result && results.result.llmError) {
    llmErrorObject = results.result.llmError;
    hasLLMError = true;
  } else if (
    results &&
    results.ui &&
    results.ui.progressBar &&
    results.ui.progressBar.hasLLMError
  ) {
    // For this case, we need to find the actual error object elsewhere
    hasLLMError = true;
    // Try to find the error object in results.results or results.result
    llmErrorObject = (results.results && results.results.llmError) ||
      (results.result && results.result.llmError) || {
        message: 'LLM service encountered an error during analysis',
      }; // Fallback
  }

  console.log('🔍 LLM Error Detection:', { hasLLMError, llmErrorObject });

  if (hasLLMError) {
    // Show error completion state - preserve any existing error progress
    const progressBar = document.getElementById('progressBar');
    if (progressBar && !progressBar.classList.contains('bg-danger')) {
      updateProgressElements(
        100,
        'Analysis completed with errors',
        'LLM service encountered issues'
      );
      progressBar.classList.remove('bg-success', 'bg-danger', 'bg-warning');
      progressBar.classList.add('bg-warning'); // Show warning color for completed-with-errors
    }
    // Show detailed LLM error to user with actual error object
    showLLMError(llmErrorObject);

    // Still show View Results button since analysis completed (with errors)
    showViewResultsButton();
  } else {
    // Only show success state if no errors
    updateProgressElements(100, 'Analysis completed successfully!', '');
    showStatusSuccess('Analysis completed successfully');

    // Show View Results button on successful completion
    showViewResultsButton();
  }

  // Keep progress visible but refresh data and re-enable button
  setTimeout(() => {
    refreshData(true);

    // Re-enable button
    btn.disabled = false;
    btn.innerHTML = originalText;
  }, 1500);
}

function updateEnhancedProgress(steps, details, progress, toolActivity = null) {
  // Update pipeline steps
  renderProgressSteps(steps);
  
  // Note: contextElement and filesElement no longer exist since we simplified the layout
  // All progress info now goes through the main progressLabel via updateProgressElements
}

function renderProgressSteps(steps) {
  const stepsContainer = document.getElementById('progressSteps');
  if (!stepsContainer || !steps || steps.length === 0) {
    return;
  }

  // Generate step indicators
  const stepElements = steps.map(step => {
    const statusIcon = getStepIcon(step.status);
    const stepClass = `progress-step ${step.status}`;

    return `<div class="${stepClass}" title="${step.label}">
      ${statusIcon} ${getStepShortLabel(step.label)}
    </div>`;
  });

  stepsContainer.innerHTML = stepElements.join('');
}

function getStepIcon(status) {
  switch (status) {
    case 'completed':
      return '✅';
    case 'processing':
      return '🔄';
    case 'failed':
      return '❌';
    default:
      return '⏳';
  }
}

function getStepShortLabel(label) {
  // Check if mobile screen
  const isMobile = window.innerWidth <= 576;

  if (isMobile) {
    // Even shorter labels for mobile
    const mobileLabels = {
      'Initialize directories': '1. Initialize',
      'Generate recommendations': '2. Recommendations',
      'Enhanced AI analysis': '3. AI Analysis',
      'Generate reports': '4. Generate reports',
    };
    return mobileLabels[label] || label;
  }

  // Shorten labels for compact display
  const shortLabels = {
    'Initialize directories': 'Init',
    'Generate recommendations': 'Recommendations',
    'Enhanced AI analysis': 'AI Analysis',
    'Generate reports': 'Reports',
  };
  return shortLabels[label] || label;
}

function handleAnalysisError(error) {
  const btn = document.getElementById('runAnalysisBtn');
  const originalText = '<i class="bi bi-gear-wide me-2"></i>Run Analysis';

  // Show error state
  updateProgressElements(0, 'Analysis failed', error || 'Unknown error occurred');

  // Clear enhanced progress
  const stepsContainer = document.getElementById('progressSteps');
  const contextElement = document.getElementById('progressContext');
  const filesElement = document.getElementById('progressFiles');

  if (stepsContainer) stepsContainer.innerHTML = '';
  if (contextElement) contextElement.textContent = '';
  if (filesElement) filesElement.textContent = '';

  // Update progress bar to red with proper class reset
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.classList.remove('bg-success', 'bg-danger', 'bg-warning');
    progressBar.classList.add('bg-danger');
  }

  // Show error message
  showStatusError(`Analysis failed: ${error}`, true);

  // Ensure View Results button stays hidden on error
  hideViewResultsButton();

  // Keep progress visible but re-enable button after delay
  setTimeout(() => {
    // Re-enable button
    btn.disabled = false;
    btn.innerHTML = originalText;
  }, 3000);
}

async function checkLogsDirectoryStatus() {
  try {
    const dashboardData = await window.API.getDashboard();

    // If we have processed sessions, hide any existing warning
    if (dashboardData.totalSessions > 0) {
      const alertElement = document.getElementById('logsDirectoryAlert');
      if (alertElement) {
        alertElement.classList.add('d-none');
      }
      return;
    }

    // If no processed sessions, check if raw logs exist
    const rawLogsData = await window.API.getLogsCount();
    
    // Only show warning if NO raw logs found
    if (rawLogsData.count === 0) {
      // Get current logs directory from config
      const configStatus = await window.API.getConfigStatus();

      if (configStatus.logsDirectory) {
        const alertElement = document.getElementById('logsDirectoryAlert');
        const pathElement = document.getElementById('logsDirectoryPath');

        // Show current logs directory path
        pathElement.textContent = configStatus.logsDirectory;

        // Show the alert
        alertElement.classList.remove('d-none');

        // Setup copy button (avoid duplicate event listeners)
        const copyBtn = document.getElementById('copyClaudePromptBtn');
        if (copyBtn && !copyBtn.hasAttribute('data-listener-added')) {
          copyBtn.addEventListener('click', () => {
            copyClaudePromptToClipboard();
          });
          copyBtn.setAttribute('data-listener-added', 'true');
        }
      }
    } else {
      // Raw logs exist but no processed sessions - hide warning
      // (user just needs to click "Load Sessions")
      const alertElement = document.getElementById('logsDirectoryAlert');
      if (alertElement) {
        alertElement.classList.add('d-none');
      }
    }
  } catch (error) {
    console.warn('Could not check logs directory status:', error);
  }
}

function copyClaudePromptToClipboard() {
  const promptText = document.getElementById('claudePromptText').textContent.trim();
  const copyBtn = document.getElementById('copyClaudePromptBtn');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(promptText)
      .then(() => {
        // Update button to show success
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Copied!';
        copyBtn.classList.remove('btn-outline-secondary');
        copyBtn.classList.add('btn-success');

        // Reset button after 2 seconds
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('btn-success');
          copyBtn.classList.add('btn-outline-secondary');
        }, 2000);

        window.API.showToast(
          'Claude prompt copied to clipboard! Paste it in a new Claude conversation.',
          'success',
          3000
        );
      })
      .catch(err => {
        console.warn('Could not copy to clipboard:', err);
        window.API.showToast(
          'Could not copy to clipboard. Please select and copy the text manually.',
          'warning',
          5000
        );
      });
  } else {
    // Fallback: select the text
    const textElement = document.getElementById('claudePromptText');
    if (window.getSelection && document.createRange) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textElement);
      selection.removeAllRanges();
      selection.addRange(range);
      window.API.showToast('Text selected. Use Ctrl+C (or Cmd+C) to copy.', 'info', 5000);
    } else {
      window.API.showToast('Please select and copy the prompt text manually.', 'warning', 5000);
    }
  }
}

async function checkAPIConfiguration() {
  try {
    const status = await window.API.getConfigStatus();
    if (!status.apiKeyValid) {
      const warningElement = document.getElementById('apiKeyWarning');
      warningElement.classList.remove('d-none');
    } else {
      // Hide warning if API key is valid
      const warningElement = document.getElementById('apiKeyWarning');
      warningElement.classList.add('d-none');
    }
  } catch (error) {
    console.warn('Could not check API configuration:', error);
  }
}

/**
 * Load available project options into the project filter dropdown
 */
async function loadProjectOptions() {
  console.log('🔍 DEBUG: loadProjectOptions() called');
  
  try {
    const projectFilter = document.getElementById('projectFilter');
    if (!projectFilter) {
      console.warn('🔍 DEBUG: projectFilter element not found');
      return;
    }
    console.log('🔍 DEBUG: projectFilter element found');

    // Get projects from API
    console.log('🔍 DEBUG: Calling window.API.getProjects()...');
    const data = await window.API.getProjects();
    console.log('🔍 DEBUG: API response received:', data);
    
    // Clear existing options except "All Projects"
    projectFilter.innerHTML = '<option value="">All Projects (Comprehensive Analysis)</option>';
    console.log('🔍 DEBUG: Reset dropdown to default option');
    
    if (data.projects && data.projects.length > 0) {
      console.log(`🔍 DEBUG: Processing ${data.projects.length} projects...`);
      data.projects.forEach((project, index) => {
        console.log(`🔍 DEBUG: Adding project ${index + 1}:`, project);
        const option = document.createElement('option');
        option.value = project.name;
        option.textContent = `${project.name} (${project.sessionCount} sessions)`;
        projectFilter.appendChild(option);
      });
      console.log(`🔍 DEBUG: Successfully added ${data.projects.length} project options`);
    } else {
      console.warn('🔍 DEBUG: No projects found in API response');
      console.log('🔍 DEBUG: data.projects is:', data.projects);
    }
    
    console.log(`📊 Loaded ${data.projects?.length || 0} projects for filtering`);
    console.log('🔍 DEBUG: Final dropdown HTML:', projectFilter.innerHTML);
  } catch (error) {
    console.error('🔍 DEBUG: Error in loadProjectOptions():', error);
    console.error('🔍 DEBUG: Error stack:', error.stack);
    // Graceful degradation - filter dropdown will show only "All Projects" option
  }
}

/**
 * Load analysis history
 */
async function loadAnalysisHistory() {
  try {
    const historyData = await window.API.getAnalysisHistory();
    updateAnalysisHistory(historyData);
  } catch (error) {
    console.warn('❌ Could not load analysis history:', error);
    const tbody = document.querySelector('#analysisHistory tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Failed to load analysis history</td></tr>';
    }
  }
}

/**
 * Update the analysis history table display
 */
function updateAnalysisHistory(historyData) {
  const tbody = document.querySelector('#analysisHistory tbody');
  const INITIAL_SHOW = 5;

  if (!historyData || !historyData.runs || historyData.runs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center text-muted">No analysis runs found</td></tr>';
    document.getElementById('historyToggle').classList.add('d-none');
    return;
  }

  // First: Apply the meaningful sessions filter (remove tiny sessions)
  const filteredRuns = historyData.runs.filter((run, index) => {
    // Always show the most recent run (index 0), filter others by duration
    return index === 0 || run.duration > 5000;
  });

  // Then: Render the filtered runs with overflow classes for collapsible display
  tbody.innerHTML = filteredRuns
    .map((run, mapIndex) => {
      const date = new Date(run.startTime);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const duration = Math.round(run.duration / 1000) + 's';

      // Status badge styling
      const statusBadge =
        run.status === 'success'
          ? '<span class="badge bg-success">Success</span>'
          : '<span class="badge bg-danger">Failed</span>';

      // LLM calls with icon
      const llmCallsText =
        run.llmCallsTotal > 0
          ? `<span class="text-primary">${run.llmCallsTotal}</span>`
          : `<span class="text-muted">${run.llmCallsTotal}</span>`;

      // All runs show "View" button since this is on the dashboard
      const isLatestRun = mapIndex === 0;

      // All runs get a View button
      const viewButton = `<a href="/results/${run.id}" class="btn btn-sm btn-outline-primary">View</a>`;

      // Project filter display
      let projectDisplay;
      if (run.projectFilter) {
        projectDisplay = `<span class="badge bg-info" title="Filtered Analysis">${run.projectFilter}</span>`;
      } else {
        projectDisplay = `<span class="text-muted small" title="Comprehensive Analysis">All</span>`;
      }

      // Add overflow class to rows beyond initial display count
      const overflowClass = mapIndex >= INITIAL_SHOW ? 'history-overflow' : '';

      return `
      <tr class="${isLatestRun ? 'table-success' : ''} ${overflowClass}">
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${run.sessionsAnalyzed}</td>
        <td>${projectDisplay}</td>
        <td>${duration}</td>
        <td>${llmCallsText}</td>
        <td>${statusBadge}</td>
        <td>${viewButton}</td>
      </tr>
    `;
    })
    .join('');

  // Show toggle button if we have overflow rows
  const overflowCount = filteredRuns.length - INITIAL_SHOW;
  const toggleSection = document.getElementById('historyToggle');
  const hiddenCountSpan = document.getElementById('hiddenCount');
  
  if (overflowCount > 0) {
    toggleSection.classList.remove('d-none');
    hiddenCountSpan.textContent = overflowCount;
  } else {
    toggleSection.classList.add('d-none');
  }
}

// ============================================================================
// Chart Management Functions (moved from results.js)
// ============================================================================

function setupChartControls() {
  // Chart view toggle (charts vs flow)
  const chartViewRadios = document.querySelectorAll('input[name="chartView"]');
  if (chartViewRadios.length > 0) {
    chartViewRadios.forEach(radio => {
      radio.addEventListener('change', handleChartViewToggle);
    });
  }

  // Chart data toggle
  const chartDataRadios = document.querySelectorAll('input[name="chartData"]');
  if (chartDataRadios.length > 0) {
    chartDataRadios.forEach(radio => {
      radio.addEventListener('change', updateChart);
    });
  }

  // X-axis toggle
  const xAxisRadios = document.querySelectorAll('input[name="xAxis"]');
  if (xAxisRadios.length > 0) {
    xAxisRadios.forEach(radio => {
      radio.addEventListener('change', updateChart);
    });
  }
}

async function loadChartData(_force = false) {
  console.log('📈 Loading chart data...');

  try {
    const chartData = await window.API.getCharts();

    // Initialize and set chart data
    if (!window.chartManager) {
      window.chartManager = new ChartManager('chartContainer');
      window.chartManager.init();
    }
    window.chartManager.setData(chartData);

    // Update chart config based on current controls
    updateChart();
  } catch (error) {
    console.error('❌ Failed to load chart data:', error);
    const container = document.getElementById('chartContainer');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Failed to load chart data: ${error.message}
        </div>
      `;
    }
  }
}

function updateChart() {
  // Only update config if chart is initialized
  if (!window.chartManager) return;

  // Get current config from controls
  const dataTypeElement = document.querySelector('input[name="chartData"]:checked');
  const xAxisElement = document.querySelector('input[name="xAxis"]:checked');
  
  if (!dataTypeElement || !xAxisElement) return;

  const dataType = dataTypeElement.value;
  const xAxisType = xAxisElement.value;

  // Update chart with current configuration
  window.chartManager.updateConfig({
    dataType: dataType,
    xAxis: xAxisType,
    project: '', // No project filter for now
  });
}

async function handleChartViewToggle(event) {
  const selectedView = event.target.value;
  console.log('📊 Switching chart view to:', selectedView);

  const chartContainer = document.getElementById('chartContainer');
  const flowContainer = document.getElementById('flowContainer');
  const chartControlsRow = chartContainer
    ?.closest('.card-body')
    ?.querySelector('.row:has(input[name="chartData"])');

  if (selectedView === 'charts') {
    // Show bar charts, hide flow
    if (chartContainer) chartContainer.classList.remove('d-none');
    if (flowContainer) flowContainer.classList.add('d-none');
    if (chartControlsRow) chartControlsRow.classList.remove('d-none');
  } else if (selectedView === 'flow') {
    // Show flow, hide bar charts
    if (chartContainer) chartContainer.classList.add('d-none');
    if (flowContainer) flowContainer.classList.remove('d-none');
    if (chartControlsRow) chartControlsRow.classList.add('d-none');

    // Lazy load flow chart on first selection
    if (!window.sessionFlowChartLoaded) {
      console.log('🎨 Loading session flow chart for first time...');
      try {
        await loadSessionFlowChart();
        window.sessionFlowChartLoaded = true;
      } catch (error) {
        console.error('❌ Failed to load session flow chart:', error);
        showFlowChartError(`Failed to load flow chart: ${error.message}`);
      }
    } else if (
      window.sessionFlowChart &&
      typeof window.sessionFlowChart.handleVisibilityChange === 'function'
    ) {
      // Chart already loaded, handle visibility change
      window.sessionFlowChart.handleVisibilityChange();
    }
  }
}

// Session Flow Chart Management
async function loadSessionFlowChart() {
  console.log('🎨 Initializing Session Flow Chart...');
  console.log('🔍 Debug: SessionFlowChart type:', typeof window.SessionFlowChart);
  console.log('🔍 Debug: window.sessionFlowChart exists:', !!window.sessionFlowChart);

  try {
    // Always create a fresh SessionFlowChart instance
    if (!window.sessionFlowChart || typeof window.sessionFlowChart.loadData !== 'function') {
      if (typeof window.SessionFlowChart !== 'undefined') {
        console.log('📦 Creating new SessionFlowChart instance...');
        window.sessionFlowChart = new window.SessionFlowChart('sessionFlowChart');
        console.log('✅ SessionFlowChart instance created:', typeof window.sessionFlowChart);
        console.log('✅ loadData method available:', typeof window.sessionFlowChart.loadData);
      } else {
        throw new Error('SessionFlowChart class not available - charts.js may not be loaded');
      }
    } else {
      console.log('📦 Using existing SessionFlowChart instance');
      console.log('🔍 Debug: existing instance type:', typeof window.sessionFlowChart);
      console.log('🔍 Debug: existing instance keys:', Object.keys(window.sessionFlowChart || {}));
      console.log(
        '🔍 Debug: loadData exists on existing:',
        typeof window.sessionFlowChart.loadData
      );
    }

    // Load and render chart
    await loadAndRenderFlowChart();
  } catch (error) {
    console.error('❌ Failed to initialize session flow chart:', error);
    showFlowChartError(`Initialization failed: ${error.message}`);
  }
}

async function loadAndRenderFlowChart() {
  try {
    console.log('🔄 Loading session flow chart data...');
    // Loading state already visible from template - no need to show again

    // Load all sessions (no limit)
    console.log('📊 Requesting all sessions for flow chart');

    const data = await window.sessionFlowChart.loadData({ limit: 1000 }); // High limit to get all sessions
    console.log('📊 Received session flow data:', data);

    // Render chart first
    window.sessionFlowChart.render({});

    // Then hide loading states and show chart
    console.log('🔄 Hiding loading states and showing chart...');
    hideFlowChartStates();

    console.log(
      `✅ Successfully rendered session flow chart with ${data.metadata.totalSessions} sessions`
    );
  } catch (error) {
    console.error('❌ Failed to load session flow chart:', error);
    showFlowChartError(`Failed to load session flow data: ${error.message}`);
  }
}

// Flow chart UI state management - simplified
function showFlowChartError(message) {
  const loading = document.getElementById('flowChartLoading');
  const error = document.getElementById('flowChartError');
  const errorMessage = document.getElementById('flowChartErrorMessage');
  const chart = document.getElementById('sessionFlowChart');

  if (loading) loading.classList.add('d-none');
  if (error) error.classList.remove('d-none');
  if (errorMessage) errorMessage.textContent = message;
  if (chart) chart.classList.add('d-none');
}

function hideFlowChartStates() {
  console.log('🔍 hideFlowChartStates: Looking for elements...');
  const loading = document.getElementById('flowChartLoading');
  const error = document.getElementById('flowChartError');
  const chart = document.getElementById('sessionFlowChart');

  console.log('🔍 Elements found:', {
    loading: !!loading,
    error: !!error,
    chart: !!chart,
  });

  if (loading) {
    console.log('🔍 Loading element classes before:', loading.className);
    loading.classList.remove('d-flex');
    loading.classList.add('d-none');
    console.log('🔍 Loading element classes after:', loading.className);
  }
  if (error) error.classList.add('d-none');
  if (chart) {
    console.log('🔍 Chart element classes before:', chart.className);
    chart.classList.remove('d-none');
    console.log('🔍 Chart element classes after:', chart.className);
  }
}

// Global function for reset zoom button
function resetFlowZoom() {
  if (window.sessionFlowChart && typeof window.sessionFlowChart.resetZoom === 'function') {
    console.log('🔄 Resetting flow chart zoom');
    window.sessionFlowChart.resetZoom();
  } else {
    console.warn('⚠️ Session flow chart not available or resetZoom method not found');
  }
}

// Make resetFlowZoom globally available
window.resetFlowZoom = resetFlowZoom;
