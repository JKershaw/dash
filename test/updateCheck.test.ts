import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isNewerVersion, checkForUpdate } from '../src/cli/updateCheck.js';

describe('isNewerVersion', () => {
  it('returns true when latest is newer (minor)', () => {
    assert.equal(isNewerVersion('2.2.0', '2.1.0'), true);
  });

  it('returns true when latest is newer (major)', () => {
    assert.equal(isNewerVersion('3.0.0', '2.9.9'), true);
  });

  it('returns true when latest is newer (patch)', () => {
    assert.equal(isNewerVersion('2.1.1', '2.1.0'), true);
  });

  it('returns false when versions are equal', () => {
    assert.equal(isNewerVersion('2.1.0', '2.1.0'), false);
  });

  it('returns false when latest is older', () => {
    assert.equal(isNewerVersion('2.0.0', '2.1.0'), false);
  });

  it('returns false when latest is older (major)', () => {
    assert.equal(isNewerVersion('1.9.9', '2.0.0'), false);
  });
});

describe('checkForUpdate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dash-update-check-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prints notice when cache has a newer version', () => {
    const cacheFile = join(tmpDir, 'update-check.json');
    writeFileSync(cacheFile, JSON.stringify({
      lastCheckedAt: new Date().toISOString(),
      latestVersion: '99.0.0',
    }));

    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logged.push(args.join(' ')); };
    try {
      checkForUpdate({ cacheDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    assert.ok(logged.some(line => line.includes('Update available')));
    assert.ok(logged.some(line => line.includes('99.0.0')));
  });

  it('does not print notice when already on latest', () => {
    const cacheFile = join(tmpDir, 'update-check.json');
    writeFileSync(cacheFile, JSON.stringify({
      lastCheckedAt: new Date().toISOString(),
      latestVersion: '0.0.1', // older than current
    }));

    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logged.push(args.join(' ')); };
    try {
      checkForUpdate({ cacheDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    assert.ok(!logged.some(line => line.includes('Update available')));
  });

  it('does not print notice when cache is missing', () => {
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logged.push(args.join(' ')); };
    try {
      checkForUpdate({ cacheDir: tmpDir });
    } finally {
      console.log = origLog;
    }

    assert.ok(!logged.some(line => line.includes('Update available')));
  });

  it('does not crash on malformed cache file', () => {
    const cacheFile = join(tmpDir, 'update-check.json');
    writeFileSync(cacheFile, 'not json at all {{{');

    // Should not throw
    checkForUpdate({ cacheDir: tmpDir });
  });

  it('does not crash when cache dir does not exist', () => {
    const nonexistent = join(tmpDir, 'does', 'not', 'exist');
    // Should not throw
    checkForUpdate({ cacheDir: nonexistent });
  });

  it('does not crash on cache with wrong shape', () => {
    const cacheFile = join(tmpDir, 'update-check.json');
    writeFileSync(cacheFile, JSON.stringify({ foo: 'bar' }));

    // Should not throw
    checkForUpdate({ cacheDir: tmpDir });
  });
});
