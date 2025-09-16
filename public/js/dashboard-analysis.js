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
  try {
    if (!status || !status.ui) {
      console.warn('updateProgressDisplay: Missing status or UI data');
      return;
    }

    // Defensive extraction with fallbacks
    const ui = safeObjectAccess(status, 'ui', {});
    const progressData = safeObjectAccess(ui, 'progressBar', {});
    const statusInfo = safeObjectAccess(ui, 'status', {});
    const timing = safeObjectAccess(ui, 'timing', {});
    const steps = safeArrayAccess(ui, 'steps', []);
    const progress = safeObjectAccess(status, 'progress', {});

    // Validate and clamp percentage with enhanced bounds checking
    const rawPercentage = safeNumberAccess(progressData, 'percentage', 0);
    const percentage = validateProgressPercentage(rawPercentage);
    
    // Extract messages with enhanced fallbacks
    const message = safeStringAccess(statusInfo, 'message', 'Processing...');
    let details = safeStringAccess(statusInfo, 'details', '');
    const elapsed = safeStringAccess(timing, 'elapsedFormatted', '');

    // Phase-aware detail building - prioritize most relevant info for current phase
    let phaseSpecificDetails = [];
    
    // Enhanced tool activity handling with error resistance (highest priority for LLM phases)
    try {
      const toolActivity = ui.toolActivity;
      if (toolActivity && typeof toolActivity === 'object') {
        const toolInfo = extractToolActivityInfo(toolActivity);
        if (toolInfo) {
          phaseSpecificDetails.push(toolInfo);
        }
      }
    } catch (toolError) {
      console.warn('updateProgressDisplay: Tool activity parsing failed', toolError);
    }
    
    // Enhanced file processing info (only show during analyzeSessions phase)
    try {
      const fileInfo = getFileProcessingInfo(progress);
      if (fileInfo && (percentage < 11 || message.toLowerCase().includes('session'))) {
        phaseSpecificDetails.push(fileInfo);
      }
    } catch (fileError) {
      console.warn('updateProgressDisplay: File processing info failed', fileError);
    }

    // Enhanced sub-phase progress info (lower priority - only if no other details)
    try {
      if (phaseSpecificDetails.length === 0) {
        const subPhaseInfo = getSubPhaseProgressInfo(progress);
        if (subPhaseInfo) {
          phaseSpecificDetails.push(subPhaseInfo);
        }
      }
    } catch (subPhaseError) {
      console.warn('updateProgressDisplay: Sub-phase info failed', subPhaseError);
    }

    // Combine base details with phase-specific details
    if (details && phaseSpecificDetails.length > 0) {
      details = `${details} - ${phaseSpecificDetails[0]}`; // Only use most relevant detail
    } else if (phaseSpecificDetails.length > 0) {
      details = phaseSpecificDetails[0]; // Use most relevant detail
    }

    // Append elapsed time to final details
    const detailsWithTime = combineDetailsWithTime(details, elapsed);

    updateProgressElements(percentage, message, detailsWithTime);

    // Update enhanced progress elements with error handling
    try {
      updateEnhancedProgress(steps, details, progress, ui.toolActivity);
    } catch (enhancedError) {
      console.warn('updateProgressDisplay: Enhanced progress update failed', enhancedError);
    }

    // Update progress bar color based on status with enhanced error detection
    updateProgressBarStyling(progressData);

  } catch (error) {
    console.error('updateProgressDisplay: Critical error in progress display', error);
    // Fallback to basic progress display
    try {
      updateProgressElements(0, 'Progress display error - retrying...', 'Please refresh if this persists');
    } catch (fallbackError) {
      console.error('updateProgressDisplay: Even fallback failed', fallbackError);
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

// Enhanced resilience helper functions for declarative progress system
function safeObjectAccess(obj, key, fallback = {}) {
  try {
    return (obj && typeof obj === 'object' && obj[key] && typeof obj[key] === 'object') ? obj[key] : fallback;
  } catch (error) {
    console.warn(`safeObjectAccess: Failed to access ${key}`, error);
    return fallback;
  }
}

function safeArrayAccess(obj, key, fallback = []) {
  try {
    return (obj && typeof obj === 'object' && Array.isArray(obj[key])) ? obj[key] : fallback;
  } catch (error) {
    console.warn(`safeArrayAccess: Failed to access ${key}`, error);
    return fallback;
  }
}

function safeNumberAccess(obj, key, fallback = 0) {
  try {
    const value = obj && typeof obj === 'object' ? obj[key] : fallback;
    return typeof value === 'number' && !isNaN(value) ? value : fallback;
  } catch (error) {
    console.warn(`safeNumberAccess: Failed to access ${key}`, error);
    return fallback;
  }
}

function safeStringAccess(obj, key, fallback = '') {
  try {
    const value = obj && typeof obj === 'object' ? obj[key] : fallback;
    return typeof value === 'string' ? value : fallback;
  } catch (error) {
    console.warn(`safeStringAccess: Failed to access ${key}`, error);
    return fallback;
  }
}

function validateProgressPercentage(percentage) {
  // Enhanced percentage validation with known phase bounds
  if (typeof percentage !== 'number' || isNaN(percentage)) {
    console.warn('validateProgressPercentage: Invalid percentage type', percentage);
    return 0;
  }
  
  const clamped = Math.min(100, Math.max(0, percentage));
  
  // Warn about suspicious percentage jumps (could indicate progress calculation issues)
  if (Math.abs(percentage - clamped) > 0.1) {
    console.warn('validateProgressPercentage: Percentage clamped', { original: percentage, clamped });
  }
  
  return clamped;
}

function extractToolActivityInfo(toolActivity) {
  try {
    if (!toolActivity || typeof toolActivity !== 'object') return '';
    
    const originalStep = safeStringAccess(toolActivity, 'originalStep', '');
    const message = safeStringAccess(toolActivity, 'message', '');
    const toolName = safeStringAccess(toolActivity, 'toolName', '');
    const round = safeNumberAccess(toolActivity, 'round', 0);
    const toolCount = safeNumberAccess(toolActivity, 'toolCount', 0);
    
    if (originalStep === 'tool:start') {
      return message || `Using ${toolName || 'unknown tool'}`;
    } else if (originalStep === 'llm:round') {
      return `Round ${round}: Processing ${toolCount} tools`;
    } else if (message) {
      return message;
    }
    
    return '';
  } catch (error) {
    console.warn('extractToolActivityInfo: Failed to extract tool activity', error);
    return '';
  }
}

function getFileProcessingInfo(progress) {
  try {
    // Handle existing file progress format
    const filesProcessed = safeNumberAccess(progress, 'filesProcessed', 0);
    const totalFiles = safeNumberAccess(progress, 'totalFiles', 0);
    
    if (filesProcessed > 0 && totalFiles > 0) {
      return `Processing file ${filesProcessed} of ${totalFiles}`;
    }
    
    // Handle new sub-phase file progress format
    const fileProgress = safeObjectAccess(progress, 'fileProgress', null);
    if (fileProgress) {
      const processed = safeNumberAccess(fileProgress, 'processed', 0);
      const total = safeNumberAccess(fileProgress, 'total', 0);
      
      if (processed >= 0 && total > 0) {
        return `File processing: ${processed}/${total} sessions`;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('getFileProcessingInfo: Failed to get file processing info', error);
    return null;
  }
}

// Keep old function for backward compatibility
function addFileProcessingInfo(progress, details) {
  const fileInfo = getFileProcessingInfo(progress);
  return fileInfo ? (details ? `${details} - ${fileInfo}` : fileInfo) : details;
}

function getSubPhaseProgressInfo(progress) {
  try {
    // Handle new sub-phase progress information from declarative system
    const currentStep = safeNumberAccess(progress, 'currentStep', 0);
    const totalSteps = safeNumberAccess(progress, 'totalSteps', 0);
    const subPhase = safeStringAccess(progress, 'subPhase', '');
    
    if (currentStep > 0 && totalSteps > 0 && subPhase) {
      return `${subPhase}: step ${currentStep}/${totalSteps}`;
    }
    
    return null;
  } catch (error) {
    console.warn('getSubPhaseProgressInfo: Failed to get sub-phase info', error);
    return null;
  }
}

// Keep old function for backward compatibility
function addSubPhaseProgressInfo(progress, details) {
  const subPhaseInfo = getSubPhaseProgressInfo(progress);
  return subPhaseInfo ? (details ? `${details} - ${subPhaseInfo}` : subPhaseInfo) : details;
}

function combineDetailsWithTime(details, elapsed) {
  try {
    if (!details && !elapsed) return '';
    if (!details) return elapsed ? `(${elapsed})` : '';
    if (!elapsed) return details;
    return `${details} (${elapsed})`;
  } catch (error) {
    console.warn('combineDetailsWithTime: Failed to combine details', error);
    return details || '';
  }
}

function updateProgressBarStyling(progressData) {
  try {
    const progressBarElement = document.getElementById('progressBar');
    if (!progressBarElement) {
      console.warn('updateProgressBarStyling: Progress bar element not found');
      return;
    }

    // Reset classes safely
    const classesToReset = ['bg-success', 'bg-danger', 'bg-warning'];
    classesToReset.forEach(cls => {
      try {
        progressBarElement.classList.remove(cls);
      } catch (error) {
        console.warn(`updateProgressBarStyling: Failed to remove class ${cls}`, error);
      }
    });

    // Apply new styling based on status
    const isError = progressData && progressData.isError;
    const hasLLMError = progressData && progressData.hasLLMError;
    const isComplete = progressData && progressData.isComplete;
    
    if (isError) {
      progressBarElement.classList.add('bg-danger');
    } else if (hasLLMError) {
      progressBarElement.classList.add('bg-warning');
    } else if (isComplete) {
      progressBarElement.classList.add('bg-success');
    }
    // Default blue color maintained for in-progress
    
  } catch (error) {
    console.error('updateProgressBarStyling: Critical styling error', error);
  }
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