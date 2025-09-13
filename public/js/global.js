/**
 * Global JavaScript
 * Handles global error handling and API availability checks
 */

// Global error handling
window.addEventListener('error', function (event) {
  console.error('Global Error:', event.error);
  if (window.API) {
    window.API.showError('An unexpected error occurred. Please refresh the page.');
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function (event) {
  console.error('Unhandled Promise Rejection:', event.reason);
  if (window.API) {
    window.API.showError('A network or system error occurred. Please try again.');
  }
});

// Check API availability and network connectivity
document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.API === 'undefined') {
    // Try to show toast first, fallback to status container
    const statusContainer = document.getElementById('statusMessages');
    if (statusContainer) {
      const errorHtml = `
        <div class="alert alert-danger" role="alert">
          <i class="bi bi-exclamation-triangle me-2"></i>
          <strong>System Error:</strong> API client failed to load. Please refresh the page.
        </div>
      `;
      statusContainer.innerHTML = errorHtml;
    } else {
      // Create a temporary toast-like alert
      const alertDiv = document.createElement('div');
      alertDiv.className =
        'alert alert-danger alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x';
      alertDiv.style.zIndex = '1056';
      alertDiv.style.marginTop = '1rem';
      alertDiv.innerHTML = `
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong>System Error:</strong> API client failed to load. Please refresh the page.
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      `;
      document.body.appendChild(alertDiv);
    }
  }
});
