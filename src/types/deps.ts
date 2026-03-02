import type { Task, SectionName, Section, Phase, TaskStatus } from './task.js';
import type { TaskEvent, EventType } from './events.js';
import type { LlmMessage, LlmResponse, ToolDefinition } from './llm.js';
import type { TestResult } from './testing.js';
import type { RepoScan } from './bootstrap.js';

export interface ToolSet {
  readFile(path: string, startLine?: number, endLine?: number): Promise<string>;
  readFileRaw(path: string): Promise<string>;
  writeFile(path: string, content: string, opts?: { overwrite?: boolean }): Promise<{ written: boolean }>;
  listDir(path: string): Promise<string>;
  search(pattern: string, path?: string): Promise<string>;
  askSubagent(question: string, context?: string): Promise<string>;
}

export interface SyntaxCheckResult {
  valid: boolean;
  file: string;
  error?: string;
}

export interface GitOperations {
  applyPatch(diffString: string, repoPath: string): Promise<{ success: boolean; error?: string }>;
  createCommit(message: string, repoPath: string): Promise<void>;
  revertLastCommit(repoPath: string): Promise<void>;
  getCurrentBranch(repoPath: string): Promise<string>;
  createBranch(name: string, repoPath: string): Promise<void>;
  resetWorkingTree(repoPath: string): Promise<void>;
  checkoutFile(filePath: string, repoPath: string): Promise<void>;
  checkJsSyntax(filePath: string, repoPath: string): Promise<SyntaxCheckResult>;
  /** Create a git worktree for task isolation. Returns the worktree path. */
  addWorktree(taskId: string, repoPath: string): Promise<string>;
  /** Remove a worktree and clean up its branch. */
  removeWorktree(worktreePath: string, repoPath: string, opts?: { keepBranch?: boolean }): Promise<void>;
  /** Merge a worktree branch back into the current branch. */
  mergeWorktreeBranch(branchName: string, repoPath: string): Promise<{ success: boolean; error?: string }>;
}

export interface TestRunner {
  run(testCommand: string, repoPath: string, timeoutMs?: number): Promise<TestResult>;
}

export interface SseEmitter {
  emit(taskId: string, event: TaskEvent): void;
}
