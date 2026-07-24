/**
 * True process e2e: spawn node tui/bin/mn-ui.mjs and bin/mn ui.
 * Catches dual-React / missing launcher / tsx resolution — not mockable away.
 *
 * Content assertions on ink frames are flaky without a PTY; we assert:
 * 1) process stays up for a beat (does not immediate-exit with crash)
 * 2) no dual-React / useState null signatures on stdout+stderr
 * 3) launcher path works for `mn ui`
 * 4) when stdout is non-empty, note fields appear (bonus, TTY-dependent)
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { cleanup, makeTempDir, writeTempNote } from '../helpers/tempNote.js';
import {
  MN_BIN,
  MN_UI,
  REPO_ROOT,
  spawnLive,
  assertNoTuiCrash,
  runMn,
} from '../helpers/spawnMn.js';

const SETTLE_MS = 1200;

describe('e2e: real process boot', () => {
  let dir: string;
  let MN_FILE: string;

  beforeEach(() => {
    dir = makeTempDir('mn-e2e-');
    const w = writeTempNote(dir, {
      thread: 'e2e-thread-xyz',
      description: 'e2e-desc',
      now: 'e2e-now-xyz',
      status: 'coding',
      todo: [{ text: 'e2e-val', done: false }],
    });
    MN_FILE = w.path;
  });

  afterEach(() => cleanup(dir));

  it('node tui/bin/mn-ui.mjs boots without dual-React crash', async () => {
    expect(existsSync(MN_UI)).toBe(true);
    const live = spawnLive(process.execPath, [MN_UI], {
      MN_FILE,
      FORCE_COLOR: '0',
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    // still running (or produced output) — not an instant hard crash
    const mid = live.getOutput();
    assertNoTuiCrash(mid.combined);
    const result = await live.kill();
    assertNoTuiCrash(result.stdout + result.stderr);
    // If the terminal produced any card text, require unique note fields
    const out = result.stdout;
    if (out.length > 40) {
      expect(out).toContain('e2e-thread-xyz');
      expect(out).toContain('e2e-now-xyz');
    }
    // process must not have died of an uncaught exception before settle
    // (SIGTERM after settle is expected → status null or non-zero is fine)
    expect(mid.combined).not.toMatch(/TUI launcher not found|Cannot find module/);
  }, 15_000);

  it('mn ui finds launcher and does not emit hook errors', async () => {
    const live = spawnLive(MN_BIN, ['ui'], {
      MN_FILE,
      MN_ROOT: REPO_ROOT,
      MN_CONFIG_DIR: `${dir}/cfg`,
      FORCE_COLOR: '0',
    });
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const mid = live.getOutput();
    assertNoTuiCrash(mid.combined);
    expect(mid.combined).not.toMatch(/TUI launcher not found/);
    expect(mid.combined).not.toMatch(/npm install failed/);
    const result = await live.kill();
    assertNoTuiCrash(result.stdout + result.stderr);
    if (result.stdout.length > 40) {
      expect(result.stdout).toContain('e2e-thread-xyz');
    }
  }, 15_000);

  it('mn show still works as non-TUI control (same MN_FILE)', () => {
    const r = runMn(['show'], {
      MN_FILE,
      MN_CONFIG_DIR: `${dir}/cfg`,
      MN_UI: '0',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('e2e-thread-xyz');
    expect(r.stdout).toContain('e2e-now-xyz');
    expect(r.stdout).toMatch(/coding/i);
  });
});
