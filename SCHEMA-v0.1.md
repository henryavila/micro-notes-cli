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
| 1 | Ask-of-me / blocked-on-human | via **status=blocked** + **Wait** + **Need** | First-class attention |
| 2 | Next human action | **Need** checklist | Human-facing only |
| 3 | Wait-on | **Wait** | Distinct from Now |
| 4 | Risk / blast radius / don’t-touch | **Closed** (as decisions) or optional later **Hold** | Avoid second prose dump |
| 5 | Done-when | optional catalog later | Not default |
| 6 | Last agent ask | fold into **Wait** / **Need** | Don’t duplicate Thread |
| 7 | Handle (branch/label) | **Thread** | Pane title may already show path |
| 8 | Link / PR | optional catalog later | One token in Thread is enough for v0.1 |
| 9 | Collision / ownership | optional later | Multi-agent only |
| 10 | Freshness | **updated** meta | Always |

**Anti-topics (never sections):** Human, Description-as-essay, History/Log, Diff/files, Agent todos, Chat summary, Commit SHAs, long plans.

**Live signal:** existing cards fill Thread + Now and leave Description / Human / Closed empty → drop dead weight.

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

## Need
- [ ] (nothing yet)

## Closed
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
| `need` | Need | checklist | append / toggle done / clear | has placeholder or ≥1 item; when `ready` ≥1 open preferred | Q4 |
| `closed` | Closed | bullet list | append | heading present (body may be empty) | don’t re-argue |

### Field culture

| Field | Rule |
|-------|------|
| **Thread** | Label, not essay (~80 chars). e.g. `Paddle webhooks — idempotency` |
| **Now** | Present state only. **Overwrite always.** |
| **Wait** | One sentence: what stream is waiting on. Clear when unblocked. |
| **Need** | Human verify/decide items only — not agent task graph. Cap ~7 open. |
| **Closed** | Settled decisions, one line each. No timestamps. |

### Status ↔ body coupling (`mn check` later)

| status | Expected |
|--------|----------|
| `idle` | Thread set; Wait empty |
| `working` | Now fresh; Wait empty |
| `blocked` | **Wait non-empty**; Need = decisions/questions |
| `ready` | Wait empty; **≥1 open Need item** |

### Removed vs previous draft

| Old | Action |
|-----|--------|
| **Human** | **Delete** — tautology on a human-only card |
| **Description** | **Delete from default** — diary-creep; long context lives in plan/PR/session |
| **Validate** | **Rename → Need** (covers verify *and* decide under `blocked`) |

---

## 4. CLI / TUI surface (v0.1)

| Command | Key | Effect |
|---------|-----|--------|
| `mn thread "…"` | `t` | replace Thread |
| `mn now "…"` | `n` | replace Now |
| `mn wait "…"` | `w` | replace Wait |
| `mn need "…"` | `e` | append Need checkbox *(or keep `v` as alias)* |
| `mn done …` | space/x in TUI | mark Need done |
| `mn status …` | `s` | set status |
| `mn close "…"` | `c` | append Closed |
| `mn clear-need` | — | reset Need placeholder |

**Removed:** `mn human`, `mn description`, keys `h` / `d` (free for remap).

**Aliases for muscle memory (optional):** `mn validate` → `need`, `mn fio` legacy drop (EN-only).

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
2. **Default profile** enables: `thread`, `now`, `wait`, `need`, `closed`.
3. **User profile** may:
   - hide optional sections (e.g. hide `closed`, hide `wait` if they hate it — not recommended)
   - reorder enabled sections
   - rename **display** headings (UI; prefer EN on disk for agents)
   - enable **catalog optionals** later: `hold`, `links`, `done_when`
4. User may **not**:
   - invent new types
   - change status enum
   - remove core identity: `status`, `thread`, `need` (minimum product)

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
    { "id": "need",   "heading": "Need",   "type": "checklist", "required": true,  "cli": "need",   "key": "e", "mode": "append",
      "placeholder": "(nothing yet)" },
    { "id": "closed", "heading": "Closed", "type": "list",      "required": false, "cli": "close",  "key": "c", "mode": "append" }
  ]
}
```

**On disk MD:** prefer canonical English headings from schema (or fixed IDs mapped to EN) so agents/`mn need` stay stable.  
**CLI verbs:** always English (`thread`, `need`, …) — never renamed with labels.

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
→ schema: default (Thread, Now, Wait, Need, Closed)
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
- At least `thread` + `need` + status meta present  
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
| Default schema v0.1 only (drop Human/Description, add Wait, rename Need) | Small–medium (one coherent break) |
| Internal `schemas/default.json` + loaders | Medium |
| User override + install copy + validate | Medium (after SSOT) |
| Freeform D/E | Large — defer |

---

## 6. Migration (pre-production)

Breaking is OK. Suggested one-shot rules if old files exist:

| Old heading | Action |
|-------------|--------|
| Human | drop body (or append non-empty lines into Closed as decisions) |
| Description | drop (or one-line into Thread if Thread empty) |
| Validate | rename → Need |
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
Need    ☐ npm test -- webhook
        ☐ same key does not double-charge
Closed  • Stripe discarded — Paddle only
```

### blocked

```text
⛔ blocked · 14:41

Thread  inbox → UI import
Now     stopped at dual-write decision
Wait    decide: cutover now vs dual-write 1 week
Need    ☐ pick cutover vs dual-write
        ☐ if cutover: no open inbox jobs
Closed  • skill owns card creation end-to-end
```

### working (ignore)

```text
… working · 14:28

Thread  PR2/PR4 merge conflicts
Now     resolving package-lock
Wait    —
Need    ☐ smoke web after merge
Closed  —
```

---

## 8. Open decisions (need your call)

1. **Rename Validate → Need** — recommended yes; or keep `Validate` for continuity?  
2. **Wait as first-class** — recommended yes; or fold into Need only?  
3. **Custom schema scope in first ship** — (a) default only + SSOT file in repo, (b) user `schema.json` hide/reorder/relabel, (c) full install wizard  
4. **CLI key for Need** — `e` vs keep `v` (validate muscle memory)  
5. **Version string** — bump package/`MN_VERSION` to `0.1.0` for the redesign?

---

## 9. Implementation order (when approved)

1. Lock answers in §8  
2. Add `schemas/default.json` + rewrite template  
3. Update `note.ts` parse/serialize + drop Human/Description  
4. Update `bin/mn` commands/check/show/menu  
5. Update TUI keys + render (dim empty Wait/Closed)  
6. Rewrite tests  
7. (Optional same release) schema loader + `mn schema show|init` + install copy  
8. Align README + PLAN; set version `0.1.0`

---

## 10. One-line product + schema

> **microNote v0.1** is a human sticky per worktree: **status + Thread + Now + Wait + Need + Closed** — re-enter in seconds; agents may fill it, never own it.  
> **Customization** is a validated profile over a fixed section catalog, not freeform markdown types.
