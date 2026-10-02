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

> O importador OFX faz **deduplicação** (a mesma transação nunca entra duas vezes) e **casa
> automaticamente** só quando não há dúvida:
> - o lançamento em aberto tem **o mesmo valor, ao centavo**, vence até **5 dias** antes ou depois da data
>   do banco e é da **mesma conta** do extrato (ou ainda não tem conta — aí ganha a do extrato);
> - existe **um só** candidato: se dois servem, nenhum é escolhido e a transação fica para você;
> - transferência entre contas e despesa **aguardando aprovação** nunca casam sozinhas.
>
> O extrato entra **inteiro ou não entra**: se algo falhar no meio, nada fica gravado pela metade.

### Conferência do saldo

Quando o arquivo traz o **saldo informado pelo banco** (a maioria traz), o sistema compara com o saldo
da conta no sistema na mesma data. Se bater, avisa que confere; se não, mostra a diferença — sinal de que
falta lançar ou conciliar alguma movimentação daquela conta.

### Sugestões

Na lista, as sugestões de cada transação são lançamentos de mesmo valor e tipo, da mesma conta (ou sem
conta), até 45 dias antes ou depois, os mais próximos da data primeiro. Um lançamento já pago por **outra**
conta não aparece nem pode ser conciliado com este extrato.

### Desfazer uma conciliação

Desfazer (na Produção, pela correção do pagamento) devolve o lançamento ao que era **antes** da conciliação:
o que ela pagou volta a ficar em aberto, o que foi criado a partir da transação sai, e o que já estava pago
continua pago. Conciliações antigas, lançamentos mexidos depois e receitas já distribuídas entre caixinhas
só têm a transação desligada, com aviso.

### Menu da transação

Em cada transação pendente, o botão direito (ou o **⋯**) oferece **Conciliar com** a sugestão (uma lista,
quando há várias), **Criar lançamento desta transação** (escolha a categoria antes) e **Ignorar
transação**. Ignorar pede confirmação — a transação sai dos pendentes sem gerar lançamento, e importar o
extrato de novo não a traz de volta.

## Importação de planilha

### Como acessar
- Menu → **Financeiro** → **Mais** → **Importar planilha** (`/financeiro/importar`). Exige
  `financeiro:gerir`.

### Para que serve
- Migrar dados de planilha (ex.: do "Meu Dinheiro") para o financeiro, com mapeamento de
  colunas e validação antes de gravar.

### Desfazer uma importação
- **Desfazer** tira do financeiro todos os lançamentos do lote (ficam guardados como excluídos).
- Só vale para o lote **ainda não trabalhado**: se algum lançamento dele já foi conciliado,
  distribuído entre as caixinhas ou alterado (baixa, edição) depois da importação, o sistema recusa e
  diz quantos — exclua um a um, em Lançamentos, os que precisam sair.
- Um lançamento importado que você **excluiu à mão** não volta numa nova importação da mesma planilha.
  Os de um lote **desfeito** voltam, se você importar de novo.

### Conciliar
- Despesa **aguardando aprovação** ou lançamento **cancelado** não se concilia: aprove ou reabra antes.

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
| "Esta importação já foi trabalhada (…)" | Lote com lançamentos conciliados, distribuídos ou alterados | Excluir um a um os que precisam sair |

## Funcionalidades relacionadas

- [Lançamentos](lancamentos.md) · [Contas e Aging](contas-e-aging.md) · [Cadastros (contas bancárias)](README.md)

## FAQ

**O que é um arquivo OFX?** É o extrato bancário em formato eletrônico, exportado pelo
seu banco/Internet Banking.

**A importação cria lançamentos duplicados?** O importador deduplica para evitar
repetição.
