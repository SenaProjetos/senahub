---
titulo: Financeiro — Visão geral e Meu extrato
descricao: Painel gerencial do financeiro (KPIs, DRE, projeção de caixa, aging) e o extrato pessoal de pagamentos.
resumo: O /financeiro mostra um painel completo para quem tem visão financeira (período, KPIs, gráficos, aging, atalhos) ou o "Meu extrato" para prestadores e clientes.
tags: [financeiro, painel, dashboard, dre, projeção de caixa, aging, extrato, kpi]
palavras-chave: [financeiro, visão geral, painel, resultado, saldo em caixa, projeção, contas vencidas, meu extrato, pagamentos]
sinonimos: [dashboard financeiro, painel financeiro, extrato]
---

# Financeiro — Visão geral e Meu extrato

## Objetivo

Dar o panorama financeiro do escritório (para gestão) ou o **extrato pessoal** de
pagamentos (para prestadores e clientes), conforme a permissão.

## Como acessar

- Menu → **Financeiro** (`/financeiro`).
- O conteúdo muda pelo seu acesso (ver [modelo de acesso](README.md#modelo-de-acesso-importante)).

## A) Painel gerencial (visão completa)

Para quem tem `financeiro:ver` ou é sócio:

- **Seletor de período:** mês (padrão), trimestre ou ano.
- **Alerta de vencidos:** faixa vermelha com o total em contas vencidas (a pagar/receber),
  atalho para Contas.
- **KPIs:** Receita do período, Despesa do período, Resultado e **Saldo em caixa**.
- **Gráficos:** resultado mensal do ano e despesas por subcategoria (rosca).
- **DRE do período:** receitas − despesas = resultado (lançamentos confirmados).
- **Projeção de caixa:** saldo atual + a receber previsto − a pagar previsto, semana a
  semana (próximas 8 semanas), com saldos por conta.
- **Aging:** painel de contas a receber e a pagar por faixa de atraso.
- **Cartões de atalho** para todas as ferramentas (Lançamentos, Contas, Folha de
  projetistas, Fluxo de caixa, Conciliação, Relatórios, Rentabilidade, DFC, Balanço,
  Orçamento, Documentos, Cadastros). Quem tem `financeiro:gerir` ganha ainda
  **Planejamento de pagamentos**, **Fechamento mensal**, **Importar** e **Configurações**.
- **Badges** nos cartões mostram pendências (contas vencidas, transações a conciliar,
  despesas aguardando aprovação).

## B) Meu extrato (prestadores e clientes)

Para quem tem **só** `financeiro:extrato`:

- **Resumo:** Total, Recebido, Em aberto.
- **Lista de pagamentos** por **entregas validadas** (disciplina + projeto), com valor e
  status (pago / pendente).

## Regras de negócio

- O painel usa **lançamentos confirmados** para resultado/DRE e **previstos** para aging
  e projeção.
- "Meu extrato" lista pagamentos gerados por entregas **validadas** de disciplinas.

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| Caio em "sem permissão" | Sem `ver`, `gerir` nem `extrato` | Solicitar acesso ao admin |
| Vejo só "Meu extrato" | Você tem apenas `financeiro:extrato` | Comportamento esperado para prestador/cliente |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Contas e Aging](contas-e-aging.md) · [Aprovações](aprovacoes.md) · [Relatórios](relatorios.md)

## FAQ

**Como a projeção de caixa é calculada?** Saldo atual + a receber previsto − a pagar
previsto, acumulado por semana (8 semanas), pelo vencimento das contas.
