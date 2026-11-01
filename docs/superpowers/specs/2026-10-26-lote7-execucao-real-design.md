# Lote 7 — Execução real no Gantt de controle (desenho)

Origem: reunião de análise do Hub de 26/10/2026, com duas capturas do MS Project como referência
(colunas de execução e colunas de variação), e roadmap em
[2026-10-26-reuniao-hub-roadmap.md](2026-10-26-reuniao-hub-roadmap.md). Decisões da equipe de
28/10/2026: um percentual só, custo real = horas × custo/hora + valor digitado em terceiro, variação é
um MODO do Gantt. O dono pediu para desenhar direto, sem rodada de perguntas — as questões em aberto do
roadmap foram resolvidas abaixo como **decisão minha**, a conferir.

## O que já existe (investigação prévia)

- **"Atualizar tarefa" já existe e já grava.** Menu de botão direito da linha → "Atualizar tarefa
  (datas reais)" (`ACAO_ATUALIZAR`, `acoes-eap.ts`) → `ExecucaoDialog` → action `registrarExecucao`
  (`cronograma:executado`) → `registrarExecucaoNaLinha` → regra pura `aplicarExecucao`
  (`execucao.ts`). Só tem campos de início/término real; término real força `status = con` e
  `progresso = 100`. Não tem campo de %.
- **O % parcial inline exige OUTRA permissão.** A célula "% concl." da grade (`plano-gantt.tsx`,
  modo Controle) só é editável quando `onEditarCampo` existe, e `eap-workspace.tsx` só passa essa
  função quando `podeGerir` (`planejamento:gerir`) — não quando a pessoa só tem
  `cronograma:executado`. **É provavelmente aqui que está o "não dá pra editar" da equipe**: quem só
  acompanha (tem `executado` sem ter `gerir`) vê o menu "Atualizar tarefa", mas só consegue mexer em
  datas, nunca no %, e as datas reais de uma tarefa de terceiro sem apontamento forçam 0% ou 100% —
  não há meio-termo.
- **Horas apontadas por linha já são calculadas.** `queries.ts` → `carregarApoioDasLinhas` já soma,
  por `EapTarefa`, os minutos do ponto nas sessões cujo card veio daquela linha
  (`SessaoTrabalho.tarefaId` → `Tarefa.eapTarefaId`), e `mapearTarefaDTO` já expõe isso como
  `horasApontadas` no DTO. **Falta só mostrar numa coluna** — não precisa de cálculo novo para
  "Trab. real" dos internos.
- **Custo real não existe.** `custo.ts`/`custo-service.ts` só calculam o CUSTO PREVISTO (horas
  previstas × custo/hora). Não há soma de horas apontadas POR PESSOA por linha (hoje `apontadoMin`
  soma todo mundo junto) nem campo para o valor de terceiro.
- **`EapProgressoRegistro` já é o histórico do %** (decisão #17), com `origem: informado | execucao`.
  `registrarExecucaoNaLinha` já grava nele quando as datas reais mudam o %. Só falta um terceiro
  caminho (% digitado na própria execução) usando o mesmo mecanismo.
- **O Valor Agregado (F8) já faz uma conta parecida, mas no projeto inteiro**, não por linha
  (`valor-agregado-service.ts`): soma minutos por pessoa no projeto todo, cruza com `Recurso.custoHora`,
  mais o pago a quem recebe por entrega. Não dá para reusar direto (é por projeto, não por linha), mas
  o padrão (separar quem recebe por hora de quem recebe por entrega) é o mesmo que a Custo real por
  linha deve seguir — só que aqui "quem recebe por entrega" já é a `deTerceiro` que vira valor
  digitado.
- **Desvio hoje só tem término.** `plano-gantt.tsx` tem `diasDeDesvio` (fim base × fim previsto); não
  há equivalente para o início.
- **Dur. real / Dur. rest. e Trab. real/Custo real: não existe NADA hoje** (nem campo, nem cálculo).

## Intenção

Quatro pedidos da reunião, numa coisa só: deixar o Gantt de controle mostrar e registrar o que já
aconteceu, não só o planejado × a linha de base.

1. Com o cronograma aprovado ou não, registrar datas reais e **percentual**, inclusive em tarefas que
   não têm apontamento automático (gerais, terceiros, projetos antigos).
2. Separar "marcar 100%" de "aconteceu como planejado": as datas reais são informadas à parte.
3. Colunas de execução na grade do Controle.
4. Um modo "Variação" ao lado de Planejamento/Controle, só com as colunas de comparação com a base.

## Fora do escopo (não fazer)

- Mudar a regra de que término real conclui a linha (100%, `status = con`). Isso já existe e a
  equipe não pediu para mudar — só pediu para também poder informar um % SEM concluir.
- Exigir cronograma aprovado para registrar execução. Hoje `registrarExecucao` funciona em qualquer
  status do plano (rascunho incluso) e ninguém pediu para travar — travar quebraria o caso de uso
  de projeto antigo que nunca teve um cronograma aprovado formal. **Decisão minha.**
- Ligar "valor digitado em terceiro" a uma parcela de contrato ou a `PagamentoProjetista`. Ver 7.3.
- Mudar como o Valor Agregado (F8) calcula o realizado do PROJETO (continua somando por pessoa, no
  projeto inteiro). As colunas deste lote são outra conta, por LINHA, só para a tela.
- Tornar Dur. real / Dur. rest. / Trab. real digitáveis — são sempre calculados (ver 7.2).
- Qualquer coisa do 6c (cores/espessura das barras) — já entregue.

## 7.1 — Percentual parcial e % em tarefas sem apontamento

**Decisão da equipe (28/10):** um percentual só, o `progresso` que já existe.

**Comportamento**

1. `ExecucaoDialog` ganha um campo "% concluído" (0–100), ao lado de início/término real, SEMPRE
   visível (não só em tarefa de terceiro — qualquer linha pode precisar de um ajuste manual).
2. A regra pura (`aplicarExecucao`, `execucao.ts`) ganha `entrada.progresso?: number | null`:
   - Se **término real foi informado nesta gravação** (a linha está concluindo), o % digitado é
     ignorado — concluir sempre vale 100%, como hoje. É o pedido #2: datas reais concluem; % é outra
     coisa.
   - Se não há término real (linha não está concluindo agora), e um `progresso` foi enviado, ele
     **substitui** o `progresso` atual da linha — mas só até 99. Pedir 100 sem término real é
     **recusado** (`falha("Para marcar 100%, informe o término real.")`), do mesmo jeito que toda
     outra entrada invália desta função — nunca um clamp silencioso, que seria a única regra desta
     função a corrigir em vez de recusar. **Decisão minha.**
   - Sem `progresso` no payload, nada muda no %, como hoje.
3. `registrarExecucaoNaLinha` passa o `progresso` resultante para `registrarProgresso` com
   `origem: "execucao"` (reaproveita o enum que já existe — o % saiu da MESMA tela/permissão que as
   datas reais; **decisão minha**, sem mudar o enum).
4. A permissão continua sendo só `cronograma:executado` — este caminho NÃO passa por
   `planejamento:gerir`. É o que resolve o "não dá pra editar": quem só acompanha passa a ter, na
   mesma tela que já usa, como registrar o avanço de qualquer linha, inclusive sem datas.
5. A célula "% concl." da grade (editável só por `podeGerir` hoje) **não muda** — continua sendo o
   atalho de quem monta o cronograma. O caminho novo é o diálogo, para quem só acompanha.
6. Marco não ganha o campo de %: continua sendo 0 ou 100, pela data única.

**Verificação:** estender `execucao.test.ts` com: % parcial sem datas; % ignorado quando término real
vem na mesma gravação; **100 sem término real é recusado** (mensagem acima); histórico grava
`origem: execucao`; marco não aceita o campo.

## 7.2 — Colunas de execução no Gantt de controle

**Pedido:** Iníc. real, Térm. real, % concl. (já existe), Dur. real, Dur. rest., Custo real, Trab. real.
"% física concluída" **não entra** — decisão da equipe de 28/10.

**Trab. real** (`planejamento/queries.ts`)

- É o `horasApontadas` que o DTO já calcula — só falta a coluna em `plano-gantt.tsx`. Em
  agrupamento, soma dos filhos (como as outras colunas de agregado). Tarefa de terceiro **não** tem
  card nem apontamento automático: mostra "—", não zero (zero sugeriria que ninguém trabalhou; "—" diz
  que não se mede por aqui — **decisão minha**).

**Custo real** (novo: `planejamento/custo-real.ts` + extensão de `carregarApoioDasLinhas`)

- Fórmula da equipe: horas apontadas × custo/hora de quem apontou (só quem vê custo) **+** valor
  digitado nas linhas de terceiro (ver 7.3). Como terceiro nunca tem apontamento automático, os dois
  termos nunca se somam na mesma linha — é só "qual dos dois esta linha usa".
- Para o termo de horas, `carregarApoioDasLinhas` precisa agrupar os minutos **por pessoa** dentro de
  cada linha (hoje soma todo mundo junto em `apontadoMin`), para multiplicar cada um pelo próprio
  `Recurso.custoHora` — mesmo padrão de `custo-service.ts`/`valor-agregado-service.ts` (carregar as
  taxas de quem apontou, em lote).
- **Diferente do custo PREVISTO, o custo real não esconde o número por faltar uma taxa.** O previsto
  (`custo.ts`) segue "desconhecido nunca vira zero" porque é um ORÇAMENTO — mostrar incompleto
  enganaria. O realizado é acompanhamento incremental: esconder o número inteiro porque uma pessoa
  (de várias) não tem custo/hora cadastrado tira a utilidade da coluna no dia a dia. **Decisão minha:**
  soma o que sabe e marca com um indicador discreto ("parcial") quando alguém sem custo/hora apontou
  horas na linha — não é motivo bloqueante como em `MotivoSemCusto`.
- Resumo (agrupamento): soma dos filhos, parcial se algum filho for parcial.
- Só aparece para quem já vê a coluna "Custo" hoje. **Correção:** essa gate é `podeVerFinanceiro`
  (`lib/permissions.ts`), o `verCusto` que a página já passa para `eapDoProjeto({ verCusto, verDatas })`
  — não `lib/custo-visivel.ts` (que é de outra tela, Rateio de horas, com uma permissão diferente,
  `ponto:custo`). Custo real usa o MESMO `verCusto`, sem gate nova.

**Dur. real / Dur. rest.** (pura, em `execucao.ts` ou `custo-real.ts` — função nova, sem campo no
banco)

- **Dur. real:** sem início real, "—". Com início real, dias úteis (`diasUteisEntre`, calendário de
  trabalho) entre início real e (término real, ou hoje se ainda não terminou).
- **Dur. rest.:** concluída (`status = con`) → 0. Senão, dias úteis entre hoje e o término PREVISTO
  atual (`fimPrevisto`, que o motor já recalcula a partir do real — L1/D6). Marco: sempre "—" (duração
  de marco não existe).
- Nenhum dos dois é digitável — são sempre a conta, como o motor já faz para tudo o resto (consistente
  com "desvio" e "crítica", que também são sempre calculados).

**Onde entram na grade:** todas depois de "% concl." no modo Controle (`plano-gantt.tsx`), do jeito que
a referência do MS Project mostra. Largura e se entram em `secundaria` (escondidas no modo compacto,
como Custo/Disciplina hoje) é decisão de quem construir — a grade do Controle vai ficar larga; sugiro
Trab. real e Custo real como `secundaria`, Iníc./Térm./Dur. real/rest. não (são o pedido principal).

**Verificação:** estender `smoke:eap-integracao` ou um smoke novo com: linha interna com apontamento
parcial (Custo/Trab. real > 0, < previsto); linha de terceiro (Trab. real "—", Custo real = valor
digitado); linha sem ninguém com custo/hora (Custo real parcial); Dur. rest. zera ao concluir; marco
sem duração real/rest.

## 7.3 — Valor digitado na tarefa de terceiro

**Decisão minha** (a pergunta estava aberta no roadmap): um campo novo na própria linha, não uma
parcela de contrato.

- Novo campo `EapTarefa.custoRealTerceiro` (`Decimal? @db.Decimal(12,2)`, nulo = nada digitado).
  Migração simples, sem backfill (coluna nova sempre nula).
- Só é editável em linha `deTerceiro` (recurso "Externo" na atribuição — a mesma regra que já decide
  "não gera card nem cobra hora"). Em linha que não é de terceiro, o campo nem aparece.
- Fica no MESMO `ExecucaoDialog`, ao lado de %/datas: é onde `cronograma:executado` já edita essa
  linha, e é informação do tipo "o que já aconteceu", igual às datas reais. Entra no schema de
  `registrarExecucao` como `custoRealTerceiro?: number | null` e é gravado junto, na mesma transação
  de `registrarExecucaoNaLinha`.
- **O campo é um valor em R$ — só aparece a quem vê financeiro.** Hoje `ExecucaoDialog` não recebe
  nenhuma informação de visibilidade financeira (só abre atrás de `podeExecutado`). Ganha um prop
  `podeVerCusto` (o MESMO `verCusto`/`podeVerFinanceiro` do resto da página — ver 7.2): sem ele, o
  campo nem aparece no diálogo, mesmo para quem tem `cronograma:executado`. Sem isso, qualquer pessoa
  que só acompanha datas enxergaria e digitaria um valor de custo que a tela esconde em toda outra
  coluna. **Decisão minha**, achado na revisão do desenho.
- **Por que não uma parcela de contrato:** `ContratoParcelaEntrega` é do contrato do CLIENTE
  (faturamento por entrega) — este valor é o CUSTO de contratar um terceiro (ex.: empresa de sondagem),
  o lado oposto. Tratar como a mesma coisa misturaria receita e despesa no mesmo registro.
- **Fora do escopo:** gerar um `Lancamento` de despesa a partir deste valor. Por ora é só o número que
  aparece na coluna Custo real — lançar no Financeiro de verdade (se algum dia for pedido) é outro
  desenho, com todas as regras de `financeiro-nucleo` (categoria, centro, aprovação).
- **Linha que deixa de ser `deTerceiro` com valor já digitado:** o Custo real sempre lê a condição
  `deTerceiro` ATUAL (derivada das atribuições de agora, nunca armazenada) — se a linha virou interna,
  o termo de horas passa a valer e `custoRealTerceiro` é ignorado no cálculo, mesmo sem ter sido
  apagado do banco. O valor não é limpo automaticamente (evita mais um gatilho escondido em quem edita
  atribuições); se a linha voltar a ser de terceiro depois, o valor antigo reaparece. **Decisão
  minha** — é o mesmo princípio de "nunca inventar", só aplicado ao dado, não ao cálculo.

**Verificação:** teste do schema (só grava em linha `deTerceiro`); smoke cobre terceiro com e sem valor
digitado.

## 7.4 — Modo "Variação"

**Decisão da equipe (28/10):** um modo do Gantt, ao lado de Planejamento/Controle — não aba nem tela
própria. Colunas: Início, Término, Início da linha de base, Término da linha de base, Var. do início,
Var. do término (dias).

**Comportamento**

1. `eap-workspace.tsx`: a lista `visoes` (`VisaoTela`) ganha um terceiro botão "Variação", só quando
   `verDatas` (mesma condição de "Controle" hoje).
2. As BARRAS do gráfico não mudam — "Variação" reaproveita exatamente o mesmo `GanttBarra` do modo
   Controle (duas barras do 6c). Só a LISTA DE COLUNAS da grade muda. Por isso não é preciso tocar em
   `ModoGantt` (`gantt-barra.tsx`) nem em `cronograma-geral-view.tsx`/`gantt-mini.tsx`, que usam o tipo
   de 2 valores e não têm essa grade de colunas — a mudança fica contida em `plano-gantt.tsx` e
   `eap-workspace.tsx`. **Decisão minha**, para não espalhar uma mudança de grade numa peça (barra)
   compartilhada com a carteira.
3. Colunas do modo Variação: Código, Nome, Início, Término, Início base, Término base, Var. início,
   Var. término — SEM progresso, SEM recursos, SEM as colunas de execução do 7.2. É a visão "só
   comparação", como a equipe pediu ("em vez de misturar tudo na grade").
4. "Var. início" é a função nova `diasDeDesvioInicio` (igual a `diasDeDesvio`, mas `inicioBaseline` ×
   `inicioPrevisto`), ao lado da `diasDeDesvio` que já existe (vira "Var. término").
5. Sem linha de base (projeto nunca aprovado), o botão "Variação" não aparece — mesma regra que já
   existe para a legenda do Controle (`versoes.length`/baseline ausente já tratados na tela hoje).

**Verificação:** conferência em tela: alternar Planejamento → Controle → Variação não perde filtro nem
seleção; Var. início/término com sinal e cor iguais ao Desvio atual; projeto sem linha de base não
mostra o botão.

## O que fica a cargo de quem for construir

- Nomes de arquivos/funções dentro das camadas do projeto (puro em `modules/planejamento/`, sem I/O
  nos cálculos; leitura em `queries.ts`/`custo-service.ts`; gravação em `execucao-service.ts`).
- Largura das colunas novas e quais entram em `secundaria` no Controle.
- Texto exato das mensagens de erro, do indicador "parcial" do Custo real e do rótulo "—" de Trab.
  real/Dur. real/rest.
- Layout exato do `ExecucaoDialog` com o campo de % e o de valor de terceiro (quando aplicável).
- Ordem de entrega: 7.1 (permissão/%) tem prioridade — é o que resolve a reclamação concreta da
  equipe; 7.2 (colunas), 7.3 (valor terceiro) e 7.4 (modo Variação) são independentes entre si depois
  disso.

## Auditoria

Nível 3 do protocolo: grava dados novos em linha existente (`custoRealTerceiro`), muda uma permissão
efetiva na prática (quem só tem `cronograma:executado` passa a poder mudar `progresso`, hoje restrito a
`planejamento:gerir`) e expõe valor em R$ — conferir com atenção que o novo campo de valor no
`ExecucaoDialog` respeita `podeVerFinanceiro`, igual à coluna Custo real.
