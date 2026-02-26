import type { Task, SectionName, Section, Phase, TaskStatus } from './task.js';
import type { TaskEvent, EventType } from './events.js';
import type { Snapshot } from './snapshots.js';
import type { LlmMessage, LlmResponse, ToolDefinition } from './llm.js';
import type { TestResult } from './testing.js';
import type { ModelPricing } from '../domain/cost/calculateCost.js';
import type { RepoScan } from './bootstrap.js';
import type { Account } from './account.js';
import type { Session } from '../infrastructure/auth/sessionStore.js';
import type { UsageEntry } from '../domain/cost/usageTracking.js';

export interface PricingClient {
  getModelPricing(modelId: string): Promise<ModelPricing | null>;
}

export interface TaskStore {
  create(task: Task): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  findAll(filter?: { accountId?: string }): Promise<Task[]>;
  update(id: string, partial: Partial<Task>): Promise<Task>;
  delete(id: string): Promise<void>;
}

export interface EventStore {
  append(event: TaskEvent): Promise<TaskEvent>;
  findByTask(taskId: string, options?: { limit?: number; before?: string; type?: EventType }): Promise<TaskEvent[]>;
  findSince(taskId: string, timestamp: string): Promise<TaskEvent[]>;
}

export interface SnapshotStore {
  create(snapshot: Snapshot): Promise<Snapshot>;
  findByTask(taskId: string): Promise<Snapshot[]>;
  findById(id: string): Promise<Snapshot | null>;
}

export interface AccountStore {
  create(account: Account): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  findByAuthLink(provider: string, providerId: string): Promise<Account | null>;
  update(id: string, partial: Partial<Account>): Promise<Account>;
}

export interface PersistentSessionStore {
  create(session: Session): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findAll(): Promise<Session[]>;
  delete(id: string): Promise<boolean>;
  deleteByAccountId(accountId: string): Promise<number>;
}

export interface UsageStore {
  record(entry: UsageEntry): Promise<void>;
  getForPeriod(accountId: string, since: string): Promise<UsageEntry[]>;
}

export interface StorageAdapter {
  tasks: TaskStore;
  events: EventStore;
  snapshots: SnapshotStore;
  accounts?: AccountStore;
  sessions?: PersistentSessionStore;
  usage?: UsageStore;
}

export interface LlmClient {
  call(messages: LlmMessage[], model: string, tools?: ToolDefinition[]): Promise<LlmResponse>;
  fetchAvailableModels?(): Promise<string[]>;
}

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
}

export interface TestRunner {
  run(testCommand: string, repoPath: string, timeoutMs?: number): Promise<TestResult>;
}

export interface SseEmitter {
  emit(taskId: string, event: TaskEvent): void;
}

export interface AgentDeps {
  llm: LlmClient;
  tools: ToolSet;
  storage: StorageAdapter;
  events: SseEmitter;
  git: GitOperations;
  testRunner: TestRunner;
  pricing?: PricingClient;
  /** Skip local filesystem validation of repoPath (used in cloud/remote mode where the repo lives on the CLI machine, not the server). */
  skipRepoValidation?: boolean;
  /** Scan a repo and return structured data about its contents. In cloud mode this is
   *  routed through the tool bridge so the CLI runs scanRepo locally; in local mode
   *  the field is absent and agentLoop falls back to calling scanRepo() directly. */
  scanRepo?: (repoPath: string) => Promise<RepoScan>;
}
