# EAP — Fase A (disciplina da linha) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Linha nova da EAP nasce com a disciplina do agrupamento-pai, o verificador aponta linha com disciplina diferente do agrupamento (com correção em um clique), e o card gerado da EAP mostra a fase no título.

**Architecture:** Uma regra pura nova (`planejamento/disciplina-linha.ts`) decide a disciplina de linha nova e as divergências; `inserirLinhaAcima`, o diálogo "Nova tarefa", o verificador de qualidade, a ação de correção e o script de diagnóstico leem dela. O título do card ganha a sigla da fase em `sincronizarCards`, o único escritor de título de card vindo da EAP — assim quadro, ponto, "Meu trabalho", sugestão e avisos mostram a fase sem tocar em cada tela.

**Tech Stack:** Next 15 / React 19, Prisma 7 (`@/generated/prisma/client`), vitest (node), smokes via `tsx --tsconfig tsconfig.server.json`.

**Spec:** [docs/superpowers/specs/2026-10-22-eap-apontamentos-equipe-design.md](../specs/2026-10-22-eap-apontamentos-equipe-design.md) — Fase A (A1, A2, A3).

## Global Constraints

- Código em inglês; todo texto de tela, mensagem e commit em pt-BR (commit semântico).
- Toda mutação via `defineAction` (`lib/with-action.ts`); erro de negócio = `ActionError` com frase pronta para o usuário.
- Sem `Promise.all` dentro de `$transaction` (guarda `lib/promise-all-em-transacao.test.ts`).
- `await confirm()` SEMPRE antes de `startTransition`.
- Arquivo puro (`disciplina-linha.ts`, `qualidade.ts`, `recursos.ts`) não importa Prisma, `server-only` nem Next.
- Nova regra de qualidade entra NO FIM do union `RegraQualidade` (chave estável, nunca renomear), severidade `alerta`, peso `0` em `saude.ts` (não mexe na nota — mesma razão da F5).
- Disciplina de linha existente nunca muda sozinha: só por edição explícita ou pelo botão de correção (anti-goal do spec).
- Plano travado (`planoTravado`) recusa a correção com `MOTIVO_PLANO_TRAVADO` (`trava-plano.ts`), e a tela desabilita o botão com a mesma frase.
- Sigla da fase vem de `PranchaCatalogo.sigla` via `EapTarefa.etapa` — o mesmo que a EAP já mostra (`queries.ts:157`). Nunca gravar sigla na linha.
- Stage arquivos específicos (nunca `git add -A`); conferir `git show --stat` após cada commit.
- Fechar com `docs/PROTOCOLO_AUDITORIA_FINAL.md` (nível 2–3), tela conferida pelo agente na porta 3001.

## Review Focus

1. **Inserir acima numa linha da raiz** (pai = nenhum) → linha nova sem disciplina e sem fase. Teste em Task 1 e smoke em Task 3.
2. **Pai sem disciplina dentro de agrupamento com disciplina** (Hidro › "Gestão" sem disciplina › nova) → A1 dá sem disciplina (pai direto), e A2 NÃO acusa linha sem disciplina. Teste em Task 1.
3. **Correção com lista velha** (a linha já foi corrigida, ou outra pessoa mudou a árvore depois do achado) → o servidor recalcula; só corrige o que ainda diverge; zero corrigidas devolve frase, não erro genérico. Smoke em Task 5.
4. **Plano aprovado sem revisão** → a correção recusa com `MOTIVO_PLANO_TRAVADO`; o botão aparece desabilitado com a frase. Smoke em Task 5.
5. **Sincronizar duas vezes** com fase na linha → a segunda rodada não atualiza nada (a comparação usa o título composto, não `l.nome`; senão o card seria regravado a cada reagendamento). Smoke em Task 6.

---

### Task 1: Regra pura da disciplina da linha

**Files:**
- Create: `src/modules/planejamento/disciplina-linha.ts`
- Test: `src/modules/planejamento/disciplina-linha.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PaiDaLinha = { disciplinaId: string | null; etapaId: string | null };
  export function disciplinaParaLinhaNova(pai: PaiDaLinha | null): { disciplinaId: string | null; etapaId: string | null };

  export type NoDisciplina = { id: string; parentId: string | null; disciplinaId: string | null; etapaId: string | null };
  export type Divergencia = { tarefaId: string; atualId: string; esperadaId: string; etapaEsperadaId: string | null };
  export function divergenciasDeDisciplina(nos: readonly NoDisciplina[]): Divergencia[];
  ```

- [ ] **Step 1: Write the failing tests**

`disciplinaParaLinhaNova`:
- `null` → `{ disciplinaId: null, etapaId: null }`
- `{ disciplinaId: "hid", etapaId: "bs" }` → `{ disciplinaId: "hid", etapaId: "bs" }`
- `{ disciplinaId: null, etapaId: "bs" }` (agrupamento de fase sem disciplina) → `{ disciplinaId: null, etapaId: null }` (fase sem disciplina é recusada por `faseDaLinha`)

`divergenciasDeDisciplina` com a árvore:
```
F  (fase BS)          disciplina null, etapa bs
├─ H (Hidro)          disciplina hid, etapa bs
│  ├─ M Modelagem     disciplina hid            → não diverge
│  ├─ V Visita        disciplina ele            → diverge: atual ele, esperada hid, etapaEsperada bs (a do H)
│  └─ G Gestão        disciplina null
│     └─ X            disciplina null           → não diverge (sem disciplina nunca é achado)
│     └─ Y            disciplina ele            → diverge: esperada hid (ancestral mais próximo COM disciplina é H)
└─ R (raiz-filha)     disciplina ele, pai F     → não diverge (nenhum ancestral com disciplina)
```
- devolve exatamente `[V, Y]` (ordem de entrada), com os campos acima.
- árvore com ciclo de `parentId` (A pai de B, B pai de A) não trava: termina e não acusa.
- `parentId` apontando para id ausente da lista = tratado como raiz.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/modules/planejamento/disciplina-linha.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implement** em `disciplina-linha.ts`, com cabeçalho de comentário explicando A1/A2 e a causa (inserir acima herdava da vizinha). Subida pela árvore com `Map` por id e `Set` de visitados.

- [ ] **Step 4: Run to verify pass** — mesmo comando, PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/disciplina-linha.ts src/modules/planejamento/disciplina-linha.test.ts
git commit -m "feat(planejamento): regra da disciplina da linha nova e da divergência com o agrupamento"
```

---

### Task 2: Script de diagnóstico do 260035 (somente leitura)

Confirma a causa no projeto real antes de o dono depender do conserto. Roda em produção pelo dono.

**Files:**
- Create: `scripts/diagnosticar-disciplina-eap.ts`
- Modify: `package.json` (script `diagnosticar:disciplina-eap`)

**Interfaces:**
- Consumes: `divergenciasDeDisciplina` (Task 1).

- [ ] **Step 1: Implement** no padrão de `scripts/diagnosticar-nomenclatura.ts` (`import "dotenv/config"`, comentário de uso, "Não escreve nada"). Uso: `npm run diagnosticar:disciplina-eap -- --projeto 260035` (`Projeto.codigo`). Saída:
  1. Árvore da EAP indentada: `codigoEap`, nome, disciplina (`Disciplina.disciplinaTextoLegado` ou nome do catálogo), sigla da fase, `[DIVERGE: esperada X]` nas linhas de `divergenciasDeDisciplina`.
  2. Para cada linha divergente: as entradas de `AuditLog` (`modulo = 'planejamento'`) cujo `detalhe::text ILIKE '%<id>%'` (via `$queryRaw`), com `createdAt`, `acao`, nome do usuário — e, se houver `acao = 'criar-eap'` com `detalhe->>'nome'` igual ao nome da linha no mesmo projeto, também. Linha cuja primeira entrada é `editar-eap` sem `criar-eap` correspondente = nasceu por "Inserir acima" (ou modelo/importação); imprimir essa conclusão por linha.
  3. Resumo: total de linhas, divergentes, e quantas sugerem "Inserir acima".
  Projeto inexistente → mensagem e `process.exitCode = 1`.

- [ ] **Step 2: Verify** no banco de dev com qualquer projeto que tenha EAP: `npm run diagnosticar:disciplina-eap -- --projeto <codigo>` imprime a árvore e o resumo sem erro; `--projeto 000000` sai com a mensagem e código 1.

- [ ] **Step 3: Commit**
```bash
git add scripts/diagnosticar-disciplina-eap.ts package.json
git commit -m "chore(planejamento): diagnóstico somente-leitura da disciplina das linhas da EAP"
```

---

### Task 3: Inserir acima e "Nova tarefa" usam a disciplina do pai (A1)

**Files:**
- Modify: `src/modules/planejamento/arvore-service.ts` (`carregar`, `inserirLinhaAcima`)
- Modify: `src/components/planejamento/eap-dialog.tsx` (seleção da linha-mãe, ~linha 491)
- Create: `scripts/smoke-disciplina-eap.ts`
- Modify: `package.json` (script `smoke:disciplina-eap`), `CLAUDE.md` (linha do smoke na lista de comandos)

**Interfaces:**
- Consumes: `disciplinaParaLinhaNova` (Task 1).
- Produces: `inserirLinhaAcima(id)` mantém a assinatura `Promise<{ projetoId: string; novaId: string }>`; o smoke `scripts/smoke-disciplina-eap.ts` com `check()`/`erroDe()` no padrão de `smoke-apagar-eap.ts`, e um helper `montarArvore()` que Tasks 5 e 6 estendem.

- [ ] **Step 1: Write the failing smoke** `smoke-disciplina-eap.ts` (cliente + projeto + 2 disciplinas "Hidrossanitário"/"Elétrica" + `cronogramaProjeto` rascunho, limpeza no `finally`), montando a árvore da Task 1 (F fase sem disciplina › H Hidro › M; F › G "Gestão" sem disciplina › X). Checks:
  - `inserirLinhaAcima(M.id)` → linha nova com `disciplinaId = hid` e `etapaId = etapa de H`.
  - `inserirLinhaAcima(X.id)` → linha nova com `disciplinaId = null`, `etapaId = null`, e sem `EapAtribuicao` (nenhum responsável herdado).
  - `inserirLinhaAcima(F.id)` (raiz) → `disciplinaId = null`.
  - responsável da disciplina Hidro (`DisciplinaResponsavel`) desce só para a linha nova sob H.

- [ ] **Step 2: Run to verify fail** — `npm run smoke:disciplina-eap` → FALHA no check de X (hoje herda a disciplina da vizinha).

- [ ] **Step 3: Implement**
  - `carregar` passa a selecionar `disciplinaId` e `etapaId` em `nos`.
  - `inserirLinhaAcima`: pai = `nos.find(n => n.id === plano.paiId) ?? null`; `const { disciplinaId, etapaId } = disciplinaParaLinhaNova(pai)`; grava os dois no `create`. Trocar o comentário "Nasce na disciplina da linha de referência" pelo motivo novo (spec A1).
  - `eap-dialog.tsx`, só na criação: estado `disciplinaTocada` (vira `true` quando o usuário mexe no select de disciplina). Ao trocar a linha-mãe com `disciplinaTocada = false`, aplicar `disciplinaParaLinhaNova(paiEscolhido)` ao form; fase só fica se estiver em `etapas` da disciplina resultante, senão `NONE`. Linha-mãe `NONE` → disciplina e fase `NONE`.

- [ ] **Step 4: Run to verify pass** — `npm run smoke:disciplina-eap` → todos `ok`; `npx vitest run src/modules/planejamento` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/arvore-service.ts src/components/planejamento/eap-dialog.tsx scripts/smoke-disciplina-eap.ts package.json CLAUDE.md
git commit -m "fix(planejamento): linha nova recebe a disciplina do agrupamento, não da vizinha"
```

---

### Task 4: Regra de qualidade "disciplina diferente do agrupamento" (A2)

**Files:**
- Modify: `src/modules/planejamento/qualidade.ts` (union `RegraQualidade`, `LinhaQualidade`, `verificarCronograma`)
- Modify: `src/modules/planejamento/saude.ts` (`PESO`)
- Modify: `src/modules/planejamento/service.ts` (`avaliarQualidade`: select + mapeamento das linhas)
- Modify: `src/components/planejamento/saude-painel.tsx` (`REGRA_LABEL`)
- Test: `src/modules/planejamento/qualidade.test.ts`

**Interfaces:**
- Consumes: `divergenciasDeDisciplina` (Task 1).
- Produces: `RegraQualidade` ganha `"disciplina_diferente_do_agrupamento"` (último membro); `LinhaQualidade` ganha `parentId?: string | null` e `disciplinaId?: string | null`; o achado tem `tarefaId` = linha divergente.

- [ ] **Step 1: Write the failing tests** em `qualidade.test.ts`: com a árvore da Task 1 convertida em `LinhaQualidade` (mínimo dos campos existentes do arquivo de teste), `verificarCronograma` devolve achados `disciplina_diferente_do_agrupamento`, severidade `"alerta"`, `tarefaId` V e Y — e nenhum para X, M, R; mensagem `"Visita" tem disciplina diferente da do agrupamento em que está.`. Linhas sem `parentId`/`disciplinaId` (chamadores antigos) → nenhum achado desta regra. `calcularSaude` de um conjunto só com esses achados mantém a nota igual à de zero achados.

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/qualidade.test.ts` → FAIL.

- [ ] **Step 3: Implement**: regra no fim do union com o comentário de que entrou na Fase A; `verificarCronograma` chama `divergenciasDeDisciplina` uma vez sobre todas as linhas (`etapaId: null`, não usado aqui); `PESO.disciplina_diferente_do_agrupamento = 0`; `service.ts` seleciona `parentId` e `disciplinaId` e repassa; `REGRA_LABEL`: `"disciplina diferente do agrupamento"`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/modules/planejamento` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/qualidade.ts src/modules/planejamento/qualidade.test.ts src/modules/planejamento/saude.ts src/modules/planejamento/service.ts src/components/planejamento/saude-painel.tsx
git commit -m "feat(planejamento): verificador aponta disciplina diferente do agrupamento"
```

---

### Task 5: Corrigir para a disciplina do agrupamento (A2, botão)

**Files:**
- Create: `src/modules/planejamento/disciplina-linha-service.ts`
- Modify: `src/modules/planejamento/actions.ts` (nova action)
- Modify: `src/components/planejamento/saude-painel.tsx` (botão na linha da regra; prop `podeGerir`)
- Modify: `src/components/planejamento/eap-workspace.tsx` (passa `podeGerir` ao `SaudePainel`)
- Modify: `scripts/smoke-disciplina-eap.ts`

**Interfaces:**
- Consumes: `divergenciasDeDisciplina` (Task 1); `herdarResponsaveisNoProjeto` (`recursos-service.ts`); `exigirPlanoEditavel` (`trava-plano-service.ts`); `aposMudarEap` (`pos-eap.ts`).
- Produces:
  ```ts
  // disciplina-linha-service.ts ("server-only")
  export async function alinharDisciplinasNoBanco(projetoId: string, tarefaIds: readonly string[]): Promise<{ corrigidas: string[] }>;
  // actions.ts
  export const alinharDisciplinaAoAgrupamento // schema { projetoId: string, tarefaIds: string[] (1..2000) } → { corrigidas: number }
  ```

- [ ] **Step 1: Extend the smoke (failing)**: árvore com V (Elétrica sob Hidro) e Y; checks:
  - `alinharDisciplinasNoBanco(p, [V.id, Y.id, M.id])` → `corrigidas` = `[V.id, Y.id]` (M não divergia); V e Y ficam `disciplinaId = hid`, `etapaId = etapa de H`.
  - pessoa já atribuída em V continua atribuída (correção não remove gente); linha corrigida sem ninguém ganha o responsável de Hidro.
  - segunda chamada com os mesmos ids → `corrigidas = []`.
  - com `cronogramaProjeto.aprovado = true` e `emRevisao = false`, a action/serviço via `exigirPlanoEditavel` recusa com `MOTIVO_PLANO_TRAVADO`.

- [ ] **Step 2: Run to verify fail** — `npm run smoke:disciplina-eap` → FALHA (função não existe).

- [ ] **Step 3: Implement**
  - Serviço: dentro de uma `$transaction`, lê `id, parentId, disciplinaId, etapaId` das linhas do projeto, recalcula `divergenciasDeDisciplina`, filtra pelos `tarefaIds` pedidos, e grava um `update` por linha (sequencial) com `disciplinaId = esperadaId`, `etapaId = etapaEsperadaId`. Fora da transação: `herdarResponsaveisNoProjeto(prisma, projetoId, corrigidas)`.
  - Action (`...plan`, `acao: "alinhar-disciplina-eap"`, `entidade: "EapTarefa"`): `exigirPlanoEditavel(projetoId)` → serviço → zero corrigidas lança `ActionError("Nada a corrigir: as linhas já estão na disciplina do agrupamento.")` → `aposMudarEap` → `revProjeto`. Devolve `{ corrigidas: n }`.
  - Painel: na linha da regra `disciplina_diferente_do_agrupamento`, com `podeGerir`, botão `Usar a disciplina do agrupamento`. Desabilitado com `title={MOTIVO_PLANO_TRAVADO}` quando `planoTravado({ aprovado, emRevisao })`. `await confirm()` antes do `start`: "N linha(s) passam para a disciplina do agrupamento em que estão. O responsável da nova disciplina entra onde não há ninguém; quem já está atribuído continua." Sucesso: `toast.success("N linha(s) corrigidas.", { description: "Confira a coluna Recursos: quem já estava atribuído continua." })` + `router.refresh()`.

- [ ] **Step 4: Run to verify pass** — `npm run smoke:disciplina-eap` → todos `ok`; `npm run lint` sem erro novo.

- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/disciplina-linha-service.ts src/modules/planejamento/actions.ts src/components/planejamento/saude-painel.tsx src/components/planejamento/eap-workspace.tsx scripts/smoke-disciplina-eap.ts
git commit -m "feat(planejamento): corrigir a disciplina da linha para a do agrupamento"
```

---

### Task 6: Fase no título do card gerado da EAP (A3)

Escolha do construtor registrada no spec: **prefixo no título** (`"BS · Modelagem"`), não chip — `sincronizarCards` é o único escritor do título, então quadro, card aberto, ponto, "Meu trabalho", sugestão do ponto e o aviso de conclusão passam a mostrar a fase sem mudar nenhuma tela.

**Files:**
- Modify: `src/modules/planejamento/recursos.ts` (função pura)
- Test: `src/modules/planejamento/recursos.test.ts`
- Modify: `src/modules/planejamento/recursos-service.ts` (`sincronizarCards`)
- Modify: `scripts/smoke-disciplina-eap.ts`

**Interfaces:**
- Produces: `export function tituloDoCard(nome: string, faseSigla: string | null): string`.

- [ ] **Step 1: Write the failing tests** em `recursos.test.ts`: `tituloDoCard("Modelagem", "BS")` → `"BS · Modelagem"`; `tituloDoCard("Modelagem", null)` → `"Modelagem"`; `tituloDoCard("Modelagem", "  ")` → `"Modelagem"`.

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/modules/planejamento/recursos.test.ts` → FAIL.

- [ ] **Step 3: Implement** `tituloDoCard`; em `sincronizarCards`, selecionar `etapa: { select: { sigla: true } }` e usar `const titulo = tituloDoCard(l.nome, l.etapa?.sigla ?? null)` no `create`, na comparação `card.titulo !== titulo` e no `update`. Atualizar o comentário do título no cabeçalho da função.

- [ ] **Step 4: Extend the smoke**: aprovar o cronograma do projeto de teste (com pessoa em M e fase BS na linha), `sincronizarCards` → card de M com título `"<sigla> · Modelagem"`; renomear M e sincronizar → título acompanha; sincronizar de novo → `atualizados = 0`. Rodar `npm run smoke:disciplina-eap`, `npm run smoke:eap-integracao`, `npm run smoke:conclusao-eap`, `npm run smoke:ponto-tarefa` → todos sem FALHA (ajustar asserção que compare título do card com o nome cru da linha, se houver).

- [ ] **Step 5: Commit**
```bash
git add src/modules/planejamento/recursos.ts src/modules/planejamento/recursos.test.ts src/modules/planejamento/recursos-service.ts scripts/smoke-disciplina-eap.ts
git commit -m "feat(planejamento): card gerado da EAP mostra a fase no título"
```

---

### Task 7: Manual, tela e auditoria final

**Files:**
- Modify: `docs/manual/projetos/planejamento.md` (seção da EAP: linha nova recebe a disciplina do agrupamento; achado "disciplina diferente do agrupamento" e o botão; card com a fase no título — cards de cronograma já aprovado ganham o prefixo na próxima reprogramação)
- Modify: `docs/manual/novidades.md` (entrada curta, linguagem de usuário)

- [ ] **Step 1: Write** as duas mudanças de manual.
- [ ] **Step 2: Verify** `npm run lint`, `npm test`, `npm run build` (com `next dev` parado nesta pasta) → sem erro.
- [ ] **Step 3: Tela** (dev server na 3001, usuário `claude.admin@dev.senahub`): inserir acima sob "Gestão" sem disciplina; achado aparece no painel; botão corrige; plano aprovado mostra o botão desabilitado com a frase; card no `/tarefas` com "BS · …". Conferir 390×844 (`scrollWidth = 390`) e 1366×768 com menu aberto. Prints + `LEIAME.md` em `prints-auditoria/2026-10-22_eap-fase-a/`.
- [ ] **Step 4: Auditoria** conforme `docs/PROTOCOLO_AUDITORIA_FINAL.md` (reler; nível pelo risco real), relatório em pt-BR.
- [ ] **Step 5: Commit**
```bash
git add docs/manual/projetos/planejamento.md docs/manual/novidades.md
git commit -m "docs(manual): disciplina da linha nova e fase no card da EAP"
```

## Depois desta fase

Pedir ao dono para rodar `npm run diagnosticar:disciplina-eap -- --projeto 260035` no servidor (somente leitura) e colar a saída — confirma a causa no projeto real. Próximo plano: Fase B (desfazer).
