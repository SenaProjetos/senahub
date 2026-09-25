# Motor de Planejamento — metodologia MS Project no SenaHub

**Data:** 2026-09-23
**Origem:** sessão de grilling com o dono (42 decisões, 5 rodadas)
**Status:** decidido, não implementado
**Documentos da equipe que este spec consolida:**
- `Padrão Corporativo de EAP e Estrutura de Cronogramas — SenaHub` (Doc 03, v1.0)
- `Dicionário Corporativo de Classificadores — SenaHub` (Doc 02, v1.1)
- `EAP.pdf` — cronograma real de um empreendimento completo (185 linhas, 100 dias)

---

## 1. O que se quer

Trazer a **metodologia** do MS Project para o SenaHub — motor de agendamento, linha de base,
caminho crítico, recursos, Valor Agregado — **sem a interface de planilha**, e integrada aos
módulos que já existem (projetos, financeiro, ponto, arquivos, CRM).

O cronograma passa a ser uma **estrutura de dados integrada ao projeto**, não uma representação
gráfica. É o princípio do Doc 03 §2:

> ID identifica · EAP organiza · Classificadores caracterizam · Relacionamentos conectam ·
> Calendário define disponibilidade · Dependências determinam lógica · Baseline registra o
> compromisso · Progresso registra a realidade · Motor de planejamento calcula datas e impactos.

---

## 2. Estado atual (auditado em 2026-09-23)

| Peça | Hoje | Serve? |
|---|---|---|
| `EapTarefa` | datas previstas + baseline + progresso manual + `marco` | estrutura sim, semântica não |
| `EapDependencia` | só FS, lag 0 | insuficiente (Doc 03 §12-13 pede 4 tipos + lag) |
| `caminho-critico.ts` | CPM puro, **deriva duração das datas**, dias corridos, sem feriado | **será refeito** |
| `Alocacao` | % por **projeto**, não por tarefa | vira cálculo (D17) |
| `Recurso` | `capacidade`, `custoHora`, `cor` | aproveitado |
| `SessaoTrabalho` | horas por **projeto**, não por tarefa | ganha tarefa (D20) |
| `Disciplina` | 1 linha por projeto: 1 prazo, 1 valor, 1 pool de pagamento | ganha etapas (D30) |
| `Tarefa` (kanban) | tem `eapTarefaId` (1:1) | é a ponte EAP → projetista |
| Catálogo de fase | `PranchaCatalogo` categoria `fase` (PL/AP/BS/EX/LG/AB) | reaproveitado |
| `NomenclaturaVersao` | siglas com `versaoDesde`/`versaoAte`, por projeto | resolve a colisão de siglas (D35) |
| `LinkPublicoArquivos` | escopo por disciplina, `agruparPorFase` | ganha filtro por fase (D37) |

**Aviso de leitura:** "já temos caminho crítico" **não** significa que essa parte é barata. O motor
atual funciona ao contrário do decidido — deduz duração das datas digitadas. As decisões D2/D6/D8/D10
pedem o inverso: duração + calendário + dependência **geram** as datas.

---

## 3. As 42 decisões

### 3.1 Fundamento

| # | Decisão |
|---|---|
| D1 | Os 9 pilares entram: calendário, duração/esforço, 4 tipos de vínculo + lag, restrições, recurso na tarefa, nivelamento, custo por tarefa, EVM, baseline versionada |
| D2 | **O motor manda nas datas.** Duração + predecessora + calendário geram início e fim |
| D3 | A **linha** é a unidade. Pode ser projeto, fase, pacote, disciplina, atividade-resumo, atividade ou marco (TEAP, Doc 02 §5) |
| D4 | Só coordenador e admin montam e editam. Projetista **não vê a EAP** — consome cards |
| D5 | A linha se liga às fichas do sistema por **FKs opcionais nomeadas** (`projetoId`, `disciplinaId`, `tarefaId`, `lancamentoId`…), nunca por par tipo+código solto. Integridade referencial no banco |

### 3.2 Tempo

| # | Decisão |
|---|---|
| D6 | **Três datas por linha:** baseline (congelada) · previsão (recalculada) · real. Atraso real empurra as sucessoras (forecast rolante). Replanejamento salva **nova versão de baseline**, nunca sobrescreve (`BL-00`, `BL-01`, `BL-02` — Doc 03 §20) |
| D8 | **Um calendário da empresa** (dias úteis + feriados) agenda tudo. Férias e jornada individual geram **alerta**, nunca movem data. Campo de calendário por projeto previsto no modelo, desligado na v1 |
| D10 | Modelo de EAP guarda **só duração e predecessora**. Nenhuma data. Aplicar pede a data de início |
| D16 | **Duração fixa** é o padrão, sem "controlada pelo empenho". Mais gente na tarefa distribui horas, não encurta prazo. Trabalho fixo disponível por exceção |
| D21 | O **ritmo observado** é leitura automática (previsto × real do ponto e das datas). Ele corrige a **previsão de término** e gera **alerta** quando contradiz o % informado. Nunca sobrescreve o % |
| D34 | As **6 restrições** do Doc 03 §18 existem no modelo. Na tela, arrastar a barra grava "não iniciar antes de" e marca a linha com **alfinete visível**. Nunca restrição silenciosa |
| D39 | **Data de Status semanal por projeto**, definida pelo coordenador, com lembrete após 10 dias sem atualização. Todo relatório de atraso declara a data de apuração. Distingue *atrasado* de *não apurado* |

### 3.3 Estrutura

| # | Decisão |
|---|---|
| D7 | Cronograma **por projeto** + **Painel Mestre** de leitura (sequencia projetos entre si, mostra conflito de recurso; prazo interno só se edita dentro do projeto) |
| D13 | `Projeto` ganha **Tipo de Empreendimento**, obrigatório na criação, sugerindo o modelo de EAP. Vem preenchido quando o projeto nasce de uma negociação |
| D14 | Cronograma nasce **rascunho**. Só vale depois de "Aprovar cronograma" — que congela `BL-00` e libera os cards |
| D29 | **ID corporativo = identidade da atividade** (`ATV-01842`), único na empresa, permanente, nunca reaproveitado de modelo (Doc 03 §32). O que compara projetos é o **TAT** (tipo de atividade: `MOD`, `DIM`, `DET`, `REV`, `EMT`), não o ID. Biblioteca de tipos **editável**; linha livre sem tipo é permitida e não entra na comparação |
| D36 | **A árvore é livre; o dado é o par.** Cada linha carrega disciplina e etapa como *classificadores*, não como posição. Fase-acima (EAP.pdf) e disciplina-acima (Doc 03 §3) funcionam os dois. Relatório lê o classificador |
| D26 | % de linha-resumo é **ponderado por horas previstas**, nunca digitado (Doc 03 §23). Data de resumo = menor início / maior término dos filhos |
| D35 | Siglas seguem a **versão de nomenclatura do projeto** (`NomenclaturaVersao`). A linha da EAP **nunca grava sigla** — aponta para disciplina e etapa; a sigla é resolvida na exibição. Elimina a colisão HID/LOG/SPD/BS/EX sem migração |

### 3.4 Disciplina e fase

| # | Decisão |
|---|---|
| D11 | Tirar a disciplina do cronograma **não** a cancela no projeto. Aviso: "Estrutural está fora do cronograma" |
| D12 | **Mão única, projeto → cronograma.** Disciplina nova (aditivo) entra na EAP **sem data**, pendente de agendamento. Linha criada na EAP **não** cria disciplina |
| D30 | **Disciplina ganha etapas de verdade.** Cada par disciplina × etapa é registro próprio |
| D37 | O par disciplina × etapa carrega **prazo, status e valor**. Arquivos, pastas, responsáveis e portal **continuam na disciplina**. Os arquivos já têm fase desde a reforma de nomenclatura — a leitura "arquivos do Estrutural Básico" já é possível sem dividir pasta |
| D37b | O **link público de arquivos ganha filtro por fase**, ao lado do filtro por disciplina. Permite "link do Executivo para o cliente" e "link do Básico para a prefeitura" como dois links do mesmo projeto |

### 3.5 Recursos

| # | Decisão |
|---|---|
| D17 | Atribui-se **pessoa ou perfil** à linha (perfil permite dimensionar antes de escalar). A **matriz de alocação por projeto vira cálculo** — some das linhas, ninguém digita %. Projeto sem cronograma aprovado segue com alocação digitada durante a transição |
| D22 | O responsável escolhido na criação do projeto **desce** para as linhas da disciplina. Da linha em diante vale o da linha ("atributo associado ao ID naquele momento") |
| D23 | **Horas previstas por pessoa na linha** (não percentual). Base do custo da tarefa, do alerta de sobrecarga e do previsto × real |
| D41 | **Vários responsáveis com papel** (`PRO`, `REV`, `APR`, `COO` — Doc 02 §16), cada um com suas horas, **todos entrando na carga**. Existe um responsável principal, que aparece no card e nos filtros |
| D18 | Sobrecarga: **alerta + sugestão aplicável em um clique** ("atrasar X em 3 dias" / "passar Y para o João"). **Nunca nivelamento automático** |

### 3.6 Execução

| # | Decisão |
|---|---|
| D19 | **% físico informado pelo coordenador**, com sugestões automáticas do que o sistema já sabe (status da disciplina, checklist da tarefa, arquivo enviado). Confirmação obrigatória |
| D20 | **O ponto passa a registrar a tarefa** ao abrir a sessão. Lista curta: só as tarefas em que a pessoa está alocada no período — nunca todas as do projeto |
| D24 | **Card por linha que tem gente alocada.** Linha de agrupamento, marco e etapa de terceiro **não geram card**. Duas pessoas na mesma linha = um card com dois responsáveis |
| D32 | **A EAP cria o card; o card devolve o andamento.** Estrutura desce, progresso sobe. Card **não** cria linha |
| D40 | **Bloqueio (`BLQ`)** com motivo, origem, responsável pelo desbloqueio e previsão. Marca, notifica e **classifica o atraso por origem** (cliente, arquitetura, concessionária, interno). **Não para o relógio** — o atraso continua existindo; o que muda é de quem é |

### 3.7 Dinheiro

| # | Decisão |
|---|---|
| D9 | Marco de recebimento **prevê**, não lança. A cobrança continua nascendo no financeiro e é conciliada com o marco |
| D15 | O **tipo de contrato** decide: parcelas *por data* (como hoje) **ou** *por entrega* (nascem como marcos da EAP). Nunca os dois no mesmo contrato |
| D25 | A previsão vira **linha de verdade no financeiro**, marcada como previsão de cronograma, visível no fluxo de caixa |
| D31 | **O marco também libera o pagamento do projetista, por fase** ("Básico de Fundação entregue → libera pagamento da etapa Básica"). Hoje isso é manual e só por disciplina inteira |
| D38 | O valor da disciplina se divide por **percentual por fase vindo do modelo de EAP** ("Básico 40%, Executivo 60%"), ajustável no projeto. Nunca proporcional às horas — horas mudam quando o cronograma é reestimado, e valor a pagar não pode mudar sozinho. **Validado pelo financeiro** |

### 3.8 Qualidade e escopo

| # | Decisão |
|---|---|
| D42 | **Verificador de qualidade oficial desde já** (15 regras do Doc 03 §33 — sem responsável, sem duração, marco com duração ≠ 0, vínculo circular, concluída sem término real…). **Saúde do Cronograma na tela desde já, com foto semanal gravada desde o dia 1** (o histórico é irrecuperável se ligado depois), mas marcada **provisória** até os pesos serem calibrados com projetos reais |
| D28 | **BIM 4D/5D fora da entrega, vínculo preparado no modelo** — uma atividade poderá apontar para zero, um ou vários pacotes BIM. Deixar para depois obrigaria a mexer em todas as atividades já criadas |
| D27 | Cronogramas existentes entram como **rascunho**: linhas preservadas, duração derivada das datas atuais, aviso de "precisa ser revisado e aprovado". Não geram card nem entram em relatório até a aprovação. **Nunca aprovar automaticamente** — congelaria como "combinado" datas que ninguém revisou |

---

## 4. O que muda em cada módulo

| Módulo | Mudança | Risco |
|---|---|---|
| `planejamento` | motor novo (duração+calendário→datas), 4 tipos de vínculo + lag, 6 restrições, TEAP, classificadores, baseline versionada, folga total/livre, lookahead 7/15/30, verificador, saúde | o CPM atual é substituído, não estendido |
| `projetos` | `Projeto.tipoEmpreendimentoId`; disciplina × etapa com prazo/status/valor | toca tela em produção |
| `ponto` | `SessaoTrabalho` ganha tarefa; lista curta por alocação | muda o hábito de quem bate ponto |
| `financeiro` | previsão de recebimento por marco; contrato por data × por entrega | **precisa do financeiro antes de codar** |
| `rh` / Produção | `PagamentoProjetista` por fase; valor da disciplina rateado | **tela refeita há pouco (v1.17.0)** — cuidado |
| `arquivos` | filtro por fase no link público | pequeno |
| `recursos` | matriz passa a ser calculada | conviver com a digitada durante a transição |
| `tarefas` | card gerado da EAP, devolve andamento | ponte `Tarefa.eapTarefaId` já existe |
| `permissoes` | recursos novos (`cronograma:aprovar`, `cronograma:gerir`, `cronograma:executado`) | **ver §6** |

---

## 5. Ordem de entrega (D28)

1. **Motor** — calendário da empresa, duração, predecessora (4 tipos + lag), restrições, TEAP,
   classificadores, rascunho/aprovação, baseline versionada, verificador de qualidade.
   *Sem isso nada mais funciona.*
2. **Recursos** — pessoa/perfil + horas na linha, papéis, alerta de sobrecarga com sugestão, card do projetista.
3. **Apontamento por tarefa** — ponto com lista curta.
4. **Custo por tarefa** — horas × custo/hora.
5. **Dinheiro** — marco de recebimento no financeiro, pagamento de projetista por fase.
6. **Valor Agregado** — VP/VA/CR, IDP/IDC. *Só depois dos cinco acima; antes disso são índices sobre dado incompleto.*

A **Saúde do Cronograma** acompanha a fase 1 (nota provisória + foto semanal), oficializada depois.

---

## 6. Pendências antes de escrever código

1. ~~**Financeiro precisa validar D15, D25, D31 e D38.**~~ **Validado pelo dono em 2026-09-23.**
   Atenção ao codar: o rateio do valor da disciplina por fase mexe na tela de Produção e na folha
   de projetistas, ambas em produção desde a v1.17.0.
2. ~~**Nomenclatura versionada precisa estar publicada.**~~ **Em produção em 2026-09-23.**
   Conferência pós-deploy contra o banco de prod passou: `42/42 vocabulários idênticos ·
   0 projeto(s) sem versão fixada`. **D35 está liberada.** Resta o dono cadastrar e publicar
   a v2 pela tela — publicar não afeta projeto existente, e até lá todo projeto segue a v1.
3. **Permissões.** O perfil *Coordenador* com escopo global entrou na v1.19.0; os recursos novos do
   cronograma ainda não existem no catálogo. Seed de permissão é create-only por par — exige
   migration por par novo (ver memória `permissoes-matriz-legada-nao-autoriza`).
4. **Doc 02 precisa ser atualizado** com o resultado de D29 (ID = instância, não tipo; a comparação
   entre projetos é pelo TAT) e D35 (siglas por versão de nomenclatura), e a colisão interna
   `EST` disciplina × `EST` etapa precisa ser resolvida pela equipe.

---

## 6-A. Fases de implementação, modelo e esforço

**Unidade de esforço:** 1 sessão ≈ meio dia de trabalho focado de um agente + revisão do dono.
São estimativas, não compromissos — as de risco **alto** são as que mais podem escorregar.

**Critério de modelo:** Opus onde a decisão é irreversível ou o erro é silencioso (schema,
migration, motor puro, dinheiro, permissão). Sonnet onde o alvo já está definido e o trabalho
é mecânico (tela sobre dado pronto, documentação, testes de regressão).

### F0 — Fundação de dados · Opus · 3 sessões · risco ALTO

| # | Entrega | Detalhe |
|---|---|---|
| F0.1 | Schema da linha | `EapTarefa` ganha `duracao`, `tipoEap` (TEAP: PRJ/FAS/PCT/DISC/LOC/SIS/RES/ATV/MRC), `idCorporativo` (único na empresa, permanente — D29), `codigoEap` recalculável, e as FKs nomeadas da D5 |
| F0.2 | Classificadores | `etapaId` (reusa `PranchaCatalogo` categoria `fase` — **não criar catálogo novo**), `disciplinaId`, `tipoAtividade` (TAT), `localizacao`, `sistema`, `status`, `prioridade`, `origem`, `risco`. Governança em 3 níveis (Doc 02 §24) |
| F0.3 | Dependência completa | `EapDependencia` ganha `tipo` (FS/SS/FF/SF) e `lag` em dias úteis. **Entra agora mesmo com a tela só oferecendo FS** — incluir depois obrigaria a reescrever todo cronograma já criado |
| F0.4 | Baseline versionada | `EapBaseline` (numero, data, autor, motivo, observação) + `EapBaselineLinha` (início/fim/duração/trabalho/avanço planejado). Nunca sobrescreve — D6/Doc 03 §20 |
| F0.5 | Restrições e pin | 6 restrições do Doc 03 §18 + marca de fixada visível (D34) |
| F0.6 | Migration + migração do existente | Cronogramas atuais viram **rascunho**, duração derivada das datas, sem baseline (D27). Aditiva; nenhum `DROP` |

> **Armadilha conhecida:** `DROP`/`RENAME` sem `IF EXISTS` derruba deploy (aconteceu duas vezes
> neste repo). Toda migration desta fase é aditiva.

### F1 — Motor de agendamento · Opus · 4 sessões · risco ALTO

| # | Entrega | Detalhe |
|---|---|---|
| F1.1 | Calendário de trabalho | `lib/calendario-trabalho.ts` **puro + testado**: dias úteis, feriados (reusa `FeriadoRecorrente`), soma/subtração de duração. Campo de calendário por projeto previsto, desligado (D8) |
| F1.2 | Motor | Substitui `caminho-critico.ts`. Forward/backward pass sobre calendário, 4 tipos de vínculo, lag, restrições, predecessora múltipla (o `EAP.pdf` tem linha com 10). Devolve datas, folga total e livre, caminho crítico |
| F1.3 | Rollup de resumo | Datas do pai = menor início / maior fim dos filhos; nunca digitadas (Doc 03 §8). % ponderado por horas (D26) |
| F1.4 | Código EAP | Recalcula `1.2.3` ao mover linha, **sem tocar no `idCorporativo`**, com histórico da mudança (Doc 02 §27) |
| F1.5 | Bateria de testes | O motor é o coração; cobertura densa como `tokens.ts` e `encargos.ts` já têm. Caso-âncora: reproduzir o `EAP.pdf` (185 linhas, 100 dias) e conferir as datas contra o MS Project |

> **Não estender o CPM atual.** Ele deriva duração das datas e conta dias corridos — o oposto
> do decidido. É substituição, não evolução.

### F2 — Governança do plano · Opus · 3 sessões · risco MÉDIO

| # | Entrega | Detalhe |
|---|---|---|
| F2.1 | Rascunho → aprovado | "Aprovar cronograma" congela `BL-00` e libera os cards (D14) |
| F2.2 | Replanejamento | Nova versão de baseline com autor, data e motivo (D6) |
| F2.3 | Data de Status | Semanal por projeto + job de lembrete após 10 dias sem atualizar (D39). Distingue *atrasado* de *não apurado* |
| F2.4 | Verificador de qualidade | As 15 regras do Doc 03 §33, **puro + testado**, oficial desde já (D42) |
| F2.5 | Saúde do cronograma | Nota **marcada provisória** + foto semanal gravada desde o dia 1 — o histórico é irrecuperável se ligado depois (D42) |
| F2.6 | Permissões | `cronograma:ver` / `gerir` / `aprovar` / `executado` no catálogo + migration derivando de `recursos:ver` e `recursos:gerir`, com `ON CONFLICT DO NOTHING`. Seed é create-only: **sem migration, ninguém recebe o par** |

### F3 — Telas · Sonnet · 4 sessões · risco MÉDIO

Um cronograma, quatro modos de exibição (D33) — não duas telas lado a lado.

| # | Entrega | Detalhe |
|---|---|---|
| F3.1 | Planejar | Árvore + Gantt: estrutura, duração, predecessora. Expandir/recolher níveis |
| F3.2 | Acompanhar | Gantt de Controle: duas barras por linha (combinado × previsão), % concluído, alerta de ritmo (D21), alfinete visível |
| F3.3 | Filtros e lookahead | Filtros combinados (Doc 03 §36) + lookahead 7/15/30 (§37) |
| F3.4 | Painel Mestre | Projetos lado a lado na linha do tempo, **leitura e sequenciamento apenas** (D7). Parte de `cronogramaProjetosAtivos()`, que já existe |
| F3.5 | Bloqueio | `BLQ` com motivo, origem e responsável pelo desbloqueio; notificação; atraso classificado por origem (D40) |

> Reaproveitar `components/planejamento/` (1113 linhas hoje). `gantt.tsx` precisa de reescrita
> para as duas barras; `eap-workspace.tsx` vira o modo Planejar.

### F4 — Disciplina × etapa · Opus · 3 sessões · risco ALTO

| # | Entrega | Detalhe |
|---|---|---|
| F4.1 | Par disciplina × etapa | Prazo, status e valor próprios por fase (D30/D37). **Arquivos, pastas, responsáveis e portal continuam na disciplina** |
| F4.2 | Prazo da disciplina | Passa a ser o da última fase; nada muda para quem lê de fora |
| F4.3 | Link por fase | `LinkPublicoArquivos` ganha filtro por fase ao lado do de disciplina (D37b). Pequeno — o modelo já tem `agruparPorFase` |

> Toca `projetos`, que está em produção. É a fase onde vale um smoke em navegador antes do merge.

### F5 — Recursos · Opus (regras) + Sonnet (tela) · 3 sessões · risco MÉDIO

| # | Entrega | Detalhe |
|---|---|---|
| F5.1 | Recurso na linha | Pessoa **ou perfil** (D17). Vários responsáveis com papel `PRO`/`REV`/`APR`/`COO`, todos entrando na carga (D41) |
| F5.2 | Horas previstas | Por pessoa na linha, não percentual (D23) |
| F5.3 | Herança do responsável | Desce da disciplina para as linhas; da linha em diante vale o da linha (D22) |
| F5.4 | Matriz calculada | `matrizRecursos()` passa a somar das linhas. Projeto sem cronograma aprovado **segue com a alocação digitada** durante a transição (D17) |
| F5.5 | Sobrecarga | Alerta **com sugestão aplicável em um clique**; nunca nivelamento automático (D18). Férias e jornada entram como aviso (D8) |
| F5.6 | Card do projetista | Uma linha com gente alocada = um card; resumo, marco e etapa de terceiro **não geram card** (D24). A ponte `Tarefa.eapTarefaId` já existe |

> **Notas de implementação (2026-09-24, regras da F5 prontas; tela pendente):**
> - **Deploy:** depois da migration `20260924160000_eap_atribuicao`, rodar
>   `scripts/herdar-responsaveis-eap.ts --gravar` **uma vez**. Sem ele, toda linha antiga
>   aparece "sem responsável" e a Saúde de todo projeto cai no dia do deploy. Rodar de novo
>   depois desfaria escolhas do coordenador — para isso existe o botão por projeto.
> - **A confirmar com o time — "etapa de terceiro" (D24):** reconhecida pela **origem** da
>   linha: `CLI`, `ARQ`, `EXT`, `FIS`, `APR`, `CON`, `OBR`. `INT`, `CMP` e `ALT` são trabalho da
>   casa. A D24 não dizia como reconhecer; a origem foi o classificador mais próximo.
> - **Perfil** = atribuição sem pessoa. "Projetista" numa linha da Elétrica **é** o
>   "Projetista Elétrico" — a disciplina vem da linha, sem catálogo de perfis paralelo.
> - Papéis = os **8** do Doc 02 §16 (DIR, GER, COO, ENG, PRO, MOD, REV, APR), não só 4.
> - Aprovar o cronograma tira a alocação digitada do projeto da soma (D17). Aprovar **sem horas
>   estimadas** faz o projeto sumir da carga da equipe — a tela de aprovação avisa.
> - **Cards antigos:** antes da F5 o botão "gerar card" criava card em rascunho, sem
>   responsável. Contar em produção antes do deploy (`Tarefa.eapTarefaId` preenchido): quando o
>   cronograma desses projetos for aprovado, título, prazo e responsáveis passam a vir da EAP.
> - **Tela da F5 pronta (2026-09-24), sem olho humano:** editor de recursos no diálogo da EAP,
>   coluna Recursos, "Herdar responsáveis", `/recursos` com calculadas/substituídas e a aba
>   "Carga planejada", trava dos campos do card. Build, lint, tsc e smoke passam; **falta o
>   smoke em navegador do dono antes do merge.** Sugestões de sobrecarga são sob demanda (1,3 s
>   com 10 sobrecargas se fossem na listagem).
> - Verificação: `npm run smoke:recursos-eap`.

### F6 — Apontamento por tarefa · Sonnet · 2 sessões · risco BAIXO

| # | Entrega | Detalhe |
|---|---|---|
| F6.1 | `SessaoTrabalho` ganha tarefa | Hoje só tem projeto |
| F6.2 | Lista curta | Só as tarefas em que a pessoa está alocada no período — nunca todas as do projeto (D20) |
| F6.3 | % sugerido | Checklist, status da disciplina e arquivo enviado viram sugestão; coordenador confirma (D19/D32) |

> Muda o hábito de todo mundo que bate ponto. Vale um aviso em `/ajuda/novidades` antes.

> **Notas de implementação (2026-09-24, F6 pronta, sem olho humano):**
> - `SessaoTrabalho.tarefaId` (FK `SetNull`) e `Batida.tarefaId` (escalar, como o `projetoId`):
>   a batida carrega a tarefa para a edição de um dia — que recria batidas e sessões — não perdê-la.
> - Tudo é OPCIONAL (Q20). Lista curta = cards abertos da pessoa no projeto; card de EAP só na
>   janela da linha ± 7 dias; teto de 8. Validação dentro da transação da batida.
> - **Tarefa de uma troca no meio do dia não sobrevive à edição do dia** (a troca não tem batida;
>   o projeto dela já era perdido assim). Voltar do descanso na tela cheia começa em "sem projeto"
>   — comportamento antigo do projeto; o cabeçalho retoma projeto e tarefa.
> - **D19 vence a P-33:** o % da EAP passa a ser o INFORMADO (folha) e o do motor (resumo). O status
>   da disciplina virou sugestão. Muda o que a coordenação vê em linha ligada a disciplina.
> - **Horas apontadas NÃO viram sugestão de %:** consumo de orçamento não é avanço (D21; IDP).
> - Verificação: `npm run smoke:ponto-tarefa`. Deploy da F6 = só a migration.

### F7 — Custo e dinheiro · Opus · 3 sessões · risco ALTO

| # | Entrega | Detalhe |
|---|---|---|
| F7.1 | Custo por tarefa | Horas × `Recurso.custoHora`, que já existe |
| F7.2 | Marco de recebimento | Vira **linha de previsão no financeiro**, conciliada com a cobrança real (D9/D25) |
| F7.3 | Contrato por entrega | Tipo de contrato decide: parcelas por data **ou** por entrega; nunca os dois no mesmo contrato (D15) |
| F7.4 | Pagamento por fase | Valor da disciplina rateado por percentual vindo do modelo (D38); marco libera o pagamento do projetista daquela fase (D31) |

> **Mexe na tela de Produção e na folha de projetistas**, refeitas na v1.17.0. Financeiro já
> validou a regra (2026-09-23), mas esta é a fase que pede conferência em tela antes do deploy.

> **Notas de implementação (2026-09-25, F7 pronta, sem olho humano):**
> - **Ordem feita:** oráculo + regras puras → F7.4 → F7.1 → F7.0 (nova: execução da linha) → F7.2/F7.3.
>   Dois oráculos fora do git (dinheiro e receber) conferiram cada fatia: disciplina sem fase e
>   contrato por data saíram idênticos.
> - **F7.4 pagamento por fase:** fase liberada CONGELA pool e recebedores; o valor da disciplina só
>   mexe nas fases pendentes (o "que falta" pelo % delas, a última absorve); ajuste na Produção anda o
>   total pela diferença; um modo por disciplina. "Já pagou" = `jaLiberouTudo`, nunca "tem pagamento"
>   (card e SLA estavam errados com fase parcial — corrigidos). `smoke:pagamento-fase`.
> - **F7.1 custo por linha:** horas × `Recurso.custoHora`; desconhecido nunca vira zero; só para quem
>   vê financeiro; congelado em `EapBaselineLinha.custoPrevisto` (VP da F8). Baseline antiga = nulo.
> - **F7.0 (não estava na tabela):** nada gravava `status`/`inicioReal`/`fimReal` nem a FASE da linha
>   (`etapaId`) desde a F0. Entrou o "Atualizar tarefa" (`cronograma:executado`) e o campo Fase. Marco
>   de fase concluído OFERECE aprovar a fase pela mesma action da F7.4 — nunca paga sozinho. O motor
>   ainda não lê datas reais (**D6 pendente — a F8 precisa saber**).
> - **F7.2/F7.3:** contrato de cliente `por_data | por_entrega` (D15); parcela = % ligado a marco ou
>   "na assinatura". A previsão é `Lancamento.status = previsao` — status próprio (não `previsto` +
>   etiqueta) para quem não a conhece a IGNORAR: fora de aging, inadimplência, "a receber", livro caixa
>   e conciliação; só a projeção de caixa a inclui. Faturar converte a MESMA linha em `previsto`.
>   Toda parcela (inclusive a da assinatura) passa por previsão → faturar (D9). `smoke:previsao-recebimento`.
> - **Pré-existente corrigido:** a projeção de caixa cortava na meia-noite local contra vencimento
>   em meia-noite UTC. **Pré-existente NÃO corrigido:** "faturar entrega" (N-26) cobra do cliente o
>   `Disciplina.valor`, que é o pool dos PJ.
> - **Deploy:** 4 migrations aditivas (a do `ADD VALUE` do enum é separada de propósito); nenhum seed,
>   nenhuma permissão nova.

### F8 — Valor Agregado · Opus · 2 sessões · risco MÉDIO

VP/VA/CR, IDP/IDC sobre o que F1–F7 produziram. **Só depois de todas as anteriores** — índice
calculado sobre dado incompleto é a forma mais rápida de a equipe perder a confiança no relatório.

### F9 — Manual e novidades · Sonnet · 1 sessão · risco BAIXO

`docs/manual/**` + `novidades.md` em linguagem de usuário, e `search-index.json` à mão (não há
gerador). A rota `/ajuda` é visível a **todos** os papéis, cliente incluído.

---

### Resumo

| Fase | Modelo | Esforço | Ultracode | Sessões | Risco |
|---|---|---|---|---|---|
| F0 Fundação de dados | Opus | **xhigh** | não | 3 | alto |
| F1 Motor | Opus | **xhigh** | **não** | 4 | alto |
| F2 Governança | Opus | high | **sim** | 3 | médio |
| F3 Telas | Sonnet | high | **sim** | 4 | médio |
| F4 Disciplina × etapa | Opus | **xhigh** | não | 3 | alto |
| F5 Recursos | Opus + Sonnet | high | não | 3 | médio |
| F6 Apontamento | Sonnet | medium | não | 2 | baixo |
| F7 Custo e dinheiro | Opus | **xhigh** | não | 3 | alto |
| F8 Valor Agregado | Opus | high | não | 2 | médio |
| F9 Manual | Sonnet | medium | não | 1 | baixo |
| **Total** | | | | **28 sessões** | |

**Por que `xhigh` só em F0/F1/F4/F7:** são as fases cujo erro é *silencioso* — schema
irreversível, motor que devolve data plausível e errada, migração de dado em produção, rateio
de dinheiro. As demais quebram barulhento (teste vermelho, tela torta) e `high` basta.

**Por que ultracode só em F2/F3:** ultracode é `xhigh` **mais orquestração paralela**, e só
paga quando o trabalho se divide em peças independentes — F2 tem 6 entregas que quase não se
tocam, F3 tem 5 modos de exibição em arquivos distintos.

**Por que ultracode NÃO em F0/F1**, que são as mais caras e a tentação óbvia: o motor é *uma
coisa só*, profundamente acoplada. Dividir entre agentes cria costura exatamente onde costura é
mais perigosa — dois agentes decidindo diferente sobre como o lag interage com a restrição, sem
ninguém perceber. Ali é `xhigh` com um agente pensando o problema inteiro.

**Coordenação:** ultracode abre vários agentes e este repo tem duas worktrees ativas
(`dev-antigravity`, `dev-vscode`). Antes de disparar F2/F3, confirmar que a outra sessão não
está nos mesmos arquivos.

**Primeiro valor visível:** fim da F3 (cronograma que anda sozinho e Gantt de duas barras).
**Ordem inegociável:** F0 → F1 → F2. F4 pode ir em paralelo com F3; F7 depende de F4 e F5;
F8 depende de tudo.

---

## 7. Decisões que NÃO foram tomadas aqui

- Onde exatamente cada tela vive (é decisão de implementação; a base é o módulo `planejamento`
  que já existe, com o Painel Mestre como tela nova ao lado — **sem módulo novo**).
- Metodologia de cálculo da matriz de risco (Doc 02 §13 diz que será especificada à parte).
- Pesos definitivos da Saúde do Cronograma (D42 — calibrar com projetos reais).
- Round-trip de importação BCF / integração 4D (D28 — só o vínculo fica preparado).
