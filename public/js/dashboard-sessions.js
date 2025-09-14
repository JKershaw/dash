/**
 * Dashboard Sessions - Sessions, History, and Project Management
 * Session functionality: loading sessions, managing history, project filtering
 */

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
      // Refresh chart data after loading sessions
      loadChartData();
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