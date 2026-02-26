import type { RepoScan } from '../../types/bootstrap.js';

export interface ProjectSummary {
  language: string | null;
  entryPoint: string | null;
  moduleSystem: string | null;
  importStyle: 'ESM' | 'CJS' | 'mixed' | null;
  testFramework: string | null;
  testCommand: string | null;
  testCommandConfidence: 'high' | 'medium' | 'low' | null;
  sourceFileCount: number;
}

// ── Language detection ────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.c': 'C', '.h': 'C',
  '.cpp': 'C++', '.hpp': 'C++',
};

function detectLanguage(scan: RepoScan): string | null {
  // tsconfig.json is the strongest TypeScript signal
  if (scan.tsConfig) {
    return scan.tsConfig.strict ? 'TypeScript (strict mode)' : 'TypeScript';
  }

  // Fall back to most common extension in source headers
  if (scan.sourceHeaders.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const header of scan.sourceHeaders) {
    const dot = header.path.lastIndexOf('.');
    if (dot === -1) continue;
    const ext = header.path.slice(dot);
    const lang = EXTENSION_TO_LANGUAGE[ext];
    if (lang) {
      counts[lang] = (counts[lang] || 0) + 1;
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

// ── Module system detection ───────────────────────────────────────────

function detectModuleSystem(scan: RepoScan): string | null {
  if (!scan.packageJson?.type) return null;
  return scan.packageJson.type === 'module' ? 'ESM' : 'CommonJS';
}

// ── Test framework detection ──────────────────────────────────────────

/** Config file prefix → framework name. */
const FRAMEWORK_CONFIG_PATTERNS: [RegExp, string][] = [
  [/^jest\.config\./, 'jest'],
  [/^vitest\.config\./, 'vitest'],
  [/^playwright\.config\./, 'playwright'],
  [/^pytest\.ini$/, 'pytest'],
  [/^conftest\.py$/, 'pytest'],
  [/^go\.mod$/, 'go'],
  [/^Cargo\.toml$/, 'cargo'],
  [/^phpunit\.xml(\.dist)?$/, 'phpunit'],
  [/\.csproj$/, 'dotnet'],
];

/** devDependency key → framework name. */
const FRAMEWORK_DEV_DEPS: [string, string][] = [
  ['jest', 'jest'],
  ['@jest/globals', 'jest'],
  ['vitest', 'vitest'],
  ['mocha', 'mocha'],
  ['jasmine', 'jasmine'],
  ['ava', 'ava'],
  ['tape', 'tape'],
];

/** Import/require patterns in test sample source → framework name. */
const FRAMEWORK_IMPORT_PATTERNS: [RegExp, string][] = [
  [/from\s+['"]node:test['"]/, 'node:test'],
  [/require\(\s*['"]node:test['"]/, 'node:test'],
  [/from\s+['"]vitest['"]/, 'vitest'],
  [/from\s+['"]@jest\/globals['"]/, 'jest'],
  [/from\s+['"]mocha['"]/, 'mocha'],
  [/import\s+pytest/, 'pytest'],
  [/import\s+unittest/, 'unittest'],
];

function detectTestFramework(scan: RepoScan): string | null {
  // 1. Config files (highest confidence — you don't have jest.config.ts by accident)
  for (const configFile of scan.configFiles) {
    for (const [pattern, framework] of FRAMEWORK_CONFIG_PATTERNS) {
      if (pattern.test(configFile)) return framework;
    }
  }

  // 2. devDependencies
  const devDeps = scan.packageJson?.devDependencies;
  if (devDeps) {
    for (const [dep, framework] of FRAMEWORK_DEV_DEPS) {
      if (dep in devDeps) return framework;
    }
  }

  // 3. Test sample imports (catches node:test and non-JS frameworks)
  for (const sample of scan.testSamples) {
    for (const [pattern, framework] of FRAMEWORK_IMPORT_PATTERNS) {
      if (pattern.test(sample.lines)) return framework;
    }
  }

  return null;
}

// ── Test command detection ────────────────────────────────────────────
const FRAMEWORK_COMMANDS: Record<string, string> = {
  vitest: 'npx vitest run',
  jest: 'npx jest',
  mocha: 'npx mocha',
  playwright: 'npx playwright test',
  jasmine: 'npx jasmine',
  ava: 'npx ava',
  tape: 'npx tape',
  pytest: 'pytest',
  unittest: 'python -m unittest discover',
  go: 'go test ./...',
  cargo: 'cargo test',
  phpunit: './vendor/bin/phpunit',
  dotnet: 'dotnet test'
};

/** Check if a test script is likely a placeholder (e.g., npm default error message). */
function isPlaceholderScript(scriptTest: string): boolean {
  if (!scriptTest) return false;
  // npm's default error message
  if (scriptTest.includes('echo "Error: no test specified"') && scriptTest.includes('exit 1')) {
    return true;
  }
  // Common other placeholders
  if (scriptTest === 'echo "Error: no test specified" && exit 1') return true;
  if (scriptTest === 'exit 1') return true;
  return false;
}

function detectTestCommand(scan: RepoScan): { command: string | null; confidence: 'high' | 'medium' | 'low' | null } {
  const scriptTest = scan.packageJson?.scripts?.test;

  // If there's a valid test script (not a placeholder), return it with high confidence
  if (scriptTest && !isPlaceholderScript(scriptTest)) {
    return { command: scriptTest, confidence: 'high' };
  }

  // If script is a placeholder or missing, try to infer from framework detection
  const framework = detectTestFramework(scan);
  if (!framework) {
    // No framework detected and no valid script
    return { command: null, confidence: null };
  }

  if (framework in FRAMEWORK_COMMANDS) {
    // Framework detected → return its default command with 'low' confidence
    // (because we're guessing, not using an explicit script)
    return { command: FRAMEWORK_COMMANDS[framework], confidence: 'low' };
  }

  if (framework === 'node:test') {
    return {
      command: scan.tsConfig
        ? 'npx tsx --test "**/*.test.ts"'
        : 'node --test "**/*.test.js"',
      confidence: 'low'
    };
  }

  return { command: null, confidence: null };
}

// ── Entry point detection ──────────────────────────────────────────────

function detectEntryPoint(scan: RepoScan): string | null {
  // 1. package.json "main" field
  if (scan.packageJson?.main && typeof scan.packageJson.main === 'string' && scan.packageJson.main.length > 0) {
    return scan.packageJson.main;
  }

  // 2. Common src/ patterns
  const targets = ['src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js'];
  for (const header of scan.sourceHeaders) {
    if (targets.includes(header.path)) {
      return header.path;
    }
  }

  return null;
}
// ── Import style detection ───────────────────────────────────────────

function detectImportStyle(scan: RepoScan): 'ESM' | 'CJS' | 'mixed' | null {
  let hasEsm = false;
  let hasCjs = false;

  const esmStartRegex = /^import\s/m;
  const esmFromRegex = /\bfrom\s+['"]/;
  const cjsRequireRegex = /\brequire\s*\(/;

  for (const header of scan.sourceHeaders) {
    const lines = header.lines;
    const isEsm = esmStartRegex.test(lines) || esmFromRegex.test(lines);
    const isCjs = cjsRequireRegex.test(lines);

    if (isEsm) hasEsm = true;
    if (isCjs) hasCjs = true;

    if (hasEsm && hasCjs) return 'mixed';
  }

  if (hasEsm && hasCjs) return 'mixed';
  if (hasEsm) return 'ESM';
  if (hasCjs) return 'CJS';
  return null;
}

/**
 * Deterministically extracts key project facts from a RepoScan.
 *
 * Pure function — no I/O. Returns null fields when the scan doesn't
 * contain enough signal. These facts are rendered as an unambiguous
 * summary at the top of the formatted context so that even small LLMs
 * get the language and test framework right without inference.
 */
export function detectProjectSummary(scan: RepoScan): ProjectSummary {
  const { command: testCommand, confidence: testCommandConfidence } = detectTestCommand(scan);

  return {
    language: detectLanguage(scan),
    entryPoint: detectEntryPoint(scan),
    moduleSystem: detectModuleSystem(scan),
    importStyle: detectImportStyle(scan),
    testFramework: detectTestFramework(scan),
    testCommand,
    testCommandConfidence,
    sourceFileCount: scan.sourceHeaders.length,
  };
}

// ── Test file detection ─────────────────────────────────────────────

/**
 * Finds a test file in the scan that matches a given source file path.
 *
 * Compares the basename of the source (e.g. 'config' from 'src/config.ts')
 * with test sample basenames after stripping .test/.spec suffixes.
 * Returns the first matching test sample path, or null.
 *
 * Pure function — uses string operations instead of node:path.
 */
export function detectTestFile(sourcePath: string, scan: RepoScan): string | null {
  const sourceBase = stripExtension(getBasename(sourcePath));

  for (const sample of scan.testSamples) {
    let testBase = stripExtension(getBasename(sample.path));
    // Strip .test or .spec suffix (e.g. 'config.test' → 'config')
    testBase = testBase.replace(/\.(test|spec)$/, '');

    if (testBase === sourceBase) {
      return sample.path;
    }
  }

  return null;
}

function getBasename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1);
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}
