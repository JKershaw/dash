import { exec } from 'node:child_process';
import { join } from 'node:path';

export interface SyntaxCheckResult {
  valid: boolean;
  file: string;
  error?: string;
}

/**
 * Runs `node --check` on a .js file to detect syntax errors before running tests.
 * Returns immediately for non-.js files (valid: true).
 *
 * This is a fast (~50ms) deterministic check that catches stray braces, typos,
 * and other syntax issues that would otherwise produce unhelpful test output.
 */
export async function checkJsSyntax(
  filePath: string,
  repoPath: string,
): Promise<SyntaxCheckResult> {
  // Only check .js and .mjs files
  if (!filePath.endsWith('.js') && !filePath.endsWith('.mjs')) {
    return { valid: true, file: filePath };
  }

  const fullPath = join(repoPath, filePath);

  return new Promise<SyntaxCheckResult>((resolve) => {
    exec(`node --check "${fullPath}"`, {
      cwd: repoPath,
      timeout: 5000,
    }, (error, _stdout, stderr) => {
      if (error) {
        // Extract the meaningful error line from stderr
        const stderrStr = typeof stderr === 'string' ? stderr : '';
        // Node --check output format: "path:line\ncode\n^^\nSyntaxError: message"
        const syntaxMatch = stderrStr.match(/SyntaxError:\s*(.+)/);
        const lineMatch = stderrStr.match(/:(\d+)\n/);
        const errorMsg = syntaxMatch
          ? `SyntaxError${lineMatch ? ` at line ${lineMatch[1]}` : ''}: ${syntaxMatch[1]}`
          : stderrStr.trim().slice(0, 200);

        resolve({
          valid: false,
          file: filePath,
          error: errorMsg,
        });
      } else {
        resolve({ valid: true, file: filePath });
      }
    });
  });
}
