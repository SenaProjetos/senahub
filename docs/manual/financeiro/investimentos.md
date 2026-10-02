---
titulo: Investimentos
descricao: Carteira de investimentos da empresa por ativo — aporte, resgate, rendimento e IR — com o valor atual fora do caixa e dentro do Balanço.
resumo: Cada ativo (CDB, LCI, Tesouro, fundo) tem uma conta própria que não entra no caixa. Aporte e resgate são transferências; o rendimento entra na DRE como receita e o IR como despesa. O valor atual é atualizado à mão, pelo valor bruto que o banco mostra.
tags: [financeiro, investimentos, aplicação, CDB, LCI, Tesouro, rendimento, IR, balanço]
palavras-chave: [investimento, aplicação financeira, aporte, resgate, rendimento, imposto de renda, tabela regressiva, valor atual, carteira, vencimento da aplicação]
sinonimos: [aplicações, carteira de investimentos, renda fixa, aplicação no banco]
---

# Investimentos

## Objetivo

Saber quanto a empresa tem aplicado, quanto rendeu e quando o dinheiro volta — sem confundir dinheiro aplicado com
dinheiro disponível no caixa.

## Como acessar

**Financeiro → Movimentações → Investimentos** (`/financeiro/investimentos`). Ver exige `financeiro:ver`; aportar,
resgatar e registrar rendimento exigem `financeiro:gerir`.

## Como funciona

Cada ativo ganha uma **conta própria**, criada junto com ele. O saldo dessa conta é o **valor atual** do ativo, e ela
**não entra no caixa** (Visão geral, planejador, fluxo diário) nem aparece para lançamentos comuns.

| Movimento | O que acontece no caixa | Na DRE |
| --- | --- | --- |
| **Aporte** | sai da conta corrente | não entra (é transferência) |
| **Resgate** | entra na conta corrente | não entra (é transferência) |
| **Rendimento** | nada (o dinheiro continua aplicado) | **receita** (Rendimento de aplicações) |
| **IR / IOF** | nada | **despesa** (IR sobre aplicações) |

No fim, quando tudo for resgatado, o caixa ganhou exatamente o rendimento líquido.

## Cadastrar um ativo

**Novo investimento** pede nome, tipo, instituição, rentabilidade (texto livre: "105% do CDI", "IPCA + 6%"), liquidez,
vencimento e se é isento de IR (LCI, LCA e poupança vêm marcados). Pode já nascer com o **aporte inicial**, saindo da
conta escolhida.

## Registrar rendimento

Informe o **valor bruto atual** que o banco mostra. O sistema calcula o rendimento (a diferença para o que ele já tinha)
e sugere o **IR** pela tabela regressiva — 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois, contados do
primeiro aporte — sobre todo o rendimento acumulado, menos o que já foi provisionado. Você pode trocar o valor do IR. Um
valor menor que o do sistema é recusado: perda entra no resgate.

## Resgatar

Informe a conta de destino e **quanto caiu nela**.

- **Resgate parcial:** só a transferência; não pode passar do valor atual.
- **Resgate total:** o que caiu na conta manda. A diferença para o valor atual vira rendimento (se caiu mais) ou IR/IOF
  (se caiu menos), o ativo zera e sai da carteira (aba **Resgatados**).

## No planejador e no Balanço

- Ativo com liquidez **no vencimento** e vencimento dentro do horizonte aparece no planejador como **entrada prevista**
  na data do vencimento. Antes dela o dinheiro não é caixa livre.
- O **Balanço gerencial** ganhou a linha **Investimentos** (soma dos valores atuais), separada de Caixa e bancos.

## Menu do ativo e do movimento (botão direito ou `...`)

- **Ativo:** abrir, aportar, resgatar, registrar rendimento, editar dados, arquivar (só com valor zero) e excluir (só
  sem nenhum movimento).
- **Movimento:** ver o lançamento e excluir. Excluir um aporte ou resgate tira a transferência inteira; excluir o resgate
  total devolve o ativo à carteira. Mês fechado trava.

## Limites desta versão

Sem cotação automática (o valor é atualizado à mão), sem come-cotas de fundo, sem ações com quantidade de cotas. Aporte e
resgate ainda não aparecem no DFC como atividade de investimento.
