---
titulo: Produção (pagamento de projetistas)
descricao: Pagamento de projetistas PJ e freelancers pelas entregas validadas, em dois modos de leitura e com lotes mensais.
resumo: Veja e pague os pagamentos de produção liberados por entrega, agrupados por projetista ou em tabela, com filtros, rastreabilidade completa e exportação.
tags: [produção, folha de projetistas, pagamento, projetista, freelancer, lote, pj]
palavras-chave: [produção, folha de projetistas, pagamento de projetista, projetista pj, freelancer, lote mensal, pagar selecionados, conta obrigatória]
sinonimos: [folha de projetistas, pagamento de produção, folha pj]
---

# Produção (pagamento de projetistas)

## Objetivo

Pagar projetistas **PJ** e **freelancers** pelas entregas de disciplina já validadas —
cada entrega liberada gera um pagamento pendente, que esta tela mostra, deixa corrigir
quando necessário e efetiva no caixa.

CLT e estagiário não aparecem aqui: eles são remunerados pela folha de ponto, não por
entrega — ver [Folha de pagamento CLT](../rh-ponto/folha-clt.md).

## Como acessar

Menu → **Financeiro** → **Produção** (`/financeiro/folha-projetistas`). Exige a
permissão `financeiro:folha_pj`.

A tela tem duas abas:

- **Pagamentos** — os pagamentos individuais, liberados por entrega.
- **Lotes** — os mesmos pagamentos agrupados em lotes mensais, para pagar de uma vez.

## Aba Pagamentos

### Dois modos de leitura

Um alternador no topo da lista troca entre:

- **Por projetista** (padrão) — uma linha por pessoa, com o total pendente e um botão
  **Pagar tudo**; clique na linha para expandir e ver cada entrega dela.
- **Por pagamento** — tabela plana, uma linha por entrega, com ordenação por coluna e
  seleção múltipla para **Pagar selecionados**.

Os filtros e os 3 cartões de totais (A pagar / Pago / Cancelado) são os mesmos nos dois
modos — só a lista embaixo muda de formato.

### Filtros

Status (esconde cancelados por padrão — mude para "Todos" para vê-los), projetista,
projeto, período de liberação e busca livre por projetista/disciplina/projeto. Os 3
cartões de totais somam **todo o recorte filtrado**, mesmo o que a lista não está
mostrando — por isso não zeram ao filtrar por um status.

### Rastreabilidade

Cada linha mostra e linka (conforme sua permissão em cada destino):

- o **projetista** → ficha da pessoa;
- o **projeto/disciplina** → a disciplina no projeto;
- um pagamento **pago** → a **conta** e a **forma** usadas, com link para o **lançamento**
  no livro caixa;
- um pagamento **pendente** → se já existe um lançamento previsto ou não.

### Ações por linha

- **Pagar** — abre o dialog de efetivação (conta obrigatória, forma e data opcionais);
  gera ou confirma o lançamento de despesa no caixa.
- **Corrigir valor / Editar** — corrige o valor (e a observação) de um pendente. Não
  permite zerar — para isso, cancele.
- **Cancelar** — cancela um pendente; a linha sai do "a pagar" sem virar dívida.

### Pagamentos sem valor (R$ 0,00)

Uma linha pendente de **R$ 0,00** não pode ser paga — o botão "Pagar" vira **Corrigir
valor**. Quando existe pelo menos uma linha assim, um aviso aparece no topo da página
(nas duas abas), porque pagar R$ 0,00 sujaria o caixa com um lançamento confirmado sem
valor nenhum.

### Pagar em lote pela tela

- **Pagar selecionados** (modo por pagamento) — marque as linhas pagáveis e pague todas
  de uma vez, com uma única conta/forma/data.
- **Pagar tudo** (modo por projetista) — paga de uma vez todas as entregas pendentes de
  uma pessoa.

Nos dois casos, cada projetista recebe **uma** notificação, mesmo com várias entregas
pagas juntas.

### Exportar

Os botões **XLSX**/**CSV**, na barra de filtros, baixam exatamente o recorte que a tela
está mostrando — mesmo filtro de status/projetista/projeto/período/busca e mesma
ordenação.

## Aba Lotes

Agrupa os pagamentos liberados no mês (e ainda sem lote) em um **lote mensal**, para
conferir e pagar de uma vez.

- **Gerar lote** — escolha mês e ano; um mês sem pagamento fora de lote (mês corrente,
  ou já coberto por um lote anterior) não é erro — a tela avisa e não cria nada.
- Cada lote mostra o progresso (**pagos/total**), o valor e o status.
- **Pagar lote** — efetiva de uma vez todos os pendentes pagáveis do lote (conta
  obrigatória, forma e data opcionais). Linhas de R$ 0,00 dentro do lote ficam de fora e
  continuam pendentes — o lote não fecha como "pago" enquanto sobrar alguma.

Um pagamento **cancelado** sai do lote sozinho — não fica preso nem é recolhido de
volta por um lote seguinte.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver, pagar, editar, cancelar, gerar/pagar lote, exportar | `financeiro:folha_pj` |

Os links de cada linha (projeto, pessoa, lançamento) dependem também da permissão de
**cada destino** — quem só tem `folha_pj` vê o texto sem link, em vez de cair numa tela
de "sem permissão".

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral](visao-geral.md)
- [Folha de pagamento CLT](../rh-ponto/folha-clt.md) (remuneração de CLT/estagiário)

## FAQ

**Por que não consigo pagar uma linha de R$ 0,00?** É proposital — pagar criaria um
lançamento confirmado sem valor no caixa. Use **Corrigir valor** para lançar o valor
correto antes de pagar.

**A conta é obrigatória para pagar?** Sim, em todos os caminhos de pagamento (individual,
lote, selecionados, pagar tudo) — sem conta o lançamento não concilia no extrato
bancário. A forma de pagamento continua opcional.

**O que muda entre "por projetista" e "por pagamento"?** Nada nos dados — é a mesma
lista, só organizada diferente. Use "por projetista" para ver quanto deve a cada pessoa;
"por pagamento" para ordenar, filtrar linha a linha ou selecionar um conjunto específico.

**A exportação respeita o filtro que apliquei?** Sim — o arquivo baixado é exatamente o
que a tela está mostrando no momento, com o mesmo filtro e ordenação.
