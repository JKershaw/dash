import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import simpleGit from 'simple-git';

import type { GitOperations, SyntaxCheckResult } from '../../types/deps.js';
import { checkJsSyntax as checkJsSyntaxImpl } from '../syntaxCheck.js';

export function createGitOperations(): GitOperations {
  function gitFor(repoPath: string) {
    return simpleGit(repoPath, { timeout: { block: 30_000 } });
  }

  async function applyPatch(
    diffString: string,
    repoPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const tmpFile = path.join(tmpdir(), `dash-build-patch-${Date.now()}-${randomUUID()}.diff`);
    const git = gitFor(repoPath);
    try {
      fs.writeFileSync(tmpFile, diffString, 'utf-8');

      // Dry-run check first
      try {
        await git.applyPatch(tmpFile, ['--whitespace=fix', '--check']);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Patch check failed: ${message}` };
      }

      // Apply for real
      await git.applyPatch(tmpFile, ['--whitespace=fix']);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Failed to apply patch: ${message}` };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
    }
  }

  async function createCommit(
    message: string,
    repoPath: string,
  ): Promise<{ oid: string; url: string } | void> {
    const git = gitFor(repoPath);
    const prefix = '[dash-build] ';
    const fullSubject = `${prefix}${message}`;
    let finalMessage = fullSubject;

    if (fullSubject.length > 72) {
      const truncated = fullSubject.slice(0, 69) + '...';
      finalMessage = `${truncated}\n\n${message}`;
    }

    try {
      await git.add('-A');
      await git.commit(finalMessage, { '--no-gpg-sign': null });
      const headSha = (await git.revparse(['HEAD'])).trim();
      return { oid: headSha, url: '' };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create commit: ${errorMessage}`);
    }
  }

  async function revertLastCommit(repoPath: string): Promise<void> {
    const git = gitFor(repoPath);
    try {
      const lastMessage = (await git.raw(['log', '-1', '--format=%s'])).trim();
      if (!lastMessage.startsWith('[dash-build]')) {
        throw new Error(
          `Last commit is not a dash-build commit. Message: "${lastMessage}"`,
        );
      }
      await git.reset(['--hard', 'HEAD~1']);
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
      return await gitFor(repoPath).revparse(['--abbrev-ref', 'HEAD']);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to get current branch: ${errorMessage}`);
    }
  }

  async function createBranch(name: string, repoPath: string): Promise<void> {
    try {
      await gitFor(repoPath).checkoutLocalBranch(name);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create branch "${name}": ${errorMessage}`);
    }
  }

  async function resetWorkingTree(repoPath: string): Promise<void> {
    const git = gitFor(repoPath);
    try {
      await git.checkout(['.']);
      // Also remove untracked files that may have been created by the diff
      await git.clean(['f', 'd']);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to reset working tree: ${errorMessage}`);
    }
  }

  async function checkoutFile(filePath: string, repoPath: string): Promise<void> {
    try {
      await gitFor(repoPath).checkout(['--', filePath]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to checkout file "${filePath}": ${errorMessage}`);
    }
  }

  async function checkJsSyntax(filePath: string, repoPath: string): Promise<SyntaxCheckResult> {
    return checkJsSyntaxImpl(filePath, repoPath);
  }

  async function addWorktree(taskId: string, repoPath: string): Promise<string> {
    const worktreePath = path.join(tmpdir(), `dash-worktree-${taskId}`);
    const branchName = `dash-wt-${taskId}`;
    try {
      await gitFor(repoPath).raw(['worktree', 'add', worktreePath, '-b', branchName]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create worktree: ${errorMessage}`);
    }
    // Symlink node_modules from the original repo so tests can resolve npm packages.
    // Worktrees only contain tracked files; node_modules is gitignored.
    const srcModules = path.join(repoPath, 'node_modules');
    const dstModules = path.join(worktreePath, 'node_modules');
    if (fs.existsSync(srcModules) && !fs.existsSync(dstModules)) {
      try {
        fs.symlinkSync(srcModules, dstModules);
      } catch { /* best-effort — tests will still fail but with a clear error */ }
    }
    return worktreePath;
  }

  async function removeWorktree(worktreePath: string, repoPath: string, opts?: { keepBranch?: boolean }): Promise<void> {
    const git = gitFor(repoPath);
    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
    } catch {
      // Worktree may already be deleted from disk — clean up manually
      try { fs.rmSync(worktreePath, { recursive: true, force: true }); } catch { /* noop */ }
      try { await git.raw(['worktree', 'prune']); } catch { /* noop */ }
    }
    if (!opts?.keepBranch) {
      // Clean up the branch ref (best-effort, may already be deleted or merged)
      const branchName = 'dash-wt-' + path.basename(worktreePath).replace('dash-worktree-', '');
      try { await git.deleteLocalBranch(branchName, true); } catch { /* noop */ }
    }
  }

  async function mergeWorktreeBranch(
    branchName: string,
    repoPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const git = gitFor(repoPath);
    const mergeMessage = `[dash-build] Merge ${branchName}`;

    async function doMerge(): Promise<{ success: boolean; error?: string }> {
      await git.merge([branchName, '-m', mergeMessage]);
      // Branch cleanup is handled by removeWorktree() — attempting deletion here
      // always fails with "cannot delete branch used by worktree" noise.
      return { success: true };
    }

    try {
      return await doMerge();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // Untracked files (e.g. __pycache__) block the merge.
      // Remove only the specific conflicting files and retry once.
      if (message.includes('would be overwritten')) {
        const resolvedRepo = path.resolve(repoPath);
        const files = message
          .split('\n')
          .filter(l => l.startsWith('\t'))
          .map(l => l.trim())
          .filter(Boolean);
        for (const f of files) {
          const resolved = path.resolve(repoPath, f);
          if (!resolved.startsWith(resolvedRepo + path.sep)) continue;
          try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* noop */ }
        }
        try {
          return await doMerge();
        } catch (retryErr: unknown) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          try { await git.merge(['--abort']); } catch { /* noop */ }
          return { success: false, error: `Merge conflict: ${retryMsg}. Branch '${branchName}' preserved for manual resolution.` };
        }
      }

      // Abort the failed merge to leave a clean state
      try { await git.merge(['--abort']); } catch { /* noop */ }
      return { success: false, error: `Merge conflict: ${message}. Branch '${branchName}' preserved for manual resolution.` };
    }
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
    addWorktree,
    removeWorktree,
    mergeWorktreeBranch,
  };
}
