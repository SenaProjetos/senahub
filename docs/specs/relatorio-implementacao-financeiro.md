# Relatório de implementação — Módulo Financeiro SENAHub

> Sessão de 2026-06-17/18. Trabalho feito após a auditoria (`auditoria-modulo-financeiro.md`) e a
> análise comparativa (`analise-comparacao-meudinheiro.md`).
> Stack real: Next.js (App Router, Server Actions) + Prisma 7 + PostgreSQL. Gráficos em SVG/CSS (sem chart lib).

## Resumo

Tudo verificado ao fim: **typecheck limpo · 128 testes (vitest) · eslint limpo**.
Sem migração de banco. Sem dependências novas. Mudanças restritas ao domínio financeiro.
**Não** rodei o servidor de desenvolvimento (validação por typecheck/testes/lint; render visual não conferido em tela).

---

## 1. Pacotes 1–3 (dashboard + DRE + fluxo)

### Pacote 1 — Dashboard financeiro com KPIs
Antes: só aging + atalhos. Agora a tela inicial (`financeiro/page.tsx`) traz:
- 4 KPI cards: receita do mês, despesa do mês, resultado do mês, saldo em caixa.
- Banner de contas vencidas (a pagar/receber) com link para Contas.
- Gráfico de barras do resultado mensal do ano.
- Rosca de despesas por categoria (mês corrente).
- Saldos por conta + projeção de caixa.

### Pacote 2 — DRE com AH/AV/EBITDA
- Função pura `analisarDRE` (`relatorios/dre.ts`) + 7 testes.
- Análise vertical (AV% sobre receita) e horizontal (AH% vs. período anterior por categoria).
- **EBITDA (gerencial)** = resultado das categorias operacionais (`grupoDfc="operacional"`, `null` conta como operacional). Aproximação rotulada na UI — o plano de contas não separa resultado financeiro/D&A/tributos.
- `relatorioDREComparativo` busca período atual + anterior de mesma duração.

### Pacote 3 — Gráfico no Fluxo de Caixa
- `FluxoProjecaoChart` (SVG linha/área) do saldo projetado 8 semanas, linha do zero e destaque de gap negativo. Reusa `projecaoCaixa()`.

---

## 2. Features pedidas (lançamentos)

### Editar lançamentos + anexos
- `LancamentoForm` ganhou **modo edição** (`editarLancamento`); em edição esconde recorrência/“já realizado” e trava o tipo.
- **Editar** no menu de cada linha do livro-caixa e da tela de Contas a pagar/receber.
- Anexos (boletos/comprovantes/recibos) já existiam em `LancamentoDetalheDialog` (listar/enviar/baixar/remover); agora **expostos também na tela de Contas** (antes só no livro-caixa).
- `ContasPagarReceberView` recebe `podeGerir` (da página) para liberar editar/anexos.

### Pagamento parcial → saldo restante automático
- `ConfirmarDialog`: campo **“Valor pago” já vem com o total**; ao reduzir, mostra aviso do que ficará em aberto.
- `confirmarLancamento` (em transação): confirma o original pelo valor pago **e cria um novo lançamento `previsto`** com `valor = diferença`, clonando os dados (categoria, projeto, fornecedor/cliente, centro, vencimento, tags, documento). Observação “Saldo restante de pagamento parcial”; ligado ao original via `recorrenciaGrupo`.
- Helper puro `saldoRestante` + 6 testes. Vale para despesa e receita. Só no pagamento individual (a baixa em lote permanece valor cheio).

---

## 3. Itens 4–8 da análise comparativa

### Item 4 — Relatórios extras ✅
- **Totais por categoria** (duas roscas: despesas e receitas) na tela de Relatórios.
- **Resultado por projeto** (tabela: receita/despesa/resultado confirmados no período).
- **Comparação entre períodos**: já contemplada pelo DRE comparativo (AH).
- *Evolução por categoria ao longo dos meses*: não feita (maior, menor prioridade) — fica para próxima frente.

### Item 5 — Tags na UI ✅
- Edição de tags já existia no diálogo de detalhes; agora as **tags aparecem como badges** nas linhas do livro-caixa.

### Item 7 — Badge de parcela por recorrência ✅
- “i/n” agora derivado do **grupo de recorrência** (ordenado por data), além do padrão antigo por texto da descrição.

### Item 6 — Configurações financeiras ✅ (sem migração)
- Nova página `financeiro/configuracoes` (+ atalho no dashboard, só para `gerir`).
- Persistência via `ConfigSistema` (chave `financeiro.config`) — sem schema novo.
- **Campos obrigatórios configuráveis** (contato, centro, projeto, forma, observação), com enforcement **no servidor** (`criarLancamento`) via helper puro `obrigatorioFaltando` (+ 5 testes). Default = nada obrigatório (preserva o comportamento atual).
- *Não implementado* (sinalizado): “senha para exclusão” (precisa de re-checagem de credencial — sensível); data de competência separada da data de caixa.

### Item 8 — Multi-nível de alçada ⏸️ DIFERIDO
- Exige **migração de schema** (vários limites + papéis aprovadores) e decisão de arquitetura. Conforme as regras do projeto, não fiz migração sem aprovação. Hoje há alçada de **um** limite (`financeiro.limiteAprovacao`) + notificações a aprovadores na criação. Notificações de vencimento já existem (job D+1 “recebimento vencido” + resumo semanal).

---

## 4. Pendências para próximas frentes

Da auditoria/estratégico (exigem migração e/ou decisão de arquitetura — **parar e aprovar antes**):
- ~~Planejamento de Pagamentos~~ — ✅ **implementado** (ver seção 6 abaixo).
- **Fechamento Mensal** financeiro.
- **DRE por projeto avançada** (rateio de indiretos, ROI, rankings, alertas de margem).
- **Soft delete** real de lançamentos (hoje `excluir` é hard delete).
- **Auditoria valor-anterior × novo** (hoje `AuditLog` grava só o input).
- **Multi-nível de alçada** (item 8).
- **Senha para exclusão** e **data de competência** (resto do item 6).
- **Evolução por categoria** (resto do item 4).

---

## 5. Arquivos

### Criados
- `src/components/financeiro/fluxo-projecao-chart.tsx`
- `src/components/financeiro/categoria-donut-chart.tsx`
- `src/modules/financeiro/relatorios/dre.ts` (+ `dre.test.ts`)
- `src/modules/financeiro/lancamentos/parcial.ts` (+ `parcial.test.ts`)
- `src/modules/financeiro/config/validacao.ts` (+ `validacao.test.ts`)
- `src/modules/financeiro/config/queries.ts`, `src/modules/financeiro/config/actions.ts`
- `src/components/financeiro/config/configuracoes-view.tsx`
- `src/app/(dashboard)/financeiro/configuracoes/page.tsx`
- `docs/specs/analise-comparacao-meudinheiro.md`, `docs/specs/relatorio-implementacao-financeiro.md`

### Editados
- `src/app/(dashboard)/financeiro/page.tsx` (dashboard KPIs + atalho Config)
- `src/app/(dashboard)/financeiro/fluxo-caixa/page.tsx` (chart)
- `src/app/(dashboard)/financeiro/relatorios/page.tsx` + `relatorios-view.tsx` (AH/AV/EBITDA, roscas, por projeto)
- `src/app/(dashboard)/financeiro/contas/page.tsx` (podeGerir)
- `src/modules/financeiro/relatorios/queries.ts` (DRE comparativo, totais por categoria, resultado por projeto)
- `src/modules/financeiro/lancamentos/actions.ts` (saldo restante + obrigatórios)
- `src/components/financeiro/lancamentos/confirmar-dialog.tsx` (prefill + parcial)
- `src/components/financeiro/lancamentos/lancamento-form.tsx` (modo edição)
- `src/components/financeiro/lancamentos/lancamentos-view.tsx` (editar, tags, parcela por recorrência)
- `src/components/financeiro/lancamentos/contas-pagar-receber-view.tsx` (editar + anexos + podeGerir)

---

## 6. Planejamento de Pagamentos (mesa de planejamento) ✅

Módulo novo — o diferencial estratégico da spec. Migração **aditiva** aplicada (`20260618145138_planejamento_pagamentos`): 2 tabelas novas (`planejamento_pagamento`, `planejamento_linha`) + enum `StatusPlanejamento`; nenhuma coluna de tabela existente alterada.

**Modelagem (decisão aprovada):** tabelas dedicadas + recálculo no cliente. Um cenário (`PlanejamentoPagamento`) tem N linhas (`PlanejamentoLinha`) que referenciam lançamentos previstos, com `ordem` e `valorPlanejado`. O saldo acumulado é calculado no navegador (não persistido).

**Fluxo:**
- Criar cenário com saldo disponível + filtros (período de vencimento, conta, centro, projeto) → carrega automaticamente as contas a pagar em aberto como linhas.
- Mesa: grid com **drag-and-drop** (`@dnd-kit`, já no projeto — sem dependência nova) para priorizar; a ordem afeta o consumo do saldo.
- **Saldo acumulado e indicadores recalculados em tempo real** (helper puro `calcularPlano` + 4 testes): saldo inicial, total planejado, saldo remanescente, contempladas/não contempladas, % de cobertura.
- **Pagamento parcial:** edita `valorPlanejado` por linha; ao executar, o saldo restante da obrigação vira um novo lançamento previsto (reusa `saldoRestante`).
- Seleção por linha (entra/não entra no consumo), adicionar/remover contas.
- **Status:** rascunho → análise → aprovado → executado (+ cancelado). Execução só de plano aprovado.
- **Execução:** confirma (paga) cada linha selecionada pelo valor planejado, gerando os saldos restantes em aberto; marca o plano como executado.

**Decisões tomadas (sinalizo):**
- Planejamento cobre **despesas previstas** (contas a pagar) — é uma mesa de pagamento.
- "Executar" = confirmar os lançamentos pelo valor planejado (integra com o caixa/DRE reais), com saldo restante automático nos parciais.
- **Agrupamentos** (por projeto/cliente/fornecedor/centro) da spec **não** entraram nesta primeira versão — conflitam com o drag-and-drop linear; ficam como evolução. O núcleo (simulação de saldo + prioridade + execução) está completo.

**Arquivos:** `src/modules/financeiro/planejamento/{recalculo.ts,recalculo.test.ts,queries.ts,actions.ts}`, `src/components/financeiro/planejamento/{status.ts,planejamento-lista-view.tsx,planejamento-mesa-view.tsx}`, `src/app/(dashboard)/financeiro/planejamento/{page.tsx,[id]/page.tsx}`, atalho em `financeiro/page.tsx`, migração em `prisma/migrations/20260618145138_planejamento_pagamentos/`.
