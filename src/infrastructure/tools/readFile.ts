import fs from 'node:fs';
import path from 'node:path';

/**
 * Raw file read — returns exact content, no line-number formatting or caching.
 * Used internally by the runner (diff generation, diagnostics) to read repo files
 * for code manipulation, not LLM display.
 */
export function createReadFileRawTool(
  repoPath: string,
): (filePath: string) => Promise<string> {
  return async function readFileRaw(filePath: string): Promise<string> {
    const resolved = path.resolve(repoPath, filePath);
    const normalizedRepo = path.resolve(repoPath);

    if (!resolved.startsWith(normalizedRepo + path.sep) && resolved !== normalizedRepo) {
      throw new Error(`Path traversal detected. "${filePath}" resolves outside the repository.`);
    }

    return fs.promises.readFile(resolved, 'utf-8');
  };
}

export function createReadFileTool(
  repoPath: string,
  maxLines: number,
): (path: string, startLine?: number, endLine?: number) => Promise<string> {
  const readFullFiles = new Map<string, { content: string; readCount: number }>();

  return async function readFile(
    filePath: string,
    startLine?: number,
    endLine?: number,
  ): Promise<string> {
    try {
      const resolved = path.resolve(repoPath, filePath);
      const normalizedRepo = path.resolve(repoPath);

      if (!resolved.startsWith(normalizedRepo + path.sep) && resolved !== normalizedRepo) {
        return `Error: Path traversal detected. "${filePath}" resolves outside the repository.`;
      }

      const isFullRead = startLine === undefined && endLine === undefined;
      if (isFullRead && readFullFiles.has(filePath)) {
        const entry = readFullFiles.get(filePath)!;
        entry.readCount++;
        if (entry.readCount >= 3) {
          return 'File already read. Use search or listDir to find other files, or summarize findings with [DISCOVERIES] markers.';
        }
        // 2nd read: return cached content (no disk I/O)
        return entry.content;
      }

      const content = await fs.promises.readFile(resolved, 'utf-8');
      let lines = content.split('\n');

      if (startLine !== undefined || endLine !== undefined) {
        const start = Math.max((startLine ?? 1) - 1, 0);
        const end = endLine !== undefined ? endLine : lines.length;
        lines = lines.slice(start, end);

        const lineOffset = start;
        const truncated = lines.slice(0, maxLines);
        const numbered = truncated.map((line, i) => {
          const lineNum = lineOffset + i + 1;
          return `${String(lineNum).padStart(5)} | ${line}`;
        });

        let result = numbered.join('\n');
        if (lines.length > maxLines) {
          result += `\n... (truncated, showing ${maxLines} of ${lines.length} lines in range)`;
        }
        return result;
      }

      const truncated = lines.slice(0, maxLines);
      const numbered = truncated.map((line, i) => {
        const lineNum = i + 1;
        return `${String(lineNum).padStart(5)} | ${line}`;
      });

      let result = numbered.join('\n');
      if (lines.length > maxLines) {
        result += `\n... (truncated, showing ${maxLines} of ${lines.length} lines)`;
      }

      if (isFullRead) {
        readFullFiles.set(filePath, { content: result, readCount: 1 });
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error reading file "${filePath}": ${message}`;
    }
  };
}
