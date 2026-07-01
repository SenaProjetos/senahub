---
titulo: Conciliação bancária (OFX) e Importação
descricao: Importar extrato OFX, conciliar transações com lançamentos e migrar planilhas para o financeiro.
resumo: Importe o OFX do banco, concilie as transações pendentes com lançamentos (ou crie a partir delas) e use o importador para migrar dados de planilha.
tags: [conciliação, ofx, banco, extrato bancário, importar, migração, planilha, meu dinheiro]
palavras-chave: [conciliação, ofx, extrato bancário, conciliar, transação, importar, migrar, planilha, meu dinheiro]
sinonimos: [conciliação bancária, importação de extrato, reconciliação]
---

# Conciliação bancária (OFX) e Importação

## Objetivo

Casar o que aconteceu no **banco** (extrato OFX) com os **lançamentos** do sistema, e
migrar dados externos (planilhas) para o financeiro.

## Conciliação (OFX)

### Como acessar
- Menu → **Financeiro** → **Conciliação** (`/financeiro/conciliacao`). Exige
  **`financeiro:gerir`**.

### Fluxo
1. **Importe o arquivo OFX** do banco.
2. O sistema lista as **transações pendentes** de conciliação.
3. Para cada transação, **concilie** com um lançamento existente ou **crie** um
   lançamento (escolhendo conta e categoria).
4. O painel financeiro mostra um **badge** com a quantidade de transações ainda
   pendentes.

> O importador OFX faz **deduplicação** e tenta **casar automaticamente** quando possível.

## Importação de planilha

### Como acessar
- Menu → **Financeiro** → **Importar dados** (`/financeiro/importar`). Exige
  `financeiro:gerir`.

### Para que serve
- Migrar dados de planilha (ex.: do "Meu Dinheiro") para o financeiro, com mapeamento de
  colunas e validação antes de gravar.

## Permissões

| Ação | Permissão |
| --- | --- |
| Conciliar / importar OFX | `financeiro:gerir` |
| Importar planilha | `financeiro:gerir` |

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| Acesso negado à conciliação | Falta `financeiro:gerir` | Solicitar permissão |
| Transação não casa automaticamente | Sem correspondência clara | Conciliar manualmente ou criar o lançamento |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Contas e Aging](contas-e-aging.md) · [Cadastros (contas bancárias)](README.md)

## FAQ

**O que é um arquivo OFX?** É o extrato bancário em formato eletrônico, exportado pelo
seu banco/Internet Banking.

**A importação cria lançamentos duplicados?** O importador deduplica para evitar
repetição.
