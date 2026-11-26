# Pool de recursos, parte 5: Planejamento geral

Data: 26/11/2026. Branch `feat/pool-recursos`. Fontes: decisões 7 e 10 do Ryan
(`specs/2026-11-25-pool-de-recursos-decisoes-ryan.md`), item 3.4 de `docs/melhoria-pool-de-recursos.md` e §3.6 e §4 de
`specs/2026-11-25-pool-de-recursos-design.md`.

## O que entra

- `/planejamento` ganha duas abas: **Planejamento geral** (`/planejamento/cronograma`) e **Projetos individuais**
  (`/planejamento`, os cards de hoje). O "Cronograma geral" de hoje vira o Planejamento geral: mesma rota, tela nova.
- Só leitura (decisão 10). Clicar no nome do projeto abre o cronograma dele; clicar numa pessoa abre a faixa dela em
  Recursos → Por pessoa (`?pessoa=&de=`), no primeiro dia de conflito, ou no início da tarefa.
- Nasce com os projetos RECOLHIDOS: uma linha de grupo por projeto (código, nome, selo Aprovado / Rascunho / Em revisão,
  período, barra-resumo, quantos dias de conflito). Abrir o grupo mostra as linhas da EAP.
- Escolha **Tabela | Gantt | Tabela e Gantt** (começa em Tabela e Gantt) e a escala Dias | Semanas | Meses.
- Colunas da tabela: EDT, Nome da tarefa, Responsável, Início, Término.
- Responsável: todos os nomes, separados por vírgula. Quem está em conflito na tarefa aparece em vermelho com "●" (marca
  que não depende da cor) e os dias no title e no texto para leitor de tela.
- Gantt: o dia em conflito fica hachurado em vermelho na barra da tarefa. Rascunho em cinza tracejado. Aprovado na cor do
  projeto.
- Filtros (decisão 10): projeto (vários), disciplina, pessoa, cronograma (aprovado ou rascunho) e período. Contador "N de M
  projetos".

## Regras

- **Quem vê (decisão 7):** quem vê Recursos (`recursos:ver`, com o piso de sócio) e vê as datas do planejamento. A aba some
  para os outros. Isso tira o antigo Cronograma geral de quem tinha `planejamento:ver` sem `recursos:ver`.
- **Projetos:** os mesmos da carga de Recursos. Entram os projetos com EAP em andamento e os aprovados. Projetos
  cancelados e arquivados ficam fora.
- **Conflito da linha:** reaproveita as sobrecargas por dia de `cargaDaEquipe` (`diario.comRascunhos`), no período escolhido.
  - Linha de **rascunho:** a pessoa fica vermelha no dia em que a carga total passa da jornada. A conta soma aprovados e
    rascunhos (decisão J: o rascunho enxerga tudo).
  - Linha de **aprovado:** a pessoa fica vermelha só quando os aprovados sozinhos passam da jornada (decisão J: o aprovado
    não ganha alerta por rascunho).
- **Filtro:** casa nas linhas sem filhos (as que têm pessoa e data). Cada linha que casa leva junto os agrupamentos acima
  dela. Projeto sem linha que case some da lista.
  - Período: a linha cruza a janela.
  - Disciplina: o nome da disciplina da linha.
  - Pessoa: a pessoa é responsável pela linha.
- **Período:** vai na URL (`?de=&ate=`), porque a conta de conflito depende dele. Padrão: da segunda-feira desta semana até
  12 semanas depois. Janela de no máximo 1 ano. Os outros filtros ficam no navegador, sem nova ida ao servidor.

## Código

- `modules/planejamento/planejamento-geral.ts` (puro + teste): período, conflito por linha, montagem das linhas do
  projeto (EDT pela grade da EAP), filtro e opções dos filtros.
- `modules/planejamento/planejamento-geral-queries.ts`: busca os projetos e as linhas, roda o motor uma vez por projeto e
  repassa os planos a `cargaDaEquipe` (opção nova `planos`, para não agendar duas vezes).
- `components/planejamento/planejamento-geral-view.tsx`, `abas-planejamento.tsx`.
- Sai `cronograma-geral-view.tsx`, `gantt-mini.tsx` e `cronogramaProjetosAtivos`.
- Smoke `npm run smoke:planejamento-geral`, manual, novidades, índice de busca e CLAUDE.md.
