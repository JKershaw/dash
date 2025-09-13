import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getLogsDir } from '../../config.js';

const _homeDir = os.homedir();

function getSearchPaths() {
  // Use the simplified configuration
  return [getLogsDir()];
}

async function findJsonlFiles(dir) {
  let results = [];
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const res = path.resolve(dir, dirent.name);
      if (dirent.isDirectory()) {
        results = results.concat(await findJsonlFiles(res));
      } else if (res.endsWith('.jsonl')) {
        // Simple duration-based filtering: Skip very short sessions (system-generated + low-value human chats)
        // Skip duration filtering in test mode - we want all test fixtures
        if (process.env.NODE_ENV !== 'test' && (await isVeryShortSession(res))) {
          continue; // Skip sessions under 60 seconds
        }

        // Get file stats to sort by modification time later
        try {
          const stats = await fs.stat(res);
          results.push({ path: res, mtime: stats.mtime });
        } catch {
          // If we can't get stats, still include the file but with no mtime
          results.push({ path: res, mtime: null });
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading directory ${dir}:`, err);
    }
    // Ignore ENOENT errors for directories that don't exist
  }
  return results;
}

/**
 * Simple duration-based filtering: Skip sessions under 60 seconds
 * This removes both system-generated sessions AND very short human chats with minimal value
 * Much more reliable than content-based detection
 */
async function isVeryShortSession(filePath) {
  try {
    // Read entire file to get accurate timestamps (small files anyway)
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) return true; // Single-line files are definitely short

    // Extract timestamps from first and last log entries
    let firstTimestamp = null;
    let lastTimestamp = null;
    let hasContent = false;

    for (const line of lines) {
      if (!line.startsWith('{')) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          if (!firstTimestamp) firstTimestamp = new Date(entry.timestamp);
          lastTimestamp = new Date(entry.timestamp);
          hasContent = true;

          // Also check for programmatic sessions early (performance optimization)
          if (entry.type === 'user_message' && entry.message && entry.message.content) {
            const userContent = Array.isArray(entry.message.content)
              ? entry.message.content[0]?.text || ''
              : entry.message.content || '';

            // Filter out programmatic LLM analysis sessions immediately
            if (
              userContent.includes('AI Code Analysis Task') ||
              userContent.includes('Enhanced Structured Analysis') ||
              userContent.includes(
                'You are an expert AI assistant analyzing developer productivity data'
              )
            ) {
              return true; // Filter this out
            }
          }
        }
      } catch {
        continue;
      }
    }

    if (!hasContent || !firstTimestamp || !lastTimestamp) return true;

    const durationSeconds = (lastTimestamp - firstTimestamp) / 1000;
    return durationSeconds < 60; // Filter sessions under 1 minute
  } catch {
    // If we can't read the file, include it to be safe
    return false;
  }
}

export async function findLogFiles(config = null, filters = null) {
  const searchPaths = getSearchPaths(config);
  let allFiles = [];
  for (const searchPath of searchPaths) {
    const files = await findJsonlFiles(searchPath);
    allFiles = allFiles.concat(files);
  }

  // Remove duplicates based on file path
  const uniqueFiles = allFiles.filter(
    (file, index, arr) => arr.findIndex(f => f.path === file.path) === index
  );

  // Apply project filtering if specified
  let filteredFiles = uniqueFiles;
  if (filters?.project && typeof filters.project === 'string' && filters.project.trim()) {
    const projectFilter = filters.project.toLowerCase().trim();
    filteredFiles = uniqueFiles.filter(file => {
      const projectName = extractProjectNameFromFilePath(file.path);
      return projectName.toLowerCase().includes(projectFilter);
    });
  }

  // Sort by modification time (most recent first), handling null mtimes
  filteredFiles.sort((a, b) => {
    if (!a.mtime && !b.mtime) return 0;
    if (!a.mtime) return 1; // Files without mtime go to end
    if (!b.mtime) return -1;
    return b.mtime - a.mtime; // Most recent first
  });

  // Return just the file paths
  return filteredFiles.map(file => file.path);
}

/**
 * Extract project name from file path for filtering
 * @param {string} filePath - The file path
 * @returns {string} Project name extracted from path
 */
function extractProjectNameFromFilePath(filePath) {
  // Try to extract project name from directory structure
  const pathSegments = filePath.split(path.sep);
  
  // Look for project-like directory names in the path
  for (let i = pathSegments.length - 1; i >= 0; i--) {
    const segment = pathSegments[i];
    
    // Skip filename and common directory names
    if (segment.includes('.jsonl') || 
        ['logs', 'sessions', 'output', 'test', 'tests'].includes(segment.toLowerCase())) {
      continue;
    }
    
    // Check for meaningful project names (not just timestamps or generic names)
    if (segment && 
        segment.length > 2 && 
        !segment.match(/^\d{4}-\d{2}-\d{2}/) && // Skip date patterns
        !segment.startsWith('conversation_')) {
      return segment;
    }
  }
  
  // Fallback: use the parent directory name
  if (pathSegments.length >= 2) {
    const parentDir = pathSegments[pathSegments.length - 2];
    if (parentDir && !parentDir.includes('.jsonl')) {
      return parentDir;
    }
  }
  
  return 'Unknown';
}
