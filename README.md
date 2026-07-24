# micro-notes-cli

**microNote** — human re-entry card for multi-agent / multi-worktree work (Herdr side panes).

- **CLI** (`bin/mn`) — agents & scripts: quiet writes, `check`, one-shot `show`
- **TUI** (`mn` / `mn ui`) — blink + Ink live card (no terminal pollution)

Language: **English only** for now (file format + commands + UI). pt-BR later.

Default **status pack: `ai-dev`** — stages for design → plan → implement → review with AI agents. Override via `~/.config/mn/statuses.json` or `MN_STATUSES`.

## Install

```bash
cd /path/to/micro-notes-cli
./install.sh --link          # symlink ~/.local/bin/mn → repo (dev; live updates)
npm install                  # TUI deps (blink-tui, ink, react)
```

Requires **Node ≥ 18** for the TUI and for `scripts/status-catalog.mjs` (status list / glyphs). Pure bash card still works; catalog falls back to a static list if Node is missing.

Ensure `~/.local/bin` is on `PATH` (the installer can write a shell rc block).

## Quickstart

```bash
cd /path/to/worktree
mn init
mn thread "webhooks Paddle — idempotency"
mn description "long context so re-entry makes sense…"
mn now "writing tests"
mn validate "npm test -- webhook"
mn status coding
# or: mn status review-plan | review-code | ready | …

mn status blocked -- "cutover now vs dual-write?"   # Wait required
mn wait "need product decision on API shape"         # update reason

mn              # TTY → blink TUI
mn show         # one-shot card (no TUI)
mn ui           # force TUI
mn status --list
```

Writes print one line only:

```text
ok · thread · webhooks Paddle — idempotency
ok · status · blocked · cutover now vs dual-write?
```

The TUI (or `mn show` / side pane) owns the full card.

## Status pack (ai-dev)

Statuses answer **can I ignore this pane?** vs **do I need to act?** — not “who is working” (the agent always acts).

| id | glyph | intent | When |
|----|-------|--------|------|
| `idle` | ○ | ignore | Nothing in flight |
| `designing` | ◈ | ignore | Design / brainstorm in progress |
| `await-design` | ◇ | **act** | Approve design / critic gate |
| `planning` | ▤ | ignore | Plan / decompose / materialize prep |
| `review-plan` | ▣ | **act** | review-plan triage / approve plan |
| `coding` | ◉ | ignore | Implementation in progress |
| `review-code` | ◐ | **act** | review-code / decision-review triage |
| `blocked` | ! | **act** | Product decision (not a review) — **requires Wait** |
| `ready` | ► | **act** | Human validate / phase-done / accept |

- **Alias:** `working` → `coding` (legacy)
- **List:** `mn status --list`
- Detail of *what* is happening goes in **Now** / **todo**; status is only the stage + attention

### Custom status pack (personalize)

You do **not** need to hand-create the file from scratch. Scaffold, edit, verify:

```bash
mn status init              # copy default → ~/.config/mn/statuses.json
mn status edit              # $EDITOR on that file
mn status --list            # verify effective catalog
mn status show              # which file is active + paths
```

| Command | What it does |
|---------|----------------|
| `mn status init` | Create `~/.config/mn/statuses.json` from the shipped ai-dev pack |
| `mn status init --force` | Overwrite user pack with the default again |
| `mn status edit` | Open the user pack in `$EDITOR` / `$VISUAL` / `vi` |
| `mn status show` | Active source path + effective list |
| `mn status help` | Full catalog help |

**Resolution order** (first hit wins):

1. `$MN_STATUSES` (path to a JSON file)
2. `statuses=` in `~/.config/mn/config`
3. `~/.config/mn/statuses.json`
4. `schemas/statuses.default.json` (shipped ai-dev pack)

**JSON shape** (same as the default file):

```json
{
  "version": 1,
  "pack": "my-pack",
  "order": ["idle", "coding", "blocked", "ready"],
  "aliases": { "working": "coding" },
  "statuses": {
    "idle":    { "intent": "ignore", "glyph": "○", "label": "idle" },
    "coding":  { "intent": "ignore", "glyph": "◉", "label": "building" },
    "blocked": { "intent": "act", "glyph": "!", "label": "blocked", "badge": "needs you", "requiresWait": true },
    "ready":   { "intent": "act", "glyph": "►", "label": "ready", "badge": "validate" }
  }
}
```

Rules:

| Field | Meaning |
|-------|---------|
| `intent` | **`ignore`** (you can skip the pane) or **`act`** (you must look) — required |
| `glyph` | Prefer **width-1** characters (Pane title border) |
| `label` | Human text in picker / title |
| `badge` | Optional header aside when `act` |
| `requiresWait` | If `true`, `## Wait` is required (same rules as `blocked`) |
| `order` | If present, **replaces** the full picker order |
| `aliases` | Old id → canonical id (`working` → `coding`) |

Partial override: you can keep only the statuses you change; the loader **deep-merges** by id onto the default. If you set `order`, list every id you want in the picker.

There is **no** freeform section schema yet (Thread/Now/Wait/… stay fixed). Personalization today is the **status catalog** only.

### Blocked + Wait

When status **requires wait** (`blocked`):

- `mn status blocked` **fails** if `## Wait` is empty
- `mn status blocked -- "reason"` or `mn wait "reason"` sets it
- Card shows **blocked on** first (CLI + TUI)
- Leaving blocked (any other status) **clears** Wait

## TUI keys

| Key | Action |
|-----|--------|
| `t` | edit thread (short label) |
| `d` | edit details (description on disk; muted under thread) |
| `n` | edit now |
| `w` | blocked on (`## Wait` — required when blocked) |
| `v` | add todo (validate item) |
| `s` | status picker (full catalog) |
| `h` | human note |
| `c` | close decision |
| `j` / `k` or arrows | move todo focus |
| `space` / `x` | toggle todo item |
| `r` | reload file |
| `i` | init file if missing |
| `?` | help |
| `q` | quit |

Footer chips (priority order; drops from the right on narrow terminals):  
`t` `n` `w`\* `v` `s` `sp` `h` `c` `d` `?` `q` — \*`w` only while blocked.

Empty sections are **hidden** (no `(empty)` placeholders). Thread always shows (hint `set with t` if blank). Description sits **flush under thread** body (same indent, muted).

External `mn thread …` / agent writes update the file; the TUI **reloads** via `fs.watch`.

## File format (`MICRONOTE.md`)

```markdown
# microNote
updated: HH:MM
status: idle|designing|await-design|planning|review-plan|coding|review-code|blocked|ready

## Thread
short label

## Description
long re-entry context (shown muted under thread in UI)

## Now
what is happening

## Wait
what is blocking (required when status=blocked; cleared when unblocked)

## Validate
- [ ] (nothing yet)

## Human

## Closed
-
```

Legacy PT files (`## Fio`, `atualizado:`, `## Espera` / `## Bloqueio`, …) migrate automatically on read/write.

| Section | Role |
|---------|------|
| **Thread** | Short stream label (required for `mn check`) |
| **Description** | Long background; UI: secondary under thread |
| **Now** | Current activity |
| **Wait** | What is blocking — required when `blocked` |
| **Validate** | Human checklist (todo in TUI) |
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
| `mn wait "…"` | set what is blocking |
| `mn validate "…"` | add checklist item |
| `mn status <id>` | set status from catalog |
| `mn status --list` | list glyph · id · label · intent |
| `mn status show` | active pack path + list |
| `mn status init [--force]` | scaffold user `statuses.json` |
| `mn status edit` | open user pack in `$EDITOR` |
| `mn status help` | catalog + custom pack docs |
| `mn status blocked -- "reason"` | blocked + Wait in one shot |
| `mn human [--replace] "…"` | human note |
| `mn close "…"` | closed decision |
| `mn done [n\|text]` | mark validate done |
| `mn clear-validate` | reset checklist |
| `mn check` | structure gate (exit 0/1; enforces Wait when blocked) |
| `mn path` | print path |
| `mn +` | interactive menu |
| `mn help` | help |
| `mn touch` | stamp `updated:` only |

**CLI shortcuts:** `t` `d` `n` `w` `v` `s` `h` `c`

## Env

| Var | Effect |
|-----|--------|
| `MN_FILE` | card path (default `./MICRONOTE.md`) |
| `MN_UI=0` | bare `mn` uses one-shot card (no TUI) |
| `MN_COLOR=0` / `NO_COLOR` | no color (CLI card) |
| `MN_ASCII=1` | ASCII symbols (CLI) |
| `MN_WATCH_INTERVAL` | `mn watch` seconds |
| `MN_STATUSES` | path to statuses JSON override |
| `MN_CONFIG_DIR` | config dir (default `~/.config/mn`) |
| `MN_ROOT` | repo root (TUI / catalog discovery) |
| `MN_TUI_LAUNCHER` | path to `tui/bin/mn-ui.mjs` |

## Architecture

```text
MICRONOTE.md
    ↑ write (atomic)
    │
    ├─ bin/mn                 bash CLI (agents, gates, quiet writes)
    │    scripts/status-catalog.mjs   Node bridge → status pack
    │    schemas/statuses.default.json
    └─ tui/
         note.ts              parse/serialize (shared format + Wait)
         status-catalog.ts    load / merge / resolve statuses
         App.tsx              live card + keys + fs.watch
```

## Tests

```bash
npm test             # vitest: note, TUI keys/smoke, real mn process, e2e spawn
bash tests/run.sh    # bash CLI smoke (status pack, Wait, migrate)
```

## Dev

```bash
npm run tui          # tsx tui/src/index.tsx
npm run build:tui    # optional bundle → tui/dist
mn status --list     # verify catalog after edits to schemas/
```
