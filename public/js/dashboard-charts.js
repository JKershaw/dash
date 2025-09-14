/**
 * Dashboard Charts - Chart Management and Controls
 * Chart functionality: setup, loading, rendering, controls, session flow
 */

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