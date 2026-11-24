# Pool de recursos — levantamento para decidir

Data: 24/11/2026. Origem: áudios e prints do Ryan (pasta `Pool de recursos`). Este documento é o ponto de partida para o
Ryan decidir, com o Claude dele, como a parte que falta deve funcionar. As decisões voltam para cá e aí implementamos.

## 1. O que foi pedido

Nas palavras do Ryan, o "checkmate" do planejamento é administrar os recursos entre projetos:

1. **Alerta ao montar e aprovar o cronograma.** Se eu planejo o João Vitor no dia 15 e ele já está em outro projeto no dia
   15, o sistema avisa — e eu já planejo para começar no dia 17.
2. **Alerta durante o controle.** A Mireli está no projeto X de 12 a 14 e no Y de 15 a 16. O X atrasou e ela precisou do dia
   15: isso empurra o Y. O sistema deve sinalizar esse efeito em cascata.
3. **Uma tela por pessoa** (o "Planejador de Equipe" do MS Project, print 1): uma faixa por projetista com tudo o que ela faz
   em todos os projetos, para enxergar e empurrar as coisas com facilidade.

## 2. O que o SenaHub já tem

- **Carga da equipe em `/recursos`**: para cada pessoa, horas planejadas × horas disponíveis, somando todos os projetos com
  cronograma aprovado. Desconta férias, abono e feriado. Mapa de calor por dia, semana ou mês, e lista de sobrecargas.
- **Sugestão de um clique** em cada sobrecarga: "Atrasar a tarefa N dias úteis" ou "Passar para Fulano" (alguém da mesma
  disciplina que está livre). Nada muda de data sozinho — o sistema só sugere.
- **Cronograma em rascunho** aparece à parte, em cinza, sem somar na carga dos outros.
- **Aviso de férias × alocação**: ao aprovar férias ou abono, quem gere recursos é avisado se a pessoa tinha trabalho no período.
- **NOVO (24/11/2026) — item 1 do pedido**: na faixa do cronograma de cada projeto aparece "N conflitos de recurso". Abre a
  lista: "Ensaio PJ · semana de 30/11: 48h para 40h disponíveis (+8h) — Aqui: 40h · 261079: 8h", com "Ver na tabela" (filtra
  as linhas deste projeto que causam a carga) e o link para Recursos. Em rascunho, o projeto conta como se já estivesse
  aprovado ("e se eu aprovar assim?"). Ao clicar em Aprovar, a confirmação cita os conflitos e pergunta "Aprovar assim
  mesmo?" — não bloqueia. Num projeto já aprovado o mesmo chip aparece quando um atraso cria um conflito, então o item 2
  já é visível para quem abre o projeto; o que falta dele é o AVISO ativo (seção 3.2).

## 3. O que falta decidir

### 3.1 Antes de tudo: a régua é hora, não "pessoa a 100%"

No MS Project do print, a pessoa está a 100% na tarefa. No SenaHub, cada pessoa numa linha da EAP tem **horas previstas**, e
o sistema espalha essas horas pelos dias úteis da tarefa. Consequências:

- Pessoa atribuída **sem horas** não gera carga nem conflito (o verificador já avisa "atribuição sem horas").
- A comparação é **por semana** (horas da semana × capacidade da semana). Um choque de um dia só dentro de uma semana folgada
  não aparece. Exemplo: 32 h no X e 8 h no Y na mesma semana = 40 h, sem conflito, mesmo que as duas caiam na quarta.

**Pergunta A**: a semana basta, ou o alerta precisa ser por dia? (Por dia é possível — o motor já distribui as horas dia a
dia —, mas avisa muito mais, inclusive em casos que a pessoa resolve sozinha mudando a ordem do que faz na semana.)

**Pergunta B**: vamos combinar que toda atividade da casa recebe horas? Se a equipe preferir "100% na tarefa" como no MS
Project, dá para ter um atalho: atribuir pessoa já preenche horas = duração × jornada do dia.

### 3.2 Aviso ativo do efeito em cascata (item 2)

Hoje o conflito aparece quando alguém abre o projeto. Falta avisar quem precisa saber sem abrir.

- **Pergunta C — quando dispara?** (a) no momento em que a mudança acontece (alguém atrasou uma tarefa, mudou a Data de
  Status, replanejou); (b) numa rotina diária (ex.: 07:00) que compara com o dia anterior; (c) as duas.
- **Pergunta D — quem recebe?** Coordenação do projeto atrasado, coordenação do projeto empurrado, a própria pessoa, quem
  gere recursos?
- **Pergunta E — o aviso só informa, ou já traz a sugestão** ("Atrasar o Y em 1 dia" / "Passar para Fulano") com um clique?
- **Pergunta F**: avisar só quando o conflito é NOVO (não existia ontem), para não repetir todo dia?

### 3.3 Tela por pessoa — o Planejador de Equipe (item 3)

- **Pergunta G — escala**: dias (como o print), semanas ou as duas com zoom?
- **Pergunta H — só ver, ou também mexer?** Arrastar uma barra para o lado muda a data da tarefa no cronograma do projeto.
  Se aquele cronograma já está aprovado, a mudança vira desvio da linha de base. Arrastar para outra pessoa troca o
  responsável. Começar só vendo e com as sugestões de um clique é mais seguro; arrastar é a segunda etapa.
- **Pergunta I — o que cada barra mostra**: código do projeto + nome da tarefa? Cor por projeto ou por disciplina? Marcar em
  vermelho os dias/semanas acima da capacidade?
- **Pergunta J — quem aparece**: todo mundo com recurso ativo, filtrável por disciplina e projeto (como `/recursos`)? E os
  cronogramas em rascunho, aparecem em cinza?
- **Pergunta K — onde fica**: uma aba nova em `/recursos` ("Por pessoa") ou dentro do Planejamento?
- **Pergunta L**: as "Tarefas não atribuídas" do print (linhas sem ninguém) entram numa faixa no fim, como no MS Project?

## 4. Sugestão de ordem

1. Responder A e B (a régua) — muda o que todo o resto calcula.
2. Tela por pessoa só de leitura (G, I, J, K, L), reaproveitando a carga que `/recursos` já calcula.
3. Aviso ativo do efeito em cascata (C, D, E, F).
4. Arrastar na tela por pessoa (H), se a leitura mostrar que faz falta.

## 5. Para o Claude que for implementar (referências no código)

- Carga da equipe: `cargaDaEquipe` em `src/modules/planejamento/recursos-queries.ts` (aprovados pelas linhas, rascunho à
  parte, `contarComoAprovado` para o "e se eu aprovar").
- Distribuição por dia e sobrecarga por semana: `distribuirHoras`, `parcelasDasLinhas`, `detectarSobrecargas` em
  `src/modules/planejamento/recursos.ts` (D18: só alerta, nunca nivela).
- Conflitos de um projeto (o alerta novo): `src/modules/planejamento/conflitos-recursos.ts` (puro) +
  `conflitosDeRecursosDoProjeto`; tela em `src/components/planejamento/conflitos-recursos-faixa.tsx`.
- Sugestões de correção: `src/modules/planejamento/sugestoes-recursos.ts` e `recursos-actions.ts`
  (`sugestoesDaSobrecarga`, `aplicarSugestaoRecurso`).
- Tela `/recursos`: `src/components/recursos/recursos-matrix.tsx` e `carga-planejada-view.tsx`; heatmap por dia em
  `src/modules/planejamento/heatmap-recursos.ts`.
- Aviso parecido que já existe (modelo para o item 2): `src/modules/planejamento/impacto-ausencia-service.ts`.
- Decisões anteriores: `docs/superpowers/specs/2026-09-23-planejamento-motor-cronograma.md` (D8, D17, D18, D23) e
  `docs/superpowers/specs/2026-11-02-lote2-recursos-leitura-design.md`.
