/**
 * D3.js Bar Chart Implementation for Claude Code Session Analysis
 * Shows session duration as bars with simple session count on x-axis
 */
/* global d3 */

class ChartManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = d3.select(`#${containerId}`);
    this.svg = null;
    this.width = 0;
    this.height = 400;
    this.margin = { top: 20, right: 30, bottom: 50, left: 60 };
    this.data = null;
    this.currentConfig = {
      dataType: 'messages', // Match HTML default (messages checked)
      xAxis: 'timeline', // Default to timeline view
      project: '', // No project filter initially
    };
  }

  init() {
    console.log('📈 Initializing D3 bar chart...');

    // Clear container
    this.container.html('');

    // Get container dimensions
    const containerRect = this.container.node().getBoundingClientRect();
    this.width = Math.max(600, containerRect.width - this.margin.left - this.margin.right);
    this.height = 400 - this.margin.top - this.margin.bottom;

    // Create SVG
    this.svg = this.container
      .append('svg')
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Add grid group first (so bars appear on top)
    this.svg.append('g').attr('class', 'grid-y');

    // Add axis groups
    this.svg.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${this.height})`);

    this.svg.append('g').attr('class', 'y-axis');

    // Add axis labels
    this.svg
      .append('text')
      .attr('class', 'x-label')
      .attr('transform', `translate(${this.width / 2}, ${this.height + 40})`)
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('fill', '#666')
      .text('Session Number');

    this.svg
      .append('text')
      .attr('class', 'y-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - this.margin.left)
      .attr('x', 0 - this.height / 2)
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('fill', '#666')
      .text('Duration (minutes)');

    console.log('✅ D3 chart initialized');
  }

  setData(chartData) {
    this.data = chartData;
    console.log('📊 Chart data set:', chartData);
  }

  updateConfig(config) {
    this.currentConfig = { ...this.currentConfig, ...config };
    console.log('⚙️ Chart config updated:', this.currentConfig);
    this.render();
  }

  render() {
    if (!this.data || !this.data.chartData || !this.data.chartData.data) {
      this.showMessage('No chart data available');
      return;
    }

    try {
      const processedData = this.processData();

      if (processedData.length === 0) {
        this.showMessage('No data matches current filters');
        return;
      }

      this.renderChart(processedData);
    } catch (error) {
      console.error('❌ Chart render error:', error);
      this.showMessage(`Chart error: ${error.message}`);
    }
  }

  processData() {
    const { dataType, project } = this.currentConfig;
    const chartData = this.data.chartData;

    if (!chartData || !chartData.data || !chartData.data.datasets) {
      return [];
    }

    // Find the appropriate dataset - look for first dataset with sessionInfo
    let dataset = null;
    for (const ds of chartData.data.datasets) {
      if (ds.sessionInfo && ds.sessionInfo.length > 0) {
        dataset = ds;
        break;
      }
    }

    if (!dataset || !dataset.sessionInfo) {
      console.warn('No dataset with sessionInfo found');
      return [];
    }

    // Process sessions into chart-ready data
    let processedData = dataset.sessionInfo.map((session, index) => {
      // Get the value based on data type
      const value =
        dataType === 'messages'
          ? session.messageCount || 0
          : session.duration || session.rawDuration || 0;

      // Extract date from fullSessionId (format: session-YYYYMMDD-HHMMSS)
      let date = new Date(); // Default fallback
      if (session.fullSessionId) {
        const timeMatch = session.fullSessionId.match(/session-(\d{8})-(\d{6})/);
        if (timeMatch) {
          const [, dateStr, timeStr] = timeMatch;
          const year = dateStr.substring(0, 4);
          const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-indexed
          const day = dateStr.substring(6, 8);
          const hour = timeStr.substring(0, 2);
          const minute = timeStr.substring(2, 4);
          const second = timeStr.substring(4, 6);
          date = new Date(year, month, day, hour, minute, second);
        }
      }

      return {
        index: index,
        sessionNumber: index + 1, // Simple 1, 2, 3... numbering
        sessionId: session.sessionId || `Session ${index + 1}`,
        fullSessionId: session.fullSessionId || session.sessionId,
        value: value,
        duration: session.duration || session.rawDuration || 0,
        messageCount: session.messageCount || 0,
        toolCount: session.toolCount || 0,
        projectName: session.projectName || 'Unknown',
        color: this.getProjectColor(session.projectName || 'Unknown'),
        date: date,
      };
    });

    // Apply project filter if specified
    if (project && project.trim() !== '') {
      processedData = processedData.filter(d => d.projectName === project);
    }

    // Sort by date if timeline mode
    const { xAxis } = this.currentConfig;
    if (xAxis === 'timeline') {
      processedData.sort((a, b) => a.date - b.date);
    }

    // Re-index after filtering and sorting for consistent session numbering
    processedData.forEach((item, index) => {
      item.index = index;
      item.sessionNumber = index + 1;
    });

    console.log(`📊 Processed ${processedData.length} sessions for chart`);
    return processedData;
  }

  getProjectColor(projectName) {
    // Initialize color cache if it doesn't exist
    if (!this.projectColors) {
      this.projectColors = new Map();
      this.colorIndex = 0;
    }

    // Return cached color if available
    if (this.projectColors.has(projectName)) {
      return this.projectColors.get(projectName);
    }

    // Generate a new color for this project
    const color = this.generateColor(this.colorIndex);
    this.projectColors.set(projectName, color);
    this.colorIndex++;

    return color;
  }

  generateColor(index) {
    // High-quality color palette with good contrast and visual distinction
    const predefinedColors = [
      '#3b82f6', // Blue
      '#10b981', // Emerald
      '#8b5cf6', // Violet
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#14b8a6', // Teal
      '#f97316', // Orange
      '#8b5cf6', // Purple
      '#22c55e', // Green
      '#eab308', // Yellow
      '#dc2626', // Red
      '#0891b2', // Light Blue
    ];

    // Use predefined colors first
    if (index < predefinedColors.length) {
      return predefinedColors[index];
    }

    // Generate colors using HSL for unlimited projects
    // Use golden ratio for good color distribution
    const goldenRatio = 0.618033988749;
    const hue = ((index - predefinedColors.length) * goldenRatio * 360) % 360;

    // Vary saturation and lightness for more distinction
    const saturation = 65 + (index % 3) * 10; // 65%, 75%, 85%
    const lightness = 50 + (Math.floor(index / 3) % 3) * 10; // 50%, 60%, 70%

    return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
  }

  renderChart(data) {
    const { dataType, xAxis } = this.currentConfig;

    // Update y-axis label based on data type
    this.svg
      .select('.y-label')
      .text(dataType === 'messages' ? 'Message Count' : 'Duration (minutes)');

    // Set up x-scale based on mode
    let xScale;
    if (xAxis === 'timeline') {
      // Time scale for timeline mode
      xScale = d3
        .scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([0, this.width]);
    } else {
      // Band scale for session number mode
      xScale = d3
        .scaleBand()
        .domain(data.map(d => d.sessionNumber))
        .range([0, this.width])
        .padding(0.1);
    }

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 1])
      .nice()
      .range([this.height, 0]);

    // Add horizontal gridlines first (before axes)
    this.svg
      .select('.grid-y')
      .transition()
      .duration(750)
      .call(d3.axisLeft(yScale).tickSize(-this.width).tickFormat(''))
      .style('stroke', '#e0e0e0')
      .style('stroke-opacity', 0.5);

    // Remove the grid axis line
    this.svg.select('.grid-y .domain').remove();

    // Style grid lines
    this.svg
      .selectAll('.grid-y line')
      .style('stroke', '#e0e0e0')
      .style('stroke-opacity', 0.5)
      .style('shape-rendering', 'crispEdges');

    // Create appropriate x-axis based on mode
    let xAxisGen;
    if (xAxis === 'timeline') {
      // Time axis for timeline mode
      xAxisGen = d3
        .axisBottom(xScale)
        .tickFormat(d3.timeFormat('%m/%d'))
        .ticks(Math.min(10, Math.max(3, Math.floor(this.width / 80))));
    } else {
      // Calculate optimal tick frequency for session mode
      const maxTicks = Math.min(20, Math.max(5, Math.floor(this.width / 50)));
      const tickInterval = Math.ceil(data.length / maxTicks);
      const tickValues = data
        .filter((d, i) => i % tickInterval === 0 || i === data.length - 1)
        .map(d => d.sessionNumber);

      xAxisGen = d3
        .axisBottom(xScale)
        .tickValues(tickValues)
        .tickFormat(d => `#${d}`);
    }

    const yAxis = d3.axisLeft(yScale);

    // Update x-axis label
    this.svg.select('.x-label').text(xAxis === 'timeline' ? 'Date' : 'Session Number');

    // Update axes with transitions
    this.svg.select('.x-axis').transition().duration(750).call(xAxisGen);
    this.svg.select('.y-axis').transition().duration(750).call(yAxis);

    // Bind data to bars
    const bars = this.svg.selectAll('.bar').data(data, d => d.fullSessionId || d.sessionId);

    // Remove old bars
    bars.exit().transition().duration(500).attr('height', 0).attr('y', this.height).remove();

    // Calculate bar width based on mode
    let barWidth;
    if (xAxis === 'timeline') {
      // Calculate width based on density - allow slight overlap for better visibility
      barWidth = Math.max(3, Math.min(20, (this.width / data.length) * 1.2)); // 20% wider for overlap
    } else {
      barWidth = xScale.bandwidth();
    }

    // Add new bars
    const newBars = bars
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .style('cursor', 'pointer')
      .attr('x', d => {
        if (xAxis === 'timeline') {
          return xScale(d.date) - barWidth / 2; // Center on date
        } else {
          return xScale(d.sessionNumber);
        }
      })
      .attr('width', barWidth)
      .attr('y', this.height) // Start from bottom
      .attr('height', 0); // Start with zero height

    // Merge new and existing bars
    const allBars = newBars.merge(bars);

    // Update all bars with transition
    allBars
      .on('click', (event, d) => this.onBarClick(d))
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip())
      .transition()
      .duration(750)
      .attr('x', d => {
        if (xAxis === 'timeline') {
          return xScale(d.date) - barWidth / 2; // Center on date
        } else {
          return xScale(d.sessionNumber);
        }
      })
      .attr('y', d => yScale(d.value))
      .attr('width', barWidth)
      .attr('height', d => this.height - yScale(d.value))
      .style('fill', d => d.color)
      .style('opacity', 0.8);

    console.log(`📊 Rendered ${data.length} bars`);
  }

  showTooltip(event, d) {
    // Remove any existing tooltips first
    d3.select('body').selectAll('.chart-tooltip').remove();

    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', '9999');

    tooltip
      .html(
        `
        <strong>Session #${d.sessionNumber}</strong><br>
        <strong>ID:</strong> ${d.sessionId}<br>
        <strong>Project:</strong> ${d.projectName}<br>
        <strong>Duration:</strong> ${d.duration}m<br>
        <strong>Messages:</strong> ${d.messageCount}<br>
        <strong>Tools:</strong> ${d.toolCount}
      `
      )
      .style('left', event.pageX + 10 + 'px')
      .style('top', event.pageY - 10 + 'px');

    tooltip.transition().duration(200).style('opacity', 1);
  }

  hideTooltip() {
    d3.select('body')
      .selectAll('.chart-tooltip')
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();
  }

  onBarClick(d) {
    console.log('📊 Bar clicked:', d);
    if (typeof window.API !== 'undefined' && window.API.showSuccess) {
      window.API.showSuccess(`Clicked session #${d.sessionNumber}: ${d.sessionId}`);
    }
  }

  showMessage(message) {
    this.container.html(`
      <div class="d-flex justify-content-center align-items-center h-100">
        <div class="alert alert-info">
          <i class="bi bi-info-circle me-2"></i>
          ${message}
        </div>
      </div>
    `);
  }

  resize() {
    // Reinitialize on window resize
    this.init();
    if (this.data) {
      this.render();
    }
  }
}

// Export to global scope for use in templates
window.ChartManager = ChartManager;

/**
 * SessionFlowChart - D3.js visualization for session struggle trends
 * Shows how struggle patterns evolve over time within sessions
 */
class SessionFlowChart {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = d3.select(`#${containerId}`);
    this.data = null;

    this.margin = { top: 40, right: 60, bottom: 60, left: 80 };

    // Get container dimensions - handle case where container is initially hidden
    const containerRect = this.container.node().getBoundingClientRect();
    let availableWidth = containerRect.width;

    // If container is hidden (width = 0), get width from the visible chart container
    if (availableWidth === 0) {
      const chartContainer = document.getElementById('chartContainer');
      if (chartContainer) {
        availableWidth = chartContainer.getBoundingClientRect().width;
        console.log('🔍 Got width from chartContainer:', availableWidth);
      } else {
        console.log('❌ chartContainer not found');
      }
    } else {
      console.log('🔍 Got width from flowContainer:', availableWidth);
    }

    // If both containers fail, get from parent card
    if (availableWidth === 0) {
      const cardBody = document.querySelector('.card-body:has(#chartContainer)');
      if (cardBody) {
        availableWidth = cardBody.getBoundingClientRect().width - 40; // Account for padding
        console.log('🔍 Got width from card body:', availableWidth);
      }
    }

    // Fallback to reasonable default if still 0
    if (availableWidth === 0) {
      availableWidth = 800; // Reasonable default
      console.log('⚠️  Using fallback width:', availableWidth);
    }

    this.width = Math.max(600, availableWidth - this.margin.left - this.margin.right);
    this.height = 320 - this.margin.top - this.margin.bottom; // Shorter than bar chart (400)

    // Debug logging
    console.log('🔍 SessionFlowChart dimensions:', {
      availableWidth,
      calculatedWidth: this.width,
      totalWidth: this.width + this.margin.left + this.margin.right,
      height: this.height,
      margins: this.margin,
    });

    // Create SVG with proper D3 pattern (total dimensions including margins)
    const totalWidth = this.width + this.margin.left + this.margin.right;
    const totalHeight = this.height + this.margin.top + this.margin.bottom;

    this.svg = this.container
      .append('svg')
      .attr('width', totalWidth)
      .attr('height', totalHeight)
      .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    // Add background
    this.svg
      .append('rect')
      .attr('width', totalWidth)
      .attr('height', totalHeight)
      .attr('fill', '#fafafa')
      .attr('stroke', '#e0e0e0');

    // Initialize zoom behavior
    this.zoom = d3
      .zoom()
      .scaleExtent([0.3, 8]) // Allow zoom from 30% to 800%
      .translateExtent([
        [-this.width * 0.5, -this.height * 0.5],
        [this.width * 1.5, this.height * 1.5],
      ]) // Limit panning area
      .on('zoom', event => {
        if (this.chartGroup) {
          this.chartGroup.attr('transform', event.transform);
        }
      });

    // Apply zoom behavior to SVG
    this.svg.call(this.zoom);

    // Title removed for cleaner, minimal design
  }

  getProjectColor(projectName) {
    // Initialize color cache if it doesn't exist
    if (!this.projectColors) {
      this.projectColors = new Map();
      this.colorIndex = 0;
    }

    // Return cached color if available
    if (this.projectColors.has(projectName)) {
      return this.projectColors.get(projectName);
    }

    // Generate a new color for this project
    const color = this.generateColor(this.colorIndex);
    this.projectColors.set(projectName, color);
    this.colorIndex++;

    return color;
  }

  generateColor(index) {
    // High-quality color palette with good contrast and visual distinction
    const predefinedColors = [
      '#3b82f6', // Blue
      '#10b981', // Emerald
      '#8b5cf6', // Violet
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#06b6d4', // Cyan
      '#84cc16', // Lime
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#14b8a6', // Teal
      '#f97316', // Orange
      '#8b5cf6', // Purple
      '#22c55e', // Green
      '#eab308', // Yellow
      '#dc2626', // Red
      '#0891b2', // Light Blue
    ];

    // Use predefined colors first
    if (index < predefinedColors.length) {
      return predefinedColors[index];
    }

    // Generate HSL-based colors for additional projects
    const hue = (index * 137.5) % 360; // Use golden angle for good distribution
    const saturation = 65 + (index % 3) * 10; // Vary saturation: 65%, 75%, 85%
    const lightness = 45 + (index % 2) * 10; // Vary lightness: 45%, 55%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // Handle container visibility changes - redraw if needed
  handleVisibilityChange() {
    if (this.data && this.data.length > 0) {
      // Check if container is now visible and has proper dimensions
      const containerNode = document.getElementById(this.containerId);
      if (containerNode && containerNode.clientWidth > 0) {
        console.log('🎨 Redrawing SessionFlowChart after visibility change');

        // Recalculate dimensions like ChartManager does
        const containerRect = this.container.node().getBoundingClientRect();
        let availableWidth = containerRect.width;

        // Should have proper width now since container is visible, but just in case
        if (availableWidth === 0) {
          const chartContainer = document.getElementById('chartContainer');
          if (chartContainer) {
            availableWidth = chartContainer.getBoundingClientRect().width;
          }
        }

        this.width = Math.max(600, availableWidth - this.margin.left - this.margin.right);

        // Update SVG dimensions
        const totalWidth = this.width + this.margin.left + this.margin.right;
        const totalHeight = this.height + this.margin.top + this.margin.bottom;

        this.svg
          .attr('width', totalWidth)
          .attr('height', totalHeight)
          .attr('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

        this.svg.select('rect').attr('width', totalWidth).attr('height', totalHeight);

        this.render({});
      }
    }
  }

  async loadData(options = {}) {
    console.log('📊 SessionFlowChart: Loading trend data...');

    try {
      const response = await window.API.call(
        `/api/sessions?trends=true&limit=${options.limit || 50}`
      );
      this.data = response.sessions || [];

      return {
        sessions: this.data,
        metadata: {
          totalSessions: this.data.length,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Failed to load session trends:', error);
      throw error;
    }
  }

  render(filters = {}) {
    if (!this.data || this.data.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Filter data based on trend filters
    const filteredData = this.data.filter(session => {
      if (session.trend === 'too_short') return filters.showShort !== false;
      if (session.trend === 'improving') return filters.showImproving !== false;
      if (session.trend === 'steady') return filters.showSteady !== false;
      if (session.trend === 'degrading') return filters.showDegrading !== false;
      return true;
    });

    // Only show sessions with chunks (long sessions)
    const longSessions = filteredData.filter(s => s.chunks && s.chunks.length > 0);
    const shortSessions = filteredData.filter(s => s.trend === 'too_short');

    console.log(
      `📈 Rendering ${longSessions.length} long sessions, ${shortSessions.length} short sessions`
    );

    // Transform data to show cumulative struggle from baseline
    let transformedSessions = longSessions.map(session => {
      const baseline = 1.0; // Average struggle score as baseline
      let cumulativeStruggle = 0; // Start at 0 (baseline)

      const transformedChunks = session.chunks.map((chunk, index) => {
        // First chunk always starts at exactly 0
        if (index === 0) {
          return {
            ...chunk,
            cumulativeStruggle: 0,
            originalStruggle: chunk.struggleScore,
          };
        }

        // For subsequent chunks, calculate change from baseline
        const changeFromBaseline = baseline - chunk.struggleScore;
        cumulativeStruggle += changeFromBaseline * 0.3; // Smooth the changes

        return {
          ...chunk,
          cumulativeStruggle: cumulativeStruggle,
          originalStruggle: chunk.struggleScore,
        };
      });

      return {
        ...session,
        chunks: transformedChunks,
      };
    });

    // Sort sessions by timestamp (oldest first) so newer ones render on top
    // Use sessionId as tiebreaker for consistent ordering when timestamps are identical
    transformedSessions.sort((a, b) => {
      // Try multiple date fields and handle invalid dates gracefully
      const getValidTime = session => {
        const dateValue =
          session.startTime || session.timestamp || session.date || session.createdAt;
        if (dateValue) {
          const parsed = new Date(dateValue);
          if (!isNaN(parsed.getTime())) {
            return parsed.getTime();
          }
        }

        // Try to extract date from session ID format: session-YYYYMMDD-HHMMSS
        const sessionId = session.sessionId || '';
        const dateMatch = sessionId.match(/session-(\d{8})-(\d{6})/);
        if (dateMatch) {
          const dateStr = dateMatch[1]; // YYYYMMDD
          const timeStr = dateMatch[2]; // HHMMSS

          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          const hour = timeStr.substring(0, 2);
          const minute = timeStr.substring(2, 4);
          const second = timeStr.substring(4, 6);

          const parsedDate = new Date(year, month - 1, day, hour, minute, second);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.getTime();
          }
        }

        return 0; // Fallback for sessions without valid dates
      };

      const timeA = getValidTime(a);
      const timeB = getValidTime(b);

      if (timeA !== timeB) {
        return timeA - timeB; // Oldest first
      }

      // Tiebreaker: sort by sessionId for consistent ordering
      return (a.sessionId || '').localeCompare(b.sessionId || '');
    });

    // Limit to most recent 100 sessions for cleaner visualization
    transformedSessions = transformedSessions.slice(-100);

    // Calculate visual properties with project-aware fading
    const sessionCount = transformedSessions.length;
    
    // Group sessions by project for smart fading
    const projectSessions = {};
    transformedSessions.forEach(session => {
      const project = session.projectName || 'Unknown';
      if (!projectSessions[project]) projectSessions[project] = [];
      projectSessions[project].push(session);
    });

    transformedSessions.forEach((session, index) => {
      const progress = index / Math.max(sessionCount - 1, 1); // 0 (oldest) to 1 (newest)
      const project = session.projectName || 'Unknown';
      const projectList = projectSessions[project];
      
      // Find position within project (0 = oldest in project, 1 = newest in project)
      const projectIndex = projectList.indexOf(session);
      const projectProgress = projectIndex / Math.max(projectList.length - 1, 1);
      
      // Smart opacity: emphasize recent sessions more in active projects
      const baseOpacity = 0.3;
      const maxOpacity = 0.9;
      
      // Combine project recency (70%) with global age (30%)
      const combinedProgress = (projectProgress * 0.7) + (progress * 0.3);
      session.temporalOpacity = baseOpacity + combinedProgress * (maxOpacity - baseOpacity);
      
      // Ensure the latest session in each project is always prominent
      if (projectIndex === projectList.length - 1) {
        session.temporalOpacity = Math.max(session.temporalOpacity, 0.85);
      }

      // Stroke width: 0.8 (oldest) to 3 (newest)
      session.strokeWidth = 0.8 + progress * 2.2;

      // Color: use same project-based coloring as the second chart
      session.strokeColor = this.getProjectColor(session.projectName || 'Unknown');

      // Add subtle horizontal jitter to reduce starting mass
      // Jitter range gets smaller for newer sessions (they should be more aligned)
      const maxJitter = 0.3 * (1 - progress * 0.7); // 0.3 for oldest, 0.09 for newest
      session.horizontalJitter = (Math.random() - 0.5) * maxJitter;
    });

    // Clear previous chart content (but keep background)
    this.svg.selectAll('.chart-content').remove();

    // Create chart group and store reference for zoom behavior
    this.chartGroup = this.svg.append('g').attr('class', 'chart-content');
    const chartGroup = this.chartGroup;

    // Set up scales
    const maxChunks = Math.max(...transformedSessions.map(s => s.chunks.length), 1);

    // Find the range of cumulative struggle values and compress for better visual impact
    const allCumulativeValues = transformedSessions.flatMap(s =>
      s.chunks.map(c => c.cumulativeStruggle)
    );
    const rawMin = Math.min(0, ...allCumulativeValues);
    const rawMax = Math.max(0, ...allCumulativeValues);

    // Compress the range by 50% for tighter, more cohesive visualization
    const compressionFactor = 0.5; // More compression for shorter chart
    const center = (rawMin + rawMax) / 2;
    const compressedRange = (rawMax - rawMin) * compressionFactor;
    const minStruggle = center - compressedRange / 2;
    const maxStruggle = center + compressedRange / 2;

    // Scales using full available space within margins
    const xScale = d3
      .scaleLinear()
      .domain([0, maxChunks])
      .range([this.margin.left, this.width + this.margin.left]); // Use full width within margins

    const yScale = d3
      .scaleLinear()
      .domain([minStruggle, maxStruggle])
      .range([this.height + this.margin.top, this.margin.top]); // Use full height within margins

    // No axes - pure artistic visualization

    // Line generator with horizontal jitter for visual appeal
    const createLine = session =>
      d3
        .line()
        .x(d => xScale(d.chunkIndex + (d.chunkIndex === 0 ? session.horizontalJitter : 0))) // Only jitter start point
        .y(d => yScale(d.cumulativeStruggle))
        .curve(d3.curveBasis); // Smooth bicycle-path-like curves

    // Baseline reference line removed for cleaner look

    // Draw session paths with enhanced visual hierarchy and interactivity
    transformedSessions.forEach((session, sessionIndex) => {
      const line = createLine(session);

      // Draw the session path with temporal visual properties and hover interactions
      chartGroup
        .append('path')
        .datum(session.chunks)
        .attr('class', 'session-path')
        .attr('data-session-id', session.sessionId)
        .attr('d', line)
        .style('fill', 'none')
        .style('stroke', session.strokeColor)
        .style('stroke-width', session.strokeWidth)
        .style('opacity', session.temporalOpacity)
        .style('stroke-linecap', 'round') // Smooth line ends
        .style('stroke-linejoin', 'round') // Smooth line joins
        .style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
          // Highlight this line
          d3.select(this)
            .style('stroke-width', Math.max(session.strokeWidth * 1.5, 3))
            .style('stroke', '#000000')
            .style('opacity', 0.95);

          // Fade other lines
          chartGroup
            .selectAll('.session-path')
            .filter(function () {
              return this !== event.currentTarget;
            })
            .style('opacity', 0.15);

          // Create elegant tooltip
          const tooltip = d3
            .select('body')
            .append('div')
            .attr('class', 'session-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '12px 16px')
            .style('border-radius', '8px')
            .style('font-size', '13px')
            .style('font-family', 'system-ui, -apple-system, sans-serif')
            .style('line-height', '1.4')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('max-width', '280px')
            .style('opacity', 0);

          // Format session info
          let dateDisplay = 'Date unavailable';
          try {
            // Try different date field names that might exist
            const dateValue =
              session.startTime || session.timestamp || session.date || session.createdAt;
            if (dateValue) {
              const parsedDate = new Date(dateValue);
              if (!isNaN(parsedDate.getTime())) {
                dateDisplay = `${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString()}`;
              }
            } else {
              // Try to extract date from session ID format: session-YYYYMMDD-HHMMSS
              const sessionId = session.sessionId || '';
              const dateMatch = sessionId.match(/session-(\d{8})-(\d{6})/);
              if (dateMatch) {
                const dateStr = dateMatch[1]; // YYYYMMDD
                const timeStr = dateMatch[2]; // HHMMSS

                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                const hour = timeStr.substring(0, 2);
                const minute = timeStr.substring(2, 4);
                const second = timeStr.substring(4, 6);

                const parsedDate = new Date(year, month - 1, day, hour, minute, second);
                if (!isNaN(parsedDate.getTime())) {
                  dateDisplay = `${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString()}`;
                }
              }
            }
          } catch (error) {
            console.warn('Date parsing error:', error);
          }

          const duration =
            Math.round((session.duration || session.durationSeconds) / 60) || 'Unknown';
          const project = session.projectName || 'Unknown Project';

          tooltip
            .html(
              `
            <div style="font-weight: 600; margin-bottom: 6px;">${project}</div>
            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 6px;">${session.sessionId}</div>
            <div style="margin-bottom: 4px;">Duration: ${duration} minutes</div>
            <div style="font-size: 11px; opacity: 0.8;">${dateDisplay}</div>
          `
            )
            .style('left', event.pageX + 12 + 'px')
            .style('top', event.pageY - 12 + 'px')
            .transition()
            .duration(200)
            .style('opacity', 1);
        })
        .on('mouseout', function (event, d) {
          // Restore original line appearance
          d3.select(this)
            .style('stroke-width', session.strokeWidth)
            .style('stroke', session.strokeColor)
            .style('opacity', session.temporalOpacity);

          // Restore other lines
          chartGroup.selectAll('.session-path').style('opacity', function () {
            const sessionId = d3.select(this).attr('data-session-id');
            // Find the session object to get its temporal opacity
            const matchingSession = transformedSessions.find(s => s.sessionId === sessionId);
            return matchingSession ? matchingSession.temporalOpacity : 0.5;
          });

          // Remove tooltip
          d3.selectAll('.session-tooltip').remove();
        })
        .on('click', function (event, d) {
          // Navigate to session details page
          const sessionId = session.sessionId;
          if (sessionId) {
            console.log('🔗 Navigating to session:', sessionId);
            window.location.href = `/session/${sessionId}`;
          }
          event.stopPropagation(); // Prevent zoom from triggering
        });
    });

    // Short sessions legend removed for cleaner interface
  }

  renderEmptyState() {
    this.svg.selectAll('.chart-content').remove();

    const emptyGroup = this.svg.append('g').attr('class', 'chart-content');

    emptyGroup
      .append('text')
      .attr('x', this.width / 2)
      .attr('y', this.height / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('fill', '#666')
      .text('No session data available for visualization');

    emptyGroup
      .append('text')
      .attr('x', this.width / 2)
      .attr('y', this.height / 2 + 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('fill', '#999')
      .text('Try loading sessions first or adjusting your filters');
  }

  /**
   * Reset zoom to original view with smooth transition
   */
  resetZoom() {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity);
    }
  }
}

// Export SessionFlowChart to global scope
window.SessionFlowChart = SessionFlowChart;
