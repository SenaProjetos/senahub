---
titulo: Ponto (registro de jornada)
descricao: Autoatendimento de ponto — registre a jornada por projeto, reunião ou sem projeto e veja o espelho do mês.
resumo: Cada colaborador registra a jornada por projeto, reunião interna, reunião externa ou sem projeto; o espelho consolida as horas e gestores veem o rateio mensal.
tags: [ponto, jornada, batida, sessão, reunião, espelho, banco de horas, rateio]
palavras-chave: [ponto, registrar ponto, bater ponto, jornada, sessão, projeto, reunião interna, reunião externa, sem projeto, espelho, banco de horas, rateio]
sinonimos: [registro de jornada, controle de horas, timesheet, folha de ponto]
---

# Ponto (registro de jornada)

## Objetivo

Registrar a jornada de trabalho por **sessões com uma alocação**, gerando o **espelho do mês**
(horas) e a base de banco de horas e rateio.

## Quando utilizar

- No início e no fim de cada período de trabalho.

## Como acessar

- Menu → **Ponto** (`/ponto`). Autoatendimento de **todos os internos** (admin,
  supervisor, administrativo, clt, estagiário, projetista_pj, freelancer). Cliente não acessa.

## Como funciona

1. **Iniciar sessão:** escolha a alocação e registre o início. Além dos projetos em andamento,
   há as opções **Sem projeto**, **Reunião interna** e **Reunião externa**.
2. Enquanto houver uma **sessão aberta**, o sistema mostra desde quando e em qual alocação você
   está trabalhando.
3. **Encerrar sessão** para fechar o período.
4. O **espelho do mês** consolida suas horas do mês corrente.

### Tarefa da sessão (opcional)

Quando você escolhe um **projeto**, aparece um segundo campo, **Tarefa (opcional)**, com as
suas tarefas em aberto nele — só as do período, uma lista curta. Escolher uma tarefa registra
em qual delas você trabalhou; não escolher funciona como sempre. Reunião e "sem projeto" não
têm tarefa. Ao trocar de alocação você pode trocar a tarefa, e ao voltar do descanso ela é
mantida. Corrigir o horário de um dia no espelho preserva a tarefa da entrada.

**No celular** (Início e Ponto), a tarefa aparece numa linha **Tarefa · opcional** logo abaixo da
atividade atual — só quando o projeto escolhido tem tarefa sua em aberto. Toque nela para escolher.
Com a jornada parada, a tarefa vai junto quando você inicia ou volta da pausa; com a jornada
rodando, trocar de tarefa fecha o tempo da anterior e começa o da nova na hora, sem mudar o total
do dia. Trocar de projeto pelos atalhos continua sendo um toque só — a tarefa volta para "Sem
tarefa" e você escolhe outra se quiser.

### Reunião ligada a um projeto

Ao escolher **Reunião interna** ou **Reunião externa**, aparece o campo **Projeto da reunião
(opcional)**. Escolhendo um projeto, o tempo da reunião entra no custo dele como **reunião** — fica
separado das horas de disciplina. Sem projeto, a reunião continua sendo custo geral da empresa. O nome da
sessão mostra os dois: "Reunião externa · 260027 Casa Alto Padrão". No celular, o atalho recente de uma
reunião ligada a projeto aparece com o nome do projeto.

### Quem pode marcar horas em um projeto

Só marca horas num projeto quem é **da equipe**, **responsável por uma disciplina** dele ou **tem um card
aberto** nele. Quem não está em nenhum dos três recebe o aviso "Você não faz parte deste projeto" — peça à
coordenação para te incluir.

### Tarefa obrigatória para quem tem 2 ou mais disciplinas

Quem é responsável por **mais de uma disciplina** no mesmo projeto precisa escolher a **tarefa** em que vai
trabalhar: é ela que diz em qual disciplina as horas entram. O campo muda para **Tarefa (obrigatória)** e o
botão de iniciar fica desabilitado até a escolha. Com uma só disciplina, o sistema usa essa disciplina sozinho
e a tarefa continua opcional. Corrigir o dia no espelho nunca trava: sem tarefa, as horas ficam sem disciplina.

## Minhas horas

Aba **Minhas horas** (`/ponto/horas`): suas horas registradas no período escolhido (7, 14 ou 30 dias,
mês atual, mês anterior ou intervalo livre), com total, média por dia com registro e um gráfico por
projeto. Só mostra as suas horas. O card **Minhas horas** no Início traz os últimos 14 dias e abre esta aba.

## Para gestores (RH)

- Quem tem a permissão de ver o rateio vê também o **rateio do mês** — distribuição das horas por projeto,
  reunião interna, reunião externa e sem projeto. Os **valores em reais** só aparecem para o administrador,
  os sócios e quem recebeu a permissão de custo; os demais veem só as horas.
- O botão **Gerir fechamentos** abre a tela **RH → Rateio de horas** (`/rh/rateio`), onde cada mês é fechado,
  reaberto ou recalculado.

### Rateio de horas: fechar o mês

Em **RH → Rateio de horas** aparece cada mês com a situação (**Em curso**, **Aberto**, **Fechado — cálculo
novo** ou **Fechado — cálculo antigo**), as horas e o custo.

- **Fechar mês** congela o custo das horas. Só fecha mês que já terminou; o mês em curso é só estimativa.
- **Reabrir com motivo** apaga o custo congelado (o mês volta a ser calculado com o ponto de agora) e guarda o
  motivo, quem reabriu e quando. O motivo tem no mínimo 10 caracteres.
- **Recalcular no cálculo novo** vale só para mês fechado no cálculo antigo (antes de outubro de 2026): refaz o
  custo com encargos, também com motivo.
- Se o ponto de um mês fechado for corrigido depois, a linha mostra **Alterado depois do fechamento** com a
  diferença de horas (e de reais, para quem vê custo). O valor congelado não muda sozinho: reabra para refazer.
- **Ver detalhes** mostra as horas por projeto e disciplina e o histórico de fechar, reabrir e recalcular.
- Quem só **vê** o rateio não fecha nada: fechar, reabrir e recalcular são da gestão de RH.

## Regras de negócio

- Cada sessão fica vinculada a um **projeto** ou a uma das categorias gerais: **Sem projeto**,
  **Reunião interna** ou **Reunião externa**.
- O espelho é por **mês corrente**; o histórico alimenta o **banco de horas** (fechado pela
  administração — ver [RH — administração](rh-admin.md)).

## Funcionalidades relacionadas

- [RH — autoatendimento](rh-autoatendimento.md) · [RH — administração](rh-admin.md) · [Recursos](../projetos/recursos.md)

## FAQ

**Esqueci de encerrar a sessão.** Procure a administração do RH para ajuste (ponto manual).

**Posso registrar uma reunião?** Sim. Escolha **Reunião interna** ou **Reunião externa** na
lista de alocação antes de iniciar a jornada, voltar do descanso ou trocar a alocação. As horas
ficam separadas no rateio mensal.
