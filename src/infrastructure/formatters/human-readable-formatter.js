import fs from 'fs/promises';
import path from 'path';
import { getSessionFilePath, ensureDirectoryExists } from '../file-management/paths.js';

/**
 * Formats parsed log data into human-readable format
 */
export class HumanReadableFormatter {
  /**
   * Formats a session into human-readable markdown
   * @param {object} session - Session object from session analyzer
   * @returns {string} Formatted markdown content
   */
  static formatSession(session) {
    const lines = [];

    // Header
    lines.push(`# Session: ${session.projectName} / ${session.sessionId}`);
    lines.push('');

    // Session metadata
    lines.push('## Session Overview');
    lines.push('');
    lines.push(`**Duration:** ${this.formatDuration(session.durationSeconds)}`);
    if (session.startTime) {
      lines.push(`**Start Time:** ${session.startTime.toLocaleString()}`);
    }
    if (session.endTime) {
      lines.push(`**End Time:** ${session.endTime.toLocaleString()}`);
    }
    lines.push(`**Total Entries:** ${session.entryCount}`);
    lines.push(`**Tool Operations:** ${session.toolOperations.length}`);
    lines.push('');

    // Data quality issues
    if (session.dataQualityIssues && session.dataQualityIssues.length > 0) {
      lines.push('## Data Quality Issues');
      lines.push('');
      session.dataQualityIssues.forEach(issue => {
        lines.push(`- ⚠️ ${issue}`);
      });
      lines.push('');
    }

    // Tool operations summary
    if (session.toolOperations.length > 0) {
      lines.push('## Tool Operations Summary');
      lines.push('');

      const toolStats = this.getToolStats(session.toolOperations);
      lines.push('| Tool Name | Status | Input | Output |');
      lines.push('|---|---|---|---|');

      session.toolOperations.forEach(op => {
        const input = this.truncateText(this.formatToolInput(op.input), 50);
        const output = this.truncateText(this.formatToolOutput(op.output), 50);
        lines.push(`| ${op.name} | ${op.status} | ${input} | ${output} |`);
      });
      lines.push('');

      // Tool statistics
      lines.push('### Tool Usage Statistics');
      lines.push('');
      Object.entries(toolStats).forEach(([tool, stats]) => {
        lines.push(
          `**${tool}:** ${stats.total} operations (${stats.success} success, ${stats.error} errors)`
        );
      });
      lines.push('');
    }

    // Conversation flow
    lines.push('## Conversation Flow');
    lines.push('');

    session.conversation.forEach((entry, index) => {
      lines.push(this.formatConversationEntry(entry, index + 1));
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Formats a single conversation entry
   */
  static formatConversationEntry(entry, index) {
    const lines = [];
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toLocaleTimeString()
      : 'No timestamp';

    lines.push(`### ${index}. ${this.capitalizeFirst(entry.type)} (${timestamp})`);
    lines.push('');

    if (entry.message && entry.message.content) {
      if (Array.isArray(entry.message.content)) {
        entry.message.content.forEach(content => {
          lines.push(this.formatContentItem(content));
        });
      } else if (typeof entry.message.content === 'string') {
        lines.push(this.formatTextContent(entry.message.content));
      }
    }

    return lines.join('\n');
  }

  /**
   * Formats individual content items
   */
  static formatContentItem(content) {
    switch (content.type) {
      case 'text':
        return this.formatTextContent(content.text);

      case 'tool_use':
        return this.formatToolUse(content);

      case 'tool_result':
        return this.formatToolResult(content);

      default:
        return `**${content.type}:** ${JSON.stringify(content, null, 2)}`;
    }
  }

  /**
   * Formats text content with proper wrapping
   */
  static formatTextContent(text) {
    if (!text) return '';

    // Split into paragraphs and format code blocks
    const paragraphs = text.split('\n\n');
    return paragraphs
      .map(para => {
        if (para.includes('```')) {
          return para; // Keep code blocks as-is
        }
        return para.trim();
      })
      .join('\n\n');
  }

  /**
   * Formats tool use information
   */
  static formatToolUse(toolUse) {
    const lines = [];
    lines.push(`🔧 **Tool Use: ${toolUse.name}**`);
    lines.push('');
    lines.push('**Input:**');
    lines.push('```json');
    lines.push(JSON.stringify(toolUse.input, null, 2));
    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Formats tool result information
   */
  static formatToolResult(result) {
    const lines = [];
    const status = result.is_error ? '❌' : '✅';
    lines.push(`${status} **Tool Result**`);
    lines.push('');

    if (typeof result.content === 'string') {
      lines.push('**Output:**');
      lines.push('```');
      lines.push(this.truncateText(result.content, 1000));
      lines.push('```');
    } else if (Array.isArray(result.content)) {
      lines.push('**Output:**');
      result.content.forEach(item => {
        if (item.type === 'text') {
          lines.push('```');
          lines.push(this.truncateText(item.text, 1000));
          lines.push('```');
        } else {
          lines.push(`**${item.type}:** ${JSON.stringify(item, null, 2)}`);
        }
      });
    }

    return lines.join('\n');
  }

  /**
   * Gets statistics about tool usage
   */
  static getToolStats(toolOperations) {
    const stats = {};

    toolOperations.forEach(op => {
      if (!stats[op.name]) {
        stats[op.name] = { total: 0, success: 0, error: 0 };
      }

      stats[op.name].total++;
      if (op.status === 'success') {
        stats[op.name].success++;
      } else if (op.status === 'error') {
        stats[op.name].error++;
      }
    });

    return stats;
  }

  /**
   * Escapes text for markdown table formatting
   */
  static escapeForTable(text) {
    if (!text) return '';
    return String(text)
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\r/g, '') // Remove carriage returns
      .replace(/\|/g, '\\|') // Escape pipe characters
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .trim(); // Remove leading/trailing whitespace
  }

  /**
   * Formats tool input for display
   */
  static formatToolInput(input) {
    if (typeof input === 'string') {
      return this.escapeForTable(input);
    }
    return this.escapeForTable(JSON.stringify(input));
  }

  /**
   * Formats tool output for display
   */
  static formatToolOutput(output) {
    let result;
    if (typeof output === 'string') {
      result = output;
    } else if (Array.isArray(output)) {
      result = output
        .map(item => {
          if (item.type === 'text') {
            return item.text;
          }
          return JSON.stringify(item);
        })
        .join(' ');
    } else {
      result = JSON.stringify(output);
    }
    return this.escapeForTable(result);
  }

  /**
   * Formats duration in a human-readable way
   */
  static formatDuration(seconds) {
    if (!seconds || seconds < 0) return 'Unknown';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Truncates text to a maximum length
   */
  static truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Capitalizes the first letter of a string
   */
  static capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Saves a formatted session to a file
   * @param {object} session - Session object
   * @param {string} outputDir - Directory to save the file
   */
  static async saveFormattedSession(session, _outputDir) {
    // Note: outputDir parameter is unused - getSessionFilePath uses getSessionsDir() internally
    try {
      // Generate filename using session's timestamp (session timestamps are already unique)
      const sessionTime = session.startTime ? new Date(session.startTime) : new Date();
      const timestamp = sessionTime
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, '')
        .replace(/-/g, '')
        .replace(/(\d{8})(\d{6})/, '$1-$2');

      // Update session ID to match the filename for consistency
      const timestampSessionId = `session-${timestamp}`;
      session.sessionId = timestampSessionId;

      const filePath = getSessionFilePath(session.projectName, `${timestampSessionId}.md`);

      // Ensure directory exists before writing
      const dir = path.dirname(filePath);
      await ensureDirectoryExists(dir);

      // Format and save (remove excessive logging)
      const formattedContent = this.formatSession(session);
      await fs.writeFile(filePath, formattedContent, 'utf-8');

      return filePath;
    } catch (error) {
      console.error(`Error saving formatted session: ${error.message}`);
      throw error;
    }
  }

  // Session index creation removed - sessions are now loaded directly from files
}
