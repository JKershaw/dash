import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { bold, boldCyan, boldGreen, boldRed, dim } from '../colors.js';
import { log, logError } from '../display.js';

const CONFIG_DIR = path.join(homedir(), '.config', 'dash-build');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');

interface Credentials {
  sessionId: string;
  serverUrl: string;
  savedAt: string;
}

export function getStoredCredentials(): Credentials | null {
  try {
    const data = readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { platform } = process;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url]);
}

export async function commandLogin(flags: Record<string, string>): Promise<void> {
  const { cliConfig } = await import('../cliConfig.js');
  const serverUrl = flags.cloud || flags.server || cliConfig.getDefaultServerUrl();

  log(`\n  ${boldCyan(`${cliConfig.productName} Login`)}\n`);
  log(`  Server: ${dim(serverUrl)}\n`);

  // Step 1: Request a device code
  let deviceCode: string;
  let userCode: string;
  try {
    const res = await fetch(`${serverUrl}/api/auth/device`, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    const data = await res.json() as { device_code: string; user_code: string };
    deviceCode = data.device_code;
    userCode = data.user_code;
  } catch (err) {
    logError(`Failed to connect to server at ${serverUrl}`);
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step 2: Open browser
  const authUrl = `${serverUrl}/app/settings`;
  log(`  Your device code: ${bold(userCode)}`);
  log(`  Opening browser to complete authentication...`);
  log(`  ${dim(authUrl)}\n`);
  log(`  After authenticating in the browser, run:`);
  log(`  ${boldCyan(`POST ${serverUrl}/api/auth/device/${deviceCode}/complete`)}`);
  log(`  with your sessionId to complete the login.\n`);

  await openBrowser(authUrl);

  // Step 3: Poll for completion
  log(`  Waiting for authentication...`);
  const maxAttempts = 150; // 5 minutes at 2s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const res = await fetch(`${serverUrl}/api/auth/device/${deviceCode}`);
      const data = await res.json() as { status: string; sessionId?: string };

      if (data.status === 'complete' && data.sessionId) {
        saveCredentials({
          sessionId: data.sessionId,
          serverUrl,
          savedAt: new Date().toISOString(),
        });

        log(`\n  ${boldGreen('Login successful!')}`);
        log(`  Credentials saved to ${dim(CREDENTIALS_FILE)}\n`);
        return;
      }

      if (data.status === 'expired') {
        logError('Device code expired. Please try again.');
        process.exit(1);
      }

      // Still pending — continue polling
      if (i > 0 && i % 15 === 0) {
        log(`  ${dim('Still waiting... complete authentication in your browser.')}`);
      }
    } catch {
      // Network error — retry
    }
  }

  logError('Login timed out. Please try again.');
  process.exit(1);
}
