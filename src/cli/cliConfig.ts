/**
 * Per-repo CLI configuration.
 *
 * This is the ONLY CLI file that differs between dash-build and dash.
 * Every other CLI file imports from here instead of hardcoding product-specific values.
 */

import { loadConfig } from '../config.js';
import { commandRun } from './commands/run.js';
import { printHelp } from './commands/help.js';
import { commandGuide } from './commands/guide.js';
import { commandPing } from './commands/ping.js';
import { commandLogin } from './commands/login.js';
import { checkForUpdate } from './updateCheck.js';

export type CommandEntry = (flags: Record<string, string>, positionalTask?: string) => void | Promise<void>;

export interface CliConfig {
  productName: string;
  knownCommands: string[];
  booleanFlags: string[];
  defaultCommand: string;
  getDefaultServerUrl: () => string;
  pingExample: string;
  commands: Record<string, CommandEntry>;
  onStartup?: () => void;
}

export const cliConfig: CliConfig = {
  productName: 'dash',
  knownCommands: ['run', 'help', 'guide', 'ping', 'login'],
  booleanFlags: [
    'verbose', 'v', 'quiet', 'q', 'auto-approve', 'y',
    'no-generate-tests', 'protect-test-files',
    'query', 'skip-decompose', 'no-worktree',
    'help', 'h',
  ],
  defaultCommand: 'help',
  getDefaultServerUrl: () => loadConfig().defaultCloudUrl,
  pingExample: 'dash ping --cloud https://dash.jkershaw.com',
  commands: {
    run: commandRun,
    help: printHelp,
    guide: commandGuide,
    ping: commandPing,
    login: commandLogin,
  },
  onStartup: () => { checkForUpdate(); },
};
