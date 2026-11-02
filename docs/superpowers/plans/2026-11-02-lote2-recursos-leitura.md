# Lote 2 — `/recursos` só leitura — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/recursos` deixa de alocar pessoa por projeto e vira resumo de leitura de capacidade × carga, vindo só das EAPs, com filtros novos (nome, disciplina, só sobrecarregados) e um sinal para quem tem projeto sem cronograma aprovado.

**Architecture:** O corte é de leitura e de UI. O servidor para de somar a alocação digitada (`Alocacao`) nesta tela por uma opção nova de `cargaDaEquipe`; as regras novas (filtros, janela, sinal, colunas mensais) ficam em funções puras testadas; `recursos-matrix.tsx` perde alocação, habilidades e rebalanceamento e passa a usar essas funções. Sem migração: `Alocacao` continua no banco.

**Tech Stack:** Next.js 15 / React 19, Prisma 7 (`@/generated/prisma/client`), vitest (node), `defineAction`.

**Spec:** `docs/superpowers/specs/2026-11-02-lote2-recursos-leitura-design.md`

## Global Constraints

- UI e commits em pt-BR; código/identificadores em inglês só onde o arquivo já faz assim (os módulos de planejamento usam nomes em português — siga o arquivo).
- Sem migração e sem apagar dados de `Alocacao`. `impacto-ausencia-service.ts` e `aprovarPlano` (`planejamento/service.ts`) **não mudam**.
- `cargaDaEquipe` chamado sem opção nova continua igual (RH gestão, smokes e `scripts/*` dependem disso).
- Funções puras não importam Prisma, `server-only` nem Next (guarda existente varre os puros do planejamento? confira ao rodar `npm test`).
- Quem tem só `recursos:ver` não vê nenhum controle de edição. `recursos:gerir` guarda Adicionar/Editar recurso; custo/hora segue `financeiro:gerir`. `salvarRecurso` não muda.
- `await confirm()` antes de `startTransition`; nada de `contextmenu` à mão (CLAUDE.md). Esta tela não ganha menu de contexto novo.
- Tela pronta só com `document.documentElement.scrollWidth` = 390 a 390×844 e cabeçalho sem sobrepor a barra a 1366×768 com o menu aberto.
- Stage arquivos específicos (nunca `git add -A`); a árvore tem arquivos não relacionados. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `tsc` do servidor: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`.

## Review Focus

1. Pessoa cujos projetos não têm cronograma aprovado: aparece com o sinal e **sem** vermelho nem horas somadas (nunca "0% e nada mais"). Teste: `projetosSemCronogramaPorPessoa` + smoke da matriz.
2. Janela invertida, vazia ou maior que 400 dias: a tela não quebra; "só sobrecarregados" mostra a mensagem de lista vazia. Teste: `semanasDaJanela` devolve `[]`.
3. Busca por nome com acento, caixa e espaços sobrando (`"  joao "` acha "João"). Teste em `pessoasQuePassam`.
4. Pessoa com recurso e carga zero some com "só sobrecarregados"; a mensagem de vazio diferencia "nenhum recurso" de "nenhum resultado para os filtros". Teste: verificação em tela.
5. A matriz **não** devolve `alocacoes` no DTO e uma `Alocacao` gravada no banco não muda total, cor nem filtro. Teste: smoke (`"alocacoes" in linha === false`, `totalAlocado` ignora a alocação).

---

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/modules/planejamento/recursos-filtros.ts` (novo, puro) | filtros por nome/projeto/disciplina, janela em semanas, conjuntos de sobrecarregados, agrupamento do sinal |
| `src/modules/planejamento/recursos-filtros.test.ts` (novo) | testes das funções acima |
| `src/modules/planejamento/heatmap-recursos.ts` | + `colunasMeses` (colunas mensais sem depender de alocação) |
| `src/modules/planejamento/heatmap-recursos.test.ts` | + teste de `colunasMeses` |
| `src/modules/planejamento/recursos-queries.ts` | `cargaDaEquipe({ incluirDigitada })`; `PessoaCarga.disciplinas` |
| `src/modules/planejamento/queries.ts` | `matrizRecursos` sem alocação digitada, com `disciplinas` e `projetosSemCronograma` |
| `src/modules/planejamento/recursos-actions.ts` | `sugestoesDaSobrecarga` com `incluirDigitada: false` |
| `src/modules/planejamento/actions.ts` | remove `salvarAlocacao`, `removerAlocacao` |
| `src/app/(dashboard)/recursos/page.tsx` | só o que a tela lê agora |
| `src/components/recursos/recursos-matrix.tsx` | corta alocação/habilidades/rebalancear; usa filtros e sinal |
| `src/components/recursos/sinal-sem-cronograma.tsx` (novo) | selo "sem cronograma aprovado" |
| `src/components/recursos/necessidades-projeto.tsx` | **apagar** (só a matriz o usa) |
| `src/components/recursos/carga-planejada-view.tsx` | sugestões só leitura + link da EAP |
| `scripts/smoke-onda5.ts`, `scripts/smoke-recursos-eap.ts` | ajustes e checagens novas |
| `docs/manual/projetos/recursos.md`, `docs/manual/novidades.md` | manual |

---

### Task 1: Regras puras (filtros, janela, sinal, colunas mensais)

**Files:**
- Create: `src/modules/planejamento/recursos-filtros.ts`, `src/modules/planejamento/recursos-filtros.test.ts`
- Modify: `src/modules/planejamento/heatmap-recursos.ts`, `src/modules/planejamento/heatmap-recursos.test.ts`

**Interfaces:**
- Produces (`recursos-filtros.ts`):
  - `type ProjetoRef = { id: string; codigo: string; nome: string }`
  - `type PessoaFiltravel = { userId: string; nome: string; disciplinas: readonly string[]; projetoIds: readonly string[] }`
  - `type FiltrosRecursos = { busca: string; projetoId: string | null; disciplina: string | null; soSobrecarregados: boolean }`
  - `normalizarBusca(texto: string): string` — minúsculas, sem acento (NFD), espaços aparados e colapsados.
  - `pessoasQuePassam(pessoas: readonly PessoaFiltravel[], f: Pick<FiltrosRecursos, "busca" | "projetoId" | "disciplina">): Set<string>` — E dos três critérios; `null`/busca vazia = sem critério.
  - `semanasDaJanela(inicio: string, fim: string): string[]` — semanas ISO distintas (`chaveSemanaIso`) dos dias de `diasDaJanela`; janela inválida → `[]`.
  - `sobrecarregadosNaJanela(sobrecargas: readonly { userId: string; semana: string }[], semanas: readonly string[]): Set<string>`
  - `sobrecarregadosNaCargaReal(linhas: readonly { userId: string; porSemana: Record<string, number>; capacidadePorSemana: Record<string, number> }[]): Set<string>` — alguma semana com `h > cap` (cap 0 e `h > 0` conta; `h === cap` não).
  - `projetosSemCronogramaPorPessoa(projetos: readonly (ProjetoRef & { userIds: readonly string[] })[]): Map<string, ProjetoRef[]>` — sem duplicata, ordenado por `codigo`.
- Produces (`heatmap-recursos.ts`): `colunasMeses(hoje: string, quantidade: number): ColunaHeatmap[]` — do mês de `hoje` em diante; `chave` `YYYY-MM`, `rotulo` e `titulo` `"nov/26"`, `dias` = todos os dias do mês.

- [ ] **Step 1: Escrever os testes que falham** em `recursos-filtros.test.ts` e `heatmap-recursos.test.ts`:
  - `pessoasQuePassam`: `"  joao "` acha "João Silva"; busca vazia passa todos; projeto e disciplina combinam por E; disciplina que ninguém tem → conjunto vazio.
  - `semanasDaJanela("2026-12-28", "2027-01-05")` = `["2026-W53","2027-W01","2027-W02"]`; `("2026-11-10","2026-11-01")` = `[]`.
  - `sobrecarregadosNaJanela`: sobrecarga de semana fora da janela não conta.
  - `sobrecarregadosNaCargaReal`: `{h:41,cap:40}` entra; `{h:40,cap:40}` não; `{h:2,cap:0}` entra; `{h:0,cap:0}` não.
  - `projetosSemCronogramaPorPessoa`: projeto repetido para o mesmo usuário aparece uma vez; ordem por `codigo`.
  - `colunasMeses("2026-11-02", 4)`: chaves `2026-11..2026-02`, `dias.length` 30, 31, 31, 28.
- [ ] **Step 2: Rodar** `npx vitest run src/modules/planejamento/recursos-filtros.test.ts src/modules/planejamento/heatmap-recursos.test.ts` — esperado: FAIL (funções não existem).
- [ ] **Step 3: Implementar** as funções nas assinaturas acima. `semanasDaJanela` usa `diasDaJanela` e `chaveSemanaIso` já existentes; `colunasMeses` calcula em UTC (sem `new Date(ano, mes, 1)`).
- [ ] **Step 4: Rodar** os mesmos testes — esperado: PASS.
- [ ] **Step 5: Commit** `feat(recursos): regras puras de filtro, janela e sinal` (stage só os 4 arquivos).

---

### Task 2: Servidor — carga sem alocação digitada, disciplinas e sinal

**Files:**
- Modify: `src/modules/planejamento/recursos-queries.ts`, `queries.ts`, `recursos-actions.ts`, `actions.ts`, `src/app/(dashboard)/recursos/page.tsx`
- Modify: `scripts/smoke-onda5.ts` (seção 7), `scripts/smoke-recursos-eap.ts`

**Interfaces:**
- Consumes: `projetosSemCronogramaPorPessoa`, `ProjetoRef` (Task 1).
- Produces:
  - `cargaDaEquipe(opcoes: { semanas?; hoje?; sugestaoDe?; incluirDigitada?: boolean })` — `incluirDigitada` default `true`; `false` ignora `Alocacao` (não busca, não gera parcela, não entra em sobrecarga/sugestão).
  - `PessoaCarga.disciplinas: string[]` — nomes do catálogo das linhas de projetos **aprovados** em que a pessoa tem atribuição; ordem alfabética, sem repetição.
  - `matrizRecursos` devolve cada linha **sem** `alocacoes`; `totalAlocado`/`alocadoHoje` = soma dos `percentual` das `calculadas` aprovadas (rascunho não soma); `superalocado` = `alocadoHoje > (ausentePessoal ? 0 : capacidadePct)`; ganha `disciplinas: string[]` e `projetosSemCronograma: ProjetoRef[]`.

- [ ] **Step 1: Escrever a checagem do smoke primeiro** em `smoke-onda5.ts`: trocar as afirmações da seção 7 que dependem de alocação digitada. Novas: com uma `Alocacao` de 60% gravada, `linha.totalAlocado === 0`, `"alocacoes" in linha === false`, `capacidadePct === 100`, `custoHora` mascarado como hoje; um `ProjetoMembro` do admin no projeto de teste sem cronograma aprovado faz `linha.projetosSemCronograma` conter o projeto e `superalocado === false`. Em `smoke-recursos-eap.ts`: `cargaDaEquipe({ ..., incluirDigitada: false })` ignora uma `Alocacao` que a chamada padrão soma, e `pessoa.disciplinas` traz a disciplina da linha atribuída.
- [ ] **Step 2: Rodar** `npm run smoke:onda5` e `npm run smoke:recursos-eap` — esperado: FAIL nas afirmações novas.
- [ ] **Step 3: `recursos-queries.ts`** — implementar `incluirDigitada` (pule o `findMany` de `alocacao` e use lista vazia) e `PessoaCarga.disciplinas` (calcule a partir de `linhasDb`, que já traz `disciplina.catalogo.nome` e as atribuições).
- [ ] **Step 4: `queries.ts` / `matrizRecursos`** — remover `alocacoes` do `include`, o campo `alocacoes` e `ativaHoje`; chamar `cargaDaEquipe({ semanas: 1, hoje: hojeIso, incluirDigitada: false })`; incluir `disciplinas` da pessoa; buscar projetos `em_andamento` sem cronograma aprovado (`OR: [{ cronograma: { is: null } }, { cronograma: { aprovado: false } }]`) com `membros`, responsáveis de `disciplinas` e responsáveis de `tarefas` abertas (`arquivada: false`, `status: { concluido: false }`) — a mesma regra de `projetosDoUsuario` em `ponto/queries.ts` — e agrupar com `projetosSemCronogramaPorPessoa`. Atualizar o comentário do cabeçalho da função.
- [ ] **Step 5: `recursos-actions.ts`** — `sugestoesDaSobrecarga` chama `cargaDaEquipe` com `incluirDigitada: false` (senão a sobrecarga que a tela mostra e a que a ação acha divergem). `aplicarSugestaoRecurso` fica como está.
- [ ] **Step 6: `actions.ts`** — apagar `salvarAlocacao`, `removerAlocacao`, `alocacaoSchema` e imports/helpers que ficarem sem uso (confirme com `Grep` que nada mais os chama; o `revRecursos` continua se outro código o usa).
- [ ] **Step 7: `page.tsx`** — chamar `cargaDaEquipe({ semanas: 12, incluirDigitada: false })`; remover `listarHabilidades`, `habilidadesDeUsuarios`, `necessidadesDeHabilidade` e as props `catalogoHabilidades`, `habilidadesPorUser`, `necessidades`. (O componente só compila na Task 3; deixe a Task 2 passar `tsc` do servidor apenas nos arquivos de módulo e trate o erro de props do componente na Task 3.)
- [ ] **Step 8: Rodar** `npm run smoke:onda5`, `npm run smoke:recursos-eap` e `npm run smoke:impacto-ausencia` — esperado: PASS (o aviso de ausência não pode ter mudado).
- [ ] **Step 9: Commit** `feat(recursos): matriz lê só as EAPs e traz disciplinas e sinal de projeto sem cronograma` (stage os arquivos listados; `page.tsx` entra na Task 3 se `tsc` reclamar).

---

### Task 3: Tela — corte, filtros e sinal

**Files:**
- Create: `src/components/recursos/sinal-sem-cronograma.tsx`
- Modify: `src/components/recursos/recursos-matrix.tsx`, `src/app/(dashboard)/recursos/page.tsx`
- Delete: `src/components/recursos/necessidades-projeto.tsx`

**Interfaces:**
- Consumes: `FiltrosRecursos`, `pessoasQuePassam`, `semanasDaJanela`, `sobrecarregadosNaJanela`, `sobrecarregadosNaCargaReal`, `PessoaFiltravel`, `ProjetoRef` (Task 1); `colunasMeses` (Task 1); `cargaPlanejada.pessoas[].disciplinas` e `matrizRecursos.linhas[].projetosSemCronograma` (Task 2).
- Produces: `SinalSemCronograma({ projetos, detalhado? }: { projetos: ProjetoRef[]; detalhado?: boolean })` — selo discreto "sem cronograma aprovado" (com `title` listando os projetos e dizendo que não soma horas); com `detalhado`, um link por projeto para `/projetos/${id}/eap`. Não renderiza nada com lista vazia.

- [ ] **Step 1: Cortar** em `recursos-matrix.tsx`: `AlocacaoDialog`, `RebalancearDialog`, `HabilidadesDialog`, `NecessidadesProjeto` (e o arquivo), tipo `Alocacao`, estados `alocDlg`/`rebalDlg`/`habDlg`/`filtroHabilidade`, `habilidadesUnicas`, `folgaPorUser`, `vigentes`, `superalocadoNaJanela` local, imports mortos (`salvarAlocacao`, `removerAlocacao`, `criarHabilidade`, `alternarHabilidadeUsuario`, `Scale`, `Trash2`, `Plus` se sobrar, `SeletorMultiplo`, `Input`/`Label` se sobrarem) e as props `catalogoHabilidades`, `habilidadesPorUser`, `necessidades`. `Linha` perde `alocacoes` e ganha `disciplinas: string[]`, `projetosSemCronograma: ProjetoRef[]`. `RecursoDialog`/`NovoRecursoDialog` e o botão "Editar" ficam só para `podeGerir`.
- [ ] **Step 2: Heatmap só calculado:** `montarHeatmap` usa `picoDoMes(c.dias, () => 0, calculada)` e `conflitoAusencia` olha só `calculada.get(chaveSemanaIso(dia)) > 0`; `colunasMensais` vira `colunasMeses(hojeLocalIso(), 4)`; `HeatCell.digitada` sai; o `title` da célula e o texto da legenda passam a dizer só "horas dos cronogramas aprovados (próximas 12 semanas; depois disso, sem dado)". "Alocado hoje" na Matriz passa a ser "carga hoje". Texto "superalocado na janela (alocação digitada)" → "acima da capacidade na janela".
- [ ] **Step 3: Filtros.** Estado `filtros: FiltrosRecursos`. Controles: busca por nome (campo de texto, `aria-label="Buscar pessoa"`), Projeto (existente), Disciplina (`Select` com as disciplinas distintas de `cargaPlanejada.pessoas[].disciplinas`), Janela (existente) e uma opção "Só sobrecarregados" (`aria-pressed`). Índice `PessoaFiltravel[]` montado de `cargaPlanejada.pessoas` (`projetoIds` = chaves de `porProjeto` e `rascunhoPorProjeto`). `passam = pessoasQuePassam(...)`. Sobrecarregados: `sobrecarregadosNaJanela(cargaPlanejada.sobrecargas, semanasDaJanela(janelaIni, janelaFim))` para Matriz, Heatmap e Carga planejada; `sobrecarregadosNaCargaReal(cargaSemanal.linhas)` para Carga real. Cada vista filtra suas linhas por `passam` e, se ligado, pelo conjunto da sua vista. O banner "N na janela de análise" usa o mesmo conjunto. Com o filtro de projeto, a Matriz continua mostrando só os chips daquele projeto (comportamento de hoje).
- [ ] **Step 4: Sinal** nas quatro vistas: na Matriz, `SinalSemCronograma detalhado` na coluna de carga e `projetosSemCronograma` não soma nada; no Heatmap, Carga real e Carga planejada, `SinalSemCronograma` ao lado do nome (mapa `sinaisPorUser` derivado de `linhas`). Mensagem de lista vazia diferencia "Nenhum recurso cadastrado." de "Nenhum resultado para os filtros."
- [ ] **Step 5: Cabeçalho:** `CabecalhoPagina` com `titulo="Recursos"` e descrição de uma frase: "Capacidade × carga por pessoa, vinda das EAPs. Para mudar a carga, edite a EAP do projeto." Mantém "Adicionar recurso" só para `podeGerir`. Tirar `NecessidadesProjeto` e a nota "visualização somente leitura" condicionada a `!podeGerir` (a tela toda é leitura).
- [ ] **Step 6: Rodar** `npx tsc --noEmit` (projeto) e `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`, `npm run lint` (sem `--quiet`) e `npm test` — esperado: sem erros novos, todos passando.
- [ ] **Step 7: Commit** `feat(recursos): tela só leitura com filtros e sinal de projeto sem cronograma` (stage componente novo, matriz, arquivo apagado, `page.tsx`).

---

### Task 4: Carga planejada — sugestões só leitura

**Files:**
- Modify: `src/components/recursos/carga-planejada-view.tsx`

**Interfaces:**
- Consumes: `sugestoesDaSobrecarga` (leitura, `recursos:ver`), `SinalSemCronograma` (Task 3).
- Produces: `CargaPlanejadaView({ carga, sinaisPorUser, pessoasVisiveis }: { carga: CargaDaEquipe; sinaisPorUser: Record<string, ProjetoRef[]>; pessoasVisiveis: ReadonlySet<string> | null })` — sem `podeGerir`; `pessoasVisiveis` null = todas.

- [ ] **Step 1: Cortar** `aplicarSugestaoRecurso`, `useConfirm`, `aplicarAtraso`, `aplicarTroca`, os dois botões de aplicar e as props/ifs de `podeGerir`. "Ver sugestões" aparece para todos com `recursos:ver`.
- [ ] **Step 2: Sugestões como texto:** "Atrasar “linha” em N dia(s) (resolve|alivia)" e "Passar “linha” para Fulano (resolve|alivia)", cada uma com link "Abrir a EAP" para `/projetos/${projetoId}/eap` (o projeto da linha vem de `carga.rotulos.linhas[linhaId].projetoId`). A frase de "nenhuma correção cabe" fica como está.
- [ ] **Step 3: Texto do topo:** remover "Projetos sem cronograma aprovado entram pela alocação digitada, convertida em horas." e dizer que projeto sem cronograma aprovado não soma, só sinaliza.
- [ ] **Step 4:** aplicar `pessoasVisiveis` às linhas de `carga.pessoas` e às sobrecargas listadas; aplicar `SinalSemCronograma` ao lado do nome.
- [ ] **Step 5: Rodar** tsc + lint + `npm test` — esperado: PASS. **Step 6: Commit** `feat(recursos): sugestões da carga planejada viram leitura com link da EAP`.

---

### Task 5: Manual

**Files:** Modify `docs/manual/projetos/recursos.md`, `docs/manual/novidades.md`; confira `docs/manual/projetos/guia-iniciante.md` e `planejamento.md` (menções a "alocação", "habilidades", "Rebalancear" em Recursos).

- [ ] **Step 1:** Reescrever `recursos.md` para a tela de leitura: título, frontmatter (`descricao`, `resumo`, `tags`, `palavras-chave`), as quatro vistas só com carga das EAPs, os três filtros novos, o sinal "sem cronograma aprovado" e o que acontece com projeto sem cronograma; remover alocação digitada, faixas, Rebalancear, Competências que o projeto precisa e habilidades (apontar que habilidades ficam no RH). Manter aviso de férias, carga planejada (sugestões só leitura, com link), cadastro do recurso (capacidade, cor, custo/hora e as permissões).
- [ ] **Step 2:** Entrada nova no topo de `novidades.md` (novembro/2026), em linguagem do dia a dia.
- [ ] **Step 3:** Se existir script/teste que valida o manual (`npm test` cobre `lib/manual`), rodar `npm test` — esperado: PASS. **Step 4: Commit** `docs(manual): recursos vira tela de leitura`.

---

### Task 6: Auditoria final (nível 3) e prints

**Files:** `prints-auditoria/2026-11-02_lote2-recursos-leitura/` (gitignored) com `LEIAME.md`.

- [ ] **Step 1:** Reler `docs/PROTOCOLO_AUDITORIA_FINAL.md` (muda) e aplicar o nível 3; revisores 3–4 conforme a seção 13 (permissão, cliente/servidor, UI states).
- [ ] **Step 2:** Rodar `npm run lint`, `npm test`, `npm run build` (nunca com `next dev` ativo nesta pasta), `npm run smoke:onda5`, `smoke:recursos-eap`, `smoke:impacto-ausencia`, `smoke:eap-integracao`.
- [ ] **Step 3:** Dev server na porta 3001 desta worktree. Em tela, como admin de teste (`claude.admin@dev.senahub` / `ClaudeDev@2026`) e como usuário com `recursos:ver` sem `recursos:gerir` (use o ensaio `npm run ensaio:eap`, senha `Demo@2026`, ou um override de `PermissaoUsuario`): as quatro vistas; os três filtros e o projeto; "só sobrecarregados"; o sinal; Carga planejada com "Ver sugestões" sem botão de aplicar; sem controle de edição para quem só vê; 390×844 (`scrollWidth` 390) e 1366×768 com menu aberto. Prints + `LEIAME.md`.
- [ ] **Step 4:** Relatório em pt-BR com o que passou, o que não foi testado e as limitações: o aviso de férias ainda lê a alocação oculta; "Carga real" usa as 12 semanas passadas que ela mostra (a janela é futura); projeto de licitação sem EAP também dispara o sinal. Atualizar a memória `reuniao-hub-2026-10-26-lotes.md` (Lote 2 implementado, sem push).
