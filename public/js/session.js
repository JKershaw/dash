/**
 * Individual Session Page JavaScript
 * Handles loading and displaying individual session details
 */
/* global bootstrap, markdownit */

let currentSessionId = null;

document.addEventListener('DOMContentLoaded', function () {
  console.log('📄 Session details page loaded');

  // Get session ID from the page
  const sessionIdElement = document.getElementById('sessionIdDisplay');
  if (sessionIdElement) {
    currentSessionId = sessionIdElement.textContent;
    console.log('Loading session:', currentSessionId);
  }

  if (typeof window.API !== 'undefined' && currentSessionId) {
    loadSessionDetails();
  } else {
    console.error('❌ API client not available or session ID missing');
    showError('Failed to load session: API not available');
  }
});

async function loadSessionDetails() {
  console.log('📄 Loading session details for:', currentSessionId);

  try {
    const sessionData = await window.API.getSessionScript(currentSessionId);

    // Update page header with session metadata
    updateSessionHeader(sessionData.metadata);

    // Format and display the session script
    const container = document.getElementById('sessionScriptContainer');
    const formattedScript = formatSessionScript(
      sessionData.content || 'No script content available'
    );
    container.innerHTML = `<div id="formattedView_${currentSessionId}">${formattedScript}</div>`;

    // Enable the expand all tools button and set up its functionality
    setupExpandAllButton();
  } catch (error) {
    console.error('❌ Failed to load session details:', error);
    showError(`Failed to load session details: ${error.message}`);
  }
}

function updateSessionHeader(metadata) {
  if (metadata) {
    // Update project name
    const projectDisplay = document.getElementById('projectNameDisplay');
    if (projectDisplay) {
      projectDisplay.textContent = metadata.projectName || 'Unknown';
    }

    // Update duration
    const durationDisplay = document.getElementById('sessionDurationDisplay');
    if (durationDisplay) {
      const duration = metadata.duration || 'Unknown';
      const entryCount = metadata.entryCount || 0;
      durationDisplay.innerHTML = `${duration} <span class="text-muted ms-2">(${entryCount} entries)</span>`;
    }
  }
}

function setupExpandAllButton() {
  const toggleButton = document.getElementById('toggleAllToolsBtn');
  if (toggleButton) {
    toggleButton.disabled = false;
    toggleButton.addEventListener('click', () => toggleAllTools(currentSessionId));
  }
}

/**
 * Format session script markdown into a user-friendly conversation view
 * (Moved from sessions.js)
 */
function formatSessionScript(markdownContent) {
  if (!markdownContent || markdownContent === 'No script content available') {
    return '<div class="text-center text-muted py-4">No conversation content available</div>';
  }

  try {
    const lines = markdownContent.split('\n');
    let htmlOutput = '';
    let inConversation = false;
    let conversationEntry = null;
    let toolEntry = null;
    let skipUntilNextHeader = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines in most contexts
      if (!trimmedLine && !inConversation) continue;

      // Main headers - identify sections
      if (trimmedLine.startsWith('# Session:')) {
        continue; // Skip main title
      } else if (trimmedLine === '## Conversation Flow') {
        inConversation = true;
        htmlOutput += '<div class="conversation-section">';
        continue;
      } else if (trimmedLine.startsWith('## ') && inConversation) {
        // Only end conversation on specific section headers, not embedded content
        const knownEndSections = [
          '## Tool Operations Summary',
          '## Session Analysis',
          '## Struggles Detected',
          '## Recommendations',
          '## Summary',
          '## Session Summary',
        ];

        // Use exact match instead of startsWith to avoid false positives like "## Summary Storage Locations"
        if (knownEndSections.includes(trimmedLine)) {
          // End conversation section
          if (conversationEntry) {
            htmlOutput += formatConversationEntry(conversationEntry);
            conversationEntry = null;
          }
          if (toolEntry) {
            htmlOutput += formatToolEntry(toolEntry);
            toolEntry = null;
          }
          htmlOutput += '</div>';
          inConversation = false;
          skipUntilNextHeader = true;
          continue;
        } else {
          // This is embedded content within a conversation entry, not a section header
          if (conversationEntry && trimmedLine) {
            conversationEntry.content += line + '\n';
          } else if (!conversationEntry && trimmedLine) {
            // We have content but no active conversation entry - this shouldn't happen
            console.warn('Embedded ## header found outside conversation entry:', trimmedLine);
          }
          continue;
        }
      }

      if (skipUntilNextHeader && !trimmedLine.startsWith('#')) {
        continue;
      } else if (trimmedLine.startsWith('#')) {
        skipUntilNextHeader = false;
      }

      // Process conversation entries
      if (inConversation) {
        // Conversation headers: "### 1. User (11:14:37 AM)"
        const conversationMatch = trimmedLine.match(
          /^### (\d+)\.\s+(User|Assistant)\s+\(([^)]+)\)$/
        );
        if (conversationMatch) {
          // Save previous entry
          if (conversationEntry) {
            htmlOutput += formatConversationEntry(conversationEntry);
          }
          if (toolEntry) {
            htmlOutput += formatToolEntry(toolEntry);
            toolEntry = null;
          }

          // Start new entry
          conversationEntry = {
            number: conversationMatch[1],
            speaker: conversationMatch[2],
            time: conversationMatch[3],
            content: '',
            isToolUse: false,
          };
          continue;
        } else if (trimmedLine.startsWith('### ')) {
          // This is a "### " line that doesn't match conversation header pattern
          // Treat it as regular content within the current conversation entry
          if (conversationEntry && trimmedLine) {
            conversationEntry.content += line + '\n';
          }
          continue;
        }

        // Tool use headers: "🔧 **Tool Use: TodoWrite**"
        if (trimmedLine.includes('🔧 **Tool Use:') || trimmedLine.includes('Tool Use:')) {
          const toolMatch = trimmedLine.match(/(?:🔧\s*)?(?:\*\*)?Tool Use:\s*([^*]+)(?:\*\*)?/);
          if (toolMatch && conversationEntry) {
            conversationEntry.isToolUse = true;
            conversationEntry.toolName = toolMatch[1].trim();
          }
          continue;
        }

        // Tool result headers: "✅ **Tool Result**"
        if (trimmedLine.includes('✅ **Tool Result**') || trimmedLine.includes('Tool Result')) {
          if (conversationEntry) {
            conversationEntry.isToolResult = true;
          }
          continue;
        }

        // Input/Output sections for tools
        if (trimmedLine === '**Input:**' || trimmedLine === '**Output:**') {
          if (conversationEntry && conversationEntry.isToolUse) {
            // Close previous tool section if exists
            if (conversationEntry.content.includes('<div class="tool-')) {
              conversationEntry.content += '</div>\n';
            }
            conversationEntry.content += `<div class="tool-${trimmedLine.replace(/\*\*/g, '').toLowerCase()}">\n`;
          }
          continue;
        }

        // Code blocks - but skip for tool results (they'll be handled by formatToolResultContent)
        if (trimmedLine === '```json' || trimmedLine === '```') {
          if (conversationEntry && !conversationEntry.isToolResult) {
            if (trimmedLine === '```json') {
              conversationEntry.content += '<pre class="tool-code">';
            } else {
              conversationEntry.content += '</pre>\n';
            }
          }
          continue;
        }

        // Regular content
        if (conversationEntry && trimmedLine) {
          // Clean up the content
          let cleanedLine = line;

          // Remove markdown formatting for display
          cleanedLine = cleanedLine
            .replace(/^\s*\*\*([^*]+)\*\*:?\s*/, '') // Remove **bold** labels
            .replace(/`([^`]+)`/g, '<code>$1</code>'); // Convert inline code

          if (cleanedLine.trim()) {
            conversationEntry.content += cleanedLine + '\n';
          }
        }
      }
    }

    // Handle final entries
    if (conversationEntry) {
      htmlOutput += formatConversationEntry(conversationEntry);
    }
    if (toolEntry) {
      htmlOutput += formatToolEntry(toolEntry);
    }
    if (inConversation) {
      htmlOutput += '</div>';
    }

    return (
      htmlOutput ||
      '<div class="text-center text-muted py-4">Could not parse conversation content</div>'
    );
  } catch (error) {
    console.error('Error formatting session script:', error);
    return '<div class="alert alert-warning">Error parsing conversation content.</div>';
  }
}

/**
 * Format a conversation entry (user or assistant message)
 */
function formatConversationEntry(entry) {
  let speakerClass = entry.speaker.toLowerCase();
  let speakerIcon, speakerColor, speakerLabel;

  // Check if this is a thinking message
  const isThinkingMessage =
    entry.content &&
    entry.content.trim().startsWith('{') &&
    entry.content.includes('"type": "thinking"');

  if (isThinkingMessage) {
    speakerClass = 'thinking';
  }

  // Differentiate between actual users and tool results
  if (entry.isToolResult) {
    speakerIcon = 'bi-gear-fill';
    speakerColor = 'text-info';
    speakerLabel = 'Tool Result';
  } else if (entry.speaker === 'User') {
    speakerIcon = 'bi-person-fill';
    speakerColor = 'text-primary';
    speakerLabel = 'User';
  } else if (isThinkingMessage) {
    speakerIcon = 'bi-lightbulb';
    speakerColor = 'text-success';
    speakerLabel = 'Assistant Thinking';
  } else {
    speakerIcon = 'bi-robot';
    speakerColor = 'text-success';
    speakerLabel = 'Assistant';
  }

  let content = entry.content.trim();

  if (entry.isToolResult) {
    const toolId = `tool-result-${entry.number}-${entry.time.replace(/[^0-9]/g, '')}`;
    return `
      <div class="conversation-entry tool-result mb-3">
        <div class="d-flex align-items-center">
          <div class="speaker-badge ${speakerColor}">
            <i class="bi ${speakerIcon} me-1"></i>
            ${speakerLabel}
          </div>
          <small class="text-muted ms-2">${entry.time}</small>
          <span class="badge bg-info text-dark ms-2">
            <i class="bi bi-check-circle me-1"></i>Result
          </span>
          <button class="btn btn-sm btn-link ms-auto tool-toggle" onclick="toggleTool('${toolId}')" data-tool-id="${toolId}">
            <i class="bi bi-chevron-down"></i>
          </button>
        </div>
        <div id="${toolId}" class="tool-details mt-2" style="display: none;">
          ${content ? formatSimpleToolResultContent(content) : '<em class="text-muted">Tool result details...</em>'}
        </div>
      </div>
    `;
  }

  if (entry.isToolUse) {
    // Ensure any unclosed tool sections are closed
    if (content && content.includes('<div class="tool-') && !content.endsWith('</div>\n')) {
      content += '</div>\n';
    }

    const toolId = `tool-use-${entry.number}-${entry.time.replace(/[^0-9]/g, '')}`;
    return `
      <div class="conversation-entry tool-use mb-3">
        <div class="d-flex align-items-center">
          <div class="speaker-badge ${speakerColor}">
            <i class="bi ${speakerIcon} me-1"></i>
            ${speakerLabel}
          </div>
          <small class="text-muted ms-2">${entry.time}</small>
          <span class="badge bg-warning text-dark ms-2">
            <i class="bi bi-tools me-1"></i>${entry.toolName}
          </span>
          <button class="btn btn-sm btn-link ms-auto tool-toggle" onclick="toggleTool('${toolId}')" data-tool-id="${toolId}">
            <i class="bi bi-chevron-down"></i>
          </button>
        </div>
        <div id="${toolId}" class="tool-details mt-2" style="display: none;">
          ${content || '<em class="text-muted">Tool execution details...</em>'}
        </div>
      </div>
    `;
  }

  // Check if content is tall to add expand button
  const isTall = content && (content.length > 1000 || content.split('\n').length > 15);

  if (isTall) {
    const contentId = 'msg-' + Math.random().toString(36).substring(2, 11);
    return `
      <div class="conversation-entry ${speakerClass} mb-3">
        <div class="d-flex align-items-center mb-2">
          <div class="speaker-badge ${speakerColor}">
            <i class="bi ${speakerIcon} me-1"></i>
            ${speakerLabel}
          </div>
          <small class="text-muted ms-2">${entry.time}</small>
          <button class="btn btn-sm btn-link ms-auto message-expand-btn" onclick="toggleMessageExpansion('${contentId}', this)" data-content-id="${contentId}">
            <i class="bi bi-chevron-down"></i>
          </button>
        </div>
        <div id="${contentId}" class="message-content-collapsible" data-tall="true">
          ${content ? formatMessageContent(content) : '<em class="text-muted">No message content</em>'}
        </div>
      </div>
    `;
  }

  return `
    <div class="conversation-entry ${speakerClass} mb-3">
      <div class="d-flex align-items-center mb-2">
        <div class="speaker-badge ${speakerColor}">
          <i class="bi ${speakerIcon} me-1"></i>
          ${speakerLabel}
        </div>
        <small class="text-muted ms-2">${entry.time}</small>
      </div>
      <div class="message-content">
        <div class="message-content-collapsible">
          ${content ? formatMessageContent(content) : '<em class="text-muted">No message content</em>'}
        </div>
      </div>
    </div>
  `;
}

/**
 * Format tool entry
 */
function formatToolEntry(entry) {
  return `
    <div class="tool-entry mb-2">
      <span class="badge bg-secondary me-2">
        <i class="bi bi-wrench me-1"></i>${entry.tool}
      </span>
      <span class="text-muted">${entry.status}</span>
    </div>
  `;
}

/**
 * Format message content with markdown support using markdown-it library
 */
function formatMessageContent(content) {
  // Check if content is a JSON thinking message
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith('{') && trimmedContent.includes('"type": "thinking"')) {
    try {
      const thinkingData = JSON.parse(trimmedContent);
      if (thinkingData.type === 'thinking' && thinkingData.thinking) {
        // Return the thinking content with special formatting
        return formatThinkingContent(thinkingData.thinking);
      }
    } catch (error) {
      // If JSON parsing fails, fall back to regular formatting
      console.warn('Failed to parse thinking JSON:', error);
    }
  }

  // SECURITY: Use MarkdownService for consistent and safe rendering
  if (window.MarkdownService) {
    const result = window.MarkdownService.renderMarkdown(content);
    
    // Post-process to style inline code blocks
    return result.replace(
      /<code>/g,
      '<code class="bg-light px-1 rounded">'
    );
  }

  // Legacy fallback: Use markdown-it directly if MarkdownService not available
  if (typeof markdownit !== 'undefined') {
    const md = markdownit({
      html: false, // Disable HTML tags for security
      breaks: true, // Convert \n in paragraphs to <br>
      linkify: false, // Don't auto-convert URLs to links
      typographer: false, // Disable smart quotes/dashes for simplicity
    });

    let result = md.render(content);

    // Post-process to handle <code> tags that the AI generates
    result = result.replace(
      /&lt;code&gt;([^&]+)&lt;\/code&gt;/g,
      '<code class="bg-light px-1 rounded">$1</code>'
    );

    return result;
  } else {
    // Fallback if markdown-it isn't loaded
    console.warn('markdown-it library not loaded, falling back to simple formatting');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .map(line => `<p class="mb-2">${escapeHtml(line)}</p>`)
      .join('');
  }

  // Helper function for fallback
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

/**
 * Format thinking content with special styling for internal monologue
 */
function formatThinkingContent(thinkingText) {
  const formattedContent = thinkingText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .map(line => {
      // Escape HTML characters to prevent breaking out of containers
      const escapedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return `<p class="mb-2 thinking-content">${escapedLine}</p>`;
    })
    .join('');

  return formattedContent;
}

/**
 * Format tool result content without truncation (tools are already collapsed)
 */
function formatSimpleToolResultContent(content) {
  // Clean up common tool result patterns
  const cleanedContent = content
    .replace(/^\*\*Output:\*\*/m, '') // Remove **Output:** header
    .replace(/^```\n?/m, '') // Remove opening code fence
    .replace(/\n?```$/m, '') // Remove closing code fence
    .trim();

  if (!cleanedContent) {
    return '<em class="text-muted">No output</em>';
  }

  // Always escape HTML characters
  const escapedContent = cleanedContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Preserve line breaks and format appropriately
  if (cleanedContent.includes('\n')) {
    // Multi-line content - use CSS-controlled pre styling
    return `<div class="tool-result-output"><pre>${escapedContent}</pre></div>`;
  } else {
    // Single line content
    return `<div class="tool-result-message">${escapedContent}</div>`;
  }
}

// Tool collapsing functionality
function toggleTool(toolId) {
  const toolDetails = document.getElementById(toolId);
  const toggleButton = document.querySelector(`[data-tool-id="${toolId}"]`);
  const chevronIcon = toggleButton.querySelector('i');

  if (toolDetails.style.display === 'none') {
    toolDetails.style.display = 'block';
    chevronIcon.className = 'bi bi-chevron-up';
  } else {
    toolDetails.style.display = 'none';
    chevronIcon.className = 'bi bi-chevron-down';
  }
}

function toggleAllTools(sessionId) {
  const formattedView = document.getElementById(`formattedView_${sessionId}`);
  const toggleButton = document.getElementById('toggleAllToolsBtn');
  const buttonIcon = toggleButton.querySelector('i');
  const buttonText = toggleButton.childNodes[2]; // The text node after the icon and space

  const toolDetails = formattedView.querySelectorAll('.tool-details');
  const toggleButtons = formattedView.querySelectorAll('.tool-toggle i');

  // Check if any tools are currently expanded
  const hasExpandedTools = Array.from(toolDetails).some(detail => detail.style.display !== 'none');

  if (hasExpandedTools) {
    // Collapse all tools
    toolDetails.forEach(detail => (detail.style.display = 'none'));
    toggleButtons.forEach(icon => (icon.className = 'bi bi-chevron-down'));
    buttonIcon.className = 'bi bi-arrows-expand me-1';
    buttonText.textContent = 'Expand All Tools';
  } else {
    // Expand all tools
    toolDetails.forEach(detail => (detail.style.display = 'block'));
    toggleButtons.forEach(icon => (icon.className = 'bi bi-chevron-up'));
    buttonIcon.className = 'bi bi-arrows-collapse me-1';
    buttonText.textContent = 'Collapse All Tools';
  }
}

// Message content expansion functionality
function toggleMessageExpansion(contentId, button) {
  const messageDiv = document.getElementById(contentId);
  const icon = button.querySelector('i');

  if (messageDiv.classList.contains('expanded')) {
    messageDiv.classList.remove('expanded');
    icon.className = 'bi bi-chevron-down';
  } else {
    messageDiv.classList.add('expanded');
    icon.className = 'bi bi-chevron-up';
  }
}

// Error handling utilities
function showError(message) {
  const statusContainer = document.getElementById('statusMessages');
  statusContainer.innerHTML = `
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      <strong>Error:</strong> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;

  // Also update the session script container to show error
  const container = document.getElementById('sessionScriptContainer');
  if (container) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>
        ${message}
      </div>
    `;
  }
}

/**
 * Toggle conversation-only mode to hide/show tool messages
 */
function toggleConversationOnly() {
  console.log('🔍 Toggling conversation only mode...');
  const container = document.getElementById(`formattedView_${currentSessionId}`);
  const button = document.getElementById('conversationOnlyBtn');
  console.log('Container found:', !!container, 'ID:', `formattedView_${currentSessionId}`);
  console.log('Button found:', !!button);

  const buttonIcon = button.querySelector('i');
  const buttonText = button.childNodes[2]; // The text node after icon and space

  if (container.classList.contains('conversation-only')) {
    // Turn off conversation-only mode - show all messages
    container.classList.remove('conversation-only');
    buttonIcon.className = 'bi bi-chat-text me-1';
    buttonText.textContent = 'Conversation Only';
    button.classList.remove('btn-primary');
    button.classList.add('btn-outline-primary');
    console.log('🔄 Conversation-only mode: OFF - removed conversation-only class');
    console.log('Container classes after:', container.className);
  } else {
    // Turn on conversation-only mode - hide tool messages
    container.classList.add('conversation-only');
    buttonIcon.className = 'bi bi-chat-dots-fill me-1';
    buttonText.textContent = 'Show All Messages';
    button.classList.remove('btn-outline-primary');
    button.classList.add('btn-primary');
    console.log('🎯 Conversation-only mode: ON - added conversation-only class');
    console.log('Container classes after:', container.className);

    // Debug: Count tool messages found
    const toolUseMessages = container.querySelectorAll('.conversation-entry.tool-use');
    const toolResultMessages = container.querySelectorAll('.conversation-entry.tool-result');
    console.log(
      `Found ${toolUseMessages.length} tool-use messages and ${toolResultMessages.length} tool-result messages`
    );
    console.log('First tool message classes:', toolUseMessages[0]?.className);
  }
}
