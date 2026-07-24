# microNote — Schema v0.1 (design)

**Status:** design proposal — product not in production; this **is** the launch schema (not a “v2 migration”).  
**Audience of the product:** human re-entry across multi-agent / multi-worktree panes.  
**Not the audience:** agents (they may fill the card as convenience only).

---

## 1. Business intent (locked)

| Item | Value |
|------|--------|
| **Problem** | Jumping between 3–4 agent pages/worktrees: forget thread, now-state, whether you must act, what to verify/decide |
| **Job** | Sticky re-entry card per worktree: glance → act / wait / leave |
| **Success** | Re-entry &lt; 20s; header alone answers act-or-ignore in &lt; 2s |
| **Non-goals** | Agent session handoff, orchestration, diff review, diary, cross-stream dashboard |

**Four re-entry questions**

| # | Question | Failure without it |
|---|----------|--------------------|
| Q1 | Which stream is this? | Wrong mental model |
| Q2 | What is happening *now*? | Re-read agent scroll |
| Q3 | Do I need to act? | Interrupt working / ignore blocked |
| Q4 | If I act, what exactly? | Vague “looks done?” |

---

## 2. Research summary (agents)

Topics ranked for multi-agent re-entry (30 min away):

| Rank | Topic family | Keep as section? | Notes |
|------|--------------|------------------|--------|
| 1 | Ask-of-me / blocked-on-human | via **status=blocked** + **Wait** + **Todo** | First-class attention |
| 2 | Next human action | **Todo** checklist | Human-facing only |
| 3 | Wait-on | **Wait** | Distinct from Now |
| 4 | Risk / blast radius / don’t-touch | **Finished** (as decisions) or optional later **Hold** | Avoid second prose dump |
| 5 | Done-when | optional catalog later | Not default |
| 6 | Last agent ask | fold into **Wait** / **Todo** | Don’t duplicate Thread |
| 7 | Handle (branch/label) | **Thread** | Pane title may already show path |
| 8 | Link / PR | optional catalog later | One token in Thread is enough for v0.1 |
| 9 | Collision / ownership | optional later | Multi-agent only |
| 10 | Freshness | **updated** meta | Always |

**Anti-topics (never sections):** Human, Description-as-essay, History/Log, Diff/files, Agent todos, Chat summary, Commit SHAs, long plans.

**Live signal:** existing cards fill Thread + Now and leave Description / Human / Finished empty → drop dead weight.

---

## 3. Default schema v0.1

### Template

```markdown
# microNote
updated: HH:MM
status: idle|working|blocked|ready

## Thread
short label — stream identity

## Now
one line: what is happening

## Wait

## Todo
- [ ] (nothing yet)

## Finished
-
```

### Meta

| Field | Type | Rule |
|-------|------|------|
| `updated` | time `HH:MM` | Stamped on every write |
| `status` | enum | `idle` \| `working` \| `blocked` \| `ready` — **product-fixed** |

| status | Human meaning | Header |
|--------|---------------|--------|
| `idle` | Nothing in flight | ignore |
| `working` | Agent busy — don’t poke | ignore |
| `blocked` | **Needs you** (decision/input) | act |
| `ready` | **Needs you** (verify/accept) | act |

### Sections

| ID | Heading | Type | Write mode | Required for `check` | Answers |
|----|---------|------|------------|----------------------|---------|
| `thread` | Thread | prose (single-line culture) | replace | yes (non-empty) | Q1 |
| `now` | Now | prose (1–2 lines) | replace (never append) | no | Q2 |
| `wait` | Wait | prose (single-line) | replace | when `status=blocked` | Q3/Q4 blocker |
| `todo` | Todo | checklist | append / toggle done / clear | has placeholder or ≥1 item; when `ready` ≥1 open preferred | Q4 |
| `finished` | Finished | bullet list | append | heading present (body may be empty) | don’t re-argue |

### Field culture

| Field | Rule |
|-------|------|
| **Thread** | Label, not essay (~80 chars). e.g. `Paddle webhooks — idempotency` |
| **Now** | Present state only. **Overwrite always.** |
| **Wait** | One sentence: what stream is waiting on. Clear when unblocked. |
| **Todo** | Human verify/decide items only — not agent task graph. Cap ~7 open. |
| **Finished** | Settled decisions, one line each. No timestamps. (legacy heading: Closed) |

### Status ↔ body coupling (`mn check` later)

| status | Expected |
|--------|----------|
| `idle` | Thread set; Wait empty |
| `working` | Now fresh; Wait empty |
| `blocked` | **Wait non-empty**; Todo = decisions/questions |
| `ready` | Wait empty; **≥1 open Todo item** |

### Removed vs previous draft

| Old | Action |
|-----|--------|
| **Human** | **Delete** — tautology on a human-only card |
| **Description** | **Delete from default** — diary-creep; long context lives in plan/PR/session |
| **Validate** | **Rename → Todo** (covers verify *and* decide under `blocked`) |

---

## 4. CLI / TUI surface (v0.1)

| Command | Key | Effect |
|---------|-----|--------|
| `mn thread "…"` | `t` | replace Thread |
| `mn now "…"` | `n` | replace Now |
| `mn wait "…"` | `w` | replace Wait |
| `mn todo "…"` | `v` | append Todo checkbox (`e` alias) |
| `mn done …` | space/x in TUI | mark Todo done |
| `mn status …` | `s` | set status |
| `mn finish "…"` | `f` | append Finished (`close` alias) |
| `mn clear-todo` | `c` → all todos | reset Todo placeholder |
| — | `d` / backspace | remove focused Todo item |
| — | `c` | clear menu: done / all todos / now+wait / everything (keep Thread) |

**Removed:** `mn human`, `mn description`. Free key: `h`. Finished = `f`; Clear = `c`. `d` = delete focused todo.

**Aliases for muscle memory (optional):** `mn validate` → `todo`, `mn fio` legacy drop (EN-only).

---

## 5. Custom schema — feasibility & design

### Verdict

| Question | Answer |
|----------|--------|
| Fully freeform schema at install (arbitrary headings/types)? | **Possible, not product-wise for v0.1** — dual parsers (bash + Node), unstable agent contract, card loses shared vocabulary |
| Configurable schema at all? | **Yes — constrained customization** |
| Hardcoded today? | **Fully** — template, `bin/mn`, `note.ts`, `App.tsx`, tests, docs (no SSOT) |

### Levels

| Level | Meaning | v0.1 |
|-------|---------|------|
| A | Fixed default only | baseline ship |
| B | Rename **display** labels | optional stretch |
| C | Reorder / hide **optional** catalog sections | **recommended path for “personalize”** |
| D | User invents arbitrary sections | **no** (preserve unknown headings only) |
| E | Full declarative types + custom status enums | **no** |

### Recommended model: **catalog + profile** (not freeform)

1. **Product owns a fixed catalog of section IDs and types** (engine understands only known types: `prose` | `checklist` | `list` + fixed status meta).
2. **Default profile** enables: `thread`, `now`, `wait`, `todo`, `finished`.
3. **User profile** may:
   - hide optional sections (e.g. hide `finished`, hide `wait` if they hate it — not recommended)
   - reorder enabled sections
   - rename **display** headings (UI; prefer EN on disk for agents)
   - enable **catalog optionals** later: `hold`, `links`, `done_when`
4. User may **not**:
   - invent new types
   - change status enum
   - remove core identity: `status`, `thread`, `todo` (minimum product)

### File format — `schema.json`

Path resolution (later):

1. `$MN_SCHEMA` if set  
2. `schema=` in `~/.config/mn/config`  
3. `~/.config/mn/schema.json` if present  
4. Built-in default (repo `schemas/default.json`)

```json
{
  "version": 1,
  "title": "microNote",
  "meta": {
    "statuses": ["idle", "working", "blocked", "ready"]
  },
  "sections": [
    { "id": "thread", "heading": "Thread", "type": "prose",     "required": true,  "cli": "thread", "key": "t", "mode": "replace" },
    { "id": "now",    "heading": "Now",    "type": "prose",     "required": false, "cli": "now",    "key": "n", "mode": "replace" },
    { "id": "wait",   "heading": "Wait",   "type": "prose",     "required": false, "cli": "wait",   "key": "w", "mode": "replace",
      "required_when_status": ["blocked"] },
    { "id": "todo",   "heading": "Todo",   "type": "checklist", "required": true,  "cli": "todo",   "key": "v", "mode": "append",
      "placeholder": "(nothing yet)" },
    { "id": "finished", "heading": "Finished", "type": "list", "required": false, "cli": "finish", "key": "f", "mode": "append" }
  ]
}
```

**On disk MD:** prefer canonical English headings from schema (or fixed IDs mapped to EN) so agents/`mn todo` stay stable.  
**CLI verbs:** always English (`thread`, `todo`, `finish`, …) — never renamed with labels. Legacy: `close` → `finish`, heading `Closed` → `Finished`.

### Install UX

| Approach | Decision |
|----------|----------|
| Interactive freeform wizard | **No** |
| Install copies default schema + points config | **Yes** |
| Prompt: “Use default schema? [Y/n] — if n, open/edit `~/.config/mn/schema.json`” | **Yes (light)** |
| `mn schema show` / `mn schema init` | **Yes** post-install |
| Project-local schema per worktree | **Later** (agents hopping trees need one mental model first) |

Example install flow:

```text
→ schema: default (Thread, Now, Wait, Todo, Finished)
  customize later: mn schema init && $EDITOR ~/.config/mn/schema.json
```

Or non-interactive:

```bash
./install.sh --schema default
./install.sh --schema-file ./my-schema.json   # validated against catalog
```

**Validation rules for user schema**

- `version` present and supported  
- Every `id` ∈ product catalog (or known optional catalog)  
- `type` matches catalog for that `id`  
- At least `thread` + `todo` + status meta present  
- No duplicate `id` / `key` / `cli`  
- Fail closed with clear error if invalid  

### Implementation prerequisite (before user schema loads)

Extract **one SSOT** used by:

- `templates/MICRONOTE.md` (generated or checked)  
- `bin/mn` (source or generate `schema.sh`)  
- `tui/src/note.ts` + App  
- tests  

Without SSOT, “custom schema” doubles CLI/TUI drift.

**Complexity estimate**

| Work | Effort |
|------|--------|
| Default schema v0.1 only (drop Human/Description, add Wait, rename Todo) | Small–medium (one coherent break) |
| Internal `schemas/default.json` + loaders | Medium |
| User override + install copy + validate | Medium (after SSOT) |
| Freeform D/E | Large — defer |

---

## 6. Migration (pre-production)

Breaking is OK. Suggested one-shot rules if old files exist:

| Old heading | Action |
|-------------|--------|
| Human | drop body (or append non-empty lines into Finished as decisions) |
| Closed | rename → Finished |
| Description | drop (or one-line into Thread if Thread empty) |
| Validate | rename → Todo |
| Fio/Agora/… PT | drop PT migration long-term; one-shot map if still present |

No dual-format support after v0.1 ship — keep the tool thin.

---

## 7. Examples

### ready

```text
▶ ready · 14:32

Thread  Paddle webhooks — idempotency
Now     tests green; PR open
Wait    —
Todo    ☐ npm test -- webhook
        ☐ same key does not double-charge
Finished  • Stripe discarded — Paddle only
```

### blocked

```text
⛔ blocked · 14:41

Thread  inbox → UI import
Now     stopped at dual-write decision
Wait    decide: cutover now vs dual-write 1 week
Todo    ☐ pick cutover vs dual-write
        ☐ if cutover: no open inbox jobs
Finished  • skill owns card creation end-to-end
```

### working (ignore)

```text
… working · 14:28

Thread  PR2/PR4 merge conflicts
Now     resolving package-lock
Wait    —
Todo    ☐ smoke web after merge
Finished  —
```

---

## 8. Open decisions (resolved in code)

1. **Rename Validate → Todo** — **yes** (disk `## Todo`; parse legacy `## Validate` / `## Need`)  
2. **Wait as first-class** — **yes**  
3. **Custom schema scope** — **(a) default sections only** for now; status pack is separate (`statuses.json` ai-dev)  
4. **CLI key for Todo** — **`v` primary** (and `e` alias); command `mn todo` (`mn need` / `mn validate` aliases)  
5. **Version string** — leave package version as-is until release cut  
6. **Status enum** — SCHEMA lists 4 fixed statuses; **product uses ai-dev pack** (idle…ready + design/plan/code stages) via catalog — intentional extension, not a regression  

---

## 9. Implementation order (when approved)

1. Lock answers in §8  
2. Add `schemas/default.json` + rewrite template  
3. Update `note.ts` parse/serialize + drop Human/Description; checklist = Todo  
4. Update `bin/mn` commands/check/show/menu  
5. Update TUI keys + render  
6. Rewrite tests  
7. (Optional same release) schema loader + `mn schema show|init` + install copy  
8. Align README + PLAN; set version `0.1.0`

---

## 10. One-line product + schema

> **microNote v0.1** is a human sticky per worktree: **status + Thread + Now + Wait + Todo + Finished** — re-enter in seconds; agents may fill it, never own it.  
> **Customization** is a validated profile over a fixed section catalog, not freeform markdown types.
