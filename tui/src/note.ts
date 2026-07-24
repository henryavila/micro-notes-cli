/**
 * MICRONOTE.md parse / serialize — SCHEMA v0.1
 *
 * Canonical sections: Thread · Description · Now · Wait · Todo · Finished
 * (Human dropped; Validate/Need → Todo; Closed → Finished; Descricao → Description)
 *
 * Wait = what is blocking (required when status requiresWait; cleared when unblocked).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  statusIds,
  statusToIntent as catalogStatusToIntent,
  statusGlyph as catalogStatusGlyph,
  statusTitle as catalogStatusTitle,
  statusRequiresWait,
  isValidStatus,
  canonicalizeStatus,
} from './status-catalog.js';

/** @deprecated free-form string; valid ids come from the status catalog (ai-dev pack). */
export type NoteStatus = string;

export interface TodoItem {
  text: string;
  done: boolean;
}

/** @deprecated use TodoItem */
export type ValidateItem = TodoItem;
/** @deprecated use TodoItem */
export type NeedItem = TodoItem;

export interface MicroNote {
  updated: string;
  status: NoteStatus | string;
  thread: string;
  /** Longer stream context (optional prose). */
  description: string;
  now: string;
  /** What is blocking — required when status requires wait (blocked). */
  wait: string;
  /** Verify/decide checklist (SCHEMA: Todo). */
  todo: TodoItem[];
  /** Settled decisions (SCHEMA: Finished; legacy heading Closed). */
  finished: string[];
}

export const PLACEHOLDER_TODO = '(nothing yet)';
/** @deprecated use PLACEHOLDER_TODO */
export const PLACEHOLDER_NEED = PLACEHOLDER_TODO;
/** @deprecated use PLACEHOLDER_TODO */
export const PLACEHOLDER_VALIDATE = PLACEHOLDER_TODO;

/** Live catalog order (ai-dev by default). Prefer statusIds() for new code. */
export const VALID_STATUSES: string[] = statusIds();

export function notePath(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  if (env.MN_FILE && env.MN_FILE.trim()) return env.MN_FILE.trim();
  return join(cwd, 'MICRONOTE.md');
}

function nowHm(d = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function emptyNote(): MicroNote {
  return {
    updated: nowHm(),
    status: 'idle',
    thread: '',
    description: '',
    now: '',
    wait: '',
    todo: [],
    finished: [],
  };
}

/**
 * Map legacy headings to canonical SCHEMA ids.
 * Human maps to null (dropped — not written back).
 */
function normalizeHeading(h: string): string | null {
  const map: Record<string, string | null> = {
    Thread: 'Thread',
    Fio: 'Thread',
    Description: 'Description',
    Descricao: 'Description',
    Now: 'Now',
    Agora: 'Now',
    Wait: 'Wait',
    Espera: 'Wait',
    Bloqueio: 'Wait',
    Todo: 'Todo',
    Need: 'Todo',
    Validate: 'Todo',
    Validar: 'Todo',
    Finished: 'Finished',
    Closed: 'Finished', // legacy SCHEMA name
    Fechado: 'Finished',
    // Dropped from SCHEMA v0.1 — parse then discard
    Human: null,
    Humano: null,
  };
  if (h in map) return map[h]!;
  return h; // unknown: keep under that key but never serialize
}

export function parseNote(raw: string): MicroNote {
  const note = emptyNote();
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let section: string | null = null;
  const bodies: Record<string, string[]> = {
    Thread: [],
    Description: [],
    Now: [],
    Wait: [],
    Todo: [],
    Finished: [],
  };

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) continue;

    const metaUpdated = line.match(/^(updated|atualizado):\s*(.*)$/i);
    if (metaUpdated) {
      note.updated = metaUpdated[2].trim();
      continue;
    }
    const metaStatus = line.match(/^(status|estado):\s*(.*)$/i);
    if (metaStatus) {
      note.status = metaStatus[2].trim() || 'idle';
      continue;
    }

    const hm = line.match(/^##\s+(.+)\s*$/);
    if (hm) {
      const canon = normalizeHeading(hm[1].trim());
      section = canon;
      if (canon && !(canon in bodies)) bodies[canon] = [];
      continue;
    }

    if (section && section in bodies) {
      bodies[section].push(line);
    }
    // Human / unknown: ignored (not stored)
  }

  const trimBody = (xs: string[]) =>
    xs
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .trim();

  note.thread = trimBody(bodies.Thread ?? []);
  note.description = trimBody(bodies.Description ?? []);
  note.now = trimBody(bodies.Now ?? []);
  note.wait = trimBody(bodies.Wait ?? []);

  note.todo = [];
  for (const line of bodies.Todo ?? []) {
    const t = line.trim();
    if (!t) continue;
    const done = t.match(/^- \[[xX]\]\s+(.*)$/);
    const open = t.match(/^- \[ \]\s+(.*)$/);
    if (done) {
      const text = done[1].trim();
      if (text === PLACEHOLDER_TODO || text === '(nada ainda)') continue;
      note.todo.push({ text, done: true });
    } else if (open) {
      const text = open[1].trim();
      if (text === PLACEHOLDER_TODO || text === '(nada ainda)') continue;
      note.todo.push({ text, done: false });
    }
  }

  note.finished = [];
  for (const line of bodies.Finished ?? []) {
    const t = line.trim();
    if (!t || t === '-') continue;
    if (/^-\s*$/.test(t)) continue;
    if (t.startsWith('- ')) note.finished.push(t.slice(2).trim());
    else note.finished.push(t);
  }

  return note;
}

export function serializeNote(note: MicroNote): string {
  const todoLines =
    note.todo.length === 0
      ? [`- [ ] ${PLACEHOLDER_TODO}`]
      : note.todo.map((v) => `- [${v.done ? 'x' : ' '}] ${v.text}`);

  const finishedLines =
    note.finished.length === 0 ? ['- '] : note.finished.map((c) => `- ${c}`);

  const block = (title: string, body: string) => {
    const b = body.trim();
    return b ? `## ${title}\n${b}\n` : `## ${title}\n\n`;
  };

  // When status does not require wait, do not persist a stale reason.
  const waitBody = statusRequiresWait(String(note.status || 'idle')) ? note.wait : '';

  // SCHEMA v0.1 template: Thread · Description · Now · Wait · Todo · Finished
  return [
    '# microNote',
    `updated: ${note.updated || nowHm()}`,
    `status: ${note.status || 'idle'}`,
    '',
    block('Thread', note.thread).trimEnd(),
    '',
    block('Description', note.description).trimEnd(),
    '',
    block('Now', note.now).trimEnd(),
    '',
    block('Wait', waitBody).trimEnd(),
    '',
    `## Todo`,
    ...todoLines,
    '',
    `## Finished`,
    ...finishedLines,
    '',
  ].join('\n');
}

/** True when this status requires Wait and Wait is empty — invalid card. */
export function blockedNeedsWait(note: MicroNote): boolean {
  return statusRequiresWait(String(note.status)) && !note.wait.trim();
}

/** Apply a status change; clears Wait when leaving a requiresWait status. */
export function withStatus(note: MicroNote, status: string): MicroNote {
  const next: MicroNote = {
    ...note,
    status,
    todo: [...note.todo],
    finished: [...note.finished],
  };
  if (!statusRequiresWait(status)) next.wait = '';
  return next;
}

export function readNoteFile(path: string): MicroNote | null {
  if (!existsSync(path)) return null;
  return parseNote(readFileSync(path, 'utf8'));
}

export function writeNoteFile(path: string, note: MicroNote): void {
  const stamped: MicroNote = { ...note, updated: nowHm() };
  const content = serializeNote(stamped);
  const body = content.endsWith('\n') ? content : content + '\n';
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.micronote.${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, path);
}

export function initNoteFile(path: string): MicroNote {
  const note = emptyNote();
  writeNoteFile(path, note);
  return readNoteFile(path) ?? note;
}

/** blink state intent for header/list status column — from catalog */
export function statusToIntent(status: string): string {
  return catalogStatusToIntent(status);
}

/** Width-1 status mark for pane titles — from catalog */
export function statusGlyph(status: string): string {
  return catalogStatusGlyph(status);
}

/** Pane / header title: `◉ coding` */
export function statusTitle(status: string): string {
  return catalogStatusTitle(status);
}

export function openTodoCount(note: MicroNote): number {
  return note.todo.filter((v) => !v.done).length;
}

/** Remove a single todo item by index. Out-of-range → unchanged note. */
export function removeTodo(note: MicroNote, index: number): MicroNote {
  if (index < 0 || index >= note.todo.length) {
    return { ...note, todo: [...note.todo], finished: [...note.finished] };
  }
  return {
    ...note,
    todo: note.todo.filter((_, i) => i !== index),
    finished: [...note.finished],
  };
}

/** Drop checked items; keep open ones. */
export function clearDoneTodos(note: MicroNote): MicroNote {
  return {
    ...note,
    todo: note.todo.filter((t) => !t.done),
    finished: [...note.finished],
  };
}

/** Reset checklist to empty (disk writes the placeholder). */
export function clearAllTodos(note: MicroNote): MicroNote {
  return {
    ...note,
    todo: [],
    finished: [...note.finished],
  };
}

/** Clear Now + Wait (activity / block reason). */
export function clearActivity(note: MicroNote): MicroNote {
  return {
    ...note,
    now: '',
    wait: '',
    todo: [...note.todo],
    finished: [...note.finished],
  };
}

/**
 * Soft reset: empty Description, Now, Wait, Todo, Finished; status → idle.
 * Preserves Thread (stream identity).
 */
export function clearSoft(note: MicroNote): MicroNote {
  return {
    ...note,
    status: 'idle',
    description: '',
    now: '',
    wait: '',
    todo: [],
    finished: [],
  };
}

/** @deprecated use openTodoCount */
export const openNeedCount = openTodoCount;
/** @deprecated use openTodoCount */
export const openValidateCount = openTodoCount;

export { statusIds, isValidStatus, canonicalizeStatus, statusRequiresWait };
