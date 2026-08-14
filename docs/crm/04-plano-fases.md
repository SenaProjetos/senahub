# 04 — Plano de fases e backlog do CRM (módulo Comercial)

**Data:** 2026-08-14 · **Status:** planejamento (P5) · **Branch alvo:** `dev` · **Modelo:** Opus

Absorve e **supersede** [`docs/superpowers/specs/2026-07-24-crm-comercial-roadmap.md`](../superpowers/specs/2026-07-24-crm-comercial-roadmap.md) (Ondas A–F, 34 ideias). Aquele documento passa a ser **histórico**: os vereditos do dono continuam valendo, a ordenação por Ondas não. A ordem é a das 7 fases do playbook.

Base: `00-auditoria.md`, `01-decisoes.md`, `02-schema.md`, `03-migracao.md`, `99-playbook.md`.

---

## 0. Desvios em relação ao P5 (declarados)

| Item do P5 | O que foi feito | Motivo |
|---|---|---|
| 3 — estratégia de feature flag | **Cancelado** | Decisão do usuário: substituição direta. O projeto não tem mecanismo de flag e o módulo é *contornado* — não há operação ativa a proteger. Nenhuma tarefa deste plano desenha convivência antigo/novo. |
| 4 — `CLAUDE.md` | Já existe e cobre stack/comandos/Decimal/timezone/labels/commits | Só falta a linha "ler `docs/crm/` antes de mexer no Comercial" — tarefa F1.0 |
| 5 — `06-progresso.md` | Já existe, com formato e 5 entradas | — |
| — | **P15** (dicionário de métricas), **P19** (performance) e **P20** (critérios de aceitação) não têm fase própria | Sem "Fase 0" e sem fase 8: P15 vira **F6.1** (bloqueia toda a Fase 6), P19 vira **F6.11**, P20 vira **F7.8** |

---

## 1. O contexto que manda no backlog

8 leads · 1 proposta **sem itens** · 0 atividades · 0 contatos · 0 oportunidades — contra **31 projetos e 46 clientes**. O módulo não é pouco usado, é **contornado**: o trabalho entra direto como `Projeto` e a proposta real é feita em Word/PDF.

Consequência operacional para este plano: **toda fase declara o que entrega que faz valer a pena registrar**. Dashboard sobre 8 leads não mostra nada — por isso o aceite de tudo que é métrica é contra **seed sintético** (F6.2), nunca contra produção.

**Risco número 1 deste plano, dito de uma vez:** o gancho de adoção mais forte (proposta pré-preenchida que ganha do Word) está na Fase 5, e a ordem foi fixada pelo usuário. Mitigação que respeita a ordem: **F1.21** puxa a fatia mínima de "proposta utilizável" para dentro da Fase 1 — a FK de disciplina já é tarefa de Fase 1 de qualquer jeito.

---

## 2. Como ler as tabelas

- **Dep** — dependências entre tarefas (só as bloqueantes; toda tarefa depende implicitamente da fase anterior).
- **Aceite** — comando, teste ou passo de UI que **prova**. Nunca "funciona bem".
- **Ideia** — número no roadmap A–F (`#n` = sugestão do dono; `#mn` = análise inicial).
- **⚠️** — **RISCO ALTO**: toca dado de produção, o fluxo de proposta/aceite existente, ou o link público já enviado a clientes.
- **Modelo** — tiers do critério que o roadmap A–F já estabeleceu: **H**aiku (mecânico: 1–2 arquivos, campo/UI, zero lógica) · **S**onnet (feature de padrão conhecido: schema+action+query+UI) · **O**pus (arquitetura, migração de dado, heurística pura testada, agregação de métrica, precificação).
- **Mig / Seed** — `M` exige migration; `S` exige `npm run db:seed` **também no deploy**.
- **Prova** — `puro` (arquivo sem `server-only`/Prisma + `*.test.ts` irmão) · `smoke` (`scripts/smoke-*.ts`) · `browser`.

**Regra transversal de migration:** dev tem drift conhecido. Migração **à mão + `migrate deploy`**, nunca `prisma migrate dev`/`reset` (roadmap §7, e é o que funcionou em C0–C2). Aceite padrão de toda tarefa `M`: `npx prisma validate` + `npx prisma migrate status` limpos. Índice parcial vai como `CREATE UNIQUE INDEX … WHERE …` cru dentro da migration (Prisma não tem sintaxe nativa).

**Regra transversal de `db:seed`:** **nenhuma tarefa deste plano cria recurso de permissão novo** — ADR-15 manteve `comercial:ver`/`comercial:gerir`. O `db:seed` no deploy é exigido só por **catálogo/configuração**: F1.6, F1.7, F7.2.

---

## FASE 1 — Fundação

**Objetivo:** dar chão de dados ao módulo (catálogos, Empresa/Contato, responsável, canal/campanha, dedup) e, antes de tudo, blindar com testes o único fluxo do módulo que funciona hoje.

**O que faz o time querer usar:** a **proposta deixa de ser digitação**. `PropostaItem.disciplina` vira FK do `DisciplinaCatalogo` e o editor puxa área × R$/m² da `TabelaPreco` que já existe (F1.21). A única proposta em produção tem **zero itens** porque montar item a item à mão é mais lento que o Word — essa é a causa raiz atacada aqui.

### 1a — Dívida técnica primeiro (é o único momento sem mudança de schema)

`src/modules/comercial/actions.ts` tem **607 linhas e nenhum `service.ts`**, e o módulo tem **0 testes** (de 186 arquivos no repo). Extrair agora caracteriza `aceitarProposta` **enquanto ele ainda funciona do jeito antigo** — as Fases 2 e 5 o reescrevem. Depois é tarde.

`vitest.config.ts` aliasa `server-only` para um stub, então `service.ts` importa normalmente sob teste (CLAUDE.md) — não é preciso inventar contorno.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.0 | Linha no `CLAUDE.md`: "ler `docs/crm/` antes de qualquer trabalho no Comercial" | — | `grep -n "docs/crm" CLAUDE.md` retorna a linha | — | | H | — | — |
| F1.1 | `src/modules/comercial/status.ts` + `status.test.ts`: `etapaEhPerdido` sai do substring-matching (`actions.ts:48`) e vira regra explícita; `calcularStatusComercial(temPropostaAceita, override)` (ADR-08 / 02-schema §6) | F1.0 | `npx vitest run src/modules/comercial/status.test.ts` verde, cobrindo "Perdido"/"Perdida"/etapa renomeada; `grep -rn 'includes("perdid")' src/` só acha `status.ts` | — | | S | — | puro |
| F1.2 | `src/modules/comercial/numeracao.ts` + `.test.ts`: formatação pura de `PR-AANNNN` isolada do estado de `PropostaSequencia` | F1.0 | teste: (2026, 1)→`PR-260001`; virada de ano; sequencial ≥10000 explicita o comportamento | — | ⚠️ numeração já emitida a cliente | S | — | puro |
| F1.3 | `src/modules/comercial/service.ts` + `service.test.ts`: move `criarPropostaDeLead`/`salvarProposta`/`aceitarProposta` para o service; `actions.ts` vira casca de `defineAction`. **Teste de caracterização** do aceite atual (cria Projeto + 1 `Disciplina` por item + canais de chat + notifica `gestao_operacional`) | F1.1, F1.2 | `actions.ts` < 250 linhas; `npm test` verde; `npm run smoke:crm-fase1` aceita uma proposta em dev e confere Projeto+Disciplinas+canais; `git diff` mostra só movimentação, nenhuma regra alterada | — | ⚠️ toca aceite | **O** | — | puro + smoke |
| F1.4 | `src/modules/comercial/labels.ts`: rótulo pt-BR de todo enum novo (T6) | F1.0 | cada valor de enum de `02-schema.md` tem entrada; teste de exaustividade com `satisfies Record<Enum, string>` | — | | H | — | puro |

### 1b — Catálogos, configuração e enums

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.5 | Migration dos catálogos e enums: `TipoEmpreendimento`, `MotivoPerda` (+`exigeConcorrente`), `CanalAquisicao`, `Segmento`, `ProbabilidadeEstagio`; enums `StatusProspeccao`, `EstagioNegociacao`, `Temperatura`, `TipoAtividade`, `StatusComercialCliente`, `BaseLegalLgpd`, `StatusRelacionamentoContato`. **Nada de UI.** ⚠️ `DisciplinaCatalogo` **já existe** — não criar segundo catálogo (02-schema §8.1) | F1.4 | `prisma validate` + `migrate status` limpos; `grep -rn "DisciplinaPadrao" prisma/` vazio | #30, #15 | | S | **M** | — |
| F1.6 | Seed idempotente dos catálogos + defaults de `ProbabilidadeEstagio` (LEVANTAMENTO 20 / ORCAMENTO 35 / PROPOSTA_ENVIADA 55 / NEGOCIACAO 75 / CONTRATADO 100) em `prisma/seed.ts` | F1.5 | rodar `npm run db:seed` **duas vezes**: contagem idêntica nas 5 tabelas | #30, #15 | | H | **S** | smoke |
| F1.7 | Chaves em `ConfigSistema` (padrão de ~8 módulos): `comercial.descontoMaxSemJustificativa=10` (Q6), `comercial.diasSemContato`, `comercial.diasAvisoValidadeProposta`, `comercial.diasClienteInativo` | F1.6 | `grep` não acha nenhum desses números literal em `src/modules/comercial/`; seed roda 2× sem duplicar | — | | H | **S** | smoke |

### 1c — Empresa e Contato

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.8 | `Cliente`: `status`, `statusOverride`, `linkedinUrl`, `salesNavigatorUrl`, `segmentoId`, `porte` + `@@index([status])`, `@@index([documento])` | F1.5 | `prisma validate`; os 46 clientes continuam listando em `/clientes` | #11 | | S | **M** | browser |
| F1.9 | `ContatoCliente`: LGPD (`optOut`, `optOutAt`, `baseLegal`, `dataCollectionSource`, `dataCollectedAt`) + `createdAt` (Q5) + LinkedIn + `papelDecisao` + `statusRelacionamento` | F1.5 | `prisma validate`; contato criado nasce `optOut=false`, `baseLegal=LEGITIMO_INTERESSE` | #11, T1 | | S | **M** | — |
| F1.10 | `src/modules/comercial/lgpd.ts` + `.test.ts`: `podeAbordar(contato)` — checagem **centralizada**, nunca repetida por query (02-schema §7) | F1.9 | teste: `optOut=true` → false; nulo → true; `grep -rn "optOut" src/modules/comercial/` só aparece em `lgpd.ts` | T1 | | H | — | puro |
| F1.11 | Empresa: lista com busca/filtros/paginação server-side (`parseListParams`+`orderByPrisma`+`pageCount`) e formulário **em abas** (identificação, comercial, LinkedIn, observações) + aba Contatos com edição inline. **Estender `/clientes`, não criar módulo novo** | F1.8, F1.9 | filtrar por segmento e classificação, paginar, ordenar; URL carrega o estado (`useSetParams`); recarregar a página preserva o filtro | #11, #12 (parcial) | | S | — | browser |

### 1d — Deduplicação e o toque em produção

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.12 | `src/modules/comercial/dedupe.ts` + `.test.ts`: `normalizarNomeEmpresa` (sem acento/pontuação/sufixo societário, e o strip de sufixo **só quando `tipo="PJ"`**), `normalizarDocumento`, telefone E.164, domínio de site/e-mail, similaridade. **Extrair de `scripts/auditoria-crm.ts`, que já tem o protótipo validado** | F1.8 | teste casa `NOMINAL ENGENHARIA` ↔ `Nominal Engenharia LTDA`; **não** come "Sá"/"Me" em PF; reproduz os 3 grupos do `03-migracao.md` §4 | #24 | | S | — | puro |
| F1.13 | Alerta **não bloqueante** de duplicata ao digitar CNPJ/nome/e-mail: candidatos + "usar o existente" / "criar mesmo assim" | F1.12 | digitar "Madano" na criação → alerta com os 2 candidatos; "criar mesmo assim" cria | #24 | | S | — | browser |
| F1.14 | Ação de **mesclar** dois `Cliente`: move contatos, leads, propostas, projetos e lançamentos para o sobrevivente; grava no `AuditLog`; absorvido fica **arquivado com referência ao sobrevivente**. Nada é apagado | F1.12 | `scripts/smoke-crm-dedupe.ts`: cria 2 clientes com projeto em cada, funde, confere que os 2 projetos estão no sobrevivente, que o absorvido continua existindo arquivado, e que há entrada no `AuditLog` | #24 | ⚠️ move projeto | **O** | **M** (campo `fundidoEmId`) | smoke |
| F1.15 | **Produção:** validar backup (`pg_restore --list` enumera `lead`/`cliente`/`proposta`/`anexo_lead`/`projeto`; espelho de `STORAGE_BASE_PATH` em dia) e **fundir à mão os 3 grupos** (MADANO ×2, Záphis ×3, Nominal ×2), conferindo os projetos de cada grupo **antes** | F1.14 | `cliente` 46→43; `projeto` continua **31**; query antes/depois prova que **nenhum projeto trocou de cliente** exceto os do grupo fundido; 3 entradas de fusão no `AuditLog` | 03-mig §4 | ⚠️⚠️ **produção** | **O** | — | smoke |
| F1.16 | Índice único parcial `CREATE UNIQUE INDEX cliente_documento_unico ON cliente (documento) WHERE documento IS NOT NULL` | **F1.15** (a fusão Nominal *preenche* um documento que faltava — criar antes arrisca falhar ou travar a fusão) | migration aplica sem erro; tentar salvar 2º cliente com o mesmo CNPJ é recusado com mensagem de negócio | ADR-03 | ⚠️ produção | S | **M** | browser |
| F1.17 | **Tarefa isolada:** soft delete em `Cliente` (`excluidoEm`) + extensão do Prisma client que auto-filtra (padrão de `Lancamento` em `lib/prisma.ts`). **Precedida de `grep -rn "prisma.cliente" src/` completo**, com inventário revisado | F1.8 | inventário do grep anexado à PR; depois de ligar a extensão, `/projetos`, `/financeiro`, `/juridico`, `/documentos` e `/custos` continuam listando os **43** clientes; smoke confere contagem em cada módulo | ADR-11 | ⚠️⚠️ respinga em 5 módulos fora do CRM (02-schema §8.6) | **O** | **M** | smoke |
| F1.18 | Soft delete em `Lead` e `ContatoCliente` (raio de explosão pequeno — separado de F1.17 de propósito) | F1.17 | funil não mostra lead com `excluidoEm`; registro continua no banco | ADR-11 | | S | **M** | browser |

### 1e — Disciplina vira FK, e a proposta vira usável

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.19 | `PropostaItem.disciplinaId` FK → `DisciplinaCatalogo` + `disciplinaTextoLegado` preservando o texto original | F1.5 | `prisma validate`; a proposta única de produção continua abrindo em `/comercial/propostas/[id]` e em `/a/proposta/[token]` | Q3 | ⚠️ toca proposta | **O** | **M** | browser + smoke |
| F1.20 | `ItemTabelaPreco.disciplina` → FK (mesmo padrão) | F1.19 | `/comercial/tabelas` continua listando os itens da tabela existente | Q3 | | S | **M** | browser |
| F1.21 | **Consolidação das 24 grafias em produção:** 18 batem exatas; `Ar condicionado (ARC)`+`Exaustão (EXT)`→`Climatização (AVAC)`, `Gases`→`Gás`; as **3 strings compostas** (`Lógica/cftv`, `Lógica e Cftv`, `Dados/Voz, Automação e CFTV`) → `Cabeamento` + `CFTV` **à mão, com o responsável do projeto**, decidindo rateio de `valor`, revisões e arquivos | F1.20 | zero `Disciplina`/`PropostaItem`/`ItemTabelaPreco` sem `disciplinaId`; soma de `Disciplina.valor` por projeto **inalterada** antes/depois; nenhuma `RevisaoDisciplina` perdida (contagem igual) | Q3, 03-mig §5 | ⚠️⚠️ `Disciplina` carrega **pagamento ao projetista** | **O** | — | smoke |
| F1.22 | **Gancho de adoção:** editor de proposta pré-preenche itens a partir da `TabelaPreco` (área × R$/m² por disciplina), editável linha a linha antes de salvar | F1.19, F1.20 | criar proposta de 800 m² com 3 disciplinas selecionadas → 3 itens com valor calculado; alterar um valor à mão persiste; **total na tela = total no PDF** | #32 (só lookup), #m10 | ⚠️ número errado vai para o cliente | **O** | — | puro (`honorarios.ts`) + browser |

### 1f — Lead ganha os campos estruturados

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F1.23 | `Lead`: `responsavelId` (só atribuição/exibição — ADR-15 **não** é gate), `canalId`, `origemDetalhada`, `campaignId` + model `Campanha` (UI dela só na Fase 4) | F1.5, F1.8 | `prisma validate`; os 8 leads recebem `responsavelId = autorId` (Q4) e canal `Outro` com `origem` preservada em `origemDetalhada` (03-mig §3) | #m1, #m4 | ⚠️ toca os 8 leads | S | **M** | browser |
| F1.24 | **Remover o código do `Oportunidade` órfão**: `src/modules/comercial/oportunidades/`, `components/comercial/oportunidades-view.tsx`, rota `/comercial/oportunidades`, entrada de nav. **A tabela fica** (ver §8.1) | F1.3 | `grep -rn "oportunidade" src/ --include=*.tsx -i` não acha view/rota; `next build` limpo; `/comercial/oportunidades` retorna 404 | 03-mig §6 | | H | — | browser |
| F1.25 | Fecho da fase: `npm run lint` · `npm test` · `npm run build` · `scripts/smoke-crm-fase1.ts` | todas | os 4 verdes, colados no `06-progresso.md` | — | | H | — | smoke |

---

## FASE 2 — Jornada

**Objetivo:** separar prospecção de negociação, com dois funis próprios, e tornar "próxima ação" um dado **consultável**.

**O que faz o time querer usar:** hoje o `follow-up-dialog.tsx` grava o lead como **string dentro da descrição** de um `Compromisso` — a pergunta "quais leads estão sem próxima ação" é literalmente impossível de responder por query. Depois desta fase o board mostra atraso sozinho, e a lista de follow-up sai da cabeça de quem vende.

### Duas decisões que eu não tomo sozinho

| ID | Decisão | Opções | Trade-off | Modelo |
|---|---|---|---|---|
| **F2.1** | Âncora da Próxima Ação | **(a)** estender `Compromisso` (`schema:3231`) com `entidadeTipo`/`entidadeId`/`tipo`/`concluidoEm` · **(b)** tabela nova `ProximaAcao` | **(a)** aproveita a UI de agenda inteira que já existe (`components/agenda/agenda-view.tsx`, 3 vistas, export `.ics`) e o follow-up comercial já cai lá dentro hoje — mas mistura "tarefa comercial" com "reunião de calendário" e qualquer query da agenda passa a precisar filtrar. **(b)** é limpo e não arrisca a agenda, mas duplica o conceito "coisa agendada com data" e o follow-up deixa de aparecer no calendário do vendedor sem trabalho extra. `02-schema.md` §8.2 inclina para **(b)**; P11 item 1 pede **parar e confirmar** se a resposta for "criar novo". **Custo de não decidir: nulo hoje, alto depois — F2.9/F2.10/F2.11 e a Fase 7 inteira dependem disso.** | **O** |
| **F2.2** | Lista de status "fechados" que saem do índice único parcial `(clienteId, campaignId)` (ADR-02/Q1) | quais de `SEM_OPORTUNIDADE`, `EM_ESPERA`, `DESCARTADO`, `OPORTUNIDADE_CRIADA` contam como "não ativo" | Se `OPORTUNIDADE_CRIADA` contar como ativo, a empresa fica travada para nova prospecção enquanto a negociação existir — pode ser o desejado ou um bloqueio irritante. Conteúdo pendente desde `02-schema.md` §5. | **O** |

**Aceite das duas:** a escolha registrada em `01-decisoes.md` com a alternativa descartada e o porquê. Nenhuma tarefa de schema desta fase começa antes.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F2.3 | `Lead` v2: `status: StatusProspeccao`, `needsReview`, `clienteId` obrigatório, junção `LeadContato`. `etapaId`/`FunilEtapa`/`arquivado`/`motivoPerda` ficam **deprecados, não apagados** (02-schema §8.3) | F1.23 | `prisma validate`; `FunilEtapa` continua no schema; os 8 leads têm `status` preenchido | ADR-01/16 | ⚠️ toca os 8 leads | **O** | **M** | — |
| F2.4 | `Negociacao` + `NegociacaoContato` + `NegociacaoDisciplina` + `Projeto.negociacaoId` | F2.3 | `prisma validate`; `Proposta.projetoId` **inalterado** (continua existindo) | ADR-04/06/13, #31 | | S | **M** | — |
| F2.5 | Índice único parcial "1 prospecção ativa por empresa+campanha" (SQL cru) | F2.2, F2.3 | criar 2ª prospecção aberta para a mesma empresa sem campanha é recusada com mensagem de negócio; com campanha diferente, passa | ADR-02 | | S | **M** | browser |
| F2.6 | `src/modules/comercial/jornada.ts` + `.test.ts` (puro): `transicaoPermitida(de,para)`, `exigeMotivoPerda(estagio)`, `exigeConcorrente(motivo)`, `probabilidadeDe(estagio, override)` lendo `ProbabilidadeEstagio` (nunca hardcode na UI) | F2.4, F1.6 | teste cobre as 8 transições válidas, as inválidas, PERDIDO sem motivo recusado, e override manual que não é recalculado | #16 (só heurística), ADR-12 | | **O** | — | puro |
| F2.7 | `service.ts`: `moverEstagio()` **único**, gravando `Atividade` + `AuditLog` com `entidadeId`. Update genérico de estágio proibido | F2.6 | `grep -rn "estagio:" src/modules/comercial/actions.ts` não acha update direto; teste de guard síncrono recusa transição inválida antes de tocar o banco (padrão de `custos/orcamento/service.test.ts`) | P9 item 7, ADR-10 | ⚠️ ponto único de escrita | **O** | — | puro |
| F2.8 | `qualificarProspeccao()`: cria `Negociacao` herdando empresa, contatos, canal, origem e campanha; o Lead **não é destruído** — vai a `OPORTUNIDADE_CRIADA` mantendo a referência | F2.7 | teste: lead qualificado continua existindo com `status=OPORTUNIDADE_CRIADA` e `negociacao.leadId` apontando de volta; qualificar 2× é recusado (`Negociacao.leadId @unique`) | P9 item 4 | | S | — | puro |
| F2.9 | `src/modules/comercial/frescor.ts` + `.test.ts` (puro, **relógio injetado** como `saudeProjeto(..., hoje)`): `diasSemInteracao`, `followUpAtrasado`, `proximaAcaoHoje/futura` em **America/Recife** | F2.1 | teste cobre virada de dia às 23h59/00h01 no fuso de Recife e fim de semana (P11 item 7); zero `new Date()` sem argumento no arquivo | #m2, #21 | | **O** | — | puro |
| F2.10 | Próxima Ação — schema conforme a decisão F2.1; tipos: ligação, WhatsApp, e-mail, LinkedIn, reunião, follow-up, cobrar documentação, cobrar arquitetura, enviar proposta, revisar proposta, retorno ao cliente, outro | F2.1, F2.9 | consulta "prospecções sem próxima ação" retorna resultado **por query**, sem parsear texto — que é o que hoje é impossível | #m2, #21 | ⚠️ se (a): toca `Compromisso`, usado pela agenda inteira | S | **M** | smoke |
| F2.11 | Concluir próxima ação: registra `Atividade`, atualiza última interação e **sugere agendar a próxima sem sair da tela**; notificação pelo `notificar()` existente (nunca `lib/notifications.ts`, que é legado e não filtra) | F2.10 | concluir na tela de detalhe → timeline ganha o evento, o campo "última interação" muda, e o diálogo da próxima já abre preenchido | #m2 | | S | — | browser |
| F2.12 | `temperatura` manual em `Lead` e `Negociacao` + cor no card | F2.4 | trocar para "quente" muda a cor sem recarregar | #m7 | | H | **M** | browser |
| F2.13 | Kanban de **Prospecção** (IDENTIFICADO → CONTATO_INICIADO → EM_CONTATO → QUALIFICADO → OPORTUNIDADE_CRIADA), drag-and-drop otimista com rollback | F2.3, F2.9 | arrastar com a rede desligada reverte o card e mostra erro; contador por coluna confere com a lista | P10 | | S | — | browser |
| F2.14 | Kanban de **Negociações**: card só com empresa, título, avatar do responsável, valor, próxima ação, dias sem contato, temperatura; contador + soma por coluna; **paginação por coluna**; **uma query** traz tudo do card | F2.4, F2.9 | log do Prisma mostra **1 query** para montar o board (sem N+1); coluna com 200 registros carrega paginada | P10, #m8 | | S | — | browser |
| F2.15 | Componente **único** de filtros persistidos na URL (`lib/use-set-param.ts`): responsável, campanha, canal, empresa, temperatura, período, disciplina — compartilhado pelos dois boards | F2.13, F2.14 | mesmo componente importado nos dois; copiar a URL e abrir noutra aba reproduz o filtro | #m8 | | S | — | browser |
| F2.16 | Botões WhatsApp (`wa.me/55…`) e e-mail (`mailto:`) no card e na ficha | F2.14 | clicar abre o app com o número normalizado; contato sem telefone esconde o botão | #m6 | | H | — | browser |
| F2.17 | Comportamento em tela pequena: abas/lista por estágio em vez de colunas horizontais | F2.14 | em 390px de largura o board é utilizável sem scroll horizontal | P10 item 8 | | H | — | browser |
| F2.18 | **Produção:** mover os 8 leads à mão para `Lead` v2 / `Negociacao`, todos com `needsReview=true`, preenchendo canal real e movendo o nome do empreendimento (hoje em `origem`) para o campo próprio | F2.4, F2.5 | os 8 aparecem na lista de revisão; `lead` continua = **8** (não são apagados); `anexo_lead` = 4 e os 4 arquivos ainda abrem | 03-mig §3 | ⚠️⚠️ **produção** | **O** | — | smoke |
| F2.19 | **Opcional, e eu recomendo adiar:** extrair `<KanbanBoard>` compartilhado de `funil-board.tsx` + `tarefas-board.tsx` (~80% do mesmo código dnd-kit) | F2.13, F2.14 estáveis | os dois módulos usam o mesmo componente; `/tarefas` continua funcionando idêntico | — | ⚠️ refactor em 2 módulos; `tarefas-board` **não tem teste** que proteja a regressão | S | — | browser |
| F2.20 | Fecho da fase: lint + test + build + `scripts/smoke-crm-fase2.ts` | todas | 4 verdes | — | | H | — | smoke |

> **Posição sobre F2.19:** refatorar dois módulos **enquanto** o modelo de dados de um deles está sendo reescrito compõe risco sem necessidade, e `tarefas-board.tsx` não tem nenhum teste para pegar a regressão. Ou fica **no fim da Fase 2, depois dos boards novos estabilizarem**, ou vai para a Fase 6 junto com `<KpiCard>` e `<Timeline>`. Não no meio.

---

## FASE 3 — Relacionamento

**Objetivo:** um único lugar que responde "tudo o que já aconteceu com esta empresa".

**O que faz o time querer usar:** a **Empresa 360**. Hoje o histórico de um cliente está fatiado entre projetos, propostas, lançamentos e o WhatsApp de alguém. É a primeira tela do plano que responde algo que o Word/planilha **não** responde — e é o que faz valer a pena o registro das fases anteriores.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F3.1 | Model `Atividade` (unifica `AtividadeLead` + `AtividadeOportunidade`; as duas antigas ficam **congeladas, não apagadas**). Toda `Atividade` resolve para um `Cliente` | F2.4 | `prisma validate`; `@@index([clienteId, createdAt])` existe; as tabelas antigas continuam no schema | #26 | | S | **M** | — |
| F3.2 | `registrarAtividade()` no service + hooks automáticos: empresa/contato cadastrados, prospecção criada, mudança de estágio, oportunidade criada, proposta criada/enviada/revisada, desconto, aceite, perda, projeto criado | F3.1, F2.7 | mover um card gera `Atividade tipo=SISTEMA` sem clique nenhum; aceitar proposta gera 3 eventos (aceite, contrato, projeto criado) | **#26** (fundação-chave: destrava #17/#19/#20/#34) | ⚠️ toca o aceite | **O** | — | puro + smoke |
| F3.3 | Fechar a dívida do `AuditLog`: **toda** action do Comercial passa `entidade`+`entidadeId` (hoje só `salvarProposta` e `aceitarProposta` passam). Definir a fronteira `Atividade` (narrativa) × `AuditLog` (técnico, valor anterior/novo) | F3.2 | `grep` em `src/modules/comercial/**/actions.ts`: nenhum `defineAction` sem `entidadeId`; abrir um lead e ver o histórico técnico completo | 00-aud §E.5, T7 | | **O** | — | smoke |
| F3.4 | Registro manual de interação em **2 cliques** a partir de qualquer card ou ficha, com tipo (LIGACAO/WHATSAPP/EMAIL/LINKEDIN/REUNIAO/NOTA) | F3.2 | do Kanban, registrar uma ligação em 2 cliques, cronometrado; aparece na timeline na hora | **#28** (WhatsApp: só registro manual, sem API — veredito do dono) | | S | — | browser |
| F3.5 | Modelos de follow-up (notas prontas/*canned*) guardados em `ConfigSistema` — **sem entidade nova** | F1.7, F3.4 | escolher um modelo preenche a descrição; editar o texto antes de salvar funciona | #22 | | H | — | browser |
| F3.6 | `src/components/ui/timeline.tsx` reutilizável (hoje há **3 renderizadores bespoke**) + scroll infinito + filtro por tipo de evento | F3.1 | timeline com 500 eventos carrega só a 1ª página; filtrar por "e-mail" não recarrega a página; os 3 renderizadores antigos ou migram ou ficam declarados fora de escopo na PR | #26 | | S | — | browser |
| F3.7 | **Empresa 360**: resumo (classificação, responsável, cidade/UF, segmento, último contato, próxima ação, temperatura, último contrato), indicadores por **queries agregadas** (contatos, negociações abertas/históricas, propostas, contratos, projetos, valor acumulado, ticket médio) e abas Contatos / Prospecções / Negociações / Propostas / Projetos / Timeline / Anexos | F3.6, F3.3 | log do Prisma: **≤ 5 queries** para a página inteira, nenhuma em laço; empresa com 50 projetos abre em tempo comparável a uma com 1 | **#12** | | **O** | — | browser + smoke |
| F3.8 | Sinal de reativação: ao criar prospecção para empresa que já tem histórico, mostrar o resumo e oferecer vincular | F3.7 | criar prospecção para a Záphis mostra "3 contratos anteriores" antes de salvar | #25 | | S | — | browser |
| F3.9 | `AnexoLead` → `Documento` genérico ancorado no cliente (mesmo caminho já percorrido pelos anexos de proposta, ver `propostas-extras/queries.ts`) | F3.1 | os **4 anexos de produção** continuam baixando pela nova rota; `anexo_lead` = 4 permanece no banco (aditivo) | 00-aud §D | ⚠️⚠️ **arquivos em `STORAGE_BASE_PATH`, fora do dump do banco** | S | **M** | smoke |
| F3.10 | `src/components/ui/kpi-card.tsx` compartilhado — consolida as **7 duplicatas locais** (prepara a Fase 6) | F3.7 | `grep` das 7 implementações: as do Comercial migradas, as demais listadas na PR como follow-up; visual inalterado | — | | S | — | browser |
| F3.11 | Fecho da fase: lint + test + build + `scripts/smoke-crm-fase3.ts` | todas | 4 verdes | — | | H | — | smoke |

---

## FASE 4 — Sales Navigator

**Objetivo:** transformar uma URL colada do Sales Navigator em prospecção estruturada em **menos de 60 segundos**, e mover listas em CSV nos dois sentidos.

**O que faz o time querer usar:** **entrada em massa**. Enquanto cada prospect custar cinco telas, ninguém registra — e essa é a fase que faz o volume existir. Sem volume, a Fase 6 não tem o que mostrar. **Nada de scraping ou automação de navegador**: só campos, listas e importação manual de arquivo.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F4.1 | Campos de lista do Sales Navigator em `Cliente`/`ContatoCliente`: `listaSalesNavigator`, `dataInclusaoLista`, `statusAbordagem` | F1.8, F1.9 | `prisma validate`; filtrar a lista de empresas por "lista SN" funciona | P13 item 1 | | H | **M** | browser |
| F4.2 | CRUD + UI de `Campanha` (nome, canal, período, responsável, meta, observação) | F1.23 | criar campanha, vincular 3 prospecções, filtrar o board por campanha | P13 item 2 | | S | — | browser |
| F4.3 | **Fluxo rápido de prospecção numa tela só:** colar URL → buscar empresa por nome/domínio (usa `dedupe.ts`) → criar ou vincular empresa → criar ou vincular contato → criar prospecção → registrar abordagem | F1.12, F3.4, F4.2 | **cronometrar**: 1 prospect novo em < 60s sem sair da tela; 2º prospect da mesma empresa reaproveita a empresa sem criar duplicata | P13 item 3 | | S | — | browser |
| F4.4 | `src/lib/import/mapeamento-crm.ts` + `.test.ts`: `CAMPOS_OBRIGATORIOS` do CRM reusando o algoritmo `autoMapear`. ⚠️ o `mapeamento.ts` atual é **acoplado ao financeiro** (`CAMPOS_OBRIGATORIOS` são campos de `Lancamento`) — não reaproveitar direto | F1.12 | teste: cabeçalho `"Empresa";"E-mail do contato";"Telefone"` é auto-mapeado; coluna desconhecida fica sem mapeamento em vez de adivinhar | P13 item 4 | | S | — | puro |
| F4.5 | Wizard de importação CSV **copiando o padrão** de `components/financeiro/importacao/importador-view.tsx`: upload → mapeamento pelo usuário → pré-visualização **com detecção de duplicata por empresa e por contato** → importação transacional → relatório criados/vinculados/ignorados/erros. Nada é sobrescrito em silêncio | F4.4, F1.13 | importar CSV de 100 linhas com 10 duplicatas: pré-visualização marca as 10; relatório final soma 100; rodar o mesmo arquivo 2× não cria nada novo | P13 item 4 | | S | — | browser + smoke |
| F4.6 | Exportação CSV de empresas, contatos, prospecções e negociações **respeitando os filtros ativos**, passando por `podeAbordar()` | F1.10, F2.15 | teste: contato com `optOut=true` **não** aparece no arquivo exportado nem em lista de abordagem; export com filtro de campanha traz só aquela campanha | P13 items 5–6, T1 | | S | — | puro + browser |
| F4.7 | Fecho da fase: lint + test + build + `scripts/smoke-crm-fase4.ts` (⚠️ já existe um `scripts/smoke-fase4.ts` não relacionado — usar o prefixo `smoke-crm-`) | todas | 4 verdes | — | | H | — | smoke |

---

## FASE 5 — Propostas

**Objetivo:** a proposta passa a nascer de uma negociação, versionada, com aceite e perda estruturados — **sem quebrar** link público, PDF, numeração e aceite atuais.

**O que faz o time querer usar:** é aqui que a proposta do sistema fica **melhor que a do Word** — já pré-preenchida desde F1.22, versionada com diff, com link rastreado por pixel, e virando `Projeto` no aceite. É a única atividade que o dono hoje faz inteiramente fora do sistema.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F5.1 | **Bloqueante:** apresentar plano curto de como vincular propostas a negociações sem quebrar PDF, link público e aceite — e **esperar aprovação** (P14 item 1) | F2.4 | usuário aprovou por escrito no `01-decisoes.md` | P14 | | **O** | — | — |
| F5.2 | `Proposta.negociacaoId` **nullable** + backfill: a única proposta de produção recebe negociação sintética com `needsReview=true`. Coluna **permanece nullable** no banco (obrigatoriedade fica na validação, F5.3) — NOT NULL travaria histórico | F5.1 | `numero` e `token` **byte a byte inalterados**; `/a/proposta/<token>` abre; `PropostaSequencia.ultimo` inalterado | P14 item 2 | ⚠️⚠️ **link já enviado a cliente** | **O** | **M** | smoke |
| F5.3 | Proposta **nova** exige `negociacaoId` — validação na action, com mensagem de negócio | F5.2 | criar proposta sem negociação é recusado na UI; a proposta histórica continua abrindo | P14 item 2 | | S | — | browser |
| F5.4 | `PropostaVersao` ganha campos estruturados (`valorOriginal`, `valorVersao`, `desconto`, `status`, `validade`, `dataEnvio`, `observacao`); versão vigente **derivada** (maior `numero`), nunca duplicada. `snapshot` JSON permanece | F5.2 | salvar 3 versões e comparar duas sem parsear JSON; `versoesComparaveis` continua funcionando | P14 item 3, ADR-05 | ⚠️ toca versionamento em uso | **O** | **M** | puro + browser |
| F5.5 | `StatusProposta.em_negociacao` + transições. **`visualizada` não vira estado** — continua derivado de `PropostaVisualizacao.length > 0` (02-schema §8.4) | F5.4 | `grep` não acha `VISUALIZADA` no enum; badge "visualizada" aparece a partir do pixel | P14 item 4 | | S | **M** | browser |
| F5.6 | `src/modules/comercial/validade.ts` + `.test.ts` (puro, relógio injetado): `propostaExpirada(validade, hoje)` em **America/Recife**; corrige o `new Date(i.validade)` sem normalização de `actions.ts:399` | F5.4, F1.3 | teste: validade "hoje" às 23h de Recife **não** está expirada; muda ao virar o dia; roda igual com `TZ=UTC` no ambiente | T5, #m9 | ⚠️ corrige bug em código de produção | **O** | — | puro |
| F5.7 | Expiração automática: handler em `src/lib/jobs-handlers.ts` + entrada no array `automacoes` de `src/lib/jobs.ts` (20 crons já rodando). Idempotência por `updateMany` condicional (compare-and-swap, padrão de `dispararAvisosAgendados`) | F5.6 | rodar o tick 2× seguidas → 1 notificação por proposta; proposta já `aceita` nunca expira | #m9 | | **O** | — | smoke |
| F5.8 | Desconto acima do limite (`ConfigSistema` = 10%) exige justificativa registrada | F1.7, F5.4 | desconto de 15% sem justificativa é recusado; com justificativa grava `Atividade` + `AuditLog` | Q6, T2 | | S | — | browser |
| F5.9 | **Aceite reescrito**, uma única transação: `Negociacao→CONTRATADO`, `Atividade`+`AuditLog`, `Cliente→CLIENTE`, valores comerciais finais, versão aceita **imutável**, `Projeto` criado — gravando **`Projeto.negociacaoId` E `Proposta.projetoId` sempre juntos**, nunca um sem o outro (02-schema §8.5) | F5.4, F3.2, F1.3 | teste dedicado prova que os dois campos são gravados na mesma transação e que falha em qualquer etapa não deixa projeto órfão; `smoke-crm-fase5.ts` roda proposta→projeto ponta a ponta; o teste de caracterização de F1.3 é atualizado, não deletado | P14 item 6, #33 | ⚠️⚠️ **coração do módulo** | **O** | — | puro + smoke |
| F5.10 | Perda estruturada: motivo **obrigatório do catálogo**, `concorrente` quando `motivo.exigeConcorrente`, observação livre. Vale para `Negociacao` **e** para `Proposta` recusada (hoje `mudarStatusProposta` não pede motivo — 00-aud §E.7) | F1.6, F5.5 | perder sem motivo é recusado; motivo "perdeu para concorrente" exige o nome; recusar proposta agora também pede motivo | **#15**, **#14** (campo sim, estatística adiada) | | S | — | browser |
| F5.11 | Reabrir negociação perdida, com registro em `Atividade` + `AuditLog` | F5.10, F2.7 | reabrir volta ao estágio anterior e a timeline mostra os dois eventos | ADR-10, P14 item 8 | | S | — | browser |
| F5.12 | Fechar as lacunas restantes da conversão (equipe, cronograma, financeiro no aceite) sem duplicar empresa nem contatos | F5.9 | projeto criado pelo aceite já nasce com responsáveis e canais; nenhum `Cliente`/`ContatoCliente` novo é criado na transação (conferido por contagem antes/depois) | **#33** | ⚠️ toca aceite | S | — | smoke |
| F5.13 | **Opcional / decisão:** PDF **imutável** arquivado por versão enviada. Hoje o PDF é renderizado **ao vivo** da página pública via `puppeteer-core` (`page.goto` em `/a/proposta/[token]`), então o PDF de amanhã pode diferir do de hoje (00-aud §E.6) | F5.4 | se aprovado: baixar o PDF da versão 1 depois de salvar a versão 2 devolve o documento da v1 | — | ⚠️ depende de `CHROME_PATH`; custo de storage | **O** | **M** | smoke |
| F5.14 | Fecho da fase: lint + test + build + `scripts/smoke-crm-fase5.ts` | todas | 4 verdes; checklist de `03-migracao.md` §7 reexecutado (`projeto`=31, token/numero intactos) | — | | H | — | smoke |

---

## FASE 6 — Inteligência comercial

**Objetivo:** transformar registro em resposta gerencial — e só depois de existir o que medir.

**O que faz o time querer usar:** sendo honesto — **nada, se não houver dado**. Esta fase só entrega valor depois de as Fases 4–5 gerarem volume. Por isso, **o aceite de toda tarefa de métrica é contra o seed sintético (F6.2), com o número conferido à mão** — nunca contra os 8 leads de produção. E vale a regra do P17 item 9: métrica que não pode ser calculada mostra estado vazio explicando o motivo, jamais uma estimativa.

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| **F6.1** | **Bloqueante de toda a fase:** `docs/crm/05-metricas.md` (P15) — definição, fórmula, campo de data que governa o período, o que entra/fica de fora, nulos, granularidade e SQL de referência por indicador | F5.14 | as **6 ambiguidades resolvidas por escrito**: coorte × eventos; ticket por contrato × por empresa; marco e janela de "novo × recorrente"; canceladas/em espera no denominador; `EM_ESPERA` no pipeline aberto; valor contratado = negociado final × versão aceita | #m5 | | **O** | — | — |
| F6.2 | `scripts/seed-crm-volume.ts` — volume sintético **nunca em produção**: 2.000 empresas, 6.000 contatos, 4.000 prospecções, 1.500 negociações, 3.000 propostas, 50.000 atividades | F5.14 | script aborta se `DATABASE_URL` apontar para o host de produção; rodar 2× não duplica | P19 item 2 | ⚠️ guarda anti-produção é obrigatória | S | — | smoke |
| F6.3 | `src/modules/comercial/metricas.ts` + `.test.ts` (puro): **todas** as fórmulas de `05-metricas.md` — pipeline ponderado (Σ valor × probabilidade), ticket médio, conversão entre etapas e ponta a ponta, tempo médio de fechamento, desconto médio, recompra 6/12/24m, forecast | **F6.1** | cada métrica testada contra um conjunto fixo pequeno com o resultado **calculado à mão** no próprio teste; nenhum import de Prisma no arquivo | **#18**, **#19**, **#20**, #m5 | | **O** | — | puro |
| F6.4 | **Decisão:** primitivo de gráfico. **(a)** SVG/CSS à mão, que é o padrão vigente (`components/ui/sparkline.tsx` é o **único** primitivo hoje; zero recharts/chart.js/d3 no repo) · **(b)** adicionar biblioteca. Trade-off: **(a)** zero dependência nova e consistente com a casa, mas funil/barras empilhadas dão trabalho; **(b)** entrega rápido, mas é a primeira dependência de UI pesada do projeto. **Inclinação: (a) para barras e funil, que é tudo que P17 pede.** | F6.1 | escolha registrada em `01-decisoes.md` | — | | S | — | — |
| F6.5 | **Home do Comercial / "Meu Dia"**: cards (contratado no mês, pipeline aberto, pipeline ponderado, conversão, contratos, ticket médio, follow-ups hoje/atrasados) com comparação com o período anterior e link para a lista filtrada; seção Meu Dia com concluir/reagendar sem sair da tela. Limites de dias vêm de `ConfigSistema` (F1.7) | F6.3, F2.9, F3.10 | **medir e reportar**: nº de queries e tempo da home com o seed de F6.2; `grep` não acha número de dias literal; estados de carregando e vazio resolvidos | **#34**, #m5, P16 | | S | — | browser + smoke |
| F6.6 | Alternância "meus × todos" (usa `responsavelId` só como atribuição — ADR-15) | F6.5 | alternar muda os números e persiste na URL | ADR-15 | | H | — | browser |
| F6.7 | Página **Inteligência Comercial**: filtros globais na URL; funil de conversão visual com taxa entre etapas e ponta a ponta; análise por canal e campanha (**com as taxas, não só a contagem de contratos**); por tipo de empreendimento e por disciplina, incluindo desconto médio; novos × recorrentes com recompra 6/12/24m | F6.3, F6.4 | cada número da tela **bate com o teste de F6.3** rodado sobre o mesmo seed; recorte por canal sem contrato mostra vazio explicado, não zero enganoso | **#34**, #20, #17 | | **O** | — | browser + smoke |
| F6.8 | Listas de reativação por regra determinística + filtros salvos com nome ("Prospects esquecidos", "Clientes inativos", "Sem contato há mais de 90 dias"), com X configurável | F6.3, F1.7 | criar filtro salvo, recarregar e reencontrar; mudar X em `ConfigSistema` muda a lista | **#25**, P17 item 7 | | S | — | browser |
| F6.9 | Exportação CSV de **qualquer** recorte da Inteligência | F4.6, F6.7 | exportar o recorte "canal = Indicação, 2026" e conferir que as linhas batem com a tela | P17 item 8 | | H | — | browser |
| F6.10 | `src/modules/comercial/score.ts` + `.test.ts`: score do lead como **heurística pura, transparente e testada** (tier `caminho-critico.ts`/`health.ts`/`encargos.ts`). Exibido como faixa, **nunca** como decisão automática. **ML permanece rejeitado** — veredito do dono | F6.3 | cada regra do score tem teste com entrada e saída fixas; a UI mostra **quais** regras pontuaram, não só o número; `grep` não acha nenhuma dependência de ML | **#17**, **#16** (framing de ML rejeitado) | | **O** | — | puro |
| F6.11 | **Auditoria de performance (P19)**: contar queries e medir tempo em Empresa 360, os 2 Kanbans, Home e Inteligência com o seed de F6.2; `EXPLAIN` nas queries mais caras validando os índices de `02-schema.md` §4; eliminar N+1; paginar tudo que cresce sem limite | F6.2, F6.7 | tabela **antes/depois com números** no `06-progresso.md`; saída do `EXPLAIN` mostrando índice usado (não seq scan) nas 5 queries mais caras | P19 | | **O** | **M** (índices que faltarem) | smoke |
| F6.12 | Fecho da fase: lint + test + build | todas | 4 verdes | — | | H | — | smoke |

---

## FASE 7 — Preparação para automações (sem IA)

**Objetivo:** o sistema passa a cobrar o time, em vez de depender de alguém lembrar.

**O que faz o time querer usar:** a notificação chega no **responsável**, com link direto para o registro. É o que faz o dado registrado voltar como utilidade para quem registrou — e fecha o ciclo de adoção que a Fase 1 abriu. **Nenhuma IA, nenhum lead scoring automático, nenhuma geração de mensagem, nenhuma previsão por ML.**

| ID | Tarefa | Dep | Aceite verificável | Ideia | ⚠️ | Modelo | Mig/Seed | Prova |
|---|---|---|---|---|---|---|---|---|
| F7.1 | `src/modules/comercial/regras.ts` + `.test.ts` (puro, **datas fixas**): interface `RegraComercial` + as 6 regras — follow-up vencido, proposta perto da validade, negociação sem interação há X dias, cliente inativo há Y dias, negociação parada no mesmo estágio há Z dias, cliente elegível a reativação | F6.3, F2.9, F5.6 | cada regra tem teste com `hoje` fixo e conjunto fixo; nenhuma leitura de relógio dentro do arquivo | **#21**, P18 item 1 | | **O** | — | puro |
| F7.2 | Parâmetros de cada regra em `ConfigSistema` (X, Y, Z, limiares) + tela de configuração | F1.7, F7.1 | `grep` não acha nenhum limiar literal em `regras.ts` nem no handler; mudar Z na tela muda o resultado do próximo tick | P18 item 2 | | S | **S** | browser |
| F7.3 | Motor único e extensível: handler em `src/lib/jobs-handlers.ts` + objeto no array `automacoes` de `src/lib/jobs.ts`. Notificação vai para o **responsável**, com link direto | F7.1, F7.2 | rodar sob `npm run dev:server` (pg-boss não roda sob `npm run dev`) e ver a notificação chegar com link que abre o registro certo | P18 items 3–4 | | **O** | — | smoke |
| F7.4 | **Idempotência**: tabela de dedup com `@@unique`, no padrão de `src/modules/licitacoes/alertas-dedup.ts` | F7.3 | `scripts/smoke-crm-automacoes.ts`: rodar o tick **2× no mesmo dia** → **1** notificação por fato; mudar o dia → notifica de novo | P18 item 3 | | **O** | **M** | smoke |
| F7.5 | Categoria `notif_comercial` no opt-out: `notificar()`/`notificarMuitos()` com `categoria` + chave adicionada em `src/components/configuracoes/preferencias-view.tsx` (onde `notif_proposta` já está). ⚠️ **`src/lib/notifications.ts` é legado e não filtra — não usar** | F7.3 | usuário que desliga "Comercial" nas preferências deixa de receber; `grep -rn "lib/notifications" src/modules/comercial/` vazio. **Não é `db:seed`** — a preferência é chave/valor por usuário | — | | H | — | browser |
| F7.6 | **Checklist por etapa SOFT**: percentual/aviso no card, **nunca hard-gate** que trave o `moverEstagio` — veredito do dono | F2.7, F1.7 | mover um card com checklist em 0% **funciona** e só exibe aviso; teste garante que `moverEstagio` não consulta checklist para autorizar | **#23** | | S | **M** | puro + browser |
| F7.7 | Ponto de extensão documentado para automações futuras (interface de regra + como registrar uma nova), **sem nada de IA** | F7.3 | adicionar uma 7ª regra de exemplo toca só `regras.ts` + 1 linha de registro | P18 item 5 | | S | — | — |
| F7.8 | **P20 — validação dos 20 critérios de aceitação** ponta a ponta, cada um com PASSA/FALHA/PARCIAL e evidência, + teste e2e `scripts/smoke-crm-e2e.ts` cobrindo o fluxo 1→20 | tudo | os 20 com veredito e evidência (arquivo, teste ou passo de UI); FALHA/PARCIAL viram lista de correção **ordenada por esforço** | P20 | | S | — | smoke |
| F7.9 | Fecho: lint + test + build; marcar o roadmap A–F como **superseded** apontando para este arquivo; entrada final no `06-progresso.md` | F7.8 | cabeçalho do `2026-07-24-crm-comercial-roadmap.md` diz "superseded por `docs/crm/04-plano-fases.md`" | — | | H | — | — |

---

## 3. Cobertura das 34 ideias A–F

| # | Ideia | Onde caiu |
|---|---|---|
| 11 | Empresa + múltiplos contatos (B2B) | F1.9, F1.11 |
| 12 | Histórico consolidado do cliente | **F3.7** (Empresa 360) |
| 13 | Parceiros / indicações | **não coube** — ver §4 |
| 14 | Concorrentes | F5.10 (campo `Negociacao.concorrente`). Estatística **adiada** — veredito do dono |
| 15 | Motivos de perda estruturados | F1.5, F1.6 (catálogo `MotivoPerda`) + F5.10 |
| 16 | Probabilidade dinâmica | F2.6 (`ProbabilidadeEstagio`) + F6.10. **Framing de ML rejeitado** — só heurística |
| 17 | Score do lead | **F6.10** (função pura testada, transparente) |
| 18 | Pipeline ponderado | F6.3, F6.5 |
| 19 | Forecast de faturamento | F6.3, F6.7 |
| 20 | Tempo médio até fechamento por origem | F6.3, F6.7 (depende de F3.2) |
| 21 | Sequências automáticas de follow-up | **parcial**: F7.1/F7.3 cobrem o *aviso*; a *cadência multi-passo* não coube — ver §4 |
| 22 | Modelos de follow-up (canned) | F3.5 (em `ConfigSistema`, sem entidade nova) |
| 23 | Checklist por etapa | **F7.6 — SOFT**, nunca hard-gate |
| 24 | Dedup de clientes | F1.12 → F1.15 |
| 25 | Reativação de oportunidade | F3.8 + F6.8 |
| 26 | Timeline completa | **F3.1–F3.3, F3.6** (fundação-chave) |
| 27 | Integração e-mail inbound | **rejeitado** — sem IMAP/webhook, deploy nativo Windows. Veredito mantido |
| 28 | Registro WhatsApp manual | F3.4. **Sem API oficial** — veredito mantido |
| 29 | Arquivos do lead | **já entregue** (`AnexoLead`); F3.9 migra para `Documento` |
| 30 | Tipo de empreendimento | F1.5, F1.6 |
| 31 | Disciplinas de interesse | F2.4 (`NegociacaoDisciplina`) |
| 32 | Estimativa de honorários | **F1.22** — só a versão *lookup* R$/m². "Aprende com histórico" permanece rejeitado |
| 33 | Conversão completa | F5.9, F5.12 |
| 34 | Dashboard executivo | F6.5, F6.7 |
| m1 | Responsável pelo lead | F1.23 |
| m2 | Próximo contato / lead parado | F2.9, F2.10, F2.11 |
| m3 | — | **não existe conteúdo no roadmap** — ver §4 |
| m4 | Origem estruturada | F1.23 (`canalId` + `origemDetalhada`) |
| m5 | Camada única de métrica | F6.1, F6.3 |
| m6 | Botão WhatsApp/e-mail no card | F2.16 |
| m7 | Temperatura do lead | F2.12 |
| m8 | Busca + filtros no board | F2.15 |
| m9 | Alerta de validade da proposta | F5.6, F5.7 |
| m10 | Pré-preencher proposta | **F1.22** |

## 4. O que NÃO coube, e por quê

| Ideia | Por quê |
|---|---|
| **#13 — Parceiros / indicações** | `02-schema.md` **não tem entidade `Parceiro`** e nenhuma ADR decidiu criá-la (`grep -n -i parceiro prisma/schema.prisma docs/crm/02-schema.md` só acha o valor de enum `PARCEIRO` de `StatusComercialCliente`). O guardrail do playbook manda **parar e perguntar** em vez de projetar além do 02-schema. **Duas saídas, e a decisão é sua:** (a) `CanalAquisicao = "Indicação"` + `origemDetalhada` = nome de quem indicou — custo zero, já cabe em F1.23, mas não dá para rankear parceiro nem pagar comissão; (b) entidade `Parceiro` de verdade — exige ADR nova, migration e UI, ~1 dia. |
| **#21 — a parte "sequências"** | A cadência automática multi-passo (dia 0 e-mail → dia 3 ligação → dia 7 LinkedIn, com templates) é produto novo, não regra. O P18 pede explicitamente **regras determinísticas**, e F7.1/F7.3 entregam o *aviso* de follow-up vencido — que é o que o roadmap descreveu como "cron pg-boss sobre `proximoContato`". A cadência fica registrada como candidata a uma fase 8 futura. |
| **#m3** | **Não existe no documento fonte.** A legenda diz `m1..m10`, mas `m3` não é citado em nenhuma seção do roadmap (`grep -oE "\bm[0-9]+\b"` devolve m1, m2, m4, m5, m6, m7, m8, m9, m10). Sem conteúdo, sem como alocar — não inventei um. |
| **#27 — e-mail inbound** | Permanece **inviável**: sem IMAP/webhook, deploy nativo Windows sem infra de mail. Outbound (`enviarEmailTemplate`) + abertura do link (`PropostaVisualizacao`) já dão ~80%. |
| **#16 como ML / #32 "que aprende"** | Rejeitados no framing original. Entram só como heurística explícita (F6.10) e lookup R$/m² (F1.22). |
| **#14 — estatística de concorrentes** | Campo entra (F5.10); "% de vitória vs concorrente X" só faz sentido com volume de disputas que não existe. Adiado, conforme o veredito. |

## 5. Migrations e `db:seed` — consolidado

**Exigem migration (`M`):** F1.5, F1.8, F1.9, F1.14, F1.16, F1.17, F1.18, F1.19, F1.20, F1.23 · F2.3, F2.4, F2.5, F2.10, F2.12 · F3.1, F3.9 · F4.1 · F5.2, F5.4, F5.5, F5.13 · F6.11 · F7.4, F7.6.

**Exigem `npm run db:seed` também no deploy (`S`):**

| Tarefa | O que o seed cria |
|---|---|
| F1.6 | catálogos `TipoEmpreendimento`, `MotivoPerda`, `CanalAquisicao`, `Segmento` + defaults de `ProbabilidadeEstagio` |
| F1.7 | chaves de `ConfigSistema` do Comercial (desconto 10%, dias sem contato, aviso de validade, cliente inativo) |
| F7.2 | parâmetros X/Y/Z das 6 regras de automação |

**Não exigem seed, ao contrário do que se supõe:** **permissões**. ADR-15 manteve `comercial:ver`/`comercial:gerir` — **nenhum recurso ou ação nova** entra no `permissions-catalog.ts` em nenhuma das 7 fases. A categoria `notif_comercial` (F7.5) também não é seed: é chave/valor de preferência por usuário, registrada em `preferencias-view.tsx`.

**Duas ordenações rígidas** (quebrar = migration falha ou dado errado):
1. **F1.15 (fusão manual) antes de F1.16 (índice único parcial)** — a fusão do grupo `nominal engenharia` *preenche* um `documento` que hoje é nulo.
2. **F6.1 (dicionário de métricas) antes de qualquer tarefa de F6** — sem fórmula escrita, gráfico vira decoração.

## 6. Testes — arquivo puro × smoke × browser

**Arquivo puro + `*.test.ts` irmão** (sem `server-only`, sem Prisma, relógio injetado onde há data):

| Arquivo | Tarefa |
|---|---|
| `src/modules/comercial/status.ts` + `.test.ts` | F1.1 |
| `src/modules/comercial/numeracao.ts` + `.test.ts` | F1.2 |
| `src/modules/comercial/service.ts` + `service.test.ts` (guards síncronos, padrão de `custos/orcamento/service.test.ts`) | F1.3, F2.7, F2.8 |
| `src/modules/comercial/labels.ts` + `.test.ts` | F1.4 |
| `src/modules/comercial/lgpd.ts` + `.test.ts` | F1.10 |
| `src/modules/comercial/dedupe.ts` + `.test.ts` | F1.12 |
| `src/modules/comercial/honorarios.ts` + `.test.ts` | F1.22 |
| `src/modules/comercial/jornada.ts` + `.test.ts` | F2.6 |
| `src/modules/comercial/frescor.ts` + `.test.ts` | F2.9 |
| `src/lib/import/mapeamento-crm.ts` + `.test.ts` | F4.4 |
| `src/modules/comercial/validade.ts` + `.test.ts` | F5.6 |
| `src/modules/comercial/metricas.ts` + `.test.ts` | F6.3 |
| `src/modules/comercial/score.ts` + `.test.ts` | F6.10 |
| `src/modules/comercial/regras.ts` + `.test.ts` | F7.1 |

**`scripts/smoke-*.ts`** (prefixo `smoke-crm-` porque `scripts/smoke-fase4.ts` já existe e é de outra coisa; cada um ganha entrada em `package.json`):
`smoke-crm-fase1.ts` (aceite atual + seed idempotente 2×) · `smoke-crm-dedupe.ts` (mesclagem) · `smoke-crm-prod.ts` (checklist de `03-migracao.md` §7 após F1.15/F1.21/F2.18) · `smoke-crm-fase2.ts` · `smoke-crm-fase3.ts` (anexos migrados ainda baixam) · `smoke-crm-fase4.ts` (import 2× não duplica) · `smoke-crm-fase5.ts` (proposta→projeto ponta a ponta, token/numero intactos) · `smoke-crm-automacoes.ts` (tick 2× = 1 notificação) · `smoke-crm-e2e.ts` (os 20 critérios).

**Só verificação em browser:** formulário em abas de Empresa (F1.11), alerta de duplicata (F1.13), os dois Kanbans e filtros (F2.13–F2.17), registro em 2 cliques (F3.4), Empresa 360 (F3.7, com o log do Prisma como evidência), prospecção rápida cronometrada (F4.3), wizard CSV (F4.5), Home/Meu Dia (F6.5), Inteligência (F6.7).

## 7. Riscos

| # | Risco | Mitigação neste plano |
|---|---|---|
| 1 | **Adoção, não técnica.** O time contorna o módulo hoje; nenhum backlog resolve isso sozinho | Cada fase declara seu gancho. O mais forte (proposta que ganha do Word) é puxado para **F1.22** dentro da Fase 1, respeitando a ordem escolhida |
| 2 | **F5.2/F5.9 tocam o aceite e o link público já enviado a cliente** | F1.3 cria o teste de caracterização **antes**; F5.1 é aprovação bloqueante; aceite exige `numero`/`token`/`PropostaSequencia.ultimo` byte a byte inalterados |
| 3 | **F1.17 (soft delete em `Cliente`) respinga em 5 módulos fora do CRM** | Tarefa **isolada**, precedida de `grep -rn "prisma.cliente" src/` completo com inventário revisado; aceite verifica módulos não-CRM |
| 4 | **F1.15 pode mover projeto de obra para a empresa errada** (31 projetos em 46 clientes) | Conferência de projeto por grupo **antes** de fundir; query antes/depois provando que nenhum projeto trocou de cliente |
| 5 | **F1.21 mexe em `Disciplina`, que carrega pagamento ao projetista** | Desmembramento das 3 strings compostas é **manual, com o responsável do projeto**; aceite compara soma de `Disciplina.valor` e contagem de `RevisaoDisciplina` |
| 6 | **F2.19 (KanbanBoard compartilhado)** — refactor de 2 módulos, e `tarefas-board.tsx` não tem teste | Rebaixada a **opcional e adiável**, no fim da Fase 2 ou na Fase 6, gated nos boards novos já estáveis. Não no meio da reescrita do modelo de dados |
| 7 | **Dashboard sobre dado ralo mente** | Todo aceite de Fase 6 é contra o seed sintético de F6.2, com número conferido à mão; P17 item 9 (estado vazio explicado, nunca estimativa) é regra de aceite |
| 8 | **Fase 6 depende de `Atividade` (F3.2) estar completa** — se algum evento não for registrado, tempo-por-etapa e win-rate saem errados **em silêncio** | F3.3 fecha a dívida de `entidadeId`; F6.3 testa cada fórmula contra conjunto fixo antes de qualquer tela |

## 8. Onde tive de escolher entre dois caminhos

**8.1 — Apagar o `Oportunidade` órfão conflita com o guardrail.** `03-migracao.md` §6 diz que o model, o módulo, a view e a rota podem ser descartados (0 registros em produção). `99-playbook.md` linha 3 diz *"não apague dados, tabelas ou colunas existentes; depreciação é aditiva"*. **Resolvi assim:** F1.24 apaga o **código** (módulo, view, rota, nav) e **deixa a tabela** no schema, órfã e inerte. Código morto é dívida; tabela vazia não custa nada e respeita o guardrail ao pé da letra. Se você preferir também dropar a tabela, é uma linha na migration — mas é decisão sua, não minha.

**8.2 — `Proposta.negociacaoId` obrigatório: no banco ou na validação?** O P14 item 2 diz "toda Proposal passa a exigir opportunityId". Optei por **coluna nullable + obrigatoriedade na action** (F5.2/F5.3). NOT NULL no banco travaria a proposta histórica e qualquer registro futuro que precise nascer sem negociação; a garantia real que importa (nenhuma proposta **nova** sem negociação) é exatamente a mesma. Alternativa descartada: NOT NULL com negociação sintética forçada — mais rígido, e o risco recai sobre o único registro que não pode quebrar.

**8.3 — Score do lead: Fase 6, não Fase 2.** Tentador colocar junto com a temperatura (F2.12), mas o score depende de sinais que só existem depois da timeline (F3.2) e das métricas (F6.3). Score alimentado por dado incompleto é pior que score nenhum — vira número que ninguém confia e que ninguém consegue explicar.

**8.4 — Modelos de follow-up em `ConfigSistema`, não em tabela nova.** `#22` pede "notas prontas". `ConfigSistema` é chave/valor JSON, já é o padrão em ~8 módulos, e evita uma tabela para guardar meia dúzia de textos. Se um dia virar biblioteca com categorias e permissão por autor, aí sim vira tabela — mas não agora.

**8.5 — `service.ts` na Fase 1, e não como Fase 0.** Você vetou a Fase 0, e concordo com o encaixe: F1.1–F1.3 são o **único momento do plano em que nada de schema muda**, o que torna a extração um diff de movimentação puro, auditável por `git diff`. Fazer depois significaria refatorar código que a Fase 2 e a Fase 5 já reescreveram — trabalho jogado fora.

---

### Arquivos críticos para a implementação

- `src/modules/comercial/actions.ts` (607 linhas, sem `service.ts`; `etapaEhPerdido` na :48, `new Date(i.validade)` na :399, `aceitarProposta` na :541)
- `prisma/schema.prisma` (`DisciplinaCatalogo`:906, `ConfigSistema`:803, `Compromisso`:3231, `Lead`:3442, `Proposta`:3550)
- `docs/crm/02-schema.md` (schema alvo; §5 unicidades, §8.2 âncora da Próxima Ação, §8.5 duplo vínculo Projeto, §8.6 soft delete em `Cliente`)
- `docs/crm/03-migracao.md` (§4 as 3 fusões, §5 as 24 grafias, §7 checklist de validação)
- `src/lib/jobs.ts` + `jobs-handlers.ts` (array `automacoes` na :172; padrão de idempotência em `src\modules\licitacoes\alertas-dedup.ts`)
