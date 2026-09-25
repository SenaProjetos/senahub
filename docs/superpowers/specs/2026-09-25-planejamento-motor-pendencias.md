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
2. `scripts/herdar-responsaveis-eap.ts --gravar` **UMA vez**. Sem ele, toda linha antiga fica "sem
   responsável" e a Saúde de todo projeto cai no dia do deploy. Rodar de novo depois desfaria escolhas
   do coordenador — para isso existe o botão "Herdar responsáveis" por projeto.
3. `npm run verify:motor-cronograma` em produção.

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

### Cronograma e equipe (F5–F6)
- **DECIDIR — "etapa de terceiro"** (aprovação do cliente, análise da prefeitura…) não gera card nem
  cobra hora. O sistema reconhece pela **origem** da linha: CLI, ARQ, EXT, FIS, APR, CON, OBR. A D24
  não dizia como reconhecer.
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
- **DECIDIR (raro):** fase aprovada quando a disciplina era 100% CLT fica "aprovada" mas não
  "liberada". Se um PJ entrar depois e a disciplina inteira for aprovada, essa fase também paga. A
  alternativa é tratá-la como liberada com R$ 0 (o % dela passa para as outras fases).

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
- **DECIDIR:** faturar **converte** a previsão na mesma linha. Se o time emite a cobrança por outro
  caminho (NF lançada à mão), a previsão fica sobrando até alguém faturar pela tela do contrato.
- **DECIDIR:** a previsão entra no fluxo de caixa e no gráfico "previsto × realizado" do dashboard,
  mas **não** no resultado previsto do projeto nem no KPI de receita prevista. Alinhar.
- Previsão que passou da data sem ser faturada fica na 1ª semana da projeção, marcada "atrasada".
- Marco apagado deixa a parcela sem data (nunca vira cobrança na hora).
- Depois de faturar qualquer parcela, o plano do contrato trava.

### Valor Agregado (F8)
Os campos de valor agregado do Project: VP = COTA, VA = COTR, CR = CRTR.
- **DECIDIR:** o custo real (CR) é o **apontado no ponto**. Pagamento de PJ por entrega **não**
  entra: PJ que não aponta horas some do realizado, e o IDC fica otimista em projeto tocado por PJ.
  A alternativa é somar os pagamentos liberados até a Data de Status — mas aí as horas desse PJ não
  podem somar também.
- **DECIDIR:** o VA usa o % informado **de hoje** (o sistema não guarda histórico de %). Por isso cada
  apuração é gravada na hora em que a Data de Status é definida.
- O planejado (VP) espalha o orçamento da atividade igualmente pelos dias úteis da barra de base
  (perfil uniforme, o padrão do Project).
- Duas colunas: em horas, para quem acompanha o cronograma; em R$, só para quem vê o financeiro.

---

## 3. Limitações conhecidas

- **As datas reais ainda não movem o cronograma (D6 pendente).** Registrar início/término real não
  empurra as sucessoras; a previsão continua vindo das durações e dependências.
- **Faturar parcela** fica no diálogo Pagamento do Jurídico (abre para `juridico:gerir`); o botão só
  aparece para quem também tem `financeiro:gerir`. Quem é só do financeiro não chega lá — falta uma
  lista "parcelas a faturar" no financeiro (a notificação leva ao /juridico).
- **"Aprovar fase"** fica no diálogo Etapas, que só abre para quem edita o projeto.
- **"Atualizar tarefa"** (datas reais) é de `cronograma:executado` (quem gere recursos); o editor da
  linha é de `planejamento:gerir`. Populações diferentes — conferir na tela de Perfis.
- As linhas da EAP existentes estão **sem fase**: nada gravava a fase até a F7.0.
- Parcelas manuais do projeto e previsão de contrato por entrega podem somar juntas na projeção se o
  time usar os dois no mesmo projeto.
- A página /recursos mostra o custo/hora de cada pessoa a quem tem `recursos:ver`, embora a EAP só
  mostre custo a quem vê financeiro.
- Baselines aprovadas antes da F7.1 não têm custo: a coluna R$ do Valor Agregado fica sem número até
  replanejar.
- Carga: o heatmap da matriz enxerga só alocação digitada; quem está carregado só por projeto aprovado
  aparece livre ali e sobrecarregado na aba "Carga planejada" (a tela diz isso). Sugestões de
  sobrecarga são sob demanda (1,3 s com 10 sobrecargas).
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
- "Faturar entrega" da disciplina (N-26) cobra do **cliente** o `Disciplina.valor`, que é o pool de
  pagamento dos PJ — custo usado como receita. Com a F7.4, ajuste na Produção mexe nesse valor.
- `editarEapTarefa` força o tipo atividade/marco mesmo editando linha de disciplina/resumo.
- Duplicar projeto copia a EAP sem tipo, duração, restrição e classificadores.
- `Promise.all` dentro de transação em `comercial/service.ts` (depreciado no driver pg, quebra no pg@9).

---

## 5. Checklists em navegador (antes do merge)

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
| B1 | "Faturar entrega" (N-26) cobra do cliente o `Disciplina.valor` (pool dos PJ) | O diálogo passa a pedir o valor, pré-preenchido pelo item da proposta de origem da mesma disciplina (`PropostaItem` via catálogo) — nunca `Disciplina.valor`. Projeto com contrato "por entrega" esconde o botão (o contrato manda na cobrança) | Sonnet high · médio (dinheiro): teste + smoke |
| B2 | Editar linha da EAP: força tipo atv/mrc; **duração salva em dias CORRIDOS** (helper provisório da F0 que ficou em `planejamento/actions.ts`) e o motor agenda em dias ÚTEIS — a barra estica ao salvar; as datas digitadas ficam gravadas até alguém reagendar | Tipo só alterna atividade↔marco (os outros tipos ficam, e o "Marco" some para eles); agrupamento não recebe duração; o editor passa a editar **duração (dias úteis) + "não iniciar antes de"** (alfinete, D34), como o Project, e salvar reagenda. Remover o helper provisório | Opus xhigh (regra) + Sonnet (tela) · alto e silencioso: testes + `verify:motor-cronograma` |
| B3 | Duplicar projeto copia a EAP sem tipo, duração, restrição, classificadores | Copiar tipo, duração, restrição, fase/origem/TAT, tipo e lag das dependências; ID corporativo NOVO (D29); %, status e datas reais zerados; cronograma novo em rascunho, datas pelo motor a partir do início pedido (D10) | Sonnet · baixo |
| B4 | `Promise.all` dentro de transação (`comercial/service.ts`) | `await` em sequência + teste-guarda que varre `src/` por `Promise.all([` com `tx.` dentro | Sonnet · mínimo |

### Limitações
| # | Limitação | Solução proposta | Modelo · risco |
|---|---|---|---|
| L1 | Datas reais não movem o cronograma (D6) | Motor lê datas reais: concluída fica nas datas reais; iniciada começa no início real e o restante (duração × (1 − %)) vai para depois da Data de Status — o "Reprogramar trabalho não concluído" do Project; sucessoras empurradas; baseline intocada. Destrava o ritmo observado (D21) e a previsão de término de prazo no Valor Agregado. Fazer JUNTO com B2 | Opus xhigh · alto: bateria de testes + verify |
| L2 | Faturar só pelo Jurídico | Lista "Parcelas a faturar" em Contas a receber (`financeiro:gerir`): cliente, contrato, parcela, valor, data do marco, marco concluído?, botão Faturar (mesma action); a notificação aponta para lá | Sonnet · baixo |
| L3 | "Aprovar fase" só no diálogo Etapas | Seção "Fases a aprovar" em /aprovacoes e botão no card da disciplina para `aprovacoes:disciplina` | Sonnet · baixo |
| L4 | "Atualizar tarefa" × editor da EAP com permissões diferentes | Migration dando `cronograma:executado` a quem tem `planejamento:gerir` (mesmo molde da F2.6) — ou ajuste manual em Perfis | Sonnet · mínimo |
| L5 | Linhas antigas sem fase | Script em modo simulação sugere a fase pelo nome/pai da linha e pela etapa única da disciplina; relatório para revisão; `--gravar` depois | Sonnet · baixo |
| L6 | Parcelas manuais + previsão do contrato somando | "Gerar parcelas" do projeto recusa quando há contrato assinado com cobrança ("use o contrato") | Sonnet · mínimo |
| L7 | Custo/hora visível em /recursos sem acesso ao financeiro | Mascarar `custoHora` na matriz e só editar com `financeiro:gerir` (mesma regra da EAP) | Sonnet · mínimo |
| L8 | Baseline antiga sem custo | Produção não tem cronograma aprovado — nada a fazer; no dev, replanejar | — |
| L9 | Heatmap da matriz só com alocação digitada | Heatmap passa a ler a carga calculada dos projetos aprovados | Sonnet · baixo |
| L10 | Tarefa de troca no meio do dia perdida na edição do dia | Gravar a tarefa da troca num registro próprio. Valor baixo — sugestão: deixar | — |

**Ordem sugerida:** ~~F9 (manual)~~ (feita) → B4, L6, L7, L4 (mínimos, um lote) → B3, B1, L2, L3 → B2 + L1 juntos (Opus
xhigh) → L5 depois da validação do time → L9. As DECIDIR do §2 entram quando o time responder — cada uma
está isolada numa regra pura testada.
