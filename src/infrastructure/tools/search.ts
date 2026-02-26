import { execSync } from 'node:child_process';
import path from 'node:path';

export function createSearchTool(
  repoPath: string,
  maxResults: number,
): (pattern: string, searchPath?: string) => Promise<string> {
  const hasRg = (() => {
    try {
      execSync('which rg', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  return async function search(
    pattern: string,
    searchPath?: string,
  ): Promise<string> {
    try {
      const normalizedRepo = path.resolve(repoPath);
      let targetDir: string;

      if (searchPath) {
        targetDir = path.resolve(repoPath, searchPath);
        if (!targetDir.startsWith(normalizedRepo + path.sep) && targetDir !== normalizedRepo) {
          return `Error: Path traversal detected. "${searchPath}" resolves outside the repository.`;
        }
      } else {
        targetDir = normalizedRepo;
      }

      const escapedPattern = pattern.replace(/'/g, "'\\''");
      let cmd: string;

      if (hasRg) {
        cmd = `rg -n --max-count ${maxResults} --no-heading '${escapedPattern}' '${targetDir}' 2>/dev/null || true`;
      } else {
        cmd = `grep -rn --include='*' '${escapedPattern}' '${targetDir}' 2>/dev/null | head -n ${maxResults} || true`;
      }

      const output = execSync(cmd, {
        cwd: normalizedRepo,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });

      if (!output.trim()) {
        return `No matches found for pattern: "${pattern}"`;
      }

      const lines = output.trim().split('\n');
      const truncated = lines.slice(0, maxResults);

      const formatted = truncated.map((line) => {
        if (line.startsWith(normalizedRepo)) {
          return line.slice(normalizedRepo.length + 1);
        }
        return line;
      });

      let result = formatted.join('\n');
      if (lines.length > maxResults) {
        result += `\n... (showing ${maxResults} of ${lines.length}+ matches)`;
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error searching for "${pattern}": ${message}`;
    }
  };
}
