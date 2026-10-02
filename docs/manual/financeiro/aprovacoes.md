---
titulo: Aprovações de despesas (alçadas)
descricao: Fila de despesas que exigem aprovação por faixa de valor, com papéis aprovadores.
resumo: Despesas acima de uma faixa de valor entram numa fila de aprovação; só papéis aprovadores (admin/supervisor/administrativo) liberam, conforme a alçada configurada.
tags: [aprovações, alçada, despesa, aprovar, faixa de valor, fluxo de aprovação]
palavras-chave: [aprovação, alçada, despesa, aprovar, rejeitar, faixa de valor, aprovador, parcelamento, própria despesa, autoaprovação]
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
- **A faixa inclui o teto:** uma faixa "até R$ 1.000" cobre exatamente R$ 1.000.
- **Vale o total do parcelamento:** uma despesa lançada em 60 meses de R$ 900 é avaliada pelos
  R$ 54.000, não pelos R$ 900 de cada mês.
- **Quem lançou não aprova a própria despesa** — só o admin pode, para o escritório não travar.
- **Mudou o valor, reavalia:** editar o valor de uma despesa em aberto a manda de volta para a
  aprovação se o novo valor (somado ao parcelamento) passa da faixa automática, mesmo que ela já tivesse
  sido aprovada. Se o valor cai para a faixa automática, uma despesa que esperava aprovação é liberada.
- **O que não passa pela alçada:** despesas que nascem de outro módulo, já aprovadas lá — folha CLT,
  pagamento de projetistas, taxa de ART, serviço terceirizado, compromisso recorrente, parcelas de
  documento e distribuição de lucros.
- Despesa aguardando aprovação **não se paga nem se concilia** até ser aprovada.

## Fluxo

1. Um lançamento de despesa é criado.
2. Se o valor exigir alçada, ele entra na **fila de aprovações**.
3. Um aprovador apto **aprova** (ou **rejeita**) a despesa.
4. Aprovada, a despesa segue o curso normal.

### Na tela

- Em cada despesa, o botão direito (ou o **⋯**) oferece **Aprovar**, **Rejeitar…** e **Ver no livro
  caixa**. Se o valor passa da sua alçada, ou se foi você quem lançou, as duas decisões aparecem
  desabilitadas com o motivo ("Você não tem alçada para aprovar este valor." ou "Quem lançou a despesa não
  a aprova: peça a outro aprovador.") — a mesma frase que o sistema daria ao tentar.
- **Rejeitar** abre uma janela pedindo o **motivo**, que vai para quem lançou.
- Marque várias despesas e use **Aprovar selecionadas** na barra de baixo. Rejeitar é sempre uma por vez,
  porque cada uma precisa do seu motivo.

## Permissões

- A **lista** segue o acesso financeiro; a **aprovação** é limitada aos **papéis
  aprovadores** definidos na faixa.
- As **faixas de alçada** são configuradas nas **Configurações do financeiro** (a tela de Aprovações tem
  o atalho). O antigo "limite de alçada" único saiu: quem tinha um limite salvo passou a ter as faixas
  equivalentes (abaixo do limite, automático; a partir dele, só o admin).

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Visão geral](visao-geral.md)

## FAQ

**Toda despesa precisa de aprovação?** Não — só as que caem numa faixa de valor com
papéis aprovadores. Faixas sem papéis são automáticas.

**Quem aprova?** Os papéis definidos para a faixa (tipicamente admin, supervisor ou
administrativo).
