# Pool de recursos — desenho para implementar

Data: 25/11/2026. Junta as decisões do planejamento num lugar só e diz como cada uma entra no código.

Fontes, nesta ordem de precedência (a de baixo vence a de cima quando discordam):
1. `docs/melhoria-pool-de-recursos.md` — decisões A–N do Ryan.
2. `2026-11-25-pool-de-recursos-decisoes-ryan.md` — fechamento das 11 pendências (reescreve H, B, C, D e o exemplo 3).
3. Este documento — respostas da equipe e escolhas técnicas.

Levantamento original: `2026-11-24-pool-de-recursos-levantamento.md`.

## 1. Respostas da equipe às dúvidas "a confirmar pela equipe"

| Dúvida | Resposta |
|---|---|
| Perfil **Gerência** | Não precisa de código. Perfil de acesso novo criado em Configurações → Perfis de acesso, com `escopo:global` e as permissões de planejamento (`planejamento:gerir`, `cronograma:ver/executado/aprovar`, `recursos:ver/gerir`), sem `ponto:custo`, financeiro, RH nem configurações. Atenção: `escopo:global` vale para o sistema todo, não só para o Planejamento (a pessoa passa a ver todos os projetos também em Arquivos, Tarefas etc.). |
| "Cronograma geral" do manual | É a mesma tela. `/planejamento/cronograma` já mostra os projetos lado a lado, só leitura. O Planejamento geral é a evolução dela (filtros, recolhido, contador, conflito, clique para a pessoa). |
| Linha de terceiro × parceiro externo | A linha de terceiro é a tarefa com o recurso **Externo** (`ext`): sem horas, sem card, com "custo real de terceiro". O cadastro de parceiro dá NOME a esse Externo ("Externo: Eqp. Climatização"). Tudo o que vale hoje para a linha de terceiro continua valendo. |
| Onde fica o cadastro do parceiro | Em Recursos, aba "Parceiros externos", com `recursos:gerir`. Sem permissão nova. |
| Cor automática dos projetos que já existem | A cor automática é CALCULADA do projeto (sempre a mesma para o mesmo projeto), não gravada. Só a troca manual é gravada. Assim todo projeto, antigo ou novo, já tem cor no dia da entrega, sem rodar carga. |

## 2. Respostas do Ryan (26/11/2026)

1. **Divisão das horas: leitura (a).** A tarefa tem um total fixo de horas, e a divisão entre os responsáveis segue a
   dedicação. Se a dedicação de um cai, as horas dos outros sobem.
2. **Total e jornadas diferentes.** O total da tarefa é `duração em dias úteis × 8 h` (expediente comercial), seja qual for
   a jornada de quem está nela. O total se divide pelo peso de cada pessoa, e o peso é `jornada da pessoa × dedicação`:
   `horas da pessoa = total × peso da pessoa ÷ soma dos pesos`.
   - Mireli e João Vitor, 8 h e 100%, 5 dias: total 40 h, **20 h cada**.
   - Mireli a 50%: pesos 4 e 8, Mireli **13,3 h** e João Vitor **26,7 h**.
   - Mireli (8 h) e estagiário (6 h), ambos a 100%: pesos 8 e 6, Mireli **22,9 h** e estagiário **17,1 h**.
3. **Edição: leitura (a).** Fica como hoje: quem pode montar cronograma edita todo projeto em cuja equipe está, com qualquer
   papel. Nada muda em permissão.
4. **Aviso à coordenação: sim.** Quando alguém que não é coordenador do projeto (Gerência, administrativo) arrasta uma barra
   ou troca a pessoa de uma tarefa desse projeto, a coordenação do projeto recebe aviso. Quem fez a mudança não recebe.
5. **Itens 5 a 7 (nomes no Planejamento geral, faixa da pessoa, "Larguras padrão")**: sem objeção. Valem as propostas da
   seção 4.
6. **Data limite**: não informada.

**Consequência a confirmar com o Ryan (não bloqueia o início):** pessoa sozinha na tarefa recebe o total inteiro. Um
estagiário de 6 h sozinho numa tarefa de 5 dias fica com 40 h (8 h por dia) e aparece em conflito todos os dias. O mesmo
acontece com a Mireli a 50% sozinha (8 h por dia contra 4 h). O sistema não muda a duração sozinho: o conflito aparece e
quem planeja decide (aumentar a duração, pôr mais alguém ou digitar as horas). Pela regra, isso é o esperado, mas vale
confirmar antes da entrega.

## 3. Escolhas técnicas

### 3.1 Dedicação por disciplina (decisão 5)
- Coluna nova `DisciplinaResponsavel.dedicacao` (percentual inteiro 1–100, CHECK no SQL; nulo = usa `Recurso.capacidade`,
  o padrão). Escrita só em `responsaveis-service.ts` (`definirDedicacao`, ao lado de `substituirResponsaveis`). Sem
  histórico: quem deixa de ser responsável perde a dedicação e, se voltar, volta com o padrão.
- Editada na linha de agrupamento da disciplina na EAP (onde se escolhem os responsáveis) e em Recursos. `Recurso.capacidade`
  nunca é escrito por esse caminho.
- `Alocacao` (a matriz antiga, por projeto) não é usada: é por projeto e não por disciplina.

### 3.2 Horas automáticas (decisões B e 2)
- Conta: seção 2, itens 1 e 2 (`total = dias úteis × 8 h`, dividido por `jornada × dedicação`). Função pura, em centésimos
  de hora; o resto do arredondamento vai para a última pessoa, para a soma bater com o total.
- `EapAtribuicao` ganha a marca "horas automáticas" (sim/não). Atribuição NOVA de pessoa nasce automática; digitar horas
  desliga a marca (horas digitadas vencem, regra B).
- Atribuição automática é recalculada (`recalcularHorasAutomaticas`, trava por projeto) no começo de `aposMudarEap` e nas
  actions de pessoas da linha e de dedicação. Atribuição antiga sem horas fica como está (decisão 2).
- Só quem EXECUTA recebe hora automática (projetista, modelador, estagiário, engenheiro). Quem acompanha, revisa ou aprova
  nasce com zero; quem passa de executor para revisor sai do automático com zero. Perfil e Externo nunca recebem.
- A tela só manda as horas quando a pessoa as editou: reenviar o valor carregado sobrescreveria uma conta mais nova.

### 3.3 Conflito por dia (decisão A)
- `detectarSobrecargas` passa a comparar por dia: horas do dia (já distribuídas por `distribuirHoras`) × capacidade do dia
  (jornada × dedicação padrão, menos férias, abono e feriado).
- O conflito de um projeto (`conflitos-recursos.ts`, o chip na faixa e a confirmação ao aprovar) passa a listar dias. O
  rascunho conta contra aprovados e contra outros rascunhos, identificados ("com W, em rascunho"). O aprovado ignora
  rascunhos.
- Na EAP do projeto, o nome da pessoa fica vermelho na coluna Recursos, seguido de "!" (marca que não depende da cor), com
  os dias no title e no texto para leitor de tela (decisão 3). A linha não muda de cor. A coluna é secundária: aparece com
  Compacta desligado.
- A lista agrupa dias seguidos da mesma pessoa com os mesmos outros projetos em trechos (`trechosDosConflitos`).
- A `/recursos` (Visão geral) continua semanal; só o alerta do projeto passou a ser por dia.

### 3.4 Aviso em cascata (C, D, E, F, 8, 9)
- Dispara depois de gravar data real (início/término real) ou Data de Status. % e revisão não disparam.
- Compara os conflitos antes × depois da gravação; só os NOVOS avisam (sem tabela de "já avisado": o novo é o que não
  existia antes da gravação).
- Quem gravou vê na resposta da ação: conflitos novos com aprovados E rascunhos, com "Ver na tela por pessoa". A coordenação
  dos projetos APROVADOS afetados recebe notificação (categoria nova `conflito_recurso`). Rascunho afetado não notifica
  ninguém. A pessoa não recebe.

### 3.5 Tela por pessoa (G–L, 1, 3.3)
- Aba nova em `/recursos`. A tela de hoje vira a aba "Visão geral".
- Faixa por pessoa com barras empilhadas, escala dia com zoom semana, cor por projeto, conflito em vermelho forte, rascunho em
  cinza, Externo nomeado sem vermelho, faixa de tarefas sem ninguém no fim.
- Arrasto (parte 4): data só em rascunho ou com revisão aberta (`trava-plano`); trocar pessoa livre com confirmação; sem
  permissão no projeto = "Sem permissão neste projeto". Toda escrita pelo mesmo serviço da EAP (`definirInicioDaLinha` etc.),
  nunca um caminho paralelo.

### 3.6 Planejamento geral (decisão 10)
- Evolução de `/planejamento/cronograma`: aba "Planejamento geral" ao lado de "Projetos individuais", recolhido,
  filtros (vários projetos, disciplina, pessoa, aprovado/rascunho, período), contador de projetos, pessoa em vermelho no
  dia do conflito, clique leva à faixa da pessoa ou ao projeto. Só leitura.

### 3.7 Cor por projeto (decisão 6)
- Coluna `Projeto.cor` (nula = automática). A automática sai de uma paleta fixa de tokens do design system, escolhida pelo
  id do projeto. Troca no cadastro do projeto com a permissão de editar o projeto.

### 3.8 Parceiro externo (decisão 4)
- Tabela nova de parceiros (nome, disciplina, ativo). A atribuição Externo ganha o parceiro (opcional: Externo sem nome
  continua valendo). Sem horas, sem carga, sem alerta.

## 4. Mockup da equipe (`docs/SenaHub telas do pool de recursos (proposta visual).html`)

Quatro telas, feitas pelo planejamento com o Claude dele. Valem como referência de layout. O estilo é o do Hub. Quando o
mockup e uma decisão discordam, vale a decisão: o mockup é anterior ao fechamento das pendências.

**Adotado como está**
- Recursos, aba "Por pessoa" ao lado de "Visão geral". Filtros Disciplina e Cronograma. Selo "N conflitos". Dias/Semanas,
  setas e Hoje. Legenda das cores por projeto, "Rascunho" e "Conflito no dia".
- Faixa por pessoa: nome, disciplina e jornada ("Elétrica · 8 h por dia"), e um selo "Conflito em 26/11" ou "Conflito em
  26/11 · com Z (rascunho)". As barras se sobrepõem empilhadas, com texto "X · Modelagem sanitária". O dia em conflito fica
  hachurado em vermelho de alto a baixo na faixa. O tooltip do dia diz "Qui 26/11 · Mireli: 14 h em 8 h de jornada" e lista
  as horas de cada tarefa, dizendo se cada uma é de cronograma aprovado ou rascunho.
- Parceiro externo com faixa própria e o selo "Só prazos · sem horas e sem alerta".
- Grupo recolhível "Tarefas sem ninguém · N", com barras tracejadas e "Não entram na carga".
- Planejamento geral com as abas "Planejamento geral | Projetos individuais", a escolha "Tabela | Gantt | Tabela e Gantt",
  e uma linha de grupo por projeto com selo Aprovado/Rascunho, período e barra-resumo. Colunas: EDT, Nome da tarefa,
  Responsável, Início, Término. O responsável em conflito aparece em vermelho com "●". Rascunho em cinza tracejado.
- Aviso ao salvar a data real: diálogo "Data real registrada: conflito de recurso", com a frase do que foi registrado, um
  bloco por conflito (pessoa · dia, as duas tarefas) e "Nenhuma data foi alterada". Botões Fechar e "Ver na tela por pessoa".

**Muda por causa de uma decisão posterior**
- Tooltip da tela por pessoa: o mockup diz "em cronograma aprovado, registra desvio da linha de base". Pela decisão 1, num
  aprovado sem revisão aberta a barra não se move, e a tela diz que é preciso abrir "Revisar planejamento". Sem permissão
  no projeto, a tela diz "Sem permissão neste projeto".
- Planejamento geral (decisão 10): nasce com os projetos RECOLHIDOS (o mockup mostra aberto). Ganha o filtro de projeto
  com seleção de vários e o de período, e mostra quantos projetos estão sendo vistos. Nada se edita ali.
- Diálogo da data real: lista também os rascunhos afetados (decisão 8), sem dizer que alguém foi avisado. A frase "A
  coordenação do Y também foi avisada" só sai quando o Y está aprovado.

**O mockup não resolve (a equipe decide)**
- Várias pessoas na mesma tarefa: a coluna Responsável do Planejamento geral mostra um nome só. Proposta: mostrar todos os
  nomes, separados por vírgula, e pôr em vermelho só quem está em conflito.
- Pessoa em mais de uma disciplina: a faixa mostra "Elétrica · 8 h por dia". Proposta: mostrar a jornada e a dedicação
  padrão. As disciplinas da pessoa vão para o tooltip.
- Cores X/Y/W: vêm de uma paleta de tokens do design system, com claro e escuro. Nunca hex no componente.

**Barra de ações do Gantt (tela 3)**: no mockup, a barra fica numa LINHA PRÓPRIA, logo abaixo dos filtros, com uma borda
azul. A linha tem os botões sempre visíveis (desativados sem seleção), "N linha selecionada · Limpar" e, à direita,
"Larguras padrão". No `dev` de hoje (26b2a8f9), a barra fica na MESMA linha dos filtros, depois deles, e "Larguras padrão"
só aparece quando alguma coluna mudou de largura. Ajuste pequeno, feito antes da parte 1: passar a barra para uma linha
própria, como no mockup.

## 5. Partes (construídas e testadas nesta ordem, publicadas juntas)

Estado em 26/11/2026: parte 1 feita no branch `feat/pool-recursos` (migração `20261126120000_pool_recursos_parte1`,
`npm run smoke:pool-recursos`). A cor do projeto já se escolhe em Editar projeto; quem a mostra é a parte 2. A dedicação
ainda não se edita em Recursos (entra com a tela por pessoa, parte 2).

Parte 2 feita no mesmo branch: `/recursos/por-pessoa` (abas Visão geral | Por pessoa), só leitura, com `?escala=semanas`,
`?de=`, `?disciplina=`, `?projeto=` e `?pessoa=`. Regras puras em `planejador-equipe.ts` (empilhar, janela, filtros), carga
de `cargaDaEquipe` com `comLinhas` + `diario` contando os rascunhos. Os dias acima da jornada somam aprovados E rascunhos
(a tela mostra tudo, identificado). A barra abre o cronograma do projeto. A dedicação se edita no botão Dedicação da
faixa (`planejamento:gerir`, só projetos que a pessoa enxerga). O aviso de conflito do cronograma ganhou "Ver na tela por
pessoa". Fica para depois: parceiro externo (parte 6), arrastar (parte 4).

Parte 3 feita no mesmo branch: `registrarExecucao` (só quando a data real muda) e `definirDataStatus` (só quando a data
muda) tiram a foto da carga por dia ANTES de gravar (`fotoAntesDaDataReal`/`fotoAntesDaDataStatus`, de hoje até o fim do
projeto, contando os rascunhos) e comparam com a de depois (`avisarCascata`, regras puras em `cascata.ts`). Novo = par
(pessoa, dia, outro projeto) que não existia; o aviso à coordenação exige os dois aprovados e o dia acima da jornada só com
aprovados. Coordenação = membro com papel "coord…"; sem coordenador, os gestores (mesma regra do aviso de atividade
concluída); quem gravou não recebe. Categoria `conflito_recurso`, link para o cronograma do projeto afetado; o nome do
projeto de origem só para quem tem `recursos:ver`. A tela de quem gravou abre "Data real registrada: conflito de recurso"
(`aviso-cascata-dialog.tsx`). Falha no aviso nunca derruba a gravação. Limite: tarefa concluída sai da carga (regra de
sempre), então o dia da própria conclusão não vira conflito; o que aparece é o que ainda falta fazer. O início real gravado
pelo ponto não dispara (não é registro do planejamento). `npm run smoke:aviso-cascata`.

Parte 4 feita no mesmo branch: a barra da tela por pessoa é um botão que abre um painel (a tarefa, "Abrir o cronograma",
mudar o início e trocar a pessoa — o caminho de teclado e toque) e, com o mouse, se arrasta. Regras puras em
`planejador-acoes.ts` (mesmas frases da tela e do servidor), escritas em `planejador-service.ts`, actions em
`planejador-actions.ts` (`planejamento:gerir` + escopo + passo de desfazer). Data = `definirInicioDaLinha` (o alfinete),
só com `exigirPlanoEditavelDaLinha` (rascunho ou revisão aberta), recusada em tarefa começada; "Mover também as seguintes"
só aparece quando alguma seguinte pelos vínculos tem data fixada, e leva essas datas os mesmos dias úteis
(`moverRestricoes`) — as outras já andam pelo vínculo. Pessoa = a atribuição muda de dono (horas automáticas
recalculadas); da faixa sem ninguém nasce atribuição automática de projetista. Quem não é coordenador do projeto avisa a
coordenação (categoria `alteracao_cronograma`; sem coordenador, ninguém). `npm run smoke:arrasto-planejador`.

Parte 5 feita no mesmo branch (plano `plans/2026-11-26-pool-recursos-parte5-planejamento-geral.md`): `/planejamento/cronograma`
virou o Planejamento geral, com as abas "Planejamento geral | Projetos individuais". Vê quem vê Recursos e as datas
(`podeVerPlanejamentoGeral`); o antigo Cronograma geral (`cronograma-geral-view.tsx`, `gantt-mini.tsx`,
`cronogramaProjetosAtivos`) saiu. Projetos = os da carga de Recursos. Regras puras em `planejamento-geral.ts`:
- período na URL (padrão: 12 semanas a partir desta segunda-feira, até 1 ano);
- conflito por linha, das sobrecargas por dia de `cargaDaEquipe`. O aprovado conta só os aprovados; o rascunho conta tudo;
- filtro casado nas linhas sem filhos, levando os agrupamentos acima;
- contador.
O motor roda uma vez por projeto: `cargaDaEquipe` ganhou a opção `planos`. Saíram do antigo Cronograma geral, por não estarem
na decisão 10: a busca por nome, as situações concluído, arquivado e cancelado, o filtro "Com atraso" e o Gantt de Controle
(linha de base). `npm run smoke:planejamento-geral`.


1. Dedicação por disciplina, cor por projeto, horas automáticas, conflito por dia (chip, aprovação, nome vermelho na EAP).
2. Tela por pessoa, só leitura.
3. Aviso em cascata.
4. Arrasto na tela por pessoa.
5. Planejamento geral.
6. Parceiro externo com nome.

O perfil Gerência é configuração e pode ser criado a qualquer momento depois do deploy.

Cada parte sai com testes das regras puras, smoke contra o banco de dev e verificação em tela (protocolo de auditoria). Um
spec/plano detalhado por parte entra em `docs/superpowers/plans/` antes de começar a parte.
