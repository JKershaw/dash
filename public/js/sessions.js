/**
 * Sessions Page JavaScript
 * Handles session listing, filtering, search, and details modal
 */
/* global bootstrap */

let allSessions = [];
let filteredSessions = [];
const currentFilters = {
  search: '',
  project: '',
};

document.addEventListener('DOMContentLoaded', function () {
  console.log('📋 Sessions page loaded');

  if (typeof window.API !== 'undefined') {
    initializeSessions();
  } else {
    console.error('❌ API client not available');
  }
});

function initializeSessions() {
  // Set up event listeners
  setupEventListeners();

  // Load sessions data
  loadSessionsData();
}

function setupEventListeners() {
  // Search input
  document.getElementById('sessionSearch').addEventListener(
    'input',
    debounce(function (e) {
      currentFilters.search = e.target.value;
      applyFilters();
    }, 300)
  );

  // Project filter
  document.getElementById('projectFilterSessions').addEventListener('change', function (e) {
    currentFilters.project = e.target.value;
    applyFilters();
  });

  // View mode toggle
  document.querySelectorAll('input[name="viewMode"]').forEach(radio => {
    radio.addEventListener('change', renderSessions);
  });
}

async function loadSessionsData() {
  console.log('📋 Loading sessions data...');

  try {
    const data = await window.API.getSessions();
    allSessions = data.sessions || [];
    filteredSessions = [...allSessions];

    populateProjectFilter();
    renderSessions();
    updateFilterSummary();
  } catch (error) {
    console.error('❌ Failed to load sessions:', error);
    showStatusError(`Failed to load sessions: ${error.message}`, true);

    document.getElementById('sessionsContainer').innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Failed to load sessions: ${error.message}
      </div>
    `;
  }
}

function populateProjectFilter() {
  const select = document.getElementById('projectFilterSessions');
  const projects = new Set();

  allSessions.forEach(session => {
    if (session.projectName) {
      projects.add(session.projectName);
    }
  });

  // Clear existing options except "All Projects"
  select.innerHTML = '<option value="">All Projects</option>';

  // Add project options
  Array.from(projects)
    .sort()
    .forEach(project => {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = project;
      select.appendChild(option);
    });
}

function applyFilters() {
  filteredSessions = allSessions.filter(session => {
    // Search filter
    if (currentFilters.search) {
      const searchLower = currentFilters.search.toLowerCase();
      let searchMatch =
        session.sessionId.toLowerCase().includes(searchLower) ||
        (session.projectName && session.projectName.toLowerCase().includes(searchLower));

      // Also search within conversation content
      if (!searchMatch && session.conversation && session.conversation.length > 0) {
        searchMatch = session.conversation.some(
          entry => entry.content && entry.content.toLowerCase().includes(searchLower)
        );
      }

      if (!searchMatch) return false;
    }

    // Project filter
    if (currentFilters.project && session.projectName !== currentFilters.project) {
      return false;
    }

    return true;
  });

  renderSessions();
  updateFilterSummary();
}

function renderSessions() {
  const container = document.getElementById('sessionsContainer');
  const viewMode = document.querySelector('input[name="viewMode"]:checked').value;

  if (filteredSessions.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-inbox fs-1 text-muted"></i>
        <p class="text-muted mt-2">No sessions found matching current filters</p>
      </div>
    `;
    return;
  }

  if (viewMode === 'list') {
    renderListView(container);
  } else {
    renderCardView(container);
  }
}

function renderListView(container) {
  const tableHtml = `
    <div class="table-responsive">
      <table class="table table-hover">
        <thead class="table-light">
          <tr>
            <th>Session ID</th>
            <th>Project</th>
            <th>Duration</th>
            <th>Messages</th>
            <th>Tools</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filteredSessions
            .map(
              session => `
            <tr>
              <td>
                <code class="text-primary">${session.sessionId?.substring(0, 12) || 'Unknown'}...</code>
              </td>
              <td>
                <span class="badge bg-secondary">${session.projectName || 'Unknown'}</span>
              </td>
              <td>${Math.round((session.durationSeconds || 0) / 60)}m</td>
              <td>
                <i class="bi bi-chat-dots text-muted me-1"></i>
                ${session.humanMessageCount || 0}/${session.assistantMessageCount || 0}
              </td>
              <td>${session.toolCount || 0}</td>
              <td>
                <a class="btn btn-sm btn-outline-primary" href="/session/${session.sessionId}">
                  <i class="bi bi-eye me-1"></i>View
                </a>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = tableHtml;
}

function renderCardView(container) {
  const cardsHtml = `
    <div class="row">
      ${filteredSessions
        .map(
          session => `
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="card h-100">
            <div class="card-body">
              <h6 class="card-title">
                <i class="bi bi-chat-square-text text-primary me-2"></i>
                Session ${session.sessionId?.substring(0, 8) || 'Unknown'}...
              </h6>
              <p class="card-text">
                <strong>Project:</strong> ${session.projectName || 'Unknown'}<br>
                <strong>Duration:</strong> ${Math.round((session.durationSeconds || 0) / 60)} minutes<br>
                <strong>Messages:</strong> ${session.humanMessageCount || 0} human, ${session.assistantMessageCount || 0} assistant<br>
                <strong>Tools Used:</strong> ${session.toolCount || 0}
              </p>
            </div>
            <div class="card-footer">
              <a class="btn btn-sm btn-primary w-100" href="/session/${session.sessionId}">
                <i class="bi bi-eye me-2"></i>View Details
              </a>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  container.innerHTML = cardsHtml;
}

function updateFilterSummary() {
  const countSpan = document.getElementById('sessionCount');
  const total = allSessions.length;
  const filtered = filteredSessions.length;

  if (filtered === total) {
    countSpan.textContent = `Showing all ${total} sessions`;
  } else {
    countSpan.textContent = `Showing ${filtered} of ${total} sessions`;
  }
}

// Debounce utility for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Error handling utilities
function showStatusError(message, showRetry = false) {
  const statusContainer = document.getElementById('statusMessages');
  const retryButton = showRetry
    ? `
    <button class="btn btn-outline-primary btn-sm ms-2" onclick="loadSessionsData()">
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
