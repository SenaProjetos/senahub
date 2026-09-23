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
2. ~~**Nomenclatura versionada precisa estar publicada.**~~ **Mergeada em `dev-antigravity` em
   2026-09-23** (F1-F6, aprovada em tela). Falta o deploy — D35 só vale em produção depois dele.
3. **Permissões.** O perfil *Coordenador* com escopo global entrou na v1.19.0; os recursos novos do
   cronograma ainda não existem no catálogo. Seed de permissão é create-only por par — exige
   migration por par novo (ver memória `permissoes-matriz-legada-nao-autoriza`).
4. **Doc 02 precisa ser atualizado** com o resultado de D29 (ID = instância, não tipo; a comparação
   entre projetos é pelo TAT) e D35 (siglas por versão de nomenclatura), e a colisão interna
   `EST` disciplina × `EST` etapa precisa ser resolvida pela equipe.

---

## 7. Decisões que NÃO foram tomadas aqui

- Onde exatamente cada tela vive (é decisão de implementação; a base é o módulo `planejamento`
  que já existe, com o Painel Mestre como tela nova ao lado — **sem módulo novo**).
- Metodologia de cálculo da matriz de risco (Doc 02 §13 diz que será especificada à parte).
- Pesos definitivos da Saúde do Cronograma (D42 — calibrar com projetos reais).
- Round-trip de importação BCF / integração 4D (D28 — só o vínculo fica preparado).
