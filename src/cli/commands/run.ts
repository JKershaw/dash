/**
 * Run command - connects to a Dash Build server and runs a task
 *
 * Cloud-only: all orchestration happens on the server.
 * Tools (file I/O, git, tests) execute locally on this machine.
 */

import { resolve, dirname, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { Config } from '../../config.js';
import { bold, dim, cyan, yellow, boldGreen, boldRed, ANSI } from '../colors.js';
import { log, logError, printComplete } from '../display.js';
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

/**
 * Validates that a path is an existing git repository.
 */
function validateRepoPath(repoPath: string): { valid: boolean; error?: string } {
  if (!existsSync(repoPath)) {
    return { valid: false, error: `Repository path does not exist: ${repoPath}` };
  }
  if (!statSync(repoPath).isDirectory()) {
    return { valid: false, error: `Repository path is not a directory: ${repoPath}` };
  }
  if (!existsSync(join(repoPath, '.git'))) {
    return { valid: false, error: `Repository path is not a git repository (no .git folder): ${repoPath}` };
  }
  return { valid: true };
}

export async function commandRun(flags: Record<string, string>, positionalTask?: string): Promise<void> {
  const taskDescription = flags['task'] || positionalTask;
  const modelOverride = flags['model'];
  const verbose = flags['verbose'] === 'true' || flags['v'] === 'true';
  const explicitQuiet = flags['quiet'] === 'true' || flags['q'] === 'true';
  const generateTests = flags['no-generate-tests'] !== 'true';
  const protectTestFiles = flags['protect-test-files'] === 'true';
  const queryMode = flags['query'] === 'true';
  const skipDecompose = flags['skip-decompose'] === 'true';
  const noWorktree = flags['no-worktree'] === 'true';

  // Validate task description (the only truly required input)
  if (!taskDescription) {
    logError('Missing task description');
    console.log(`\n  Usage: dash "Add retry logic to the API client"`);
    console.log(`         dash run --task "Add retry logic" [--repo <path>] [--test <cmd>]\n`);
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
  if (!generateTests) {
    log(`Mode: ${yellow('no-generate-tests')} ${dim('(test generation skipped)')}`);
  }
  if (queryMode) {
    log(`Mode: ${yellow('query')} ${dim('(research only, no code changes)')}`);
  }

  // Cloud mode: connect to remote orchestrator.
  // Explicit --cloud flag takes priority; then auto-detect local server; then default cloud URL.
  const explicitCloudUrl = flags['cloud'];
  const effectiveCloudUrl = explicitCloudUrl
    || await detectLocalServer(config.port)
    || config.defaultCloudUrl;

  // Create the CLI emitter. Cloud mode defaults to quiet (results only);
  // --quiet/-q reinforces this. --verbose overrides quiet.
  const quiet = (explicitQuiet || true) && !verbose;
  const cliEmitter = createCliEmitter({ verbose, quiet });

  if (explicitCloudUrl) {
    log(`Mode: ${yellow('cloud')} ${dim(`(${effectiveCloudUrl})`)}`);
  } else if (effectiveCloudUrl.includes('localhost')) {
    log(`Auto-routing through local server at ${cyan(effectiveCloudUrl)} ${dim('(browser will show live progress)')}`);
  } else {
    log(`Connecting to ${cyan(effectiveCloudUrl)}`);
  }
  console.log('');

  // Validate repo path on the CLI machine before connecting to the server.
  // (The server can't do this — the repo lives here, not there.)
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

  // Worktree isolation: create an isolated working directory for concurrent safety.
  const shouldWorktree = !noWorktree && !config.noWorktree && !queryMode;
  let effectiveRepo = resolvedRepo;
  let preGeneratedId: string | undefined;

  if (shouldWorktree) {
    const { v4: uuidv4 } = await import('uuid');
    preGeneratedId = uuidv4();
    try {
      effectiveRepo = await gitOps.addWorktree(preGeneratedId, resolvedRepo);
      log(`Worktree: ${dim(effectiveRepo)}`);
    } catch (err) {
      logError(`Worktree creation failed, using direct repo access: ${err instanceof Error ? err.message : String(err)}`);
      effectiveRepo = resolvedRepo;
      preGeneratedId = undefined;
    }
  }

  const tools = {
    readFile: createReadFileTool(effectiveRepo, config.maxFileReadLines),
    readFileRaw: createReadFileRawTool(effectiveRepo),
    writeFile: createWriteFileTool(effectiveRepo),
    listDir: createListDirTool(effectiveRepo, config.maxListDirEntries),
    search: createSearchTool(effectiveRepo, config.maxSearchResults),
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
    repoPath: effectiveRepo,
    originalRepoPath: effectiveRepo !== resolvedRepo ? resolvedRepo : undefined,
    taskId: preGeneratedId,
    testCommand,
    taskDescription,
    model: defaultModel,
    queryMode: queryMode || undefined,
    generateTests: generateTests || undefined,
    protectTestFiles: protectTestFiles || undefined,
    skipDecompose: skipDecompose || undefined,
    emitter: cliEmitter,
  });

  // CLI-side worktree cleanup: merge changes back and remove worktree.
  // The server cannot reliably do this via RPC because the transport closes
  // as soon as task_status is received (race condition).
  if (effectiveRepo !== resolvedRepo) {
    const worktreeBranch = `dash-wt-${preGeneratedId}`;
    if (result.status === 'complete') {
      try {
        const mergeResult = await gitOps.mergeWorktreeBranch(worktreeBranch, resolvedRepo);
        if (mergeResult.success) {
          log(`Merged worktree branch ${dim(worktreeBranch)} into main`);
        } else {
          logError(`Merge conflict: ${mergeResult.error}`);
          log(`Branch ${cyan(worktreeBranch)} preserved for manual resolution.`);
        }
      } catch (err) {
        logError(`Worktree merge failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      await gitOps.removeWorktree(effectiveRepo, resolvedRepo);
      log(`Worktree cleaned up`);
    } catch {
      // Best-effort cleanup
    }
  }

  if (result.status === 'complete') {
    printComplete();
    console.log(boldGreen('Task completed successfully.'));
  } else {
    console.log(`\n${ANSI.boldRed}\u2501\u2501\u2501 Failed \u2501\u2501\u2501${ANSI.reset}`);
    console.log(boldRed('Task failed.'));
  }

  if (result.taskId) {
    log(`Task ID: ${dim(result.taskId)}`);
  }
}
