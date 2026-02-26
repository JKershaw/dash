/**
 * Cloud run E2E test with mock WebSocket server.
 *
 * Simulates the full pipeline: CLI connects, sends task_command,
 * server sends tool_requests (readFile, listDir), CLI executes locally
 * and returns tool_responses, server sends phase_events and task_status.
 *
 * Zero LLM tokens — the "server" is a mock WebSocket.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createTransportClient } from '../src/infrastructure/transport/wsClient.js';
import { startCloudRun } from '../src/cli/commands/cloudRun.js';
import { createReadFileTool, createReadFileRawTool } from '../src/infrastructure/tools/readFile.js';
import { createWriteFileTool } from '../src/infrastructure/tools/writeFile.js';
import { createListDirTool } from '../src/infrastructure/tools/listDir.js';
import { createSearchTool } from '../src/infrastructure/tools/search.js';
import { createGitOperations } from '../src/infrastructure/git/index.js';
import { createTestRunner } from '../src/infrastructure/testRunner/runTests.js';
import type { ProtocolMessage, ToolResponse } from '../src/types/protocol.js';
import type { TaskEvent } from '../src/types/events.js';

describe('cloudRun with mock server', () => {
  let wss: WebSocketServer;
  let port: number;
  let repoDir: string;

  beforeEach(() => {
    // Create a temp git repo with a test file
    repoDir = mkdtempSync(join(tmpdir(), 'dash-test-'));
    writeFileSync(join(repoDir, 'add.js'), 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');
    execSync('git init && git add -A && git commit -m "init"', { cwd: repoDir, stdio: 'ignore' });

    // Start mock WS server on a random port
    wss = new WebSocketServer({ port: 0 });
    const addr = wss.address();
    port = typeof addr === 'object' ? addr.port : 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it('full pipeline: connect → task_command → tool_request/response → phase_event → task_status', async () => {
    const receivedMessages: ProtocolMessage[] = [];
    const toolResponseResults: unknown[] = [];

    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString()) as ProtocolMessage;
        receivedMessages.push(msg);

        if (msg.kind === 'task_command' && msg.message.type === 'create') {
          // Simulate server: send a readFile tool_request
          ws.send(JSON.stringify({
            kind: 'tool_request',
            message: {
              id: 'req-1',
              version: '1.0',
              type: 'readFile',
              params: { path: 'add.js' },
            },
          }));
        }

        if (msg.kind === 'tool_response') {
          const resp = msg.message as ToolResponse;
          toolResponseResults.push(resp.result);

          if (resp.id === 'req-1') {
            // Send a listDir request next
            ws.send(JSON.stringify({
              kind: 'tool_request',
              message: {
                id: 'req-2',
                version: '1.0',
                type: 'listDir',
                params: { path: '.' },
              },
            }));
          } else if (resp.id === 'req-2') {
            // Send a phase event, then complete
            ws.send(JSON.stringify({
              kind: 'phase_event',
              message: {
                id: 'evt-1',
                version: '1.0',
                taskId: 'task-123',
                timestamp: new Date().toISOString(),
                type: 'phase_completed',
                payload: { phase: 'research' },
              },
            }));

            ws.send(JSON.stringify({
              kind: 'task_status',
              message: {
                version: '1.0',
                taskId: 'task-123',
                status: 'complete',
                currentPhase: 'complete',
                progress: { completedPhases: ['research'], totalPhases: 1 },
                updatedAt: new Date().toISOString(),
              },
            }));
          }
        }
      });
    });

    // Create tools pointing at the temp repo
    const tools = {
      readFile: createReadFileTool(repoDir, 200),
      readFileRaw: createReadFileRawTool(repoDir),
      writeFile: createWriteFileTool(repoDir),
      listDir: createListDirTool(repoDir, 200),
      search: createSearchTool(repoDir, 30),
      askSubagent: async () => { throw new Error('not in cloud mode'); },
    };
    const git = createGitOperations();
    const testRunner = createTestRunner({ maxTimeoutMs: 30000 });

    // Track emitted events
    const emittedEvents: TaskEvent[] = [];
    const emitter = {
      emit(_taskId: string, event: TaskEvent) {
        emittedEvents.push(event);
      },
    };

    // Connect and run
    const client = createTransportClient();
    await client.connect(`ws://localhost:${port}`);

    const result = await startCloudRun({
      client,
      tools,
      git,
      testRunner,
      repoPath: repoDir,
      testCommand: 'echo ok',
      taskDescription: 'test task',
      model: 'test-model',
      queryMode: true,
      emitter,
    });

    // Verify result
    assert.equal(result.status, 'complete');
    assert.equal(result.taskId, 'task-123');

    // Verify task_command was sent
    const taskCmd = receivedMessages.find(m => m.kind === 'task_command');
    assert.ok(taskCmd, 'should have sent a task_command');
    assert.equal(taskCmd!.message.type, 'create');
    assert.equal((taskCmd!.message.payload as any).taskDescription, 'test task');

    // Verify tool responses were received
    assert.equal(toolResponseResults.length, 2, 'should have received 2 tool responses');

    // readFile response should contain the file content
    const readResult = toolResponseResults[0] as string;
    assert.ok(readResult.includes('function add'), 'readFile should return file content');

    // listDir response should contain add.js
    const listResult = toolResponseResults[1] as string;
    assert.ok(listResult.includes('add.js'), 'listDir should include add.js');

    // Verify phase events were emitted
    assert.equal(emittedEvents.length, 1);
  });

  it('handles missing file gracefully (returns error string, not exception)', async () => {
    const toolResponses: ToolResponse[] = [];

    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ProtocolMessage;

        if (msg.kind === 'task_command') {
          // Request a file that doesn't exist
          ws.send(JSON.stringify({
            kind: 'tool_request',
            message: {
              id: 'req-bad',
              version: '1.0',
              type: 'readFile',
              params: { path: 'nonexistent.js' },
            },
          }));
        }

        if (msg.kind === 'tool_response') {
          toolResponses.push(msg.message as ToolResponse);

          ws.send(JSON.stringify({
            kind: 'task_status',
            message: {
              version: '1.0',
              taskId: 'task-456',
              status: 'complete',
              currentPhase: 'complete',
              progress: { completedPhases: ['research'], totalPhases: 1 },
              updatedAt: new Date().toISOString(),
            },
          }));
        }
      });
    });

    const tools = {
      readFile: createReadFileTool(repoDir, 200),
      readFileRaw: createReadFileRawTool(repoDir),
      writeFile: createWriteFileTool(repoDir),
      listDir: createListDirTool(repoDir, 200),
      search: createSearchTool(repoDir, 30),
      askSubagent: async () => { throw new Error('not in cloud mode'); },
    };

    const client = createTransportClient();
    await client.connect(`ws://localhost:${port}`);

    const result = await startCloudRun({
      client,
      tools,
      git: createGitOperations(),
      testRunner: createTestRunner({ maxTimeoutMs: 30000 }),
      repoPath: repoDir,
      testCommand: '',
      taskDescription: 'test',
      model: 'test-model',
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.taskId, 'task-456');

    // readFile returns error strings (not exceptions) so the LLM can see them
    assert.equal(toolResponses.length, 1);
    assert.ok(!toolResponses[0].error, 'should not have protocol-level error');
    assert.ok(
      (toolResponses[0].result as string).includes('Error reading file'),
      'result should contain error message string',
    );
  });
});
