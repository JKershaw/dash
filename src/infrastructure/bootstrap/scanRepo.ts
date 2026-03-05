import { execSync } from 'node:child_process';
import { extname, dirname, basename } from 'node:path';

import type { ContentSource } from '../../types/contentSource.js';
import type { RepoScan, ParsedPackageJson, ParsedTsConfig, FileHeader } from '../../types/bootstrap.js';
import { TEST_FILE_PATTERN } from '../../domain/fileExtensions.js';

/** Max source files to read headers from. */
const MAX_SOURCE_FILES = 500;

/** Max lines to read from each source file header. */
const MAX_HEADER_LINES = 20;

/** Max lines to read from README. */
const MAX_README_LINES = 30;

/** Max test sample files. */
const MAX_TEST_SAMPLES = 3;

/** Source file extensions to read headers from. */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.rb',
  '.c', '.cpp', '.h', '.hpp', '.css', '.html',
]);

// Test file detection uses the shared TEST_FILE_PATTERN from fileExtensions.ts

/** Config files to detect. */
const CONFIG_FILES = [
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.yml',
  'prettier.config.js', 'prettier.config.mjs',
  'jest.config.js', 'jest.config.ts', 'jest.config.mjs',
  'vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs',
  'playwright.config.js', 'playwright.config.ts',
  '.babelrc', 'babel.config.js',
  'webpack.config.js', 'vite.config.ts', 'vite.config.js',
  'rollup.config.js', 'rollup.config.mjs',
  'Makefile', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', '.editorconfig',
  'go.mod', 'Cargo.toml',
];

/** Lockfile names mapped to their package manager. */
const LOCKFILES: [string, 'npm' | 'yarn' | 'pnpm' | 'bun'][] = [
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['bun.lockb', 'bun'],
];

/**
 * Scans a repository via a ContentSource and returns structured data about its
 * contents.
 *
 * File reads go through the `source` abstraction so this works against a local
 * filesystem, a remote CLI (via RPC), or a GitHub API snapshot.
 *
 * Note: `runtimeVersions` is not populated here — it requires local shell
 * access. Call `detectRuntimeVersions(repoPath)` separately when running
 * locally.
 */
export async function scanRepo(source: ContentSource): Promise<RepoScan> {
  const files = await source.listFiles();
  const fileTree = buildFileTree(files);
  const fileSet = new Set(files);
  const packageJson = await readPackageJson(source);
  const tsConfig = await readTsConfig(source);
  const sourceHeaders = await readSourceHeaders(source, files);
  const testFilePaths = files.filter(f => isTestFile(f));
  const testSamples = await readTestSamples(source, files);
  const readme = await readReadme(source);
  const configFiles = detectConfigFiles(fileSet);
  const lockfileType = detectLockfileType(fileSet);

  return {
    fileTree,
    packageJson,
    tsConfig,
    sourceHeaders,
    testFilePaths,
    allTrackedFiles: files,
    testSamples,
    readme,
    configFiles,
    runtimeVersions: {},
    lockfileType,
  };
}

/**
 * Detects runtime versions available in the repo's environment.
 * Currently checks for Node.js only — extend as needed.
 * Exported separately because it requires local shell access.
 */
export function detectRuntimeVersions(repoPath: string): Record<string, string> {
  const versions: Record<string, string> = {};
  try {
    versions.node = execSync('node --version', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    // Node not available
  }
  return versions;
}

/**
 * Builds an indented file tree string from a list of file paths.
 * Groups files by directory and collapses single-child directories.
 */
function buildFileTree(files: string[]): string {
  if (files.length === 0) return '';

  // Build a tree structure
  const tree: Record<string, string[]> = {};
  for (const file of files) {
    const dir = dirname(file);
    const dirKey = dir === '.' ? '' : dir;
    if (!tree[dirKey]) tree[dirKey] = [];
    tree[dirKey].push(file);
  }

  const lines: string[] = [];
  const dirs = Object.keys(tree).sort();

  for (const dir of dirs) {
    if (dir) {
      // Show directory path
      lines.push(`${dir}/`);
    }
    // Show files in this directory (just the filename, indented if in a subdir)
    const dirFiles = tree[dir];
    const indent = dir ? '  ' : '';
    for (const file of dirFiles) {
      const filename = dir ? file.slice(dir.length + 1) : file;
      // Skip files that are in deeper subdirectories (they'll be shown under their own dir)
      if (!filename.includes('/')) {
        lines.push(`${indent}${filename}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Reads and parses package.json if it exists.
 */
async function readPackageJson(source: ContentSource): Promise<ParsedPackageJson | null> {
  try {
    const raw = await source.readFile('package.json');
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return {
      name: parsed.name,
      type: parsed.type,
      main: parsed.main,
      scripts: parsed.scripts,
      dependencies: parsed.dependencies,
      devDependencies: parsed.devDependencies,
    };
  } catch {
    return null;
  }
}

/**
 * Reads and parses tsconfig.json if it exists.
 */
async function readTsConfig(source: ContentSource): Promise<ParsedTsConfig | null> {
  try {
    const raw = await source.readFile('tsconfig.json');
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const co = parsed.compilerOptions || {};
    return {
      target: co.target,
      module: co.module,
      moduleResolution: co.moduleResolution,
      strict: co.strict,
      paths: co.paths,
      baseUrl: co.baseUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the first N lines from source files.
 * Prioritizes files with exports and entry points (index.ts).
 */
async function readSourceHeaders(source: ContentSource, files: string[]): Promise<FileHeader[]> {
  const sourceFiles = files
    .filter(f => SOURCE_EXTENSIONS.has(extname(f)))
    .filter(f => !isTestFile(f));

  // Prioritize: index files first, then by path depth (shallower first)
  const sorted = sourceFiles.sort((a, b) => {
    const aIsIndex = a.includes('index.') ? 0 : 1;
    const bIsIndex = b.includes('index.') ? 0 : 1;
    if (aIsIndex !== bIsIndex) return aIsIndex - bIsIndex;
    const aDepth = a.split('/').length;
    const bDepth = b.split('/').length;
    return aDepth - bDepth;
  });

  const headers: FileHeader[] = [];
  for (const file of sorted.slice(0, MAX_SOURCE_FILES)) {
    const content = await source.readFile(file);
    if (content === null) continue;
    const lines = content.split('\n').slice(0, MAX_HEADER_LINES).join('\n');
    headers.push({ path: file, lines });
  }

  return headers;
}

/**
 * Checks whether a file path looks like a test file.
 */
function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERN.test(filePath);
}

/**
 * Reads sample test files (first N lines of up to MAX_TEST_SAMPLES test files).
 */
async function readTestSamples(source: ContentSource, files: string[]): Promise<FileHeader[]> {
  const testFiles = files.filter(f => isTestFile(f));
  const samples: FileHeader[] = [];

  for (const file of testFiles.slice(0, MAX_TEST_SAMPLES)) {
    const content = await source.readFile(file);
    if (content === null) continue;
    const lines = content.split('\n').slice(0, MAX_HEADER_LINES).join('\n');
    samples.push({ path: file, lines });
  }

  return samples;
}

/**
 * Reads the first N lines of README.md (case-insensitive).
 */
async function readReadme(source: ContentSource): Promise<string | null> {
  const candidates = ['README.md', 'readme.md', 'README', 'README.txt'];
  for (const name of candidates) {
    const content = await source.readFile(name);
    if (content !== null) {
      return content.split('\n').slice(0, MAX_README_LINES).join('\n');
    }
  }
  return null;
}

/**
 * Detects which config files exist by checking the tracked file set.
 */
function detectConfigFiles(fileSet: Set<string>): string[] {
  return CONFIG_FILES.filter(name => fileSet.has(name));
}

/**
 * Detects which package manager lockfile exists by checking the tracked file set.
 */
function detectLockfileType(fileSet: Set<string>): 'npm' | 'yarn' | 'pnpm' | 'bun' | null {
  for (const [name, manager] of LOCKFILES) {
    if (fileSet.has(name)) return manager;
  }
  return null;
}
