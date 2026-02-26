export interface RunFlags {
  repo?: string;
  test?: string;
  task?: string;
  model?: string;
  autoApprove: boolean;
  verbose: boolean;
  query: boolean;
  skipDecompose: boolean;
  generateTests: boolean;
  cloud?: string;
  maxCorrections?: number;
}

export function parseRunFlags(flags: Record<string, string>): RunFlags {
  return {
    repo: flags['repo'],
    test: flags['test'] || flags['test-command'],
    task: flags['task'],
    model: flags['model'],
    autoApprove: flags['auto-approve'] === 'true' || flags['y'] === 'true',
    verbose: flags['verbose'] === 'true' || flags['v'] === 'true',
    query: flags['query'] === 'true',
    skipDecompose: flags['skip-decompose'] === 'true',
    generateTests: flags['no-generate-tests'] !== 'true',
    cloud: flags['cloud'],
    maxCorrections: flags['max-corrections'] ? parseInt(flags['max-corrections'], 10) : undefined,
  };
}
