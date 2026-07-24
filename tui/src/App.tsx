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
  type NoteStatus,
  VALID_STATUSES,
  emptyNote,
  initNoteFile,
  notePath,
  openValidateCount,
  readNoteFile,
  statusToIntent,
  writeNoteFile,
} from './note.js';

type Mode =
  | { kind: 'main' }
  | { kind: 'input'; field: InputField; draft: string; cursor: number }
  | { kind: 'status'; focus: number }
  | { kind: 'help' };

type InputField = 'thread' | 'description' | 'now' | 'human' | 'close' | 'validate';

const FIELD_TITLE: Record<InputField, string> = {
  thread: 'thread',
  description: 'description',
  now: 'now',
  human: 'human',
  close: 'close',
  validate: 'validate',
};

function shortPath(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? p;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function bodyLines(text: string, empty = '(empty)'): string[] {
  const t = text.trim();
  if (!t) return [empty];
  return t.split('\n');
}

function Section({
  label,
  color,
  children,
  first,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
  first?: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={first ? 0 : 1}>
      <Text color={color}>{label}</Text>
      <Box flexDirection="column" paddingLeft={1}>
        {children}
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
    if (note.validate.length === 0) {
      return [{ id: '_empty', label: '(nothing yet)', selected: false, muted: true }];
    }
    return note.validate.map((v, i) => ({
      id: String(i),
      label: v.text,
      selected: v.done,
    }));
  }, [note.validate]);

  const focusId =
    note.validate.length === 0
      ? '_empty'
      : String(Math.min(focusValidate, Math.max(0, note.validate.length - 1)));

  const statusChoices: ChoiceItem[] = VALID_STATUSES.map((s) => ({
    id: s,
    label: s,
    state: statusToIntent(s),
  }));

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
        setMode({ kind: 'status', focus: Math.min(VALID_STATUSES.length - 1, mode.focus + 1) });
        return;
      }
      if (key.return) {
        const st = VALID_STATUSES[mode.focus] as NoteStatus;
        save({ ...note, status: st });
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
      const idx = VALID_STATUSES.indexOf(note.status as NoteStatus);
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
  const listHeight = Math.max(3, Math.min(8, Math.floor((rows || 30) * 0.25)));
  const dialogW = Math.min(Math.max(40, (columns || 80) - 6), 72);

  if (mode.kind === 'help') {
    return (
      <Box flexDirection="column" height={rows || 24} paddingX={1}>
        <Header title="microNote" subtitle="keys" right="q back" />
        <Box flexDirection="column" marginTop={1}>
          {[
            't  thread (short label)',
            'd  description (long context)',
            'n  now',
            'v  add validate item',
            's  status picker',
            'h  human note',
            'c  close decision',
            'j/k or arrows  move validate focus',
            'space / x  toggle validate item',
            'r  reload file',
            'i  init file (if missing)',
            'q  quit',
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
    return (
      <Box flexDirection="column" height={rows || 24}>
        <Header title="status" subtitle="pick" right="esc cancel" />
        <Box flexGrow={1} paddingX={1} paddingY={1}>
          <Pane title="status" tone="focus" flexGrow={1}>
            <ChoicePicker
              choices={statusChoices}
              focusedId={VALID_STATUSES[mode.focus]}
              height={6}
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

  const rightBits =
    flash ??
    (note.status === 'ready' && openN > 0
      ? `${openN} to validate`
      : note.status === 'blocked'
        ? 'needs you'
        : String(note.status));

  return (
    <Box flexDirection="column" height={rows || 24} width={columns}>
      <Header
        title="microNote"
        subtitle={shortPath(path)}
        right={
          <Text color={tokens.fgMuted}>
            {note.updated || '—'} · {rightBits}
          </Text>
        }
      />
      {missing ? (
        <Box paddingX={1}>
          <Banner tone="warn">no file — press i to init</Banner>
        </Box>
      ) : null}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        <Pane
          title={`${note.status}`}
          tone={note.status === 'blocked' ? 'error' : 'focus'}
          flexGrow={1}
        >
          <Box flexDirection="column">
            <Section label="thread" color={tokens.accent} first>
              {bodyLines(note.thread).map((l, i) => (
                <Text key={`th-${i}`} color={tokens.fg} wrap="truncate">
                  {l}
                </Text>
              ))}
            </Section>
            <Section label="description" color={tokens.fgMuted}>
              {bodyLines(note.description).map((l, i) => (
                <Text key={`de-${i}`} color={tokens.fg} wrap="truncate">
                  {l}
                </Text>
              ))}
            </Section>
            <Section label="now" color={tokens.fg}>
              {bodyLines(note.now).map((l, i) => (
                <Text key={`nw-${i}`} color={tokens.fg} wrap="truncate">
                  {l}
                </Text>
              ))}
            </Section>
            <Box marginTop={1}>
              <Text color={tokens.fgDim}>validate</Text>
            </Box>
            <List rows={validateRows} focusedId={focusId} height={listHeight} />
            <Section label="human" color={tokens.fgMuted}>
              {bodyLines(note.human).map((l, i) => (
                <Text key={`hu-${i}`} color={tokens.fgMuted} wrap="truncate">
                  {l}
                </Text>
              ))}
            </Section>
            <Section label="closed" color={tokens.fgDim}>
              {(note.closed.length ? note.closed : ['—']).map((l, i) => (
                <Text key={`cl-${i}`} color={tokens.fgDim} wrap="truncate">
                  {note.closed.length ? `• ${l}` : l}
                </Text>
              ))}
            </Section>
          </Box>
        </Pane>
      </Box>
      <Footer
        keys={[
          { k: 't', desc: 'thread' },
          { k: 'd', desc: 'desc' },
          { k: 'n', desc: 'now' },
          { k: 'v', desc: 'validate' },
          { k: 's', desc: 'status' },
          { k: 'sp', desc: 'toggle' },
          { k: '?', desc: 'help' },
          { k: 'q', desc: 'quit' },
        ]}
        right={flash ? flash : `${openN} open`}
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
