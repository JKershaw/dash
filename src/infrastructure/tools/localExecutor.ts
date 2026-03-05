import type { ToolSet, GitOperations, TestRunner } from '../../types/deps.js';
import type { ToolRequest, ToolResponse } from '../../types/protocol.js';
import { PROTOCOL_VERSION } from '../../types/protocol.js';
import { scanRepo, detectRuntimeVersions } from '../bootstrap/scanRepo.js';
import { LocalContentSource } from '../contentSource/localContentSource.js';

export function createLocalExecutor(
  tools: ToolSet,
  git: GitOperations,
  testRunner: TestRunner,
): (request: ToolRequest) => Promise<ToolResponse> {
  return async (request: ToolRequest): Promise<ToolResponse> => {
    try {
      const params = request.params as Record<string, any>;
      let result: unknown;

      switch (request.type) {
        case 'readFile':
          result = await tools.readFile(params.path, params.startLine, params.endLine);
          break;
        case 'readFileRaw':
          result = await tools.readFileRaw(params.path);
          break;
        case 'writeFile':
          result = await tools.writeFile(params.path, params.content, params.opts as { overwrite?: boolean } | undefined);
          break;
        case 'listDir':
          result = await tools.listDir(params.path);
          break;
        case 'search':
          result = await tools.search(params.pattern, params.path);
          break;
        case 'askSubagent':
          result = await tools.askSubagent(params.question, params.context);
          break;

        case 'applyPatch':
          result = await git.applyPatch(params.diffString, params.repoPath);
          break;
        case 'createCommit':
          await git.createCommit(params.message, params.repoPath);
          result = null;
          break;
        case 'revertLastCommit':
          await git.revertLastCommit(params.repoPath);
          result = null;
          break;
        case 'getCurrentBranch':
          result = await git.getCurrentBranch(params.repoPath);
          break;
        case 'createBranch':
          await git.createBranch(params.name, params.repoPath);
          result = null;
          break;
        case 'resetWorkingTree':
          await git.resetWorkingTree(params.repoPath);
          result = null;
          break;
        case 'checkoutFile':
          await git.checkoutFile(params.filePath, params.repoPath);
          result = null;
          break;
        case 'checkJsSyntax':
          result = await git.checkJsSyntax(params.filePath, params.repoPath);
          break;

        case 'addWorktree':
          result = await git.addWorktree(params.taskId as string, params.repoPath as string);
          break;
        case 'removeWorktree':
          await git.removeWorktree(
            params.worktreePath as string,
            params.repoPath as string,
            params.opts as { keepBranch?: boolean } | undefined,
          );
          result = null;
          break;
        case 'mergeWorktreeBranch':
          result = await git.mergeWorktreeBranch(params.branchName as string, params.repoPath as string);
          break;

        case 'runTests':
          result = await testRunner.run(params.testCommand, params.repoPath, params.timeoutMs);
          break;

        case 'scanRepo': {
          const source = new LocalContentSource(params.repoPath as string);
          const scan = await scanRepo(source);
          scan.runtimeVersions = detectRuntimeVersions(params.repoPath as string);
          result = scan;
          break;
        }

        default:
          return {
            id: request.id,
            version: PROTOCOL_VERSION,
            error: {
              code: 'UNKNOWN_METHOD',
              message: `Unknown method: ${request.type}`,
            },
          };
      }

      return {
        id: request.id,
        version: PROTOCOL_VERSION,
        result: result ?? null,
      };
    } catch (err: unknown) {
      return {
        id: request.id,
        version: PROTOCOL_VERSION,
        error: {
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  };
}
