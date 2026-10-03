---
titulo: Relatórios gerenciais do financeiro
descricao: DRE, indicadores, DFC, fluxo de caixa, balanço gerencial, rentabilidade por projeto, orçamento anual e relatório por dimensão.
resumo: Conjunto de relatórios gerenciais — DRE, indicadores (margem, prazos, inadimplência), DFC por atividade, fluxo de caixa, balanço (base caixa), rentabilidade por projeto, orçamento planejado × realizado e relatório por dimensão (categoria, centro, contato, projeto ou tag).
tags: [relatórios, dre, dfc, fluxo de caixa, balanço, rentabilidade, orçamento, indicadores, dimensão]
palavras-chave: [relatório, dre, dfc, fluxo de caixa, balanço gerencial, rentabilidade, margem, orçamento, planejado, realizado, indicadores, margem líquida, dias de caixa, inadimplência, prazo médio, ponto de equilíbrio, relatório por dimensão, centro de custo]
sinonimos: [demonstrativos, indicadores financeiros, gerenciais]
---

# Relatórios gerenciais do financeiro

## Objetivo

Apoiar a gestão com demonstrativos e indicadores construídos a partir dos lançamentos.

## Relatórios disponíveis

| Relatório | Rota | O que mostra |
| --- | --- | --- |
| **DRE** | `/financeiro/relatorios` | DRE do período (caixa ou competência) |
| **Indicadores** | `/financeiro/indicadores` | Margem líquida, resultado operacional, dias de caixa, inadimplência (12 meses), prazo médio de recebimento/pagamento, ponto de equilíbrio, receita por projeto ativo, e a evolução receita × despesa dos últimos 6 meses |
| **Rentabilidade** | `/financeiro/rentabilidade` | DRE e **margem por projeto** |
| **DFC** | `/financeiro/dfc` | Fluxo de caixa por **atividade** |
| **Fluxo de caixa** | `/financeiro/fluxo-caixa` | Realizado e previsto dia a dia — ver [Fluxo de caixa](fluxo-de-caixa.md) |
| **Balanço gerencial** | `/financeiro/balanco` | Ativo, passivo e PL (**base caixa**) |
| **Orçamento anual** | `/financeiro/orcamento` | Planejado × realizado por categoria, com a aba **Por centro de custo** (só previsto × realizado — o planejado continua por categoria) |
| **Relatório por dimensão** | `/financeiro/relatorio-dimensao` | Receita, despesa e resultado do período agrupados à sua escolha: categoria, centro de custo, contato (fornecedor/cliente), projeto ou tag |

## Como acessar

- Pelo grupo **Resultados** da barra do Financeiro (logo abaixo do título de qualquer tela do Financeiro), ou por **Abrir DRE** na Visão geral.
- Dentro de qualquer um deles, a faixa de **abas** (DRE · Indicadores · Rentabilidade · DFC · Balanço ·
  Orçamento · Relatório por dimensão) leva aos vizinhos. Quem não tem acesso a um relatório não vê a aba dele.
- Em **Indicadores**, cada linha da tabela de evolução mensal tem menu de contexto: **Ver DRE do mês**,
  **Comparar com** outro mês da lista (mostra a diferença na própria tela, sem navegar) e **Exportar o mês**.
- Em **Relatório por dimensão**, centro e projeto consideram o **rateio** do lançamento (quando houver): cada parte entra na linha do seu centro/projeto.
- Em **Relatório por dimensão**, cada linha tem menu de contexto para ver os lançamentos daquele grupo no
  livro caixa — disponível hoje para **centro de custo** e **projeto** (o livro caixa ainda não filtra por
  categoria, contato ou tag isoladamente); a tag soma por lançamento com mais de uma tag, então a soma das
  linhas pode passar do total do período, e isso aparece anotado na tela.

## Conceitos

- **DRE** (Demonstração do Resultado): receitas − despesas = resultado, por período, com
  base nos lançamentos **confirmados**.
- **DFC** (Demonstração do Fluxo de Caixa): movimentos de caixa por atividade.
- **Base caixa:** considera o que efetivamente entrou/saiu (confirmado), não o
  provisionado.
- **Rentabilidade por projeto:** receita − custos atribuídos ao projeto → margem.
- **Fora do resultado:** distribuição e adiantamento de lucros **saem do caixa** (aparecem no DFC, como
  financiamento) mas **não são despesa** — não entram na DRE, na margem, no orçamento nem no fechamento.
  O pró-labore, ao contrário, **é** despesa.
- **Transferência entre contas** da empresa não entra em nenhum relatório de resultado nem no DFC: ela só
  muda em que conta o dinheiro está.
- **Ponto de equilíbrio** (em Indicadores) é uma aproximação: hoje é igual à despesa do mês, porque o
  plano de contas não separa custo fixo de custo variável.
- **Prazo médio de recebimento/pagamento** (em Indicadores) é a média simples em dias (da emissão ao
  recebimento, do lançamento ao pagamento) — não é ponderada pelo valor de cada lançamento.

## Permissões

- Leitura dos relatórios: `financeiro:ver`.

## Funcionalidades relacionadas

- [Visão geral](visao-geral.md) · [Lançamentos](lancamentos.md) · [Contas e Aging](contas-e-aging.md)

## FAQ

**DRE e DFC usam previsto ou confirmado?** O resultado/DRE usa **confirmado** (realizado);
o aging/projeção usam **previsto**.

**O balanço é contábil?** É **gerencial**, em **base caixa** — não substitui a
contabilidade oficial.
