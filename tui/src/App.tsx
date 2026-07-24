import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { existsSync, watch } from 'node:fs';
import { dirname } from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
import {
  ThemeProvider,
  detectIconSet,
  Header,
  Pane,
  List,
  Footer,
  Input,
  Dialog,
  Banner,
  ChoicePicker,
  useTokens,
  useStdoutDimensions,
  type ListRowData,
  type ChoiceItem,
  type IconSet,
} from '@henryavila/blink-tui';
import {
  type MicroNote,
  blockedNeedsWait,
  emptyNote,
  initNoteFile,
  notePath,
  openValidateCount,
  readNoteFile,
  statusIds,
  statusRequiresWait,
  statusToIntent,
  statusTitle,
  withStatus,
  writeNoteFile,
} from './note.js';

type Mode =
  | { kind: 'main' }
  | { kind: 'input'; field: InputField; draft: string; cursor: number }
  | { kind: 'status'; focus: number }
  | { kind: 'help' };

type InputField = 'thread' | 'description' | 'now' | 'wait' | 'human' | 'close' | 'validate';

const FIELD_TITLE: Record<InputField, string> = {
  thread: 'thread',
  description: 'details',
  now: 'now',
  wait: 'blocked on',
  human: 'human',
  close: 'close',
  validate: 'todo',
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

/**
 * Short block: icon + color label as visual separator.
 * Hidden when empty — unless `required` (Thread): always shown so the card is never blank.
 *
 * Optional `mutedLines` (e.g. description under thread) render in the same
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
  const [focusValidate, setFocusValidate] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [missing, setMissing] = useState(() => !existsSync(path));
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
    (next: MicroNote) => {
      writing.current = true;
      try {
        writeNoteFile(path, next);
        const n = readNoteFile(path);
        if (n) {
          setNote(n);
          // keep validate focus in range after mutations
          setFocusValidate((i) => Math.min(i, Math.max(0, n.validate.length - 1)));
        }
        setMissing(false);
        setFlash('saved');
        setTimeout(() => setFlash(null), 900);
      } finally {
        setTimeout(() => {
          writing.current = false;
        }, 120);
      }
    },
    [path],
  );

  const validateRows: ListRowData[] = useMemo(() => {
    return note.validate.map((v, i) => ({
      id: String(i),
      label: v.text,
      selected: v.done,
    }));
  }, [note.validate]);

  const focusId =
    note.validate.length === 0
      ? ''
      : String(Math.min(focusValidate, Math.max(0, note.validate.length - 1)));

  const statuses = useMemo(() => statusIds(), []);
  const statusChoices: ChoiceItem[] = useMemo(
    () =>
      statuses.map((s) => ({
        id: s,
        label: statusTitle(s),
        state: statusToIntent(s),
      })),
    [statuses],
  );

  const applyInput = (field: InputField, value: string) => {
    const next: MicroNote = { ...note, validate: [...note.validate], closed: [...note.closed] };
    switch (field) {
      case 'thread':
        next.thread = value.trim();
        break;
      case 'description':
        next.description = value;
        break;
      case 'now':
        next.now = value.trim();
        break;
      case 'wait': {
        const w = value.trim();
        // Wait required while status requiresWait; empty is refused.
        if (statusRequiresWait(String(next.status)) && !w) {
          setFlash('blocked needs reason');
          setTimeout(() => setFlash(null), 1200);
          return;
        }
        next.wait = w;
        break;
      }
      case 'human':
        next.human = value;
        break;
      case 'close':
        if (value.trim()) next.closed = [...note.closed, value.trim()];
        break;
      case 'validate':
        if (value.trim()) next.validate = [...note.validate, { text: value.trim(), done: false }];
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

    if (mode.kind === 'status') {
      if (key.escape) {
        setMode({ kind: 'main' });
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
    if (input === 'h') {
      openInput('human', note.human);
      return;
    }
    if (input === 'c') {
      openInput('close', '');
      return;
    }
    if (input === 'v') {
      openInput('validate', '');
      return;
    }
    if (input === 's' || input === 'e') {
      const idx = statuses.indexOf(String(note.status));
      setMode({ kind: 'status', focus: idx >= 0 ? idx : 0 });
      return;
    }

    if (note.validate.length > 0) {
      if (key.upArrow || input === 'k') {
        setFocusValidate((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setFocusValidate((i) => Math.min(note.validate.length - 1, i + 1));
        return;
      }
      if (input === ' ' || input === 'x') {
        const i = Math.min(focusValidate, note.validate.length - 1);
        const next: MicroNote = {
          ...note,
          validate: note.validate.map((item, idx) =>
            idx === i ? { ...item, done: !item.done } : item,
          ),
        };
        save(next);
      }
    }
  });

  const openN = openValidateCount(note);
  const listHeight = Math.max(
    2,
    Math.min(8, Math.max(note.validate.length, 1), Math.floor((rows || 30) * 0.25)),
  );
  const dialogW = Math.min(Math.max(40, (columns || 80) - 6), 72);
  const threadLines = bodyLines(note.thread);
  const nowLines = bodyLines(note.now);
  const humanLines = bodyLines(note.human);
  const hasValidate = note.validate.length > 0;
  const hasClosed = note.closed.length > 0;

  if (mode.kind === 'help') {
    return (
      <Box flexDirection="column" height={rows || 24} paddingX={1}>
        <Header title="microNote" subtitle="keys" right="q back" />
        <Box flexDirection="column" marginTop={1}>
          {[
            't  thread (title)',
            'd  details (muted context)',
            'n  now',
            'w  blocked on (required when blocked)',
            'v  add todo (validate item)',
            's  status picker',
            'h  human note',
            'c  close decision',
            'j/k or arrows  move todo focus',
            'space / x  toggle todo item',
            'r  reload file',
            'i  init file (if missing)',
            'q  quit',
            '',
            'blocked status always asks what is blocking (Wait)',
            'empty blocks are hidden — not shown as (empty)',
          ].map((line) => (
            <Text key={line} color={tokens.fg}>
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (mode.kind === 'status') {
    const pickTitle = statusTitle(statuses[mode.focus] ?? note.status);
    return (
      <Box flexDirection="column" height={rows || 24}>
        <Header title={pickTitle} subtitle="pick status" right="esc cancel" />
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
            { k: 'esc', desc: 'cancel' },
          ]}
        />
      </Box>
    );
  }

  if (mode.kind === 'input') {
    return (
      <Box flexDirection="column" height={rows || 24} justifyContent="center" alignItems="center">
        <Box width={dialogW} flexDirection="column">
          <Dialog
            title={FIELD_TITLE[mode.field]}
            actions={[
              { key: 'enter', label: 'save', primary: true },
              { key: 'esc', label: 'cancel' },
            ]}
            width={dialogW}
          >
            <Input
              title={FIELD_TITLE[mode.field]}
              value={mode.draft}
              cursor={mode.cursor}
              focused
              placeholder="type…"
            />
          </Dialog>
        </Box>
      </Box>
    );
  }

  const waitLines = bodyLines(note.wait);
  const isBlocked = statusRequiresWait(String(note.status));
  const needsWait = blockedNeedsWait(note);
  const rightBits =
    flash ??
    (note.status === 'ready' && openN > 0
      ? `${openN} to validate`
      : isBlocked
        ? note.wait.trim()
          ? note.wait.trim().length > 28
            ? `needs you · ${note.wait.trim().slice(0, 25)}…`
            : `needs you · ${note.wait.trim()}`
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
              // details sit under thread body (same indent, no gap) — like now body under "now"
              mutedLines={bodyLines(note.description)}
              mutedColor={tokens.fgDim}
              first={!isBlocked}
              required
              emptyHint="set with t"
              hintColor={tokens.fgDim}
            />
            <ShortSection
              icon="→"
              label="now"
              color={tokens.accentAlt}
              bodyColor={tokens.fg}
              lines={nowLines}
            />
            {hasValidate ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={tokens.stateOk ?? tokens.accent}>
                  ☐ todo
                  {openN > 0 ? (
                    <Text color={tokens.fgMuted}> · {openN} open</Text>
                  ) : null}
                </Text>
                <List rows={validateRows} focusedId={focusId} height={listHeight} />
              </Box>
            ) : null}
            <ShortSection
              icon="✎"
              label="human"
              color={tokens.fgMuted}
              bodyColor={tokens.fgMuted}
              lines={humanLines}
            />
            {hasClosed ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={tokens.fgDim}>✓ closed</Text>
                <Box flexDirection="column" paddingLeft={2}>
                  {note.closed.map((l, i) => (
                    <Text key={`cl-${i}`} color={tokens.fgDim} wrap="wrap">
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
        keys={[
          // Order = importance: Footer drops chips from the right when narrow.
          { k: 't', desc: 'thread' },
          { k: 'n', desc: 'now' },
          ...(isBlocked ? ([{ k: 'w', desc: 'blocked on' }] as const) : []),
          { k: 'v', desc: 'todo' },
          { k: 's', desc: 'status' },
          { k: 'sp', desc: 'toggle' },
          { k: 'h', desc: 'human' },
          { k: 'c', desc: 'close' },
          { k: 'd', desc: 'details' },
          { k: '?', desc: 'help' },
          { k: 'q', desc: 'quit' },
        ]}
        right={flash ? flash : needsWait ? 'need w' : `${openN} open`}
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
