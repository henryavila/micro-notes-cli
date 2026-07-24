import { spawnSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const MN_BIN = join(root, 'bin/mn');
export const MN_UI = join(root, 'tui/bin/mn-ui.mjs');
export const REPO_ROOT = root;

export interface SpawnResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Run `bin/mn …` with a private MN_FILE / config dir. Real process, no mocks. */
export function runMn(
  args: string[],
  env: {
    MN_FILE: string;
    MN_CONFIG_DIR?: string;
    MN_UI?: string;
    [k: string]: string | undefined;
  },
): SpawnResult {
  const r = spawnSync(MN_BIN, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      MN_COLOR: '0',
      MN_ASCII: '1',
      // Tests historically exercise ai-dev statuses (coding, review-*); override with env.MN_PACK.
      MN_PACK: env.MN_PACK ?? 'ai-dev',
      PATH: process.env.PATH,
      ...env,
    },
    cwd: root,
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

export interface LiveSpawn {
  child: ChildProcessWithoutNullStreams;
  getOutput: () => { stdout: string; stderr: string; combined: string };
  kill: () => Promise<SpawnResult>;
}

/** Spawn a long-lived process; kill after timeout or on demand. */
export function spawnLive(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
): LiveSpawn {
  const child = spawn(command, args, {
    env: { ...process.env, ...env, PATH: process.env.PATH },
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString('utf8');
  });
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString('utf8');
  });

  return {
    child,
    getOutput: () => ({ stdout, stderr, combined: stdout + stderr }),
    kill: () =>
      new Promise((resolve) => {
        const done = (status: number | null, signal: NodeJS.Signals | null) => {
          resolve({ status, signal, stdout, stderr });
        };
        if (child.exitCode !== null) {
          done(child.exitCode, child.signalCode);
          return;
        }
        child.once('close', (code, signal) => done(code, signal));
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL');
        }, 500);
      }),
  };
}

/** Patterns that mean the TUI crashed the way dual-React does. */
export const TUI_CRASH_RE =
  /Invalid hook call|Cannot read properties of null \(reading 'useState'\)|Cannot read properties of null \(reading 'use[A-Z]/;

export function assertNoTuiCrash(combined: string): void {
  if (TUI_CRASH_RE.test(combined)) {
    throw new Error(`TUI crash signature in output:\n${combined.slice(0, 2000)}`);
  }
}
