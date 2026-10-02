---
titulo: Transferência entre contas, data do saldo inicial e corrigir pagamento
descricao: Como mover dinheiro entre as contas da empresa sem mexer no resultado, a data a partir da qual o saldo inicial vale e como corrigir conta, forma ou data de um pagamento já feito.
resumo: A transferência é um par de lançamentos que sempre anda junto (criar, editar, dar baixa, estornar, excluir). A conta pode ter uma data de saldo inicial. E um lançamento já pago pode ter conta, forma e data corrigidas sem estornar.
tags: [financeiro, transferência, saldo inicial, conta bancária, corrigir pagamento, estorno]
palavras-chave: [transferir entre contas, transferência, perna da transferência, data do saldo inicial, saldo vale em, corrigir pagamento, trocar conta do pagamento, trocar data do pagamento, forma de pagamento]
sinonimos: [mover dinheiro entre contas, transferência interna, ajustar pagamento, mudar conta do lançamento]
---

# Transferência entre contas, data do saldo inicial e corrigir pagamento

## Transferir entre contas

### Para que serve

Mover dinheiro de uma conta da empresa para outra (reforço de caixa, aplicação, pagamento de fatura do próprio
cartão…) sem que isso apareça como receita ou despesa. A transferência **move o saldo das duas contas** e
**nunca entra na DRE, no DFC nem na margem**.

### Como fazer

- **Financeiro → Lançamentos** ou **Movimentações → Extrato por conta** → **Transferir entre contas**
  (exige `financeiro:gerir`).
- Escolha a conta de **origem** (de onde sai), a de **destino** (onde entra), o valor, a data e, se quiser, uma
  descrição. As duas contas precisam ser diferentes.
- **Já aconteceu** ligado: as duas pontas nascem pagas e o saldo muda na data. Desligado: fica **agendada** e
  só mexe no saldo quando você der baixa.

### Como ela é guardada

Uma transferência são **duas pernas** no livro caixa: uma saída na conta de origem e uma entrada na conta de
destino, com o mesmo valor, ligadas entre si. Por isso o menu de uma perna (botão direito ou `...`) oferece
ações da **transferência inteira**:

| Ação | O que faz |
| --- | --- |
| **Editar transferência…** | Troca contas, valor, data e descrição das duas pernas de uma vez. |
| **Dar baixa na transferência** | Só em transferência agendada: as duas pernas ficam pagas hoje. |
| **Estornar transferência** | Só em transferência realizada: as duas pernas voltam a ficar em aberto. |
| **Excluir transferência…** | Tira as duas pernas; o saldo das contas volta ao que era. |

Uma perna sozinha **não se edita, estorna, cancela nem exclui**: o sistema recusa e manda mexer na
transferência. Se qualquer das pernas já foi **conciliada com o extrato do banco**, editar, estornar e excluir
ficam desabilitados — desconcilie a transação antes. Mês fechado também trava (criar, editar, baixar, estornar
e excluir pedem mês aberto).

## Data do saldo inicial da conta

Em **Cadastros → Contas**, o campo **Saldo vale em** diz a partir de que dia o saldo inicial é verdadeiro:

- **Com data:** o saldo vale no **começo** desse dia. Só o que foi pago ou recebido **a partir dela** entra no saldo da conta; o
  anterior já está dentro do saldo inicial (contar de novo seria somar duas vezes).
- **Sem data:** todo o realizado da conta entra, de qualquer dia — como sempre foi.

A data vale em todos os lugares que mostram saldo de conta: Visão geral e planejador de caixa, Extrato por
conta, conferência com o saldo do banco (OFX) e o saldo de cada conta guardado no fechamento do mês.

## Corrigir pagamento

Quando a conta, a forma de pagamento ou o dia em que um lançamento foi pago estão errados, **não precisa
estornar**: no menu do lançamento (livro caixa, Pagas e recebidas ou Extrato por conta), **Corrigir pagamento…**.

- Dá para trocar **conta**, **forma de pagamento** e **data do pagamento** (não pode ser depois de hoje).
- Valor, categoria e projeto continuam no formulário de **Editar**.
- **Conciliado com o extrato:** a conta e a data são as do banco e não mudam; a forma de pagamento pode.
- **Mês fechado:** conta e data não mudam (a forma de pagamento sim).
- **Pagamento de produção** (projetistas) e **perna de transferência** têm tela própria: Produção e a transferência.
- Todo pagamento corrigido fica na auditoria, com o antes e o depois.
