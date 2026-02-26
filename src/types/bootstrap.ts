export interface ParsedPackageJson {
  name?: string;
  type?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ParsedTsConfig {
  target?: string;
  module?: string;
  moduleResolution?: string;
  strict?: boolean;
  paths?: Record<string, string[]>;
  baseUrl?: string;
}

export interface FileHeader {
  path: string;
  lines: string;
}

export interface RepoScan {
  fileTree: string;
  packageJson: ParsedPackageJson | null;
  tsConfig: ParsedTsConfig | null;
  sourceHeaders: FileHeader[];
  testSamples: FileHeader[];
  /** All test file paths found in the repo (not limited to samples). */
  testFilePaths: string[];
  readme: string | null;
  configFiles: string[];
  runtimeVersions: Record<string, string>;
  lockfileType: 'npm' | 'yarn' | 'pnpm' | 'bun' | null;
}
