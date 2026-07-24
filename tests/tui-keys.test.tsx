/**
 * Key flows → on-disk side effects (observable). Not tautological state checks.
 * Serialized keystrokes: ink's useInput only handles one chunk per readable cycle.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup as inkCleanup } from 'ink-testing-library';
import { readFileSync } from 'node:fs';
import { App } from '../tui/src/App.js';
import { parseNote } from '../tui/src/note.js';
import { resetStatusCatalogCache } from '../tui/src/status-catalog.js';
import { cleanup, makeTempDir, writeTempNote } from './helpers/tempNote.js';

process.env.MN_PACK = 'ai-dev';
process.env.MN_STATUSES_TEST_BUST = '1';
resetStatusCatalogCache();

async function waitFor(
  pred: () => boolean,
  { timeout = 3000, interval = 30 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

async function typeKeys(
  stdin: { write: (s: string) => void },
  keys: string[],
  gapMs = 25,
): Promise<void> {
  for (const k of keys) {
    stdin.write(k);
    await new Promise((r) => setTimeout(r, gapMs));
  }
}

describe('TUI keys write the note file', () => {
  let dir: string;
  let path: string;
  let prev: string | undefined;

  beforeEach(() => {
    dir = makeTempDir('mn-keys-');
    prev = process.env.MN_FILE;
    const w = writeTempNote(dir, {
      thread: 'before',
      now: 'now-before',
      status: 'idle',
      todo: [
        { text: 'alpha', done: false },
        { text: 'beta', done: false },
      ],
    });
    path = w.path;
    process.env.MN_FILE = path;
  });

  afterEach(() => {
    inkCleanup();
    if (prev === undefined) delete process.env.MN_FILE;
    else process.env.MN_FILE = prev;
    cleanup(dir);
  });

  it('space toggles the focused validate item on disk', async () => {
    const { stdin, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      await typeKeys(stdin, [' ']);
      await waitFor(() => {
        const n = parseNote(readFileSync(path, 'utf8'));
        return n.todo.some((v) => v.text === 'alpha' && v.done);
      });
      const n = parseNote(readFileSync(path, 'utf8'));
      expect(n.todo.find((v) => v.text === 'alpha')?.done).toBe(true);
      expect(n.todo.find((v) => v.text === 'beta')?.done).toBe(false);
    } finally {
      unmount();
    }
  });

  it('s + j×5 + enter sets status coding on disk (ai-dev pack)', async () => {
    const { stdin, lastFrame, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      // order: idle, designing, await-design, planning, review-plan, coding(5)
      await typeKeys(stdin, ['s', 'j', 'j', 'j', 'j', 'j', '\r'], 35);
      await waitFor(() => parseNote(readFileSync(path, 'utf8')).status === 'coding');
      expect(parseNote(readFileSync(path, 'utf8')).status).toBe('coding');
      expect(lastFrame() ?? '').toMatch(/coding/i);
    } finally {
      unmount();
    }
  });

  it('s → blocked opens wait input; enter saves reason on disk', async () => {
    const { stdin, lastFrame, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      // blocked is index 7 in ai-dev order → 7× j
      await typeKeys(stdin, ['s', 'j', 'j', 'j', 'j', 'j', 'j', 'j', '\r'], 30);
      await waitFor(() => /blocked on/i.test(lastFrame() ?? ''));
      await typeKeys(stdin, 'cutover vs dual-write'.split(''), 15);
      await typeKeys(stdin, ['\r'], 40);
      await waitFor(() => {
        const n = parseNote(readFileSync(path, 'utf8'));
        return n.status === 'blocked' && n.wait === 'cutover vs dual-write';
      });
      const n = parseNote(readFileSync(path, 'utf8'));
      expect(n.status).toBe('blocked');
      expect(n.wait).toBe('cutover vs dual-write');
      expect(lastFrame() ?? '').toMatch(/cutover vs dual-write/);
    } finally {
      unmount();
    }
  });

  it('t + edit + enter updates thread on disk', async () => {
    const { stdin, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      await typeKeys(stdin, ['t'], 40);
      // erase "before" then type new label
      await typeKeys(stdin, Array(8).fill('\x7f') as string[], 20);
      await typeKeys(stdin, 'from-keys'.split(''), 20);
      await typeKeys(stdin, ['\r'], 40);
      await waitFor(() => parseNote(readFileSync(path, 'utf8')).thread === 'from-keys');
      expect(parseNote(readFileSync(path, 'utf8')).thread).toBe('from-keys');
    } finally {
      unmount();
    }
  });

  it('v opens todo input and enter appends a todo item on disk', async () => {
    const { stdin, lastFrame, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      await typeKeys(stdin, ['v'], 40);
      // Dialog title is "todo"; assert the input mode opened.
      await waitFor(() => /todo/i.test(lastFrame() ?? ''));
      await typeKeys(stdin, 'new-todo-item'.split(''), 20);
      await typeKeys(stdin, ['\r'], 40);
      await waitFor(() =>
        parseNote(readFileSync(path, 'utf8')).todo.some((x) => x.text === 'new-todo-item'),
      );
      const n = parseNote(readFileSync(path, 'utf8'));
      expect(n.todo.map((x) => x.text)).toContain('new-todo-item');
      // Prior items preserved
      expect(n.todo.map((x) => x.text)).toEqual(
        expect.arrayContaining(['alpha', 'beta', 'new-todo-item']),
      );
    } finally {
      unmount();
    }
  });

});

describe('TUI init when file is missing', () => {
  let dir: string;
  let prev: string | undefined;

  beforeEach(() => {
    dir = makeTempDir('mn-init-');
    prev = process.env.MN_FILE;
  });

  afterEach(() => {
    inkCleanup();
    if (prev === undefined) delete process.env.MN_FILE;
    else process.env.MN_FILE = prev;
    cleanup(dir);
  });

  it('i creates the note file on disk (observable side effect)', async () => {
    const missing = `${dir}/brand-new.md`;
    process.env.MN_FILE = missing;
    const { notePath } = await import('../tui/src/note.js');
    expect(notePath()).toBe(missing);

    const { stdin, lastFrame, unmount } = render(<App />);
    try {
      // allow ink debug frames to flush
      await new Promise((r) => setTimeout(r, 80));
      const frame = lastFrame() ?? '';
      expect(frame, `banner missing; frame=${JSON.stringify(frame.slice(0, 300))}`).toMatch(
        /no file/i,
      );
      await typeKeys(stdin, ['i'], 50);
      await waitFor(
        () => {
          try {
            return parseNote(readFileSync(missing, 'utf8')).status === 'idle';
          } catch {
            return false;
          }
        },
        { timeout: 2000 },
      );
      const n = parseNote(readFileSync(missing, 'utf8'));
      expect(n.status).toBe('idle');
      expect(n.todo).toEqual([]);
    } finally {
      unmount();
    }
  });
});
