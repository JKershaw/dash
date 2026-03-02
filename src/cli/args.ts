/**
 * CLI argument parsing
 */

import { cliConfig } from './cliConfig.js';

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  /** Positional task description when first arg is not a known command. */
  positionalTask?: string;
}

const KNOWN_COMMANDS = new Set(cliConfig.knownCommands);

/** Flags that never take a value argument — always set to 'true'. */
const BOOLEAN_FLAGS = new Set(cliConfig.booleanFlags);

export function parseArgs(argv: string[]): ParsedArgs {
  // Skip node binary and script path
  const args = argv.slice(2);

  if (args.length === 0) {
    return { command: cliConfig.defaultCommand, flags: {} };
  }

  // First non-flag argument is the command
  let command = cliConfig.defaultCommand;
  let startIndex = 0;
  let positionalTask: string | undefined;

  if (args[0] && !args[0].startsWith('-')) {
    if (KNOWN_COMMANDS.has(args[0])) {
      command = args[0];
      startIndex = 1;
    } else {
      // Not a known command — treat as positional task description
      command = 'run';
      positionalTask = args[0];
      startIndex = 1;
    }
  }

  const flags: Record<string, string> = {};

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      command = 'help';
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = 'true';
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++; // skip value
        } else {
          flags[key] = 'true';
        }
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = 'true';
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = 'true';
        }
      }
    }
  }

  return { command, flags, positionalTask };
}
