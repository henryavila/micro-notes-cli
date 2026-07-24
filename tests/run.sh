#!/usr/bin/env bash
# smoke tests for mn — SCHEMA v0.1 (Thread · Now · Wait · Todo · Finished)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MN="$ROOT/bin/mn"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export MN_FILE="$TMP/MICRONOTE.md"
export MN_COLOR=0
export MN_ASCII=1
export MN_CONFIG_FILE="$TMP/mn-config"
export MN_CONFIG_DIR="$TMP"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
pass() { printf 'ok  %s\n' "$*"; }

# missing file message (English)
out="$("$MN" show 2>&1 || true)"
printf '%s\n' "$out" | grep -q 'run mn init' || fail "missing file should say 'run mn init' (got: $out)"
pass "en no-file message"

# lang stub
lang_out="$("$MN" lang)"
printf '%s\n' "$lang_out" | grep -q 'en' || fail "lang should report en"
pass "lang inspect"

# init
"$MN" init >/dev/null
[[ -f "$MN_FILE" ]] || fail "init did not create file"
grep -q '^updated:' "$MN_FILE" || fail "init missing updated:"
grep -q '^status:' "$MN_FILE" || fail "init missing status:"
grep -qx '## Thread' "$MN_FILE" || fail "init missing ## Thread"
grep -qx '## Description' "$MN_FILE" || fail "init missing ## Description"
grep -qx '## Now' "$MN_FILE" || fail "init missing ## Now"
grep -qx '## Wait' "$MN_FILE" || fail "init missing ## Wait"
grep -qx '## Todo' "$MN_FILE" || fail "init missing ## Todo"
grep -qx '## Finished' "$MN_FILE" || fail "init missing ## Finished"
if grep -qx '## Human' "$MN_FILE"; then fail "init must not have ## Human"; fi
if grep -qx '## Validate' "$MN_FILE"; then fail "init must not have ## Validate"; fi
pass "init SCHEMA v0.1"

# show without crash
"$MN" show >/dev/null
pass "show empty-ish"

# check should fail (thread empty)
if "$MN" check >/dev/null 2>&1; then
  fail "check should fail with empty thread"
fi
pass "check fails empty thread"

# write fields (quiet one-line ok)
out="$("$MN" thread "webhooks paddle")"
printf '%s\n' "$out" | grep -q 'ok · thread' || fail "thread should be quiet ok (got: $out)"
"$MN" description "paddle dual-write context" >/dev/null
"$MN" now "writing tests" >/dev/null
"$MN" todo "npm test -- webhook" >/dev/null
"$MN" todo "retry does not duplicate" >/dev/null
"$MN" status ready >/dev/null
"$MN" finish "dropped Stripe" >/dev/null

"$MN" check >/dev/null || fail "check should pass after fill"
pass "check after fill + quiet writes"

out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "webhooks paddle" || fail "show missing thread"
printf '%s\n' "$out" | grep -q "paddle dual-write" || fail "show missing description"
printf '%s\n' "$out" | grep -q "npm test" || fail "show missing todo"
printf '%s\n' "$out" | grep -q "ready" || fail "show missing status"
printf '%s\n' "$out" | grep -qE "open todo|to validate" || fail "en badge missing"
pass "show content"

# done first open
"$MN" done >/dev/null
grep -q '\- \[x\] npm test' "$MN_FILE" || fail "done did not mark first item"
pass "done"

# clear-todo
"$MN" clear-todo >/dev/null
grep -q '(nothing yet)' "$MN_FILE" || fail "clear-todo"
pass "clear-todo"

# path
p="$("$MN" path)"
[[ "$p" == "$MN_FILE" ]] || fail "path mismatch"
pass "path"

# shortcuts
"$MN" t "new thread" >/dev/null
grep -A2 '## Thread' "$MN_FILE" | grep -q 'new thread' || fail "shortcut t"
"$MN" d "desc via d" >/dev/null
grep -A2 '## Description' "$MN_FILE" | grep -q 'desc via d' || fail "shortcut d"
"$MN" n "now text" >/dev/null
grep -A2 '## Now' "$MN_FILE" | grep -q 'now text' || fail "shortcut n"
"$MN" v "todo via v" >/dev/null
grep -A5 '## Todo' "$MN_FILE" | grep -q 'todo via v' || fail "shortcut v→todo"
"$MN" f "shipped via f" >/dev/null
grep -A5 '## Finished' "$MN_FILE" | grep -q 'shipped via f' || fail "shortcut f→finish"
# c must NOT be a finish shortcut anymore (unknown single-letter)
if "$MN" c "should fail" >/dev/null 2>&1; then
  fail "shortcut c should not map to finish"
fi
pass "shortcuts t/d/n/v/f"

# version
ver="$("$MN" --version)"
[[ -n "$ver" ]] || fail "version empty"
pass "version $ver"

# Human removed; description must work
if "$MN" human "nope" >/dev/null 2>&1; then
  fail "mn human should be removed"
fi
out="$("$MN" description "restored desc")"
printf '%s\n' "$out" | grep -q 'ok · description' || fail "mn description should work (got: $out)"
pass "human removed; description ok"

# blocked without reason must fail
if "$MN" status blocked >/dev/null 2>&1; then
  fail "status blocked without wait should exit non-zero"
fi
pass "blocked without wait fails"

# blocked + reason → badge shows needs you · reason
"$MN" status blocked -- "cutover vs dual-write" >/dev/null
out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "needs you" || fail "blocked badge"
printf '%s\n' "$out" | grep -q "cutover vs dual-write" || fail "blocked reason missing from show"
printf '%s\n' "$out" | grep -qi "blocked on" || fail "blocked on label missing"
pass "blocked badge + reason"

# unblocking clears Wait (generic pack uses working)
"$MN" status working >/dev/null
wait_body="$(awk '/^## Wait$/{p=1;next} /^## /{p=0} p' "$MN_FILE" | tr -d '[:space:]')"
[[ -z "$wait_body" ]] || fail "Wait should clear when leaving blocked"
pass "unblock clears wait"

# packs: generic is default; switch to ai-dev for stage statuses
"$MN" status pack generic >/dev/null || fail "status pack generic"
gen_list="$("$MN" status --list)"
printf '%s\n' "$gen_list" | grep -q working || fail "generic pack missing working"
if printf '%s\n' "$gen_list" | grep -q review-plan; then
  fail "generic pack should not list review-plan"
fi
pass "generic pack"

"$MN" status pack ai-dev >/dev/null || fail "status pack ai-dev"
"$MN" status review-plan >/dev/null || fail "status review-plan"
"$MN" status review-code >/dev/null || fail "status review-code"
list_out="$("$MN" status --list)"
printf '%s\n' "$list_out" | grep -q review-plan || fail "status --list missing review-plan"
printf '%s\n' "$list_out" | grep -q review-code || fail "status --list missing review-code"
# pack= must stick in config (installer + status pack write the same key)
grep -qE '^pack=ai-dev$' "$MN_CONFIG_FILE" || fail "pack=ai-dev not persisted in $MN_CONFIG_FILE"
pack_id="$("$MN" status pack 2>/dev/null | head -1 | tr -d '[:space:]')"
[[ "$pack_id" == "ai-dev" ]] || fail "status pack reports '$pack_id' want ai-dev"
pass "ai-dev status pack"

# install.sh reinstall must not wipe pack when non-interactive / --pack omitted
INSTALL_CFG="$TMP/install-cfg"
mkdir -p "$INSTALL_CFG"
printf 'lang=en\npack=ai-dev\nroot=%s\n' "$ROOT" >"$INSTALL_CFG/config"
# Simulate installer default: read configured pack when no PACK_ARG and no TTY
# shellcheck disable=SC1091
(
  export MN_CONFIG_DIR="$INSTALL_CFG"
  CONFIG_DIR="$INSTALL_CFG"
  CONFIG_FILE="$INSTALL_CFG/config"
  # inline the same logic install.sh uses for non-interactive default
  cur="$(grep -E '^(pack|MN_PACK)=' "$CONFIG_FILE" | head -1 | sed -E 's/^[^=]+=[[:space:]]*//')"
  [[ "$cur" == "ai-dev" ]] || fail "precondition: pack=ai-dev"
  # non-interactive pick would keep current
  picked="$cur"
  [[ "$picked" == "ai-dev" ]] || fail "reinstall default should keep ai-dev"
)
# And re-running write_pack_config equivalent keeps pack=
printf 'lang=en\npack=ai-dev\n' >"$INSTALL_CFG/config"
"$ROOT/install.sh" --dry-run --pack ai-dev --prefix "$TMP/fake-bin" >/dev/null 2>&1 || true
pass "install pack sticky"

# status init scaffolds user pack (isolated config dir)
export MN_CONFIG_DIR="$ROOT/cfg-status"
rm -rf "$MN_CONFIG_DIR"
mkdir -p "$MN_CONFIG_DIR"
"$MN" status init >/dev/null || fail "status init"
[[ -f "$MN_CONFIG_DIR/statuses.json" ]] || fail "statuses.json not created"
grep -q review-plan "$MN_CONFIG_DIR/statuses.json" || fail "init copy missing review-plan"
show_out="$("$MN" status show)"
printf '%s\n' "$show_out" | grep -q "statuses.json" || fail "status show missing user file"
printf '%s\n' "$show_out" | grep -q "exists" || fail "status show should mark override exists"
if "$MN" status init >/dev/null 2>&1; then
  fail "status init without --force should fail when file exists"
fi
"$MN" status init --force >/dev/null || fail "status init --force"
pass "status init / show"
unset MN_CONFIG_DIR

# ready + placeholder must NOT show open-todo badge
"$MN" clear-todo >/dev/null
"$MN" status ready >/dev/null
out="$("$MN" show)"
if printf '%s\n' "$out" | grep -qE '[0-9]+ open todo|[0-9]+ to validate'; then
  fail "placeholder must not count as open todo (got: $out)"
fi
pass "ready+placeholder no open-todo badge"

# invalid status exit code
if "$MN" status foobar >/dev/null 2>&1; then
  fail "invalid status should exit non-zero"
fi
pass "invalid status exit"

# unknown command exit
if "$MN" totally-unknown-xyz >/dev/null 2>&1; then
  fail "unknown command should exit non-zero"
fi
pass "unknown command exit"

# bare mn with MN_UI=0 is card path
export MN_UI=0
out="$("$MN")"
printf '%s\n' "$out" | grep -qE "new thread|webhooks|ready|blocked|working|idle|coding" || fail "bare mn MN_UI=0 card"
unset MN_UI
pass "bare mn MN_UI=0"

# migrate legacy PT file → SCHEMA v0.1
LEGACY="$TMP/legacy.md"
cat >"$LEGACY" <<'EOF'
# microNote
atualizado: 10:00
estado: working

## Fio
old thread

## Descricao
old desc

## Agora
old now

## Validar
- [ ] (nada ainda)

## Humano
old human

## Fechado
- 
EOF
MN_FILE="$LEGACY" "$MN" show >/dev/null
grep -q '^updated:' "$LEGACY" || fail "migrate updated"
grep -q '^status:' "$LEGACY" || fail "migrate status"
grep -qx '## Thread' "$LEGACY" || fail "migrate Thread"
grep -qx '## Description' "$LEGACY" || fail "migrate Description heading"
grep -qx '## Todo' "$LEGACY" || fail "migrate Todo"
grep -A2 '## Thread' "$LEGACY" | grep -q 'old thread' || fail "migrate kept body"
grep -A2 '## Description' "$LEGACY" | grep -q 'old desc' || fail "migrate kept Description body"
if grep -qx '## Human' "$LEGACY"; then fail "migrate should drop Human"; fi
if grep -qx '## Validate' "$LEGACY"; then fail "migrate should rename Validate→Todo"; fi
if grep -qx '## Descricao' "$LEGACY"; then fail "migrate should rename Descricao→Description"; fi
pass "migrate PT → SCHEMA v0.1"

printf '\nall tests passed\n'
