/**
 * HTTP transport client — implements TransportClient over SSE + HTTP POST.
 *
 * Drop-in replacement for wsClient.ts when WebSocket upgrades are blocked
 * by a reverse proxy.  Connect with an http(s):// URL instead of ws(s)://.
 *
 * Uses undici for both fetch (POST) and EventSource (SSE) so that
 * HTTPS_PROXY / https_proxy environment variables are respected.
 */

import { fetch as undicicFetch, EventSource as UndiciEventSource, EnvHttpProxyAgent } from 'undici';
import type {
  ToolRequest,
  ToolResponse,
  ProtocolMessage,
  TransportClient,
  TransportClientOptions,
} from '../../types/protocol.js';

// EnvHttpProxyAgent reads HTTP_PROXY / HTTPS_PROXY and respects NO_PROXY,
// so local test traffic to 127.0.0.1 bypasses the proxy automatically.
const proxyAgent = new EnvHttpProxyAgent();

export function createHttpTransportClient(options?: TransportClientOptions): TransportClient {
  const {
    reconnect = false,
    initialReconnectDelayMs = 1000,
    maxReconnectDelayMs = 30000,
    token,
  } = options || {};

  let baseUrl = '';
  let channelId = '';
  let isConnected = false;
  let closedManually = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let eventSource: InstanceType<typeof UndiciEventSource> | null = null;
  let toolRequestHandler: ((req: ToolRequest) => Promise<ToolResponse>) | null = null;
  const messageHandlers = new Set<(msg: ProtocolMessage) => void>();

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async function post(path: string, body?: unknown): Promise<Response> {
    return undicicFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher: proxyAgent,
    } as Parameters<typeof undicicFetch>[1]) as unknown as Response;
  }

  async function handleMessage(data: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // ignore malformed
    }

    const msg = parsed;
    const kind = (msg as { kind?: string }).kind;

    if (kind === 'tool_request' && toolRequestHandler) {
      try {
        const toolMsg = msg as unknown as { kind: 'tool_request'; message: ToolRequest };
        const response = await toolRequestHandler(toolMsg.message);
        await post(`/api/channel/${channelId}/message`, {
          kind: 'tool_response',
          message: response,
        });
      } catch (err) {
        // Tool execution errors are surfaced via the response payload.
        // Transport errors (e.g. 413 body too large) must be logged — without
        // this the server never gets a response and times out with a generic
        // "Request timeout" message that hides the real cause.
        console.error('[http-transport] failed to deliver tool_response:', err instanceof Error ? err.message : String(err));
      }
    } else if (kind !== 'connected' && kind !== undefined) {
      // 'connected' is an internal handshake event, not a ProtocolMessage
      for (const handler of messageHandlers) {
        handler(msg as unknown as ProtocolMessage);
      }
    }
  }

  /**
   * Create a new channel and open an SSE stream.
   * Resolves once the server sends the 'connected' confirmation.
   */
  function openChannel(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      post('/api/channel')
        .then(async (res) => {
          if (!res.ok) {
            reject(new Error(`Failed to create channel: HTTP ${res.status}`));
            return;
          }
          const data = await res.json() as { channelId: string };
          channelId = data.channelId;

          const es = new UndiciEventSource(
            `${baseUrl}/api/channel/${channelId}/events`,
            { dispatcher: proxyAgent } as ConstructorParameters<typeof UndiciEventSource>[1],
          );
          eventSource = es;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          es.onmessage = async (event: any) => {
            const eventData = String(event.data);
            let parsed: unknown;
            try { parsed = JSON.parse(eventData); } catch { return; }

            const kind = (parsed as { kind?: string }).kind;
            if (kind === 'connected') {
              isConnected = true;
              reconnectAttempt = 0;
              resolve();
              // Replace onmessage with the live handler now that we're connected
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              es.onmessage = async (e: any) => {
                await handleMessage(String(e.data));
              };
              return;
            }
            // In case a real message arrives before 'connected' (shouldn't happen)
            await handleMessage(eventData);
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          es.onerror = (_event: any) => {
            if (!isConnected) {
              eventSource = null;
              reject(new Error('Failed to connect SSE stream'));
              return;
            }
            // Post-connection disconnect: attempt reconnect if enabled
            isConnected = false;
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
            if (!closedManually && reconnect) {
              scheduleReconnect();
            }
          };
        })
        .catch(reject);
    });
  }

  function scheduleReconnect(): void {
    const delay = Math.min(
      maxReconnectDelayMs,
      initialReconnectDelayMs * Math.pow(2, reconnectAttempt),
    );
    reconnectAttempt++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openChannel().catch(() => {
        // openChannel failed (server not ready yet) — try again
        if (!closedManually && reconnect) {
          scheduleReconnect();
        }
      });
    }, delay);
  }

  return {
    async connect(url: string): Promise<void> {
      baseUrl = url;
      closedManually = false;
      reconnectAttempt = 0;
      return openChannel();
    },

    send(message: ProtocolMessage): void {
      if (!isConnected) return;
      post(`/api/channel/${channelId}/message`, message).catch(() => {
        // Fire-and-forget; connection may be closing
      });
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
      isConnected = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    },
  };
}

// Uniform name so commandRun.ts can dynamically import either transport
export const createTransportClient = createHttpTransportClient;
