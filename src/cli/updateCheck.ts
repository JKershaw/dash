/**
 * CLI update check — prints a notice when a newer version of @jkershaw/dash
 * is available on npm. Never blocks startup; fetches are fire-and-forget.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { ANSI, yellow, dim, cyan } from './colors.js';
import { log } from './display.js';

const CONFIG_DIR = join(homedir(), '.config', 'dash-build');
const DEFAULT_CACHE_FILE = join(CONFIG_DIR, 'update-check.json');
const REGISTRY_URL = 'https://registry.npmjs.org/@jkershaw/dash/latest';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const FETCH_TIMEOUT_MS = 500;

interface UpdateCache {
  lastCheckedAt: string;
  latestVersion: string;
}

function getLocalVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function readCache(cacheFile: string): UpdateCache | null {
  try {
    const data = readFileSync(cacheFile, 'utf-8');
    const parsed = JSON.parse(data);
    if (typeof parsed.lastCheckedAt === 'string' && typeof parsed.latestVersion === 'string') {
      return parsed as UpdateCache;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, cache: UpdateCache): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  } catch {
    // Silently ignore write failures
  }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function refreshCache(cacheFile: string): void {
  (async () => {
    const res = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = await res.json() as { version?: string };
    if (data.version) {
      writeCache(cacheFile, {
        lastCheckedAt: new Date().toISOString(),
        latestVersion: data.version,
      });
    }
  })().catch(() => {
    // Silently ignore network errors, timeouts, JSON parse failures
  });
}

export function checkForUpdate(opts?: { cacheDir?: string }): void {
  try {
    const cacheFile = opts?.cacheDir
      ? join(opts.cacheDir, 'update-check.json')
      : DEFAULT_CACHE_FILE;

    const currentVersion = getLocalVersion();
    const cache = readCache(cacheFile);

    // Show notice if cache says there's an update
    if (cache && isNewerVersion(cache.latestVersion, currentVersion)) {
      log(
        `${yellow('Update available:')} ${dim(currentVersion)} ${dim('\u2192')} ${ANSI.boldYellow}${cache.latestVersion}${ANSI.reset}` +
        ` ${dim('\u2014 run')} ${cyan('npx @jkershaw/dash@latest')}`,
      );
    }

    // Refresh cache in background if stale or missing
    const isStale = !cache ||
      (Date.now() - new Date(cache.lastCheckedAt).getTime()) > CHECK_INTERVAL_MS;
    if (isStale) {
      refreshCache(cacheFile);
    }
  } catch {
    // Never crash the CLI for an update check failure
  }
}
