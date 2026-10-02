---
titulo: Financeiro — Fluxo de caixa dia a dia
descricao: O que entrou e saiu nos últimos dias e o que está previsto para os próximos, com o saldo acumulado.
resumo: Antes de hoje, o fluxo mostra o realizado pela data de pagamento ou recebimento; de hoje em diante, o previsto do cenário escolhido. Agrupa por dia, semana ou mês, e o saldo acumulado encontra o caixa de hoje nos dois lados.
tags: [financeiro, fluxo de caixa, saldo acumulado, realizado, previsto, diário, semanal, mensal]
palavras-chave: [fluxo de caixa, dia a dia, semana, mês, entradas, saídas, saldo do dia, saldo acumulado, realizado, previsto, provável, conservador, maior movimento]
sinonimos: [fluxo diário, extrato projetado, movimentação]
---

# Financeiro — Fluxo de caixa dia a dia

## Objetivo

Ver numa linha só o **passado recente** (o que já entrou e saiu) e o **futuro próximo** (o que está
previsto), com o saldo acumulado de cada dia.

## Como acessar

**Financeiro → Fluxo de caixa** (`/financeiro/fluxo-caixa`), ou **Ver dia a dia** no gráfico da Visão
geral. Exige visão financeira.

## A tela

- **Filtros** (ficam no endereço, então dá para guardar o link):
  - **Agrupar por:** Dia, Semana (segunda a domingo) ou Mês.
  - **Dias antes de hoje:** 15, 30 ou 60.
  - **Previsto pelo cenário:** Provável ou Conservador (o mesmo significado da
    [Visão geral](visao-geral.md#saldo-projetado-gráfico)).
- **Totais:** entradas e saídas **realizadas** no período passado, e entradas e saídas **previstas** de
  hoje até o fim do horizonte.
- **Saldo acumulado:** linha cheia até hoje (realizado) e tracejada depois (previsto), com a reserva
  mínima. Embaixo, as barras do que **entrou** (acima) e **saiu** (abaixo); as previstas ficam mais
  claras. Com o teclado: Tab no gráfico e setas.
- **Tabela:** cada dia (ou semana, ou mês) com movimento: tipo (Realizado/Previsto), entradas, saídas,
  saldo do período, saldo acumulado e o maior movimento. Linha em vermelho claro = saldo abaixo da
  reserva mínima.

## Regras de negócio

- **Realizado** é contado pela **data em que foi pago ou recebido**, não pelo vencimento.
- O saldo do passado é refeito **de trás para a frente** a partir do caixa de hoje, então ele sempre
  encontra o mesmo **caixa atual** da Visão geral.
- **Previsto** vem do mesmo cálculo do [Planejador](planejador.md); a previsão do cronograma fica fora
  dos dois cenários desta tela.
- Transferência entre contas da empresa não aparece como entrada nem saída.
- Semana ou mês que chega a hoje aparece como **Previsto** — dizer "realizado" prometeria o que ainda não
  aconteceu.

## Funcionalidades relacionadas

- [Visão geral](visao-geral.md) · [Planejador de caixa](planejador.md) · [Lançamentos](lancamentos.md) · [Relatórios (DFC)](relatorios.md)

## FAQ

**Dá para ver o fluxo de uma conta só?** Ainda não: a projeção é da empresa toda. O saldo por conta
está na Visão geral e no livro caixa.

**Por que um dia sem movimento não aparece na tabela?** Para a lista ficar legível. O gráfico mostra o
saldo parado nesses dias.
