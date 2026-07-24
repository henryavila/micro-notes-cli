/**
 * Integration: real `bin/mn` process. Asserts exit codes, stdout, and on-disk format.
 * Complements tests/run.sh — runs under vitest so `npm test` is one gate.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseNote } from '../tui/src/note.js';
import { cleanup, makeTempDir } from './helpers/tempNote.js';
import { runMn } from './helpers/spawnMn.js';

describe('mn CLI (real process)', () => {
  let dir: string;
  let MN_FILE: string;
  let MN_CONFIG_DIR: string;

  beforeEach(() => {
    dir = makeTempDir('mn-cli-');
    MN_FILE = `${dir}/MICRONOTE.md`;
    MN_CONFIG_DIR = `${dir}/cfg`;
  });

  afterEach(() => cleanup(dir));

  const env = () => ({ MN_FILE, MN_CONFIG_DIR, MN_UI: '0' });

  it('show on missing file tells user to init (exit 0, English)', () => {
    const r = runMn(['show'], env());
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/mn init|no MICRONOTE|not found/i);
  });

  it('check on missing file exits non-zero', () => {
    const r = runMn(['check'], env());
    expect(r.status).not.toBe(0);
  });

  it('init creates EN schema; second init does not clobber', () => {
    const a = runMn(['init'], env());
    expect(a.status).toBe(0);
    expect(existsSync(MN_FILE)).toBe(true);
    const raw = readFileSync(MN_FILE, 'utf8');
    expect(raw).toMatch(/^updated:/m);
    expect(raw).toMatch(/^status:/m);
    expect(raw).toContain('## Thread');
    expect(raw).toContain('## Description');
    expect(raw).toContain('(nothing yet)');
    const hash = createHash('sha256').update(raw).digest('hex');

    const b = runMn(['init'], env());
    expect(b.status).toBe(0);
    expect(b.stdout + b.stderr).toMatch(/already exists/i);
    expect(createHash('sha256').update(readFileSync(MN_FILE)).digest('hex')).toBe(hash);
  });

  it('thread without args exits 2; with args writes quietly and is TS-parseable', () => {
    runMn(['init'], env());
    const bad = runMn(['thread'], env());
    expect(bad.status).toBe(2);

    const ok = runMn(['thread', 'paddle webhooks'], env());
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/ok · thread/);
    const note = parseNote(readFileSync(MN_FILE, 'utf8'));
    expect(note.thread).toBe('paddle webhooks');
  });

  it('status rejects invalid values (exit 2) and accepts valid ones', () => {
    runMn(['init'], env());
    const bad = runMn(['status', 'foobar'], env());
    expect(bad.status).toBe(2);
    expect(bad.stdout + bad.stderr).toMatch(/invalid status/i);

    for (const s of ['idle', 'working', 'blocked', 'ready'] as const) {
      const r = runMn(['status', s], env());
      expect(r.status, s).toBe(0);
      expect(readFileSync(MN_FILE, 'utf8')).toMatch(new RegExp(`^status: ${s}$`, 'm'));
    }
  });

  it('check fails on empty thread and passes after fill', () => {
    runMn(['init'], env());
    expect(runMn(['check'], env()).status).not.toBe(0);

    runMn(['thread', 't'], env());
    runMn(['description', 'd'], env());
    runMn(['now', 'n'], env());
    runMn(['validate', 'v1'], env());
    runMn(['status', 'ready'], env());
    const ok = runMn(['check'], env());
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/ok/i);
  });

  it('ready + only placeholder does NOT show "1 to validate"', () => {
    runMn(['init'], env());
    runMn(['thread', 't'], env());
    runMn(['status', 'ready'], env());
    const show = runMn(['show'], env());
    expect(show.status).toBe(0);
    expect(show.stdout).not.toMatch(/1 to validate/);
    // with a real open item, badge appears
    runMn(['validate', 'npm test'], env());
    const show2 = runMn(['show'], env());
    expect(show2.stdout).toMatch(/1 to validate|to validate/);
  });

  it('blocked badge says needs you', () => {
    runMn(['init'], env());
    runMn(['thread', 't'], env());
    runMn(['status', 'blocked'], env());
    expect(runMn(['show'], env()).stdout).toMatch(/needs you/);
  });

  it('done marks first open; clear-validate restores placeholder', () => {
    runMn(['init'], env());
    runMn(['thread', 't'], env());
    runMn(['validate', 'npm test'], env());
    runMn(['validate', 'retry'], env());
    expect(runMn(['done'], env()).status).toBe(0);
    expect(readFileSync(MN_FILE, 'utf8')).toMatch(/- \[x\] npm test/);
    expect(runMn(['clear-validate'], env()).status).toBe(0);
    expect(readFileSync(MN_FILE, 'utf8')).toContain('(nothing yet)');
  });

  it('description --append and human --replace mutate sections as claimed', () => {
    runMn(['init'], env());
    runMn(['thread', 't'], env());
    runMn(['description', 'first'], env());
    runMn(['description', '--append', 'second'], env());
    let body = readFileSync(MN_FILE, 'utf8');
    expect(body).toContain('first');
    expect(body).toContain('second');

    runMn(['human', 'old note'], env());
    runMn(['human', '--replace', 'only this'], env());
    body = readFileSync(MN_FILE, 'utf8');
    expect(body).toContain('only this');
    expect(body).not.toContain('old note');
  });

  it('unknown command exits 2; path prints MN_FILE; version is non-empty', () => {
    expect(runMn(['no-such-cmd'], env()).status).toBe(2);
    runMn(['init'], env());
    expect(runMn(['path'], env()).stdout.trim()).toBe(MN_FILE);
    expect(runMn(['--version'], env()).stdout.trim()).toMatch(/\d+\.\d+/);
  });

  it('bare mn with MN_UI=0 prints card (not TUI crash)', () => {
    runMn(['init'], env());
    runMn(['thread', 'bare-card'], env());
    const r = runMn([], env());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('bare-card');
    expect(r.stdout + r.stderr).not.toMatch(/Invalid hook call/);
  });

  it('cross-stack: bash-written file is parseable by TS with same fields', () => {
    runMn(['init'], env());
    runMn(['thread', 'cross-stack'], env());
    runMn(['now', 'parity'], env());
    runMn(['validate', 'item-a'], env());
    runMn(['status', 'working'], env());
    runMn(['human', 'note'], env());
    runMn(['close', 'decision'], env());
    const note = parseNote(readFileSync(MN_FILE, 'utf8'));
    expect(note.thread).toBe('cross-stack');
    expect(note.now).toBe('parity');
    expect(note.status).toBe('working');
    expect(note.validate).toEqual([{ text: 'item-a', done: false }]);
    expect(note.human).toBe('note');
    expect(note.closed).toEqual(['decision']);
  });

  it('cross-stack: TS writeNoteFile is accepted by mn check/show', async () => {
    const { writeNoteFile, emptyNote } = await import('../tui/src/note.js');
    const n = emptyNote();
    n.thread = 'from-typescript';
    n.description = 'desc';
    n.now = 'now';
    n.status = 'ready';
    n.validate = [{ text: 'ship it', done: false }];
    writeNoteFile(MN_FILE, n);

    const check = runMn(['check'], env());
    expect(check.status).toBe(0);
    const show = runMn(['show'], env());
    expect(show.stdout).toContain('from-typescript');
    expect(show.stdout).toContain('ship it');
  });

  it('migrates legacy PT file on show (on-disk EN headings)', () => {
    const legacy = `${dir}/legacy.md`;
    writeFileSync(
      legacy,
      `# microNote
atualizado: 10:00
estado: working

## Fio
old thread

## Agora
old now

## Validar
- [ ] (nada ainda)

## Humano

## Fechado
- 
`,
      'utf8',
    );
    const r = runMn(['show'], { ...env(), MN_FILE: legacy });
    expect(r.status).toBe(0);
    const body = readFileSync(legacy, 'utf8');
    expect(body).toMatch(/^updated:/m);
    expect(body).toMatch(/^status:/m);
    expect(body).toContain('## Thread');
    expect(body).toContain('old thread');
  });
});
