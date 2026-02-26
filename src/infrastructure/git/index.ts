import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import type { GitOperations, SyntaxCheckResult } from '../../types/deps.js';
import { checkJsSyntax as checkJsSyntaxImpl } from '../syntaxCheck.js';

export function createGitOperations(): GitOperations {
  function execGit(command: string, repoPath: string): string {
    return execSync(command, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
  }

  async function applyPatch(
    diffString: string,
    repoPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const tmpFile = path.join(tmpdir(), `dash-build-patch-${Date.now()}.diff`);
    try {
      fs.writeFileSync(tmpFile, diffString, 'utf-8');

      try {
        execGit(`git apply --whitespace=fix --check '${tmpFile}'`, repoPath);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Patch check failed: ${message}` };
      }

      execGit(`git apply --whitespace=fix '${tmpFile}'`, repoPath);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to apply patch: ${message}` };
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async function createCommit(message: string, repoPath: string): Promise<void> {
    try {
      execGit('git add -A', repoPath);
      const escapedMessage = message.replace(/'/g, "'\\''");
      execGit(`git commit -m '[dash-build] ${escapedMessage}'`, repoPath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create commit: ${errorMessage}`);
    }
  }

  async function revertLastCommit(repoPath: string): Promise<void> {
    try {
      const lastMessage = execGit('git log -1 --format=%s', repoPath);
      if (!lastMessage.startsWith('[dash-build]')) {
        throw new Error(
          `Last commit is not a dash-build commit. Message: "${lastMessage}"`,
        );
      }
      execGit('git reset --hard HEAD~1', repoPath);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not a dash-build commit')) {
        throw err;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to revert last commit: ${errorMessage}`);
    }
  }

  async function getCurrentBranch(repoPath: string): Promise<string> {
    try {
      return execGit('git rev-parse --abbrev-ref HEAD', repoPath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to get current branch: ${errorMessage}`);
    }
  }

  async function createBranch(name: string, repoPath: string): Promise<void> {
    try {
      execGit(`git checkout -b '${name.replace(/'/g, "'\\''")}'`, repoPath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create branch "${name}": ${errorMessage}`);
    }
  }

  async function resetWorkingTree(repoPath: string): Promise<void> {
    try {
      execGit('git checkout -- .', repoPath);
      // Also remove untracked files that may have been created by the diff
      execGit('git clean -fd', repoPath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to reset working tree: ${errorMessage}`);
    }
  }

  async function checkoutFile(filePath: string, repoPath: string): Promise<void> {
    try {
      const escaped = filePath.replace(/'/g, "'\\''");
      execGit(`git checkout -- '${escaped}'`, repoPath);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to checkout file "${filePath}": ${errorMessage}`);
    }
  }

  async function checkJsSyntax(filePath: string, repoPath: string): Promise<SyntaxCheckResult> {
    return checkJsSyntaxImpl(filePath, repoPath);
  }

  return {
    applyPatch,
    createCommit,
    revertLastCommit,
    getCurrentBranch,
    createBranch,
    resetWorkingTree,
    checkoutFile,
    checkJsSyntax,
  };
}
