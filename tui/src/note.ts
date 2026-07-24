/**
 * MICRONOTE.md parse / serialize — English canonical schema.
 * Matches bin/mn file format (Thread, Description, Now, Wait, Validate, Human, Closed).
 *
 * Wait = what is blocking (required when status=blocked; cleared when unblocked).
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

export interface ValidateItem {
  text: string;
  done: boolean;
}

export interface MicroNote {
  updated: string;
  status: NoteStatus | string;
  thread: string;
  description: string;
  now: string;
  /** What is blocking — required when status requires wait (blocked). */
  wait: string;
  validate: ValidateItem[];
  human: string;
  closed: string[];
}

export const PLACEHOLDER_VALIDATE = '(nothing yet)';
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
    validate: [],
    human: '',
    closed: [],
  };
}

/** Map legacy PT headings/meta when reading old files. */
function normalizeHeading(h: string): string {
  const map: Record<string, string> = {
    Fio: 'Thread',
    Descricao: 'Description',
    Agora: 'Now',
    Espera: 'Wait',
    Bloqueio: 'Wait',
    Validar: 'Validate',
    Humano: 'Human',
    Fechado: 'Closed',
  };
  return map[h] ?? h;
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
    Validate: [],
    Human: [],
    Closed: [],
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
      section = normalizeHeading(hm[1].trim());
      if (!(section in bodies)) bodies[section] = [];
      continue;
    }

    if (section && section in bodies) {
      bodies[section].push(line);
    }
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
  note.human = trimBody(bodies.Human ?? []);

  note.validate = [];
  for (const line of bodies.Validate ?? []) {
    const t = line.trim();
    if (!t) continue;
    const done = t.match(/^- \[[xX]\]\s+(.*)$/);
    const open = t.match(/^- \[ \]\s+(.*)$/);
    if (done) {
      const text = done[1].trim();
      if (text === PLACEHOLDER_VALIDATE || text === '(nada ainda)') continue;
      note.validate.push({ text, done: true });
    } else if (open) {
      const text = open[1].trim();
      if (text === PLACEHOLDER_VALIDATE || text === '(nada ainda)') continue;
      note.validate.push({ text, done: false });
    }
  }

  note.closed = [];
  for (const line of bodies.Closed ?? []) {
    const t = line.trim();
    if (!t || t === '-') continue;
    if (/^-\s*$/.test(t)) continue;
    if (t.startsWith('- ')) note.closed.push(t.slice(2).trim());
    else note.closed.push(t);
  }

  return note;
}

export function serializeNote(note: MicroNote): string {
  const validateLines =
    note.validate.length === 0
      ? [`- [ ] ${PLACEHOLDER_VALIDATE}`]
      : note.validate.map((v) => `- [${v.done ? 'x' : ' '}] ${v.text}`);

  const closedLines =
    note.closed.length === 0 ? ['- '] : note.closed.map((c) => `- ${c}`);

  const block = (title: string, body: string) => {
    const b = body.trim();
    return b ? `## ${title}\n${b}\n` : `## ${title}\n\n`;
  };

  // When status does not require wait, do not persist a stale reason.
  const waitBody = statusRequiresWait(String(note.status || 'idle')) ? note.wait : '';

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
    `## Validate`,
    ...validateLines,
    '',
    block('Human', note.human).trimEnd(),
    '',
    `## Closed`,
    ...closedLines,
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
    validate: [...note.validate],
    closed: [...note.closed],
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

export function openValidateCount(note: MicroNote): number {
  return note.validate.filter((v) => !v.done).length;
}

export { statusIds, isValidStatus, canonicalizeStatus, statusRequiresWait };
