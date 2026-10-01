---
status: accepted
date: 2026-09-30
---

# ADR-0007 — Confiança do recebimento é um eixo separado do status do lançamento

O planejador de caixa precisa graduar entradas pendentes (confirmada pelo cliente, provável, estimada,
incerta), e o `Lancamento` já tem `status = confirmado`, que significa **realizado** (dinheiro no caixa,
DRE). Decidimos guardar a confiança num campo e num enum próprios (`confianca`, `ConfiancaRecebimento`,
com o valor `confirmada_cliente`) que só o motor do planejador lê, e só em receita pendente. Nenhuma regra
converte um no outro: baixar uma receita não mexe na confiança, e marcar "confirmada pelo cliente" não
realiza nada. Na tela, realizado aparece como "Pago"/"Recebido" e o nível como "Confirmada pelo cliente".

## Alternativas consideradas

- **Novos valores em `StatusLancamento`** (ex.: `previsto_confirmado`, `previsto_provavel`). Rejeitada:
  todo leitor de `status = previsto` (aging, contas a receber, conciliação, KPIs) teria de aprender os
  valores novos, e um esquecido tiraria dinheiro das telas.
- **Reusar a palavra "confirmado" nos dois sentidos.** Rejeitada: é a ambiguidade que um ERP financeiro
  não pode ter — "confirmada" na lista de recebíveis seria lida como "recebida".

## Consequências

- O identificador `confirmada` sozinho não existe no código novo; o teste do motor garante que um
  lançamento realizado nunca vira evento e que a confiança de receita realizada é ignorada.
- Telas antigas que dizem "Confirmado" para realizado migram para "Pago"/"Recebido" na refatoração
  visual do financeiro (F8 do plano).
