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
import { cleanup, makeTempDir, writeTempNote } from './helpers/tempNote.js';

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
      description: 'desc-unique',
      validate: [{ text: 'val-unique', done: false }],
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
      now: 'wrap-now',
      status: 'coding',
      description: longDesc,
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
});
