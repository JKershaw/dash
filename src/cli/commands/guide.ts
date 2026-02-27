/**
 * Guide command - prints the agent integration guide to stdout
 */

const GUIDE = `# Dash — Agent Integration Guide

Dash is a coding agent for focused implementation tasks. Give it a task, a repo,
and a test command — it researches the codebase, plans, writes code, and
self-corrects until tests pass.

## Setup & Authentication

No manual configuration is needed. When you run a task, Dash connects to the
server and authenticates automatically (anonymous session). Just run your task:

    npx @jkershaw/dash@latest "Add retry logic to the API client" -y -v

To use your own OpenRouter API key (removes rate limits, full model choice):

    npx @jkershaw/dash@latest login

This opens a browser to authenticate with OpenRouter via OAuth. Your key is
exchanged directly with OpenRouter — Dash never sees it in plaintext.
Credentials are saved at ~/.config/dash-build/credentials.json and reused
automatically on future runs.

For AI agents: authentication is automatic. No env vars, no API keys, no login
step required. If a human has previously run \`dash login\`, those credentials
are reused.

## Invocation

    npx @jkershaw/dash@latest run \\
      --repo /path/to/repo \\
      --test "npm test" \\
      --task "your task description" \\
      -y -v

Always use \`-y\` (skip approval gate — you are the approval layer) and \`-v\`
(verbose output).

If you run from inside a git repo, \`--repo\` and \`--test\` are auto-detected:

    npx @jkershaw/dash@latest "Add retry logic to the API client" -y -v

## Task Sizing

Dash works best on 1-4 file, single-concern tasks. If a task touches more,
decompose it first. Additive work (new code) is easier than modifying complex
existing logic.

Good task descriptions name the scope and success criteria:

- "Add retry logic with exponential backoff to apiClient.ts"
- "Fix the overdue filter — tasks due today shouldn't show as overdue"
- "Make test/api/routes.test.ts pass"

Vague symptoms are fine when the test command is precise.

## Prompt Style

Describe the goal, not the steps. Dash discovers the codebase during research
and creates its own implementation plan. Over-specified prompts lead to bloated
plans that exceed complexity thresholds.

Good (goal-level):
- "Add a landing page at /welcome with project branding and a link to the dashboard"
- "Add a settings page where users can update their profile"

Bad (implementation-level):
- "Create views/landing.ejs with a centered logo, 3 feature cards in a CSS grid..."
- "Add a form with name input, email input with regex validation, password..."

If Dash rejects a task for complexity, simplify your description rather than
splitting the same detailed prompt into pieces.

## Query Mode

Query mode runs the research phase and produces a written answer — no diffs,
no test runs, no code changes.

    npx @jkershaw/dash@latest run \\
      --repo /path/to/repo \\
      --query \\
      --task "your question or review prompt"

## Handling Results

- Success: Changes are applied and tests pass. Continue with the next step.
- Rejection: Dash explains why and provides guidance. Follow it — decompose,
  clarify, or adjust scope — then resubmit.
- Failure (corrections exhausted): Simplify scope and retry, or take over manually.

## Key Principle

Dash produces first versions. You handle iteration and refinement. When in
doubt, try it — Dash will reject with guidance if the task is outside its
capability.
`;

export function commandGuide(): void {
  console.log(GUIDE);
}
