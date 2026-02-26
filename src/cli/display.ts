/**
 * Shared display functions for the CLI
 */

import { createInterface } from 'node:readline';
import type { TaskStatus, Task } from '../types/task.js';
import type { TaskEvent } from '../types/events.js';
import {
  ANSI,
  bold,
  dim,
  red,
  green,
  yellow,
  boldCyan,
  boldGreen,
  boldRed,
} from './colors.js';

// ---------------------------------------------------------------------------
// Pretty-print helpers
// ---------------------------------------------------------------------------

const PREFIX = `${dim('[')}${boldCyan('dash-build')}${dim(']')}`;

export function log(message: string): void {
  console.log(`${PREFIX} ${message}`);
}

export function logError(message: string): void {
  console.error(`${PREFIX} ${boldRed('ERROR')} ${red(message)}`);
}

export function printPhaseHeader(phase: string): void {
  console.log('');
  console.log(`${ANSI.boldCyan}\u2501\u2501\u2501 Phase: ${phase} \u2501\u2501\u2501${ANSI.reset}`);
}

export function printComplete(): void {
  console.log('');
  console.log(`${ANSI.boldGreen}\u2501\u2501\u2501 Complete \u2501\u2501\u2501${ANSI.reset}`);
}

export function formatEventForDisplay(event: TaskEvent): string | null {
  switch (event.type) {
    case 'phase_started':
      // Handled separately by phase header
      return null;

    case 'phase_completed': {
      const phase = event.payload.phase as string | undefined;
      const discoveriesPreview = event.payload.discoveriesPreview as string | undefined;
      const implPreview = event.payload.implementationPlanPreview as string | undefined;

      let preview: string | undefined;
      let label: string | undefined;
      if (phase === 'research' && discoveriesPreview) {
        preview = discoveriesPreview;
        label = 'Research findings';
      } else if (phase === 'impl_plan' && implPreview) {
        preview = implPreview;
        label = 'Implementation plan';
      }

      if (!preview || !label) return null;

      const lines = [`  ${dim(`\u250c\u2500 ${label} \u2500`)}`];
      for (const line of preview.split('\n')) {
        lines.push(dim(`  \u2502 ${line}`));
      }
      lines.push(dim('  \u2514\u2500'));
      return lines.join('\n');
    }

    case 'tool_called': {
      const toolName = (event.payload.function as string) || (event.payload.tool as string) || 'unknown';
      const args = event.payload.arguments as Record<string, unknown> | undefined;
      let argSummary = '';
      if (args) {
        // Show the first string argument as a brief summary
        const firstArg = Object.values(args).find((v) => typeof v === 'string');
        if (firstArg) {
          argSummary = `(${(firstArg as string).length > 60 ? (firstArg as string).slice(0, 57) + '...' : firstArg})`;
        }
      }
      return `  ${dim('\u2192')} ${dim(`${toolName}${argSummary}`)}`;
    }

    case 'section_updated': {
      const section = (event.payload.section as string) || 'unknown';
      const version = event.payload.version as number | undefined;
      const vStr = version !== undefined ? ` (v${version})` : '';
      return `  ${green('\u2713')} ${yellow(`Updated: ${section}${vStr}`)}`;
    }

    case 'diff_generated':
      return `  ${green('\u2713')} ${green('Generated diff')}`;

    case 'diff_applied': {
      const fileCount = (event.payload.filesModified as string[] | undefined)?.length ?? 0;
      return `  ${green('\u2713')} ${green(`Generated diff (${fileCount} file${fileCount !== 1 ? 's' : ''})`)}`;
    }

    case 'tests_run': {
      const passed = event.payload.passed as boolean;
      if (passed) {
        return `  ${green('\u2713')} ${boldGreen('Tests passed!')}`;
      } else {
        const exitCode = event.payload.exitCode as number | undefined;
        return `  ${red('\u2717')} ${boldRed(`Tests failed (exit code ${exitCode ?? '?'})`)}`;
      }
    }

    case 'error': {
      const errorMsg = (event.payload.message as string) || (event.payload.error as string) || 'Unknown error';
      const recoverable = event.payload.recoverable as boolean | undefined;
      let errorOutput = recoverable
        ? `  ${yellow('\u26a0')} ${yellow(`Warning: ${errorMsg}`)}`
        : `  ${red('\u2717')} ${red(`Error: ${errorMsg}`)}`;
      if (event.payload.guidance) {
        const guidance = event.payload.guidance as string[];
        for (const line of guidance) {
          errorOutput += `\n    ${dim(line)}`;
        }
      }
      if (event.payload.suggestedSubtasks) {
        const suggestedSubtasks = event.payload.suggestedSubtasks as string[];
        errorOutput += `\n    ${dim('Suggested subtasks:')}`;
        for (const st of suggestedSubtasks) {
          errorOutput += `\n      ${dim(`- ${st}`)}`;
        }
      }
      return errorOutput;
    }

    case 'paused':
      return `  ${yellow('\u23f8')} ${yellow('Task paused')}`;

    case 'resumed':
      return `  ${green('\u25b6')} ${green('Task resumed')}`;

    case 'llm_request':
      return null; // Too noisy for CLI

    case 'llm_response': {
      const tokensUsed = event.payload.tokensUsed as { totalTokens?: number } | undefined;
      const tokens = tokensUsed?.totalTokens;
      const cost = event.payload.cost as { totalCost?: number } | undefined;
      const parts: string[] = [];
      if (tokens) parts.push(`${tokens} tokens`);
      if (cost?.totalCost) parts.push(`$${cost.totalCost.toFixed(6)}`);
      if (event.payload.finishReason === 'length') parts.push('TRUNCATED');
      if (parts.length > 0) {
        const suffix = event.payload.finishReason === 'length' ? yellow(' (output was cut off)') : '';
        return `  ${dim(`  LLM response (${parts.join(' | ')})`)}${suffix}`;
      }
      return null;
    }

    case 'snapshot_taken':
      return null; // Internal event

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Task detail display
// ---------------------------------------------------------------------------

export function printTaskDetails(task: Task): void {
  const statusColor = getStatusColor(task.status);

  console.log(`  ${bold('Task ID:')}      ${task.id}`);
  console.log(`  ${bold('Status:')}       ${statusColor(task.status)}`);
  console.log(`  ${bold('Phase:')}        ${boldCyan(task.currentPhase)}`);
  console.log(`  ${bold('Description:')}  ${task.config.taskDescription}`);
  console.log(`  ${bold('Repository:')}   ${task.config.repoPath}`);
  console.log(`  ${bold('Test command:')} ${task.config.testCommand}`);
  console.log(`  ${bold('Created:')}      ${task.createdAt}`);
  console.log(`  ${bold('Updated:')}      ${task.updatedAt}`);
  console.log(`  ${bold('Corrections:')} ${task.correctionCount}`);

  // Show sections that have content
  const sectionsWithContent = Object.entries(task.sections).filter(
    ([, section]) => section.content && section.version > 0,
  );

  if (sectionsWithContent.length > 0) {
    console.log(`\n  ${bold('Sections:')}`);
    for (const [name, section] of sectionsWithContent) {
      const preview = section.content.length > 80
        ? section.content.slice(0, 77) + '...'
        : section.content;
      console.log(`    ${yellow(name)} ${dim(`(v${section.version})`)}: ${dim(preview)}`);
    }
  }

  if (task.lastDiff) {
    const lineCount = task.lastDiff.split('\n').length;
    console.log(`\n  ${bold('Diff:')} ${green(`${lineCount} lines`)}`);
  }
}

export function getStatusColor(status: TaskStatus): (text: string) => string {
  switch (status) {
    case 'complete':
      return boldGreen;
    case 'failed':
      return boldRed;
    case 'running':
      return boldCyan;
    case 'awaiting_approval':
      return (text: string) => `${ANSI.boldYellow}${text}${ANSI.reset}`;
    case 'paused':
      return yellow;
    case 'idle':
    default:
      return dim;
  }
}

// ---------------------------------------------------------------------------
// Wait for user input (approval gate)
// ---------------------------------------------------------------------------

export function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolvePromise) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, () => {
      rl.close();
      resolvePromise();
    });
  });
}
