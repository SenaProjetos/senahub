# M4 — Investimentos (carteira detalhada) — Financeiro

Contrato desta fase. Mock aprovado em 2026-10-02 (pranchas "Investimentos — carteira" e "Investimentos — detalhe do
ativo e Balanço"); decisão do dono: carteira detalhada como no mock, **valor atualizado à mão ou pelo extrato** (sem
cotação automática).

## 1. Modelo: cada ativo tem a sua conta

Um `Investimento` (CDB, LCI, Tesouro, fundo…) é dono de uma `ContaBancaria` do tipo `investimento`, criada junto com
ele (`Investimento.contaId`, único). O saldo dessa conta **é o valor atual do ativo**. Assim tudo o que o Financeiro já
sabe fazer com conta serve ao ativo: extrato, trava do mês fechado, auditoria, estorno.

| Movimento | O que grava | Caixa da empresa | DRE |
| --- | --- | --- | --- |
| **Aporte** | Transferência (M8) conta corrente → conta do ativo | sai da conta corrente | não |
| **Resgate** | Transferência conta do ativo → conta corrente | entra na conta corrente | não |
| **Rendimento** | Receita realizada na conta do ativo, categoria "Rendimento de aplicações" (chave `receita_rendimento_aplicacao`) | não (o dinheiro está no ativo) | **sim**, receita |
| **IR / IOF** | Despesa realizada na conta do ativo, categoria "IR sobre aplicações" (chave `despesa_ir_aplicacao`) | não | **sim**, despesa |

O tipo do movimento é **lido**, não guardado: perna de transferência que entra = aporte, que sai = resgate; receita
comum = rendimento; despesa comum = imposto. Não há tabela de movimentos — uma fonte só, o livro caixa.

## 2. A conta do ativo fica FORA do caixa

Caixa = dinheiro disponível nas contas. A conta de um ativo **não entra** no caixa atual (Visão geral, planejador, fluxo
diário) nem nas opções de conta dos formulários de lançamento. Leitores que mudam: `saldoBase` (recebe as contas que
ficam fora), `fluxoCaixa`, `baseDoPlanejador`, o realizado do `fluxoDiario` e `opcoesLancamento`. A regra é pela
LIGAÇÃO com um `Investimento`, não pelo tipo da conta: conta antiga do tipo "investimento" sem ativo continua como
sempre (para não mudar o caixa de quem já usa).

O **Balanço gerencial** ganha a linha **Investimentos** (soma dos valores atuais) separada de Caixa e contas.

## 3. Valor atual e IR

- **Registrar rendimento**: a pessoa informa o **valor bruto atual** que o banco mostra; o rendimento é a diferença para o
  que o sistema já tem (bruto = saldo + IR já provisionado). Valor menor que o do sistema é recusado (perda entra pelo
  resgate). O IR é **sugerido** pela tabela regressiva sobre todo o rendimento acumulado (22,5% até 180 dias, 20% até
  360, 17,5% até 720, 15% depois), contado do primeiro aporte, menos o IR já provisionado; ativo isento (LCI, LCA,
  poupança) sugere zero. O valor sugerido é editável.
- **Resgate total**: a pessoa informa quanto caiu na conta. A diferença para o valor atual vira rendimento (se maior) ou
  IR/IOF (se menor) no mesmo dia, o ativo zera e é arquivado. **Resgate parcial**: só a transferência.
- Come-cotas de fundo e cotação de ações não são calculados: entram como rendimento/IR informados.

## 4. Planejador

Ativo com liquidez "no vencimento" e vencimento dentro do horizonte vira **uma entrada prevista** na data do vencimento
(`inv:<id>`, valor atual, confiança provável, data não ajustável). Antes dela o dinheiro não é caixa livre.

## 5. Telas e regras de menu

- `/financeiro/investimentos` (Movimentações → Investimentos, gate `ver`; mexer = `gerir`): KPIs (aplicado, valor atual,
  rendimento, disponível em até 1 dia), lista de ativos com menu de contexto e `...` (abrir, aportar, resgatar, registrar
  rendimento, editar, arquivar, excluir), por liquidez e próximos vencimentos.
- `/financeiro/investimentos/[id]`: posição (aplicado, rendimento bruto, IR, valor atual), movimentos com menu (ver
  lançamento, excluir movimento), dados do ativo e o pedaço do Balanço.
- **Excluir ativo** só sem nenhum movimento; com movimentos, **arquivar** — e só com o valor atual zerado.
- **Excluir movimento**: aporte/resgate pela transferência inteira; rendimento/IR pelo lançamento; tudo com a trava do mês
  fechado.

## 6. Fora do MVP

DFC por atividade de investimento (aporte/resgate são transferências, não aparecem no DFC), cotação automática,
come-cotas, ações/FIIs com quantidade de cotas, pagamento parcial com IR proporcional.
