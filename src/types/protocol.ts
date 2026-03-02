import type { EventType } from './events.js';
import type { Phase, TaskStatus } from './task.js';

/**
 * Protocol version for tool communication.
 */
export const PROTOCOL_VERSION = '1.0';

/**
 * All tool/operation names that can be invoked remotely.
 * Derived from ToolSet, GitOperations, and TestRunner interfaces.
 */
export type ToolRequestType =
  | 'readFile'
  | 'readFileRaw'
  | 'writeFile'
  | 'listDir'
  | 'search'
  | 'askSubagent'
  | 'applyPatch'
  | 'createCommit'
  | 'revertLastCommit'
  | 'getCurrentBranch'
  | 'createBranch'
  | 'resetWorkingTree'
  | 'checkoutFile'
  | 'checkJsSyntax'
  | 'addWorktree'
  | 'removeWorktree'
  | 'mergeWorktreeBranch'
  | 'runTests'
  | 'scanRepo';

export interface ToolRequest {
  id: string;
  version: string;
  type: ToolRequestType;
  params: Record<string, unknown>;
}

export interface ToolResponse {
  id: string;
  version: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export type TaskCommandType = 'create' | 'start' | 'pause' | 'resume' | 'approve' | 'reject';

export interface TaskCommand {
  id: string;
  version: string;
  type: TaskCommandType;
  payload: Record<string, unknown>;
}

export interface PhaseEvent {
  id: string;
  version: string;
  taskId: string;
  timestamp: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface TaskStatusSnapshot {
  version: string;
  taskId: string;
  status: TaskStatus;
  currentPhase: Phase;
  progress: {
    completedPhases: Phase[];
    totalPhases: number;
  };
  costSoFar?: number;
  updatedAt: string;
}

export type ProtocolMessage =
  | { kind: 'tool_request'; message: ToolRequest }
  | { kind: 'tool_response'; message: ToolResponse }
  | { kind: 'task_command'; message: TaskCommand }
  | { kind: 'phase_event'; message: PhaseEvent }
  | { kind: 'task_status'; message: TaskStatusSnapshot };

export interface TransportServerOptions {
  requestTimeoutMs?: number;
  /** Interval in ms between SSE heartbeat comments. Set 0 to disable. Default 15 000. */
  heartbeatIntervalMs?: number;
}

export interface TransportServer {
  request(toolRequest: ToolRequest): Promise<ToolResponse>;
  broadcast(message: ProtocolMessage): void;
  onMessage(handler: (message: ProtocolMessage, clientId: string) => void): void;
  onConnection(handler: (clientId: string) => void): void;
  onDisconnection(handler: (clientId: string) => void): void;
  /** Return the accountId associated with a connected client, if any. */
  getClientAccountId?(clientId: string): string | undefined;
  /** Return the API key associated with a connected client (BYOK users). */
  getClientApiKey?(clientId: string): string | undefined;
  readonly clientCount: number;
  close(): Promise<void>;
}

export interface TransportClientOptions {
  reconnect?: boolean;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /** Session token sent as Authorization: Bearer header on both transports. */
  token?: string;
}

export interface TransportClient {
  connect(url: string): Promise<void>;
  send(message: ProtocolMessage): void;
  onToolRequest(handler: (request: ToolRequest) => Promise<ToolResponse>): void;
  onMessage(handler: (message: ProtocolMessage) => void): void;
  readonly connected: boolean;
  close(): void;
}
