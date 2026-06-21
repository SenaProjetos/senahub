# Projetos & Planejamento — Auditoria e Plano de Evolução — Implementation Plan

> **For agentic workers:** Implemente onda a onda, item a item. Os passos usam checkbox
> (`- [ ]`) para acompanhamento entre sessões. Marque `- [x]` ao concluir e atualize o
> **Status** no topo de cada onda. Não pular a auditoria (`defineAction`) nem trocar a stack.

**Goal:** Corrigir as inconsistências dos módulos de **projetos** e **planejamento** e evoluí-los
em integração com o resto do sistema (financeiro + departamento pessoal) e em experiência de uso,
a partir da auditoria de 2026-06-21 (**60 correções + 55 novos itens = 115 intervenções**).

**Architecture:** Mudanças cirúrgicas nos módulos existentes (`src/modules/projetos`,
`src/modules/planejamento`, `src/modules/rh/rateio`, `src/modules/uploads`, `src/modules/financeiro`)
+ componentes (`src/components/projetos`, `src/components/planejamento`) + páginas em
`src/app/(dashboard)/projetos` e `/planejamento`. Lógica nova testável (CPM/auto-schedule, roll-up de
progresso, custo do projeto, capacidade com ausências) sai para módulos-folha puros (sem
`server-only`/sessão/prisma no caminho do teste) cobertos por `vitest`. UI/rotas: implementar +
`npx tsc --noEmit` + verificação manual.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript · Prisma 7 (`@/generated/prisma/client`) ·
pg-boss (jobs/alertas) · vitest · sonner · shadcn-on-base-ui.

## Global Constraints

- Arquitetura fixa: Server Actions + Zod no `defineAction`; leitura via Server Components/`queries.ts`.
  Rotas REST só para multipart/streaming/token. **Não** adicionar SWR nem react-hook-form.
- Código/identificadores em inglês; **toda** string de UI em português (pt-BR); commits semânticos pt-BR.
- Auditoria obrigatória em mutações via `defineAction` (já é o padrão). Toda nova ação **audita**;
  capturar `capturarAntes` em edições sensíveis (status, valores, prazos).
- Prisma sempre de `@/generated/prisma/client`. shadcn é base-ui: triggers `render={<Comp/>}`, não `asChild`.
  `Select onValueChange` devolve `string | null`.
- Escopo de dados: globais (`admin`, `supervisor`) veem tudo; demais filtrados por `escopoProjeto`
  (membro **ou** responsável). Valores financeiros gateados por `financeiro:ver`.
- Toda migração nova: `npm run db:migrate` (nome semântico) + `npm run db:generate`.
- Testes automatizados só para **lógica pura** (CPM, roll-up, custo, capacidade, atraso/SLA). UI/rota:
  `npx tsc --noEmit` + verificação manual.

---

## Legendas

**Status:** ⬜ pendente · 🟡 em andamento · ✅ concluído · ⛔ descartado

**Custo IA (tempo médio previsto):**
| Símbolo | Faixa | Significado |
|---------|-------|-------------|
| ⚡ | < 30 min | 1 arquivo, padrão repetido |
| 🟢 | ~30–60 min | poucos arquivos, sem migração |
| 🔵 | ~1–3 h | migração + action + UI |
| 🟠 | ~meio dia | vários arquivos, lógica nova testável |
| 🔴 | multi-sessão | subsistema novo / cross-módulo profundo |

**Impacto na arquitetura:** ◻ local (edita arquivo existente) · ◼ migração de schema · ⬛ cross-módulo/novo subsistema

**Ganho QoL (usuário/admin):** ★☆☆ baixo · ★★☆ médio · ★★★ alto

---

## Mapa de ondas

| Onda | Tema | Prioridade | Modelo padrão | Status |
|------|------|-----------|---------------|--------|
| P0 | Quick wins e coerência | — | Sonnet 4.6 | ⬜ |
| P1 | **Custo real do projeto** (Financeiro) | 🔴 máx. | **Opus 4.8** | ⬜ |
| P2 | **Receita/contrato** (Financeiro) | 🔴 máx. | **Opus 4.8** | ⬜ |
| P3 | **Plano × execução** (RH/EAP/recursos) | 🔴 máx. | **Opus 4.8** (misto) | ⬜ |
| P4 | **Visão Geral & UX** | 🔴 máx. | Sonnet 4.6 | ⬜ |
| P5 | Entregas, status e qualidade | — | Sonnet 4.6 | ⬜ |
| P6 | Colaboração, cliente, relatórios e extras | — | Misto | ⬜ |

> **Racional do mapa:** **Opus** onde o erro é silencioso/estrutural (corretude de margem/custo,
> postagem de lançamentos, reagendamento de cronograma, roll-up de progresso); **Sonnet** onde o
> erro é óbvio e barato de pegar (CRUD, UI, migração com padrão repetido) — `tsc`+`lint`+`vitest`
> travam regressão. A troca de modelo é **manual** (`/model`): o assistente anuncia o recomendado
> antes de cada etapa e espera a confirmação.

---

## Diagnóstico (resumo executivo)

Estado atual mapeado em `modules/projetos/{queries,actions,schemas,status,atraso,numbering}.ts`,
`modules/projetos/{servicos,extras,pranchas,arquivos}/*`, `modules/planejamento/{queries,actions,caminho-critico}.ts`,
`modules/uploads/actions.ts`, `modules/rh/rateio/{queries,actions}.ts`, `modules/financeiro/folha-lote/actions.ts`,
e a UI em `components/projetos/*` + `components/planejamento/*`.

**O que está bom:** numeração atômica AAXXXX; escopo por papel; regra de ouro upload A+B → validação →
`PagamentoProjetista`; EAP com dependências FS, CPM (`caminho-critico.ts`) destacado no gantt, linha de
base e ponte EAP→Kanban; matriz de recursos; alertas de prazo D-7/3/1 (`jobs-handlers`); margem por projeto.

**3 lacunas estruturais de integração (foco das ondas P1–P3):**

1. **Custo real subestimado.** `margemProjeto` = receitas confirmadas − despesas de `Lancamento` −
   `RateioHora` (ponto). **`PagamentoProjetista` e `ServicoTerceirizado` nunca viram `Lancamento` nem
   entram na margem.** Projetista PJ/freelancer pago por entrega não tem custo capturado; serviços
   terceirizados idem. `folha-lote` agrupa pagamentos mas **não posta no financeiro**.
2. **Receita/contrato ausente.** Não há campo de **valor de contrato** no `Projeto`; a margem usa só
   receitas já confirmadas. A **composição de preço** calcula um total que **não vira receita prevista**
   nem cronograma de parcelas (recebíveis).
3. **Plano ≠ execução.** EAP (previsto) e ponto/status (realizado) não se cruzam: progresso da EAP é
   **manual**; dependências FS **não reagendam** sucessoras; `matrizRecursos.superalocado` **soma %
   ignorando períodos** e **ignora férias/abono**; custo de horas na margem só conta meses **fechados**.

**Regressão de UX vs. sistema antigo:** a página do projeto perdeu a **aba "Visão Geral"** (KPIs:
conclusão %, dias restantes, entregas, atraso; mini-gantt; donut financeiro; explorer de arquivos;
índice de qualidade; timeline de status). Hoje é um scroll único e os sub-recursos (pranchas/serviços/
arquivos/extras) abrem em rotas separadas, perdendo contexto.

---

## Catálogo de CORREÇÕES (P-01 … P-60)

### A. Modelo de dados, CRUD e integridade

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-01 | **`criarProjeto` não cria canais de chat.** `duplicar`/`definirMembros`/`definirResponsaveis` chamam `ensureCanaisProjeto`, mas o `criar` não → projeto novo nasce sem canal até mexer na equipe. | ⚡ | ◻ | ★★☆ |
| P-02 | **Sem CRUD de disciplina pós-criação.** Não há ação para adicionar/remover/renomear disciplina nem editar `valor`/`prazo` depois do create (só `criarProjetoSchema`). | 🔵 | ◻ | ★★★ |
| P-03 | **`editarProjeto` não troca `clienteId` nem edita valor.** O update ignora cliente e qualquer campo financeiro. | 🟢 | ◻ | ★★☆ |
| P-04 | **`ProjetoMembro.papel` morto.** Campo existe e a UI o exibe, mas `criar`/`definirMembros` nunca o gravam → sempre nulo. Capturar papel ou remover. | 🟢 | ◻ | ★☆☆ |
| P-05 | **Sem exclusão/cancelamento de projeto.** Só dá para mudar `situacao` manualmente; não há ação de cancelar (com motivo) nem soft-delete. | 🔵 | ◼ | ★★☆ |
| P-06 | **`duplicarProjeto` não oferece carregar equipe/responsáveis/EAP.** Cópia nasce "limpa" sem opção. | 🟢 | ◻ | ★★☆ |
| P-07 | **Busca por código com `replace(/\D/g,"")`.** Sem dígitos vira `contains ""` (ruído no OR). Incluir o branch só quando houver dígitos. | ⚡ | ◻ | ★☆☆ |
| P-08 | **Sem validação prazo disciplina ≤ `prazoFinal`.** Disciplina pode vencer depois do projeto sem aviso. | 🟢 | ◻ | ★★☆ |
| P-09 | **Catálogo de disciplinas não vira template por tipo.** Existe `InputTemplate` p/ inputs, mas nada para auto-adicionar disciplinas-padrão ao criar projeto. | 🔵 | ◼ | ★★☆ |
| P-10 | **Conjuntos de roles divergentes.** `usuariosInternos` (exclui só `cliente`), escopo, DM e matriz usam regras de role diferentes; sem constante única "membro de projeto". | 🟢 | ◻ | ★☆☆ |

### B. Fluxo de status & entregas

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-11 | **Status de disciplina é select livre (any→any).** Sem máquina de estados: pula `aguardando`→`aprovado` sem upload. | 🔵 | ◻ | ★★☆ |
| P-12 | **Dois caminhos para "aprovado" com semântica diferente.** Select manual NÃO libera pagamento; `validarEntrega` força `aprovado`+paga. "Aprovado" ora significa pago, ora não. Separar `validado/pago` do status. | 🔵 | ◼ | ★★★ |
| P-13 | **`validarEntrega` exige sempre Pacote A E B (hard-coded).** Disciplinas que não usam os dois travam. Tornar regra configurável. | 🔵 | ◻ | ★★☆ |
| P-14 | **`atualizarStatusDisciplina`/`registrarRevisao` sem `recurso`/`permissao` no `defineAction`.** Gate só inline (`isGlobal`/`ehResp`). Uniformizar e documentar o padrão. | ⚡ | ◻ | ★☆☆ |
| P-15 | **Atribuir responsável não notifica.** `definirResponsaveis` sincroniza canais mas não avisa o responsável. | 🟢 | ◻ | ★★☆ |
| P-16 | **Revisão desacoplada.** `registrarRevisao` não exige/relaciona o arquivo revisado nem notifica; `Prancha.revisao` (string) não conversa com `RevisaoDisciplina`. | 🔵 | ◼ | ★★☆ |
| P-17 | **`entregueEm` sem relatório de SLA.** Grava a data mas não há lead-time entrega/% no prazo. | 🔵 | ◻ | ★★☆ |
| P-18 | **Sem indicador de atraso a nível de projeto no detalhe.** Só por disciplina (`diasDeAtraso`); falta badge "atrasado Xd" no topo. | 🟢 | ◻ | ★★☆ |

### C. Integração Financeiro  🔴

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-19 | **`PagamentoProjetista` nunca vira `Lancamento`.** `folha-lote` agrupa em `FolhaProjetista` mas não posta despesa → DRE/fluxo de caixa cegos para pagamento de projetista. | 🟠 | ⬛ | ★★★ |
| P-20 | **`margemProjeto` ignora `PagamentoProjetista`.** Subestima custo de PJ/freelancer pago por entrega (que muitas vezes não batem ponto → fora do `custoHoras`). | 🔵 | ⬛ | ★★★ |
| P-21 | **`ServicoTerceirizado.valor` fora do financeiro.** Custo de fornecedor não vira `Lancamento` nem entra na margem. | 🔵 | ⬛ | ★★☆ |
| P-22 | **Projeto sem "valor de contrato".** Margem usa só receitas confirmadas; não há receita contratada/prevista de referência. | 🔵 | ◼ | ★★★ |
| P-23 | **Composição de preço não gera receita.** `ProjetoComposicaoPreco` calcula total que não vira receita prevista nem se compara ao contrato. | 🟠 | ⬛ | ★★☆ |
| P-24 | **Risco de dupla contagem de CLT.** CLT projetista pode entrar na margem via `custoHoras` (ponto) **e** via `PagamentoProjetista`. Regra clara por `tipoProfissional`. | 🔵 | ◻ | ★★☆ |
| P-25 | **Sem lançar receita/despesa direto do projeto.** Precisa ir ao financeiro e escolher o projeto manualmente. | 🟢 | ◻ | ★★☆ |

### D. Integração DP/RH  🔴

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-26 | **`custoHoras` só conta meses FECHADos.** `RateioHora` vem do fechamento mensal; esforço do mês corrente é invisível na margem. | 🔵 | ◻ | ★★☆ |
| P-27 | **Sem visão de horas por projeto/pessoa no detalhe.** Só o agregado de custo aparece. | 🔵 | ◻ | ★★☆ |
| P-28 | **Plano × real ausente.** Alocação (%) planejada não é comparada às horas reais de `SessaoTrabalho`. | 🟠 | ⬛ | ★★★ |
| P-29 | **`superalocado` ignora período.** `matrizRecursos` soma `percentual` sem olhar `inicio/fim` → falso positivo de superalocação. | 🔵 | ◻ | ★★☆ |
| P-30 | **Disponibilidade ignora ausências.** Pessoa de férias/abono/feriado aparece com 100% de capacidade. | 🟠 | ⬛ | ★★☆ |
| P-31 | **Horas "sem projeto" invisíveis.** `SessaoTrabalho.projetoId` nulo cai fora da margem sem indicador do % não rateado. | 🟢 | ◻ | ★☆☆ |

### E. Planejamento / EAP / Gantt / Recursos  🔴

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-32 | **`gerarTarefaDeEap` sem dedup.** Cada clique cria nova `Tarefa` (documentado). Tornar idempotente (vínculo `eapTarefaId`→`tarefa`). | 🟢 | ◼ | ★★☆ |
| P-33 | **Progresso da EAP é manual.** Não deriva de status de disciplina/tarefa/upload → fica desatualizado. | 🟠 | ◻ | ★★★ |
| P-34 | **Dependências não reagendam.** CPM só destaca críticas/folga; mover predecessora não empurra sucessora. | 🟠 | ◻ | ★★★ |
| P-35 | **`aplicarAoProjeto` one-way e cego.** Sobrescreve `prazo` da disciplina sem reverso e sem avisar disciplinas sem EAP correspondente. | 🔵 | ◻ | ★★☆ |
| P-36 | **Sem "gerar EAP das disciplinas".** Projeto novo mostra "Sem tarefas de EAP" e exige montar tudo à mão. | 🔵 | ◻ | ★★★ |
| P-37 | **Pai/resumo não distinto no CPM.** Datas do pai não derivam dos filhos (schema não separa resumo de folha). | 🔵 | ◻ | ★★☆ |
| P-38 | **Alocação só por projeto (%).** Granularidade grossa; não há alocação por disciplina/tarefa. | 🟠 | ◼ | ★★☆ |
| P-39 | **Dois mecanismos de linha de base.** `EapTarefa.{inicio,fim}Baseline` (definirLinhaBase) e `LinhaBase` (snapshot Json) coexistem. Consolidar. | 🔵 | ◻ | ★☆☆ |
| P-40 | **Gantt sem arrastar.** Datas só editáveis via dialog; sem drag/resize de barras. | 🟠 | ◻ | ★★★ |
| P-41 | **`projetosComPlano` só `em_andamento`/`concluido`.** Planejamento de arquivados/cancelados some. | ⚡ | ◻ | ★☆☆ |

### F. UI/UX  🔴

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-42 | **Detalhe sem abas.** Perdeu Visão Geral/Projeto/Tarefas/EAP/Inputs do sistema antigo; hoje é scroll único. | 🟠 | ◻ | ★★★ |
| P-43 | **Sem painel de KPIs.** Falta conclusão %, dias restantes, entregas, atraso, margem em cards. | 🔵 | ◻ | ★★★ |
| P-44 | **Sem mini-gantt/timeline de disciplinas no detalhe.** | 🔵 | ◻ | ★★☆ |
| P-45 | **Financeiro só em números.** Sem donut receita×despesa×margem. | 🟢 | ◻ | ★★☆ |
| P-46 | **Sub-recursos em rotas separadas.** Pranchas/serviços/arquivos/extras abrem fora do contexto do projeto. | 🔵 | ◻ | ★★☆ |
| P-47 | **Disciplinas só por dropdown.** Sem kanban arrastável por status. | 🟠 | ◻ | ★★☆ |
| P-48 | **Sem ações em massa.** Não dá para definir responsável/prazo de várias disciplinas de uma vez. | 🔵 | ◻ | ★★☆ |
| P-49 | **Cronograma geral sem filtros.** Falta filtrar por responsável/cliente/atraso. | 🟢 | ◻ | ★★☆ |
| P-50 | **Equipe só lista nomes.** Sem avatar, carga ou presença (o chat já tem `chatStatus`). | 🟢 | ◻ | ★☆☆ |
| P-51 | **Fluxo da disciplina fragmentado.** Revisão/Arquivos/Responsáveis em 3 diálogos separados. | 🔵 | ◻ | ★★☆ |

### G. Notificações & automação básica

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-52 | **Mudança de status/atribuição não notifica.** Só há alertas de prazo (D-7/3/1) e validação. | 🟢 | ◻ | ★★☆ |
| P-53 | **Cliente não é lembrado de preencher inputs.** Link público existe mas sem lembrete. | 🟢 | ⬛ | ★★☆ |
| P-54 | **Sem alerta proativo de risco/superalocação.** Nenhum job cruza atraso+margem+capacidade. | 🔵 | ⬛ | ★★☆ |

### H. Performance & escala

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-55 | **`obterProjeto` over-fetch.** Carrega uploads de TODAS as disciplinas sempre, mesmo no detalhe. | 🔵 | ◻ | ★★☆ |
| P-56 | **Busca textual sem índice.** `listarProjetos` faz `contains` em nome/cliente sem full-text. | ⚡ | ◻ | ★☆☆ |
| P-57 | **`revalidatePath` inconsistente.** Status não revalida `/planejamento` nem o dashboard. | ⚡ | ◻ | ★☆☆ |

### I. Permissões & escopo

| # | Achado e resumo | Custo | Arquit. | QoL |
|---|-----------------|-------|---------|-----|
| P-58 | **Coerência de visibilidade financeira.** `obterProjeto` oculta `valor` de disciplina p/ não-responsável, mas a margem (com `financeiro:ver`) expõe o custo agregado. Revisar. | 🟢 | ◻ | ★☆☆ |
| P-59 | **Escopo duplicado.** `escopoProjeto` está copiado em `projetos/queries.ts` e `planejamento/queries.ts`. Extrair helper único. | ⚡ | ◻ | ★☆☆ |
| P-60 | **Cliente sem visão do próprio projeto.** Role `cliente` não tem leitura de status/entregas (sem portal). | 🟠 | ⬛ | ★★☆ |

---

## Catálogo de NOVOS ITENS / AUTOMAÇÕES (N-01 … N-55)

### J. Visão geral & dashboards  🔴

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-01 | **Aba "Visão Geral" com saúde do projeto** (semáforo: prazo+margem+responsáveis+inputs). | 🔵 | ◻ | ★★★ |
| N-02 | **KPI cards** (conclusão %, dias restantes, entregas, atraso, margem) no topo do detalhe. | 🔵 | ◻ | ★★★ |
| N-03 | **Health score** consolidado + ordenação por risco na lista de projetos. | 🔵 | ◻ | ★★★ |
| N-04 | **Mini-gantt de disciplinas** no detalhe (reaproveita gantt). | 🔵 | ◻ | ★★☆ |
| N-05 | **Donut financeiro** receita×despesa×margem. | 🟢 | ◻ | ★★☆ |
| N-06 | **File explorer** de todos os arquivos do projeto na visão geral. | 🔵 | ◻ | ★★☆ |
| N-07 | **Linha do tempo de status** a partir do `AuditLog`. | 🔵 | ◻ | ★★☆ |
| N-08 | **"Meu trabalho":** disciplinas atribuídas a mim entre projetos (página própria). | 🔵 | ⬛ | ★★★ |
| N-09 | **Dashboard de carteira** (admin): heatmap de atraso/margem por projeto. | 🟠 | ⬛ | ★★☆ |

### K. Automação de cronograma  🔴

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-10 | **Gerar EAP a partir das disciplinas** (1 clique: cria tarefas por disciplina com prazos). | 🔵 | ◻ | ★★★ |
| N-11 | **Auto-schedule de sucessoras** ao mover predecessora (FS + lag). | 🟠 | ◻ | ★★★ |
| N-12 | **Roll-up automático de progresso** (disciplina/tarefa/upload → EAP → projeto). | 🟠 | ◻ | ★★★ |
| N-13 | **Drag/resize de barras** no gantt. | 🟠 | ◻ | ★★★ |
| N-14 | **Datas do pai derivadas dos filhos** (tarefa-resumo). | 🔵 | ◻ | ★★☆ |
| N-15 | **Lag/lead e tipos de dependência (SS/FF)** além de FS. | 🟠 | ◼ | ★★☆ |
| N-16 | **Templates de cronograma** por tipo de projeto. | 🔵 | ◼ | ★★☆ |
| N-17 | **Calendário de trabalho/feriados no CPM** (usa `Feriado`; dias úteis). | 🟠 | ◻ | ★★☆ |
| N-18 | **Marcos/milestones** (duração 0) + alerta de marco. | 🔵 | ◼ | ★★☆ |

### L. Automação financeira  🔴

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-19 | **Auto-`Lancamento` de despesa ao pagar folha de projetista** (vincula `lancamentoId`). | 🟠 | ⬛ | ★★★ |
| N-20 | **Custo de projetista na margem** (previsto + realizado), sem dupla contagem (ver P-24). | 🔵 | ⬛ | ★★★ |
| N-21 | **Valor de contrato + cronograma de parcelas (recebíveis)** por projeto. | 🟠 | ◼ | ★★★ |
| N-22 | **Gerar receitas previstas** a partir da composição de preço/parcelas. | 🟠 | ⬛ | ★★☆ |
| N-23 | **Serviço terceirizado → despesa vinculada** (1 clique). | 🔵 | ⬛ | ★★☆ |
| N-24 | **Margem em tempo real** (mês aberto via cálculo ao vivo do rateio). | 🔵 | ◻ | ★★☆ |
| N-25 | **EVM básico** (PV/EV/AC, SPI/CPI) por projeto. | 🔴 | ⬛ | ★★☆ |
| N-26 | **Faturamento por entrega validada** (gatilho de receita ao validar disciplina). | 🔵 | ⬛ | ★★☆ |
| N-27 | **Atalho "lançar no projeto"** (receita/despesa contextual no detalhe). | 🟢 | ◻ | ★★☆ |

### M. Automação RH/custos  🔴

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-28 | **Painel horas plan×real** por projeto/pessoa. | 🟠 | ⬛ | ★★★ |
| N-29 | **Cronômetro start/stop** de `SessaoTrabalho` na página do projeto. | 🔵 | ◻ | ★★☆ |
| N-30 | **Disponibilidade com ausências** (desconta férias/abono/feriado da capacidade). | 🟠 | ⬛ | ★★☆ |
| N-31 | **Alocação por janela temporal** (overlap real, corrige P-29). | 🔵 | ◻ | ★★☆ |
| N-32 | **Sugestão de alocação por habilidade** (`UserHabilidade`) + capacidade livre. | 🟠 | ⬛ | ★★☆ |
| N-33 | **Heatmap de carga semanal** por pessoa. | 🔵 | ◻ | ★★☆ |

### N. Entregas & qualidade

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-34 | **Checklist de entregáveis por disciplina** (itens marcáveis). | 🔵 | ◼ | ★★☆ |
| N-35 | **Workflow de revisão** com upload obrigatório + aprovação (estende `SolicitacaoRevisao`). | 🔵 | ◼ | ★★☆ |
| N-36 | **Numeração automática de pranchas** + vínculo upload/revisão. | 🔵 | ◼ | ★★☆ |
| N-37 | **Índice de qualidade** do projeto (resgatado do sistema antigo). | 🟠 | ⬛ | ★★☆ |
| N-38 | **Relatório de SLA de entregas** (lead time, % no prazo) — usa `entregueEm`. | 🔵 | ◻ | ★★☆ |
| N-39 | **Registro de risco/pendências** por projeto. | 🔵 | ◼ | ★★☆ |

### O. Colaboração & cliente

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-40 | **Portal do cliente** read-only (status/entregas) por token/role `cliente`. | 🟠 | ⬛ | ★★☆ |
| N-41 | **Lembrete automático de inputs** ao cliente (job). | 🟢 | ⬛ | ★★☆ |
| N-42 | **Comentários por disciplina** (mini-thread) ou deep-link ao canal do chat. | 🔵 | ◼ | ★★☆ |
| N-43 | **Aceite digital do cliente** por entrega. | 🟠 | ⬛ | ★★☆ |

### P. Relatórios & exportação

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-44 | **Exportar cronograma/projeto (PDF)** via modelos de documento existentes. | 🔵 | ◻ | ★★☆ |
| N-45 | **Relatório de carteira (Excel/CSV)** com margem/atraso. | 🔵 | ◻ | ★★☆ |
| N-46 | **Status report semanal automático** por projeto (digest). | 🔵 | ⬛ | ★★☆ |
| N-47 | **Comparativo de linha de base** (baseline vs atual) visual. | 🔵 | ◻ | ★★☆ |

### Q. Produtividade & mobile

| # | Item e resumo | Custo | Arquit. | QoL |
|---|---------------|-------|---------|-----|
| N-48 | **Ações em massa** (responsável/prazo/status) na lista de disciplinas. | 🔵 | ◻ | ★★☆ |
| N-49 | **Busca global** de projetos/disciplinas (command palette). | 🔵 | ⬛ | ★★☆ |
| N-50 | **Filtros salvos / "meus projetos"** como visão padrão. | 🟢 | ◻ | ★★☆ |
| N-51 | **Cards mobile-first** com progresso e atraso. | 🟢 | ◻ | ★★☆ |
| N-52 | **Kanban arrastável de disciplinas** por status. | 🟠 | ◻ | ★★☆ |
| N-53 | **Duplicar projeto com opções** (equipe/EAP/composição). | 🟢 | ◻ | ★★☆ |
| N-54 | **Tópico de chat por disciplina** (estende o link projeto↔chat já existente). | 🔵 | ◼ | ★★☆ |
| N-55 | **Notificações configuráveis por evento de projeto** (preferências). | 🔵 | ⬛ | ★★☆ |

---

## Distribuição por onda

> Itens podem migrar entre ondas na execução. As 4 prioridades (P1–P4) vêm antes do polimento (P5–P6).

### Onda P0 — Quick wins e coerência  ⬜  · Sonnet 4.6
Correções baratas, sem migração, que destravam o resto.
- **Inclui:** P-01, P-04, P-07, P-10, P-14, P-18, P-41, P-49, P-50, P-56, P-57, P-59 · N-50, N-51, N-53
- **Critério de saída:** `tsc`+`lint` limpos; canal criado no `criarProjeto`; escopo unificado em helper.

### Onda P1 — Custo real do projeto (Financeiro)  ⬜  · **Opus 4.8**
Fecha a lacuna #1: todo custo do projeto aparece na margem e no caixa.
- **Inclui:** P-19, P-20, P-21, P-24, P-25 · N-19, N-20, N-23, N-24, N-27
- **Lógica pura testável:** cálculo de custo do projeto (ponto + projetista + serviços, anti-dupla-contagem).
- **Critério de saída:** pagar folha de projetista posta `Lancamento`; margem inclui projetista+serviços; teste de custo verde.

### Onda P2 — Receita/contrato (Financeiro)  ⬜  · **Opus 4.8**
Fecha a lacuna #2: receita contratada e recebíveis.
- **Inclui:** P-22, P-23 · N-21, N-22, N-26
- **Schema:** `Projeto.valorContrato` + modelo de parcela/recebível (ou reuso de `Lancamento` receita previsto).
- **Critério de saída:** contrato + parcelas geram receita prevista; margem compara previsto×realizado.

### Onda P3 — Plano × execução (RH/EAP/recursos)  ⬜  · **Opus 4.8** (CPM/roll-up/capacidade) + Sonnet (UI)
Fecha a lacuna #3: previsto e realizado se cruzam; cronograma se auto-organiza.
- **Inclui:** P-26, P-27, P-28, P-29, P-30, P-31, P-32, P-33, P-34, P-35, P-36, P-37, P-38, P-39 · N-10, N-11, N-12, N-14, N-17, N-28, N-29, N-30, N-31, N-32, N-33
- **Lógica pura testável:** auto-schedule FS+lag, roll-up de progresso/datas, capacidade com ausências, custo ao vivo.
- **Critério de saída:** mover predecessora reagenda sucessora; progresso da EAP deriva da execução; superalocação respeita período e ausências.

### Onda P4 — Visão Geral & UX  ⬜  · Sonnet 4.6
Reconstrói a experiência do detalhe do projeto.
- **Inclui:** P-42, P-43, P-44, P-45, P-46, P-47, P-48, P-51, P-55, P-58 · N-01, N-02, N-03, N-04, N-05, N-06, N-07, N-08, N-09, N-13, N-47, N-48, N-52
- **Critério de saída:** detalhe em abas com KPIs+saúde; sub-recursos no contexto; lista ordenável por risco.

### Onda P5 — Entregas, status e qualidade  ⬜  · Sonnet 4.6
- **Inclui:** P-02, P-03, P-05, P-06, P-08, P-09, P-11, P-12, P-13, P-15, P-16, P-17 · N-15, N-16, N-18, N-34, N-35, N-36, N-37, N-38, N-39, N-44, N-45
- **Critério de saída:** CRUD de disciplina; máquina de estados; SLA; checklist de entregáveis; pranchas numeradas.

### Onda P6 — Colaboração, cliente, relatórios e extras  ⬜  · Misto
- **Inclui:** P-52, P-53, P-54, P-60 · N-25, N-40, N-41, N-42, N-43, N-46, N-49, N-54, N-55
- **Critério de saída:** portal do cliente; notificações por evento; EVM; status report automático.

---

## Checklist de validação — o que IMPLEMENTAR de fato

> Marque `- [x]` os itens aprovados para execução. Os não marcados ficam no backlog.
> Sugestão de corte inicial: **toda a P0–P4** (lacunas estruturais + UX) e os itens ★★★ de P5–P6.

### Correções
- [ ] P-01 criar canal no `criarProjeto`  · [ ] P-02 CRUD de disciplina  · [ ] P-03 editar cliente/valor
- [ ] P-04 papel do membro  · [ ] P-05 cancelar/excluir projeto  · [ ] P-06 duplicar com opções
- [ ] P-07 busca por código  · [ ] P-08 prazo ≤ projeto  · [ ] P-09 template de disciplinas
- [ ] P-10 roles unificadas  · [ ] P-11 máquina de estados  · [ ] P-12 separar validado/pago
- [ ] P-13 A/B configurável  · [ ] P-14 uniformizar gate  · [ ] P-15 notificar responsável
- [ ] P-16 revisão linkada  · [ ] P-17 SLA de entrega  · [ ] P-18 atraso no detalhe
- [ ] **P-19 folha projetista → Lançamento**  · [ ] **P-20 projetista na margem**  · [ ] **P-21 serviço → despesa**
- [ ] **P-22 valor de contrato**  · [ ] **P-23 composição → receita**  · [ ] P-24 anti-dupla-contagem  · [ ] P-25 lançar do projeto
- [ ] **P-26 custo mês aberto**  · [ ] P-27 horas no detalhe  · [ ] **P-28 plan×real**  · [ ] P-29 superalocação por período
- [ ] P-30 ausências na capacidade  · [ ] P-31 horas sem projeto  · [ ] P-32 dedup gerarTarefa  · [ ] **P-33 progresso roll-up**
- [ ] **P-34 auto-schedule**  · [ ] P-35 aplicar bidirecional  · [ ] **P-36 gerar EAP**  · [ ] P-37 datas do pai
- [ ] P-38 alocação por disciplina  · [ ] P-39 consolidar linha de base  · [ ] P-40 drag no gantt  · [ ] P-41 planos arquivados
- [ ] **P-42 abas**  · [ ] **P-43 KPI cards**  · [ ] P-44 mini-gantt  · [ ] P-45 donut  · [ ] P-46 sub-recursos no contexto
- [ ] P-47 kanban disciplinas  · [ ] P-48 ações em massa  · [ ] P-49 filtros cronograma  · [ ] P-50 equipe enriquecida
- [ ] P-51 painel da disciplina  · [ ] P-52 notificar status  · [ ] P-53 lembrete inputs  · [ ] P-54 alerta de risco
- [ ] P-55 over-fetch  · [ ] P-56 índice de busca  · [ ] P-57 revalidate  · [ ] P-58 visibilidade financeira
- [ ] P-59 escopo único  · [ ] P-60 visão do cliente

### Novos itens / automações
- [ ] **N-01 saúde do projeto**  · [ ] **N-02 KPIs**  · [ ] **N-03 health score**  · [ ] N-04 mini-gantt  · [ ] N-05 donut
- [ ] N-06 explorer  · [ ] N-07 timeline  · [ ] **N-08 meu trabalho**  · [ ] N-09 carteira
- [ ] **N-10 gerar EAP**  · [ ] **N-11 auto-schedule**  · [ ] **N-12 roll-up**  · [ ] N-13 drag  · [ ] N-14 datas do pai
- [ ] N-15 SS/FF+lag  · [ ] N-16 templates cronograma  · [ ] N-17 calendário/feriados  · [ ] N-18 marcos
- [ ] **N-19 auto-lançamento folha**  · [ ] **N-20 custo projetista margem**  · [ ] **N-21 contrato+parcelas**  · [ ] N-22 receita da composição
- [ ] N-23 serviço→despesa  · [ ] N-24 margem ao vivo  · [ ] N-25 EVM  · [ ] N-26 faturar por entrega  · [ ] N-27 lançar do projeto
- [ ] **N-28 plan×real horas**  · [ ] N-29 cronômetro  · [ ] N-30 ausências  · [ ] N-31 alocação por janela  · [ ] N-32 sugestão por habilidade  · [ ] N-33 heatmap carga
- [ ] N-34 checklist entregáveis  · [ ] N-35 workflow revisão  · [ ] N-36 pranchas numeradas  · [ ] N-37 índice qualidade  · [ ] N-38 SLA  · [ ] N-39 riscos
- [ ] N-40 portal cliente  · [ ] N-41 lembrete inputs  · [ ] N-42 comentários disciplina  · [ ] N-43 aceite cliente
- [ ] N-44 PDF cronograma  · [ ] N-45 carteira CSV  · [ ] N-46 status report  · [ ] N-47 comparativo baseline
- [ ] N-48 ações em massa  · [ ] N-49 busca global  · [ ] N-50 filtros salvos  · [ ] N-51 cards mobile  · [ ] N-52 kanban arrastável  · [ ] N-53 duplicar com opções  · [ ] N-54 chat por disciplina  · [ ] N-55 notificações configuráveis

---

## Verificação por onda (rodar sempre)

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run lint` limpo
- [ ] `npm test` (vitest) — novos testes puros (CPM/auto-schedule, roll-up, custo, capacidade, SLA) passam
- [ ] Manual: criar projeto → ver canal/EAP/visão geral; validar entrega → conferir margem e caixa
- [ ] Atualizar a tabela de **status** das ondas e marcar checkboxes
- [ ] Commit semântico pt-BR por onda

---

## Notas de decisão (preencher ao executar)

- Custo do projeto (P-19/P-20/P-21): definir se a margem soma `PagamentoProjetista` **liberado** ou só **pago**,
  e como evitar dupla contagem com `RateioHora` (sugestão: CLT pelo ponto; PJ/freelancer pelo pagamento).
- Receita (P-22/N-21): reusar `Lancamento` (tipo receita, status previsto) como parcela vs. modelo novo.
- Plano×execução (N-12): fonte de verdade do progresso (status de disciplina × tarefas × upload validado).
- Linha de base (P-39): escolher um mecanismo (campos na `EapTarefa` **ou** `LinhaBase` snapshot) e migrar o outro.

## Referências de arquivos (mapa rápido)

**Server (projetos):** `src/modules/projetos/{queries,actions,schemas,status,atraso,numbering}.ts`,
`src/modules/projetos/{servicos,extras,pranchas,arquivos}/{queries,actions}.ts`, `src/modules/uploads/actions.ts`

**Server (planejamento):** `src/modules/planejamento/{queries,actions,caminho-critico}.ts`

**Integração:** `src/modules/rh/rateio/{queries,actions}.ts`, `src/modules/financeiro/folha-lote/actions.ts`,
`src/modules/financeiro/{planejamento,relatorios}/queries.ts`, `src/lib/jobs-handlers.ts` (alertas)

**Client:** `src/components/projetos/{projetos-view,disciplina-card,equipe-manager,projeto-form,*-view}.tsx`,
`src/components/planejamento/{eap-workspace,gantt,eap-dialog,cronograma-geral-view}.tsx`

**Páginas:** `src/app/(dashboard)/projetos/{page,[id]/page,[id]/{pranchas,servicos,arquivos,extras}/page}.tsx`,
`src/app/(dashboard)/planejamento/{page,[projetoId]/page,cronograma/page}.tsx`

**Schema (`prisma/schema.prisma`):** `Projeto`, `Disciplina`, `DisciplinaResponsavel`, `ProjetoMembro`,
`RevisaoDisciplina`, `Upload`, `PagamentoProjetista`, `FolhaProjetista`, `ServicoTerceirizado`,
`ProjetoComposicaoPreco`, `LmConfig`, `LinhaBase`, `EapTarefa`, `EapDependencia`, `Recurso`, `Alocacao`,
`RateioHora`, `SessaoTrabalho`, `EscalaTrabalho`, `Prancha`, `Lancamento`

**Referência (sistema antigo):** `C:\SENA_ADM\SENAHUB\SENAHub\components\projetos\visao-geral\*`
(KPIs, mini-gantt, donut, EAP resumo, explorer) e `components\planejamento\*` (kanban, matriz, pendências).
