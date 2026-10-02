---
titulo: Financeiro — Caixinhas e distribuição de recebimentos
descricao: Separar parte do caixa para salários, impostos, 13º e outras finalidades, e dividir cada recebimento entre essas caixinhas por regra.
resumo: Caixinha é uma separação gerencial do caixa (não move dinheiro entre bancos). O reservado é calculado; pagar uma conta pela caixinha baixa caixa e reservado juntos. Regras de distribuição sugerem como dividir cada recebimento.
tags: [financeiro, caixinhas, reserva, reservado, dinheiro livre, distribuição, regras de distribuição, recebimentos a distribuir]
palavras-chave: [caixinha, reservar valor, liberar valor, transferir entre caixinhas, ajustar alocado, extrato de movimentos, reservado, livre, reserva descoberta, regra de distribuição, operacional livre, recebimentos a distribuir, data inicial, pagar pela caixinha]
sinonimos: [reservas, provisões, envelopes, fundos]
---

# Financeiro — Caixinhas e distribuição de recebimentos

## Objetivo

Saber **quanto do caixa já tem destino** — salários, pró-labore, impostos, encargos, férias, 13º,
reserva operacional, reserva de emergência, distribuição de lucros — e quanto está realmente **livre**.

> Caixinha **não é conta bancária**. Reservar não move dinheiro de banco: é uma separação gerencial,
> com registro de quem fez o quê.

## Como acessar

- **Financeiro → Caixinhas** (`/financeiro/caixinhas`). Abas: **Caixinhas**, **Extrato de movimentos** e
  **Regras de distribuição** (`/financeiro/distribuicao`).
- Ver: visão financeira. Reservar, liberar, transferir, ajustar, criar e arquivar: `financeiro:gerir`.

## Como o reservado é calculado

- **Alocado** = tudo o que foi reservado, menos o que foi liberado, mais ou menos transferências e ajustes.
- **Usado** = contas **pagas** pela caixinha, a partir do dia em que ela foi criada.
- **Reservado** = alocado − usado (nunca negativo).
- **Dinheiro livre** = caixa atual − reservado. Se as caixinhas passam do caixa, a diferença aparece como
  **reserva descoberta**, com valor.

Pagar uma conta ligada a uma caixinha baixa **o caixa e o reservado juntos** — o dinheiro livre não cai
duas vezes.

## Passo a passo

### Reservar, liberar, transferir, ajustar

1. Clique com o botão direito no cartão da caixinha (ou no **⋯**).
2. Escolha **Reservar valor**, **Liberar valor**, **Transferir para outra caixinha…** ou **Ajustar o
   alocado…**, informe o valor e a data.
3. O movimento entra no **Extrato de movimentos**.

Só dá para liberar ou transferir o que está **reservado agora**. O ajuste existe para corrigir o passado
(ex.: uma conta paga que deveria ter saído de outra caixinha).

### Pagar uma conta pela caixinha

Em **Contas a pagar**, no menu da conta: **Pagar pela caixinha**. Também dá pelo formulário da conta e
pelo [Planejador](planejador.md). Só conta a pagar **em aberto** troca de caixinha; depois de paga, a
correção é um **ajuste** na caixinha.

### Necessidade e "faltam"

Cada caixinha tem uma regra de necessidade:

- **Meta fixa** — um valor-alvo.
- **Compromissos ligados** — a soma das contas em aberto ligadas a ela que vencem no horizonte da
  caixinha. Sem nada a pagar no horizonte, ela aparece como completa.

### Arquivar

Só com **reservado zero** e **nenhuma conta em aberto** ligada — senão o planejador perderia a cobertura
dessas contas sem avisar. A mensagem diz o que falta.

## Distribuição de recebimentos

### Regras de distribuição

Em **Regras de distribuição**, cada regra divide um recebimento em percentuais que **fecham 100%**. Um
destino pode ser **Operacional (livre)** — essa parte fica no caixa, sem caixinha. A regra pode valer para
categorias de receita específicas; a **regra padrão** vale para o resto. Nenhuma regra vem pronta.

### Recebimentos a distribuir

No painel **Recebimentos a distribuir** (aba Caixinhas) aparecem as receitas **já recebidas** desde a
**data inicial** escolhida que ainda não foram distribuídas nem puladas.

1. Escolha a regra (a sugerida já vem marcada) e confira a prévia, centavo a centavo.
2. **Confirmar distribuição** reserva cada parte na caixinha dela. **Pular** tira o recebimento da fila sem reservar.

Não entram: transferência entre contas, reembolso de ART e o que ainda está em aberto. Distribuir **só
reserva**: não cria nem altera conta nenhuma.

## Regras de negócio

- A data inicial da fila evita trazer todo o histórico: o uso de uma caixinha só conta pagamentos feitos
  **depois** de ela existir, então distribuir recebimentos antigos inflaria o reservado.
- Duas pessoas confirmando o mesmo recebimento ao mesmo tempo reservam **uma vez só**.
- Duas liberações simultâneas do mesmo reservado: só uma passa.

## Erros possíveis e soluções

| Mensagem | Causa | Solução |
| --- | --- | --- |
| "Só dá para liberar o que está reservado agora." | O valor passa do reservado | Libere até o reservado mostrado no cartão |
| "Libere ou transfira o que está reservado antes de arquivar." | Ainda há reservado | Libere ou transfira, depois arquive |
| "Há N contas a pagar ligadas a esta caixinha…" | Contas em aberto saem dela | Troque a caixinha delas em Contas a pagar |
| "Faltam X% para fechar 100%." | A regra não fecha | Ajuste os percentuais |
| Fila de recebimentos vazia | Data inicial não definida | Quem gere define a data no painel |

## Funcionalidades relacionadas

- [Visão geral](visao-geral.md) · [Planejador de caixa](planejador.md) · [Contas e Aging](contas-e-aging.md) · [Sócios e compromissos recorrentes](socios-e-recorrentes.md)

## FAQ

**Reservar tira dinheiro do banco?** Não. O dinheiro continua na conta; a caixinha só diz que ele tem
destino.

**A reserva de emergência é a reserva mínima?** Não. A reserva de emergência é uma caixinha (dinheiro
separado, dentro do caixa). A reserva mínima é o piso que o planejador compara com o saldo. As duas
nunca se somam.
