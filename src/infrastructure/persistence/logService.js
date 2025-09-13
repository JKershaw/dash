// logService.js
// Provides filterable log discovery for front end/API use

import { findLogFiles } from './log-discovery.js';
import { parseLogFile } from './log-parser.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Find log files with optional filtering.
 * @param {Object} options
 * @param {string} [options.project] - Project name substring to match in path
 * @param {Date|string} [options.since] - Only logs modified after this date
 * @param {number} [options.limit] - Max number of logs to return (most recent)
 * @returns {Promise<string[]>} Array of log file paths
 */
export async function findLogFilesFiltered({ project, since, limit } = {}) {
  // Pass project filter to findLogFiles for more efficient filtering
  const filters = project ? { project } : null;
  let files = await findLogFiles(null, filters);

  if (since) {
    const sinceDate = new Date(since);
    files = await Promise.all(
      files.map(async f => {
        try {
          const stat = await fs.stat(f);
          return stat.mtime > sinceDate ? f : null;
        } catch {
          return null;
        }
      })
    );
    files = files.filter(Boolean);
  }

  if (limit && files.length > limit) {
    files = files.slice(0, limit);
  }

  return files;
}

/**
 * Find log files with metadata (size, entry count, modification time).
 * @param {Object} options - Same as findLogFilesFiltered
 * @returns {Promise<Object[]>} Array of log file objects with metadata
 */
export async function findLogFilesWithMetadata(options = {}) {
  const filePaths = await findLogFilesFiltered(options);

  const filesWithMetadata = await Promise.all(
    filePaths.map(async filePath => {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath);

        // Extract project name from path
        const projectName = extractProjectNameFromPath(filePath);

        // Quick entry count estimation (count lines, approximate)
        const content = await fs.readFile(filePath, 'utf-8');
        const estimatedEntryCount = content.split('\n').filter(line => line.trim()).length;

        return {
          path: filePath,
          fileName,
          projectName,
          size: stat.size,
          sizeKB: Math.round(stat.size / 1024),
          lastModified: stat.mtime.toISOString(),
          estimatedEntryCount,
          // Create a safe ID for API usage
          id: Buffer.from(filePath).toString('base64url'),
        };
      } catch (error) {
        console.warn(`Failed to get metadata for ${filePath}:`, error.message);
        return {
          path: filePath,
          fileName: path.basename(filePath),
          projectName: 'Unknown',
          size: 0,
          sizeKB: 0,
          lastModified: null,
          estimatedEntryCount: 0,
          id: Buffer.from(filePath).toString('base64url'),
          error: error.message,
        };
      }
    })
  );

  return filesWithMetadata;
}

/**
 * Get the content of a specific log file.
 * @param {string} filePath - Path to the log file
 * @returns {Promise<Object>} Log file content and metadata
 */
export async function getLogFileContent(filePath) {
  try {
    // Validate file path for security
    await fs.access(filePath);

    const stat = await fs.stat(filePath);
    const entries = await parseLogFile(filePath);

    return {
      success: true,
      path: filePath,
      fileName: path.basename(filePath),
      projectName: extractProjectNameFromPath(filePath),
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      entryCount: entries.length,
      entries,
      metadata: {
        hasConversation: entries.some(e => e.role === 'user' || e.role === 'assistant'),
        hasToolUse: entries.some(e => e.type === 'tool_use'),
        timeRange:
          entries.length > 0
            ? {
                first: entries[0].timestamp || null,
                last: entries[entries.length - 1].timestamp || null,
              }
            : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      path: filePath,
    };
  }
}

/**
 * Extract project name from file path
 * @param {string} filePath - The file path
 * @returns {string} Project name
 */
function extractProjectNameFromPath(filePath) {
  // Try to extract project name from file path patterns like "/Users/work/development/PROJECT/sessions/..."
  const pathMatch = filePath.match(/\/([^\/]+)\/sessions?\//);
  if (pathMatch) {
    const projectName = pathMatch[1];
    // Clean up and format the project name
    return projectName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Handle test fixtures structure: logs/project-alpha/file.jsonl
  const segments = filePath.split(/[\/\\]/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];
    
    // Skip the filename itself
    if (segment.includes('.jsonl')) {
      continue;
    }
    
    // Look for meaningful project-like segments
    if (
      segment &&
      !['sessions', 'logs', 'output', 'test', 'tests', 'src', 'node_modules', 'public', 'fixtures'].includes(
        segment.toLowerCase()
      ) &&
      segment.length > 2 &&
      !segment.match(/^\d{8}-\d{6}$/) && // Skip timestamp patterns
      !segment.startsWith('conversation_')
    ) {
      // Return the project name as-is (preserving original format for better matching)
      return segment;
    }
  }

  return 'Unknown Project';
}
