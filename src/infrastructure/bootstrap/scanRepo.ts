import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';

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

/**
 * Scans a repository and returns structured data about its contents.
 *
 * Uses `git ls-files` to respect .gitignore. Reads file headers (first N lines)
 * from source files to capture imports and top-level declarations.
 *
 * All file reads are synchronous — this runs before any async phase work
 * and the files are small (headers only).
 */
export function scanRepo(repoPath: string): RepoScan {
  const files = getTrackedFiles(repoPath);
  const fileTree = buildFileTree(files);
  const packageJson = readPackageJson(repoPath);
  const tsConfig = readTsConfig(repoPath);
  const sourceHeaders = readSourceHeaders(repoPath, files);
  const testFilePaths = files.filter(f => isTestFile(f));
  const testSamples = readTestSamples(repoPath, files);
  const readme = readReadme(repoPath);
  const configFiles = detectConfigFiles(repoPath);
  const runtimeVersions = detectRuntimeVersions(repoPath);
  const lockfileType = detectLockfileType(repoPath);

  return {
    fileTree,
    packageJson,
    tsConfig,
    sourceHeaders,
    testFilePaths,
    testSamples,
    readme,
    configFiles,
    runtimeVersions,
    lockfileType,
  };
}

/**
 * Gets the list of tracked files via `git ls-files`.
 */
function getTrackedFiles(repoPath: string): string[] {
  try {
    const output = execSync('git ls-files', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
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
function readPackageJson(repoPath: string): ParsedPackageJson | null {
  const pkgPath = join(repoPath, 'package.json');
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
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
function readTsConfig(repoPath: string): ParsedTsConfig | null {
  const tsPath = join(repoPath, 'tsconfig.json');
  try {
    const raw = readFileSync(tsPath, 'utf-8');
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
function readSourceHeaders(repoPath: string, files: string[]): FileHeader[] {
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
    try {
      const content = readFileSync(join(repoPath, file), 'utf-8');
      const lines = content.split('\n').slice(0, MAX_HEADER_LINES).join('\n');
      headers.push({ path: file, lines });
    } catch {
      // Skip unreadable files
    }
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
function readTestSamples(repoPath: string, files: string[]): FileHeader[] {
  const testFiles = files.filter(f => isTestFile(f));
  const samples: FileHeader[] = [];

  for (const file of testFiles.slice(0, MAX_TEST_SAMPLES)) {
    try {
      const content = readFileSync(join(repoPath, file), 'utf-8');
      const lines = content.split('\n').slice(0, MAX_HEADER_LINES).join('\n');
      samples.push({ path: file, lines });
    } catch {
      // Skip unreadable files
    }
  }

  return samples;
}

/**
 * Reads the first N lines of README.md (case-insensitive).
 */
function readReadme(repoPath: string): string | null {
  const candidates = ['README.md', 'readme.md', 'README', 'README.txt'];
  for (const name of candidates) {
    const readmePath = join(repoPath, name);
    try {
      const content = readFileSync(readmePath, 'utf-8');
      return content.split('\n').slice(0, MAX_README_LINES).join('\n');
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Detects which config files exist in the repo root.
 */
function detectConfigFiles(repoPath: string): string[] {
  return CONFIG_FILES.filter(name => existsSync(join(repoPath, name)));
}

/**
 * Detects runtime versions available in the repo's environment.
 * Currently checks for Node.js only — extend as needed.
 */
function detectRuntimeVersions(repoPath: string): Record<string, string> {
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
 * Detects which package manager lockfile exists in the repo root.
 */
function detectLockfileType(repoPath: string): 'npm' | 'yarn' | 'pnpm' | 'bun' | null {
  if (existsSync(join(repoPath, 'package-lock.json'))) return 'npm';
  if (existsSync(join(repoPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(repoPath, 'bun.lockb'))) return 'bun';
  return null;
}
