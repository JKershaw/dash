import WebSocket from 'ws';
import type {
  ToolRequest,
  ToolResponse,
  ProtocolMessage,
  TransportClient,
  TransportClientOptions
} from '../../types/protocol.js';

export function createTransportClient(options?: TransportClientOptions): TransportClient {
  const {
    reconnect = false,
    initialReconnectDelayMs = 1000,
    maxReconnectDelayMs = 30000,
    token,
  } = options || {};

  let ws: WebSocket | null = null;
  let isConnected: boolean = false;
  let url: string = '';
  let reconnectAttempt: number = 0;
  let closedManually: boolean = false;
  let toolRequestHandler: ((req: ToolRequest) => Promise<ToolResponse>) | null = null;
  const messageHandlers = new Set<(msg: ProtocolMessage) => void>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function setupWs(socket: WebSocket): void {
    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ProtocolMessage;

        if (message.kind === 'tool_request' && toolRequestHandler) {
          const response = await toolRequestHandler(message.message as ToolRequest);
          if (isConnected && ws) {
            ws.send(JSON.stringify({ kind: 'tool_response', message: response }));
          }
        } else {
          for (const handler of messageHandlers) {
            handler(message);
          }
        }
      } catch (err) {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      isConnected = false;
      if (!closedManually && reconnect) {
        scheduleReconnect();
      }
    });

    socket.on('error', () => {
      // Cleanup is handled by close event
    });
  }

  /** WebSocket constructor options — carries the token as a header, not a query param. */
  const wsOptions = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;

  function scheduleReconnect(): void {
    const delay = Math.min(
      maxReconnectDelayMs,
      initialReconnectDelayMs * Math.pow(2, reconnectAttempt)
    );
    reconnectAttempt++;

    reconnectTimer = setTimeout(() => {
      ws = new WebSocket(url, wsOptions);
      setupWs(ws);
      ws.on('open', () => {
        isConnected = true;
        reconnectAttempt = 0;
      });
    }, delay);
  }

  return {
    connect(newUrl: string): Promise<void> {
      url = newUrl;
      closedManually = false;
      ws = new WebSocket(url, wsOptions);
      setupWs(ws);

      return new Promise((resolve, reject) => {
        ws!.once('open', () => {
          isConnected = true;
          reconnectAttempt = 0;
          resolve();
        });
        ws!.once('error', (err) => {
          reject(err);
        });
      });
    },

    send(message: ProtocolMessage): void {
      if (isConnected && ws) {
        ws.send(JSON.stringify(message));
      }
    },

    onToolRequest(handler: (req: ToolRequest) => Promise<ToolResponse>): void {
      toolRequestHandler = handler;
    },

    onMessage(handler: (msg: ProtocolMessage) => void): void {
      messageHandlers.add(handler);
    },

    get connected(): boolean {
      return isConnected;
    },

    close(): void {
      closedManually = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
      }
      isConnected = false;
    }
  };
}
