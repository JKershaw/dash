import fs from 'node:fs';
import path from 'node:path';

/**
 * Creates a tool to write files within the repository.
 * Rejects path traversal. Creates parent directories as needed.
 * By default skips existing files (overwrite: false) so test generation
 * cannot clobber pre-written tests.
 * Returns { written: true } when the file was created/overwritten,
 * { written: false } when skipped because the file already existed.
 */
export function createWriteFileTool(
  repoPath: string,
): (filePath: string, content: string, opts?: { overwrite?: boolean }) => Promise<{ written: boolean }> {
  return async function writeFile(
    filePath: string,
    content: string,
    opts?: { overwrite?: boolean },
  ): Promise<{ written: boolean }> {
    const resolved = path.resolve(repoPath, filePath);
    const normalizedRepo = path.resolve(repoPath);

    if (!resolved.startsWith(normalizedRepo + path.sep) && resolved !== normalizedRepo) {
      throw new Error(`Path traversal detected. "${filePath}" resolves outside the repository.`);
    }

    const overwrite = opts?.overwrite ?? false;
    if (!overwrite) {
      try {
        await fs.promises.access(resolved);
        // File exists — skip
        return { written: false };
      } catch {
        // File does not exist — proceed
      }
    }

    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf-8');
    return { written: true };
  };
}
