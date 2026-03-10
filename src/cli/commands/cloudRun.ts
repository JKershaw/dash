import { v4 as uuidv4 } from 'uuid';
import type { TransportClient, ToolRequest, ToolResponse } from '../../types/protocol.js';
import { PROTOCOL_VERSION } from '../../types/protocol.js';
import type { ToolSet, GitOperations, TestRunner, SseEmitter } from '../../types/deps.js';
import type { TaskEvent } from '../../types/events.js';
import { createLocalExecutor } from '../../infrastructure/tools/localExecutor.js';

export interface BaseCloudRunConfig {
  client: TransportClient;
  tools: ToolSet;
  git: GitOperations;
  testRunner: TestRunner;
  repoPath: string;
  testCommand: string;
  taskDescription: string;
  model: string;
  queryMode?: boolean;
  generateTests?: boolean;
  protectTestFiles?: boolean;
  maxCorrectionIterations?: number;
  /** The original repo path when worktree isolation is active (repoPath is the worktree). */
  originalRepoPath?: string;
  /** Pre-generated task ID so the server uses the same ID as the worktree name. */
  taskId?: string;
  /** Optional emitter to receive phase events in real-time (e.g. CLI display). */
  emitter?: SseEmitter;
  /** Optional custom executor override. When provided, replaces the default createLocalExecutor. */
  executor?: (request: ToolRequest) => Promise<ToolResponse>;
}

export interface CloudRunResult {
  status: 'complete' | 'failed';
  taskId?: string;
  correctionCount?: number;
  failureSummary?: string;
  lastDiff?: string;
  answer?: string;
  totalTokens?: number;
  totalCost?: number;
  callCount?: number;
}

export async function startCloudRun<T extends BaseCloudRunConfig>(config: T): Promise<CloudRunResult> {
  const executor = config.executor ?? createLocalExecutor(config.tools, config.git, config.testRunner);
  config.client.onToolRequest(executor);

  let capturedTaskId: string | undefined;
  let capturedExtras: Partial<CloudRunResult> = {};
  let resolveStatus: (status: 'complete' | 'failed') => void;
  const statusPromise = new Promise<'complete' | 'failed'>((resolve) => {
    resolveStatus = resolve;
  });

  config.client.onMessage((msg) => {
    if (msg.kind === 'phase_event' && config.emitter) {
      config.emitter.emit(msg.message.taskId, msg.message as unknown as TaskEvent);
    }

    if (msg.kind === 'task_status') {
      capturedTaskId = msg.message.taskId;
      const { status } = msg.message;
      if (status === 'complete' || status === 'failed') {
        // Extract enriched fields from the terminal status message.
        const m = msg.message;
        if (m.correctionCount !== undefined) capturedExtras.correctionCount = m.correctionCount;
        if (m.failureSummary) capturedExtras.failureSummary = m.failureSummary;
        if (m.lastDiff) capturedExtras.lastDiff = m.lastDiff;
        if (m.answer) capturedExtras.answer = m.answer;
        if (m.cost) {
          capturedExtras.totalTokens = m.cost.totalTokens;
          capturedExtras.totalCost = m.cost.totalCost;
          capturedExtras.callCount = m.cost.callCount;
        }
        resolveStatus(status as 'complete' | 'failed');
      }
    }
  });

  // Build payload from config, excluding non-payload fields.
  // Extra fields from extended configs (e.g. keepGeneratedTests) pass through automatically.
  const { client: _, tools: _t, git: _g, testRunner: _r, emitter: _e, executor: _x, taskId, ...payloadFields } = config;

  config.client.send({
    kind: 'task_command',
    message: {
      id: uuidv4(),
      version: PROTOCOL_VERSION,
      type: 'create',
      payload: {
        id: taskId,
        ...payloadFields,
      },
    },
  });

  const status = await statusPromise;
  config.client.close();

  return { status, taskId: capturedTaskId, ...capturedExtras };
}
