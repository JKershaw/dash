/**
 * ping command — tests connectivity to a remote Dash Build server.
 *
 * Checks:
 *  1. HTTP reachability (GET /api/auth/status — always public)
 *  2. SSE channel (POST /api/channel → GET /api/channel/:id/events)
 *  3. WebSocket handshake (informational — fails gracefully if proxy blocks WS)
 *
 * Uses undici with EnvHttpProxyAgent so checks respect HTTPS_PROXY / https_proxy
 * and NO_PROXY.  Safe to run without an API key.
 *
 * Usage:
 *   npx tsx src/cli.ts ping --cloud https://dash.jkershaw.com
 *   npx tsx src/cli.ts ping --cloud wss://dash.jkershaw.com   (also tests WS)
 */

import { fetch as undicicFetch, WebSocket as UndiciWebSocket, EnvHttpProxyAgent } from 'undici';
import { bold, cyan, dim, boldGreen, boldRed, yellow } from '../colors.js';

// Reads HTTP_PROXY / HTTPS_PROXY and respects NO_PROXY automatically
const proxyAgent = new EnvHttpProxyAgent();

function toHttp(url: string): string {
  return url.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
}

export async function commandPing(flags: Record<string, string>): Promise<void> {
  const cloudUrl = flags['cloud'];
  if (!cloudUrl) {
    console.error(boldRed('Error:') + ' --cloud <url> is required for ping');
    console.log(`  Example: ${cyan('npx tsx src/cli.ts ping --cloud https://dash.jkershaw.com')}`);
    process.exit(1);
  }

  const httpBase = toHttp(cloudUrl);
  const isWsUrl = cloudUrl.startsWith('ws://') || cloudUrl.startsWith('wss://');

  console.log('');
  console.log(`${bold('Ping')} ${cyan(cloudUrl)}`);
  console.log('');

  let allOk = true;

  // ── 1. HTTP health check ─────────────────────────────────────────────────
  // Use /api/auth/status — it's always public (exempt from auth middleware).
  process.stdout.write(`  HTTP  ${dim(httpBase + '/api/auth/status')} … `);
  const httpStart = Date.now();
  try {
    const res = await undicicFetch(`${httpBase}/api/auth/status`, {
      signal: AbortSignal.timeout(5000),
      dispatcher: proxyAgent,
    } as Parameters<typeof undicicFetch>[1]);
    const ms = Date.now() - httpStart;
    if (res.ok) {
      console.log(`${boldGreen('ok')} ${dim(`${res.status} (${ms}ms)`)}`);
    } else {
      console.log(`${boldRed('fail')} ${dim(`HTTP ${res.status} (${ms}ms)`)}`);
      allOk = false;
    }
  } catch (err) {
    const ms = Date.now() - httpStart;
    console.log(`${boldRed('fail')} ${dim(`${(err as Error).message} (${ms}ms)`)}`);
    allOk = false;
  }

  // ── 2. SSE channel (HTTP transport) ──────────────────────────────────────
  process.stdout.write(`  SSE   ${dim(httpBase + '/api/channel')} … `);
  const sseStart = Date.now();
  try {
    const { createHttpTransportClient } = await import('../../infrastructure/transport/httpTransportClient.js');
    const client = createHttpTransportClient();
    await client.connect(httpBase);
    const ms = Date.now() - sseStart;
    client.close();
    console.log(`${boldGreen('ok')} ${dim(`channel + stream (${ms}ms)`)}`);
  } catch (err) {
    const ms = Date.now() - sseStart;
    console.log(`${boldRed('fail')} ${dim(`${(err as Error).message} (${ms}ms)`)}`);
    allOk = false;
  }

  // ── 3. WebSocket handshake (informational) ────────────────────────────────
  if (isWsUrl) {
    process.stdout.write(`  WS    ${dim(cloudUrl)} … `);
    const wsStart = Date.now();
    const wsResult = await new Promise<'ok' | string>((resolve) => {
      const ws = new UndiciWebSocket(cloudUrl, { dispatcher: proxyAgent } as ConstructorParameters<typeof UndiciWebSocket>[1]);
      const timeout = setTimeout(() => { ws.close(); resolve('timeout after 5000ms'); }, 5000);
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve('ok');
      };
      ws.onerror = (event) => {
        clearTimeout(timeout);
        resolve((event as ErrorEvent).message || 'connection failed');
      };
    });
    const ms = Date.now() - wsStart;
    if (wsResult === 'ok') {
      console.log(`${boldGreen('ok')} ${dim(`connected (${ms}ms)`)}`);
    } else {
      // WS failure is informational only — the HTTP transport is the fallback
      console.log(`${yellow('warn')} ${dim(`${wsResult} (${ms}ms) — use --cloud ${httpBase} for HTTP transport`)}`);
    }
  }

  console.log('');
  if (allOk) {
    console.log(boldGreen('  All checks passed — server is reachable.'));
  } else {
    console.log(boldRed('  Some checks failed — see above.'));
    process.exit(1);
  }
  console.log('');
}
