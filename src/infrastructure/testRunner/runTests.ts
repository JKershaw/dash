import { spawn } from 'node:child_process';

import type { TestRunner } from '../../types/deps.js';
import type { TestResult } from '../../types/testing.js';

function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '\n... (truncated)';
}

/**
 * Detects when a test runner exited cleanly but ran zero tests.
 * Conservative — only returns true for known framework patterns.
 */
export function detectZeroTests(output: string): boolean {
  // Node.js native test runner: "ℹ tests 0" or "tests 0"
  if (/(?:ℹ\s*)?tests\s+0\b/.test(output)) return true;
  // Mocha: "0 passing"
  if (/\b0 passing\b/.test(output)) return true;
  // Jest: "Tests:  0 total"
  if (/Tests:\s+0 total/.test(output)) return true;
  // pytest: "no tests ran"
  if (/no tests ran/.test(output)) return true;
  return false;
}

/**
 * Detects when a test failure is caused by the test command itself
 * referencing a missing file — not by a code bug. Returns a human-readable
 * message if a missing-file pattern is found, null otherwise.
 *
 * This prevents Dash Build from entering the correction loop for errors
 * that no amount of code editing can fix (the test command is wrong).
 */
export function detectMissingTestFile(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;

  // Node.js: "Cannot find module '/absolute/path/to/test.ts'"
  // Only match absolute paths (starting with /) to distinguish from runtime
  // import errors like "Cannot find module './auth/index'" which are real code
  // bugs that correction should fix.
  const moduleNotFound = combined.match(
    /Cannot find module\s+['"](\/.+?)['"]/,
  );
  if (moduleNotFound) {
    return `Test file not found: ${moduleNotFound[1]}. Check that the --test command references a file that exists.`;
  }

  // Node.js ERR_MODULE_NOT_FOUND with "does not exist" at the path resolution
  // level (not a runtime import). Matches: "ERR_MODULE_NOT_FOUND ... /path/to/file"
  const errModuleNotFound = combined.match(
    /ERR_MODULE_NOT_FOUND[^\n]*?['"](\/.+?)['"]/,
  );
  if (errModuleNotFound) {
    return `Test file not found: ${errModuleNotFound[1]}. Check that the --test command references a file that exists.`;
  }

  // Node.js native test runner: "Could not find '...'"
  const couldNotFind = combined.match(/Could not find ['"]([^'"]+)['"]/);
  if (couldNotFind) {
    return `Test file not found: ${couldNotFind[1]}. Check that the --test command references a file that exists.`;
  }

  // Shell / OS level: "ENOENT: no such file or directory, open '/path/to/file'"
  const enoent = combined.match(
    /ENOENT[:\s]+no such file or directory[,:\s]*(?:open\s+)?['"]?([^\s'"]+)/i,
  );
  if (enoent) {
    return `File not found: ${enoent[1]}. Check that the --test command references a file that exists.`;
  }

  // Shell format: "node: /path/to/file: No such file or directory"
  // or: "/bin/sh: /path/to/file: No such file or directory"
  const shellNoSuchFile = combined.match(
    /:\s+([^\s:]+):\s+no such file or directory/i,
  );
  if (shellNoSuchFile) {
    return `File not found: ${shellNoSuchFile[1]}. Check that the --test command references a file that exists.`;
  }

  return null;
}

/**
 * Detects when a test failure is due to a missing dependency (module) that
 * the environment is lacking. These are often unrecoverable by the agent
 * without external help (e.g. pip install, npm install).
 */
export function detectMissingModule(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;

  // Python: "ModuleNotFoundError: No module named 'xxx'"
  const pythonMissing = combined.match(/ModuleNotFoundError:\s*No module named\s+['"](.+?)['"]/i);
  if (pythonMissing) {
    return `Missing Python dependency: ${pythonMissing[1]}`;
  }

  // Node.js: "Error: Cannot find module 'xxx'"
  // Note: detectMissingTestFile matches absolute paths for the test file itself.
  // This matches general module names.
  const nodeMissing = combined.match(/Error: Cannot find module\s+['"](.+?)['"]/i);
  if (nodeMissing) {
    return `Missing Node.js dependency: ${nodeMissing[1]}`;
  }

  return null;
}
export function createTestRunner(options?: { maxTimeoutMs?: number }): TestRunner {
  const configuredMaxTimeoutMs = options?.maxTimeoutMs ?? 600000; // 10 min default

  async function run(
    testCommand: string,
    repoPath: string,
    timeoutMs?: number,
  ): Promise<TestResult> {
    // timeoutMs = activity timeout: kill if no output for this long (detects hangs)
    // maxTimeoutMs = absolute cap: kill regardless of activity (failsafe for runaway processes)
    const activityTimeoutMs = timeoutMs || 60000;
    const maxTimeoutMs = Math.max(configuredMaxTimeoutMs, activityTimeoutMs);
    const startTime = Date.now();

    return new Promise<TestResult>((resolve) => {
      let resolved = false;
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let killReason: 'activity' | 'max' | null = null;

      const child = spawn(testCommand, [], {
        cwd: repoPath,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      function finish(exitCode: number) {
        if (resolved) return;
        resolved = true;
        clearTimeout(activityTimer);
        clearTimeout(maxTimer);

        const stdout = truncate(stdoutChunks.join(''), 5000);
        const stderr = truncate(stderrChunks.join(''), 5000);
        const durationMs = Date.now() - startTime;

        if (killReason) {
          const reason = killReason === 'activity'
            ? `Test runner produced no output for ${activityTimeoutMs}ms and was killed (possible hang).`
            : `Test timed out after ${maxTimeoutMs}ms (absolute limit).`;
          resolve({
            exitCode: -1,
            passed: false,
            stdout,
            stderr: truncate(`${reason}\n${stderr}`, 5000),
            durationMs,
          });
          return;
        }

        resolve({
          exitCode,
          passed: exitCode === 0 && !detectZeroTests(stdout),
          stdout,
          stderr,
          durationMs,
        });
      }

      // Kill the process and destroy stdio streams. Destroying the streams is
      // necessary because a subshell spawned by shell:true may create child
      // processes (e.g. `sleep`) that inherit the pipe's write end. Those
      // orphan children keep the pipe open and delay the 'close' event even
      // after the shell itself has been killed.
      function killChild(reason: 'activity' | 'max') {
        killReason = reason;
        child.kill('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
      }

      // Activity timer: resets on every chunk of output. Fires if the process
      // goes silent — the most reliable sign of a hang.
      let activityTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
        killChild('activity');
      }, activityTimeoutMs);

      function resetActivityTimer() {
        clearTimeout(activityTimer);
        activityTimer = setTimeout(() => {
          killChild('activity');
        }, activityTimeoutMs);
      }

      // Absolute max timer: hard cap regardless of output activity.
      const maxTimer = setTimeout(() => {
        killChild('max');
      }, maxTimeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk.toString());
        resetActivityTimer();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk.toString());
        resetActivityTimer();
      });

      child.on('close', (code) => {
        finish(code ?? 1);
      });

      child.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(activityTimer);
        clearTimeout(maxTimer);
        resolve({
          exitCode: -1,
          passed: false,
          stdout: '',
          stderr: truncate(`Process error: ${err.message}`, 5000),
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  return { run };
}
