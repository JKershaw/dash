/**
 * @file Formats session data into human-readable script format
 */
import fs from 'fs/promises';
import path from 'path';
import {
  formatScriptTime,
  formatDuration,
  formatElapsedTime,
  formatScriptDate,
} from '../../domain/time-utils.js';
import {
  analyzeSessionStruggles,
  getAnnotationsForTool as _getAnnotationsForTool,
  generateStrugglesSection,
} from './struggle-annotator.js';

/**
 * Main script formatter class
 */
export class ScriptFormatter {
  /**
   * Format a session into script format
   * @param {object} session - Normalized session object
   * @returns {string} Formatted script markdown
   */
  static formatSession(session) {
    if (!session) return '';

    const struggles = analyzeSessionStruggles(session);
    const script = [];

    // Header
    script.push(this.generateHeader(session));
    script.push('---');

    // Build and format scenes
    const scenes = this.buildScenes(session);
    scenes.forEach((scene, index) => {
      script.push(this.formatScene(scene, index + 1, session.startTime, struggles.annotations));
    });

    // Struggles section
    script.push('---');
    script.push(generateStrugglesSection(struggles, session));

    // Footer
    script.push(
      `*Session ended at ${formatScriptTime(session.endTime)} - Duration: ${formatDuration(session.startTime, session.endTime)}*`
    );

    return script.join('\n\n');
  }

  /**
   * Generate session header
   * @param {object} session - Session data
   * @returns {string} Formatted header
   */
  static generateHeader(session) {
    const projectName = session.projectName || 'Unknown Project';
    const summary = this.extractSessionSummary(session);

    let header = `# Session Script: ${summary}\n`;
    header += `**Session ID:** ${session.sessionId}  \n`;
    header += `**Duration:** ${formatScriptDate(session.startTime)} ${formatScriptTime(session.startTime)} - ${formatScriptTime(session.endTime)} (${formatDuration(session.startTime, session.endTime)})  \n`;
    header += `**Project:** ${projectName}  \n`;

    // Tool usage summary
    const toolSummary = this.generateToolSummary(session.toolOperations);
    if (toolSummary) {
      header += `**Tools Used:** ${toolSummary}`;
    }

    return header;
  }

  /**
   * Extract session summary from first message or summary entry
   * @param {object} session - Session data
   * @returns {string} Session summary
   */
  static extractSessionSummary(session) {
    // Look for summary entry first
    const summaryEntry = session.conversation.find(entry => entry.type === 'summary');
    if (summaryEntry && summaryEntry.summary) {
      return summaryEntry.summary;
    }

    // Fall back to first user message
    const firstUserMessage = session.conversation.find(entry => entry.type === 'user');
    if (firstUserMessage && firstUserMessage.message && firstUserMessage.message.content) {
      const content =
        typeof firstUserMessage.message.content === 'string'
          ? firstUserMessage.message.content
          : firstUserMessage.message.content[0]?.text || '';
      return content.length > 60 ? content.substring(0, 60) + '...' : content;
    }

    return 'Development Session';
  }

  /**
   * Generate tool usage summary
   * @param {Array} toolOperations - Tool operations from session
   * @returns {string} Tool summary string
   */
  static generateToolSummary(toolOperations) {
    if (!toolOperations || toolOperations.length === 0) return '';

    const toolCounts = {};
    toolOperations.forEach(op => {
      toolCounts[op.name] = (toolCounts[op.name] || 0) + 1;
    });

    return Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tool, count]) => `${tool}(${count})`)
      .join(', ');
  }

  /**
   * Build scenes from conversation
   * @param {object} session - Session data
   * @returns {Array} Array of scene objects
   */
  static buildScenes(session) {
    const scenes = [];
    const conversation = session.conversation || [];

    let currentScene = null;
    let sceneCounter = 0;

    conversation.forEach((entry, _index) => {
      const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;

      if (entry.type === 'user') {
        // Start new scene with user message
        if (currentScene) {
          scenes.push(currentScene);
        }

        sceneCounter++;
        currentScene = {
          sceneNumber: sceneCounter,
          title: this.generateSceneTitle(entry, sceneCounter),
          timestamp,
          userMessage: entry,
          assistantResponses: [],
          toolOperations: [],
        };
      } else if (entry.type === 'assistant' && currentScene) {
        // Add assistant response to current scene
        currentScene.assistantResponses.push(entry);

        // Extract tool operations from this response
        const toolOps = this.extractToolOperationsFromMessage(entry, session.toolOperations);
        currentScene.toolOperations.push(...toolOps);
      }
    });

    // Add the last scene
    if (currentScene) {
      scenes.push(currentScene);
    }

    return scenes;
  }

  /**
   * Generate scene title from user message
   * @param {object} userEntry - User message entry
   * @param {number} sceneNumber - Scene number
   * @returns {string} Scene title
   */
  static generateSceneTitle(userEntry, sceneNumber) {
    if (!userEntry.message || !userEntry.message.content) {
      return `Scene ${sceneNumber}`;
    }

    let content = '';
    if (typeof userEntry.message.content === 'string') {
      content = userEntry.message.content;
    } else if (Array.isArray(userEntry.message.content)) {
      // Handle tool results or text content
      const textContent = userEntry.message.content.find(
        item => item.type === 'text' || typeof item === 'string'
      );
      if (textContent) {
        content = typeof textContent === 'string' ? textContent : textContent.text || '';
      } else {
        // This might be a tool result response
        const toolResults = userEntry.message.content.filter(item => item.type === 'tool_result');
        if (toolResults.length > 0) {
          return `System Responses`;
        }
      }
    }

    if (content.length === 0) {
      return `Scene ${sceneNumber}`;
    }

    // Extract key action or intent
    const actionVerbs = [
      'understand',
      'create',
      'fix',
      'implement',
      'analyze',
      'read',
      'review',
      'build',
      'test',
    ];
    const lowerContent = content.toLowerCase();

    for (const verb of actionVerbs) {
      if (lowerContent.includes(verb)) {
        const capitalize = verb.charAt(0).toUpperCase() + verb.slice(1);
        return `${capitalize} Request`;
      }
    }

    // Fallback to first few words
    const words = content.trim().split(/\s+/).slice(0, 4).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  }

  /**
   * Extract tool operations from assistant message
   * @param {object} assistantEntry - Assistant message entry
   * @param {Array} allToolOperations - All session tool operations
   * @returns {Array} Tool operations from this message
   */
  static extractToolOperationsFromMessage(assistantEntry, allToolOperations) {
    if (!assistantEntry.message || !Array.isArray(assistantEntry.message.content)) {
      return [];
    }

    const toolUses = assistantEntry.message.content.filter(item => item.type === 'tool_use');
    const matchedOperations = [];

    toolUses.forEach(toolUse => {
      const matchingOp = allToolOperations.find(op => {
        return (
          op.name === toolUse.name && JSON.stringify(op.input) === JSON.stringify(toolUse.input)
        );
      });

      if (matchingOp) {
        matchedOperations.push({
          ...matchingOp,
          toolUseId: toolUse.id,
        });
      }
    });

    return matchedOperations;
  }

  /**
   * Format a scene
   * @param {object} scene - Scene data
   * @param {number} sceneNumber - Scene number
   * @param {Date} sessionStartTime - Session start time for elapsed calculation
   * @param {Array} annotations - Struggle annotations
   * @returns {string} Formatted scene
   */
  static formatScene(scene, sceneNumber, sessionStartTime, annotations) {
    let sceneText = '';

    // User message
    if (scene.userMessage) {
      const elapsed = scene.timestamp ? formatElapsedTime(sessionStartTime, scene.timestamp) : '';
      const userContent = this.formatMessageContent(
        scene.userMessage.message.content,
        scene.toolOperations
      );

      // Skip this user message if it's been filtered out as redundant
      if (userContent !== null) {
        sceneText += `<div class="script-user-message">\n`;
        sceneText += `<div class="script-timestamp">[${formatScriptTime(scene.timestamp)}${elapsed ? ' ' + elapsed : ''}]</div>\n`;
        sceneText += `<div class="script-speaker user">USER:</div>\n`;
        sceneText += `<div>${userContent}</div>\n`;
        sceneText += `</div>\n\n`;
      }
    }

    // Assistant responses and tool operations
    scene.assistantResponses.forEach((response, index) => {
      sceneText += this.formatAssistantResponse(response, scene.toolOperations, annotations, index);
    });

    return sceneText;
  }

  /**
   * Format message content (handles both string and array formats)
   * @param {string|Array} content - Message content
   * @param {Array} toolOperations - Available tool operations for context
   * @returns {string} Formatted content
   */
  static formatMessageContent(content, toolOperations = []) {
    if (typeof content === 'string') {
      // Filter out redundant tool completion messages
      if (this.isRedundantToolCompletionMessage(content)) {
        return null; // Signal to skip this message
      }
      return content;
    }

    if (Array.isArray(content)) {
      // Handle different content types
      const textParts = [];
      const toolResults = [];

      content.forEach(item => {
        if (typeof item === 'string') {
          if (!this.isRedundantToolCompletionMessage(item)) {
            textParts.push(item);
          }
        } else if (item.type === 'text') {
          const text = item.text || '';
          if (!this.isRedundantToolCompletionMessage(text)) {
            textParts.push(text);
          }
        } else if (item.type === 'tool_result') {
          const toolResult = this.formatToolResult(item, toolOperations);
          if (toolResult !== null) {
            toolResults.push(toolResult);
          }
        }
      });

      if (textParts.length > 0) {
        return textParts.join(' ');
      }

      if (toolResults.length > 0) {
        return toolResults.join(' | ');
      }

      // If both text parts and tool results are empty, skip this message entirely
      return null;
    }

    return '[Unknown content format]';
  }

  /**
   * Check if a message is a redundant tool completion message
   * @param {string} content - Message content to check
   * @returns {boolean} True if message should be filtered out
   */
  static isRedundantToolCompletionMessage(content) {
    if (typeof content !== 'string') return false;

    const trimmedContent = content.trim();

    // Common tool completion patterns to filter out
    const redundantPatterns = [
      /^✅\s*Tool completed$/i,
      /^Tool completed$/i,
      /^✅\s*$/,
      /^Done$/i,
      /^Complete$/i,
      /^Success$/i,
      /^✅\s*Done$/i,
      /^✅\s*Complete$/i,
      /^✅\s*Success$/i,
    ];

    return redundantPatterns.some(pattern => pattern.test(trimmedContent));
  }

  /**
   * Format tool result for display
   * @param {object} toolResult - Tool result object
   * @param {Array} toolOperations - Available tool operations for context
   * @returns {string} Formatted tool result
   */
  static formatToolResult(toolResult, toolOperations = []) {
    if (toolResult.is_error) {
      return `❌ Tool error`;
    }

    // Try to find the matching tool operation to get the tool name
    const matchingOp = toolOperations.find(op => op.toolUseId === toolResult.tool_use_id);
    const toolName = matchingOp ? matchingOp.name : 'Tool';

    // Provide tool-specific summaries
    if (matchingOp) {
      return this.getToolResultSummary(matchingOp) || `✅ ${toolName} completed`;
    }

    // Skip generic tool completion messages - they add no value
    return null;
  }

  /**
   * Format assistant response with tool operations
   * @param {object} response - Assistant response
   * @param {Array} toolOperations - Tool operations for this scene
   * @param {Array} annotations - Struggle annotations
   * @param {number} responseIndex - Index of this response in the scene
   * @returns {string} Formatted response
   */
  static formatAssistantResponse(response, toolOperations, _annotations, _responseIndex) {
    let responseText = '';

    const timestamp = response.timestamp ? new Date(response.timestamp) : null;

    // Extract text content
    const textContent = this.extractTextFromAssistantMessage(response.message);

    // Claude response block
    if (textContent) {
      responseText += `<div class="script-claude-response">\n`;
      if (timestamp) {
        responseText += `<div class="script-timestamp">[${formatScriptTime(timestamp)}]</div>\n`;
      }
      responseText += `<div class="script-speaker claude">CLAUDE:</div>\n`;
      responseText += `<div>${textContent}</div>\n`;
      responseText += `</div>\n\n`;
    }

    // Tool operations
    const toolUses = this.extractToolUsesFromMessage(response.message);
    if (toolUses.length > 0) {
      responseText += `<div class="script-tool-actions">\n`;
      if (timestamp && !textContent) {
        responseText += `<div class="script-timestamp">[${formatScriptTime(timestamp)}]</div>\n`;
      }
      responseText += `<div class="script-speaker claude">Actions:</div>\n`;

      toolUses.forEach(toolUse => {
        const matchingOp = toolOperations.find(op => op.toolUseId === toolUse.id);
        responseText += this.formatToolOperation(toolUse, matchingOp, _annotations);
      });

      // Add brief thinking note if multiple tools used
      if (toolUses.length > 1) {
        responseText += `<div class="thinking-note">Multiple tools used in parallel</div>\n`;
      }
      responseText += `</div>\n\n`;
    }

    return responseText;
  }

  /**
   * Extract text content from assistant message
   * @param {object} message - Assistant message
   * @returns {string|null} Text content
   */
  static extractTextFromAssistantMessage(message) {
    if (!message || !Array.isArray(message.content)) return null;

    const textItems = message.content.filter(item => item.type === 'text');
    if (textItems.length === 0) return null;

    return textItems
      .map(item => item.text)
      .join(' ')
      .trim();
  }

  /**
   * Extract tool uses from message
   * @param {object} message - Assistant message
   * @returns {Array} Tool use objects
   */
  static extractToolUsesFromMessage(message) {
    if (!message || !Array.isArray(message.content)) return [];
    return message.content.filter(item => item.type === 'tool_use');
  }

  /**
   * Format individual tool operation
   * @param {object} toolUse - Tool use object from message
   * @param {object} matchingOp - Matching tool operation with results
   * @param {Array} annotations - Struggle annotations
   * @returns {string} Formatted tool operation
   */
  static formatToolOperation(toolUse, matchingOp, _annotations) {
    let opText = `<div class="script-tool-action">\n`;

    // Tool name and description
    opText += `<span class="script-tool-name">${toolUse.name}</span>`;
    const description = this.getToolDescription(toolUse.name, toolUse.input);
    if (description) {
      opText += `<span class="script-tool-description">: ${description}</span>`;
    }

    // Add result status if available
    if (matchingOp) {
      const statusIcon =
        matchingOp.status === 'success' ? '✅' : matchingOp.status === 'error' ? '❌' : '⏳';
      opText += ` <span class="script-tool-status">${statusIcon}</span>`;
    }

    opText += `</div>\n`;

    return opText;
  }

  /**
   * Get human-readable tool description
   * @param {string} toolName - Name of tool
   * @param {object} input - Tool input parameters
   * @returns {string} Tool description
   */
  static getToolDescription(toolName, input) {
    const descriptions = {
      LS: () => `Exploring directory ${input.path || 'current directory'}`,
      Read: () => `Reading file ${path.basename(input.file_path || '')}`,
      Grep: () => `Searching for "${input.pattern}"`,
      Glob: () => `Finding files matching "${input.pattern}"`,
      Edit: () => `Editing ${path.basename(input.file_path || '')}`,
      Write: () => `Writing to ${path.basename(input.file_path || '')}`,
      Bash: () =>
        `Running command: ${input.command?.substring(0, 30)}${input.command?.length > 30 ? '...' : ''}`,
      TodoWrite: () => `Managing task list`,
      WebFetch: () => `Fetching from ${input.url}`,
      Task: () => `Delegating task: ${input.description}`,
    };

    const descFn = descriptions[toolName];
    return descFn ? descFn() : `Using ${toolName}`;
  }

  /**
   * Get brief tool result summary
   * @param {object} toolOp - Tool operation with results
   * @returns {string} Result summary
   */
  static getToolResultSummary(toolOp) {
    if (toolOp.status === 'error') {
      return `❌ ${toolOp.name} failed`;
    }

    if (!toolOp.output) return `✅ ${toolOp.name} completed`;

    const outputStr =
      typeof toolOp.output === 'string' ? toolOp.output : JSON.stringify(toolOp.output);

    // Different summaries based on tool type
    switch (toolOp.name) {
      case 'LS':
        const lines = outputStr.split('\n').filter(line => line.trim());
        return `✅ **LS** found ${lines.length} items`;

      case 'Read':
        const lineCount = outputStr.split('\n').length;
        return `✅ **Read** loaded ${lineCount} lines`;

      case 'Grep':
        const matches = outputStr.split('\n').filter(line => line.trim()).length;
        return `✅ **Grep** found ${matches} matches`;

      case 'Glob':
        const files = outputStr.split('\n').filter(line => line.trim()).length;
        return `✅ **Glob** matched ${files} files`;

      case 'Bash':
        return outputStr.length > 0 ? `✅ **Bash** completed` : `✅ **Bash** executed`;

      case 'TodoWrite':
        return `✅ **TodoWrite** updated task list`;

      case 'Edit':
        return `✅ **Edit** modified file`;

      case 'Write':
        return `✅ **Write** saved file`;

      case 'WebFetch':
        return `✅ **WebFetch** retrieved content`;

      case 'Task':
        return `✅ **Task** completed`;

      default:
        return `✅ **${toolOp.name}** completed`;
    }
  }

  /**
   * Generate thinking note for multiple tool uses
   * @param {Array} toolUses - Array of tool use objects
   * @returns {string} Thinking note
   */
  static generateThinkingNote(toolUses) {
    if (toolUses.length === 1) return '';

    const toolNames = toolUses.map(tool => tool.name);
    const uniqueTools = [...new Set(toolNames)];

    if (uniqueTools.length === toolNames.length) {
      return `Smart parallel execution - Claude is gathering multiple pieces of context simultaneously instead of doing them sequentially`;
    } else {
      return `Claude is using multiple related tools to build comprehensive understanding`;
    }
  }

  /**
   * Save formatted script to file
   * @param {object} session - Session data
   * @param {string} outputDir - Output directory path (ignored, using PathManager)
   * @returns {Promise<string>} Path to saved file
   */
  static async saveFormattedScript(session, outputDir) {
    console.log(`🎬 ScriptFormatter.saveFormattedScript called for ${session.sessionId}`);

    const script = this.formatSession(session);
    console.log(`📜 Script generated, length: ${script.length} chars`);

    // Use the same timestamp as the regular session file for consistency
    const projectName = session.projectName || 'unknown';
    console.log(`📁 Project: ${projectName}`);

    // Extract timestamp from session ID or use session's start time
    let filename;
    if (
      session.sessionId &&
      session.sessionId.startsWith('session-') &&
      session.sessionId.includes('-')
    ) {
      // Use existing session ID format: "session-YYYYMMDD-HHMMSS" -> "session-YYYYMMDD-HHMMSS.script.md"
      filename = `${session.sessionId}.script.md`;
    } else {
      // Fallback: generate timestamp from session start time (same as HumanReadableFormatter)
      const sessionTime = session.startTime ? new Date(session.startTime) : new Date();
      const timestamp = sessionTime
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, '')
        .replace(/-/g, '')
        .replace(/(\d{8})(\d{6})/, '$1-$2');
      filename = `session-${timestamp}.script.md`;
    }

    const sanitizedProject = projectName.replace(/[^a-zA-Z0-9-_.]/g, '_');
    const projectDir = path.join(outputDir, '..', 'sessions', sanitizedProject);
    console.log(`📂 Creating directory: ${projectDir}`);
    await fs.mkdir(projectDir, { recursive: true });

    const filePath = path.join(projectDir, filename);
    console.log(`💾 Writing script to: ${filePath} (matching session name)`);
    await fs.writeFile(filePath, script, 'utf-8');
    console.log(`✅ Script file written successfully: ${filename}`);

    return filePath;
  }
}
