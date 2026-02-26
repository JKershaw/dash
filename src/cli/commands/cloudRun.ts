import { v4 as uuidv4 } from 'uuid';
import type { TransportClient } from '../../types/protocol.js';
import { PROTOCOL_VERSION } from '../../types/protocol.js';
import type { ToolSet, GitOperations, TestRunner, SseEmitter } from '../../types/deps.js';
import type { TaskEvent } from '../../types/events.js';
import { createLocalExecutor } from '../../infrastructure/tools/localExecutor.js';

export interface CloudRunConfig {
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
  skipDecompose?: boolean;
  maxCorrectionIterations?: number;
  /** Optional emitter to receive phase events in real-time (e.g. CLI display). */
  emitter?: SseEmitter;
}

export interface CloudRunResult {
  status: 'complete' | 'failed';
  taskId?: string;
}

export async function startCloudRun(config: CloudRunConfig): Promise<CloudRunResult> {
  const executor = createLocalExecutor(config.tools, config.git, config.testRunner);
  config.client.onToolRequest(executor);

  let capturedTaskId: string | undefined;
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
        resolveStatus(status as 'complete' | 'failed');
      }
    }
  });

  config.client.send({
    kind: 'task_command',
    message: {
      id: uuidv4(),
      version: PROTOCOL_VERSION,
      type: 'create',
      payload: {
        repoPath: config.repoPath,
        testCommand: config.testCommand,
        taskDescription: config.taskDescription,
        model: config.model,
        queryMode: config.queryMode,
        generateTests: config.generateTests,
        protectTestFiles: config.protectTestFiles,
        skipDecompose: config.skipDecompose,
        maxCorrectionIterations: config.maxCorrectionIterations,
      },
    },
  });

  const status = await statusPromise;
  config.client.close();

  return { status, taskId: capturedTaskId };
}
