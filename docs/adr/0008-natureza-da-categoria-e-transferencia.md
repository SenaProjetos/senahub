---
status: accepted
date: 2026-09-30
---

# ADR-0008 — A natureza do movimento mora na categoria, e transferência é neutra

Três tipos de movimento passam pelo mesmo `Lancamento`: receita e despesa da empresa, movimento de caixa
que não é resultado (distribuição e adiantamento de lucros) e transferência entre contas próprias
(inclusive aplicação e resgate). Hoje a transferência só existe pelo import do Meu Dinheiro, como duas
pernas em categorias chamadas "Transferência", e a DRE soma as duas. Decidimos marcar a **categoria** com
`natureza ∈ { resultado, fora_do_resultado, transferencia }` e derivar dela onde o movimento conta:
resultado entra em tudo; fora do resultado entra no caixa e no DFC, não na DRE; transferência muda o saldo
de cada conta mas não entra em DRE, DFC, aging nem nos totais do planejador. As pernas de uma
transferência se reconhecem por `Lancamento.transferenciaId` (preenchido a partir do `importHash` do
import). No planejador, toda perna pendente muda o saldo do dia em que cai — nenhuma some da projeção —, e
o total das transferências aparece numa linha própria que só fecha em zero quando as duas pernas estão no
horizonte.

## Alternativas consideradas

- **Um booleano `foraDoResultado`.** Rejeitada: não distingue distribuição (sai do caixa consolidado) de
  transferência (não sai), e o planejador precisa dessa diferença.
- **Um tipo novo em `TipoLancamento` ("transferencia").** Rejeitada: toda consulta que separa receita de
  despesa teria de tratar o terceiro tipo, e a natureza é propriedade do plano de contas, que o financeiro
  já mantém.
- **Reconhecer pelo nome da categoria**, como o livro caixa faz hoje. Rejeitada: o nome é editável; fica só
  como backfill da migração.

## Consequências

- Toda consulta que soma receita ou despesa passa pela classificação única (`classificarMovimento`), com
  teste-guarda.
- Uma perna sem contraparte continua mudando o saldo e gera aviso; não é descartada.
