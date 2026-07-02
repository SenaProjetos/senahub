---
titulo: Aprovações de despesas (alçadas)
descricao: Fila de despesas que exigem aprovação por faixa de valor, com papéis aprovadores.
resumo: Despesas acima de uma faixa de valor entram numa fila de aprovação; só papéis aprovadores (admin/supervisor/administrativo) liberam, conforme a alçada configurada.
tags: [aprovações, alçada, despesa, aprovar, faixa de valor, fluxo de aprovação]
palavras-chave: [aprovação, alçada, despesa, aprovar, rejeitar, faixa de valor, limite, aprovador]
sinonimos: [workflow de aprovação, autorização de despesa, alçadas]
---

# Aprovações de despesas (alçadas)

## Objetivo

Garantir que **despesas** acima de certos valores passem por **aprovação** antes de
seguir, conforme as faixas de alçada configuradas.

## Como acessar

- Menu → **Financeiro** → cartão **Aprovações** (`/financeiro/aprovacoes`). O cartão
  mostra um **badge** com a quantidade aguardando.

## Como funciona

- A regra vale **apenas para despesas** (receitas não passam por alçada).
- Cada **faixa de valor** define quais **papéis** podem aprovar. Faixa **sem papéis** =
  **aprovação automática** (não precisa de alçada).
- A despesa cujo valor cai numa faixa com papéis exigidos fica **aguardando aprovação**.
- **Papéis aprovadores:** admin, supervisor e administrativo (conforme a configuração da
  faixa).

## Fluxo

1. Um lançamento de despesa é criado.
2. Se o valor exigir alçada, ele entra na **fila de aprovações**.
3. Um aprovador apto **aprova** (ou **rejeita**) a despesa.
4. Aprovada, a despesa segue o curso normal.

## Permissões

- A **lista** segue o acesso financeiro; a **aprovação** é limitada aos **papéis
  aprovadores** definidos na faixa.
- As **faixas de alçada** são configuradas nas Configurações do financeiro.

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral](visao-geral.md)

## FAQ

**Toda despesa precisa de aprovação?** Não — só as que caem numa faixa de valor com
papéis aprovadores. Faixas sem papéis são automáticas.

**Quem aprova?** Os papéis definidos para a faixa (tipicamente admin, supervisor ou
administrativo).
