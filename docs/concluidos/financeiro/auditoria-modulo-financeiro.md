# Auditoria do Módulo Financeiro — SENAHub

> **Status:** relatório para revisão humana. **Nenhuma implementação foi feita.**
> Gerado em 2026-06-17 a partir do estado atual do repositório (branch `master`).

## Como ler este relatório

Cada item de cada especificação recebe um status:

- ✅ **Implementado** — existe e atende ao que a spec pede.
- ⚠️ **Parcial** — existe parte; ao lado descrevo o que falta.
- ❌ **Inexistente** — não há código correspondente.

---

## Nota importante sobre a stack (divergência spec × projeto)

As duas especificações descrevem a stack como **PostgreSQL + Django ORM + Django REST Framework + Next.js**. O projeto **não usa Django**. A implementação real é:

- **ORM/DB:** Prisma 7 sobre PostgreSQL (`prisma/schema.prisma`).
- **Backend:** Next.js App Router — Server Actions (`defineAction` em `src/lib/with-action.ts`) + algumas rotas em `src/app/api/financeiro/**`.
- **Lógica de domínio:** `src/modules/financeiro/**` (queries/actions/schemas por subdomínio).
- **UI:** `src/app/(dashboard)/financeiro/**` + `src/components/financeiro/**`.

Não existe `CLAUDE.md` na raiz (só `node_modules/nodemailer/CLAUDE.md`). A auditoria foi feita contra **a implementação real**, que é a fonte de verdade. As menções a Django/DRF nas specs são tratadas como linguagem de especificação, não como requisito de stack.

**Decisão estrutural já tomada no código (relevante para toda a auditoria):** não existem tabelas separadas `ContaReceber` e `ContaPagar`. Há um **ledger unificado** `Lancamento` com `tipo` (`receita`/`despesa`) e `status` (`previsto` = conta a pagar/receber em aberto; `confirmado` = realizado; `aguardando_aprovacao`; `cancelado`). Onde a spec pede "Conta a Receber"/"Conta a Pagar", a equivalência é `Lancamento` filtrado por `tipo`+`status`.

---

# Parte 1 — Especificação Completa do Módulo Financeiro

## 1. Perfis de Acesso

| Perfil (spec) | Status | Observação |
|---|---|---|
| Sócio (acesso total) | ✅ | Matriz de permissões por `Role` (`Permissao` no DB, editável). `financeiro` tem ações `ver`/`gerir`/`extrato` (`src/lib/permissions-catalog.ts`). |
| Financeiro (acesso completo) | ✅ | `financeiro:gerir`. |
| Coordenador (visão dos projetos sob responsabilidade) | ⚠️ | Existe `financeiro:ver`, mas **global** — não há recorte "apenas projetos sob minha coordenação". Falta escopo por projeto. |
| Projetista (só seus pagamentos/recebimentos) | ✅ | `financeiro:extrato` → `meuExtrato()` em `src/modules/financeiro/queries.ts`; página `financeiro/page.tsx` cai no "Meu extrato". |

## 2. Dashboard Financeiro

| Item | Status | Observação |
|---|---|---|
| Página financeira inicial | ⚠️ | `financeiro/page.tsx` mostra **aging** (a receber/pagar) + atalhos + contador de aprovações. **Não** é o dashboard de KPIs da spec. |
| Indicadores (receita do mês, prevista, recebida, despesas, lucro bruto/líquido, projetos em execução, inadimplentes, pagamentos pendentes, contas vencidas) | ⚠️ | Peças existem espalhadas: `indicadores()` (projetos ativos, recebido, a receber) e `agingReport()` (vencidos). **Faltam** a maioria como painel único: lucro bruto/líquido, projetos inadimplentes, pagamentos pendentes consolidados. |
| Gráficos (receita/despesa por mês, margem por projeto/cliente, rentabilidade por disciplina, evolução anual) | ⚠️ | `serieMensalResultado()` + `resultado-mensal-chart.tsx` cobrem receita/despesa/resultado por mês e evolução anual. **Faltam** margem por projeto/cliente e rentabilidade por disciplina como gráficos. |

## 3. Contas a Receber

| Item | Status | Observação |
|---|---|---|
| Campos (cliente, projeto, contrato, valor, emissão, vencimento, status, obs.) | ⚠️ | `Lancamento` tem cliente, projeto, valor, `data`(emissão/competência), `vencimento`, `status`, `observacao`. **"Contrato"** não é campo direto — há `DocumentoFinanceiro` (tipo `contrato`) vinculável via `documentoFinanceiroId`. |
| Status (Previsto/Faturado/Recebido/Atrasado/Cancelado) | ⚠️ | `StatusLancamento` = previsto/aguardando_aprovacao/confirmado/cancelado. "Atrasado" é **derivado** (aging por vencimento), não estado. **Não existe** estado "Faturado" distinto de "Previsto". |
| Cadastrar/Editar/Excluir | ⚠️ | `criar/editar/excluir/cancelarLancamento`. **Excluir é hard delete** (`prisma.delete`), não soft delete — viola "Regras Obrigatórias" (ver §16). |
| Registrar recebimento | ✅ | `confirmarLancamento` / `baixarEmLote` (com conta, forma, data, `valorEfetivo`). |
| Anexar nota fiscal | ✅ | `DocumentoFinanceiro` (tipo `nf_servico`/`nf_entrada`) + `src/app/api/financeiro/documentos`. |
| Anexar comprovantes | ✅ | `LancamentoAnexo` + `adicionar/removerAnexoLancamento`. |
| Parcelamento | ✅ | `ocorrencias` no `criarLancamento` gera N parcelas mensais com `recorrenciaGrupo`. |
| Histórico completo | ✅ | `LancamentoStatusHistorico` + `AuditLog`. |

## 4. Contas a Pagar

| Item | Status | Observação |
|---|---|---|
| Campos (fornecedor, projetista, tipo despesa, projeto, disciplina, valor, vencimento, status) | ⚠️ | `Lancamento` cobre fornecedor, projeto, valor, vencimento, status, `categoria` (≈ tipo de despesa). **Projetista** é via `pagamentoProjetistaId` (folha). **Disciplina** não é FK direta do lançamento. |
| Categorias (projetistas, softwares, infra, marketing, jurídico, contabilidade, tributos, administrativo, outros) | ✅ | `CategoriaFinanceira` é plano de contas hierárquico livre — cobre e supera a lista fixa. |
| Cadastro/Edição/Parcelamento/Comprovantes/Registro de pagamento/Histórico | ✅ | Mesmas funções de §3 (ledger unificado). |

## 5. Controle Financeiro por Projeto

| Item | Status | Observação |
|---|---|---|
| Valor contratado/recebido/pendente, custos, lucro, margem % | ⚠️ | `margemProjeto()` (`src/modules/projetos/queries.ts`): receita confirmada/prevista, despesa direta, **custo de horas rateado**, margem, margem %. **Faltam** separação custos internos×externos, pagamentos de projetistas como linha própria, "valor contratado" formal. |
| Visualizações (gráfico receitas, gráfico custos, linha do tempo) | ⚠️ | Há resumo financeiro em `projetos/[id]/page.tsx`. **Faltam** os gráficos dedicados e a linha do tempo financeira. |

## 6. Controle por Disciplina

| Item | Status | Observação |
|---|---|---|
| Responsável / valor previsto / valor pago / status / margem individual | ⚠️ | `Disciplina` tem responsável e valor; `PagamentoProjetista` é por disciplina (valor/status). **Falta** consolidação financeira por disciplina (margem individual). |

## 7. Portal Financeiro do Projetista

| Item | Status | Observação |
|---|---|---|
| Minha Remuneração (projetos/disciplinas, valor acordado, pago, saldo, data prevista) | ✅ | `meuExtrato()` + "Meu extrato" em `financeiro/page.tsx` (total, pago, em aberto, por disciplina/projeto). |
| Extrato Financeiro (histórico, futuros, comprovantes) | ⚠️ | Histórico e saldo sim. **Pagamentos futuros previstos** e **download de comprovantes pelo projetista** não estão claros — a verificar/expor. |

## 8. Fechamento Mensal

| Item | Status | Observação |
|---|---|---|
| Processo (selecionar mês → consolidar projetos/disciplinas → calcular → descontos → retenções → relatório → comprovantes) | ❌ | **Não existe** "Fechamento Mensal" financeiro. O análogo parcial é `FolhaProjetista` (lote mensal `ano/mes`, status aberta/fechada/paga) — só projetistas, sem descontos/retenções/consolidação de projetos. |
| Resultado (bruto, descontos, líquido, status) | ❌ | Não existe (exceto `total` da folha de projetistas). |

## 9. Fluxo de Caixa

| Item | Status | Observação |
|---|---|---|
| Entradas/saídas previstas e realizadas, saldo acumulado, saldo projetado | ✅ | `fluxoCaixa()` (saldo por conta, entradas/saídas realizadas) + `projecaoCaixa()` (projeção semanal com saldo acumulado e detecção de gap). Página `financeiro/fluxo-caixa`. |
| Filtros (período, cliente, projeto, disciplina, centro de custo) | ⚠️ | A view de fluxo existe; **abrangência dos filtros** (especialmente cliente/disciplina/centro) a confirmar na UI — provavelmente incompleta. |

## 10. Centro de Custos

| Item | Status | Observação |
|---|---|---|
| Centros (operação, projetos, marketing, admin, tecnologia, jurídico, financeiro) | ✅ | `CentroCusto` (cadastro livre) + FK em `Lancamento`. Cobre e supera a lista fixa. |

## 11. Relatórios

| Item | Status | Observação |
|---|---|---|
| Financeiro Geral (receitas/despesas/lucro/margem) | ✅ | `relatorioDRE()` por competência + página `financeiro/relatorios`. |
| Por Cliente (receita/lucro/ticket médio) | ❌ | Não há relatório agregado por cliente. |
| Por Projeto (receitas/custos/lucro/margem) | ⚠️ | `margemProjeto()` por projeto individual; **falta** relatório/ranking consolidado de todos os projetos. |
| Por Projetista (valor recebido/projetos/produtividade) | ⚠️ | `meuExtrato` e folha cobrem valores; **falta** o relatório consolidado por projetista com produtividade. |
| Exportações (PDF/Excel/CSV) | ⚠️ | Excel: `relatorios/dre/xlsx`. CSV: `contas/export`. **PDF**: a confirmar (não há gerador PDF financeiro dedicado evidente). |

## 12. Banco de Dados (entidades)

| Entidade (spec) | Status | Equivalente no projeto |
|---|---|---|
| Cliente, Projeto, Disciplina | ✅ | `Cliente`, `Projeto`, `Disciplina`. |
| Contrato | ⚠️ | `DocumentoFinanceiro` (tipo `contrato`) — não é entidade "Contrato" própria. |
| Receita / Despesa | ✅ | `Lancamento` (`tipo`). |
| PagamentoProjetista | ✅ | `PagamentoProjetista` (+ `FolhaProjetista`). |
| Fornecedor, CentroCusto | ✅ | `Fornecedor`, `CentroCusto`. |
| ContaReceber / ContaPagar | ✅ (por design) | Unificadas em `Lancamento`. |
| FluxoCaixa | ✅ (derivado) | Calculado em runtime (`caixa/queries.ts`), não tabela. |
| FechamentoMensal | ❌ | Não existe (ver §8). |
| AuditoriaFinanceira | ⚠️ | `AuditLog` global (ver §16). |

## 13. Regras Obrigatórias

| Regra | Status | Observação |
|---|---|---|
| Soft delete em todos os lançamentos | ❌ | `excluirLancamento` faz **hard delete**. `Lancamento` não tem `deletedAt`/`excluidoEm`. Existe `cancelarLancamento` (status `cancelado`), mas não é soft delete real. |
| Log de auditoria obrigatório | ✅ | `defineAction` registra `AuditLog` automaticamente (sucesso/falha/bloqueado). |
| Histórico completo de alterações | ⚠️ | `LancamentoStatusHistorico` (mudanças de status) + `AuditLog` (input). **Não** há histórico campo-a-campo (valor antigo×novo). |
| Vínculo receita↔projeto | ✅ | `Lancamento.projetoId`. |
| Vínculo pagamento↔disciplina | ⚠️ | Via `PagamentoProjetista.disciplinaId`; `Lancamento` genérico não liga a disciplina. |
| Relatórios exportáveis | ⚠️ | CSV/Excel sim; PDF a confirmar. |
| Busca e filtros avançados | ⚠️ | Existem filtros em lançamentos/contas; cobertura total a confirmar na UI. |

## 14. DRE por Projeto (Diferencial Estratégico)

| Item | Status | Observação |
|---|---|---|
| Receitas (contratado, aditivos, total, recebida, pendente) | ⚠️ | `margemProjeto` tem receita confirmada/prevista. **Faltam** "valor contratado" e "aditivos" como conceitos. |
| Custos diretos (projetistas, consultorias, ART/RRT, despesas específicas) | ⚠️ | Despesa direta confirmada/prevista existe; **não** há a quebra por tipo de custo direto. |
| Custos indiretos rateados (softwares, admin, comercial, jurídico, infra) | ❌ | **Não há rateio de custos indiretos** por projeto. |
| Resultado (lucro bruto/líquido, margem bruta/líquida %, ROI) | ⚠️ | Margem e margem % existem; **faltam** lucro líquido (pós-indiretos) e **ROI**. |
| Dashboards (ranking projetos/clientes lucrativos, rentabilidade por disciplina/coordenador, evolução da margem) | ❌ | **Nenhum** ranking/rentabilidade consolidada implementado. |
| Alertas (margem negativa, abaixo do mínimo, custo acima do orçado) | ❌ | Não existem alertas de margem. |

## 15. Notificações

| Evento (spec) | Status | Observação |
|---|---|---|
| Conta vencendo | ⚠️ | Resumo semanal (segunda) lista previstos a vencer em 7 dias (`jobs-handlers.ts`). Sem aviso pontual por conta no dia. |
| Conta vencida | ✅ | Job D+1 "Recebimento vencido" → gestores. |
| Projeto inadimplente | ❌ | Não há notificação dedicada de inadimplência por projeto. |
| Pagamento pendente / despesa aguardando aprovação | ✅ | `criarLancamento` notifica aprovadores quando entra em alçada. |
| Fechamento mensal disponível | ❌ | Depende de §8 (inexistente). |
| Novo recebimento registrado | ❌ | Não há notificação ao confirmar recebimento. |

## 16. Auditoria (registro obrigatório)

| Campo exigido | Status | Observação |
|---|---|---|
| Usuário, Data, Hora, Ação, IP | ✅ | `AuditLog`: `userId`, `createdAt`, `acao`, `ip`. |
| Valor anterior / Valor novo | ❌ | `AuditLog.detalhe` grava **apenas o input da ação**, não o estado anterior. Falta captura before/after. |

---

# Parte 2 — Módulo Estratégico: Planejamento de Pagamentos

**Status global: ❌ INEXISTENTE.** Não há modelo, action, query, rota nem UI de "Planejamento de Pagamentos". (A pasta `src/modules/planejamento` e `src/app/(dashboard)/planejamento` referem-se a **planejamento de obra/EAP/recursos**, não a planejamento de pagamentos.)

| Item da spec | Status | Observação |
|---|---|---|
| Tela com configurações (período, saldo disponível, conta, centro, projeto) | ❌ | — |
| Carregar contas em aberto do período | ⚠️ (reaproveitável) | Os dados existem (`Lancamento` previstos por vencimento), mas não há tela de planejamento que os consuma. |
| Grid (ordem, seleção, favorecido, tipo, projeto, disciplina, vencimento, valor original, valor planejado, saldo da conta, saldo acumulado, status) | ❌ | — |
| Débito sequencial + saldo acumulado recalculado em tempo real | ❌ | `projecaoCaixa()` faz projeção semanal, **não** débito linha-a-linha priorizado. |
| Pagamento parcial (valor planejado < original, saldo da obrigação em aberto) | ⚠️ | `Lancamento.valorEfetivo` suporta parcial na realização, mas não no contexto de planejamento. |
| Reordenação livre (drag-and-drop, priorização por arraste) | ❌ | — |
| Agrupamentos (projeto, cliente, projetista, fornecedor, centro, tipo, coordenador) expansíveis | ❌ | — |
| Simulações / múltiplos cenários (nome, responsável, data, obs.) | ❌ | Não há entidade de cenário. |
| Indicadores da simulação (saldo inicial, total planejado, remanescente, contempladas/não, % cobertura) | ❌ | — |
| Aprovação (rascunho/em análise/aprovado/executado/cancelado) | ❌ | — |
| Execução (gerar contas programadas, lote de pagamento, relatório, histórico) | ⚠️ (parcial) | Existe `baixarEmLote` (baixa múltipla) e `FolhaProjetista` (lote), mas não "executar um plano aprovado". |
| Relatórios do planejamento | ❌ | — |
| Diferenciais (drag-drop tempo real, simulação caixa futura, recálculo instantâneo, integrações) | ❌ | — |

---

# Resumo executivo das lacunas

### ❌ Inexistente (construir)
1. **Planejamento de Pagamentos** (Parte 2 inteira) — maior bloco; exige decisões de modelagem (cenários, saldo acumulado, drag-and-drop). **→ requer aprovação de arquitetura antes de implementar.**
2. **Fechamento Mensal** financeiro (consolidação, descontos, retenções, comprovantes).
3. **DRE por Projeto avançada**: rateio de custos indiretos, ROI, rankings de lucratividade, alertas de margem.
4. **Relatório por Cliente** (receita/lucro/ticket médio).
5. **Auditoria before/after** (valor anterior × novo).
6. **Soft delete real** de lançamentos.

### ⚠️ Parcial (completar)
7. **Dashboard Financeiro** consolidado (KPIs + gráficos de margem/rentabilidade).
8. **Controle por disciplina** (margem individual) e por projeto (gráficos, linha do tempo, custos internos×externos).
9. **Notificações** faltantes (conta vencendo pontual, inadimplência por projeto, novo recebimento).
10. **Exportação PDF** dos relatórios.
11. **Escopo do Coordenador** (ver só projetos sob responsabilidade).
12. **Estado "Faturado"** distinto de "Previsto" em contas a receber (se desejado).

### ✅ Já sólido (não recriar)
Ledger unificado `Lancamento` (CRUD, confirmação, baixa em lote, parcelamento, tags, anexos), aprovação por alçada, plano de contas, centros de custo, fornecedores, contas bancárias, DRE/DFC/Balanço/Orçamento, fluxo de caixa + projeção, conciliação bancária OFX, importação "Meu Dinheiro", documentos financeiros, folha de projetistas, portal/extrato do projetista, auditoria automática de ações.

---

# Pontos que exigem decisão humana antes de implementar

1. **Modelagem do Planejamento de Pagamentos** — como representar "cenário", "saldo acumulado disponível" e ordenação? (novas tabelas `PlanoPagamento` + `PlanoPagamentoLinha` + `Cenario`? recálculo no servidor ou no cliente?). **Decisão de arquitetura — parada obrigatória.**
2. **Soft delete** — adicionar `deletedAt` a `Lancamento` afeta TODAS as queries existentes (filtros) e é **migração sobre dados existentes**. Confirmar antes.
3. **Fechamento Mensal** — criar entidade nova `FechamentoMensal` ou estender `FolhaProjetista`? Definir regras de descontos/retenções.
4. **Auditoria before/after** — alterar o contrato de `logAudit`/`defineAction` (lib transversal, fora do escopo estrito financeiro). Requer aprovação por sair do domínio financeiro.
5. **Estado "Faturado"** — adicionar valor ao enum `StatusLancamento` muda a semântica do ledger. Confirmar se é desejado.

---

## Arquivos lidos nesta auditoria

- Specs: `docs/specs/SENAHub_Modulo_Financeiro_Especificacao.md`, `docs/specs/SENAHub_Modulo_Financeiro_Atualizacao_Planejamento_Pagamentos.md`
- `prisma/schema.prisma` (modelos financeiros: `Lancamento`, `CategoriaFinanceira`, `OrcamentoItem`, `CentroCusto`, `ContaBancaria`, `FormaPagamento`, `Fornecedor`, `Socio`, `RetiradaSocio`, `DocumentoFinanceiro`, `ExtratoBancario`, `TransacaoBancaria`, `RegraCategorizacao`, `ImportacaoFinanceira`, `PagamentoProjetista`, `FolhaProjetista`, `LancamentoAnexo`, `LancamentoStatusHistorico`, `AuditLog`, `Notificacao`)
- `src/modules/financeiro/**` (queries/actions de lançamentos, relatórios, caixa, aging, aprovação, conciliação, orçamento, documentos, folha, importação)
- `src/lib/with-action.ts`, `src/lib/jobs-handlers.ts`, `src/lib/permissions-catalog.ts`
- `src/modules/projetos/queries.ts` (`margemProjeto`)
- `src/app/(dashboard)/financeiro/page.tsx` + listagem de páginas/rotas/componentes do módulo

---

**Próximo passo:** aguardando revisão/aprovação deste relatório. Após aprovado, implemento incrementalmente os itens ❌ e as lacunas ⚠️, na ordem que você priorizar — começando pelas decisões de arquitetura acima (itens 1–5), que travam o resto.
