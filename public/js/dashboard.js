/**
 * Dashboard Entry Point
 * Minimal initialization - main functionality now in separate modules:
 * - dashboard-core.js: Initialization & utilities
 * - dashboard-analysis.js: Analysis execution & progress
 * - dashboard-sessions.js: Sessions & history management
 * - dashboard-charts.js: Chart management & controls
 */

document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.API !== 'undefined') {
    initializeDashboard();
  }
});