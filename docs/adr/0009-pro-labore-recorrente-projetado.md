---
status: accepted
date: 2026-09-30
---

# ADR-0009 — Pró-labore é compromisso recorrente projetado; o lançamento só nasce perto do vencimento

O planejador precisa enxergar o pró-labore de cada sócio nos meses futuros. A recorrência que já existe
materializa todos os meses de uma vez como contas a pagar. Por decisão do dono, o pró-labore é cadastrado
como **compromisso recorrente**: essa é a origem, os meses futuros entram na projeção como "programados"
sem virar conta a pagar, e o lançamento financeiro é gerado quando chega o período definido, seguindo daí
o fluxo normal (contas a pagar → pagamento → conciliação). A geração é idempotente pelo par
(compromisso, competência). Lançamento manual vinculado a um mês faz aquele mês deixar de ser projetado e
vale o valor do lançamento; diferença vira aviso, nunca correção automática; lançamento sem vínculo conta
junto com o programado e avisa de possível duplicidade.

## Alternativas consideradas

- **Gerar 12 meses de lançamentos ao cadastrar** (a recorrência atual). Rejeitada pelo dono: enche contas a
  pagar de obrigações que ainda não existem, e mudar o valor exige editar meses já gerados.
- **Só projetar, nunca gerar.** Rejeitada: o pagamento, a conciliação e a auditoria precisam de um
  lançamento real no mês.

## Consequências

- Passam a existir duas formas de repetição no financeiro: a recorrência antiga (lançamentos gerados de
  uma vez) e o compromisso recorrente (projeção + geração no mês). Unificar é decisão futura.
- A geração depende do job diário do pg-boss (só em `dev:server` e produção) e de um botão "Gerar agora";
  mês programado já vencido sem lançamento aparece em Vencidos com aviso.
