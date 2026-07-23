# micro-notes-cli — Plano

CLI de **microNote** no terminal para reentrada humana ao trabalhar com vários agentes (ex.: Herdr: workspace → page → panes, 1 worktree por page).

**Problema que resolve:** ao saltar entre agents/pages, o humano não lembra o *fio* da conversa nem *o que validar* neste caso. Handoff serve o agent; dashboard serve routing; **microNote serve o revisor (tu)**.

**Não-objectivos:** substituir handoff de sessão, orquestrar agents, review de diffs, skill LLM obrigatória.

---

## 1. Decisões de produto

| Decisão | Escolha | Porquê |
|---------|---------|--------|
| Nome do ficheiro no worktree | **`MICRONOTE.md`** (nunca `STATUS.md`) | `STATUS.md` colide com outras ferramentas/fluxos |
| Override do path | env `MN_FILE` | Flexível sem hardcode |
| Formato no disco | Markdown com **headings fixos em PT** | Legível se abrires o ficheiro; parse determinístico |
| Interface principal | CLI bash `mn` | Sem dependência de LLM; instantâneo |
| Escrita | Comandos por **nome longo** + menu + atalhos opcionais | Zero overhead mental no dia 1; velocidade depois |
| Leitura | `mn` / `mn --watch` com **cores + símbolos** | Análise rápida no pane lateral do Herdr |
| Validação estrutural | `mn check` (exit code) | Gate determinístico; agent opcionalmente chama |
| Skill LLM | Fora do core (fase opcional) | Core = script; skill só “usa `mn` nos gates” se quiseres |

### Hierarquia de uso (Herdr)

```text
Workspace (app)
  └── Page (stream) = worktree
        ├── Pane agent
        └── Pane `mn --watch`  ← card sempre visível
```

Mesmo nome de ficheiro em cada worktree: `MICRONOTE.md` na raiz do cwd.

---

## 2. Conteúdo mínimo do card

### 2.1 Template `MICRONOTE.md`

```markdown
# microNote
atualizado: HH:MM
estado: idle

## Fio


## Agora


## Validar
- [ ] 

## Humano


## Fechado
- 
```

### 2.2 Secções

| Secção | Quem escreve | Propósito |
|--------|--------------|-----------|
| `estado` | humano ou agent via CLI | `idle` \| `working` \| `blocked` \| `ready` |
| **Fio** | ambos | 1–3 linhas: do que estávamos a falar |
| **Agora** | ambos | O que está a acontecer *neste momento* |
| **Validar** | ambos (checkboxes) | O que **o humano** deve verificar |
| **Humano** | só humano (CLI marca/protege) | Decisões e notas que o agent não deve apagar |
| **Fechado** | ambos | Decisões fechadas — não reabrir |

### 2.3 `mn check` (falha se)

- Ficheiro em falta (sugerir `mn init`)
- Falta heading obrigatório
- `estado` inválido ou vazio
- **Fio** vazio
- **Validar** sem pelo menos um item real *ou* o placeholder explícito `- [ ] (nada ainda)`

Não julga qualidade semântica do texto — só estrutura.

---

## 3. CLI — superfície de comandos

Binário/comando: **`mn`**

### 3.1 Leitura

| Comando | Comportamento |
|---------|----------------|
| `mn` | Render do card (default) — cores + símbolos |
| `mn show` | Idem |
| `mn --watch` / `mn watch` | Refresh periódico (pane Herdr); default 1s |
| `mn ajuda` / `mn help` | Lista comandos + atalhos |

### 3.2 Escrita (nomes longos = default)

| Comando | Efeito |
|---------|--------|
| `mn init` | Cria `MICRONOTE.md` se não existir |
| `mn fio "…"` | Substitui secção Fio |
| `mn agora "…"` | Substitui secção Agora |
| `mn validar "…"` | Append checkbox em Validar |
| `mn estado <valor>` | Define estado (`idle\|working\|blocked\|ready`) |
| `mn humano "…"` | Append/substitui bloco Humano (protegido) |
| `mn fechar "…"` | Append em Fechado |
| `mn feito [n\|texto]` | Marca checkbox Validar como feito |
| `mn limpar-validar` | Zera lista Validar (deixa placeholder) |
| `mn touch` | Só actualiza `atualizado:` |
| `mn check` | Exit 0/1 estrutura |

### 3.3 Atalhos opcionais (documentados em `mn ajuda`)

```text
f → fio      a → agora      v → validar
e → estado   h → humano     x → fechar
```

### 3.4 Menu (sem decorar comandos)

| Comando | Comportamento |
|---------|----------------|
| `mn +` | Menu interactivo: escolher acção → input → grava → show |

Implementação do menu:

1. Se `fzf` no PATH → lista com fzf  
2. Senão → `select` bash  
3. Input: `read -r` (sem `gum` no MVP)

---

## 4. UX de terminal: cores e símbolos

Objectivo: em **&lt; 5s** perceber estado, o que validar e se precisas de agir.

### 4.1 Mapa de estado (linha de topo)

| estado | Cor (ANSI) | Símbolo | Leitura rápida |
|--------|------------|---------|----------------|
| `idle` | dim / cinza | `○` | Nada a fazer |
| `working` | amarelo/cyan | `◉` ou `…` | Agent a trabalhar — não interromper |
| `blocked` | vermelho bold | `⛔` ou `!` | **Precisa de ti** |
| `ready` | verde bold | `▶` ou `✓?` | **Validar agora** |

Linha de topo exemplo:

```text
  ▶  ready  ·  14:32  ·  ~/…/wt-auth
```

### 4.2 Secções no render

| Secção | Símbolo | Cor heading | Conteúdo |
|--------|---------|-------------|----------|
| Fio | `~` ou `💬` | cyan | texto normal |
| Agora | `→` | bold white | texto normal |
| Validar | `☐` / `☑` | verde para items; amarelo se lista vazia inválida | cada item numa linha |
| Humano | `✎` | magenta | texto |
| Fechado | `✓` | dim | items |

Exemplo de render alvo:

```text
  ▶ ready · 14:32 · MICRONOTE

  💬 Fio
     webhooks Paddle — idempotency

  → Agora
     à espera de review dos testes

  ☐ Validar
     ☐  npm test -- webhook
     ☐  retry com mesma key não duplica
     ☑  schema migration aplicada

  ✎ Humano
     não tocar em billing UI

  ✓ Fechado
     • descartámos Stripe
```

### 4.3 Regras de cor (implementação)

- Detectar TTY: se `! -t 1` ou `NO_COLOR` ou `MN_COLOR=0` → output plain  
- Preferir códigos ANSI 16-cores (portátil); opcional truecolor depois  
- Nunca depender de Nerd Fonts no MVP (símbolos unicode básicos OK)  
- Fallback ASCII se `MN_ASCII=1`: `ready` → `[R]`, checkbox → `[ ]` / `[x]`

### 4.4 Hierarquia visual (agilizar análise)

1. **Primeira linha** = só estado + hora (decisão: agir ou não)  
2. **Validar** com destaque se `estado=ready` ou `blocked`  
3. **Fio + Agora** em bloco médio (contexto)  
4. **Humano + Fechado** dim (referência, não acção)

Quando `estado=ready` e há `☐` abertos: header em verde + contagem `2 por validar`.  
Quando `estado=blocked`: header vermelho + Fio/Agora em evidência.

---

## 5. Parse e escrita do markdown

### 5.1 Estratégia

- Parse por headings `## Nome` exactos  
- Campos front: `atualizado:`, `estado:` nas primeiras linhas após `# microNote`  
- Escrita: reescrever secção alvo sem destruir as outras  
- **Humano:** script nunca apaga conteúdo existente em write de agent-path; só `mn humano` acrescenta ou substitui com flag explícita `--replace`

### 5.2 Concorrência (MVP)

- Write atómico: write temp + `mv`  
- Sem file lock no MVP (uso single-user no worktree)

### 5.3 Localização do ficheiro

1. `$MN_FILE` se definido  
2. Senão `./MICRONOTE.md` relativo ao cwd  
3. `mn init` cria no cwd actual (worktree da page)

---

## 6. Integração Herdr (recomendado, não bloqueante)

| Item | Detalhe |
|------|---------|
| Pane direito | `mn watch` (refresh 1s) |
| Layout | agent esquerdo · microNote direito (~30%) |
| Notas | humano usa `mn +` ou comandos noutro pane/shell |
| Agent | opcional: chamar `mn estado ready` + `mn validar "…"` + `mn check` |

Fora do MVP: plugin Herdr, skill LLM, YAML dual-format.

---

## 7. Stack e layout do repo

```text
micro-notes-cli/
  PLAN.md           ← este plano
  README.md         ← visão + install + quickstart
  LICENSE           ← MIT
  bin/mn            ← CLI (bash, sem deps obrigatórias)
  lib/              ← funções (opcional se monólito crescer)
  templates/MICRONOTE.md
  tests/            ← bats ou bash test scripts
  completions/      ← bash/zsh (fase 2)
```

### Dependências

| Obrigatório | Opcional |
|-------------|----------|
| bash 3.2+ (macOS), `date`, coreutils básicas | `fzf` (menu melhor), nada mais |

Sem Node, sem Python no MVP (portátil no PATH do utilizador).

---

## 8. Fases de implementação

### Fase 0 — Repo e plano ✅

- [x] `git init` em `./micro-notes-cli`  
- [x] `PLAN.md` com decisões (nome `MICRONOTE.md`, cores, híbrido)  
- [x] `README.md` + `LICENSE`  
- [x] commit inicial

### Fase 1 — MVP CLI (usável no Herdr) ✅

- [x] `bin/mn`: `init`, `show`, `fio`, `agora`, `validar`, `estado`, `humano`, `fechar`  
- [x] `check`, `touch`, `limpar-validar`  
- [x] Render com cores + símbolos + `NO_COLOR` / `MN_ASCII`  
- [x] Write atómico de secções  
- [x] `templates/MICRONOTE.md`  
- [x] Testes em `tests/run.sh` + README

**Critério de done:** num worktree, `mn init` → `mn fio` → `mn validar` → `mn estado ready` → `mn` mostra card legível em &lt;1s; `mn check` exit 0.

### Fase 2 — Menu, watch, atalhos ✅

- [x] `mn +` com fzf/select  
- [x] `mn watch`  
- [x] Atalhos `f a v e h x`  
- [x] `mn feito` (marcar checkbox)  
- [x] Contagem “N por validar” no header quando `ready`

### Fase 3 — DX (parcial)

- [x] Install: `install.sh` → `~/.local/bin`  
- [ ] Completions zsh/bash  
- [x] Testes automatizados `tests/run.sh`  
- [x] `mn path`  
- [x] Highlight especial blocked/ready

### Fase 4 — Opcional

- [ ] Skill LLM mínima (“nos gates, corre `mn check`”)  
- [ ] Export `mn dump --json` para outras tools  
- [ ] Integração documentada com Herdr layouts YAML  
- [ ] Arquivo: `mn archive` → `MICRONOTE-archive/YYYYMMDD-HHMM.md` + re-init

---

## 9. Ritual de uso (spec de comportamento humano)

1. Entrar na page Herdr → olhar pane `mn watch`  
2. Se header `⛔ blocked` ou `▶ ready` → ler **Validar** e actuar  
3. Actualizar com `mn +` ou `mn validar` / `mn fio` (sem abrir editor)  
4. Só depois prompt ao agent  
5. Fim de sessão longa → handoff **separado** (não é este CLI)

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Card vira diário longo | Convenção: &lt; ~20 linhas; Validar ≤ 5 items |
| Agent apaga notas humanas | Secção Humano só via `mn humano`; docs + check |
| Colisão de nome de ficheiro | `MICRONOTE.md` + `MN_FILE` |
| Cores partem em pipe/CI | auto plain se não-TTY / `NO_COLOR` |
| Parse frágil de markdown | Headings exactos; testes de round-trip |
| Overhead mental de comandos | `mn` + `mn +` no dia 1; nomes longos; atalhos depois |

---

## 11. Critérios de sucesso

1. Com 4 pages em paralelo, reentrada em **&lt; 20s** com fio + checklist claros  
2. Zero dependência de LLM para o card estar correcto estruturalmente  
3. Um glance no header diz se precisas de agir (`blocked` / `ready` vs `working`)  
4. Nome de ficheiro **não** conflita com `STATUS.md` nem convenções comuns de agents  
5. Funciona em macOS bash + Herdr pane sem deps extra

---

## 12. Nome e branding

| Item | Valor |
|------|--------|
| Repo | `micro-notes-cli` |
| Comando | `mn` |
| Ficheiro | `MICRONOTE.md` |
| Env | `MN_FILE`, `MN_COLOR`, `MN_ASCII`, `MN_WATCH_INTERVAL` |

---

## 13. Próximo passo imediato

1. Completar Fase 0: `README.md`, `LICENSE`, commit  
2. Implementar Fase 1 em `bin/mn`  
3. Provar no Herdr com 1 worktree real  

Este documento é a fonte de verdade do desenho até a implementação divergir — então actualizar o plano na mesma PR/commit.
