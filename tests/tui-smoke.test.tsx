/**
 * In-process TUI: real App + real note.ts I/O.
 * Asserts note body fields (AND, not OR) so MN_FILE wiring cannot silently fail.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup as inkCleanup } from 'ink-testing-library';
import { ThemeProvider, Header, useTokens } from '@henryavila/blink-tui';
import { Text } from 'ink';
import { App } from '../tui/src/App.js';
import { resetStatusCatalogCache } from '../tui/src/status-catalog.js';
import { cleanup, makeTempDir, writeTempNote } from './helpers/tempNote.js';

process.env.MN_PACK = 'ai-dev';
process.env.MN_STATUSES_TEST_BUST = '1';
resetStatusCatalogCache();

function HookProbe(): React.ReactElement {
  const tokens = useTokens();
  return <Text>{`ok:${tokens.fg}`}</Text>;
}

describe('TUI ThemeProvider (hooks)', () => {
  it('mounts ThemeProvider without dual-React crash', () => {
    const { lastFrame, unmount } = render(
      <ThemeProvider iconSet="unicode" theme="tokyonight">
        <Header title="microNote" subtitle="smoke" />
        <HookProbe />
      </ThemeProvider>,
    );
    try {
      const frame = lastFrame() ?? '';
      expect(frame).toMatch(/microNote/);
      expect(frame).toMatch(/ok:#/);
    } finally {
      unmount();
    }
  });
});

describe('TUI App loads MN_FILE content', () => {
  let dir: string;
  let prev: string | undefined;

  beforeEach(() => {
    dir = makeTempDir('mn-tui-');
    prev = process.env.MN_FILE;
  });

  afterEach(() => {
    inkCleanup();
    if (prev === undefined) delete process.env.MN_FILE;
    else process.env.MN_FILE = prev;
    cleanup(dir);
  });

  it('frame includes thread AND now AND status from disk (not just chrome)', () => {
    const { path } = writeTempNote(dir, {
      thread: 'smoke-thread-unique',
      now: 'writing-e2e-unique',
      status: 'coding',
      
      todo: [{ text: 'val-unique', done: false }],
    });
    process.env.MN_FILE = path;

    const { lastFrame, unmount } = render(<App />);
    try {
      const frame = lastFrame() ?? '';
      expect(frame.length).toBeGreaterThan(0);
      // AND — all must appear. OR would pass on header alone.
      expect(frame).toContain('smoke-thread-unique');
      expect(frame).toContain('writing-e2e-unique');
      expect(frame).toMatch(/coding/i);
      expect(frame).toContain('val-unique');
      // Status pane title carries a glyph mark (◉ coding)
      expect(frame).toMatch(/◉\s*coding/);
      // Footer exposes the todo shortcut (and other primary keys)
      expect(frame).toMatch(/\btodo\b/i);
    } finally {
      unmount();
    }
  });

  it('missing file shows init banner', () => {
    process.env.MN_FILE = `${dir}/does-not-exist.md`;
    const { lastFrame, unmount } = render(<App />);
    try {
      const frame = (lastFrame() ?? '').toLowerCase();
      expect(frame).toMatch(/no file|press i|init/);
    } finally {
      unmount();
    }
  });

  it('long description wraps instead of truncating with ellipsis', () => {
    // Distinct tokens so we can assert the full body is present even when
    // the terminal is narrow (ink-testing-library defaults ~80 cols).
    const head = 'WRAPHEAD_unique_prefix_alpha';
    const tail = 'WRAPTAIL_unique_suffix_omega';
    const mid = 'middle_segment_'.repeat(12);
    const longDesc = `${head} ${mid} ${tail}`;
    const { path } = writeTempNote(dir, {
      thread: 'wrap-thread',
      now: longDesc,
      status: 'coding',
    });
    process.env.MN_FILE = path;

    const { lastFrame, unmount } = render(<App />);
    try {
      const frame = lastFrame() ?? '';
      expect(frame).toContain(head);
      expect(frame).toContain(tail);
      // Truncation would inject an ellipsis and drop the tail end of the line.
      expect(frame).not.toMatch(/WRAPHEAD[^\n]*…/);
    } finally {
      unmount();
    }
  });

  it('long user fields (thread/now/wait/todo/finished) wrap fully — no ellipsis cut-off', () => {
    const long = (tag: string) =>
      `${tag}_HEAD_${'x'.repeat(90)}_${tag}_TAIL_unique`;
    const thread = long('THREAD');
    const now = long('NOW');
    const wait = long('WAIT');
    const todoItem = long('TODO');
    const finished = long('FINISHED');
    const { path } = writeTempNote(dir, {
      thread,
      now,
      wait,
      status: 'blocked',
      todo: [{ text: todoItem, done: false }],
      finished: [finished],
    });
    process.env.MN_FILE = path;

    const { lastFrame, unmount } = render(<App />);
    try {
      const frame = lastFrame() ?? '';
      for (const tag of ['THREAD', 'NOW', 'WAIT', 'TODO', 'FINISHED']) {
        expect(frame).toContain(`${tag}_HEAD_`);
        expect(frame).toContain(`${tag}_TAIL_unique`);
        expect(frame).not.toMatch(new RegExp(`${tag}_HEAD_[^\\n]*…`));
      }
      // SCHEMA v0.1: Human + Description removed from surface.
      expect(frame.toLowerCase()).not.toMatch(/\bhuman\b/);
      expect(frame.toLowerCase()).not.toMatch(/\bdescription\b/);
    } finally {
      unmount();
    }
  });

  it('input dialog keeps full long draft visible while editing (wraps, no ellipsis)', async () => {
    // Empty thread so we type a long draft without backspacing first.
    const { path } = writeTempNote(dir, {
      thread: '',
      now: 'edit-now',
      status: 'coding',
    });
    process.env.MN_FILE = path;

    const { lastFrame, stdin, unmount } = render(<App />);
    try {
      await new Promise((r) => setTimeout(r, 60));
      stdin.write('t');
      await new Promise((r) => setTimeout(r, 40));
      // Dialog / field title is "thread" — single frame (no nested second title pane).
      const opened = lastFrame() ?? '';
      expect(opened.toLowerCase()).toMatch(/thread/);
      // Exactly one titled border for the field (Dialog only — not Dialog+Input double).
      const titleHits = (opened.match(/thread/gi) ?? []).length;
      expect(titleHits).toBeLessThanOrEqual(2); // title in border + maybe actions area context

      const head = 'INHEAD_unique';
      const tail = 'INTAIL_unique';
      const draft = `${head}${'m'.repeat(100)}${tail}`;
      for (const ch of draft) {
        stdin.write(ch);
        await new Promise((r) => setTimeout(r, 2));
      }
      await new Promise((r) => setTimeout(r, 50));
      const frame = lastFrame() ?? '';
      expect(frame).toContain(head);
      expect(frame).toContain(tail);
      // Multi-line wrap: tail is on a later visual row, not clipped with …
      expect(frame).not.toMatch(/INHEAD_unique[^\n]*…/);
      // Confirm content spans more than one content row (wrap happened).
      expect(frame.split('\n').filter((l) => l.includes('m') || l.includes(head) || l.includes(tail)).length).toBeGreaterThan(1);
    } finally {
      unmount();
    }
  });
});
