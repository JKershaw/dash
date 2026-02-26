/**
 * Help command - prints CLI usage information
 */

import { bold, dim, yellow, boldCyan } from '../colors.js';
import { loadConfig } from '../../config.js';

export function printHelp(): void {
  const defaultModel = loadConfig().model;
  const help = `
${bold('Dash Build')} - A minimal, reliable coding agent harness

${bold('USAGE')}
  dash-build "task description"              ${dim('(simplest — auto-detects repo and test command)')}
  dash-build run [options]                   ${dim('(explicit mode with overrides)')}
  dash-build [command] [options]

${bold('COMMANDS')}
  ${boldCyan('serve')}                Start the web server (default when no args)
  ${boldCyan('run')}                  Run a full agent loop from the CLI
  ${boldCyan('status')}               Show current task status
  ${boldCyan('tasks')}                List all tasks
  ${boldCyan('ping')}                 Test connectivity to a remote server
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
  ${yellow('--continue')}, ${yellow('-c')}         Start from current working tree state (task chaining)
  ${yellow('--auto-approve')}, ${yellow('-y')}   Skip the approval gate after impl_plan
  ${yellow('--verbose')}, ${yellow('-v')}        Show raw LLM output and detailed tool results
  ${yellow('--quiet')}, ${yellow('-q')}          Results only: suppress tool calls, LLM metadata ${dim('(default in cloud mode)')}
  ${yellow('--no-generate-tests')}         Skip test generation and implement against pre-written tests ${dim('(opt-out)')}
  ${yellow('--generate-tests')}            Generate tests before implementation ${dim('(default)')}
  ${yellow('--protect-test-files')}        Block modifications to pre-existing test files ${dim('(opt-in)')}
  ${yellow('--query')}                    Research-only mode: explore codebase and answer questions
  ${yellow('--skip-decompose')}           Skip automatic task decomposition (run as single task)
  ${yellow('--max-corrections')} <n>     Maximum number of correction iterations (default: 3)
  ${yellow('--cloud')} <url>          Connect to a remote orchestrator via WebSocket
${bold('STATUS OPTIONS')}
  ${yellow('--task-id')} <id>        Task ID to query

${bold('ENVIRONMENT')}
  A .env file in the current directory is auto-loaded (no --env-file needed).

  OPENROUTER_API_KEY              OpenRouter API key
  DASH_BUILD_MODEL                Model override (default: ${defaultModel})
  DASH_BUILD_DATA_DIR             Data directory (default: ./data)
  DASH_BUILD_PORT                 Server port (default: 3000)

${bold('EXAMPLES')}
  ${dim('# Simplest invocation (run from inside a git repo)')}
  dash-build "Add retry logic to the API client"

  ${dim('# With explicit repo and test command')}
  dash-build run --repo /path/to/repo --test "npm test" --task "Add a subtract function"

  ${dim('# Run with a specific model')}
  dash-build run --task "Fix login bug" --model "qwen/qwen-turbo"

  ${dim('# Run unattended with verbose output')}
  dash-build "Add input validation" -y -v

  ${dim('# Research mode (no code changes)')}
  dash-build "How does auth work?" --query

  ${dim('# Chain a second task on a modified repo')}
  dash-build "Add error handling to the new endpoints" --continue -y

  ${dim('# Start the web server')}
  dash-build serve

  ${dim('# Check task status')}
  dash-build status --task-id abc-123
`;
  console.log(help);
}
