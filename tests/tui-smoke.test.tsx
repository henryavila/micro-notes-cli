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
      status: 'working',
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
      expect(frame).toMatch(/working/i);
      expect(frame).toContain('val-unique');
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
});
