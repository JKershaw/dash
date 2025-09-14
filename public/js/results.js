/**
 * Results Page JavaScript
 * Handles results page initialization, data loading, and chart management
 */
/* global ChartManager */

// Check if we're viewing a specific analysis run
const CURRENT_RUN_ID = window.CURRENT_RUN_ID || null;

document.addEventListener('DOMContentLoaded', function () {
  console.log('📊 Results page loaded');

  if (CURRENT_RUN_ID) {
    console.log(`📊 Viewing specific analysis run: ${CURRENT_RUN_ID}`);
  } else {
    console.log('📊 Viewing latest analysis results');
  }

  if (typeof window.API !== 'undefined') {
    initializeResults();
  } else {
    console.error('❌ API client not available');
  }
});

function initializeResults() {
  // Initialize chat
  setupChatInterface();

  // Initial data load
  loadResultsData();
}


async function loadResultsData() {
  console.log('📊 Loading results data...');

  try {
    // Determine API calls based on whether we're viewing a specific run
    let apiCalls;

    if (CURRENT_RUN_ID) {
      // Load specific analysis run data
      apiCalls = [
        window.API.getDashboard(), // Dashboard data always from latest (for metrics structure)
        window.API.call(`/api/reports/executive-summary?runId=${CURRENT_RUN_ID}`),
        window.API.call(`/api/reports/narrative-summary?runId=${CURRENT_RUN_ID}`),
        window.API.call(`/api/reports/recommendations?runId=${CURRENT_RUN_ID}`),
      ];
    } else {
      // Load latest analysis data (existing behavior)
      apiCalls = [
        window.API.getDashboard(),
        window.API.getExecutiveSummary(),
        window.API.getNarrativeSummary(),
        window.API.getRecommendationsReport(),
      ];
    }

    // Load all data in parallel
    const [
      analysisData,
      executiveSummary,
      narrativeSummary,
      recommendationsReport,
    ] = await Promise.all(apiCalls);

    // Update all sections
    updateAllSummaries(executiveSummary, narrativeSummary, recommendationsReport);
    loadAnalysisMetadata();
  } catch (error) {
    console.error('❌ Failed to load results:', error);
    showStatusError(`Failed to load results: ${error.message}`, true);
  }
}


function updateAllSummaries(
  executiveSummaryData,
  narrativeSummaryData,
  recommendationsReportData
) {
  // Check if MarkdownService is available
  const markdownService = window.MarkdownService;
  if (!markdownService) {
    console.error('MarkdownService not available');
    return;
  }

  // Update Executive Summary Tab - SECURITY: Use safe markdown rendering
  const executiveContainer = document.getElementById('executiveSummary');
  if (executiveSummaryData.executiveSummary) {
    // Backend now provides markdown, render it safely with downgraded headers
    markdownService.renderMarkdownToElement(executiveContainer, executiveSummaryData.executiveSummary, {
      downgradeHeaders: true
    });
  } else {
    executiveContainer.innerHTML =
      '<p class="text-muted">No executive summary available. Run analysis to generate comprehensive insights.</p>';
  }

  // Update Narrative Summary Tab - SECURITY: Use safe markdown rendering
  const narrativeContainer = document.getElementById('narrativeSummary');
  if (narrativeSummaryData.narrativeSummary) {
    // Backend now provides markdown, render it safely with downgraded headers
    markdownService.renderMarkdownToElement(narrativeContainer, narrativeSummaryData.narrativeSummary, {
      downgradeHeaders: true
    });
  } else {
    narrativeContainer.innerHTML =
      '<p class="text-muted">No narrative summary available. Run analysis to generate comprehensive insights.</p>';
  }

  // Update Recommendations Report Tab - SECURITY: Use safe markdown rendering
  const recommendationsContainer = document.getElementById('recommendationsReport');
  if (recommendationsReportData.recommendationsReport) {
    // Backend now provides markdown, render it safely with downgraded headers
    markdownService.renderMarkdownToElement(recommendationsContainer, recommendationsReportData.recommendationsReport, {
      downgradeHeaders: true
    });
  } else {
    recommendationsContainer.innerHTML =
      '<p class="text-muted">No recommendations report available. Run analysis to generate comprehensive insights.</p>';
  }

  // Update AI Insights Tab (Enhanced Analysis) - SECURITY: Use unified markdown rendering
  const enhancedContainer = document.getElementById('enhancedAnalysis');
  if (executiveSummaryData.enhancedAnalysis && typeof executiveSummaryData.enhancedAnalysis === 'string') {
    // Enhanced analysis is now always in markdown format - render directly
    markdownService.renderMarkdownToElement(enhancedContainer, executiveSummaryData.enhancedAnalysis, {
      downgradeHeaders: true
    });
  } else {
    enhancedContainer.innerHTML = '<p class="text-muted">No enhanced analysis available. Run analysis to generate AI insights.</p>';
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
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Failed to load chart data: ${error.message}
      </div>
    `;
  }
}

function updateChart() {
  // Only update config if chart is initialized
  if (!window.chartManager) return;

  // Get current config from controls
  const dataType = document.querySelector('input[name="chartData"]:checked').value;
  const xAxisType = document.querySelector('input[name="xAxis"]:checked').value;

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
    .closest('.card-body')
    .querySelector('.row:has(input[name="chartData"])');

  if (selectedView === 'charts') {
    // Show bar charts, hide flow
    chartContainer.classList.remove('d-none');
    flowContainer.classList.add('d-none');
    if (chartControlsRow) chartControlsRow.classList.remove('d-none');
  } else if (selectedView === 'flow') {
    // Show flow, hide bar charts
    chartContainer.classList.add('d-none');
    flowContainer.classList.remove('d-none');
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

async function loadAnalysisMetadata() {
  console.log('📊 Loading analysis metadata...');
  const container = document.getElementById('analysisMetadata');
  if (!container) return;

  try {
    let apiCall;
    if (CURRENT_RUN_ID) {
      apiCall = window.API.call(`/api/analysis/metadata?runId=${CURRENT_RUN_ID}`);
    } else {
      apiCall = window.API.getAnalysisMetadata();
    }

    const metadata = await apiCall;
    updateAnalysisMetadataDisplay(container, metadata);
  } catch (error) {
    console.warn('❌ Could not load analysis metadata:', error);
    container.innerHTML = `
      <div class="text-center text-muted py-3">
        <i class="bi bi-exclamation-circle me-2"></i>
        No analysis metadata available. Run an analysis to see detailed information here.
      </div>
    `;
  }
}

function updateAnalysisMetadataDisplay(container, metadata) {
  if (!metadata || !metadata.run) {
    container.innerHTML = `
      <div class="text-center text-muted py-3">
        <i class="bi bi-info-circle me-2"></i>
        No detailed analysis metadata found.
      </div>
    `;
    return;
  }

  const run = metadata.run;
  const processing = metadata.processing || {};
  const performance = metadata.performance || {};
  const summary = metadata.summary || {};
  const computed = metadata.computed || {};
  const input = metadata.input || {};

  const startTime = run.startTime ? new Date(run.startTime) : null;
  const endTime = run.endTime ? new Date(run.endTime) : null;
  const formattedStart = startTime
    ? startTime.toLocaleDateString() + ' ' + startTime.toLocaleTimeString()
    : 'Unknown';
  const formattedEnd = endTime
    ? endTime.toLocaleDateString() + ' ' + endTime.toLocaleTimeString()
    : 'Unknown';

  // Status badge
  let statusBadge;
  if (computed.hasErrors) {
    statusBadge =
      '<span class="badge bg-warning"><i class="bi bi-exclamation-triangle me-1"></i>Completed with errors</span>';
  } else if (summary.success) {
    statusBadge =
      '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Successful</span>';
  } else {
    statusBadge = '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Failed</span>';
  }

  // Filter badge
  const appliedFilters = input?.options?.filters;
  let filterBadge = '';
  if (appliedFilters?.project) {
    filterBadge = `
      <div class="alert alert-info mb-3">
        <i class="bi bi-funnel-fill me-2"></i>
        <strong>Filtered Analysis:</strong> 
        Limited to project "<em>${appliedFilters.project}</em>"
      </div>
    `;
  } else {
    filterBadge = `
      <div class="alert alert-secondary mb-3">
        <i class="bi bi-globe me-2"></i>
        <strong>Comprehensive Analysis:</strong> 
        All projects included
      </div>
    `;
  }

  container.innerHTML = `
    <div class="row g-4">
      <!-- Filter Information -->
      <div class="col-12">
        ${filterBadge}
      </div>

      <!-- Analysis Run Overview -->
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-1">
              <i class="bi bi-play-circle me-2"></i>
              Analysis Run ${run.id ? run.id.substring(0, 8) + '...' : 'Unknown'}
            </h6>
            <p class="mb-0 text-muted small">Version: ${run.version || 'Unknown'}</p>
          </div>
          <div>
            ${statusBadge}
          </div>
        </div>
      </div>
      
      <!-- Timing Information -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-clock text-primary me-2"></i>
              Timing Information
            </h6>
            <div class="mb-2">
              <small class="text-muted">Started:</small><br>
              <span class="text-dark">${formattedStart}</span>
            </div>
            <div class="mb-2">
              <small class="text-muted">Completed:</small><br>
              <span class="text-dark">${formattedEnd}</span>
            </div>
            <div class="mb-0">
              <small class="text-muted">Duration:</small><br>
              <span class="text-primary fw-bold">${computed.totalDurationFormatted || 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Processing Statistics -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-gear text-success me-2"></i>
              Processing Statistics
            </h6>
            <div class="row g-2">
              <div class="col-6">
                <small class="text-muted">Pipeline Phases:</small><br>
                <span class="text-dark fw-bold">${computed.phaseCount || 0}</span>
              </div>
              <div class="col-6">
                <small class="text-muted">Sessions Parsed:</small><br>
                <span class="text-dark fw-bold">${metadata.input?.sessionsLoaded || 0}</span>
              </div>
              <div class="col-6">
                <small class="text-muted">Output Files:</small><br>
                <span class="text-dark fw-bold">${computed.outputFileCount || 0}</span>
              </div>
              <div class="col-6">
                <small class="text-muted">Errors:</small><br>
                <span class="${computed.hasErrors ? 'text-warning' : 'text-success'} fw-bold">
                  ${metadata.errors?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- LLM Usage Statistics -->
      <div class="col-12">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-cpu text-info me-2"></i>
              AI/LLM Usage
            </h6>
            ${
              computed.hasLLMCalls
                ? `
            <div class="row g-3">
              <div class="col-md-2">
                <small class="text-muted">Total AI Calls:</small><br>
                <span class="text-primary fw-bold">${computed.totalLLMCalls || 0}</span>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Total Tokens:</small><br>
                <span class="text-primary fw-bold">${computed.totalTokens?.toLocaleString() || 0}</span>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Input Tokens:</small><br>
                <span class="text-info fw-bold">${computed.totalInputTokens?.toLocaleString() || 0}</span>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Output Tokens:</small><br>
                <span class="text-success fw-bold">${computed.totalOutputTokens?.toLocaleString() || 0}</span>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Simple Calls:</small><br>
                <span class="text-dark">${metadata.summary?.llmUsage?.strategies?.simple?.calls || 0} calls</span>
              </div>
              <div class="col-md-2">
                <small class="text-muted">Agentic Calls:</small><br>
                <span class="text-dark">${metadata.summary?.llmUsage?.strategies?.agentic?.calls || 0} calls</span>
              </div>
            </div>
            `
                : `
            <div class="alert alert-info mb-0">
              <i class="bi bi-info-circle me-2"></i>
              <strong>AI Analytics Not Used</strong><br>
              <small>This analysis was run without AI/LLM enhancement. 
              To enable AI-powered insights, ensure the ANTHROPIC_API_KEY 
              environment variable is set.</small>
            </div>
            `
            }
          </div>
        </div>
      </div>

      <!-- Environment Information -->
      <div class="col-12">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">
              <i class="bi bi-laptop text-secondary me-2"></i>
              Environment
            </h6>
            <div class="row g-3">
              <div class="col-md-3">
                <small class="text-muted">Node Version:</small><br>
                <span class="text-dark">${metadata.environment?.nodeVersion || 'Unknown'}</span>
              </div>
              <div class="col-md-3">
                <small class="text-muted">Platform:</small><br>
                <span class="text-dark">${metadata.environment?.platform || 'Unknown'}</span>
              </div>
              <div class="col-md-6">
                <small class="text-muted">Working Directory:</small><br>
                <span class="text-dark font-monospace small">${metadata.environment?.workingDirectory || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      ${computed.hasErrors ? `
      <!-- Error Details -->
      <div class="col-12">
        <div class="card border-warning">
          <div class="card-body">
            <h6 class="card-title text-warning">
              <i class="bi bi-exclamation-triangle me-2"></i>
              Analysis Issues (${metadata.errors.length})
            </h6>
            <div class="accordion accordion-flush" id="errorAccordion">
              ${metadata.errors.map((error, index) => `
                <div class="accordion-item">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" 
                            data-bs-toggle="collapse" data-bs-target="#error${index}" 
                            aria-expanded="false" aria-controls="error${index}">
                      <i class="bi bi-clock me-2 text-muted"></i>
                      ${error.phase || 'Unknown Phase'}: ${error.message || 'Unknown error'}
                      <span class="badge bg-warning ms-auto">${new Date(error.timestamp).toLocaleTimeString()}</span>
                    </button>
                  </h2>
                  <div id="error${index}" class="accordion-collapse collapse" data-bs-parent="#errorAccordion">
                    <div class="accordion-body">
                      <p><strong>Error:</strong> ${error.message}</p>
                      ${error.phase ? `<p><strong>Phase:</strong> ${error.phase}</p>` : ''}
                      ${error.context ? `<p><strong>Context:</strong> ${error.context}</p>` : ''}
                      <small class="text-muted">Time: ${new Date(error.timestamp).toLocaleString()}</small>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="alert alert-warning mt-3 mb-0">
              <i class="bi bi-info-circle me-2"></i>
              These errors occurred during analysis but did not prevent completion. 
              Fallback content was used where necessary.
            </div>
          </div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}


// Error handling utilities
function showStatusError(message, showRetry = false) {
  const statusContainer = document.getElementById('statusMessages');
  const retryButton = showRetry
    ? `
    <button class="btn btn-outline-primary btn-sm ms-2" onclick="loadResultsData()">
      <i class="bi bi-arrow-clockwise me-1"></i>Retry
    </button>
  `
    : '';

  statusContainer.innerHTML = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      <strong>Error:</strong> ${message}
      ${retryButton}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function _showStatusSuccess(message) {
  const statusContainer = document.getElementById('statusMessages');
  statusContainer.innerHTML = `
    <div class="alert alert-success alert-dismissible fade show" role="alert">
      <i class="bi bi-check-circle-fill me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;

  // Auto-dismiss success messages after 3 seconds
  setTimeout(() => {
    const alert = statusContainer.querySelector('.alert-success');
    if (alert) alert.remove();
  }, 3000);
}

// Session Flow Chart Management
function setupSessionFlowControls() {
  // No controls - minimal design
  // All sessions shown in black by default
}

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

// Chat functionality
let currentConversationId = null;

function setupChatInterface() {
  console.log('💬 Setting up chat interface...');
  
  const chatForm = document.getElementById('chatInputForm');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendChatBtn');
  
  if (!chatForm || !chatInput || !sendBtn) {
    console.warn('⚠️ Chat interface elements not found');
    return;
  }
  
  // Add welcome message
  addWelcomeMessage();
  
  // Handle form submission
  chatForm.addEventListener('submit', handleChatSubmit);
  
  // Handle Enter key in input
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit(e);
    }
  });
  
  console.log('✅ Chat interface initialized');
}

function addWelcomeMessage() {
  const welcomeMessage = {
    role: 'assistant',
    content: `Welcome to the Claude Code Analysis Chat! 

I can help you explore your sessions and answer questions like:
• "Show me sessions with struggles"
• "Which projects have the most activity?"  
• "Find sessions related to [keyword]"
• "What are the main patterns in my development workflow?"

Ask me questions about your Claude Code sessions and patterns.`,
    timestamp: new Date()
  };
  
  addMessageToChat(welcomeMessage);
}

async function handleChatSubmit(e) {
  e.preventDefault();
  
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendChatBtn');
  const message = chatInput.value.trim();
  
  if (!message) {
    return; // Don't send empty messages
  }
  
  // Add user message to chat
  addMessageToChat({
    role: 'user', 
    content: message,
    timestamp: new Date()
  });
  
  // Clear input and show immediate progress feedback
  chatInput.value = '';
  setSendButtonLoading(true);
  
  // Show immediate progress indicator
  const progressIndicator = createProgressIndicator();
  const chatContainer = document.querySelector('#chatMessages');
  if (chatContainer) {
    chatContainer.appendChild(progressIndicator);
  }
  
  let progressInterval = null;
  
  try {
    console.log(`💬 DEBUG: Sending chat message to API (non-blocking)...`);
    
    // Send message to API (non-blocking) - returns immediately with conversation ID
    const response = await window.API.sendChatMessage(message, currentConversationId);
    
    console.log(`📥 DEBUG: Got conversation ID: ${response.conversationId}`);
    
    // Update conversation ID for next message
    currentConversationId = response.conversationId;
    
    // Start simplified progress polling that handles everything
    progressInterval = startSimplifiedProgressPolling(response.conversationId, progressIndicator);
    
  } catch (error) {
    console.error('❌ Chat error:', error);
    
    // Clean up progress polling  
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    
    // Remove progress indicator
    if (progressIndicator && progressIndicator.parentNode) {
      progressIndicator.remove();
    }
    
    // Add error message to chat
    addMessageToChat({
      role: 'error',
      content: 'Sorry, there was an error processing your message. Please try again.',
      timestamp: new Date()
    });
    
    // Reset button state and return focus
    setSendButtonLoading(false);
    chatInput.focus();
    
    window.API.showError(`Chat error: ${error.message}`);
  }
  // No finally block needed - cleanup handled by simplified polling
}

function addMessageToChat(message) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const messageElement = document.createElement('div');
  messageElement.className = `chat-message ${message.role} mb-3`;
  
  const timestamp = message.timestamp.toLocaleTimeString();
  
  let messageClass = '';
  let icon = '';
  
  switch (message.role) {
    case 'user':
      messageClass = 'bg-primary text-white ms-auto';
      icon = '<i class="bi bi-person-fill me-2"></i>';
      break;
    case 'assistant':
      messageClass = 'bg-white border';
      icon = '<i class="bi bi-robot me-2"></i>';
      break;
    case 'error':
      messageClass = 'bg-danger text-white';
      icon = '<i class="bi bi-exclamation-triangle me-2"></i>';
      break;
  }
  
  messageElement.innerHTML = `
    <div class="card ${messageClass}" style="max-width: 80%;">
      <div class="card-body py-2 px-3">
        <div class="d-flex align-items-start">
          ${icon}
          <div class="flex-grow-1">
            <div class="message-content">${formatMessageContent(message.content)}</div>
            <small class="message-timestamp text-muted d-block mt-1" style="font-size: 0.75em;">
              ${timestamp}
            </small>
          </div>
        </div>
      </div>
    </div>
  `;
  
  chatMessages.appendChild(messageElement);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMessageContent(content) {
  // SECURITY: Use MarkdownService for safe rendering instead of regex
  const markdownService = window.MarkdownService;
  
  if (markdownService) {
    return markdownService.renderMarkdown(content);
  }
  
  // Fallback: Basic HTML escaping only
  console.warn('MarkdownService not available, using basic HTML escaping for chat');
  const div = document.createElement('div');
  div.textContent = content;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function setSendButtonLoading(isLoading) {
  const sendBtn = document.getElementById('sendChatBtn');
  const chatInput = document.getElementById('chatInput');
  
  if (!sendBtn || !chatInput) return;
  
  if (isLoading) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Thinking...';
    chatInput.disabled = true;
  } else {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="bi bi-send me-1"></i>Send';
    chatInput.disabled = false;
  }
}

/**
 * Start progress monitoring for chat request using polling
 * @param {string} conversationId - Chat conversation ID
 * @returns {number} The polling interval ID
 */
function startChatProgress(conversationId) {
  const sendBtn = document.getElementById('sendChatBtn');
  const progressIndicator = createProgressIndicator();
  
  // Insert progress indicator
  const chatContainer = document.querySelector('#chatMessages');
  if (chatContainer) {
    chatContainer.appendChild(progressIndicator);
  }

  // Start polling for progress updates
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/chat/${conversationId}/progress`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const progress = await response.json();
      
      if (!progress.success) {
        throw new Error(progress.error || 'Progress request failed');
      }
      
      // Update progress display
      updateProgressIndicator(progressIndicator, progress);
      
      // Check if chat is complete
      if (progress.phase === 'complete') {
        // Chat complete - clean up
        clearInterval(pollInterval);
        progressIndicator.remove();
      }
      
    } catch (error) {
      console.warn('Error fetching progress:', error);
      
      // Clean up and fallback to static "Thinking..."
      clearInterval(pollInterval);
      progressIndicator.remove();
      sendBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Thinking...';
    }
  }, 500); // Poll every 500ms
  
  return pollInterval;
}

/**
 * Simplified progress polling that handles everything sequentially
 * @param {string} conversationId - Chat conversation ID  
 * @param {Element} progressIndicator - Existing progress indicator element
 * @returns {number} The polling interval ID
 */
function startSimplifiedProgressPolling(conversationId, progressIndicator) {
  console.log(`🔍 DEBUG: Starting simplified progress polling for: ${conversationId}`);
  
  const pollInterval = setInterval(async () => {
    try {
      // Poll for progress updates
      const progressResponse = await fetch(`/api/chat/${conversationId}/progress`);
      
      if (progressResponse.ok) {
        const progress = await progressResponse.json();
        console.log(`📊 DEBUG: Progress phase: ${progress.phase}, message: "${progress.message}"`);
        
        if (progress.success) {
          // Update progress display
          updateProgressIndicator(progressIndicator, progress);
          
          // When progress shows complete, get the result and finish
          if (progress.phase === 'complete') {
            console.log(`✅ DEBUG: Progress complete, fetching result...`);
            
            try {
              const resultResponse = await fetch(`/api/chat/${conversationId}/result`);
              const result = await resultResponse.json();
              
              if (result.status === 'completed') {
                // Success! Clean up and show result
                clearInterval(pollInterval);
                if (progressIndicator && progressIndicator.parentNode) {
                  progressIndicator.remove();
                }
                
                addMessageToChat({
                  role: 'assistant',
                  content: result.response,
                  timestamp: new Date(result.timestamp)
                });
                
                setSendButtonLoading(false);
                document.getElementById('chatInput')?.focus();
                
              } else if (result.status === 'error') {
                throw new Error(result.error || 'Chat processing failed');
              }
              // If still processing, continue polling
              
            } catch (resultError) {
              console.error('❌ DEBUG: Result fetch failed:', resultError);
              throw resultError;
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ DEBUG: Progress polling failed:', error);
      
      // Clean up on error
      clearInterval(pollInterval);
      if (progressIndicator && progressIndicator.parentNode) {
        progressIndicator.remove();
      }
      
      addMessageToChat({
        role: 'error',
        content: 'Sorry, there was an error processing your message. Please try again.',
        timestamp: new Date()
      });
      
      setSendButtonLoading(false);
      document.getElementById('chatInput')?.focus();
    }
  }, 500);
  
  return pollInterval;
}

/**
 * OLD: Start progress polling with existing progress indicator
 * @param {string} conversationId - Chat conversation ID  
 * @param {Element} progressIndicator - Existing progress indicator element
 * @returns {number} The polling interval ID
 */
function startProgressPolling(conversationId, progressIndicator) {
  const sendBtn = document.getElementById('sendChatBtn');

  console.log(`🔍 DEBUG: Starting progress polling for conversation ID: ${conversationId}`);

  // Start polling for progress updates
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/chat/${conversationId}/progress`);
      
      if (!response.ok) {
        console.warn(`❌ DEBUG: Progress HTTP ${response.status}: ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const progress = await response.json();
      console.log(`📊 DEBUG: Progress data received:`, progress);
      
      if (!progress.success) {
        console.warn(`❌ DEBUG: Progress failed:`, progress.error);
        throw new Error(progress.error || 'Progress request failed');
      }
      
      // Update progress display
      console.log(`🔄 DEBUG: Updating progress indicator with message: "${progress.message}", phase: "${progress.phase}"`);
      updateProgressIndicator(progressIndicator, progress);
      
      // With non-blocking API, don't remove progress indicator on 'complete' phase
      // The result polling will handle cleanup when the actual result is ready
      if (progress.phase === 'complete') {
        // Show final completion message but keep indicator visible
        console.log(`✅ DEBUG: Progress complete, but keeping indicator for result polling`);
      }
      
    } catch (error) {
      console.warn('Error fetching progress:', error);
      
      // Clean up and fallback to static "Thinking"
      clearInterval(pollInterval);
      if (progressIndicator && progressIndicator.parentNode) {
        progressIndicator.remove();
      }
      sendBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Thinking';
    }
  }, 500); // Poll every 500ms
  
  return pollInterval;
}

/**
 * Create progress indicator element
 */
function createProgressIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'alert alert-info d-flex align-items-center mb-3';
  indicator.style.fontSize = '0.9em';
  indicator.innerHTML = `
    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
    <span class="progress-message">Processing your question</span>
  `;
  return indicator;
}

/**
 * Update progress indicator with current status
 */
function updateProgressIndicator(indicator, progress) {
  const messageElement = indicator.querySelector('.progress-message');
  const newMessage = progress.message || 'Processing';
  
  console.log(`🎨 DEBUG: updateProgressIndicator called with:`, {
    phase: progress.phase,
    message: progress.message,
    newMessage: newMessage,
    elementFound: !!messageElement
  });
  
  messageElement.textContent = newMessage;
  
  // Add phase-specific styling
  if (progress.phase === 'tool:start') {
    indicator.className = 'alert alert-primary d-flex align-items-center mb-3';
    console.log(`🎨 DEBUG: Applied tool:start styling`);
  } else if (progress.phase === 'llm:synthesis') {
    indicator.className = 'alert alert-success d-flex align-items-center mb-3';
    console.log(`🎨 DEBUG: Applied llm:synthesis styling`);
  }
}

