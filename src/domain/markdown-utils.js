/**
 * @file Markdown Utilities
 * Shared utilities for markdown processing
 */

/**
 * Convert markdown to HTML (simple implementation)
 * @param {string} markdown - Markdown content to convert
 * @param {Object} options - Conversion options
 * @param {boolean} options.downgradeHeaders - Downgrade header levels (H1 -> H2, H2 -> H3, etc.)
 * @returns {string|null} HTML content or null if no input
 */
export function convertMarkdownToHtml(markdown, options = {}) {
  if (!markdown) return null;

  const { downgradeHeaders = false } = options;

  // Simple markdown to HTML conversion
  const html = markdown
    .replace(/^### (.*$)/gm, downgradeHeaders ? '<h4>$1</h4>' : '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, downgradeHeaders ? '<h3>$1</h3>' : '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, downgradeHeaders ? '<h2>$1</h2>' : '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/gs, match => {
      return '<ul>' + match + '</ul>';
    })
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/, '<p>$1</p>')
    .replace(/<\/p><p><h/g, '</p><h')
    .replace(/<\/h([1-6])><p>/g, '</h$1><p>')
    .replace(/<\/ul>\s*<ul>/g, '');

  return html;
}
