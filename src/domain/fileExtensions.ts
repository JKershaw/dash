/**
 * Canonical list of source file extensions recognised across the codebase.
 *
 * Used by:
 *  - extractFilePaths (regex alternation for path extraction)
 *  - postPhaseChecks  (impl_plan file reference check)
 *  - exitCondition    (discoveries substance check)
 *
 * When adding a new extension, add it here — all three consumers derive
 * their specific format from this single list.
 */
export const SOURCE_FILE_EXTENSIONS: readonly string[] = [
  'ts', 'js', 'tsx', 'jsx',
  'mjs', 'cjs', 'mts', 'cts',
  'py', 'go', 'rs', 'java', 'rb',
  'c', 'cpp', 'h', 'hpp',
  'css', 'html', 'json',
  'yaml', 'yml', 'toml',
  'md', 'sh', 'sql',
] as const;

/** Regex alternation string: `ts|js|tsx|jsx|...` */
export const SOURCE_FILE_EXTENSIONS_ALTERNATION: string =
  SOURCE_FILE_EXTENSIONS.join('|');

/** Dotted extensions for `.includes()` checks: `['.ts', '.js', ...]` */
export const SOURCE_FILE_DOTTED_EXTENSIONS: readonly string[] =
  SOURCE_FILE_EXTENSIONS.map(ext => `.${ext}`);

/**
 * Test file detection pattern.
 *
 * Matches paths containing `.test.`, `.spec.`, or common test directories
 * (`test/`, `tests/`, `__tests__/`). Used by diff_gen to filter out test
 * file blocks and by repo scanning to identify test files.
 */
export const TEST_FILE_PATTERN = /(?:\.test\.|\.spec\.|[\\/]test[\\/]|[\\/]tests[\\/]|[\\/]__tests__[\\/])/;
