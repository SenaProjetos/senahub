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
- *Não implementado* (sinalizado): “senha para exclusão” (precisa de re-checagem de credencial — sensível). **Data de competência** ✅ feita (seção 11).

### Item 8 — Multi-nível de alçada ⏸️ DIFERIDO
- Exige **migração de schema** (vários limites + papéis aprovadores) e decisão de arquitetura. Conforme as regras do projeto, não fiz migração sem aprovação. Hoje há alçada de **um** limite (`financeiro.limiteAprovacao`) + notificações a aprovadores na criação. Notificações de vencimento já existem (job D+1 “recebimento vencido” + resumo semanal).

---

## 4. Pendências para próximas frentes

Da auditoria/estratégico (exigem migração e/ou decisão de arquitetura — **parar e aprovar antes**):
- ~~Planejamento de Pagamentos~~ — ✅ **implementado** (ver seção 6 abaixo).
- ~~Fechamento Mensal~~ — ✅ **implementado** (seção 9).
- ~~DRE por projeto avançada~~ — ✅ **implementado** (ver seção 7 abaixo). *Resta: rentabilidade por disciplina/coordenador e evolução da margem no tempo.*
- ~~Soft delete real de lançamentos~~ — ✅ **implementado** (seção 8).
- ~~Auditoria valor-anterior × novo~~ — ✅ **implementado** (seção 8).
- ~~Multi-nível de alçada~~ — ✅ **implementado** (seção 10).
- ~~Data de competência~~ — ✅ **implementada** (seção 11). · **Senha para exclusão** (resto do item 6).
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
- **Agrupamentos** ✅ implementados: "Agrupar por" favorecido/projeto/categoria/centro, com grupos recolhíveis e subtotais. O agrupamento é visual (mantém a ordem global); o drag-and-drop de reordenação fica disponível só sem agrupamento (a linha foi refatorada em base apresentacional + wrapper sortable).

**Arquivos:** `src/modules/financeiro/planejamento/{recalculo.ts,recalculo.test.ts,queries.ts,actions.ts}`, `src/components/financeiro/planejamento/{status.ts,planejamento-lista-view.tsx,planejamento-mesa-view.tsx}`, `src/app/(dashboard)/financeiro/planejamento/{page.tsx,[id]/page.tsx}`, atalho em `financeiro/page.tsx`, migração em `prisma/migrations/20260618145138_planejamento_pagamentos/`.

---

## 7. DRE por projeto avançada (rentabilidade) ✅

Diferencial estratégico da spec. Sem migração — cálculo sobre os lançamentos confirmados.

**Decisão aprovada:** custos indiretos = despesas confirmadas **sem projeto vinculado**, rateadas entre os projetos **na proporção da receita** de cada um.

- Helper puro `calcularRentabilidade` + `rentabilidadePorCliente` (`relatorios/dre-projeto.ts`) + 6 testes.
  - lucroBruto = receita − diretos; lucroLiquido = bruto − indireto rateado; margens bruta/líquida (%); ROI = lucroLiquido / (diretos + indireto).
- Query `rentabilidadePorProjeto(de, ate, margemMinima)`: separa receita/diretos por projeto e o overhead, rateia, agrega totais e ranking de clientes.
- Página `/financeiro/rentabilidade` (atalho no dashboard): filtros de período + margem mínima; KPIs (receita, diretos, indiretos, lucro líquido + margem); **alertas** de projetos abaixo da margem mínima; **ranking de projetos** (por lucro líquido, com diretos/indireto/margem/ROI) e **ranking de clientes**.

**Decisões/limites (sinalizo):**
- Receita do projeto = receita **confirmada** vinculada a ele (não usa "valor contratado"/aditivos, que não existem como campo).
- Margem mínima é um parâmetro da tela (default 0%), não persistido.
- **Evolução da margem no tempo** ✅ implementada: série mensal (receita/resultado/margem%) na página de Rentabilidade (`evolucaoMargemMensal`).
- **Não** incluídos: rentabilidade por **disciplina** (Lancamento não tem FK de disciplina) e por **coordenador** — ficam como evolução (precisam de decisão de atribuição).

**Arquivos:** `src/modules/financeiro/relatorios/{dre-projeto.ts,dre-projeto.test.ts}`, `rentabilidadePorProjeto` em `relatorios/queries.ts`, `src/components/financeiro/relatorios/rentabilidade-view.tsx`, `src/app/(dashboard)/financeiro/rentabilidade/page.tsx`, atalho em `financeiro/page.tsx`.

---

## 8. Conformidade — soft delete + auditoria valor-anterior × novo ✅

Fecha duas "Regras Obrigatórias" da spec. Ambas autorizadas (migração aditiva + alterar lib global).

### Soft delete real (Lancamento)
- Campo `excluidoEm DateTime?` (migração `20260618173418_lancamento_soft_delete`, aditiva).
- `excluirLancamento` agora faz **soft delete** (seta `excluidoEm`), não apaga.
- **Filtro global** via Prisma client extension em `src/lib/prisma.ts`: injeta `excluidoEm: null` em todas as LEITURAS de `lancamento` (`findMany/findFirst/count/aggregate/groupBy`), em todo o sistema. Mutations e `findUnique` (por id) não são afetados; quem quiser ver excluídos passa `excluidoEm` explicitamente.
- O tipo público do client segue `PrismaClient` (a extensão só intercepta queries), então nenhuma assinatura no resto do app muda.

### Auditoria valor-anterior × novo (lib global)
- `defineAction` (`src/lib/with-action.ts`) ganhou `capturarAntes?(input)`: captura o estado anterior **antes** da execução; o `AuditLog.detalhe` passa a gravar `{ antes, novo }`. Mecanismo global — qualquer módulo pode adotar.
- Ligado nas mutations financeiras de lançamento (editar, confirmar, cancelar, excluir) via snapshot JSON-safe do lançamento.

**Limites (sinalizo):** includes aninhados (ex.: linha de planejamento → lançamento) não passam pelo filtro do modelo, então um lançamento excluído ainda referenciado por um plano aparece naquele contexto — aceitável; revisitar se necessário. O `capturarAntes` foi ligado só no financeiro; outros módulos podem aderir depois.

**Arquivos:** `src/lib/prisma.ts`, `src/lib/with-action.ts`, `src/modules/financeiro/lancamentos/actions.ts`, `prisma/schema.prisma`, migração `prisma/migrations/20260618173418_lancamento_soft_delete/`.

---

## 9. Fechamento Mensal ✅

Migração aditiva (`20260618174538_fechamento_mensal`): tabela `fechamento_mensal` + enum `StatusFechamento` + back-relation em User.

**Decisões aprovadas:** escopo = **os dois** (fechamento do mês inteiro incluindo a consolidação da folha de projetistas); descontos/retenções = **regras automáticas (%)** via alíquotas configuráveis.

- **Alíquotas** (ISS, INSS, IR, Desconto) em `ConfigSistema` (chave `financeiro.aliquotas`), editáveis em **Configurações → Alíquotas do fechamento**.
- Helper puro `calcularFechamento` (`fechamento/calculo.ts`) + 4 testes: aplica as alíquotas sobre a folha bruta → retenções/descontos/folha líquida; resultado bruto = receita − despesa.
- `gerarFechamento(ano, mes)` consolida e **snapshota** receita/despesa confirmadas do mês + folha bruta (PagamentoProjetista liberados no mês) + retenções/descontos calculados, guardando as alíquotas usadas. Idempotente (regera enquanto aberto; bloqueia se já fechado).
- Status **aberto → fechado** (+ reabrir); excluir só com mês aberto.
- Página `/financeiro/fechamento` (atalho no dashboard): seletor mês/ano + gerar; cada fechamento mostra resultado do mês e folha (bruto, ISS/INSS/IR, descontos, líquido), com **fechar/reabrir/excluir** e **imprimir** (comprovante).

**Decisões/limites (sinalizo):** folha bruta = soma de `PagamentoProjetista` liberados no mês (todos os status). Retenções/descontos incidem sobre a folha bruta. "Consolidar disciplinas" detalhado e geração de comprovantes individuais por projetista ficam como evolução (hoje o comprovante é o relatório do fechamento).

**Arquivos:** `src/modules/financeiro/fechamento/{calculo.ts,calculo.test.ts,queries.ts,actions.ts}`, `src/components/financeiro/fechamento/fechamento-view.tsx`, `src/app/(dashboard)/financeiro/fechamento/page.tsx`, alíquotas em `config/{queries,actions}.ts` + `configuracoes-view.tsx`, atalho em `financeiro/page.tsx`, migração `prisma/migrations/20260618174538_fechamento_mensal/`.

---

## 10. Multi-nível de alçada ✅ (sem migração)

**Decisão aprovada:** roteamento por faixa de valor (1 aprovação) — cada faixa define quem aprova.

- Helper puro `niveis.ts` (`faixaPara`/`precisaAprovacao`/`papeisAprovadores`) + 6 testes.
- Config em `ConfigSistema` (chave `financeiro.niveisAprovacao`): lista de faixas `{ ate, papeis }`. **Fallback**: se não configurado, deriva do limite único legado (preserva o comportamento atual).
- `criarLancamento`: despesa numa faixa que exige aprovação trava em `aguardando_aprovacao`; notifica os usuários dos **papéis daquela faixa**.
- `aprovarLancamento`: o papel do aprovador deve cobrir o valor da faixa (admin tem bypass).
- UI em **Configurações → Níveis de alçada**: faixas dinâmicas (até R$ + papéis ISS-style por checkbox: Administrador/Supervisor/Administrativo); faixa sem papéis = automático.

**Limites:** papéis aprovadores configuráveis restritos a admin/supervisor/administrativo (`PAPEIS_APROVADORES`). Roteamento por faixa (não sequencial/multi-assinatura).

**Arquivos:** `src/modules/financeiro/aprovacao/{niveis.ts,niveis.test.ts,queries.ts,actions.ts}`, `src/modules/financeiro/lancamentos/actions.ts`, `src/components/financeiro/config/configuracoes-view.tsx`, `src/app/(dashboard)/financeiro/configuracoes/page.tsx`.

---

## 11. Data de competência (regime de competência) ✅

Migração aditiva (`20260618183205_lancamento_data_competencia`): campo `dataCompetencia` (Date, opcional) em `Lancamento`.

**Decisão aprovada:** o regime de competência considera **só os confirmados, datados pela competência** (`dataCompetencia ?? data`) — não inclui previstos. Default do DRE = **caixa** (preserva o comportamento atual).

- Formulário de lançamento aceita "Data de competência (opcional)"; em recorrência, desloca por mês junto com a data. `criar`/`editar` persistem o campo.
- `relatorioDREComparativo(de, ate, base)` ganha `base: "caixa" | "competencia"`. Caixa = confirmados por `dataConfirmacao` (atual). Competência = confirmados filtrados por `dataCompetencia` (ou `data` quando ausente).
- Página de Relatórios: seletor **Regime (Caixa/Competência)**, default caixa; rótulo no DRE indica o regime ativo.

**Limites:** o toggle vale para o DRE da tela de Relatórios. A exportação Excel e os demais relatórios (DFC, dashboard) seguem base caixa por ora.

**Arquivos:** `prisma/schema.prisma` + migração; `src/modules/financeiro/lancamentos/{schemas.ts,actions.ts}`, `src/components/financeiro/lancamentos/lancamento-form.tsx`, `src/modules/financeiro/relatorios/queries.ts`, `src/components/financeiro/relatorios/relatorios-view.tsx`, `src/app/(dashboard)/financeiro/relatorios/page.tsx`.
