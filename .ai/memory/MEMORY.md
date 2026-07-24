# micro-notes-cli — memória do projeto

Índice curto (<200 linhas). Detalhes em ficheiros de tópico.

## Tópicos

| Ficheiro | Conteúdo |
|----------|----------|
| [product-surface.md](./product-surface.md) | Secções, teclas TUI, clear, Finished, packs |

## Regras rápidas

- Secções canónicas: Thread · Now · Wait · Todo · **Finished** (legado: Closed)
- Teclas: `f` finished · `c` clear · `d` del todo · `v` todo · `C` **não** existe
- Install: `pack=` em `~/.config/mn/config` é sticky (reinstall mantém)
- Não commitar: `MICRONOTE.md` local, `cfg-status/`
- blink-tui: `file:../blink-tui`; Footer `maxRows=2` (rebuild + sync node_modules)
