---
titulo: Financeiro — Planejador de caixa e cenários
descricao: Simular decisões de pagamento e recebimento antes de tomá-las e ver o efeito no caixa dia a dia; salvar cenários e aplicá-los ao financeiro.
resumo: O Planejador projeta o caixa a partir de hoje com o que está em aberto, deixa simular nova data, prioridade, confiança, caixinha e movimentos novos, e só grava no financeiro quando alguém aplica um cenário.
tags: [financeiro, planejador, cenário, simulação, liquidez, projeção de caixa, reserva mínima, horizonte, prioridade, confiança]
palavras-chave: [planejador de caixa, simular, cenário, aplicar cenário, nova data, prioridade, P1, P2, P3, P4, confiança, confirmada pelo cliente, provável, estimada, incerta, conservador, horizonte, reserva mínima, menor saldo, déficit, simular movimento]
sinonimos: [simulador de caixa, fluxo projetado, gestão de liquidez, tesouraria]
---

# Financeiro — Planejador de caixa e cenários

## Objetivo

Responder **"o que acontece com o caixa se eu fizer isto?"** antes de fazer. O Planejador mostra o saldo
dia a dia a partir de hoje e deixa você simular mudanças — nada do que você simula altera o financeiro até
você **aplicar** um cenário.

## Como acessar

- **Financeiro → Planejador de caixa** (`/financeiro/planejador`), ou **Abrir planejador** na Visão geral.
- Ver e simular: quem tem visão financeira (inclusive sócio). Salvar cenário: `financeiro:ver`.
  Definir a reserva mínima e **aplicar ao financeiro**: `financeiro:gerir`.

## Conceitos

| Termo | O que é |
| --- | --- |
| **Horizonte** | Quantos dias à frente o planejador olha: 30, 60, 90 ou 180. Ele não olha para trás |
| **Prioridade** (só saídas) | P1 não pode atrasar · P2 importante · P3 negociável · P4 adiável. Sem prioridade na conta, vale a da categoria |
| **Confiança** (só entradas em aberto) | Confirmada pelo cliente · Provável · Estimada · Incerta. Não diz que o dinheiro entrou; diz o quanto se acredita que entra na data |
| **Reserva mínima** | O piso que o saldo não deveria cruzar. Não é caixinha e não se soma à reserva de emergência |
| **Programado** | Um mês futuro de [compromisso recorrente](socios-e-recorrentes.md) que ainda não virou conta a pagar |

## A tela

- **Premissas:** caixa atual, reserva mínima (com o botão de editar, para quem gere) e horizonte.
- **Cenário em dois eixos:** quais **entradas** contam (Confirmadas pelo cliente · + Prováveis · +
  Estimadas · Todas, até incertas) e quais **compromissos** contam (Todos · P1 + P2 · Só P1). Os atalhos
  **Conservador**, **Provável**, **Só P1** e **P1 + P2** só preenchem os eixos; outra combinação vira
  "Personalizado".
- **Indicadores e alerta:** saldo no fim, menor saldo, quanto falta receber para não romper a reserva,
  dias de caixa e déficit. Quando há rompimento, o alerta lista as maiores saídas até ali, as entradas por
  confiança e quanto há em **P3 e P4 que podem mudar de data**.
- **Linha do tempo:** saldo nas contas (linha cheia) e dinheiro livre (tracejada), com a reserva mínima.
  Com o teclado: Tab entra no gráfico, setas andam um dia, Shift + seta anda uma semana, Home/End vão às
  pontas, Esc sai.
- **Agenda do horizonte:** cada conta, dia a dia, com o saldo depois dela. Vencidas ficam à parte, no
  topo — entram como se fossem pagas hoje.

## Simular

Clique com o botão direito numa conta da agenda (ou no **⋯**):

- **Simular outra data…** — mostra o menor saldo antes e depois da nova data.
- **Prioridade** e **Confiança** nesta simulação.
- **Pagar pela caixinha** — a saída passa a sair do reservado, e o dinheiro livre não cai duas vezes.
- **Simular distribuição** (entrada) — divide a entrada entre caixinhas, só na simulação.
- **Tirar da simulação** / **Incluir nesta simulação** — para ver o caixa sem ou com aquele item, mesmo
  que o cenário não o pegasse.
- **Simular movimento** (no topo) — inclui uma entrada ou saída que ainda não existe.

O **Impacto no caixa** mostra antes × depois de tudo que você simulou. O rascunho fica guardado neste
navegador até você descartar.

## Cenários salvos

- **Salvar cenário** guarda os ajustes com nome. Ele guarda a **intenção**, não o resultado: ao abrir, é
  recalculado sobre os dados de hoje.
- **Cenários salvos** (`/financeiro/cenarios`) lista, compara lado a lado, abre no planejador e arquiva.
- **Aplicar ao financeiro** (exige `financeiro:gerir`) leva os ajustes ao real: **todos ou nenhum**. Se
  alguma conta mudou desde a simulação (foi paga, mudou de valor ou de data), nada é aplicado e a tela diz
  qual mudou — use **Atualizar ajustes** e revise.
- Aplicar grava **data, prioridade, confiança, caixinha** e **movimentos novos com categoria**. Tirar da
  simulação e distribuição simulada **não** são aplicados: são só leitura do cenário.

## Regras de negócio

- O planejador começa do **caixa atual** (o mesmo da Visão geral) e projeta só o que está **em aberto**.
- A previsão do cronograma nasce **Estimada**: fica fora do cenário Provável até alguém incluir.
- Recebimento vencido há mais de 30 dias conta como **Incerto** na projeção (sem mudar a conta).
- Transferência entre contas da empresa não muda o caixa total.

## Erros possíveis e soluções

| Situação | Causa | Solução |
| --- | --- | --- |
| "Aplicar" recusado com a lista de contas | O financeiro mudou depois da simulação | Abra o cenário, use **Atualizar ajustes** e aplique de novo |
| Não consigo mudar a data de um item | Previsão do cronograma, taxa de ART ou P1 com prazo legal — a data segue outra regra | O motivo aparece no próprio menu |
| Botão "Aplicar" não aparece | Falta `financeiro:gerir` | Peça a quem gere o financeiro |

## Funcionalidades relacionadas

- [Visão geral](visao-geral.md) · [Caixinhas](caixinhas.md) · [Fluxo de caixa](fluxo-de-caixa.md) · [Contas e Aging](contas-e-aging.md) · [Pagamentos em lote](pagamentos-em-lote.md)

## FAQ

**Simular muda alguma conta?** Não. Só **Aplicar ao financeiro** grava, e só com `financeiro:gerir`.

**Qual a diferença entre o Planejador e Pagamentos em lote?** O Planejador é para **decidir** (o que
acontece se eu mudar datas e prioridades). Pagamentos em lote é para **executar**: escolher quais contas
cabem no saldo de agora e pagá-las de uma vez.
