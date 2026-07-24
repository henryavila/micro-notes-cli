#!/usr/bin/env bash
# smoke tests for mn
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
pass "init"

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
"$MN" description "long context about paddle webhooks and why idempotency matters" >/dev/null
"$MN" now "writing tests" >/dev/null
"$MN" validate "npm test -- webhook" >/dev/null
"$MN" validate "retry does not duplicate" >/dev/null
"$MN" status ready >/dev/null
"$MN" human "do not touch billing" >/dev/null
"$MN" close "dropped Stripe" >/dev/null

"$MN" check >/dev/null || fail "check should pass after fill"
pass "check after fill + quiet writes"

out="$("$MN" show)"
printf '%s\n' "$out" | grep -q "webhooks paddle" || fail "show missing thread"
printf '%s\n' "$out" | grep -q "long context about paddle" || fail "show missing description"
printf '%s\n' "$out" | grep -q "npm test" || fail "show missing validate"
printf '%s\n' "$out" | grep -q "ready" || fail "show missing status"
printf '%s\n' "$out" | grep -q "to validate" || fail "en badge missing"
pass "show content"

# description append
"$MN" description --append "second paragraph" >/dev/null
grep -A5 '## Description' "$MN_FILE" | grep -q 'second paragraph' || fail "description --append"
pass "description --append"

# done first open
"$MN" done >/dev/null
grep -q '\- \[x\] npm test' "$MN_FILE" || fail "done did not mark first item"
pass "done"

# clear-validate
"$MN" clear-validate >/dev/null
grep -q '(nothing yet)' "$MN_FILE" || fail "clear-validate"
pass "clear-validate"

# path
p="$("$MN" path)"
[[ "$p" == "$MN_FILE" ]] || fail "path mismatch"
pass "path"

# shortcuts
"$MN" t "new thread" >/dev/null
grep -A2 '## Thread' "$MN_FILE" | grep -q 'new thread' || fail "shortcut t"
"$MN" d "new desc" >/dev/null
grep -A2 '## Description' "$MN_FILE" | grep -q 'new desc' || fail "shortcut d"
"$MN" n "now text" >/dev/null
grep -A2 '## Now' "$MN_FILE" | grep -q 'now text' || fail "shortcut n"
pass "shortcuts t/d/n"

# version
ver="$("$MN" --version)"
[[ -n "$ver" ]] || fail "version empty"
pass "version $ver"

# human --replace
"$MN" human --replace "only this" >/dev/null
body="$(awk '/^## Human$/{p=1;next} /^## /{p=0} p' "$MN_FILE")"
printf '%s\n' "$body" | grep -q 'only this' || fail "human replace"
if printf '%s\n' "$body" | grep -q 'do not touch'; then
  fail "human replace kept old"
fi
pass "human --replace"

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

# unblocking clears Wait
"$MN" status coding >/dev/null
wait_body="$(awk '/^## Wait$/{p=1;next} /^## /{p=0} p' "$MN_FILE" | tr -d '[:space:]')"
[[ -z "$wait_body" ]] || fail "Wait should clear when leaving blocked"
pass "unblock clears wait"

# ai-dev pack statuses + list
"$MN" status review-plan >/dev/null || fail "status review-plan"
"$MN" status review-code >/dev/null || fail "status review-code"
list_out="$("$MN" status --list)"
printf '%s\n' "$list_out" | grep -q review-plan || fail "status --list missing review-plan"
printf '%s\n' "$list_out" | grep -q review-code || fail "status --list missing review-code"
pass "ai-dev status pack"

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

# ready + placeholder must NOT show "N to validate"
"$MN" clear-validate >/dev/null
"$MN" status ready >/dev/null
out="$("$MN" show)"
if printf '%s\n' "$out" | grep -qE '[0-9]+ to validate'; then
  fail "placeholder must not count as open validate (got: $out)"
fi
pass "ready+placeholder no to-validate badge"

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
printf '%s\n' "$out" | grep -q "new thread\|webhooks\|ready\|blocked\|working\|idle" || fail "bare mn MN_UI=0 card"
unset MN_UI
pass "bare mn MN_UI=0"

# migrate legacy PT file
LEGACY="$TMP/legacy.md"
cat >"$LEGACY" <<'EOF'
# microNote
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
EOF
MN_FILE="$LEGACY" "$MN" show >/dev/null
grep -q '^updated:' "$LEGACY" || fail "migrate updated"
grep -q '^status:' "$LEGACY" || fail "migrate status"
grep -qx '## Thread' "$LEGACY" || fail "migrate Thread"
grep -qx '## Description' "$LEGACY" || fail "migrate Description"
grep -A2 '## Thread' "$LEGACY" | grep -q 'old thread' || fail "migrate kept body"
pass "migrate PT → EN schema"

printf '\nall tests passed\n'
