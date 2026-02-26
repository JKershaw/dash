/**
 * Live smoke test against a real Dash Build server.
 *
 * Creates a tiny repo with one file, runs a --query task,
 * and verifies the full round-trip works.
 *
 * Cost: ~$0.001 (one research phase with a trivial question).
 *
 * Requires: DASH_CLOUD_URL or defaults to https://dash.jkershaw.com
 * Run manually: npx tsx --test test/live.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
import type { TaskEvent } from '../src/types/events.js';

const CLOUD_URL = process.env.DASH_CLOUD_URL || 'wss://dash.jkershaw.com';

/**
 * Request an anonymous session token from the server.
 */
async function getAnonymousToken(serverUrl: string): Promise<string | undefined> {
  const httpBase = serverUrl.replace(/^ws(s?):\/\//, 'http$1://');
  try {
    const res = await fetch(`${httpBase}/api/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { sessionId?: string };
    return data.sessionId;
  } catch {
    return undefined;
  }
}

describe('live smoke test', { timeout: 120_000 }, () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'dash-live-'));
    writeFileSync(join(repoDir, 'add.js'), 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');
    execSync('git init && git add -A && git commit -m "init"', { cwd: repoDir, stdio: 'ignore' });
  });

  it('query mode: "What does add.js do?" completes successfully', async () => {
    const token = await getAnonymousToken(CLOUD_URL);

    const client = createTransportClient(token ? { token } : undefined);
    await client.connect(CLOUD_URL);

    const events: TaskEvent[] = [];
    const emitter = {
      emit(_taskId: string, event: TaskEvent) {
        events.push(event);
      },
    };

    const result = await startCloudRun({
      client,
      tools: {
        readFile: createReadFileTool(repoDir, 200),
        readFileRaw: createReadFileRawTool(repoDir),
        writeFile: createWriteFileTool(repoDir),
        listDir: createListDirTool(repoDir, 200),
        search: createSearchTool(repoDir, 30),
        askSubagent: async () => { throw new Error('not in cloud mode'); },
      },
      git: createGitOperations(),
      testRunner: createTestRunner({ maxTimeoutMs: 30000 }),
      repoPath: repoDir,
      testCommand: 'echo ok',
      taskDescription: 'What does add.js do? Answer in one sentence.',
      model: 'google/gemini-2.0-flash-001',
      queryMode: true,
      emitter,
    });

    assert.equal(result.status, 'complete', `Expected complete but got ${result.status}. Events: ${events.map(e => e.type).join(', ')}`);
    assert.ok(result.taskId, 'Should have a task ID');
    assert.ok(events.length > 0, 'Should have received at least one phase event');
  });
});
