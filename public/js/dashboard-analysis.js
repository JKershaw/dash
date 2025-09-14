/**
 * Dashboard Analysis - Analysis Execution and Progress Management
 * Analysis functionality: running analysis, progress tracking, completion handling
 */

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
        // Always use status (which has .ui) instead of status.results (which is just progress data)
        handleAnalysisComplete(status);
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
          // Always use status (which has .ui) instead of status.results (which is just progress data)
          handleAnalysisComplete(status);
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

  // Call updateProgressDisplay to apply final progress bar colors
  if (results && results.ui) {
    updateProgressDisplay(results);
  } else {
    updateProgressElements(100, 'Analysis completed!', '');
  }

  // Show appropriate completion message based on error status
  const hasWarnings = results.ui?.progressBar?.hasLLMError;
  const hasErrors = results.ui?.progressBar?.isError;
  
  if (hasErrors) {
    showStatusError('Analysis completed with errors');
  } else if (hasWarnings) {
    showStatusSuccess('Analysis completed with warnings - check results page for details');
  } else {
    showStatusSuccess('Analysis completed successfully');
  }
  
  showViewResultsButton();

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