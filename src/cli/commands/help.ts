/**
 * Help command - prints CLI usage information
 */

import { bold, dim, yellow, boldCyan } from '../colors.js';
import { loadConfig } from '../../config.js';

export function printHelp(): void {
  const defaultModel = loadConfig().model;
  const help = `
${bold('Dash')} - Cloud CLI for Dash Build coding agent

${bold('USAGE')}
  dash "task description"                  ${dim('(simplest — auto-detects repo and test command)')}
  dash run [options]                       ${dim('(explicit mode with overrides)')}
  dash [command] [options]

${bold('COMMANDS')}
  ${boldCyan('run')}                  Run a coding task against a Dash Build server
  ${boldCyan('ping')}                 Test connectivity to a remote server
  ${boldCyan('login')}                Authenticate with a Dash Build server
  ${boldCyan('guide')}                Print the agent integration guide
  ${boldCyan('help')}                 Show this help text

${bold('RUN OPTIONS')}
  ${yellow('--task')} <description>  Task description (or pass as first positional arg)
  ${yellow('--repo')} <path>         Path to the git repository
                        ${dim('(default: auto-detected from cwd via .git)')}
  ${yellow('--test')} <command>      Test command to run
                        ${dim('(default: auto-detected from package.json / framework)')}
  ${yellow('--model')} <model>       Override the LLM model for all phases
                        ${dim('(default: from env or ' + defaultModel + ')')}
  ${yellow('--cloud')} <url>         Connect to a specific server
                        ${dim('(default: https://dash.jkershaw.com)')}
  ${yellow('--auto-approve')}, ${yellow('-y')}   Skip the approval gate after impl_plan
  ${yellow('--verbose')}, ${yellow('-v')}        Show raw LLM output and detailed tool results
  ${yellow('--quiet')}, ${yellow('-q')}          Results only: suppress tool calls, LLM metadata ${dim('(default)')}
  ${yellow('--no-generate-tests')}         Skip test generation and implement against pre-written tests
  ${yellow('--protect-test-files')}        Block modifications to pre-existing test files
  ${yellow('--query')}                    Research-only mode: explore codebase and answer questions
  ${yellow('--skip-decompose')}           Skip automatic task decomposition (run as single task)
  ${yellow('--max-corrections')} <n>     Maximum number of correction iterations (default: 3)

${bold('ENVIRONMENT')}
  A .env file in the current directory is auto-loaded (no --env-file needed).

  DASH_CLOUD_URL                  Server URL override (default: https://dash.jkershaw.com)
  DASH_BUILD_MODEL                Model override (default: ${defaultModel})

${bold('EXAMPLES')}
  ${dim('# Simplest invocation (run from inside a git repo)')}
  dash "Add retry logic to the API client"

  ${dim('# With explicit repo and test command')}
  dash run --repo /path/to/repo --test "npm test" --task "Add a subtract function"

  ${dim('# Run with a specific model')}
  dash run --task "Fix login bug" --model "qwen/qwen-turbo"

  ${dim('# Run unattended with verbose output')}
  dash "Add input validation" -y -v

  ${dim('# Research mode (no code changes)')}
  dash "How does auth work?" --query

  ${dim('# Connect to a local dev server')}
  dash "Fix the bug" --cloud ws://localhost:3000
`;
  console.log(help);
}
