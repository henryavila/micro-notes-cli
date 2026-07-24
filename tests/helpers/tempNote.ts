import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serializeNote, emptyNote, type MicroNote } from '../../tui/src/note.js';

export function makeTempDir(prefix = 'mn-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeTempNote(
  dir: string,
  partial: Partial<MicroNote> = {},
  name = 'MICRONOTE.md',
): { path: string; note: MicroNote } {
  const note: MicroNote = { ...emptyNote(), ...partial };
  if (partial.todo) note.todo = partial.todo.map((v) => ({ ...v }));
  if (partial.finished) note.finished = [...partial.finished];
  const path = join(dir, name);
  writeFileSync(path, serializeNote(note), 'utf8');
  return { path, note };
}

export function readRaw(path: string): string {
  return readFileSync(path, 'utf8');
}

export function cleanup(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
