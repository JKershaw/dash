/**
 * Dash CLI - Main entry point
 *
 * Cloud-only CLI that connects to a hosted Dash Build server.
 * Parses arguments and dispatches to the appropriate command handler.
 */

import { readFileSync } from 'node:fs';

// Suppress undici's one-time "EventSource is experimental" notice.
// We use EventSource intentionally for the HTTP transport fallback.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _orig = (process.emitWarning as any).bind(process);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).emitWarning = (warning: unknown, ...args: unknown[]) => {
  const opts = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
  if ((opts as { code?: string }).code === 'UNDICI-ES') return;
  return _orig(warning, ...args);
};

import { parseArgs } from './args.js';
import { dim, boldCyan } from './colors.js';
import { logError } from './display.js';

// Auto-load .env from cwd if it exists (only sets vars not already in env)
try {
  const envContents = readFileSync('.env', 'utf-8');
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // No .env file — that's fine, env vars may be set directly
}
import { printHelp } from './commands/help.js';
import { commandRun } from './commands/run.js';
import { commandLogin } from './commands/login.js';
import { commandPing } from './commands/ping.js';
import { commandGuide } from './commands/guide.js';

async function main(): Promise<void> {
  const { command, flags, positionalTask } = parseArgs(process.argv);

  switch (command) {
    case 'run':
      await commandRun(flags, positionalTask);
      break;

    case 'ping':
      await commandPing(flags);
      break;

    case 'login':
      await commandLogin(flags);
      break;

    case 'guide':
      commandGuide();
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      logError(`Unknown command: "${command}"`);
      console.log(`\n  Run ${boldCyan('dash help')} for usage information.\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error(dim(err.stack));
  }
  process.exit(1);
});
