---
titulo: Lançamentos (receitas e despesas)
descricao: Cadastro de receitas e despesas, com previsto/confirmado, recorrência, campos obrigatórios e exclusão reversível.
resumo: Registre receitas e despesas (previstas ou já confirmadas), com categoria, conta, forma, projeto, fornecedor/cliente; confirme o realizado, use recorrência mensal e exclua com segurança (soft delete).
tags: [lançamentos, receita, despesa, previsto, confirmado, recorrência, categoria, conta, forma de pagamento, soft delete]
palavras-chave: [lançamento, receita, despesa, previsto, confirmado, realizado, recorrência, vencimento, competência, categoria, fornecedor, cliente]
sinonimos: [movimentações, entradas e saídas, transações]
---

# Lançamentos (receitas e despesas)

## Objetivo

Registrar todas as **receitas** e **despesas** do escritório — a base de todo o módulo
financeiro (DRE, caixa, aging, relatórios).

## Como acessar

- Menu → **Financeiro** → cartão **Lançamentos** (`/financeiro/lancamentos`). Exige
  `financeiro:ver` para ver; **criar/editar/confirmar exige `financeiro:gerir`**.

## Criar um lançamento

Campos:

- **Tipo:** receita ou despesa.
- **Descrição**, **valor** (> 0), **data**.
- **Vencimento** e **data de competência** (opcionais).
- **Categoria** (obrigatória), **centro de custo**, **conta**, **forma de pagamento**.
- **Projeto**, **fornecedor** (despesa) ou **cliente** (receita), **observação**.
- **Confirmado:** marque para já lançar como **realizado** (senão entra como
  **previsto**).
- **Recorrência mensal:** nº de ocorrências (1 = sem recorrência; até 60), que gera
  lançamentos mensais repetidos.

> **Campos obrigatórios são configuráveis.** O administrador pode exigir centro de custo,
> forma, projeto, contato (fornecedor/cliente) e/ou observação — veja Configurações do
> financeiro. Se faltar um campo exigido, o sistema avisa qual é.

## Estados do lançamento

| Estado | Significado |
| --- | --- |
| **Previsto** | Lançado, ainda não realizado (entra no aging e na projeção) |
| **Confirmado** | Realizado/baixado (entra no resultado, DRE e saldo) |

- **Confirmar** um lançamento previsto pede: conta, forma, **data de confirmação** e,
  opcionalmente, o **valor efetivo** (se diferiu do previsto).

## Editar e excluir

- **Editar:** descrição, valor, datas, categoria, centro, projeto, contato, observação.
- **Excluir:** é **reversível** — o lançamento é marcado como excluído (soft delete) e
  some das listas, mas permanece registrado internamente.

## Aprovação de despesas

Despesas acima de determinada faixa de valor exigem **aprovação por alçada** antes de
seguir. Veja [Aprovações](aprovacoes.md).

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver lançamentos | `financeiro:ver` |
| Criar / editar / confirmar / excluir | `financeiro:gerir` |

## Erros possíveis e soluções

| Mensagem / situação | Causa | Solução |
| --- | --- | --- |
| "Valor deve ser maior que zero." | Valor ≤ 0 | Informar valor positivo |
| "Selecione a categoria." | Categoria vazia | Escolher categoria |
| Avisa que falta um campo (ex.: "Centro de custo") | Campo obrigatório pela configuração | Preencher o campo exigido |
| Despesa fica "aguardando aprovação" | Valor acima da alçada | Aguardar aprovador |

## Funcionalidades relacionadas

- [Contas e Aging](contas-e-aging.md) · [Conciliação](conciliacao-ofx.md) · [Aprovações](aprovacoes.md) · [Relatórios](relatorios.md)

## FAQ

**Qual a diferença entre previsto e confirmado?** Previsto é o que deve acontecer (agenda
de caixa); confirmado é o que de fato ocorreu (entra no resultado).

**Excluí um lançamento por engano.** A exclusão é lógica (soft delete); peça ao
administrador para recuperar.
