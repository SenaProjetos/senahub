---
titulo: Avisos do Financeiro
descricao: O que o sistema avisa sozinho — e-mail de cobrança ao cliente antes, no dia e depois do vencimento, e o sino de contas a pagar vencendo — e como ligar, desligar e evitar aviso repetido.
resumo: Todo dia às 8h o sistema avisa o cliente (e-mail) e a equipe (sino) sobre vencimentos. Cada aviso sai uma vez só por conta e vencimento. Os e-mails de antes e no dia vêm desligados até você ligar em Configurações do financeiro (Avisos de vencimento).
tags: [financeiro, avisos, cobrança, vencimento, e-mail, notificação, contas a pagar]
palavras-chave: [aviso de vencimento, cobrança ao cliente, lembrete de pagamento, contas a pagar vencendo, aviso repetido, desligar aviso, e-mail de cobrança, inadimplência]
sinonimos: [lembrete de vencimento, cobrança automática, alerta de conta a pagar, notificação de vencimento]
---

# Avisos do Financeiro

## Objetivo

Ninguém esquecer de cobrar o que vence nem de pagar o que está para vencer. O sistema avisa sozinho todo dia às
**8h** — e avisa **uma vez só**.

## Onde ligar e desligar

**Financeiro → Mais → Configurações → Avisos de vencimento** (exige `financeiro:gerir`). Quem muda ali decide se o **cliente**
recebe e-mail, por isso a tela é de quem gere o financeiro.

## E-mail de cobrança ao cliente

Vai para o e-mail cadastrado do cliente, só para **recebíveis em aberto** (previstos) de projeto, contrato e
faturamento. Transferência entre contas, previsão do cronograma e recebível sem e-mail de cliente não geram aviso.

| Aviso | Quando | Padrão |
| --- | --- | --- |
| **Antes do vencimento** | Alguns dias antes (você escolhe de 1 a 15) | **Desligado** |
| **No dia do vencimento** | No dia | **Desligado** |
| **No dia seguinte** | Um dia depois, avisando que o pagamento ainda não foi registrado | **Ligado** (é o que o sistema já mandava) |

**Licitação fica de fora.** Conta a receber de projeto de licitação, ou lançada na categoria **Licitações** (ou numa
filha dela), não recebe nenhum desses e-mails: órgão público paga pelo rito do contrato. Para cobrar também essas
contas, ligue **Cobrar também projetos de licitação** em Avisos de vencimento.

> Os dois e-mails novos vêm desligados de propósito: são mensagens **para fora da empresa**. Ligue quando quiser
> começar a mandá-los. O texto pode ser ajustado em **Configurações → E-mails** (modelos "Lembrete de vencimento" e
> "Lembrete de pagamento").

## Sino de contas a pagar vencendo

Para quem **lançou a conta**, **3 dias** e **1 dia** antes do vencimento — numa notificação só por dia, somando o que
vence amanhã e o que vence em 3 dias ("2 vencem amanhã (R$ 1.200,00) e 1 vence em 3 dias (R$ 800,00)").

- Quem lançou a conta mas não vê o financeiro (ou já saiu) não recebe: o aviso vai para **quem gere o financeiro**.
- Despesa **aguardando aprovação** não entra (ainda não dá para pagar).
- As compras de um **cartão de crédito** entram como **uma conta só por fatura**: o que vence é a fatura.
- Cada pessoa escolhe se quer receber, em **Preferências → Notificações → Contas a pagar vencendo**.

## "Uma vez só"

Cada aviso é identificado por **conta + tipo + destinatário + data de vencimento** e é reservado **antes** de ser
enviado. Por isso um job que roda de novo, ou duas instâncias do sistema, não mandam o mesmo aviso duas vezes. Se o
e-mail **não saiu** (o servidor de e-mail falhou), a reserva é devolvida e o sistema tenta na rodada seguinte. Se você
**mudar o vencimento** da conta, o aviso vale de novo para a data nova.

## Resumo semanal

Toda segunda, o resumo da semana traz o total a receber e a pagar em aberto. **Transferência entre contas nunca
entra**: não é receita nem despesa.

## Perguntas frequentes

**Liguei o aviso e o cliente não recebeu.** Confira se o cliente tem e-mail cadastrado e se a conta ainda está em
aberto; se o servidor de e-mail (SMTP) não está configurado, nenhum e-mail sai.

**O cliente recebeu duas vezes.** Não deveria: se acontecer, avise o suporte — o registro de avisos enviados é o que
impede o duplicado.

**Quero parar de receber o sino de contas a pagar.** Preferências → Notificações → Contas a pagar vencendo.
