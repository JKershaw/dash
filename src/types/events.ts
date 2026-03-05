import type { Phase } from './task.js';

export type EventType =
  | 'phase_started'
  | 'phase_completed'
  | 'tool_called'
  | 'tool_result'
  | 'llm_request'
  | 'llm_response'
  | 'section_updated'
  | 'user_note_injected'
  | 'user_edit'
  | 'diff_generated'
  | 'diff_applied'
  | 'tests_run'
  | 'error'
  | 'warning'
  | 'paused'
  | 'resumed'
  | 'snapshot_taken'
  | 'status_changed'
  | 'test_command_resolved'
  | 'failure_diagnosed'
  | 'pr_created';

export interface TaskEvent {
  id: string;
  taskId: string;
  timestamp: string;
  phase: Phase;
  type: EventType;
  payload: Record<string, unknown>;
}
