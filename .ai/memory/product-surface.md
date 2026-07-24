# Superfície do produto (microNote)

## Secções (SCHEMA v0.1)

- **Thread · Description · Now · Wait · Todo · Finished**
- **Description** = contexto opcional do stream (`mn description` / `desc` / tecla **`d`**).
- Finished = decisões assentes (log curto). Legado `## Closed` / `## Fechado` migra no read/write.
- Campo TS: `description`, `finished` (não `closed`).
- CLI: `mn finish` (alias `mn close`); atalho **`f`** (não `c`).
- **Human** removido (só drop na migração). Validate/Need = aliases → Todo.

## Clear / delete

- **`d`**: edit description (não apaga todo).
- **backspace**: remove o todo focado.
- **`c`**: menu clear — done todos / all todos / now+wait / everything (confirm; mantém Thread; limpa Description).
- Helpers em `note.ts`: `removeTodo`, `clearDoneTodos`, `clearAllTodos`, `clearActivity`, `clearSoft`.
- `mn clear-todo` continua no CLI (= all todos).

## Footer estreito

- blink-tui `Footer` com `maxRows={2}`: 2 barras antes de dropar chips.
- Default `align="columns"`: em wrap, colunas alinhadas (pad por coluna) — ver blink-tui Footer.
- Chips: `t` `d` `n` `w`* `v` `s` `sp` `f` `c` `,` `?` `q`.

## Install + pack

- Escolha 1=generic, 2=ai-dev → `pack=` no config.
- Reinstall: default = pack já configurado (Enter não reseta para generic).
- Non-TTY: preserva pack salvo.
- Copia packs + `status-catalog.mjs` para `~/.local/share/mn`.
- Catálogo resolve packs via `MN_ROOT` / `root=` / share / repo.

## Fora do repo

- Alterações ao Footer multi-row vivem em `../blink-tui` (não neste git).
- Não commitar: `MICRONOTE.md` local, `cfg-status/`.
