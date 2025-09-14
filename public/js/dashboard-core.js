/**
 * Dashboard Core - Initialization and Data Management
 * Core functionality: initialization, data loading, utilities
 */

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

  // Use appropriate toast type based on error severity
  const toastType = errorInfo.critical > 0 ? 'error' : 'warning';
  const duration = errorInfo.critical > 0 ? 15000 : 10000; // Critical errors show longer
  
  window.API.showToast(message, toastType, duration);

  console.log('✅ showLLMError: showToast call completed');

  // Also log to console for debugging
  console.warn('Analysis Error Details:', errorInfo);
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