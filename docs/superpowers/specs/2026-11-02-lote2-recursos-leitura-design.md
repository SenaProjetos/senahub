# Lote 2 — `/recursos` vira tela de leitura (desenho)

Origem: reunião de análise do Hub, 26/10/2026 (roadmap em `2026-10-26-reuniao-hub-roadmap.md`, Lote 2).
Conversa de desenho com o dono em 2026-11-02. O que está marcado **(dono)** foi decidido por ele; **(minha decisão)** é escolha de quem desenhou, para o dono conferir.

## Intenção

`/recursos` hoje mistura duas coisas: um lugar onde se digita alocação de pessoa por projeto (`Alocacao`, % e período) e um lugar onde se enxerga a carga das equipes. A atribuição de verdade já é feita na EAP (cronograma). O dono quer que `/recursos` seja **só leitura**: um resumo geral de capacidade × carga por pessoa, alimentado pelas EAPs, com a sobrecarga em vermelho. Quem vai olhar a tela decide a partir dela; quem quer mudar a carga vai à EAP.

## O que fica

- **As quatro vistas (dono):** Matriz, Heatmap, Carga real e Carga planejada, todas só de leitura. A Matriz continua com pessoas nas linhas e projetos nas colunas, mas passa a mostrar apenas a carga vinda das EAPs aprovadas.
- **Cadastro do recurso (dono):** criar e editar o recurso continua na tela — capacidade (`Recurso.capacidade`), cor, ativo e custo/hora (custo/hora só para quem vê o financeiro; edita quem tem `financeiro:gerir`, como hoje). É cadastro da pessoa, não alocação.
- **Sobrecarga em vermelho e janela de análise:** sem mudança. A régua de capacidade continua a atual (100% = tudo o que a pessoa dedica a projeto; o multiplicador `capacidade` encolhe só as horas dela).
- **Ausências:** o ícone de férias/abono no Heatmap e o link `?de=&ate=` que vem do aviso de ausência continuam.
- **Rascunho da EAP (dono):** continua à parte, sem somar nos totais, como hoje (`rascunho` em `cargaDaEquipe`).
- **Permissão:** `recursos:ver` abre a tela. `recursos:gerir` continua existindo para o cadastro do recurso (capacidade/cor/ativo).

## O que sai

- **Alocação manual por projeto (dono):** criar, editar e remover alocação (`AlocacaoDialog`, `salvarAlocacao`, `removerAlocacao` na tela) e o "Rebalancear" (`RebalancearDialog`), que mexe em alocação. As alocações já gravadas **somem da tela** (dono) e ficam no banco, sem apagar nada.
- **Habilidades (dono):** o botão/diálogo de habilidades da pessoa, o filtro por habilidade, `NecessidadesProjeto` (necessidades de habilidade por projeto no filtro de projeto) e as colunas/etiquetas de habilidade. As habilidades continuam existindo no RH (`rh/habilidades`, ficha da pessoa); só deixam de aparecer e de ser editadas em `/recursos`.
- **Aplicar sugestão da sobrecarga (minha decisão):** em "Carga planejada", "Ver sugestões" calcula alternativas (atrasar atividade, passar para outra pessoa) e "Aplicar" muda a EAP. "Aplicar" é escrita e sai da tela (`aplicarSugestaoRecurso` deixa de ser chamada de lá). As sugestões em si ficam como **leitura**, com um link para a EAP do projeto onde a correção se faz.

## Projeto sem cronograma aprovado (dono)

Hoje, projeto SEM cronograma aprovado entra na carga pela alocação digitada; só o aprovado usa a EAP (D17). Sem a alocação digitada, quem só tem projetos sem cronograma aprovado apareceria com 0% e nunca ficaria vermelho. Decisão do dono: **mostrar um sinal**. Nas quatro vistas, a pessoa que tem projeto ativo sem cronograma aprovado (membro da equipe do projeto, ou com card aberto nele) ganha um aviso discreto "projeto sem cronograma aprovado" com os nomes dos projetos, **sem somar horas** e sem pintar sobrecarga. Quem fica sem nenhum sinal é só quem de fato não tem projeto nem plano. O aviso é de leitura e aponta para a EAP/cronograma do projeto.

Consequências para o construtor: a parte digitada sai de `matrizRecursos` (`alocadoHoje`, `superalocado`), do Heatmap (`vigentes()`, `percentualAlocadoNoDia`, `picoDoMes`, `colunasMensais`, que passam a usar só a carga semanal calculada) e a coluna "Alocado hoje" passa a significar carga calculada hoje; as colunas mensais do Heatmap derivam da carga semanal das EAPs aprovadas (horizonte de 12 semanas, como já é; depois disso, sem dado).

## Filtros novos (dono) — só de leitura

- **Busca por nome** da pessoa.
- **Disciplina** (do catálogo): mostra quem tem carga naquela disciplina nas EAPs (a disciplina da linha da EAP, `disciplina.catalogo.nome`, já lida em `recursos-queries.ts`).
- **Só sobrecarregados:** esconde quem está dentro da capacidade na janela escolhida.
- Continuam: filtro por **projeto** e a **janela** (período). O filtro por habilidade sai.
- Setor ficou fora de propósito (minha decisão): `Setor` não concede permissão nem define vínculo.
- Todos funcionam nas quatro vistas, no cliente sobre a lista já carregada, como o filtro de projeto de hoje.

Comportamento exato (minha decisão, a partir do revisor):
- **Disciplina:** só escolhe QUEM aparece (pessoas com carga naquela disciplina nas EAPs aprovadas). Não recalcula horas, percentuais nem cores da linha. Rascunho da EAP não conta. O DTO da pessoa ganha a lista de disciplinas em que ela tem carga.
- **Carga real:** é feita de horas do ponto (`SessaoTrabalho`) sem quebra por projeto ou disciplina. Nela, projeto e disciplina escolhem quem aparece (pelo planejado) e as horas reais da pessoa não são filtradas. Nome e "só sobrecarregados" valem normalmente.
- **Só sobrecarregados:** uma regra para as quatro vistas — o pico dentro da janela escolhida acima da capacidade (a mesma de `superalocadoNaJanela`). Em Carga real, horas registradas acima das disponíveis em alguma semana da janela.

## Fora do escopo / não-metas

- Nenhuma migração, nenhuma tabela apagada. `Alocacao` fica no banco e as ações `salvarAlocacao`/`removerAlocacao` não precisam ser apagadas neste lote (decisão do builder: remover só se nada mais as chamar).
- Não muda o motor de cronograma nem a EAP.
- Não troca a regra de capacidade nem o cálculo da carga.
- Anti-objetivo: a tela não pode continuar permitindo, por nenhum caminho (menu de contexto, botão escondido, URL), gravar alocação ou mexer na EAP.

## Pontos para o construtor decidir

- **Quem ainda lê `Alocacao` (minha decisão):** `impacto-ausencia-service.ts` (aviso de férias × alocação) e `aprovarPlano` (`alocacoesSubstituidas` em `planejamento/service.ts`) leem/contam alocação manual. **Não mexer neles neste lote.** Limitação conhecida: o aviso de férias pode contar alocação oculta que ninguém mais vê nem remove. O construtor registra isso no relatório e troca qualquer texto ao usuário que mande "ajustar a alocação em Recursos" por "ajustar na EAP".
- **Matriz sem alocação digitada:** as colunas de projeto continuam e mostram só a carga calculada (`calculadas`, que já existe); o sinal de projeto sem cronograma aprovado vai na célula/linha da pessoa.
- **Cadastro (minha decisão):** `recursos:gerir` guarda criar/editar recurso (capacidade, cor, ativo); custo/hora segue `financeiro:gerir`. Quem tem só `recursos:ver` não vê controle de edição algum, nem no `...` da linha nem no menu de contexto. `salvarRecurso` não muda.
- **Código morto:** remover `AlocacaoDialog`, `RebalancearDialog`, os diálogos de habilidade e `necessidades-projeto.tsx` (se nada mais o usar) e podar imports/props.
- **Manual (`docs/manual/projetos/recursos.md`):** reescrever para a tela de leitura e remover habilidades/alocação; atualizar `novidades.md` e o índice de busca do manual.
- **Verificação:** testes de unidade dos filtros puros (nome, disciplina, só sobrecarregados) e do corte de leitura; tsc; verificação em tela a 390×844 e 1366×768 com o menu aberto (CLAUDE.md), perfil com `recursos:ver` sem `gerir` não vê nenhum botão de edição.
