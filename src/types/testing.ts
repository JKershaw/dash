export interface TestResult {
  exitCode: number;
  passed: boolean;
  skipped?: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}
