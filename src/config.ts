export interface Config {
  port: number;
  model: string;
  maxFileReadLines: number;
  maxListDirEntries: number;
  maxSearchResults: number;
  maxTestOutputChars: number;
  maxToolResultChars: number;
  testMaxTimeoutMs: number;
  noWorktree: boolean;
  defaultCloudUrl: string;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: parseInt(env.DASH_BUILD_PORT || '3000', 10),
    model: env.DASH_BUILD_MODEL || 'google/gemini-3-flash-preview',
    maxFileReadLines: parseInt(env.DASH_BUILD_MAX_FILE_READ_LINES || '200', 10),
    maxListDirEntries: parseInt(env.DASH_BUILD_MAX_LIST_DIR_ENTRIES || '200', 10),
    maxSearchResults: parseInt(env.DASH_BUILD_MAX_SEARCH_RESULTS || '30', 10),
    maxTestOutputChars: parseInt(env.DASH_BUILD_MAX_TEST_OUTPUT_CHARS || '5000', 10),
    maxToolResultChars: parseInt(env.DASH_BUILD_MAX_TOOL_RESULT_CHARS || '20000', 10),
    testMaxTimeoutMs: parseInt(env.DASH_BUILD_TEST_MAX_TIMEOUT_MS || '600000', 10),
    noWorktree: env.DASH_BUILD_NO_WORKTREE === 'true',
    defaultCloudUrl: env.DASH_CLOUD_URL || 'https://dash.jkershaw.com',
  };
}
