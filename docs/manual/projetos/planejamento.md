---
titulo: Planejamento (EAP e cronograma)
descricao: Monte o cronograma do projeto como no MS Project — duração, dependências e calendário geram as datas; aprove a linha de base, acompanhe e replaneje.
resumo: Cada projeto tem uma EAP (lista de tarefas em árvore) com duração, dependências e responsáveis. O sistema calcula as datas em dias úteis, mostra o caminho crítico, congela a linha de base ao aprovar, e permite acompanhar (datas reais, Data de Status, saúde) e replanejar com motivo.
tags: [planejamento, eap, cronograma, gantt, linha de base, baseline, caminho crítico, dependência, marco, data de status, saúde do cronograma, replanejar, reagendar, ms project, gantt de controle, tabela do cronograma, escala, editar na célula, menu da linha, recuar, avançar, predecessoras]
palavras-chave: [planejamento, eap, wbs, cronograma, gantt, linha de base, baseline, BL-00, aprovar cronograma, replanejar, reagendar, caminho crítico, folga, dependência, predecessora, latência, marco, restrição de data, alfinete, bloqueio, data de status, apurar, saúde do cronograma, atualizar tarefa, cronograma geral, TI, II, TT, IT, id da tarefa, número da linha, inserir tarefa, excluir tarefa, recolher, expandir, nível, subtarefa, agrupamento, gantt de controle, atalho, zoom, escala de tempo, duração zero, editar na tabela]
sinonimos: [cronograma de projeto, gantt, wbs, ms project, project, plano do projeto, linha de base do cronograma]
---

# Planejamento (EAP e cronograma)

## Objetivo

Montar o **cronograma de cada projeto** e deixar o sistema **calcular as datas**, do jeito do
MS Project: você diz **quanto dura** cada tarefa e **do que ela depende**; o sistema conta só
**dias úteis**, pula feriados, mostra a **folga** de cada tarefa e destaca o **caminho crítico**.

Depois de montado, o cronograma passa por um caminho definido: **aprovar** (congela a *linha de
base*), **acompanhar** (datas reais, Data de Status, saúde) e **replanejar** — sempre com o
combinado original guardado para comparar.

## Quando utilizar

- Para montar, aprovar e acompanhar o cronograma de um projeto.
- Para ver o desvio entre o combinado (linha de base) e o que está acontecendo.
- Para dar a cada atividade um responsável e horas previstas (ver
  [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md)).

## Quando não utilizar

- Para o trabalho do dia a dia de cada pessoa, use o quadro de [Tarefas](tarefas.md). As
  atividades do cronograma aprovado **geram os cards** lá automaticamente.

## Como acessar

- Menu → **Gestão** → **Planejamento** (`/planejamento`). Exige `planejamento:ver`.
- A tela lista os **projetos aos quais você tem acesso**, em cartões com o número de tarefas, o
  período (início–fim) e o **progresso**. Projeto sem EAP mostra **Iniciar planejamento**.
- Clique num projeto para abrir o cronograma dele (`/planejamento/{projeto}`).
- O botão **Cronograma geral** abre a visão de todos os projetos lado a lado (veja abaixo).

> **Ver × editar.** Quem tem só `planejamento:ver` **vê a estrutura** do planejamento — as tarefas, as
> pessoas, a duração e o avanço —, **sem nenhuma data**: não aparecem o Gantt, os prazos, a linha de base,
> o Cronograma geral, a Saúde, o Valor Agregado nem a exportação. Ver as datas exige montar (`planejamento:gerir`),
> ver o cronograma (`cronograma:ver`) ou acompanhá-lo (`cronograma:executado` ou `cronograma:aprovar`).
> Montar e editar exige `planejamento:gerir`. A tabela de permissões está no fim da página.

## O caminho de um cronograma

| Etapa | O que acontece | Onde |
| --- | --- | --- |
| **1. Rascunho** | Você monta a EAP: tarefas, durações, dependências, responsáveis. Nada vale ainda, e nenhum card é criado. | Editor da linha |
| **2. Início do projeto** | Define a data que ancora o cronograma. | **Definir início do projeto** |
| **3. Aprovar** | Congela a **linha de base BL-00**, cria os cards de quem está escalado. | **Aprovar cronograma** |
| **4. Acompanhar** | Informa datas reais, a Data de Status, e confere a saúde. | **Atualizar tarefa**, **Apurar** |
| **5. Replanejar** | Nova versão da linha de base (BL-01, BL-02…), com motivo. | **Replanejar** |

## Como o cronograma calcula as datas

Se você usa o MS Project, isto será familiar:

| No MS Project | No SenaHub |
| --- | --- |
| Tarefa · Tarefa de resumo · Marco | **Atividade** · **Agrupamento** · **Marco** |
| Duração | **Duração**, em **dias úteis** |
| Predecessoras (TI, II, TT, IT) e latência | **Depende de**: FS, SS, FF, SF, com **atraso** em dias úteis |
| Restrições de tarefa | **Restrição de data** (6 tipos) — marcada com o **alfinete** |
| Salvar linha de base | **Aprovar cronograma** (BL-00) e **Replanejar** (BL-01…) |
| Data de status | **Data de Status** (botão **Apurar**) |
| Atualizar projeto → Reprogramar trabalho não concluído para iniciar após | **Apurar** faz isso sozinho (veja abaixo) |
| Caminho crítico e folga total | **Caminho crítico** (folga 0) e **folga** |
| Atualizar tarefas | **Atualizar tarefa** (início e término reais) |
| Recursos, trabalho | **Recursos** da linha: pessoa ou perfil, papel e **horas previstas** |
| Custo | **Custo previsto** (só para quem vê o financeiro) |
| Valor agregado (COTA, COTR, CRTR) | [Valor Agregado](valor-agregado.md) (VP, VA, CR) |

- **Um calendário só, o da empresa:** segunda a sexta, menos os **feriados cadastrados**
  (nacionais, estaduais e municipais — ver [Configurações](../sistema/configuracoes.md)). Férias e
  jornada individual **não movem datas**: aparecem como aviso na carga da equipe.
- **A duração manda.** Início e fim de uma tarefa com predecessora saem da **duração + dependência +
  calendário**, e não de datas digitadas.
- **Salvar recalcula.** Toda mudança — duração, dependência, restrição, linha nova ou excluída,
  data real — reagenda o projeto inteiro na hora, como no MS Project. O botão **Reagendar** continua
  lá para conferir, ou depois que alguém cadastra um **feriado novo** (o calendário muda sem ninguém
  mexer no cronograma).
- **Agrupamento:** as datas de uma linha com filhas são o **menor início** e o **maior término**
  delas, e o **progresso** é a média ponderada pelas **horas previstas** (sem horas, pela
  duração). Nada disso se digita.

## 1. Montar a EAP (rascunho)

### Criar as linhas

- **Nova tarefa** — abre o editor. Para uma subtarefa, escolha a linha em **Subtarefa de**; a
  numeração em árvore (1, 1.2, 1.2.3) é recalculada sozinha.
- **Gerar EAP das disciplinas** — cria uma tarefa para cada disciplina do projeto que ainda não
  tem uma (o fim vem do prazo da disciplina). É de **mão única**: disciplina nova entra na EAP, mas
  criar uma linha na EAP **não** cria disciplina.
- **Herdar responsáveis** — preenche, em cada linha ainda **sem ninguém**, os responsáveis da
  disciplina dela. O que já tem gente não é tocado.

### O editor da linha

Clique numa linha (ou em **Nova tarefa**). Quem tem só `planejamento:ver` não abre o editor.

- **Nome** e **Marco** (data pontual, sem duração — como o marco do MS Project). A opção de marco só
  aparece em atividade: linha de disciplina, pacote ou agrupamento mantém o tipo que tem.
- **Duração (dias úteis)** — como no Project, você informa quanto a tarefa dura; **início e término
  são calculados** (dependências + calendário, feriados incluídos) e aparecem logo ao lado. Aceita
  meio dia (`0,5`); meio dia ainda ocupa um dia no calendário. Para prender a tarefa numa data, use
  **Restrição de data** (abaixo) — ao criar, dá para já informar **Não iniciar antes de**.
- **Agrupamento** (linha com subtarefas): não tem duração própria — início, término e duração vêm das
  atividades dentro dele, e ele não vira marco.
- **Disciplina** (opcional).
- **Fase** (opcional): aparece quando a disciplina escolhida tem
  [etapas](etapas-e-pagamento-por-fase.md). É o que liga um **marco** à fase que ele entrega.
- **Progresso** (de 5 em 5%), que o coordenador **informa**. O sistema só **sugere**: o
  checklist do card e a situação da disciplina aparecem como "Sugestão: X% — **usar**", e
  nada é gravado até você clicar em **Salvar**. Horas apontadas **não** viram sugestão (gastar
  hora não é avançar). Em linha de agrupamento o campo fica travado (é calculado).
- **Subtarefa de** (só ao criar).
- **Depende de (predecessoras)** — veja abaixo.
- **Recursos** — pessoas, papéis e horas (ver
  [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md)).
- **Restrição de data** e **Bloqueio** — veja abaixo.

### Dependências

Em **Depende de**, marque as tarefas que precisam acontecer antes. Para cada uma escolha o tipo e
o **atraso**:

| Tipo | Significa |
| --- | --- |
| **FS** — término → início | A tarefa só começa quando a outra termina (o padrão) |
| **SS** — início → início | As duas começam juntas |
| **FF** — término → término | As duas terminam juntas |
| **SF** — início → término | A tarefa só termina quando a outra começa |

O **atraso (latência)** é em dias úteis; **negativo = antecipação** (a tarefa começa antes de a
outra terminar). O sistema recusa **dependência circular** — se uma escapar, ela é ignorada no
cálculo e acusada como erro.

### Restrição de data e o alfinete

Fixa a data de uma linha, com a marca do **alfinete** em toda tela. São seis: **iniciar em**,
**iniciar não antes de**, **iniciar não depois de**, **terminar em**, **terminar não antes de**,
**terminar não depois de**. Sem restrição, o motor calcula livremente pelas dependências.

Se a restrição **contradiz** uma dependência, a linha ganha o aviso de **conflito de restrição**.
Restrição demais tira do cronograma a capacidade de recalcular sozinho: o verificador avisa quando
mais de 20% das linhas estão fixadas.

### Bloqueio

**Bloquear** exige o **motivo** (e aceita uma **previsão de solução**). O bloqueio **não para o
relógio**: o atraso continua contando; ele só registra o **motivo** ("aguardando definição da
arquitetura"), para separar "atrasado por nós" de "atrasado esperando o cliente". **Desbloquear** devolve a linha
à situação que as datas reais indicam. Linha **concluída** não se bloqueia.

## 2. Aprovar o cronograma (linha de base)

1. **Definir início do projeto** — a data âncora (como a *Data de Início do Projeto* do MS Project):
   linha sem predecessora e sem restrição começa aqui. Quem aprova (`cronograma:aprovar`) vê o campo
   enquanto o início não foi definido.
2. **Corrija os erros do verificador.** **Aprovar** fica desabilitado enquanto houver **erro**
   (veja "Saúde e verificador" abaixo) — aprovar transforma estas datas no combinado com o cliente.
3. **Aprovar cronograma.** Se o projeto tem **alocações digitadas** ou atividades **sem nenhuma hora
   estimada**, o sistema **avisa antes** e pede confirmação (veja o que muda em
   [Recursos](recursos.md)).

Ao aprovar, o sistema:

- **congela a linha de base BL-00** — uma foto de cada linha: datas, duração, horas, custo previsto
  e avanço planejado. Ela **nunca é sobrescrita**;
- **cria os cards** no quadro de [Tarefas](tarefas.md) de quem está escalado nas atividades da
  equipe;
- passa a **calcular a alocação** do projeto pelas horas das linhas, em vez da alocação digitada;
- passa a prever os recebimentos de
  [contratos cobrados por entrega](../financeiro/contrato-por-entrega.md).

Cronograma **aprovado** mostra o selo **aprovado em … · BL-xx** (a versão mais recente da linha de
base). Em **rascunho** ainda não existe card nem previsão de recebimento: o cronograma não vale.

## 3. Acompanhar

### Ler a tela

- **Resumo da linha de base:** quantas tarefas estão **no prazo**, **adiantadas** ou **atrasadas**
  em relação à linha de base, e o atraso médio.
A tela segue o layout do MS Project: a **tabela** à esquerda e o **gráfico** à direita, nas mesmas
linhas, numa área de rolagem só (a tabela fica presa à esquerda e o cabeçalho em cima).

- **Duas visões**, como no Project: **Gráfico de Gantt** (planejamento: Nº, Nome da tarefa, Duração,
  Início, Término, Predecessoras e Nomes dos recursos) e **Gantt de Controle** (acompanhamento: % concluído,
  datas, linha de base e **Desvio**, com a barra da linha de base logo abaixo da barra prevista).
- **Filtros:** **Todas**, **Atrasadas**, **Críticas**, **Bloqueadas**. **Lookahead:** **Tudo**,
  **7**, **15** ou **30 dias** (só o que começa ou termina no período). Com filtro ativo a tela mostra só
  as linhas que casaram, sem esconder nível; o editor continua vendo a EAP inteira.
- **Escala:** **Dias**, **Semanas** ou **Meses**, com o cabeçalho em dois níveis (semana sobre dia, mês
  sobre semana, ano sobre mês). Os **fins de semana e feriados** vêm sombreados — o mesmo calendário que
  agenda as tarefas. **Hoje** rola o gráfico até a data de hoje.
- **Níveis:** o triângulo antes do nome **recolhe** ou **expande** um agrupamento; **Recolher** e
  **Expandir** fazem isso com todos. O **Nº** é a posição da linha na lista completa (o "Id" do Project) e
  não muda ao recolher ou filtrar — é o número que a coluna **Predecessoras** cita.
- **Predecessoras:** escritas como no Project: `3` (término→início), `3TI+2d` (com espera de 2 dias
  úteis), `5II`, `2TT-1d`. **TI/II/TT/IT** = término→início, início→início, término→término,
  início→término. As setas do gráfico seguem o tipo de cada vínculo.
- **Barras:** a barra colorida é a **previsão**, preenchida até o **progresso**; a barra preta com pontas
  é o **agrupamento**; o **marco** é um losango; o **caminho crítico** fica em vermelho; **cadeado** =
  bloqueada; **alfinete** = data fixada; a linha vertical vermelha marca **hoje**. Ao lado da barra
  aparecem os recursos (ou o % no Gantt de Controle).
- **Editar direto na tabela** (só quem monta o cronograma): clique no **Nome**, na **Duração**, no **%
  concluído** (Gantt de Controle) ou nas **Predecessoras** e digite na própria célula, como no Project.
  **Enter** grava e desce; **Tab** grava e vai para a próxima célula; **Esc** desiste; clicar fora grava.
  **Duplo clique** na linha (ou **Enter** com a linha selecionada) abre a janela completa; **F2** edita o
  nome. Agrupamento só edita o nome — o resto deriva das tarefas dentro dele.
  - **Duração:** `5` ou `5d` (dias úteis; aceita `1,5`). **`0`** ou **`marco`** transforma a tarefa em marco.
  - **Predecessoras:** `3`, `3TI+2d`, `5II`, `2TT-1d`, vários separados por `;`. O número é o **Nº** da
    linha. Aceita as siglas do Project em português (**TI, II, TT, IT**) e em inglês (**FS, SS, FF, SF**).
    O atraso é em dias úteis. O sistema recusa vínculo que criaria ciclo, mesmo que o texto esteja certo.
  - Cada gravação recalcula o cronograma; várias em sequência entram na fila e são gravadas uma de cada vez.
- **Menu da linha** (botão direito, ou o botão **⋯** da coluna Ações): **Informações da tarefa** (a janela
  completa), **Inserir tarefa acima**, **Recuar**, **Avançar**, **Atualizar tarefa (datas reais)**, **Gerar
  tarefa no kanban** e **Excluir tarefa**. Os mesmos comandos têm atalho, com a linha selecionada: **Insert**
  (inserir acima), **Delete** (excluir), **Alt+Shift+→** (recuar) e **Alt+Shift+←** (avançar).
  - **Inserir acima** cria uma tarefa de 1 dia, no mesmo nível, na disciplina da linha; o nome já abre para
    você digitar.
  - **Recuar** faz a tarefa virar a **última subtarefa** da que está logo acima dela, no mesmo nível (a de
    cima vira um agrupamento; se ela tinha pessoas atribuídas, o sistema avisa que as horas delas deixam
    de contar). Não recua a primeira tarefa do nível nem sob um marco.
  - **Avançar** sobe a tarefa um nível, logo depois do agrupamento onde estava. Como no Project, as tarefas
    que vinham **depois dela** naquele nível passam a ser **subtarefas dela** — é o que a mantém no mesmo
    lugar da tela.
  - **Excluir** pede confirmação e diz quantas subtarefas vão junto; os cards já gerados ficam no quadro.
- **Tabela compacta / completa:** a tabela abre compacta (sem Disciplina, Recursos e Custo) para dar
  espaço ao gráfico; **Tabela completa** mostra todas as colunas, inclusive o **Custo** (só quem vê o
  financeiro). **✓** marca a linha concluída.

### Datas reais: Atualizar tarefa

Na coluna **Ações**, o botão de calendário abre **Atualizar tarefa** (como no MS Project):

- **Atividade:** informe o **início real** e, ao terminar, o **término real**. O término conclui a
  atividade (100%); apagá-lo a reabre, sem inventar o percentual de volta.
- **Marco:** uma data só — o dia em que aconteceu. **Reabrir** desfaz.
- Data real **no futuro** não é aceita. Linha de agrupamento, suspensa, cancelada ou arquivada não
  recebe datas reais.
- **As datas reais mandam na previsão.** Tarefa concluída fica nas datas em que aconteceu; tarefa
  iniciada começa no início real, mesmo que a dependência dissesse outra coisa (a realidade já passou
  por cima dela). Se ela **atrasou**, as tarefas que dependem dela **andam junto**; se adiantou, elas
  podem começar antes. A **linha de base não muda** — é contra ela que o atraso aparece.
- **Percentual sem data real** segue a regra do MS Project: informar mais de 0% conta como tarefa
  **iniciada** no início calculado, e 100% como **concluída** nas datas calculadas. Para o registro
  ficar certo, informe as datas reais.
- Concluir o **marco** de uma fase **marca a fase como Entregue** e oferece **aprovar** — o que libera o
  pagamento dela —, veja [Etapas e pagamento por fase](etapas-e-pagamento-por-fase.md). Se o marco tem
  parcela de contrato ligada, o financeiro é avisado de que dá para **faturar**.

Exige `cronograma:executado`.

### Data de Status e Apurar

A **Data de Status** é o dia em que você declara o estado do cronograma: até ela, o andamento está
informado. É ela que separa **atrasado** de **não apurado** — linha que ninguém atualizou há três
semanas não deve aparecer como atrasada, e as duas situações pedem ações opostas. Escolha a data e
clique em **Apurar**. Cada apuração fica guardada (é o histórico do [Valor Agregado](valor-agregado.md)).
A Data de Status **não pode ser no futuro**.

**Apurar reprograma o que não foi feito** — é o "Atualizar projeto → Reprogramar trabalho não
concluído para iniciar após" do MS Project, automático:

- tarefa **não iniciada** que já devia ter começado vai para o **dia útil seguinte** à Data de Status
  (ninguém trabalha no passado);
- tarefa **em andamento** mantém a parte feita (duração × %) onde está, e o **restante** vai para
  depois da Data de Status;
- as tarefas que dependem delas andam junto, e o **fim do projeto** mostra o efeito real.

**Qual data usar:** o último dia cujo andamento já está informado — normalmente o **último dia útil
encerrado**. Apurar com a data de **hoje**, de manhã, leva para amanhã as tarefas de hoje que ainda
não tiveram início registrado.

Tarefa com data presa por restrição (por exemplo, **Iniciar em**) que precise andar ganha o aviso de
**conflito de restrição**. Na janela da tarefa aparece "reprogramada para depois da Data de Status".

Toda **segunda-feira** o sistema avisa quem tem `cronograma:executado` dos cronogramas **aprovados**
sem apuração há mais de 10 dias.

### Saúde e verificador

O quadro no topo mostra a **saúde do cronograma** (0 a 100%: **saudável** a partir de 85,
**atenção** a partir de 60, **crítico** abaixo disso) com o número de erros e alertas. A nota é
**provisória**: os pesos ainda serão calibrados com projetos reais. O sistema guarda uma **foto
semanal** da nota. Abra **Achados do verificador** para ver as regras que dispararam:

| Tipo | O que acusa |
| --- | --- |
| **Erro** (bloqueia a aprovação) | dependência circular · marco com duração · atividade sem duração · concluída sem término real · **crítica atrasada** (no caminho crítico, já passou do término combinado) · futura com avanço (ainda não começou e já tem %) |
| **Alerta** | sem Data de Status · excesso de restrições · iniciada sem início real · bloqueada · sem responsável · duração excessiva (mais de 20 dias) · atrasada |
| **Informativo** | sem predecessora · sem sucessora · sem horas previstas · agrupamento com gente atribuída |

As regras de **atraso** (atrasada, crítica atrasada, futura com avanço) só rodam depois que a
**Data de Status** é definida. **Atrasada** compara com o **término da linha de base** (o combinado);
sem linha de base (rascunho), com o plano antes da reprogramação — a previsão reprogramada nunca
termina antes da Data de Status, então ela não serve de régua. O filtro **Atrasadas** da tela usa a
mesma régua. "Sem horas previstas" e "agrupamento com gente atribuída" não pesam
na nota.

### Replanejar

Depois de aprovado, o cronograma **não se edita "por cima"**: para mudar o combinado, use
**Replanejar**, informe o **motivo** (obrigatório) e confirme. Isso cria **BL-01** (depois BL-02…), e
as versões anteriores **ficam guardadas**. É o que responde, no fim do projeto, "por que o prazo
andou?". A tela compara sempre com a linha de base **mais recente**. Exige `cronograma:aprovar`.

## 4. Ligações com o resto do sistema

- **Aplicar ao projeto** — leva o fim previsto da EAP para o **prazo das disciplinas** (o maior fim
  entre as tarefas de cada disciplina). Disciplina com **etapas** só recebe o prazo de linha que
  tenha a **fase** da etapa.
- **Tarefas (kanban)** — cada atividade da equipe com gente escalada vira um **card**; o botão de
  lista (**Gerar tarefa no kanban**) força a sincronização de uma linha. Em rascunho fica
  desabilitado.
- **Ponto** — dá para dizer em qual tarefa você trabalhou; as horas aparecem no editor
  (**apontado × previsto**). Ver [Ponto](../rh-ponto/ponto.md).
- **Financeiro** — custo previsto por linha, previsão de recebimento por marco e pagamento do
  projetista por fase. Ver [Custo](cronograma-equipe-e-custo.md) e
  [Contrato por entrega](../financeiro/contrato-por-entrega.md).

## 5. Exportar e Cronograma geral

- **Exportar Excel** — a EAP com código, datas, progresso e (com linha de base) desvio; quem vê o
  financeiro recebe também a coluna de **custo previsto**.
- **Exportar PDF** — versão para imprimir.
- **Cronograma geral** (`/planejamento/cronograma`) — os projetos lado a lado na mesma linha do
  tempo, para **enxergar e sequenciar** projetos entre si. É só **leitura**: o prazo de cada projeto
  só se edita dentro dele. Filtros: busca por nome ou código, **situação** do projeto e **Com
  atraso**.
- Abaixo do cronograma de cada projeto, **Plano × real** compara, no mês corrente, a alocação
  planejada de cada pessoa com as horas realmente registradas no ponto.

## Permissões

| Ação | Permissão |
| --- | --- |
| Ver a lista de projetos e a **estrutura** da EAP (sem datas) | `planejamento:ver` |
| Ver as **datas**: Gantt, prazos, linha de base, Cronograma geral, Saúde, Valor Agregado, exportar Excel e PDF | `planejamento:gerir`, `cronograma:ver`, `cronograma:executado` ou `cronograma:aprovar` |
| Montar e editar a EAP (tarefas, dependências, restrição, bloqueio, recursos, reagendar, aplicar ao projeto) | `planejamento:gerir` |
| Definir a Data de Status (**Apurar**) e **Atualizar tarefa** (datas reais) | `cronograma:executado` |
| **Aprovar** o cronograma e **Replanejar** | `cronograma:aprovar` |
| Ver a coluna **Custo** e o valor em R$ do Valor Agregado | acesso ao financeiro (`financeiro:ver` ou sócio) |
| Aprovar a **fase** a partir do marco concluído | `aprovacoes:disciplina` |

Quem pode **montar** a EAP (`planejamento:gerir`) precisa também poder **informar o andamento**
(`cronograma:executado`). Na atualização que trouxe o cronograma novo, quem já montava passou a poder
informar o andamento; ao dar `planejamento:gerir` a um perfil pela tela **Configurações → Perfis**,
marque também `cronograma:executado`. **Aprovar** é separado, de propósito — é ele que congela o
combinado com o cliente.

Nos perfis padrão, o **Coordenador** e o **Administrativo** montam, aprovam e apuram o cronograma
(o Administrativo também vê o financeiro; o Coordenador, não). **CLT**, **Estagiário** e **Projetista
PJ** têm só `planejamento:ver`: veem a estrutura, sem datas. Os perfis são editáveis em **Configurações → Perfis**, então
confira lá o que vale no seu escritório.

## Regras de negócio

- **A duração e as dependências mandam nas datas**; salvar recalcula o projeto inteiro.
- **Aprovar exige zero erro** do verificador e **replanejar exige motivo**.
- **A linha de base nunca é sobrescrita.** Cada versão guarda autor, data e motivo.
- **O % de cada atividade é informado** pela coordenação; o sistema só sugere.
- **Bloqueio não pausa o prazo.** Férias **não movem** datas.
- **O realizado move a previsão, nunca o combinado.** Datas reais e a Data de Status empurram as
  tarefas; a linha de base fica como foi aprovada.
- **Só coordenação e administração montam e editam.** Quem executa consome os cards.

## Funcionalidades relacionadas

- [Cronograma: equipe, horas e custo](cronograma-equipe-e-custo.md) · [Valor Agregado](valor-agregado.md) ·
  [Etapas e pagamento por fase](etapas-e-pagamento-por-fase.md) · [Recursos](recursos.md) ·
  [Tarefas](tarefas.md) · [Projetos](projetos.md) ·
  [Contrato por entrega](../financeiro/contrato-por-entrega.md)

## FAQ

**Qual a diferença entre Tarefas e Planejamento?** "Tarefas" é o quadro kanban do dia a dia;
"Planejamento" é o cronograma estruturado (EAP/gantt) do projeto. O cronograma aprovado gera os
cards.

**Onde digito o início e o fim da tarefa?** Não se digita: você informa a **duração** e as
**dependências**, e o sistema calcula as datas, como o MS Project. Para prender uma tarefa numa data,
use **Restrição de data** (o alfinete).

**Cadastrei um feriado e as datas não mudaram.** Clique em **Reagendar**: o calendário mudou sem
ninguém mexer no cronograma.

**Por que não consigo aprovar?** Há **erros** do verificador (abra **Achados do verificador**), ou
falta **definir o início do projeto**. Corrija e tente de novo.

**Aprovei e preciso mudar uma data. E agora?** Use **Replanejar** com o motivo. A linha de base
anterior fica guardada.

**O que é a Data de Status?** O dia em que você declara o estado do cronograma. Sem ela, o sistema
não separa "atrasado" de "ainda não apurado".

**Apurei e as tarefas foram para depois da Data de Status. É erro?** Não: é o trabalho que ainda não
foi feito indo para o futuro, como o "Reprogramar trabalho não concluído" do MS Project. Informe as
datas reais e o percentual das tarefas em andamento — o que já foi feito fica onde está.

**Onde edito os feriados que o cronograma usa?** Em [Configurações](../sistema/configuracoes.md) →
**Feriados**. O calendário é um só, o da empresa.

**Não vejo os botões de editar.** Você tem só `planejamento:ver`. Montar e editar exige
`planejamento:gerir`; aprovar, `cronograma:aprovar`.

**Não vejo as datas nem o Gantt.** O seu perfil vê só a estrutura do planejamento. Quem precisa dos prazos
usa o **card da tarefa** (que o cronograma gera com o prazo) ou pede ao coordenador.
