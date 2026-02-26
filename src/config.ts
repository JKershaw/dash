export function getOpenRouterBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.DASH_BUILD_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
}

export interface Config {
  port: number;
  dataDir: string;
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  model: string;
  maxFileReadLines: number;
  maxListDirEntries: number;
  maxSearchResults: number;
  maxTestOutputChars: number;
  maxToolResultChars: number;
  contextBudgetRatio: number;
  fuzzyMatchThreshold: number;
  llmMaxOutputTokens: number;
  llmTimeoutMs: number;
  testTimeoutMs: number;
  testMaxTimeoutMs: number;
  budgetResearch: number;
  budgetTestPlan: number;
  budgetImplPlan: number;
  budgetTestGen: number;
  budgetDiffGen: number;
  budgetCorrection: number;
  budgetAnswer: number;
  maxCorrectionIterations: number;
  lineLossThreshold: number;
  resolveModel: string;
  phaseModels: Record<string, string>;
  mongoUrl: string | undefined;
  cloudOnly: boolean;
  hostedMode: boolean;
  githubClientId: string;
  githubClientSecret: string;
  baseUrl: string;
  freeTierTasksPerDay: number;
  freeTierTokensPerDay: number;
  adminAccountIds: string[];
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: parseInt(env.DASH_BUILD_PORT || '3000', 10),
    dataDir: env.DASH_BUILD_DATA_DIR || './data',
    openRouterApiKey: env.OPENROUTER_API_KEY || '',
    openRouterBaseUrl: getOpenRouterBaseUrl(env),
    model: env.DASH_BUILD_MODEL || 'google/gemini-3-flash-preview',
    maxFileReadLines: parseInt(env.DASH_BUILD_MAX_FILE_READ_LINES || '200', 10),
    maxListDirEntries: parseInt(env.DASH_BUILD_MAX_LIST_DIR_ENTRIES || '200', 10),
    maxSearchResults: parseInt(env.DASH_BUILD_MAX_SEARCH_RESULTS || '30', 10),
    maxTestOutputChars: parseInt(env.DASH_BUILD_MAX_TEST_OUTPUT_CHARS || '5000', 10),
    maxToolResultChars: parseInt(env.DASH_BUILD_MAX_TOOL_RESULT_CHARS || '20000', 10),
    contextBudgetRatio: parseFloat(env.DASH_BUILD_CONTEXT_BUDGET_RATIO || '0.6'),
    fuzzyMatchThreshold: parseFloat(env.DASH_BUILD_FUZZY_MATCH_THRESHOLD || '0.9'),
    llmMaxOutputTokens: parseInt(env.DASH_BUILD_LLM_MAX_OUTPUT_TOKENS || '32768', 10),
    llmTimeoutMs: parseInt(env.DASH_BUILD_LLM_TIMEOUT_MS || '120000', 10),
    testTimeoutMs: parseInt(env.DASH_BUILD_TEST_TIMEOUT_MS || '180000', 10),
    testMaxTimeoutMs: parseInt(env.DASH_BUILD_TEST_MAX_TIMEOUT_MS || '600000', 10),
    budgetResearch: parseInt(env.DASH_BUILD_BUDGET_RESEARCH || '12', 10),
    budgetTestPlan: parseInt(env.DASH_BUILD_BUDGET_TEST_PLAN || '5', 10),
    budgetImplPlan: parseInt(env.DASH_BUILD_BUDGET_IMPL_PLAN || '5', 10),
    budgetTestGen: parseInt(env.DASH_BUILD_BUDGET_TEST_GEN || '3', 10),
    budgetDiffGen: parseInt(env.DASH_BUILD_BUDGET_DIFF_GEN || '3', 10),
    budgetCorrection: parseInt(env.DASH_BUILD_BUDGET_CORRECTION || '5', 10),
    budgetAnswer: parseInt(env.DASH_BUILD_BUDGET_ANSWER || '3', 10),
    maxCorrectionIterations: parseInt(env.DASH_BUILD_MAX_CORRECTION_ITERATIONS || '3', 10),
    lineLossThreshold: parseFloat(env.DASH_BUILD_LINE_LOSS_THRESHOLD || '0.2'),
    resolveModel: env.DASH_BUILD_RESOLVE_MODEL || '',
    mongoUrl: env.MONGO_URL,
    cloudOnly: env.DASH_BUILD_CLOUD_ONLY === 'true',
    hostedMode: env.DASH_BUILD_HOSTED_MODE === 'true' || env.DASH_BUILD_CLOUD_ONLY === 'true',
    githubClientId: env.GITHUB_CLIENT_ID || '',
    githubClientSecret: env.GITHUB_CLIENT_SECRET || '',
    baseUrl: env.DASH_BUILD_BASE_URL || `http://localhost:${parseInt(env.DASH_BUILD_PORT || '3000', 10)}`,
    freeTierTasksPerDay: parseInt(env.DASH_BUILD_FREE_TIER_TASKS_PER_DAY || '10', 10),
    freeTierTokensPerDay: parseInt(env.DASH_BUILD_FREE_TIER_TOKENS_PER_DAY || '500000', 10),
    adminAccountIds: (env.DASH_BUILD_ADMIN_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    phaseModels: {
      ...(env.DASH_BUILD_MODEL_RESEARCH ? { research: env.DASH_BUILD_MODEL_RESEARCH } : {}),
      ...(env.DASH_BUILD_MODEL_TEST_PLAN ? { test_plan: env.DASH_BUILD_MODEL_TEST_PLAN } : {}),
      ...(env.DASH_BUILD_MODEL_IMPL_PLAN ? { impl_plan: env.DASH_BUILD_MODEL_IMPL_PLAN } : {}),
      ...(env.DASH_BUILD_MODEL_TEST_GEN ? { test_gen: env.DASH_BUILD_MODEL_TEST_GEN } : {}),
      ...(env.DASH_BUILD_MODEL_DIFF_GEN ? { diff_gen: env.DASH_BUILD_MODEL_DIFF_GEN } : {}),
      ...(env.DASH_BUILD_MODEL_CORRECTION ? { correction: env.DASH_BUILD_MODEL_CORRECTION } : {}),
      ...(env.DASH_BUILD_MODEL_ANSWER ? { answer: env.DASH_BUILD_MODEL_ANSWER } : {}),
    },
  };
}
