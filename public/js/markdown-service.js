/**
 * Unified Markdown Service
 * Provides consistent and secure markdown rendering across the application
 */

window.MarkdownService = (function() {
  'use strict';
  
  // Check for required libraries
  if (typeof window.markdownit === 'undefined') {
    console.error('MarkdownService: markdown-it library not loaded');
  }
  
  if (typeof window.DOMPurify === 'undefined') {
    console.error('MarkdownService: DOMPurify library not loaded');
  }
  
  // Initialize markdown-it with security-focused settings
  const md = window.markdownit ? window.markdownit({
    html: true,        // Enable HTML tags (will be sanitized by DOMPurify)
    breaks: true,      // Convert \n to <br>
    linkify: true,     // Auto-convert URLs to links
    typographer: true  // Enable smart quotes and other replacements
  }) : null;
  
  /**
   * Render markdown to safe HTML
   * @param {string} markdown - Markdown content to render
   * @param {Object} options - Rendering options
   * @param {boolean} options.downgradeHeaders - Downgrade header levels (H1 -> H2, H2 -> H3, etc.)
   * @returns {string} Safe HTML string
   */
  function renderMarkdown(markdown, options = {}) {
    if (!markdown) return '';
    
    if (!md) {
      console.warn('MarkdownService: markdown-it not available, falling back to basic HTML escaping');
      return escapeHtml(markdown);
    }
    
    try {
      // Render markdown to HTML
      let html = md.render(markdown);
      
      // Apply options
      if (options.downgradeHeaders) {
        html = downgradeHeaders(html);
      }
      
      // Sanitize the HTML
      return sanitizeHtml(html);
    } catch (error) {
      console.error('MarkdownService: Error rendering markdown:', error);
      return escapeHtml(markdown);
    }
  }
  
  /**
   * Render markdown directly to a DOM element safely
   * @param {HTMLElement} element - Target element
   * @param {string} markdown - Markdown content
   * @param {Object} options - Rendering options
   */
  function renderMarkdownToElement(element, markdown, options = {}) {
    if (!element) {
      console.warn('MarkdownService: No target element provided');
      return;
    }
    
    const html = renderMarkdown(markdown, options);
    
    // Use safe DOM manipulation
    element.innerHTML = html;
  }
  
  /**
   * Sanitize HTML content using DOMPurify
   * @param {string} html - HTML to sanitize
   * @returns {string} Sanitized HTML
   */
  function sanitizeHtml(html) {
    if (!html) return '';
    
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(html, {
        // Allow common HTML tags
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',     // Headers
          'p', 'br', 'hr',                        // Block elements
          'strong', 'em', 'b', 'i', 'u',         // Text formatting
          'code', 'pre',                          // Code blocks
          'ul', 'ol', 'li',                       // Lists
          'blockquote',                           // Quotes
          'a',                                    // Links (href will be sanitized)
          'table', 'thead', 'tbody', 'tr', 'th', 'td', // Tables
          'div', 'span', 'small',                 // Generic containers
          'img'                                   // Images (src will be sanitized)
        ],
        
        // Allow safe attributes
        ALLOWED_ATTR: [
          'href', 'src', 'alt', 'title', 
          'class', 'id', 
          'target'  // For external links
        ],
        
        // Additional security settings
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        FORBID_SCRIPT: true,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea'],
        FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'style']
      });
    }
    
    // Fallback: basic sanitization if DOMPurify is not available
    console.warn('MarkdownService: DOMPurify not available, using basic sanitization');
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '');
  }
  
  /**
   * Downgrade header levels (H1->H2, H2->H3, etc.)
   * Used to prevent conflicts with page-level headers
   * @param {string} html - HTML content
   * @returns {string} HTML with downgraded headers
   */
  function downgradeHeaders(html) {
    // Work from H6 down to H1 to avoid double-processing
    return html
      .replace(/<h5>/gi, '<h6>')
      .replace(/<\/h5>/gi, '</h6>')
      .replace(/<h4>/gi, '<h5>')
      .replace(/<\/h4>/gi, '</h5>')
      .replace(/<h3>/gi, '<h4>')
      .replace(/<\/h3>/gi, '</h4>')
      .replace(/<h2>/gi, '<h3>')
      .replace(/<\/h2>/gi, '</h3>')
      .replace(/<h1>/gi, '<h2>')
      .replace(/<\/h1>/gi, '</h2>');
  }
  
  /**
   * Basic HTML escaping fallback
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  function escapeHtml(text) {
    if (typeof document !== 'undefined') {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    // Fallback for server-side or environments without DOM
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  /**
   * Check if markdown service is properly initialized
   * @returns {boolean} True if all required libraries are loaded
   */
  function isReady() {
    return !!(window.markdownit && window.DOMPurify);
  }
  
  /**
   * Get information about the markdown service
   * @returns {Object} Service information
   */
  function getInfo() {
    return {
      markdownItAvailable: !!window.markdownit,
      domPurifyAvailable: !!window.DOMPurify,
      ready: isReady(),
      version: '1.0.0'
    };
  }
  
  // Public API
  return {
    renderMarkdown: renderMarkdown,
    renderMarkdownToElement: renderMarkdownToElement,
    sanitizeHtml: sanitizeHtml,
    isReady: isReady,
    getInfo: getInfo
  };
})();