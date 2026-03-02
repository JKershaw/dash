/**
 * CLI - Main entry point
 *
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
import { cliConfig } from './cliConfig.js';

// Auto-load .env from cwd if it exists (only sets vars not already in env)
try {
  const envContents = readFileSync('.env', 'utf-8');
  for (const line of envContents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip matching surrounding quotes (common .env convention)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // No .env file — that's fine, env vars may be set directly
}

async function main(): Promise<void> {
  if (cliConfig.onStartup) cliConfig.onStartup();

  const { command, flags, positionalTask } = parseArgs(process.argv);

  const handler = cliConfig.commands[command];
  if (handler) {
    await handler(flags, positionalTask);
  } else {
    logError(`Unknown command: "${command}"`);
    console.log(`\n  Run ${boldCyan(`${cliConfig.productName} help`)} for usage information.\n`);
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
