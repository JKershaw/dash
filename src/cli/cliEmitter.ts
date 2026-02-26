/**
 * CLI SSE Emitter - prints events to stdout instead of HTTP responses
 */

import type { TaskEvent } from '../types/events.js';
import type { SseEmitter } from '../types/deps.js';
import { dim, red } from './colors.js';
import { printPhaseHeader, formatEventForDisplay } from './display.js';

export interface CliEmitterOptions {
  verbose?: boolean;
  /** Suppress working-out events (tool_called, section_updated, llm_response, diff_generated). */
  quiet?: boolean;
}

const QUIET_SUPPRESSED = new Set(['tool_called', 'section_updated', 'llm_response', 'diff_generated']);

export function createCliEmitter(options: CliEmitterOptions = {}): SseEmitter & { getEvents(taskId: string): TaskEvent[] } {
  const { verbose = false, quiet = false } = options;
  const eventsByTask = new Map<string, TaskEvent[]>();

  return {
    emit(taskId: string, event: TaskEvent): void {
      // Store the event
      let events = eventsByTask.get(taskId);
      if (!events) {
        events = [];
        eventsByTask.set(taskId, events);
      }
      events.push(event);

      // In quiet mode, suppress working-out events (keep results only)
      if (quiet && QUIET_SUPPRESSED.has(event.type)) return;

      // Print the event in real time
      if (event.type === 'phase_started') {
        const phase = (event.payload.phase as string) || event.phase;
        printPhaseHeader(phase);
        return;
      }

      const formatted = formatEventForDisplay(event);
      if (formatted) {
        console.log(formatted);
      }

      // Verbose output: show raw LLM content and detailed tool info
      if (verbose) {
        if (event.type === 'llm_response') {
          const content = event.payload.content as string | undefined;
          if (content) {
            console.log(dim('    \u250c\u2500 LLM output \u2500'));
            for (const line of content.split('\n')) {
              console.log(dim(`    \u2502 ${line}`));
            }
            console.log(dim('    \u2514\u2500'));
          }
        }

        if (event.type === 'tool_result') {
          const fnName = (event.payload.function as string) || 'unknown';
          const result = event.payload.result as string | undefined;
          if (result) {
            const preview = result.length > 500
              ? result.slice(0, 500) + '...'
              : result;
            console.log(dim(`    \u250c\u2500 ${fnName} result \u2500`));
            for (const line of preview.split('\n')) {
              console.log(dim(`    \u2502 ${line}`));
            }
            console.log(dim('    \u2514\u2500'));
          }
        }

        if (event.type === 'error') {
          const context = event.payload.context as string | undefined;
          const failedEdits = event.payload.failedEdits as string[] | undefined;
          if (context) {
            console.log(`    ${dim(`context: ${context}`)}`);
          }
          if (failedEdits) {
            for (const edit of failedEdits) {
              console.log(`    ${red(edit)}`);
            }
          }
        }
      }
    },

    getEvents(taskId: string): TaskEvent[] {
      return eventsByTask.get(taskId) || [];
    },
  };
}
