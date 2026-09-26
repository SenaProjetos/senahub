# Motor de Planejamento — pendências, decisões e checklists (F4–F8)

**Data:** 2026-09-25 · **Complementa:** `2026-09-23-planejamento-motor-cronograma.md` (o spec, com
notas de implementação por fase).

**Estado:** branch `feat/planejamento-motor`, **sem push**. F0 a F8 prontas no código, com testes,
smokes, lint e build verdes. **Nenhuma tela foi vista por olho humano**: o merge espera o smoke em
navegador do dono (checklists no fim). **F9 (manual) feita em 2026-09-25**; o plano de correção do §7
segue em andamento (o que foi feito está marcado em cada item).

---

## 1. Ordem de deploy

1. `npx prisma migrate deploy` — aplica todas as migrations da branch. Todas são aditivas. Das F7/F8:
   - `20260925090000_pagamento_por_fase`
   - `20260925100000_baseline_custo_previsto`
   - `20260925110000_status_lancamento_previsao` — só o `ADD VALUE` do enum, separada de propósito
     (o Postgres não usa valor novo de enum na mesma transação)
   - `20260925110100_contrato_por_entrega`
   - `20260925120000_parcela_na_assinatura`
   - `20260925130000_baseline_linha_resumo` — com backfill pela árvore atual
   - `20260925140000_valor_agregado_apuracao`
   - `20260925150000_cronograma_executado_para_quem_edita_eap` — só concede permissão (L4); idempotente,
     e nos perfis padrão não muda nada (já tinham os dois lados)
   - `20260925160000_papel_eap_externo` — só o `ADD VALUE` do enum (decisão #1), separada de propósito
   - `20260925160100_atribuicao_externa_sem_pessoa` — os dois CHECKs do recurso "Externo"
   - `20260926090000_modelo_eap` — `modelo_eap` + `projeto.tipoEmpreendimentoId` (decisão #5 / D13)
   - `20260926120000_eap_progresso_historico` — histórico do % concluído (decisão #17); sem backfill
2. `scripts/converter-duracao-eap.ts --gravar` **UMA vez, antes de qualquer pessoa mexer num
   cronograma** (B2). A F0 gravou a duração das linhas antigas em dias CORRIDOS; a partir do B2 toda
   mudança reagenda pelo motor, que conta dias ÚTEIS, e o cronograma inteiro esticaria ~40% no primeiro
   clique. Só cronogramas em rascunho; só a duração que ainda é a de dias corridos; rodar de novo não
   muda nada. Rode primeiro sem `--gravar` e confira a lista.
3. `scripts/herdar-responsaveis-eap.ts --gravar` **UMA vez**. Sem ele, toda linha antiga fica "sem
   responsável" e a Saúde de todo projeto cai no dia do deploy. Rodar de novo depois desfaria escolhas
   do coordenador — para isso existe o botão "Herdar responsáveis" por projeto.
4. `scripts/marcar-etapas-de-terceiro.ts` **UMA vez** (decisão #1). Converte a linha que era
   reconhecida como etapa de terceiro pela ORIGEM (CLI, ARQ, EXT, FIS, APR, CON, OBR) para a marca
   nova, o recurso "Externo". Sem ele, essas linhas voltam a contar como trabalho da casa: ganham card
   ao aprovar o cronograma e passam a ser cobradas de hora e de responsável. Rode primeiro sem
   `--gravar` e confira a lista (no banco de dev, 2026-09-25, não havia nenhuma). Rodar de novo depois
   do deploy remarcaria linha que alguém desmarcou de propósito — é uma vez, e depois pela tela.
5. `npm run verify:motor-cronograma` em produção.

Antes do deploy (meio período, decisão #2): listar quem tem capacidade diferente de 1 e as alocações digitadas
dessas pessoas, para o time redigitar o %, que agora vale sobre a capacidade DELA (50 → 100 se a pessoa está
cheia):

```sql
SELECT u.name, r.capacidade, p.codigo, a.percentual, a.inicio, a.fim
FROM recurso r
JOIN "user" u ON u.id = r."userId"
JOIN alocacao a ON a."recursoId" = r.id
JOIN projeto p ON p.id = a."projetoId"
WHERE r.capacidade <> 1
ORDER BY u.name, p.codigo;
```

Notas:
- F7 e F8 não pedem seed nem permissão nova (reusam `aprovacoes:disciplina`, `cronograma:executado`,
  `financeiro:gerir`, `juridico:gerir`). A permissão do cronograma veio por migration na F2.6.
- Antes do deploy, contar em produção os cards com `Tarefa.eapTarefaId` preenchido (criados em
  rascunho pelo botão antigo, sem responsável): quando o cronograma desses projetos for aprovado,
  título, prazo e responsáveis passam a vir da EAP.
- Nenhum dado existente muda: nenhum cronograma de produção está aprovado (D27), disciplina sem
  etapas paga como antes, contrato existente fica "por data".

---

## 2. Decisões para o time confirmar

Tudo abaixo foi implementado com uma escolha padrão. Os itens marcados **DECIDIR** são os que o time
deve confirmar ou trocar — nenhum trava o uso.

**Respostas do time:** página compartilhável com os 19 itens e um campo de resposta por pessoa —
https://claude.ai/artifact/KB33zeaVCGFkAwYtQcHobG (privada: o dono compartilha com acesso de
**Colaborador**). As respostas ficam no banco da página: coleção `respostas` (um documento por pessoa,
`itens.<id-da-decisão>` = `{escolha, comentario, em}`) e `final/decisoes` (decisão final, só quem edita).

### Respostas do time (2026-09-25)

Os 19 itens **DECIDIR** abaixo foram respondidos (consenso da equipe, registrado pelo dono na página). O
texto de cada item continua adiante como histórico; o que vale é esta tabela.

| # | Decisão | Resposta | Estado |
| --- | --- | --- | --- |
| 1 | Etapa de terceiro | pelo **recurso atribuído**, com um recurso **"Externo"** sempre disponível (não mais pela origem) | feito (`PapelEap.ext`) |
| 2 | Meio período | o % é da **capacidade da própria pessoa** | feito (`4ec610f3`) |
| 3 | Quem vê o Planejamento | mantém a **estrutura, sem datas** | feito (`fa9109ad`) |
| 4 | Heatmap | manter + **seletor de período** (1, 4, 12 semanas, meses) | feito (`610fbbd1`) |
| 5 | Modelos de EAP + Tipo de empreendimento | **prioridade alta**; a partir de arquivo do MS Project (XML) | feito (`ModeloEap` + importação) |
| 6 | Datas fixas ao duplicar | manter (não copia) | — |
| 7 | Linhas antigas sem fase | projetos já criados **não terão EAP nem faseamento** — L5 cancelado | — |
| 8 | Marco da fase concluído | **marca a fase como Entregue** (aprovar/pagar segue manual) | feito (`76d912be`) |
| 9 | Fase de disciplina só de CLT | **liberada com R$ 0**; o % passa para as outras fases | feito (`liberarPagamentosDaFase`) |
| 10 | Onde aprovar a fase | **botão também no card da disciplina** | feito (`05cfa313`) |
| 11 | Parcela "na assinatura" | manter (nasce previsão) | — |
| 12 | Cobrança lançada à mão | **casar automaticamente** com a previsão | feito (`casamento-previsao.ts`) |
| 13 | Previsão no resultado | **incluir** no resultado previsto e no indicador | feito (`f44fcbbf`) |
| 14 | Cobrança pelo projeto (contrato por data) | manter (só avisa) | — |
| 15 | Custo/hora em Recursos | **esconder**; só edita quem gere o financeiro | feito (`00b942c6`, L7) |
| 16 | Custo real no Valor Agregado | **somar** os pagamentos liberados ao PJ | feito (`smoke:recursos-eap`) |
| 17 | % concluído no VA | **histórico** do percentual a cada atualização | feito (`EapProgressoRegistro`) |
| 18 | % sem data real | manter (como o Project) | — |
| 19 | Apurar reprograma | manter automático | — |

Diretriz nova do dono (2026-09-25): a tela do planejamento deve ficar **o mais parecida possível com o MS Project**,
para facilitar a adoção — isto reverte o princípio "sem a interface de planilha" do §1 do spec.

### Modelos de EAP (decisão #5, 2026-09-26)

Feito. `ModeloEap` guarda a estrutura numa coluna JSON validada por Zod (`modelos/estrutura.ts`) — não
em duas tabelas: o modelo é lido e gravado inteiro, nunca consultado linha a linha, e a autoria continua
no MS Project ("editar" é reimportar). `Projeto.tipoEmpreendimentoId` (D13) reusa o `TipoEmpreendimento`
que a `Negociacao` já tinha, e vem preenchido no aceite da proposta.

Camadas: `modelos/mspdi.ts` (leitor puro do XML) → `modelos/mapeamento.ts` (árvore, tipo de linha,
conferência de nome, sugestão de terceiro) → `modelos/aplicar.ts` (o que gravar) → `modelos/service.ts`
+ `actions.ts` + rota `/api/planejamento/modelos/previa`. Tela: `/planejamento/modelos` (biblioteca +
assistente de importação) e o botão "Usar modelo de EAP" no estado vazio da EAP do projeto.

Decisões de implementação que o time deve conhecer:
- **Horas não são importadas.** No arquivo real, `Work == Duration` nas 159 atribuições (recurso −65535):
  é o padrão do Project, não estimativa de ninguém.
- **Datas e pessoas não vêm** (mesma regra da duplicação de projeto). O motor reagenda na hora.
- **O casamento de nome é conferido por gente.** Dos 10 nomes de disciplina do arquivo real, 3 não têm par
  no catálogo (`TELECOMUNICAÇÕES`, `SEGURANÇA E ALARME`, `GLP`) e 3 agrupamentos são do processo, não
  disciplina. Adivinhar deixaria linha sem disciplina — que não herda responsável (D22) nem fecha marco de
  fase (decisão #8), em silêncio. A resposta fica gravada no modelo e é reusada na importação seguinte.
- **Disciplina que o projeto não tem é podada com o galho inteiro**, e a tela diz o que saiu. O sistema
  NÃO cria `Disciplina` no projeto (ela carrega valor, responsáveis e pagamento).
- **Aplicar exige EAP vazia e projeto sem linha de base**; o cronograma nasce em rascunho (D14/D27).
- O arquivo sobe por rota multipart (966 KB no real; Server Action corta em 1 MB).
- Verificações: `npm run smoke:modelo-eap` (19 conferências) e `npm run verify:modelo-mspdi` (roda o
  arquivo real de `docs/samples`, fora do git).

**D38 resolvido no mesmo pacote.** O XML não tem valor nenhum, mas o percentual por fase não podia
ficar de fora: `DisciplinaEtapa` só nasce pelo editor de etapas (F4) ou pela duplicação, então **projeto
novo não tem fase cadastrada em disciplina nenhuma** — e aplicar o modelo descartaria a fase de TODA
linha (a regra "a fase só acompanha a disciplina que a tem"), levando embora o marco que marca a fase
como Entregue (decisão #8) e a base do pagamento por fase, em silêncio.

Agora a **conferência da importação pede o percentual de cada fase que o modelo usa** ("Básico 40%,
Executivo 60%"), com soma obrigatória de 100 (a mesma regra que o pagamento por fase exige para
aprovar; validada em centavos, então 33,33 + 33,33 + 33,34 fecha). Aplicar o modelo **cadastra essas
fases nas disciplinas do projeto que ainda não têm nenhuma**, na mesma transação das linhas — e por isso
a linha já guarda a fase que está sendo criada. Disciplina que JÁ tem fase não é tocada (o valor pode
estar repartido, e a primeira liberação fixa se a disciplina paga inteira ou por fase).

Deixar os percentuais em branco é resposta válida: nenhuma fase é cadastrada, e a tela de aplicar avisa,
em amarelo, quais disciplinas ficam sem fase e o que isso custa. A prévia lista, antes do clique, as
fases que serão cadastradas com o percentual — porque cadastrar fase põe a disciplina no **pagamento por
fase**, e isso é decisão de dinheiro.

### Cronograma — realizado (L1, 2026-09-25)
- **DECIDIR — % sem data real** segue o MS Project: > 0% conta como iniciada no início calculado; 100% como
  concluída nas datas calculadas. Alternativa: exigir a data real (sem início real = não iniciada).
- **DECIDIR — Apurar já reprograma** o trabalho não feito para depois da Data de Status (no Project é um
  comando à parte). Alternativa: botão separado "Reprogramar".
- Data de Status no futuro é recusada (empurraria o trabalho para depois de um dia que não chegou).

### Cronograma e equipe (F5–F6)
- ~~**DECIDIR — "etapa de terceiro"** reconhecida pela **origem** da linha (CLI, ARQ, EXT, FIS, APR,
  CON, OBR).~~ **RESOLVIDO (decisão #1, 2026-09-25):** quem marca é o **recurso "Externo"**
  (`PapelEap.ext`), posto na linha pelo botão **Etapa de terceiro** da seção Recursos. Origem responde
  "de onde veio a demanda", não "quem faz" — e o editor da linha nunca teve o campo Origem, então na
  prática nenhuma linha era de terceiro. `ext` nunca tem pessoa nem horas (dois CHECKs no banco), a
  linha aceita gente da casa junto (o coordenador que acompanha), o verificador não cobra responsável
  dela e ela não gera card. Verificação: `npm run smoke:etapa-terceiro`.
- Aprovar o cronograma não avisa ninguém dos cards novos (200 linhas não podem disparar 200 avisos).
- "Projetista" numa linha da disciplina Elétrica **é** o "Projetista Elétrico": o perfil não tem
  catálogo separado.
- O % de cada atividade é o **informado pela coordenação** (como no Project). O status da disciplina
  e o checklist do card viram **sugestão**. Horas apontadas **não** sugerem % (gastar hora não é
  avançar).

### Pagamento do projetista por fase (F7.4)
Como no Project, onde o custo de uma tarefa fica fixado quando ela é concluída:
- Fase aprovada **congela** o valor e quem recebe. Quem entra no time no Executivo não recebe parte do
  Básico; quem sai não perde a parte do Básico.
- Mudar o valor da disciplina depois de aprovar alguma fase só mexe nas fases que **faltam**.
- A disciplina paga **inteira ou por fase**, nunca os dois (fixado na primeira liberação).
- Com fases cadastradas, a soma dos % precisa fechar 100% para aprovar — antes as fases eram só prazo.
- Fase de 0% é aprovada sem pagamento (não cria linha de R$ 0,00 na Produção).
- ~~**DECIDIR (raro):** fase aprovada quando a disciplina era 100% CLT fica "aprovada" mas não
  "liberada".~~ **RESOLVIDO (decisão #9, 2026-09-26):** a fase é **liberada com R$ 0**. Pendente, o % dela
  continuava disputando o pool — bastava um PJ entrar depois para uma fase já aprovada voltar a pagar.
  Liberada em zero, o % dela passa para as fases que faltam (regra 2 de `pagamento-fase.ts`): Básico 40%
  feito pela equipe própria + PJ que entra depois = Executivo com o valor INTEIRO da disciplina. Nenhuma
  linha de R$ 0,00 nasce na Produção, e a soma dos percentuais continua dispensada quando não há ninguém a
  pagar (travar por causa de plano em rascunho seria trava sem dinheiro em jogo).
  A regra saiu do `if/else` da action para `liberarPagamentosDaFase`: um caminho só decide dinheiro, e o
  smoke alcança a regra sem sessão. `bloqueioValorEmModoFase` ganhou mensagem própria para o caso de todas
  as fases liberadas em zero — mandar "ajuste na Produção" apontaria para uma tela vazia.
  Verificação: `npm run smoke:pagamento-fase`.

### Datas reais e marcos (F7.0)
- **DECIDIR:** concluir o **marco** de uma fase **não** marca a fase como Entregue — só oferece
  "aprovar a fase" quando ela já está Entregue. A alternativa é o marco concluído marcar a fase
  sozinho.
- Reabrir o marco depois da fase aprovada **não** desfaz a aprovação nem o pagamento.
- Concluir atividade (término real) põe 100%; reabrir não inventa o % de volta.

### Custo previsto (F7.1)
- Custo da linha = horas previstas × custo/hora da pessoa (Recursos). Linha com vaga sem pessoa,
  pessoa sem custo/hora ou sem horas fica "sem custo" — **nunca R$ 0,00** — e o total aparece
  "incompleto".
- A linha de base guarda o custo no dia em que é aprovada (como a Linha de Base do Project).

### Contrato por entrega e previsão de recebimento (F7.2/F7.3)
- **DECIDIR:** a parcela "**na assinatura**" também nasce como **previsão** e só vira cobrança
  quando o financeiro **fatura**. A D9 fala de parcela de marco; a da assinatura não é. A alternativa
  é gerar a da assinatura já como conta a receber.
- Faturar **converte** a previsão na mesma linha.
- ~~Se o time emite a cobrança por outro caminho (NF lançada à mão), a previsão fica sobrando.~~
  **RESOLVIDO (decisão #12, 2026-09-26):** receita de PROJETO lançada à mão procura a previsão da parcela
  e a assume. Casar, nos dados, é o mesmo estado de "Faturar": a **parcela passa a apontar para o
  lançamento manual** e a linha de previsão é excluída — sem campo novo, e com as invariantes de sempre (a
  sincronização só toca linhas `previsao`; "Faturar" depois é recusado com "já existe cobrança").
  A regra (`casamento-previsao.ts`, pura) é deliberadamente conservadora, porque o erro é assimétrico:
  casar errado APAGA a previsão de uma parcela que ninguém faturou, e não casar deixa a duplicidade
  visível na tela. Então exige **valor exato ao centavo**, vencimento a no máximo **45 dias**, e **empate
  não casa** (duas parcelas do mesmo valor e mesma distância → avisa e não escolhe). Recorrência não entra
  (não é parcela de entrega), nem despesa, nem receita sem projeto, nem lançamento que entra aguardando
  aprovação. Quando não casa mas havia previsão no projeto, a tela recebe o aviso na hora — com o diálogo
  ainda aberto. O caminho de volta existe e está no smoke: excluída a cobrança manual, a sincronização
  recria a previsão da parcela (a parcela volta a "sem lançamento vivo").
  **Fora do escopo, de propósito:** importação de extrato (OFX) e conciliação bancária criam lançamento
  SEM projeto — não há como saber de que parcela é aquele crédito, e casar por valor solto seria adivinhar
  com o dinheiro de outro. Nessas, quem fecha a parcela continua sendo "Faturar" na tela do contrato.
  Verificação: `npm run smoke:previsao-recebimento`.
- ~~A previsão não entra no resultado previsto do projeto nem no KPI de receita prevista.~~ **Resolvido
  (decisão #13, 2026-09-25):** entra nos dois. `margemProjeto` já a somava por acidente (tudo que não é
  confirmado caía em `receitaPrevista`); agora é explícito e destacado (`receitaPrevisao`, mostrado no
  cartão de margem). O KPI da home (`kpisHome`, que alimenta também o snapshot diário) era o que não a
  contava. Faturar troca o status da mesma linha: nada em dobro (smoke `previsao-recebimento`).
  **Fechado pela decisão #12 (2026-09-26):** a cobrança lançada à mão para a mesma parcela agora a assume,
  e a previsão sai do caixa.
- Previsão que passou da data sem ser faturada fica na 1ª semana da projeção, marcada "atrasada".
- Marco apagado deixa a parcela sem data (nunca vira cobrança na hora).
- Depois de faturar qualquer parcela, o plano do contrato trava.

### Valor Agregado (F8)
Os campos de valor agregado do Project: VP = COTA, VA = COTR, CR = CRTR.
- ~~**DECIDIR:** o custo real (CR) é só o **apontado no ponto**; pagamento de PJ por entrega não entra.~~
  **RESOLVIDO (decisão #16, 2026-09-26):** em R$, cada pessoa entra por UMA fonte — quem recebe por hora
  (CLT, estágio) entra por horas apontadas × custo/hora; quem tem **pagamento liberado neste projeto**
  entra pelo VALOR do pagamento, e as horas dele saem da conta em R$ (somar os dois contaria o mesmo
  trabalho duas vezes). Em **horas** nada muda: hora apontada é hora trabalhada, de quem for. Só conta
  pagamento liberado **até a Data de Status**. O quadro avisa quanto veio de pagamento e que as horas
  dessas pessoas ficaram fora do R$. "Quem é pago por entrega" não é papel cadastrado: é quem TEM
  pagamento liberado no projeto — o dado, não o rótulo.
- ~~**DECIDIR:** o VA usa o % informado **de hoje** (o sistema não guarda histórico de %).~~
  **RESOLVIDO (decisão #17, 2026-09-26):** `EapProgressoRegistro` guarda uma linha por MUDANÇA de %, com o
  valor `anterior`, o autor, a origem (`informado` na edição / `execucao` nas datas reais) e a **Data de
  Status vigente** no momento da digitação. O VA lê o % vigente na Data de Status
  (`progresso-historico.ts`, puro). Três regras que o smoke fixa:
  - Vale também o que foi digitado DEPOIS, se foi digitado **enquanto aquela era a Data de Status** — é a
    ordem normal (atualizar na segunda o que valia na sexta e só então apurar). Filtrar só pelo relógio
    deixaria a apuração PIOR que antes do histórico.
  - Antes do primeiro registro vale o `anterior` dele, nunca o valor de depois (trazer o futuro para o
    passado era o erro óbvio). É também o que dispensa script de backfill.
  - Linha sem registro nenhum cai no % de hoje (o comportamento antigo) e o quadro AVISA quantas são —
    calar deixaria o VA otimista sem ninguém ver.
  Escrita na MESMA transação do `update` da linha; linha-resumo não entra (o % dela é rollup do motor). A
  tabela serve à conta do VA: o rastro para o usuário continua no histórico do projeto, pela auditoria da
  ação. Verificação: `npm run smoke:progresso-historico`. Cada apuração continua sendo gravada quando a
  Data de Status é definida.
- O planejado (VP) espalha o orçamento da atividade igualmente pelos dias úteis da barra de base
  (perfil uniforme, o padrão do Project).
- Duas colunas: em horas, para quem acompanha o cronograma; em R$, só para quem vê o financeiro.

---

## 3. Limitações conhecidas

- ~~As datas reais ainda não movem o cronograma (D6 pendente).~~ **Resolvido (L1):** o motor lê as
  datas reais (concluída nas reais, iniciada no início real, sem seguir o vínculo) e, com Data de Status,
  reprograma o trabalho não feito para o dia útil seguinte a ela (em andamento: a parte feita fica, o
  restante anda). "Atrasada" (verificador e filtros da tela) passou a medir contra o término da linha de
  base (sem ela, o plano sem reprogramar). Data de Status futura é recusada. Testes em
  `motor-execucao.test.ts`; smokes `recursos-eap` (3) e `previsao-recebimento` (1).
- **Novas limitações do L1 (registradas, não bloqueiam):**
  - a carga planejada espalha as horas de uma tarefa em andamento desde o início real — parte delas cai
    no passado e some da carga (o certo seria só as horas restantes, depois da Data de Status);
  - o card antigo de EVM do projeto (`projetos/evm`, aba Financeiro) lê as datas gravadas em dias
    corridos: o VP dele muda quando a previsão é reprogramada;
  - o ritmo observado (D21) ainda não corrige a previsão de término — só a Data de Status e as datas
    reais movem;
  - o motor não olha o status da linha: uma linha suspensa, cancelada ou arquivada seria reprogramada
    como qualquer outra (o Project ignora tarefa inativa). Hoje nenhuma tela põe linha nesses status, então
    não acontece — tratar se isso mudar.
- ~~**Faturar parcela** só pelo diálogo Pagamento do Jurídico; quem é só do financeiro não chegava lá.~~
  **Resolvido (L2):** cartão "Parcelas a faturar" na aba A receber de Contas (`financeiro:gerir`), com o
  marco concluído no topo e o mesmo Faturar; a notificação leva para lá. O diálogo do Jurídico segue valendo.
- ~~**"Aprovar fase"** fica no diálogo Etapas, que só abre para quem edita o projeto.~~ **Resolvido (L3):**
  fila "Fases a aprovar" na página Aprovações, com o mesmo Aprovar (`aprovacoes:disciplina`). O botão no card
  da disciplina NÃO foi feito — quem só aprova usa a fila; quem edita já tem o diálogo Etapas no card. A página
  segue gated em `uploads:validar` (no dev, o Coordenador tem os dois pares).
- ~~**"Atualizar tarefa"** (datas reais) é de `cronograma:executado` (quem gere recursos); o editor da
  linha é de `planejamento:gerir`. Populações diferentes.~~ **Resolvido (L4):** a migration acima concede
  `cronograma:executado` e `cronograma:ver` a quem já tem `planejamento:gerir`. Aprovar segue separado.
- As linhas da EAP existentes estão **sem fase**: nada gravava a fase até a F7.0.
- ~~Parcelas manuais do projeto e previsão de contrato por entrega podem somar juntas na projeção.~~
  **Resolvido (L6):** "Gerar parcelas" do projeto recusa com contrato por entrega em vigor; com contrato por
  data que já tem plano, só avisa.
- A página /recursos mostra o custo/hora de cada pessoa a quem tem `recursos:ver`, embora a EAP só
  mostre custo a quem vê financeiro.
- Baselines aprovadas antes da F7.1 não têm custo: a coluna R$ do Valor Agregado fica sem número até
  replanejar.
- ~~Carga: o heatmap da matriz enxerga só alocação digitada.~~ **Resolvido (L9):** o heatmap soma a
  digitada com as horas dos cronogramas aprovados (`heatmap-recursos.ts`), nas 12 semanas que a carga cobre;
  depois disso, só a digitada. "Superalocado na janela" e o Rebalancear seguem olhando só a digitada.
- ~~Meio período: as duas telas liam o "50%" de jeitos diferentes.~~ **Resolvido (decisão #2, 2026-09-25):**
  o % de uma alocação é da **capacidade da própria pessoa** (100 = tudo o que ela dedica a projetos; quem
  trabalha meio período se enche com 100%). A Carga planejada (`parcelasDaAlocacaoDigitada`, em horas)
  já lia assim; a matriz, o heatmap e o chip "calc" passaram a ler igual — `capacidadePct` é sempre 100 e
  `percentualDaCapacidade` (`heatmap-recursos.ts`) divide as horas pela semana útil DELA. Isto desfaz a
  "Revisão (unidades)" do L9, que tinha ido para a jornada cheia.
  **Dado que muda de significado:** em produção a matriz comparava a alocação digitada com
  `multiplicador × 100`. Quem tem `capacidade ≠ 1` e alocação digitada passa a aparecer com metade da
  ocupação — ver o passo "Antes do deploy" da ordem de deploy.
  Sugestões de sobrecarga são sob demanda (1,3 s com 10 sobrecargas).
- Ponto: tarefa escolhida numa troca no meio do dia não sobrevive à edição do dia.

---

## 4. Bugs anteriores ao trabalho

**Corrigidos:**
- Projeção de caixa cortava na meia-noite local contra vencimento em meia-noite UTC: o que vencia
  hoje sumia, e cada semana começava um dia errado.
- Card da disciplina dizia "pagamento já liberado · aprovar não gera novo" com só a 1ª fase paga; o
  alerta de SLA escondia disciplina com fase parcial.
- Desbloquear uma linha a punha sempre "em andamento", mesmo sem ter começado.

**Não corrigidos (fora do escopo, registrados):**
- ~~"Faturar entrega" da disciplina (N-26) cobra do **cliente** o `Disciplina.valor`, que é o pool de
  pagamento dos PJ — custo usado como receita.~~ **Corrigido (B1):** o diálogo pede o valor, sugerido pelo
  item da proposta de origem (mesma disciplina, pelo catálogo ou pelo nome) e nunca por `Disciplina.valor`;
  com contrato por entrega em vigor a lista some e a action recusa. Regras em `receita/faturamento.ts` e
  `receita/valor-entrega.ts`; `smoke:previsao-recebimento` §8; oráculo do receber idêntico (fora o campo
  novo `previsaoAtrasada`).
- ~~`editarEapTarefa` força o tipo atividade/marco mesmo editando linha de disciplina/resumo.~~
  **Corrigido (B2):** o editor pede **duração em dias úteis** (datas calculadas), só alterna atividade ↔
  marco (`edicao-linha.ts`, puro), agrupamento não grava duração, toda mudança da EAP reagenda
  (`aposMudarEap` → `reagendarProjeto`, que também grava o avanço do agrupamento pelo motor — o rollup
  antigo por média simples saiu) e o DTO mostra as datas do motor. `gerarEapDasDisciplinas` cria a linha
  com os dias úteis até o prazo. Achado junto: a F0 gravou duração em dias corridos → script
  `converter-duracao-eap.ts` no deploy (ordem acima).
- ~~Duplicar projeto copia a EAP sem tipo, duração, restrição e classificadores.~~ **Corrigido (B3):**
  copia estrutura (tipo, duração, prioridade, fase/classificadores globais, tipo e lag das dependências),
  com ID corporativo novo; cronograma novo em rascunho, com início opcional no diálogo. **Não** copia
  restrições de data (datas absolutas do projeto de origem), avanço, datas reais, bloqueio, horas nem
  pessoas. `smoke:duplicar-projeto` (20 checagens).
- **B3, revisão:** a cópia também leva as etapas por fase das disciplinas (só fase global; sem prazo,
  situação nem pagamento) e o vínculo `Disciplina.disciplinaId` com o catálogo — antes a linha copiada
  guardava uma fase que a disciplina do clone não tinha (invisível e sem como editar). Continuam de fora
  `exigePacoteA/B` e a faixa de numeração por projeto da disciplina.
- **Achado no caminho (corrigido junto):** nenhum caminho de criação atribuía o `idCorporativo` — só o
  backfill da F0. Linhas criadas por "Nova tarefa", "Gerar EAP das disciplinas" e pela duplicação ficavam
  com a identidade nula, e `verify:motor-cronograma` acusaria. Agora os três (e o `seed:demo`) reservam o
  ID pelo contador `EapSequencia` (`id-corporativo.ts`). Linhas criadas na branch antes desta correção,
  em algum banco, precisariam de backfill — em produção não há (a branch ainda não subiu).
- ~~`Promise.all` dentro de transação em `comercial/service.ts`~~ — **corrigido (B4)**, em 3 pontos
  (2 em `comercial/service.ts`, 1 em `uploads/actions.ts`); teste-guarda em
  `src/lib/promise-all-em-transacao.test.ts`.

---

## 5. Checklists em navegador (antes do merge)

### Lote de decisões do time (2026-09-25/26) — NENHUMA destas telas foi aberta em navegador

**#1 — Etapa de terceiro (recurso "Externo")**
- [ ] Recursos da linha: botão **Etapa de terceiro** marca; a lista mostra "Externo (etapa de terceiro)"
      com a etiqueta *terceiro*, sem campo de papel nem de horas; a lixeira desmarca (o confirm fala em
      "marca de etapa de terceiro", não em perfil).
- [ ] Marcar duas vezes é recusado com "já está marcada como etapa de terceiro".
- [ ] Coluna **Recursos** da tabela mostra `terceiro`; com alguém da casa junto, `terceiro; Maria`.
- [ ] O verificador não acusa "sem responsável" nessa linha; aprovar o cronograma não gera card dela.
- [ ] Duplicar o projeto: a linha de terceiro continua marcada no clone (e não ganha responsável herdado).

**#5 — Modelos de EAP (importar do MS Project)**
- [ ] Gestão → **Modelos de EAP** → Importar do MS Project com o XML real da casa.
- [ ] Conferência: cada agrupamento com o palpite e a etiqueta de como casou; trocar `GLP` para **Gás**;
      deixar `GESTÃO E INICIAÇÃO` como **Agrupamento**; desmarcar um terceiro sugerido que não seja.
- [ ] **% por fase** (D38): deixar em branco grava; preencher 40/60 grava; 40/40 bloqueia o botão com a
      soma na tela; informar só uma fase é recusado.
- [ ] Modelo gravado aparece na lista com contagem, tipo e arquivo; a página dele mostra o que cada nome
      virou e a árvore.
- [ ] Projeto novo com EAP vazia: **Usar modelo de EAP** mostra a prévia (linhas, marcos, vínculos,
      terceiros), o que fica de fora por disciplina, as fases que serão cadastradas e a etiqueta
      **sugerido pelo tipo do projeto**.
- [ ] Aplicar: a EAP nasce inteira, em rascunho, já reagendada; as fases aparecem em Etapas da disciplina
      com o percentual; o marco de fase fecha a fase.
- [ ] Aplicar de novo é bloqueado com a frase, sem tentar.
- [ ] Projeto novo: campo **Tipo de empreendimento** no formulário e no diálogo de edição; projeto vindo
      de proposta aceita já vem com o tipo da negociação.

**#17 — Histórico do % / Valor Agregado**
- [ ] Editar o % de uma linha (célula e janela) e conferir no Valor Agregado que a Data de Status antiga
      mantém o número antigo.
- [ ] Atualizar o % com a Data de Status numa sexta e apurar na segunda: o valor digitado conta.
- [ ] O quadro avisa quando há atividade com avanço e sem histórico.

**#16 — Custo real com PJ**
- [ ] Projeto com pagamento liberado a PJ: o CR em R$ soma o pagamento, o CR em horas não muda, e o
      quadro avisa. Cancelar o pagamento tira do CR.

**#9 — Fase de equipe própria**
- [ ] Disciplina só com CLT: aprovar a fase mostra "aprovada" e o valor da fase como R$ 0 (cadeado), sem
      linha nova na Produção; a fase seguinte mostra o valor inteiro quando entra um PJ.

**#12 — Cobrança lançada à mão**
- [ ] Novo lançamento: receita do projeto com o valor exato de uma previsão → aviso "casado com a
      previsão…"; a previsão sai de Contas a receber e do fluxo de caixa; **Faturar** naquela parcela
      passa a ser recusado.
- [ ] Mesmo caso com valor diferente → aviso amarelo explicando por que não casou.
- [ ] Excluir a cobrança lançada à mão e reagendar/sincronizar: a previsão volta.

### F4 — Etapas
- [ ] Abrir Etapas numa disciplina, adicionar BS e EX; editar data por teclado (inclusive Backspace
      num segmento); o card mostra o MAIOR prazo; o diálogo de edição trava o prazo.
- [ ] Link público filtrado por fase (com e sem "sem fase"), em janela anônima.

### F5 — Recursos
- [ ] Seção "Recursos" da linha: adicionar pessoa com papel; mesma pessoa em 2 papéis (PRO + REV)
      pode; mesma pessoa+papel 2x é recusado.
- [ ] Horas: sair do campo grava; valor absurdo (>99999) volta ao salvo; Backspace/Enter se comportam.
- [ ] Perfil (sem pessoa) não vira principal; marco com horas desabilitado e frase explicando.
- [ ] Linha que virou agrupamento com gente antiga: só leitura + lixeira.
- [ ] Coluna Recursos (avatares, "P" de perfil, "sem gente", "s/h", "terceiro"); botão "Herdar
      responsáveis".
- [ ] Aprovar cronograma com alocação digitada e/ou sem horas: o confirm avisa antes.
- [ ] /recursos: alocação de projeto aprovado riscada; chip "calc"; nova alocação em projeto aprovado
      desabilitada com o motivo; aba "Carga planejada" com estouros e "Ver sugestões".
- [ ] Card vindo de cronograma aprovado: aviso "vem do cronograma", campos da EAP travados.
- [ ] Botão "gerar card" desabilitado em rascunho, com o motivo.

### F6 — Ponto com tarefa
- [ ] Campo de tarefa só com projeto escolhido e tarefa aberta; reunião esconde.
- [ ] Entrada com tarefa grava; volta do descanso mantém; troca/editar dia/offline mantêm.
- [ ] EAP mostra apontado × previsto; sugestão "usar" só preenche; resumo bloqueado.

### F7 — Dinheiro (a tela de Produção pede conferência antes do deploy)
- [ ] Etapas com PJ + valor: soma 95% → "Aprovar" recusa com a mensagem de ajustar.
- [ ] 100%, fase "Entregue" → "Aprovar" → confirm → "pagamento liberado"; fase aprovada com % travado
      e cadeado no valor e no lugar da lixeira.
- [ ] Coluna Valor das etapas: liberada = congelado; pendentes = previsão pela regra do que falta.
- [ ] Produção (lista, agrupada, lote, mover, editar): "Disciplina · SIGLA"; busca pela sigla acha.
- [ ] Extrato do PJ e recibo nomeiam a fase.
- [ ] Valor da disciplina abaixo do liberado → recusa; acima → só as pendentes mudam.
- [ ] Aprovar a disciplina inteira com uma fase já liberada → libera só as que faltam.
- [ ] Editar/estornar pagamento de fase → valor da disciplina anda pela diferença.
- [ ] Custo na EAP (financeiro): coluna, total ou "incompleto", "s/ custo" com motivo; quem não vê
      financeiro não vê nada disso; Exportar Excel com a coluna só para o financeiro.
- [ ] Campo Fase no editor da linha; "· SIGLA" na coluna Disciplina.
- [ ] "Atualizar tarefa": início/término reais; ✓ na lista; data futura recusada.
- [ ] Marco de fase Entregue concluído → "Aprovar a fase…"; fase não entregue → aviso; quem não aprova
      → "quem aprova foi avisado".
- [ ] Jurídico → Pagamento: "Por data"/"Por entrega"; parcelas com marco ou "Na assinatura"; soma;
      "Trazer da proposta".
- [ ] Assinar → previsão no Fluxo de caixa ("Inclui R$ X de previsão do cronograma"); aprovar o
      cronograma → previsões dos marcos; mover o marco → a previsão anda; data passada → "atrasada".
- [ ] Apagar o marco de uma parcela → "Marco apagado — escolha".
- [ ] Faturar → vira conta a receber; o plano trava. A previsão não aparece no Livro caixa nem em
      Contas a receber; receber/editar/excluir pela busca → "É uma previsão do cronograma…".
- [ ] Concluir o marco de uma parcela → notificação "parcela a faturar"; Preferências mostra
      "Parcelas a faturar".

### F8 — Valor Agregado
- [ ] Sem Data de Status → "Defina a Data de Status".
- [ ] Com Data de Status → VP/VA/CR/IDP/IDC em horas; R$ só para o financeiro; cores.
- [ ] Mudar a Data de Status → "Apurações anteriores" com as duas datas.
- [ ] Atividade criada depois da baseline → aviso (o avanço dela não entra no VA, as horas entram no
      CR — replaneje).

### Correções do §7 (B1, B2, B3, L1, L2, L3, L6, L9)
- [ ] B2: nova tarefa pede **Duração (dias úteis)** e, opcional, "Não iniciar antes de"; ao salvar, as datas
      aparecem calculadas (feriado incluído); editar a duração recalcula na hora, sem clicar em Reagendar;
      linha de disciplina/agrupamento não mostra "Marco"; agrupamento mostra o texto de duração derivada.
- [ ] L1: registrar o término real atrasado de uma tarefa empurra a sucessora na hora; Apurar com a Data
      de Status depois do início de uma tarefa não iniciada a leva para o dia útil seguinte (a janela diz
      "reprogramada…"); em andamento com % mantém a parte feita; Data de Status futura é recusada; o
      filtro Atrasadas usa a linha de base.
- [ ] Recursos → Heatmap: pessoa carregada só por projeto aprovado aparece ocupada nas próximas 12 semanas
      (a célula do mês mostra "digitada X% + cronograma Y%" no mouse); meses além da janela só com a digitada.
- [ ] Aprovações: seção "Fases a aprovar" só aparece com fase entregue pendente; Aprovar pede confirmação e
      libera o pagamento (mesma mensagem do diálogo Etapas); sem `aprovacoes:disciplina` o botão some; a fase
      aprovada sai da lista; disciplina que pagou inteira não aparece.
- [ ] Contas a receber, aba "A receber" (com `financeiro:gerir`): cartão "Parcelas a faturar" com contrato
      por entrega assinado; marco concluído no topo; Faturar pergunta o vencimento e a parcela sai da lista
      e entra na lista de contas; sem `financeiro:gerir` o cartão não aparece; o clique na notificação
      "parcela a faturar" abre esta aba.
- [ ] Projeto com contrato **por entrega** em vigor: aba Financeiro → "Gerar parcelas" desabilitado com o
      motivo no card; a lista "Faturar por entrega" não aparece.
- [ ] Projeto sem contrato por entrega: "Faturar" abre a confirmação com o valor DA PROPOSTA preenchido;
      alterar o valor e confirmar cria o recebível previsto com o valor digitado (não o da disciplina);
      disciplina sem item na proposta pede o valor; faturar a mesma de novo é recusado.
- [ ] Duplicar projeto marcando EAP: o diálogo mostra o aviso e o campo "Início do cronograma novo";
      na cópia, marcos continuam marcos, durações e dependências (tipo/atraso) vêm, o cronograma está em
      rascunho e, com a data, as datas partem dela. Sem a data: defina o início e clique em Reagendar.

---

## 6. Verificação automática (2026-09-25)

`smoke:recursos-eap` 52 · `smoke:ponto-tarefa` 24 · `smoke:pagamento-fase` 31 ·
`smoke:previsao-recebimento` 22 · `smoke:sync-pagamento` 19 · `verify:motor-cronograma` ok ·
suíte 4293 testes · lint · tsc · build — todos verdes.

---

## 7. Plano de correção (proposto em 2026-09-25, não iniciado)

### Bugs
| # | Problema | Correção proposta | Modelo · risco |
|---|---|---|---|
| B1 ✅ | "Faturar entrega" (N-26) cobra do cliente o `Disciplina.valor` (pool dos PJ) | O diálogo passa a pedir o valor, pré-preenchido pelo item da proposta de origem da mesma disciplina (`PropostaItem` via catálogo) — nunca `Disciplina.valor`. Projeto com contrato "por entrega" esconde o botão (o contrato manda na cobrança) | Sonnet high · médio (dinheiro): teste + smoke |
| B2 ✅ | Editar linha da EAP: força tipo atv/mrc; **duração salva em dias CORRIDOS** (helper provisório da F0 que ficou em `planejamento/actions.ts`) e o motor agenda em dias ÚTEIS — a barra estica ao salvar; as datas digitadas ficam gravadas até alguém reagendar | Tipo só alterna atividade↔marco (os outros tipos ficam, e o "Marco" some para eles); agrupamento não recebe duração; o editor passa a editar **duração (dias úteis) + "não iniciar antes de"** (alfinete, D34), como o Project, e salvar reagenda. Remover o helper provisório | Opus xhigh (regra) + Sonnet (tela) · alto e silencioso: testes + `verify:motor-cronograma` |
| B3 ✅ | Duplicar projeto copia a EAP sem tipo, duração, restrição, classificadores | Copiar tipo, duração, restrição, fase/origem/TAT, tipo e lag das dependências; ID corporativo NOVO (D29); %, status e datas reais zerados; cronograma novo em rascunho, datas pelo motor a partir do início pedido (D10) | Sonnet · baixo |
| B4 ✅ | `Promise.all` dentro de transação (`comercial/service.ts`) | `await` em sequência + teste-guarda que varre `src/` por `Promise.all([` com `tx.` dentro | Sonnet · mínimo |

### Limitações
| # | Limitação | Solução proposta | Modelo · risco |
|---|---|---|---|
| L1 ✅ | Datas reais não movem o cronograma (D6) | Motor lê datas reais: concluída fica nas datas reais; iniciada começa no início real e o restante (duração × (1 − %)) vai para depois da Data de Status — o "Reprogramar trabalho não concluído" do Project; sucessoras empurradas; baseline intocada. Destrava o ritmo observado (D21) e a previsão de término de prazo no Valor Agregado. Fazer JUNTO com B2 | Opus xhigh · alto: bateria de testes + verify |
| L2 ✅ | Faturar só pelo Jurídico | Lista "Parcelas a faturar" em Contas a receber (`financeiro:gerir`): cliente, contrato, parcela, valor, data do marco, marco concluído?, botão Faturar (mesma action); a notificação aponta para lá | Sonnet · baixo |
| L3 ✅ | "Aprovar fase" só no diálogo Etapas | Seção "Fases a aprovar" em /aprovacoes e botão no card da disciplina para `aprovacoes:disciplina` | Sonnet · baixo |
| L4 ✅ | "Atualizar tarefa" × editor da EAP com permissões diferentes | Migration dando `cronograma:executado` a quem tem `planejamento:gerir` (mesmo molde da F2.6) — ou ajuste manual em Perfis | Sonnet · mínimo |
| L5 ✖ cancelado (#7) | Linhas antigas sem fase | Script em modo simulação sugere a fase pelo nome/pai da linha e pela etapa única da disciplina; relatório para revisão; `--gravar` depois | Sonnet · baixo |
| L6 ✅ | Parcelas manuais + previsão do contrato somando | "Gerar parcelas" do projeto recusa quando há contrato assinado com cobrança ("use o contrato") | Sonnet · mínimo |
| L7 ✅ | Custo/hora visível em /recursos sem acesso ao financeiro | Mascarar `custoHora` na matriz e só editar com `financeiro:gerir` (mesma regra da EAP) | Sonnet · mínimo |
| L8 | Baseline antiga sem custo | Produção não tem cronograma aprovado — nada a fazer; no dev, replanejar | — |
| L9 ✅ | Heatmap da matriz só com alocação digitada | Heatmap passa a ler a carga calculada dos projetos aprovados | Sonnet · baixo |
| L10 | Tarefa de troca no meio do dia perdida na edição do dia | Gravar a tarefa da troca num registro próprio. Valor baixo — sugestão: deixar | — |

**Ordem sugerida:** ~~F9 (manual)~~ (feita) → B4, L6, L7, L4 (mínimos, um lote) → B3, B1, L2, L3 → B2 + L1 juntos (Opus
xhigh) → L5 depois da validação do time → L9. As DECIDIR do §2 entram quando o time responder — cada uma
está isolada numa regra pura testada.
