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

## 2. Perguntas que ainda voltam ao Ryan

1. **Conta das horas automáticas (cenário B).** Lendo "proporcional à dedicação", a conta é
   `horas da pessoa = duração × jornada da pessoa × dedicação da pessoa ÷ soma das dedicações`.
   - Mireli e João Vitor a 100%, 5 dias de 8 h: **20 h cada** (4 h por dia).
   - Mireli passa a 50%: Mireli **13,3 h** (2,7 h por dia) e João Vitor **26,7 h** (5,3 h por dia).
   Efeito: baixar a dedicação da Mireli SOBE as horas do João Vitor (o trabalho da tarefa fica em 40 h). É isso? A outra
   leitura é cada um ficar com `duração × jornada × dedicação ÷ número de responsáveis`: Mireli 10 h, João Vitor 20 h, e a
   tarefa passa a ter 30 h.
2. **Jornadas diferentes.** Com a fórmula acima, Mireli (8 h) e um estagiário (6 h), ambos a 100%, ficam com 20 h e 15 h.
   Serve?
3. **"Coordenador edita só o seu projeto".** Hoje, quem tem permissão de montar cronograma edita todo projeto em que é
   membro da equipe, com qualquer papel. Proposta: manter assim. Se o Ricardo é coordenador do Y e projetista no X, ele
   edita os dois. Se for para editar só onde é coordenador, é regra nova.
4. **Aviso à coordenação quando a Gerência ou o administrativo mexe num projeto** (já listado por ele como aberto).

Enquanto essas não voltam, a parte 1 não fecha a conta das horas. O resto anda.

## 3. Escolhas técnicas

### 3.1 Dedicação por disciplina (decisão 5)
- Coluna nova `DisciplinaResponsavel.dedicacao` (percentual inteiro, nulo = usa `Recurso.capacidade`, o padrão). O único
  escritor continua sendo `substituirResponsaveis`, e o histórico (`DisciplinaResponsavelHistorico`) grava a dedicação.
- Editada na linha de agrupamento da disciplina na EAP (onde se escolhem os responsáveis) e em Recursos. `Recurso.capacidade`
  nunca é escrito por esse caminho.
- `Alocacao` (a matriz antiga, por projeto) não é usada: é por projeto e não por disciplina.

### 3.2 Horas automáticas (decisões B e 2)
- `EapAtribuicao` ganha a marca "horas automáticas" (sim/não). Atribuição NOVA de pessoa nasce automática; digitar horas
  desliga a marca (horas digitadas vencem, regra B).
- Atribuição automática é recalculada quando muda a duração da linha, a dedicação ou o conjunto de responsáveis da linha,
  dentro do mesmo `aposMudarEap`. Atribuição antiga sem horas fica como está (decisão 2).
- Perfil sem pessoa e Externo nunca recebem horas.

### 3.3 Conflito por dia (decisão A)
- `detectarSobrecargas` passa a comparar por dia: horas do dia (já distribuídas por `distribuirHoras`) × capacidade do dia
  (jornada × dedicação padrão, menos férias, abono e feriado).
- O conflito de um projeto (`conflitos-recursos.ts`, o chip na faixa e a confirmação ao aprovar) passa a listar dias. O
  rascunho conta contra aprovados e contra outros rascunhos, identificados ("com W, em rascunho"). O aprovado ignora
  rascunhos.
- Na EAP do projeto, o nome da pessoa fica vermelho na coluna Recursos, com o conflito no title/tooltip (decisão 3). A
  linha não muda de cor.

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

1. Dedicação por disciplina, cor por projeto, horas automáticas, conflito por dia (chip, aprovação, nome vermelho na EAP).
2. Tela por pessoa, só leitura.
3. Aviso em cascata.
4. Arrasto na tela por pessoa.
5. Planejamento geral.
6. Parceiro externo com nome.

O perfil Gerência é configuração e pode ser criado a qualquer momento depois do deploy.

Cada parte sai com testes das regras puras, smoke contra o banco de dev e verificação em tela (protocolo de auditoria). Um
spec/plano detalhado por parte entra em `docs/superpowers/plans/` antes de começar a parte.
