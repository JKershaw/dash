export type Phase = 'research' | 'test_plan' | 'impl_plan' | 'test_gen' | 'decompose' | 'diff_gen' | 'correction' | 'complete' | 'answer';

export type TaskStatus = 'idle' | 'running' | 'paused' | 'awaiting_approval' | 'complete' | 'failed';

export type SectionName = 'task' | 'repoContext' | 'discoveries' | 'conventions' | 'testPlan'
  | 'implementationPlan' | 'iterationLog' | 'userNotes' | 'outcome';

export interface Section {
  content: string;
  locked: boolean;
  lastUpdatedBy: 'agent' | 'user';
  version: number;
}

export interface TaskConfig {
  repoPath: string;
  /** When worktree isolation is active, stores the real repo path.
   *  `repoPath` then contains the worktree path. */
  originalRepoPath?: string;
  testCommand: string;
  taskDescription: string;
  model: string;
  /** When true, skip working tree resets — the repo has in-progress changes. */
  continueFromCurrentState?: boolean;
  /** When true, run test_gen phase to generate tests before implementation. */
  generateTests?: boolean;
  /** When true, run research then answer phase only (no diff generation). */
  queryMode?: boolean;
  /** When true, block modifications to pre-existing test files (opt-in). */
  protectTestFiles?: boolean;
  /** When true, skip the decompose phase — used for child tasks to prevent recursive decomposition. */
  skipDecompose?: boolean;
  /** Override the maximum number of correction iterations for this task. */
  maxCorrectionIterations?: number;
  /** When set, restrict diff generation to only these file paths (--files flag). */
  allowedFiles?: string[];
  /** When true, keep generated test files in the repo after task completion. Default: clean up. */
  keepGeneratedTests?: boolean;
}

/** Structured test context extracted from bootstrap scan. */
export interface TestContext {
  /** All test file paths found in the repo. */
  testFilePaths: string[];
  /** Detected test framework (e.g. 'jest', 'vitest', 'node:test'). */
  testFramework: string | null;
  /** Test file naming pattern (e.g. '.test.ts', '.spec.js'). */
  testFilePattern: string | null;
  /** Directories containing test files (e.g. ['test/', '__tests__/']). */
  testDirectories: string[];
  /** First test sample content for downstream reference. */
  testSampleContent: string | null;
}

/** Per-file outcome from a multi-file diff attempt. */
export interface FileEditOutcome {
  filePath: string;
  status: 'applied' | 'failed' | 'skipped';
  /** Brief reason for failure (e.g. "not_found", "git apply failed"). */
  failureReason?: string;
}

/** A subtask produced by the decompose phase. */
export interface Subtask {
  /** Short description of the subtask. */
  description: string;
  /** Files that this subtask will modify. */
  affectedFiles: string[];
  /** Indices of other subtasks that must complete first. */
  dependencies: number[];
  /** What "done" looks like for this subtask. */
  acceptanceCriteria: string;
  /** Execution status. */
  status: 'pending' | 'running' | 'complete' | 'failed';
}

export interface Task {
  id: string;
  accountId?: string;
  status: TaskStatus;
  currentPhase: Phase;
  config: TaskConfig;
  sections: Record<SectionName, Section>;
  paused: boolean;
  correctionCount: number;
  reresearchCount: number;
  reresearchFocus?: string;
  lastDiff?: string;
  lastTestOutput?: string;
  lastEditFailures?: string;
  /** Per-file outcomes from the last diff attempt (multi-file only). */
  lastFileOutcomes?: FileEditOutcome[];
  fileStateAfterDiff?: Record<string, string>;
  /** Structured test context from bootstrap scan (S2.1). */
  testContext?: TestContext;
  /** Test files created by the test_gen phase (S2.2). Allow-list for correction (S2.3). */
  generatedTestFiles?: string[];
  resolvedTestCommand?: string;
  testCommandSource?: 'user' | 'llm_resolved' | 'llm_retry' | 'syntax_check_fallback';
  /** Subtasks produced by the decompose phase — read by CLI/driver for external orchestration. */
  subtasks?: Subtask[];
  /** Diagnostic summary produced when a task fails (S8.0). */
  failureSummary?: string;
  /** Short one-sentence summary of the task for display in task lists. */
  summary?: string;
  /** True when pre-flight assessment classified the task description as an implementation plan.
   *  Drives prompt calibration: research validates rather than rediscovers. */
  taskIsImplPlan?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SECTION_NAMES: SectionName[] = [
  'task', 'repoContext', 'discoveries', 'conventions', 'testPlan',
  'implementationPlan', 'iterationLog', 'userNotes', 'outcome'
];

export const PHASE_ORDER: Phase[] = [
  'research', 'test_plan', 'impl_plan', 'test_gen', 'decompose', 'diff_gen', 'correction', 'complete'
];

/**
 * All phases in display/progress order (including conditional phases).
 * Used for progress tracking (e.g. MCP progress notifications).
 */
export const PHASE_DISPLAY_ORDER: Phase[] = [
  'research', 'test_plan', 'impl_plan', 'test_gen', 'decompose', 'diff_gen', 'correction', 'complete',
];

/**
 * Default successor for each phase in the linear pipeline.
 *
 * Conditional routing (e.g. impl_plan → test_gen vs diff_gen, correction → research
 * for re-research) is handled by the agent loop. This covers the default/fallback
 * transition for each phase.
 */
const PHASE_TRANSITIONS: Partial<Record<Phase, Phase>> = {
  research: 'test_plan',
  test_plan: 'impl_plan',
  impl_plan: 'diff_gen',
  test_gen: 'diff_gen',
  decompose: 'diff_gen',
  correction: 'diff_gen',
  diff_gen: 'complete',
  answer: 'complete',
};

/**
 * Returns the default next phase for the given phase.
 * Falls back to 'complete' for unknown/terminal phases.
 */
export function getNextPhase(phase: Phase): Phase {
  return PHASE_TRANSITIONS[phase] ?? 'complete';
}

export function createEmptySection(): Section {
  return { content: '', locked: false, lastUpdatedBy: 'user', version: 0 };
}

export function createEmptySections(): Record<SectionName, Section> {
  const sections: Partial<Record<SectionName, Section>> = {};
  for (const name of SECTION_NAMES) {
    sections[name] = createEmptySection();
  }
  return sections as Record<SectionName, Section>;
}
