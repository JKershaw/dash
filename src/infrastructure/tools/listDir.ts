import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build']);

export function createListDirTool(
  repoPath: string,
  maxEntries: number = 200,
): (dirPath: string) => Promise<string> {
  return async function listDir(dirPath: string): Promise<string> {
    try {
      const resolved = path.resolve(repoPath, dirPath);
      const normalizedRepo = path.resolve(repoPath);

      if (!resolved.startsWith(normalizedRepo + path.sep) && resolved !== normalizedRepo) {
        return `Error: Path traversal detected. "${dirPath}" resolves outside the repository.`;
      }

      const stat = await fs.promises.stat(resolved);
      if (!stat.isDirectory()) {
        return `Error: "${dirPath}" is not a directory.`;
      }

      const lines: string[] = [];
      await walkDir(resolved, '', 0, 2, lines);

      if (lines.length === 0) {
        return '(empty directory)';
      }

      if (lines.length > maxEntries) {
        const truncated = lines.slice(0, maxEntries);
        truncated.push(`\n... (truncated, showing ${maxEntries} of ${lines.length} entries)`);
        return truncated.join('\n');
      }

      return lines.join('\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error listing directory "${dirPath}": ${message}`;
    }
  };

  async function walkDir(
    basePath: string,
    relativePath: string,
    depth: number,
    maxDepth: number,
    lines: string[],
  ): Promise<void> {
    const entries = await fs.promises.readdir(basePath, { withFileTypes: true });

    entries.sort((a, b) => {
      const aIsDir = a.isDirectory() ? 0 : 1;
      const bIsDir = b.isDirectory() ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.localeCompare(b.name);
    });

    const indent = '  '.repeat(depth);

    for (const entry of entries) {
      if (EXCLUDED.has(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`);
        if (depth < maxDepth - 1) {
          await walkDir(
            path.join(basePath, entry.name),
            path.join(relativePath, entry.name),
            depth + 1,
            maxDepth,
            lines,
          );
        }
      } else {
        lines.push(`${indent}${entry.name}`);
      }
    }
  }
}
