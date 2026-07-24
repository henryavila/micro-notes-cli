# micro-notes-cli

**microNote** — human re-entry card for multi-agent work (Herdr, multi-worktree).

- **CLI** (`bin/mn`) — agents & scripts: quiet writes, `check`, one-shot `show`
- **TUI** (`mn` / `mn ui`) — blink + Ink live card (no terminal pollution)

Language: **English only** for now (file format + commands + UI). pt-BR later.

## Install

```bash
cd /path/to/micro-notes-cli
./install.sh --link          # symlink bin/mn (dev)
npm install                  # TUI deps (blink-tui, ink, react)
```

Requires **Node ≥ 18** for the TUI. CLI bash works without Node.

## Quickstart

```bash
cd /path/to/worktree
mn init
mn thread "webhooks Paddle — idempotency"
mn description "long context so re-entry makes sense…"
mn now "writing tests"
mn validate "npm test -- webhook"
mn status ready

mn              # TTY → blink TUI
mn show         # one-shot card (no TUI)
mn ui           # force TUI
```

Writes print one line only:

```text
ok · thread · webhooks Paddle — idempotency
```

The TUI (or `mn show` / side pane) owns the full card.

## TUI keys

| Key | Action |
|-----|--------|
| `t` | edit thread (short label) |
| `d` | edit description (long context) |
| `n` | edit now |
| `v` | add validate item |
| `s` | status picker |
| `h` | human note |
| `c` | close decision |
| `j`/`k` or arrows | move validate focus |
| `space` / `x` | toggle validate item |
| `r` | reload file |
| `i` | init file if missing |
| `?` | help |
| `q` | quit |

External `mn thread …` / agent writes update the file; the TUI **reloads** via `fs.watch`.

## File format (`MICRONOTE.md`)

```markdown
# microNote
updated: HH:MM
status: idle|working|blocked|ready

## Thread
short label

## Description
long re-entry context

## Now
what is happening

## Validate
- [ ] (nothing yet)

## Human

## Closed
-
```

Legacy PT files (`## Fio`, `atualizado:`, …) migrate automatically.

| Section | Role |
|---------|------|
| **Thread** | Short label |
| **Description** | Long background for re-entry |
| **Now** | Current activity |
| **Validate** | Human checklist |
| **Human** | Human-only notes |
| **Closed** | Settled decisions |

## Commands

| Command | Effect |
|---------|--------|
| `mn` | TUI on TTY; else one-shot card |
| `mn ui` | blink TUI |
| `mn show` | one-shot card |
| `mn watch [n]` | full-screen refresh loop |
| `mn init` | create file |
| `mn thread "…"` | set thread (quiet) |
| `mn description [--append] "…"` | set/append description |
| `mn now "…"` | set now |
| `mn validate "…"` | add checklist item |
| `mn status idle\|working\|blocked\|ready` | set status |
| `mn human [--replace] "…"` | human note |
| `mn close "…"` | closed decision |
| `mn done [n\|text]` | mark validate done |
| `mn clear-validate` | reset checklist |
| `mn check` | structure gate (exit 0/1) |
| `mn path` | print path |
| `mn +` | menu |
| `mn help` | help |

**Shortcuts:** `t` `d` `n` `v` `s` `h` `c`

## Env

| Var | Effect |
|-----|--------|
| `MN_FILE` | card path |
| `MN_UI=0` | bare `mn` uses one-shot card (no TUI) |
| `MN_COLOR=0` / `NO_COLOR` | no color (CLI card) |
| `MN_ASCII=1` | ASCII symbols (CLI) |
| `MN_WATCH_INTERVAL` | `mn watch` seconds |

## Architecture

```text
MICRONOTE.md
    ↑ write (atomic)
    │
    ├─ bin/mn          bash CLI (agents, gates, quiet writes)
    └─ tui/            Node + @henryavila/blink-tui + ink
         note.ts       parse/serialize (shared format)
         App.tsx       live card + keys + fs.watch
```

## Tests

```bash
bash tests/run.sh    # CLI smoke
npm test             # note.ts unit tests
```

## Dev

```bash
npm run tui          # tsx tui/src/index.tsx
npm run build:tui    # optional bundle → tui/dist
```
