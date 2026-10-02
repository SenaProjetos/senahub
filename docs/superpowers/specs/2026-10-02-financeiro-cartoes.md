# M3 — Cartões de crédito e cartão pessoal do sócio (Financeiro)

Contrato desta fase. Mock aprovado em 2026-10-02 (pranchas "Cartões de crédito", "Fatura aberta,
pagar fatura e reembolso" e "Cartão pessoal — fatura do sócio e reembolso"). Vence o plano em caso de
conflito; o que o mock mostra e esta spec não contradiz é obrigatório.

## 1. O problema

Hoje o escritório paga despesas num **cartão pessoal do sócio** e a empresa vai abrir um **cartão
próprio**. Nos dois casos a despesa acontece num dia e o dinheiro sai em outro — e o Financeiro não tem
onde registrar isso sem errar o caixa ou a DRE.

## 2. Regra única (vale para os dois cartões)

1. **A compra é despesa no dia da compra.** Entra na DRE por competência no mês da compra, com a
   categoria, o centro e o projeto dela.
2. **O caixa só sai no pagamento.** Enquanto a fatura não é paga, nada saiu da conta.
3. **Pagar não cria despesa nova.** Pagar a fatura *realiza* as compras daquele ciclo — não existe um
   segundo lançamento "pagamento da fatura", ou a DRE contaria duas vezes.

A diferença entre os dois cartões é só quem recebe: o cartão da empresa é pago ao banco; o cartão
pessoal é **reembolsado ao sócio**. Por isso a fatura do cartão pessoal se chama, na tela, "Reembolsos
a `<sócio>`".

## 3. Decisões do dono (2026-10-02)

| # | Decisão |
|---|---|
| D1 | **A fatura segue o ciclo do cartão**: o cadastro tem dia de fechamento e dia de vencimento; a compra entra na fatura pela **data da compra**. Vale também para o cartão pessoal (a fatura do sócio tem ciclo e vencimento, como a do cartão dele). |
| D2 | **Cartão pessoal é de sócio** (`Socio`), não de qualquer colaborador. Reembolso a colaborador continua sendo um lançamento manual comum. |
| D3 | **Cartão não é conta bancária**: não entra em Cadastros → Contas, nem no saldo de caixa, nem no Extrato por conta. Ele vive só na tela Cartões. |

## 4. Modelo (migração `cartoes_de_credito`)

```
CartaoCredito
  id, nome, ultimosDigitos?, tipo: TipoCartao (empresa | pessoal)
  socioId?         — obrigatório quando tipo = pessoal (Restrict: sócio com cartão não some)
  limite?          — só informativo, só faz sentido no da empresa
  diaFechamento    — 1..28 (dia 29/30/31 não existe em todo mês; a tela explica)
  diaVencimento    — 1..28, no mês SEGUINTE ao fechamento
  contaPadraoId?   — conta de onde a fatura costuma ser paga (SetNull)
  ativo, ordem, createdAt, updatedAt

FaturaCartao
  id, cartaoId (Cascade), competencia "YYYY-MM" (mês em que o ciclo FECHA)
  inicioCiclo, fimCiclo, vencimento  (@db.Date)
  @@unique([cartaoId, competencia])

Lancamento
  + cartaoId?  (SetNull)   — a despesa foi paga no cartão
  + faturaId?  (SetNull)   — em qual fatura ela entrou
  @@index([faturaId])
```

**Nenhuma categoria nova.** A compra usa a categoria real da despesa; o pagamento não gera lançamento.

`FaturaCartao` **não guarda situação nenhuma**: aberta, fechada e paga são leitura das compras dela
contra a data de hoje (pura, `situacaoDaFatura`) — paga = nenhuma compra em aberto. Sem estado gravado
não existe job de fechamento, nem fatura "paga" com compra em aberto, e estornar uma compra **reabre a
fatura sozinho**, sem gancho em nenhum caminho de baixa (livro caixa, lote, conciliação).

## 5. O que cada operação faz

| Operação | Efeito |
|---|---|
| **Lançar compra** | Cria um `Lancamento` despesa `previsto`: `data` e `dataCompetencia` = data da compra, `vencimento` = vencimento da fatura do ciclo, `cartaoId`, `faturaId`, **sem `contaId`** (a conta só aparece no pagamento). A fatura do ciclo é criada na hora se ainda não existir. |
| **Compra parcelada** | N lançamentos, um por ciclo (`recorrenciaGrupo` comum, descrição "… (1/3)"), cada parcela com `data` = data da compra + k meses e a fatura daquele ciclo. Centavo que sobra fica na **última** parcela. |
| **Pagar fatura** | Numa transação: baixa TODAS as compras em aberto da fatura (status → `confirmado`, `dataConfirmacao` = data do pagamento, `contaId` = conta escolhida). O caixa cai uma vez só, pela soma, e a fatura passa a ler-se como paga. |
| **Reembolsar só esta** (só cartão pessoal) | Baixa UMA compra (mesma regra). A fatura continua com o resto; quando a última for baixada, ela passa a ler-se como paga. |
| **Estornar** | É o estorno normal do lançamento (N1), sem nada de especial: a fatura volta a aparecer como fechada porque passou a ter compra em aberto. |

Consequências que caem de graça do modelo: a DRE por caixa conta no mês do pagamento, a DRE por
competência no mês da compra, o aging não vê a compra como conta vencida antes do vencimento da fatura,
e a conciliação do OFX casa o pagamento... **não casa** — ver §7.

## 6. Planejador e Visão geral

As compras em aberto já são eventos pendentes do motor (uma projeção só, F7). Para a tela não mostrar
quatro saídas soltas no mesmo dia, `baseDoPlanejador` **agrega por fatura**: todas as compras com o
mesmo `faturaId` viram UM evento `fatura:<id>` no vencimento, com a descrição "Fatura Visa Empresarial
— outubro" (ou "Reembolso a Lúcio — outubro") e o total. O evento agregado não é ajustável item a item
(como o `prog:` da recorrência): remarcar a data de uma fatura é mudar o vencimento dela, não do
lançamento.

## 7. Limites do MVP (ditos na tela, não escondidos)

- **Pagamento parcial de fatura não existe**: ou paga a fatura, ou paga uma compra por vez (cartão
  pessoal). O mock falava em "saldo que rola para a próxima fatura" — fica para depois, e a nota do mock
  foi corrigida.
- **Conciliação do OFX não casa o pagamento da fatura** (é uma transação do banco contra N lançamentos;
  o 1:N está na lista de lacunas do núcleo). Depois de pagar a fatura pelo sistema, a transação do
  extrato se resolve com "Ignorar" — a tela diz isso.
- **Sem limite/juros/encargos**: `limite` é informativo (barra de limite usado); o sistema não calcula
  juros de rotativo nem parcelamento de fatura.
- **Compra no cartão é isenta da alçada**, como os outros produtores (N3): a despesa já aconteceu, e
  travar a fatura em aprovação geraria juros. A revisão é a fatura, não a aprovação prévia.

## 8. Telas

- `/financeiro/cartoes` — cartões (card por cartão, com os números do mock) + faturas do cartão
  escolhido (`?cartao=`). Menu de contexto nas faturas (ADR-0002).
- `/financeiro/cartoes/[id]?fatura=YYYY-MM` — a fatura: compras, total, pagar fatura, menu por compra
  (editar, mudar categoria/projeto, ver parcelas, criar regra a partir desta compra, excluir).
  No cartão pessoal a mesma tela fala em reembolso e ganha "Reembolsar só esta".
- Item **Cartões de crédito** no grupo Movimentações (gate `financeiro:ver`; mexer = `gerir`).

## 9. Verificação

Regras puras (`cartoes/ciclo.ts`: ciclo da compra, situação da fatura, parcelas; `cartoes/acoes.ts`),
`smoke:financeiro-core` (compra entra na fatura do ciclo, parcelada cai em faturas seguidas, pagar
realiza tudo numa transação, estorno reabre, reembolso individual, agregação no planejador), telas no
Chrome a 1366 (menu aberto) e 390 px.
