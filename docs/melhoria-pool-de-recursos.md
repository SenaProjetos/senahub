**Título:** Planejamento e Recursos: alerta de sobreposição por dia, tela por pessoa e cronograma geral (pool de recursos)

_Resumo em três linhas:_ o planejamento quer ver e resolver, no SenaHub, os choques de pessoa entre cronogramas, como faz hoje no "Planejador de Equipe" do MS Project. O alerta passa a ser por dia, com tela por pessoa (Recursos) e cronograma geral (Planejamento), onde se pode arrastar tarefas. O sistema nunca muda data sozinho: avisa, e uma pessoa decide.

---

**1. O problema de hoje**
- Como é feito hoje: o planejamento monta os cronogramas no MS Project. Lá vê, por pessoa, tudo o que ela faz em todos os projetos (Planejador de Equipe), com barras em vermelho onde há superalocação, e arrasta as tarefas para resolver. No SenaHub, a tela Recursos mostra horas planejadas × disponíveis por pessoa, e o alerta de conflito existe só **por semana** (desde 24/11/2026).
- O que dá errado: o alerta por semana não pega o caso do dia. Exemplo: a Mireli está no X de 23 a 25/11 e no Y de 26 a 27/11. O X atrasa 1 dia e ela passa a ter 2 cronogramas no dia 26, mas a semana continua dentro da jornada, e nada é avisado. Também não há tela por pessoa nem visão única de todos os cronogramas, então os choques só aparecem a quem abre cada projeto.
- Quem sofre com isso: planejamento e coordenação de projetos.

**2. Quem usa**
- Planejamento: monta e aprova cronogramas, registra a Data de Status e usa a tela por pessoa e o cronograma geral.
- Coordenação de projeto: recebe o aviso quando um conflito atinge o cronograma aprovado dela e decide se abre "Revisar planejamento".
- Quem só vê: demais usuários com acesso à tela Recursos (a confirmar pela equipe).

**3. Como deveria funcionar**

_3.1 Ao montar e aprovar o cronograma_
1. Ao atribuir uma pessoa a uma tarefa, o sistema preenche as horas sozinho (duração × jornada do dia). Quem planeja ajusta horas ou porcentagem se a pessoa não estiver 100% na tarefa.
2. Se naquele dia a pessoa já passa da jornada por outro cronograma, o dia fica em **vermelho** e o sistema avisa. Quem planeja escolhe outra data, como começar no dia 17 em vez do 15.
3. O aviso vale contra cronogramas aprovados **e contra outros rascunhos**. Ele aparece identificado, por exemplo "com W, em rascunho".
4. Ao aprovar, a confirmação lista os conflitos e pergunta "Aprovar assim mesmo?", como hoje, mas agora por dia.

_3.2 No acompanhamento (dia a dia)_
1. Quando o planejamento registra uma data real (Data de Status) e isso cria conflito com outro cronograma aprovado, o sistema avisa na hora, ao salvar.
2. O aviso vai para o planejamento (quem registrou) e para a coordenação do cronograma aprovado afetado, que decide se abre "Revisar planejamento".
3. O aviso só informa. Tem o botão **"Ver na tela por pessoa"**, que abre a faixa da pessoa com o trecho em conflito destacado.
4. O aviso sai só quando o conflito é **novo**. O conflito antigo continua em vermelho na tela, sem repetir aviso.
5. Não há rotina diária, recálculo automático nem contagem diária de horas no acompanhamento. O aviso compara datas.

_3.3 Tela por pessoa (setor Recursos, aba remodelada, inspirada no Planejador de Equipe do MS Project)_
1. Uma faixa por pessoa, com todas as tarefas dela em todos os cronogramas. Tarefas que se sobrepõem ficam empilhadas dentro da faixa.
2. Escala em **dias**, com zoom para **semanas**. Abre em dias. Botões de recuar e avançar o período e "Hoje".
3. Cada barra mostra o **código do projeto + nome da tarefa**, com **cor por projeto**. O nome completo aparece ao passar o mouse.
4. O trecho em conflito fica em **vermelho forte**, de longe.
5. Aparecem todos com recurso ativo, com filtro por disciplina e por cronograma. **Rascunhos em cinza.**
6. O parceiro externo (por exemplo a Eqp. Climatização) tem faixa própria, **só para ver prazos**, sem horas e sem alerta de carga.
7. No fim da tela há a faixa de **tarefas sem ninguém**, que respeita os filtros. Tarefas de rascunho em cinza. Não entram na carga.
8. **Editar:** arrastar a barra muda a data da tarefa, e a EAP do cronograma se atualiza junto. Arrastar a barra para a faixa de outra pessoa troca o responsável. Arrastar uma tarefa sem ninguém para uma pessoa a atribui, e as horas são preenchidas como em 3.1.
9. Toda mudança por arrasto **pede confirmação**. Em cronograma aprovado, vira **desvio da linha de base**. O sistema respeita as predecessoras, como no Project, e pergunta "Mover também as tarefas seguintes?".

_3.4 Planejamento geral (setor Planejamento)_
1. O setor Planejamento passa a ter duas abas: **Planejamento geral** e **Projetos individuais** (cards por projeto, como hoje).
2. O Planejamento geral mostra uma **EAP única e um cronograma geral** com todos os cronogramas, aprovados e em rascunho (rascunho em cinza), em tabela, em Gantt ou nos dois.
3. Conflitos de recurso aparecem com o responsável em vermelho e o dia marcado. Clicar abre a faixa da pessoa em Recursos.

_3.5 Ajustes no Gantt do cronograma (visual de hoje mantido)_
1. A **barra de ações da linha** (recuar, avançar, subir, descer, copiar, colar, excluir, "N linhas selecionadas · Limpar") sobe do rodapé flutuante para o topo, na linha de "Larguras padrão", logo acima da tabela. Sem seleção, os botões ficam desativados. Cada botão faz o que faz hoje.
2. **Conflito de recurso no Gantt do cronograma individual:** o visual **não muda**. A tarefa na EAP aparece em vermelho quando há superalocação, e o destaque forte do dia em conflito (listras e bordas vermelhas) vale **só** na tela por pessoa e no Planejamento geral.
3. **Marco:** passa a ter **uma data só**, editável no rascunho (hoje o término é recusado). Depois de aprovado, o planejamento registra a **data real do marco** sem "Revisar planejamento", e a linha de base fica como está. A diferença aparece como desvio.

**4. Regras**

| Pergunta | Decisão | Motivo |
|---|---|---|
| A. Alerta por semana ou por dia | **Por dia**, considerando jornada e porcentagem da pessoa. Substitui o indicador por semana de hoje. | O atraso de 1 dia dentro da mesma semana não aparece na conta semanal. |
| B. Horas em toda atividade | **Atribuir já preenche as horas** (duração × jornada do dia); ajusta-se se a pessoa não está 100%. Horas digitadas valem mais que o atalho. | Comporta-se como o Project e ninguém fica de fora da carga. |
| Extra. Parceiro externo | Faixa própria, só prazos, **sem horas e sem alerta**. | A casa não controla as horas dos parceiros. |
| C. Quando o aviso dispara | **Na hora da mudança** (atraso, Data de Status, replanejamento). Sem rotina diária. | O planejamento confirma o status. |
| D. Quem recebe | **Planejamento** (ao salvar) e **coordenação do cronograma aprovado afetado**. A pessoa não recebe. | Quem sofre o efeito decide sobre revisão. |
| E. Só informa ou sugere | **Só informa**, com "Ver na tela por pessoa". Sem sugestão de um clique. | Evita desvio sem olhar o conjunto. |
| F. Avisar só o novo | **Só quando o conflito é novo.** O antigo fica em vermelho. | Sem rotina diária, repetir não faz parte. |
| G. Escala | **Dias e semanas, com zoom.** Abre em dias. | A decisão A é por dia. |
| H. Só ver ou mexer | **Ver, arrastar data e trocar pessoa**, com confirmação; respeita predecessoras e pergunta pelas seguintes. | Manipular graficamente, com decisão humana. |
| I. O que a barra mostra | **Código do projeto + nome da tarefa**, **cor por projeto**, conflito em vermelho forte. | Mostra de relance qual projeto disputa a pessoa. |
| J. Quem aparece | Todos com recurso ativo, filtros por disciplina e cronograma, **rascunhos em cinza**. **O rascunho enxerga aprovados e outros rascunhos.** O aprovado não ganha alerta por rascunho. | Quem monta precisa ver tudo o que já existe. |
| K. Onde fica | **Recursos remodelada** (tela por pessoa). **Planejamento** com duas abas: Planejamento geral e Projetos individuais. | O cronograma geral é a base da comunicação entre cronogramas. |
| L. Tarefas sem ninguém | **Faixa no fim**, que respeita os filtros. | Como no Project. |
| M. Ordem de entrega | **Tudo de uma vez.** | Decisão do planejamento. |
| N1. Marco | **Data única** no rascunho; **data real** depois de aprovado, sem "Revisar planejamento". | Resolve a recusa e acompanha as tarefas. |
| N2. Botões do Gantt | **Barra de ações no topo**, sem mudar o visual do cronograma. | Os comandos ficam perto da tabela. |

Regras em SE … ENTÃO:
- SE a pessoa passa da jornada num dia por tarefas de cronogramas diferentes ENTÃO o dia fica em vermelho.
- SE a tarefa tem pessoa atribuída e ninguém digitou horas ENTÃO as horas são preenchidas (duração × jornada do dia).
- SE o recurso é parceiro externo ENTÃO não há horas, nem vermelho, nem aviso de carga.
- SE o cronograma é rascunho ENTÃO ele enxerga aprovados e outros rascunhos. SE é aprovado ENTÃO não recebe alerta por causa de rascunho.
- SE o planejamento registra data real e cria conflito com cronograma aprovado ENTÃO aviso ao planejamento e à coordenação afetada; nenhuma data muda sozinha.
- SE o conflito já existia ENTÃO não há aviso novo, mas segue em vermelho.
- SE o arrasto muda data de cronograma aprovado ENTÃO confirma e vira desvio da linha de base.
- SE o arrasto passa por tarefa com predecessora ENTÃO respeita a ordem e pergunta se move as seguintes.
- Quem pode editar ou ver: a confirmar pela equipe.
- Quando dá errado (pessoa sem jornada cadastrada, férias ou feriado, dado antigo): vale o que a tela Recursos já faz hoje, com férias, abono e feriado descontados.

**5. Exemplos concretos**
- **Exemplo 1 (montar o cronograma).** Dado que o cronograma X está aprovado com o João Vitor no dia 26/11 (jornada de 8 h) e o cronograma Z está em rascunho, quando eu atribuo o João Vitor a uma tarefa do Z de 26 a 30/11, então o sistema preenche as horas (duração × jornada), marca o dia 26 em vermelho com "conflito com X" e eu posso começar a tarefa depois do conflito. Nada muda sozinho. Se o rascunho W já tiver o João Vitor num dia seguinte, esse dia também fica em vermelho, identificado como "com W, em rascunho". O X não mostra alerta por causa do Z nem do W.
- **Exemplo 2 (a exceção: efeito em cascata).** Dado que a Mireli está no cronograma aprovado X de 23 a 25/11 e no aprovado Y de 26 a 27/11, quando eu registro na Data de Status que ela terminou o X no dia 26, então ao salvar vejo "Mireli: conflito no dia 26/11 entre X e Y" com "Ver na tela por pessoa", e a coordenação do Y recebe o aviso para decidir se abre "Revisar planejamento". A Mireli e a coordenação do X não recebem nada, e as datas do Y não mudam. No dia seguinte, sem mudança, não sai novo aviso, mas o conflito continua em vermelho.
- **Exemplo 3 (arrastar).** Dado que o X está aprovado e a "Modelagem" da Mireli (23 a 25/11) tem a "Revisão interna" logo depois, quando eu arrasto a "Modelagem" 2 dias para a frente na tela por pessoa, então o sistema respeita as predecessoras, pergunta "Mover também a Revisão interna e as seguintes?", pede confirmação, e a mudança vira desvio da linha de base. A EAP do X mostra as novas datas. Se eu arrastar a tarefa para a faixa do João Vitor, o sistema pede confirmação e troca o responsável.

**6. O que não pode mudar**
- O **estilo do Hub**: layout, estética e informações do gráfico (EAP e Gantt) que já existem. Entra de novo só a cor por projeto nas barras e o vermelho forte do conflito.
- **Linha de base**: cor, espessura e traço continuam exatamente como estão.
- Cabeçalho do cronograma, filtros (Todas, A validar, Atrasadas, Críticas, Bloqueadas, Período), colunas da tabela e o comportamento de cada botão.
- A regra de que o sistema **nunca muda data sozinho**.
- Cronograma em rascunho não soma na carga do que já está aprovado; cronograma aprovado congela a linha de base e mudar data depois vira desvio.
- A tela Recursos de hoje (horas planejadas × disponíveis, mapa de calor, sugestões de um clique em sobrecarga) continua existindo na aba "Visão geral".

**7. Fora do escopo**
- Compactar os filtros e o cabeçalho do Gantt (não aprovado).
- Rotina diária de conferência, recálculo automático e contagem de horas diária no acompanhamento.
- Alerta de carga para parceiro externo e limite de tarefas simultâneas dele.
- Destaque forte do dia em conflito dentro do Gantt do cronograma individual.
- Sugestão de um clique dentro do aviso de cascata.
- Lembrete de conflito parado.

**8. Pronto quando**
- [ ] Ao atribuir uma pessoa, as horas são preenchidas (duração × jornada) e o dia em conflito aparece em vermelho forte, por dia.
- [ ] O rascunho avisa conflito com aprovados e com outros rascunhos; o aprovado não recebe alerta por rascunho.
- [ ] Ao aprovar, a confirmação lista os conflitos por dia.
- [ ] Ao registrar a data real que cria conflito, o planejamento vê o aviso ao salvar e a coordenação do cronograma afetado é avisada; a pessoa não.
- [ ] O aviso tem "Ver na tela por pessoa" e abre a faixa com o trecho destacado.
- [ ] O conflito antigo não gera aviso novo e continua em vermelho.
- [ ] A tela por pessoa tem dias com zoom para semanas, filtros, rascunhos em cinza, faixa de tarefas sem ninguém e parceiro externo sem vermelho.
- [ ] Arrastar uma barra muda a data (com confirmação), a EAP atualiza e as predecessoras são respeitadas; arrastar para outra pessoa troca o responsável.
- [ ] Em cronograma aprovado, o arrasto vira desvio da linha de base.
- [ ] O Planejamento tem as abas Planejamento geral e Projetos individuais; o geral junta todos os cronogramas em tabela e Gantt.
- [ ] A barra de ações da linha fica no topo do Gantt, sem mais nada mudar de aparência.
- [ ] No Gantt do cronograma individual, a tarefa em superalocação aparece em vermelho na EAP, e o dia em conflito não ganha destaque novo.
- [ ] O marco tem data única no rascunho e data real depois de aprovado, sem "Revisar planejamento".
- [ ] A linha de base mantém cor, espessura e traço de hoje.

**9. Prioridade e prazo**
Entrega **tudo de uma vez**. Sem data crítica informada pelo planejamento (a confirmar).

**10. Dúvidas em aberto**
_A confirmar pela equipe de programação:_
- O SenaHub já aceita atribuir um parceiro externo (como a Eqp.Climatização) a uma tarefa da EAP?
- Existe campo de porcentagem de dedicação por pessoa (por exemplo, 50% do tempo), além de férias, abono e feriado?
- Existe, em cada projeto, um campo que diga quem é a coordenação, para o aviso saber quem receber?
- Quem pode arrastar e trocar responsável (permissões)?
- A mudança de 24/11 (botões no topo) chegou a esta tela do Gantt? O print de 25/11 ainda mostrava a barra no rodapé.
- Como cada projeto recebe a sua cor (fixa ou automática)?
- Cronograma geral: filtros, projetos recolhidos e desempenho com muitos cronogramas abertos.

_Depende do planejamento:_
- O destaque do conflito no Gantt do cronograma individual: decidido que **não muda**. Ali a tarefa na EAP já fica em vermelho quando há superalocação. A confirmar pela equipe se isso já existe hoje ou entra com esta mudança.
- O que acontece com o aviso quando a data real afeta um cronograma que ainda é rascunho (não foi tratado).
- **Aprovação visual:** só dois pontos foram aprovados nos mockups (destaque do conflito e barra de ações no topo). A tela por pessoa, o Planejamento geral e o aviso ao salvar seguem em alinhamento. Referência: canvas "SenaHub: telas do pool de recursos (proposta visual)". Os mockups são ilustrativos; vale o estilo do Hub.
- Validar na prática, depois da entrega, as regras de horas (B) e de rascunho enxergando rascunho (J) com cronogramas reais.
