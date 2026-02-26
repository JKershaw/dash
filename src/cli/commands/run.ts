/**
 * Run command - runs a full agent loop from the CLI
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { AgentDeps, StorageAdapter } from '../../types/deps.js';
import type { Config } from '../../config.js';
import type { SubtaskProgress } from '../../runner/runFullTask.js';
import { bold, dim, cyan, yellow, boldGreen, boldRed, ANSI } from '../colors.js';
import { log, logError, printComplete, waitForEnter } from '../display.js';
import { createCliEmitter } from '../cliEmitter.js';
import { getStoredCredentials, saveCredentials } from './login.js';

/**
 * Resolves a session token for transport auth.
 * 1. Checks stored credentials for the server URL.
 * 2. If none, requests an anonymous session from the server.
 * 3. Stores the new credentials for reuse.
 * Returns undefined if token resolution fails (backward compat — connect without auth).
 */
async function resolveTransportToken(serverUrl: string): Promise<string | undefined> {
  // Normalize URL for comparison (strip trailing slash)
  const normalizedUrl = serverUrl.replace(/\/$/, '');
  // For WS URLs, derive the HTTP base URL for the auth request
  const httpBase = normalizedUrl.replace(/^ws(s?):\/\//, 'http$1://');

  // Check stored credentials
  const creds = getStoredCredentials();
  if (creds && creds.serverUrl.replace(/\/$/, '') === normalizedUrl) {
    return creds.sessionId;
  }

  // Request anonymous session
  try {
    const res = await fetch(`${httpBase}/api/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const data = await res.json() as { sessionId?: string };
    if (data.sessionId) {
      saveCredentials({
        sessionId: data.sessionId,
        serverUrl: normalizedUrl,
        savedAt: new Date().toISOString(),
      });
      return data.sessionId;
    }
  } catch {
    // Server doesn't support anonymous auth or is unreachable — proceed without token
  }
  return undefined;
}

/**
 * Probes whether a Dash Build web server is already running on the given port.
 * Makes a GET to /api/tasks with a 1-second timeout.
 * Returns the WebSocket URL (ws://localhost:<port>) on success, or null.
 */
export async function detectLocalServer(port: number): Promise<string | null> {
  try {
    const response = await fetch(`http://localhost:${port}/api/tasks`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      return `ws://localhost:${port}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Walks up the directory tree from startDir looking for a .git directory.
 * Returns the directory containing .git, or null if not found.
 */
export function findRepoRoot(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(resolve(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function commandRun(flags: Record<string, string>, positionalTask?: string): Promise<void> {
  const taskDescription = flags['task'] || positionalTask;
  const modelOverride = flags['model'];
  const autoApprove = flags['auto-approve'] === 'true' || flags['y'] === 'true';
  const verbose = flags['verbose'] === 'true' || flags['v'] === 'true';
  const explicitQuiet = flags['quiet'] === 'true' || flags['q'] === 'true';
  const continueMode = flags['continue'] === 'true' || flags['c'] === 'true';
  const generateTests = flags['no-generate-tests'] !== 'true';
  // protectTestFiles is independent of generateTests. --no-generate-tests skips test
  // generation but does NOT automatically protect test files from modification — tasks
  // that explicitly require updating existing test files need this to be false (exp-004).
  const protectTestFiles = flags['protect-test-files'] === 'true';
  const queryMode = flags['query'] === 'true';
  const skipDecompose = flags['skip-decompose'] === 'true';

  // Validate task description (the only truly required input)
  if (!taskDescription) {
    logError('Missing task description');
    console.log(`\n  Usage: dash-build "Add retry logic to the API client"`);
    console.log(`         dash-build run --task "Add retry logic" [--repo <path>] [--test <cmd>]\n`);
    process.exit(1);
  }

  // Auto-detect repo path from cwd if --repo not provided
  const resolvedRepo = flags['repo']
    ? resolve(flags['repo'])
    : (() => {
        const detected = findRepoRoot(process.cwd());
        if (!detected) {
          logError('Could not find a git repository. Run from inside a repo or use --repo <path>.');
          process.exit(1);
        }
        return detected;
      })();

  // Auto-detect test command if --test not provided
  let testCommand = flags['test'] || '';
  if (!testCommand) {
    const { scanRepo } = await import('../../infrastructure/bootstrap/scanRepo.js');
    const { detectProjectSummary } = await import('../../domain/bootstrap/detectProjectSummary.js');
    const scan = scanRepo(resolvedRepo);
    const summary = detectProjectSummary(scan);
    if (summary.testCommand) {
      testCommand = summary.testCommand;
      const confidenceLabel = summary.testCommandConfidence === 'high' ? '' : ` (${yellow('confidence: ' + summary.testCommandConfidence)})`;
      log(`Auto-detected test command: ${cyan(testCommand)}${confidenceLabel}`);
    }
  }

  // 1. Load config
  const { loadConfig } = await import('../../config.js');
  const config: Config = loadConfig();

  // 2. Determine model
  const defaultModel = modelOverride || config.model;

  // Print header
  console.log('');
  log(`Starting task: ${bold(taskDescription)}`);
  log(`Repository: ${cyan(resolvedRepo)}${flags['repo'] ? '' : dim(' (auto-detected)')}`);
  log(`Test command: ${testCommand ? cyan(testCommand) : dim('(none detected)')}`);
  log(`Model: ${cyan(defaultModel)}`);
  if (continueMode) {
    log(`Mode: ${yellow('continue')} ${dim('(preserving working tree state)')}`);
  }
  if (!generateTests) {
    log(`Mode: ${yellow('no-generate-tests')} ${dim('(test generation skipped)')}`);
  }
  if (queryMode) {
    log(`Mode: ${yellow('query')} ${dim('(research only, no code changes)')}`);
  }
  // Cloud mode: connect to remote orchestrator instead of running locally.
  // Explicit --cloud flag takes priority; otherwise auto-detect a running local server.
  const explicitCloudUrl = flags['cloud'];
  const effectiveCloudUrl = explicitCloudUrl || await detectLocalServer(config.port);

  // Create the CLI emitter. Cloud mode defaults to quiet (results only);
  // --quiet/-q enables it for local mode too. --verbose overrides quiet.
  const quiet = (explicitQuiet || !!effectiveCloudUrl) && !verbose;
  const cliEmitter = createCliEmitter({ verbose, quiet });
  if (effectiveCloudUrl) {
    if (explicitCloudUrl) {
      log(`Mode: ${yellow('cloud')} ${dim(`(${effectiveCloudUrl})`)}`);
    } else {
      log(`Auto-routing through local server at ${cyan(effectiveCloudUrl)} ${dim('(browser will show live progress)')}`);
    }
    console.log('');

    // Validate repo path on the CLI machine before connecting to the server.
    // (The server can't do this — the repo lives here, not there.)
    const { validateRepoPath } = await import('../../runner/agentLoopHelpers.js');
    const repoCheck = validateRepoPath(resolvedRepo);
    if (!repoCheck.valid) {
      logError(repoCheck.error!);
      process.exit(1);
    }

    const isHttpTransport = effectiveCloudUrl.startsWith('http://') || effectiveCloudUrl.startsWith('https://');
    const { createTransportClient } = isHttpTransport
      ? await import('../../infrastructure/transport/httpTransportClient.js')
      : await import('../../infrastructure/transport/wsClient.js');
    const { createReadFileTool, createReadFileRawTool } = await import('../../infrastructure/tools/readFile.js');
    const { createWriteFileTool } = await import('../../infrastructure/tools/writeFile.js');
    const { createListDirTool } = await import('../../infrastructure/tools/listDir.js');
    const { createSearchTool } = await import('../../infrastructure/tools/search.js');
    const { createGitOperations } = await import('../../infrastructure/git/index.js');
    const { createTestRunner } = await import('../../infrastructure/testRunner/runTests.js');
    const { startCloudRun } = await import('./cloudRun.js');

    // Resolve session token for transport auth.
    // Use stored credentials if available; otherwise request an anonymous session.
    const token = await resolveTransportToken(effectiveCloudUrl);

    const gitOps = createGitOperations();
    const testRunnerInst = createTestRunner({ maxTimeoutMs: config.testMaxTimeoutMs });
    const tools = {
      readFile: createReadFileTool(resolvedRepo, config.maxFileReadLines),
      readFileRaw: createReadFileRawTool(resolvedRepo),
      writeFile: createWriteFileTool(resolvedRepo),
      listDir: createListDirTool(resolvedRepo, config.maxListDirEntries),
      search: createSearchTool(resolvedRepo, config.maxSearchResults),
      // askSubagent is handled server-side in cloud mode — the server uses its
      // own LLM client so no local API key is needed
      askSubagent: async () => { throw new Error('askSubagent should not be called on CLI in cloud mode'); },
    };

    const client = createTransportClient(token ? { token } : undefined);
    await client.connect(effectiveCloudUrl);

    const result = await startCloudRun({
      client,
      tools,
      git: gitOps,
      testRunner: testRunnerInst,
      repoPath: resolvedRepo,
      testCommand,
      taskDescription,
      model: defaultModel,
      queryMode: queryMode || undefined,
      generateTests: generateTests || undefined,
      protectTestFiles: protectTestFiles || undefined,
      skipDecompose: skipDecompose || undefined,
      emitter: cliEmitter,
    });

    if (result.status === 'complete') {
      printComplete();
      console.log(boldGreen('Task completed successfully.'));
    } else {
      console.log(`\n${ANSI.boldRed}\u2501\u2501\u2501 Failed \u2501\u2501\u2501${ANSI.reset}`);
      console.log(boldRed('Task failed.'));
    }

    if (result.taskId) {
      log(`Task ID: ${dim(result.taskId)}`);
      log(`Run ${cyan('dash-build status --task-id ' + result.taskId)} for full details`);
    }
    return;
  }
  console.log('');

  // 3. Create infrastructure
  const { createStorage } = await import('../../infrastructure/storage/mangodb.js');
  const { createLlmClient } = await import('../../infrastructure/llm/openRouterClient.js');
  const { createReadFileTool, createReadFileRawTool } = await import('../../infrastructure/tools/readFile.js');
  const { createWriteFileTool } = await import('../../infrastructure/tools/writeFile.js');
  const { createListDirTool } = await import('../../infrastructure/tools/listDir.js');
  const { createSearchTool } = await import('../../infrastructure/tools/search.js');
  const { createAskSubagentTool } = await import('../../infrastructure/tools/askSubagent.js');
  const { createGitOperations } = await import('../../infrastructure/git/index.js');
  const { createTestRunner } = await import('../../infrastructure/testRunner/runTests.js');

  const { createPricingClient } = await import('../../infrastructure/llm/pricingClient.js');

  const storage = await createStorage(config.dataDir);
  const llmClient = createLlmClient(config);
  const pricingClient = createPricingClient(config.openRouterBaseUrl);
  const gitOps = createGitOperations();
  const testRunner = createTestRunner({ maxTimeoutMs: config.testMaxTimeoutMs });

  const tools = {
    readFile: createReadFileTool(resolvedRepo, config.maxFileReadLines),
    readFileRaw: createReadFileRawTool(resolvedRepo),
    writeFile: createWriteFileTool(resolvedRepo),
    listDir: createListDirTool(resolvedRepo, config.maxListDirEntries),
    search: createSearchTool(resolvedRepo, config.maxSearchResults),
    askSubagent: createAskSubagentTool(llmClient, defaultModel),
  };

  const agentDeps: AgentDeps = {
    llm: llmClient,
    tools,
    storage,
    events: cliEmitter,
    git: gitOps,
    testRunner,
    pricing: pricingClient,
  };

  const commandDeps = { storage, events: cliEmitter };

  // 4. Create task
  const { createTask } = await import('../../commands/createTask.js');
  const { startTask } = await import('../../commands/startTask.js');
  const { runAgentLoop } = await import('../../runner/agentLoop.js');
  const { runFullTask, continueAfterApproval } = await import('../../runner/runFullTask.js');
  const { getTask } = await import('../../queries/getTask.js');

  const task = await createTask(
    {
      repoPath: resolvedRepo,
      testCommand,
      taskDescription,
      model: defaultModel,
      continueFromCurrentState: continueMode || undefined,
      generateTests: generateTests || undefined,
      protectTestFiles: protectTestFiles || undefined,
      queryMode: queryMode || undefined,
      skipDecompose: skipDecompose || undefined,
    },
    commandDeps,
  );

  log(`Created task: ${dim(task.id)}`);

  // 5. Start the task (set status to running)
  await startTask(task.id, commandDeps);

  const onSubtaskProgress = (p: SubtaskProgress) => {
    if (p.status === 'starting') {
      console.log('');
      log(`Running subtask ${bold(`${p.index + 1}/${p.total}`)}: ${p.description}`);
    } else if (p.status === 'complete') {
      log(`Subtask ${p.index + 1} ${boldGreen('completed')}`);
    } else {
      log(`Subtask ${p.index + 1} ${boldRed('failed')}`);
    }
  };

  if (autoApprove) {
    // Auto-approve: run everything in one call
    await runFullTask(task.id, agentDeps, onSubtaskProgress);
  } else {
    // Interactive: run until approval gate, prompt user, then continue
    await runAgentLoop(task.id, agentDeps);

    const gateTask = await getTask(task.id, { storage });
    if (gateTask.status === 'awaiting_approval') {
      if (gateTask.subtasks && gateTask.subtasks.length > 0) {
        console.log('');
        log(`Task decomposed into ${bold(String(gateTask.subtasks.length))} subtasks:`);
        for (const [i, st] of gateTask.subtasks.entries()) {
          console.log(`  ${bold(`${i + 1}.`)} ${st.description}`);
          console.log(`     ${dim(`Files: ${st.affectedFiles.join(', ')}`)}`);
        }
        console.log('');
        await waitForEnter(`  ${yellow('\u23f8')} ${bold('Run subtasks?')} Press Enter to continue or Ctrl+C to abort... `);
      } else {
        console.log('');
        await waitForEnter(`  ${yellow('\u23f8')} ${bold('Awaiting approval.')} Press Enter to continue or Ctrl+C to abort... `);
      }

      await continueAfterApproval(task.id, agentDeps, onSubtaskProgress);
    }
  }

  const currentTask = await getTask(task.id, { storage });

  // 9. Print final status
  console.log('');
  if (currentTask.status === 'complete') {
    printComplete();
    const correctionSuffix = currentTask.correctionCount > 0
      ? dim(` (correction loop fired ${currentTask.correctionCount}x)`)
      : '';
    console.log(`${boldGreen('Task completed successfully.')}${correctionSuffix}`);
  } else if (currentTask.status === 'failed') {
    console.log(`\n${ANSI.boldRed}\u2501\u2501\u2501 Failed \u2501\u2501\u2501${ANSI.reset}`);
    console.log(boldRed('Task failed.'));
    if (currentTask.failureSummary) {
      console.log('');
      console.log(bold('Failure diagnosis:'));
      console.log(dim('\u2500'.repeat(60)));
      console.log(currentTask.failureSummary);
      console.log(dim('\u2500'.repeat(60)));
    }
  } else {
    console.log(`\n${bold(`Final status: ${currentTask.status}`)}`);
  }

  // 10. Print cost summary
  const { getTaskCostSummary } = await import('../../queries/getTaskCostSummary.js');
  try {
    const costSummary = await getTaskCostSummary(task.id, { storage });
    if (costSummary.totalTokens > 0) {
      console.log('');
      const costStr = costSummary.totalCost > 0
        ? ` | $${costSummary.totalCost.toFixed(6)}`
        : '';
      log(`${bold('Usage:')} ${costSummary.totalTokens.toLocaleString()} tokens${costStr} (${costSummary.callCount} calls)`);
    }
  } catch {
    // Cost summary unavailable; skip
  }

  // 11. Print generated diff if available
  if (currentTask.lastDiff) {
    console.log('');
    console.log(bold('Generated diff:'));
    console.log(dim('\u2500'.repeat(60)));
    console.log(currentTask.lastDiff);
    console.log(dim('\u2500'.repeat(60)));
  }

  // Cleanup
  await (storage as StorageAdapter & { close(): Promise<void> }).close();
}
