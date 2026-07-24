import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { existsSync, watch } from 'node:fs';
import { dirname } from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
import {
  ThemeProvider,
  detectIconSet,
  Header,
  Pane,
  Footer,
  Dialog,
  Banner,
  ChoicePicker,
  Cursor,
  cellWidth,
  useTokens,
  useStdoutDimensions,
  type ChoiceItem,
  type IconSet,
} from '@henryavila/blink-tui';
import {
  type MicroNote,
  blockedNeedsWait,
  clearActivity,
  clearAllTodos,
  clearDoneTodos,
  clearSoft,
  emptyNote,
  initNoteFile,
  notePath,
  openTodoCount,
  readNoteFile,
  removeTodo,
  statusIds,
  statusRequiresWait,
  statusToIntent,
  statusTitle,
  withStatus,
  writeNoteFile,
} from './note.js';
import {
  getConfiguredPackId,
  listBuiltinPacks,
  resetStatusCatalogCache,
  setActivePack,
  type PackMeta,
} from './status-catalog.js';

type Mode =
  | { kind: 'main' }
  | { kind: 'input'; field: InputField; draft: string; cursor: number }
  | { kind: 'status'; focus: number }
  | { kind: 'settings'; focus: number }
  | { kind: 'clear'; focus: number }
  | { kind: 'clear-confirm' }
  | { kind: 'help' };

/** Clear menu options (id used as ChoicePicker id). */
const CLEAR_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'done', label: 'done todos', hint: 'remove checked items only' },
  { id: 'todos', label: 'all todos', hint: 'reset checklist (mn clear-todo)' },
  { id: 'activity', label: 'now + wait', hint: 'clear activity / block reason' },
  { id: 'everything', label: 'everything', hint: 'keep thread · reset rest' },
  { id: 'cancel', label: 'cancel', hint: 'go back' },
];

// SCHEMA v0.1 surface: Thread · Description · Now · Wait · Todo · Finished
// (no Human — see SCHEMA-v0.1.md)
type InputField = 'thread' | 'description' | 'now' | 'wait' | 'finished' | 'todo';

const FIELD_TITLE: Record<InputField, string> = {
  thread: 'thread',
  description: 'description',
  now: 'now',
  wait: 'blocked on',
  finished: 'finished',
  todo: 'todo',
};

function shortPath(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? p;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function bodyLines(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t.split('\n');
}

/** Map a JS string cursor index onto a wrapped (row, col-in-row) for the caret. */
function cursorOnWrapped(
  value: string,
  cursor: number,
  width: number,
): { rows: string[]; row: number; col: number } {
  const w = Math.max(1, width);
  const caret = Math.max(0, Math.min(value.length, Math.floor(cursor)));
  const rows: string[] = [];
  let row = 0;
  let col = 0;
  let found = caret === 0;

  if (value.length === 0) {
    return { rows: [''], row: 0, col: 0 };
  }

  let cur = '';
  let curW = 0;
  let i = 0;
  while (i < value.length) {
    if (value[i] === '\n') {
      if (!found && i === caret) {
        row = rows.length;
        col = cur.length;
        found = true;
      }
      rows.push(cur);
      cur = '';
      curW = 0;
      i += 1;
      if (!found && i === caret) {
        row = rows.length;
        col = 0;
        found = true;
      }
      continue;
    }
    const cp = value.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const cw = Math.max(1, cellWidth(ch));
    if (curW + cw > w && cur.length > 0) {
      rows.push(cur);
      cur = '';
      curW = 0;
    }
    if (!found && i === caret) {
      row = rows.length;
      col = cur.length;
      found = true;
    }
    cur += ch;
    curW += cw;
    i += ch.length;
  }
  rows.push(cur);
  if (!found) {
    // caret at end (or past last char)
    row = rows.length - 1;
    col = rows[row]!.length;
  }
  return { rows: rows.length > 0 ? rows : [''], row, col };
}

/**
 * Multi-line presentational field for use *inside* a blink {@link Dialog}.
 *
 * Frameless on purpose: Dialog already draws the only Pane. Nesting another
 * Pane (like blink's single-line Input) double-titles and shrinks the content
 * box — easy to mis-measure and overflow the border.
 *
 * `width` must be the **content cells** available inside the Dialog body
 * (outer width − outer borders − Pane padding − Dialog padding). When focused,
 * one cell is reserved for the caret so a full-width line never spills.
 */
function WrappingInput({
  value,
  cursor,
  focused,
  placeholder,
  width,
}: {
  value: string;
  cursor: number;
  focused?: boolean;
  placeholder?: string;
  /** Content width in cells (must fit inside Dialog body — not the outer width). */
  width: number;
}): React.ReactElement {
  const tokens = useTokens();
  const empty = value.length === 0;
  // Reserve 1 cell for the blink caret while focused so before+caret never exceed `width`.
  const wrapW = Math.max(1, focused ? width - 1 : width);
  const { rows, row: cRow, col: cCol } = cursorOnWrapped(value, cursor, wrapW);

  return (
    <Box flexDirection="column" width={width} overflow="hidden">
      {empty && !focused ? (
        <Text color={tokens.fgDisabled} wrap="truncate-end">
          {placeholder ?? ''}
        </Text>
      ) : empty && focused ? (
        <Box flexDirection="row" width={width} overflow="hidden">
          <Cursor active />
          {placeholder ? (
            <Text color={tokens.fgDisabled} wrap="truncate-end">
              {placeholder}
            </Text>
          ) : null}
        </Box>
      ) : (
        rows.map((line, ri) => {
          if (!focused || ri !== cRow) {
            return (
              <Box key={ri} width={width} overflow="hidden">
                <Text color={tokens.fg} wrap="truncate-end">
                  {line.length === 0 ? ' ' : line}
                </Text>
              </Box>
            );
          }
          const before = line.slice(0, cCol);
          const after = line.slice(cCol);
          return (
            <Box key={ri} flexDirection="row" width={width} overflow="hidden">
              <Text color={tokens.fg}>{before}</Text>
              <Cursor active />
              <Text color={tokens.fg} wrap="truncate-end">
                {after}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}

/** Todo checklist rows — wrap long labels (blink List truncates by design). */
function TodoList({
  items,
  focusIndex,
}: {
  items: Array<{ text: string; done: boolean }>;
  focusIndex: number;
}): React.ReactElement {
  const tokens = useTokens();
  return (
    <Box flexDirection="column">
      {items.map((v, i) => {
        const focused = i === focusIndex;
        const caret = focused ? '►' : ' ';
        const mark = v.done ? '☑' : '☐';
        const labelColor = v.done ? tokens.fgDim : tokens.fg;
        return (
          <Box key={i} flexDirection="row" marginTop={i === 0 ? 0 : 0}>
            <Text color={focused ? tokens.accent : tokens.fgDim} wrap="wrap">
              {caret} {mark}{' '}
            </Text>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text color={labelColor} wrap="wrap" dimColor={v.done}>
                {v.text}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Short block: icon + color label as visual separator.
 * Hidden when empty — unless `required` (Thread): always shown so the card is never blank.
 *
 * Optional `mutedLines` render in the same
 * indented body as the main lines — no extra gap, same relation as body ↔ title.
 */
function ShortSection({
  icon,
  label,
  color,
  bodyColor,
  lines,
  mutedLines,
  mutedColor,
  first,
  required,
  emptyHint,
  hintColor,
}: {
  icon: string;
  label: string;
  color: string;
  bodyColor?: string;
  lines: string[];
  /** Secondary prose under the main body (same indent, no gap). */
  mutedLines?: string[];
  mutedColor?: string;
  first?: boolean;
  /** Always render (used for Thread). */
  required?: boolean;
  /** Shown in place of body when required and empty. */
  emptyHint?: string;
  hintColor?: string;
}): React.ReactElement | null {
  const muted = mutedLines?.filter((l) => l.length > 0) ?? [];
  if (lines.length === 0 && muted.length === 0 && !required) return null;
  return (
    <Box flexDirection="column" marginTop={first ? 0 : 1}>
      <Text>
        <Text color={color}>
          {icon} {label}
        </Text>
      </Text>
      <Box flexDirection="column" paddingLeft={2}>
        {lines.length > 0
          ? lines.map((l, i) => (
              <Text key={`${label}-${i}`} color={bodyColor ?? color} wrap="wrap">
                {l}
              </Text>
            ))
          : emptyHint
            ? [
                <Text key={`${label}-hint`} color={hintColor ?? color} dimColor wrap="wrap">
                  {emptyHint}
                </Text>,
              ]
            : null}
        {muted.map((l, i) => (
          <Text key={`${label}-muted-${i}`} color={mutedColor} dimColor wrap="wrap">
            {l}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function AppInner({ path }: { path: string }): React.ReactElement {
  const { exit } = useApp();
  const tokens = useTokens();
  const { columns, rows: termRows } = useStdoutDimensions();
  // Ink tip from blink: leave one spare line to avoid full-screen flicker.
  const rows = Math.max(12, (termRows || 24) - 1);
  const [note, setNote] = useState<MicroNote>(() => readNoteFile(path) ?? emptyNote());
  const [mode, setMode] = useState<Mode>({ kind: 'main' });
  const [focusTodo, setFocusTodo] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [missing, setMissing] = useState(() => !existsSync(path));
  /** Bumps when pack changes so statusIds()/picker re-read the catalog. */
  const [packEpoch, setPackEpoch] = useState(0);
  const writing = useRef(false);

  const reload = useCallback(() => {
    if (writing.current) return;
    const n = readNoteFile(path);
    if (!n) {
      setMissing(true);
      setNote(emptyNote());
      return;
    }
    setMissing(false);
    setNote(n);
  }, [path]);

  // Watch the file when present; also watch the parent dir so create/rename is seen.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watchers: Array<ReturnType<typeof watch>> = [];
    const bounce = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => reload(), 80);
    };
    try {
      const dir = dirname(path);
      if (existsSync(dir)) watchers.push(watch(dir, bounce));
      if (existsSync(path)) watchers.push(watch(path, bounce));
    } catch {
      /* ignore */
    }
    return () => {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    };
  }, [path, reload]);

  const save = useCallback(
    (next: MicroNote, flashMsg = 'saved') => {
      writing.current = true;
      try {
        writeNoteFile(path, next);
        const n = readNoteFile(path);
        if (n) {
          setNote(n);
          // keep todo focus in range after mutations
          setFocusTodo((i) => Math.min(i, Math.max(0, n.todo.length - 1)));
        }
        setMissing(false);
        setFlash(flashMsg);
        setTimeout(() => setFlash(null), 900);
      } finally {
        setTimeout(() => {
          writing.current = false;
        }, 120);
      }
    },
    [path],
  );

  const applyClear = useCallback(
    (id: string) => {
      switch (id) {
        case 'done':
          save(clearDoneTodos(note), 'cleared done');
          setMode({ kind: 'main' });
          break;
        case 'todos':
          save(clearAllTodos(note), 'cleared todos');
          setMode({ kind: 'main' });
          break;
        case 'activity':
          save(clearActivity(note), 'cleared now/wait');
          setMode({ kind: 'main' });
          break;
        case 'everything':
          setMode({ kind: 'clear-confirm' });
          break;
        case 'cancel':
        default:
          setMode({ kind: 'main' });
          break;
      }
    },
    [note, save],
  );

  const focusTodoIdx = Math.min(
    focusTodo,
    Math.max(0, note.todo.length - 1),
  );

  const statuses = useMemo(() => statusIds(), [packEpoch]);
  const statusChoices: ChoiceItem[] = useMemo(
    () =>
      statuses.map((s) => ({
        id: s,
        label: statusTitle(s),
        state: statusToIntent(s),
      })),
    [statuses],
  );
  const packs: PackMeta[] = useMemo(() => listBuiltinPacks(), [packEpoch]);
  const activePackId = useMemo(() => getConfiguredPackId(), [packEpoch]);

  const applyInput = (field: InputField, value: string) => {
    const next: MicroNote = { ...note, todo: [...note.todo], finished: [...note.finished] };
    switch (field) {
      case 'thread':
        next.thread = value.trim();
        break;
      case 'description':
        next.description = value.trim();
        break;
      case 'now':
        next.now = value.trim();
        break;
      case 'wait': {
        const w = value.trim();
        // Wait required while status requiresWait; empty is refused.
        if (statusRequiresWait(String(next.status)) && !w) {
          setFlash('blocked: set wait');
          setTimeout(() => setFlash(null), 1200);
          return;
        }
        next.wait = w;
        break;
      }
      case 'finished':
        if (value.trim()) next.finished = [...note.finished, value.trim()];
        break;
      case 'todo':
        if (value.trim()) next.todo = [...note.todo, { text: value.trim(), done: false }];
        break;
    }
    save(next);
    setMode({ kind: 'main' });
  };

  const openInput = (field: InputField, initial = '') => {
    setMode({ kind: 'input', field, draft: initial, cursor: initial.length });
  };

  useInput((input, key) => {
    if (mode.kind === 'help') {
      if (key.escape || input === 'q' || input === '?') setMode({ kind: 'main' });
      return;
    }

    if (mode.kind === 'clear-confirm') {
      if (key.escape || input === 'q' || input === 'n') {
        setMode({ kind: 'clear', focus: 3 });
        return;
      }
      if (key.return || input === 'y') {
        save(clearSoft(note), 'cleared all');
        setMode({ kind: 'main' });
      }
      return;
    }

    if (mode.kind === 'clear') {
      if (key.escape || input === 'q' || input === 'c') {
        setMode({ kind: 'main' });
        return;
      }
      if (key.upArrow || input === 'k') {
        setMode({ kind: 'clear', focus: Math.max(0, mode.focus - 1) });
        return;
      }
      if (key.downArrow || input === 'j') {
        setMode({
          kind: 'clear',
          focus: Math.min(CLEAR_OPTIONS.length - 1, mode.focus + 1),
        });
        return;
      }
      if (key.return) {
        applyClear(CLEAR_OPTIONS[mode.focus]?.id ?? 'cancel');
      }
      return;
    }

    if (mode.kind === 'settings') {
      if (key.escape || input === 'q' || input === ',') {
        setMode({ kind: 'main' });
        return;
      }
      if (key.upArrow || input === 'k') {
        setMode({ kind: 'settings', focus: Math.max(0, mode.focus - 1) });
        return;
      }
      if (key.downArrow || input === 'j') {
        setMode({ kind: 'settings', focus: Math.min(packs.length - 1, mode.focus + 1) });
        return;
      }
      if (key.return) {
        const pack = packs[mode.focus];
        if (!pack) return;
        const res = setActivePack(pack.id);
        if (!res.ok) {
          setFlash(res.error);
          setTimeout(() => setFlash(null), 1500);
          return;
        }
        resetStatusCatalogCache();
        setPackEpoch((e) => e + 1);
        setFlash(`pack · ${pack.id}`);
        setTimeout(() => setFlash(null), 1200);
        setMode({ kind: 'main' });
      }
      return;
    }

    if (mode.kind === 'status') {
      if (key.escape) {
        setMode({ kind: 'main' });
        return;
      }
      if (input === ',') {
        const idx = packs.findIndex((p) => p.id === activePackId);
        setMode({ kind: 'settings', focus: idx >= 0 ? idx : 0 });
        return;
      }
      if (key.upArrow || input === 'k') {
        setMode({ kind: 'status', focus: Math.max(0, mode.focus - 1) });
        return;
      }
      if (key.downArrow || input === 'j') {
        setMode({ kind: 'status', focus: Math.min(statuses.length - 1, mode.focus + 1) });
        return;
      }
      if (key.return) {
        const st = statuses[mode.focus] ?? 'idle';
        const next = withStatus(note, st);
        if (statusRequiresWait(st)) {
          // requiresWait statuses always ask what is blocking.
          save(next);
          openInput('wait', next.wait || note.wait);
          return;
        }
        save(next);
        setMode({ kind: 'main' });
      }
      return;
    }

    if (mode.kind === 'input') {
      if (key.escape) {
        setMode({ kind: 'main' });
        return;
      }
      if (key.return) {
        applyInput(mode.field, mode.draft);
        return;
      }
      if (key.backspace || key.delete) {
        if (mode.cursor <= 0) return;
        const draft = mode.draft.slice(0, mode.cursor - 1) + mode.draft.slice(mode.cursor);
        setMode({ ...mode, draft, cursor: mode.cursor - 1 });
        return;
      }
      if (key.leftArrow) {
        setMode({ ...mode, cursor: Math.max(0, mode.cursor - 1) });
        return;
      }
      if (key.rightArrow) {
        setMode({ ...mode, cursor: Math.min(mode.draft.length, mode.cursor + 1) });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const draft = mode.draft.slice(0, mode.cursor) + input + mode.draft.slice(mode.cursor);
        setMode({ ...mode, draft, cursor: mode.cursor + input.length });
      }
      return;
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (input === '?') {
      setMode({ kind: 'help' });
      return;
    }
    if (input === 'r') {
      reload();
      setFlash('reloaded');
      setTimeout(() => setFlash(null), 900);
      return;
    }
    if (input === 'i' && !existsSync(path)) {
      initNoteFile(path);
      reload();
      return;
    }
    if (input === 't') {
      openInput('thread', note.thread);
      return;
    }
    if (input === 'd') {
      openInput('description', note.description);
      return;
    }
    if (input === 'n') {
      openInput('now', note.now);
      return;
    }
    if (input === 'w') {
      // Wait / blocked-on reason (required when status=blocked).
      openInput('wait', note.wait);
      return;
    }
    if (input === 'f') {
      openInput('finished', '');
      return;
    }
    if (input === 'v') {
      openInput('todo', '');
      return;
    }
    if (input === 's' || input === 'e') {
      const idx = statuses.indexOf(String(note.status));
      setMode({ kind: 'status', focus: idx >= 0 ? idx : 0 });
      return;
    }
    if (input === ',') {
      const idx = packs.findIndex((p) => p.id === activePackId);
      setMode({ kind: 'settings', focus: idx >= 0 ? idx : 0 });
      return;
    }
    if (input === 'c') {
      setMode({ kind: 'clear', focus: 0 });
      return;
    }

    if (note.todo.length > 0) {
      if (key.upArrow || input === 'k') {
        setFocusTodo((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setFocusTodo((i) => Math.min(note.todo.length - 1, i + 1));
        return;
      }
      if (input === ' ' || input === 'x') {
        const i = Math.min(focusTodo, note.todo.length - 1);
        const next: MicroNote = {
          ...note,
          todo: note.todo.map((item, idx) =>
            idx === i ? { ...item, done: !item.done } : item,
          ),
        };
        save(next);
        return;
      }
      // Delete focused todo: backspace/delete only (`d` is description).
      if (key.backspace || key.delete) {
        const i = Math.min(focusTodo, note.todo.length - 1);
        save(removeTodo(note, i), 'removed');
      }
    }
  });

  const openN = openTodoCount(note);
  // Almost full terminal width so long edits wrap instead of clipping in a narrow modal.
  const dialogW = Math.max(40, (columns || 80) - 4);
  // Dialog anatomy (blink): outer Box width=dialogW
  //   → Pane borders L/R (−2) + Pane paddingX=1 (−2) + Dialog body paddingX=1 (−2)
  //   = content cells available for children.
  const inputInnerW = Math.max(8, dialogW - 6);
  const threadLines = bodyLines(note.thread);
  const descriptionLines = bodyLines(note.description);
  const nowLines = bodyLines(note.now);
  const hasTodo = note.todo.length > 0;
  const hasFinished = note.finished.length > 0;

  if (mode.kind === 'help') {
    return (
      <Box flexDirection="column" height={rows || 24} paddingX={1} width={columns}>
        <Header title="microNote" subtitle="keys" right="q back" />
        <Box flexDirection="column" marginTop={1}>
          {[
            't  thread (title)',
            'd  description (stream context)',
            'n  now',
            'w  blocked on (required when blocked)',
            'v  add todo item',
            's  status picker',
            ',  settings (status pack)',
            'f  finished (settled decision)',
            'j/k or arrows  move todo focus',
            'space / x  toggle todo item',
            'backspace  remove focused todo',
            'c  clear menu (todos / now+wait / everything)',
            'r  reload file',
            'i  init file (if missing)',
            'q  quit',
            '',
            'packs: generic (default) · ai-dev  — also: mn status pack',
            'blocked status always asks what is blocking (Wait)',
            'empty blocks are hidden — not shown as (empty)',
          ].map((line) => (
            <Text key={line} color={tokens.fg} wrap="wrap">
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (mode.kind === 'clear-confirm') {
    return (
      <Box flexDirection="column" height={rows || 24} width={columns} justifyContent="center" alignItems="center">
        <Box width={dialogW} flexDirection="column">
          <Dialog
            title="clear everything?"
            actions={[
              { key: 'enter', label: 'yes · clear', primary: true },
              { key: 'esc', label: 'cancel' },
            ]}
            width={dialogW}
          >
            <Text color={tokens.fg} wrap="wrap">
              Resets Description, Now, Wait, Todo, Finished and status→idle.
            </Text>
            <Text color={tokens.fgDim} wrap="wrap">
              Thread is kept ({note.thread.trim() || 'empty'}).
            </Text>
          </Dialog>
        </Box>
      </Box>
    );
  }

  if (mode.kind === 'clear') {
    const clearChoices: ChoiceItem[] = CLEAR_OPTIONS.map((o) => ({
      id: o.id,
      label: o.label,
      state: o.id === 'everything' ? 'warn' : o.id === 'cancel' ? 'pending' : 'ok',
    }));
    const focused = CLEAR_OPTIONS[mode.focus];
    return (
      <Box flexDirection="column" height={rows || 24} width={columns}>
        <Header title="clear" subtitle="what to clear" right="esc back" />
        <Box flexGrow={1} paddingX={1} paddingY={1} flexDirection="column">
          <Pane title="clear" tone="focus" flexGrow={1}>
            <Box flexDirection="column">
              <ChoicePicker
                choices={clearChoices}
                focusedId={focused?.id}
                height={Math.min(10, CLEAR_OPTIONS.length + 1)}
              />
              {focused ? (
                <Box marginTop={1}>
                  <Text color={tokens.fgDim} wrap="wrap">
                    {focused.hint}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Pane>
        </Box>
        <Footer
          keys={[
            { k: '↑↓', desc: 'move' },
            { k: 'enter', desc: 'run' },
            { k: 'esc', desc: 'back' },
          ]}
          right={flash ?? focused?.id}
        />
      </Box>
    );
  }

  if (mode.kind === 'settings') {
    const packChoices: ChoiceItem[] = packs.map((p) => ({
      id: p.id,
      label: `${p.label}${p.id === activePackId ? '  · active' : ''}`,
      state: p.id === activePackId ? 'ok' : 'pending',
    }));
    const focused = packs[mode.focus];
    return (
      <Box flexDirection="column" height={rows || 24} width={columns}>
        <Header
          title="settings"
          subtitle="status pack"
          right={`${activePackId} · esc back`}
        />
        <Box flexGrow={1} paddingX={1} paddingY={1} flexDirection="column">
          <Pane title="status pack" tone="focus" flexGrow={1}>
            <Box flexDirection="column">
              <Text color={tokens.fgMuted} wrap="wrap">
                Built-in sets. User overlay still applies if statuses.json exists.
              </Text>
              <Box marginTop={1}>
                <ChoicePicker
                  choices={packChoices}
                  focusedId={focused?.id}
                  height={Math.min(8, packs.length + 1)}
                />
              </Box>
              {focused ? (
                <Box marginTop={1} flexDirection="column">
                  <Text color={tokens.accent} wrap="wrap">
                    {focused.label} ({focused.id})
                  </Text>
                  <Text color={tokens.fgDim} wrap="wrap">
                    {focused.description}
                  </Text>
                  <Text color={tokens.fgDim} wrap="wrap">
                    CLI: mn status pack {focused.id}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Pane>
        </Box>
        <Footer
          keys={[
            { k: '↑↓', desc: 'move' },
            { k: 'enter', desc: 'use pack' },
            { k: 'esc', desc: 'back' },
          ]}
          right={flash ?? activePackId}
        />
      </Box>
    );
  }

  if (mode.kind === 'status') {
    const pickTitle = statusTitle(statuses[mode.focus] ?? note.status);
    return (
      <Box flexDirection="column" height={rows || 24}>
        <Header title={pickTitle} subtitle={`pick status · ${activePackId}`} right="esc cancel" />
        <Box flexGrow={1} paddingX={1} paddingY={1}>
          <Pane title={pickTitle} tone="focus" flexGrow={1}>
            <ChoicePicker
              choices={statusChoices}
              focusedId={statuses[mode.focus]}
              height={Math.min(12, statuses.length + 1)}
            />
          </Pane>
        </Box>
        <Footer
          keys={[
            { k: '↑↓', desc: 'move' },
            { k: 'enter', desc: 'set' },
            { k: ',', desc: 'packs' },
            { k: 'esc', desc: 'cancel' },
          ]}
        />
      </Box>
    );
  }

  if (mode.kind === 'input') {
    return (
      <Box flexDirection="column" height={rows || 24} width={columns} justifyContent="center" alignItems="center">
        <Box width={dialogW} flexDirection="column">
          <Dialog
            title={FIELD_TITLE[mode.field]}
            actions={[
              { key: 'enter', label: 'save', primary: true },
              { key: 'esc', label: 'cancel' },
            ]}
            width={dialogW}
          >
            {/* Frameless body: Dialog is the only border — keeps wrap width exact. */}
            <WrappingInput
              value={mode.draft}
              cursor={mode.cursor}
              focused
              placeholder="type…"
              width={inputInnerW}
            />
          </Dialog>
        </Box>
      </Box>
    );
  }

  const waitLines = bodyLines(note.wait);
  const isBlocked = statusRequiresWait(String(note.status));
  const needsWait = blockedNeedsWait(note);
  // Header chrome stays short (one row); full wait/body text lives in the card and wraps.
  const rightBits =
    flash ??
    (note.status === 'ready' && openN > 0
      ? `${openN} open todo`
      : isBlocked
        ? note.wait.trim()
          ? 'needs you'
          : 'needs you · set w'
        : statusTitle(String(note.status)));

  return (
    <Box flexDirection="column" height={rows || 24} width={columns}>
      <Header
        title="microNote"
        subtitle={shortPath(path)}
        right={
          <Text color={isBlocked ? tokens.stateErr : tokens.fgMuted}>
            {note.updated || '—'} · {rightBits}
          </Text>
        }
      />
      {missing ? (
        <Box paddingX={1}>
          <Banner tone="warn">no file — press i to init</Banner>
        </Box>
      ) : null}
      {needsWait ? (
        <Box paddingX={1}>
          <Banner tone="error">blocked — press w: what is blocking?</Banner>
        </Box>
      ) : null}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Pane
          title={statusTitle(String(note.status))}
          tone={isBlocked ? 'error' : 'focus'}
          flexGrow={1}
        >
          <Box flexDirection="column">
            {/* Blocked-on first when blocked — the re-entry answer for "what stops me". */}
            {isBlocked ? (
              <ShortSection
                icon="!"
                label="blocked on"
                color={tokens.stateErr}
                bodyColor={tokens.fg}
                lines={waitLines}
                first
                required
                emptyHint="set with w — required"
                hintColor={tokens.stateErr}
              />
            ) : null}
            <ShortSection
              icon="◈"
              label="thread"
              color={tokens.accent}
              bodyColor={tokens.fg}
              lines={threadLines}
              first={!isBlocked}
              required
              emptyHint="set with t"
              hintColor={tokens.fgDim}
            />
            <ShortSection
              icon="∷"
              label="description"
              color={tokens.fgMuted}
              bodyColor={tokens.fg}
              lines={descriptionLines}
            />
            <ShortSection
              icon="→"
              label="now"
              color={tokens.accentAlt}
              bodyColor={tokens.fg}
              lines={nowLines}
            />
            {hasTodo ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={tokens.stateOk ?? tokens.accent} wrap="wrap">
                  ☐ todo
                  {openN > 0 ? (
                    <Text color={tokens.fgMuted}> · {openN} open</Text>
                  ) : null}
                </Text>
                <TodoList items={note.todo} focusIndex={focusTodoIdx} />
              </Box>
            ) : null}
            {hasFinished ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={tokens.fgDim}>✓ finished</Text>
                <Box flexDirection="column" paddingLeft={2}>
                  {note.finished.map((l, i) => (
                    <Text key={`fin-${i}`} color={tokens.fgDim} wrap="wrap">
                      • {l}
                    </Text>
                  ))}
                </Box>
              </Box>
            ) : null}
          </Box>
        </Pane>
      </Box>
      <Footer
        // blink Footer: 1 bar when it fits; 2nd bar on narrow terms before dropping.
        maxRows={2}
        keys={[
          // Order = priority if still overflow past 2 rows.
          { k: 't', desc: 'thread' },
          { k: 'd', desc: 'desc' },
          { k: 'n', desc: 'now' },
          ...(isBlocked ? ([{ k: 'w', desc: 'wait' }] as const) : []),
          { k: 'v', desc: 'todo' },
          { k: 's', desc: 'status' },
          { k: 'sp', desc: 'toggle' },
          { k: 'f', desc: 'finish' },
          { k: 'c', desc: 'clear' },
          { k: ',', desc: 'pack' },
          { k: '?', desc: 'help' },
          { k: 'q', desc: 'quit' },
        ]}
        right={flash ? flash : needsWait ? 'set w' : `${openN} open · ${activePackId}`}
      />
    </Box>
  );
}

export function App(): React.ReactElement {
  const path = notePath();
  const [iconSet, setIconSet] = useState<IconSet>('unicode');

  useEffect(() => {
    void detectIconSet().then(setIconSet);
  }, []);

  return (
    <ThemeProvider iconSet={iconSet} theme="tokyonight">
      <AppInner path={path} />
    </ThemeProvider>
  );
}
