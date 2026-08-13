# 01 — Decisões de arquitetura de produto (ADR)

> Gerado pelo prompt P2. Base: `docs/crm/00-auditoria.md` + tabela A.3 do playbook, com os **defaults
> sugeridos aceitos integralmente** pelo usuário. Nenhum código foi alterado.

Cada ADR usa o número da linha correspondente na tabela A.3 do playbook (`#1`…`#16`).

---

## ADR-01 — Prospecção pertence à Empresa

- **Contexto:** hoje `Lead.clienteId` é opcional e `Lead.contato` é um campo de texto livre (não FK). Não existe join N:N lead↔contato.
- **Decisão:** prospecção pertence à **Empresa** (Cliente), com N contatos vinculados via tabela de junção; contato principal é opcional.
- **Consequências:** precisa de uma tabela nova `LeadContact` (ou equivalente) ligando `Lead` a `ContatoCliente`. `Lead.contato` (string) fica **deprecado, não apagado** — mantém o texto histórico como fallback de exibição para leads antigos sem contato estruturado.
- **Alternativas descartadas:** prospecção pertencer ao Contato (perderia a visão "tudo que já rolou com essa empresa", que é o objetivo central do Empresa 360, item A.1 do playbook).
- **⚠️ Conflito com código atual:** `Lead.clienteId` é opcional e `Lead.contato` é texto livre — vira estrutura obrigatória de relação. Custo: migration aditiva (nova tabela) + backfill que tenta casar `Lead.contato`/`Lead.email`/`Lead.telefone` com um `ContatoCliente` existente ou cria um novo.

## ADR-02 — Uma prospecção ativa por Empresa + Campanha

- **Contexto:** hoje nada impede múltiplos `Lead`s abertos para a mesma `Cliente`.
- **Decisão:** não pode haver 2 prospecções abertas para a mesma empresa (por campanha); as demais viram interações (não registros novos).
- **Consequências:** exige índice único parcial `(clienteId, campaignId) WHERE status IN (abertos)`. Depende da entidade `Campaign` (P3) existir antes de a constraint fazer sentido.
- **Alternativas descartadas:** permitir múltiplas prospecções simultâneas por empresa (rejeitado — gera ambiguidade de "qual é a prospecção ativa" na Empresa 360).
- **⚠️ Conflito com código atual:** hoje nada impede duplicidade — ver pergunta em aberto **Q1** abaixo, pois a regra depende de como tratamos `campaignId = null` (maioria dos leads existentes não tem campanha).

## ADR-03 — CNPJ opcional, único apenas quando preenchido

- **Contexto:** `Cliente.documento` é `String?` **sem nenhuma unicidade** hoje (nem total, nem parcial).
- **Decisão:** CNPJ/CPF continua opcional; único **apenas quando preenchido** (índice único parcial `WHERE documento IS NOT NULL`).
- **Consequências:** antes de criar o índice, é preciso rodar auditoria de duplicatas de `documento` no banco atual — se houver 2+ `Cliente` com o mesmo `documento` preenchido hoje, o índice falha na criação. Isso vira item do script de auditoria pré-migração (P4).
- **Alternativas descartadas:** exigir CNPJ sempre (rejeitado — prospect de Sales Navigator raramente tem CNPJ à mão).
- **⚠️ Conflito com código atual:** nenhuma validação de unicidade existe hoje em `criarLead`/`converterLead`/cadastro de cliente — risco real de já existirem duplicatas por CNPJ em produção.

## ADR-04 — Oportunidade tem 1 empreendimento

- **Contexto:** o model `Oportunidade` atual não tem noção de "empreendimento" nenhuma.
- **Decisão:** 1 oportunidade = 1 empreendimento. Vários empreendimentos do mesmo cliente = várias oportunidades.
- **Consequências:** greenfield — `Opportunity` novo ganha campos de empreendimento direto (não precisa de tabela à parte). Não há dado legado a migrar aqui.
- **Alternativas descartadas:** Oportunidade 1:N com empreendimentos (rejeitado — complica desnecessariamente o schema, e o histórico do `Lead` atual já é 1:1 implícito).
- **Conflito com código atual:** nenhum — mas depende do desfecho do model `Oportunidade` órfão (ver **Q2**).

## ADR-05 — Versionamento de proposta: `ProposalVersion` filha de `Proposal`

- **Contexto:** `PropostaVersao` **já existe** hoje e já é exatamente esse padrão — snapshot JSON a cada `salvarProposta`, filha de `Proposta`, versão vigente é a de maior `numero`.
- **Decisão:** manter o padrão atual (tabela filha, não auto-relacionamento); `Proposal` é 1:1 com a negociação, versões são o histórico.
- **Consequências:** é o único item da tabela A.3 que já está **implementado do jeito que o playbook recomenda**. Trabalho aqui é evolutivo: trocar o snapshot JSON solto por campos estruturados por versão (número, data, valor original, valor da versão, desconto, status, validade, envio, responsável, observação — pedido explícito do P14 item 3), não uma reescrita de arquitetura.
- **Alternativas descartadas:** nenhuma — já é a arquitetura vigente.
- **Conflito com código atual:** nenhum estrutural. Custo é de enriquecimento de campos, não de migração de forma.

## ADR-06 — Oportunidade → Projeto é 1:N (v1 cria 1, permite mais)

- **Contexto:** hoje `Proposta.projetoId` é **`@unique`** — uma proposta só pode gerar **um** projeto, e é a `Proposta` (não uma "Oportunidade") que se liga ao `Projeto`.
- **Decisão:** `Opportunity → Projeto` vira 1:N (um contrato pode gerar projetos por disciplina no futuro), mas a v1 cria exatamente 1 projeto e permite adicionar mais depois.
- **Consequências:** a FK de `Projeto` muda de pendurar em `Proposta.projetoId` (unique) para pendurar em `Opportunity` (sem unique, permitindo N). `aceitarProposta` (`actions.ts:541`) muda de "a proposta vira o projeto" para "o aceite da versão vigente da proposta, dentro de uma oportunidade, gera 1 projeto ligado à oportunidade".
- **Alternativas descartadas:** manter 1:1 Proposta↔Projeto (mais simples, mas não comporta "múltiplos projetos por disciplina no mesmo contrato" citado no playbook).
- **⚠️ Conflito com código atual:** relação muda de dono — `Proposta.projetoId @unique` (linha 3550+) precisa ser revisto; toda a transação em `aceitarProposta` precisa ser reescrita para gravar a FK em `Opportunity` em vez de (ou além de) `Proposta`. Projetos já criados hoje via propostas antigas mantêm o vínculo antigo por compatibilidade (aditivo).

## ADR-07 — Sem entidade Contrato na v1

- **Contexto:** não existe model `Contrato` hoje; `Projeto` cumpre esse papel de fato.
- **Decisão:** não criar entidade Contrato na v1; proposta aceita + Projeto cobrem o caso; deixar o gancho no schema (campo/relacionamento reservado, sem tabela).
- **Consequências:** nenhuma migração necessária aqui.
- **Alternativas descartadas:** criar `Contrato` já na v1 (rejeitado — sem uso claro além do que `Projeto` já resolve, adiado para reavaliação futura).
- **Conflito com código atual:** nenhum.

## ADR-08 — Status comercial da Empresa é derivado, com override manual

- **Contexto:** `Cliente` não tem nenhum campo de status comercial hoje (`ativo: Boolean` existe, mas é genérico, não é PROSPECT/CLIENTE).
- **Decisão:** status (`PROSPECT/CLIENTE/EX_CLIENTE/PARCEIRO`, conforme P3) é **derivado** de ter ao menos 1 proposta aceita, com campo de override manual.
- **Consequências:** greenfield — `Company.status` (calculado) + `Company.statusOverride` (nullable, vence o cálculo quando preenchido). Precisa de um service central (não espalhar o cálculo em múltiplas queries) — mesmo padrão de `saudeProjeto`/CPM já usado no sistema (funções puras testadas).
- **Alternativas descartadas:** status 100% manual (rejeitado — vira campo esquecido/desatualizado, exatamente o problema que a reforma quer evitar).
- **Conflito com código atual:** nenhum estrutural — é campo novo.

## ADR-09 — Temperatura existe em Lead e Oportunidade, ambos manuais

- **Contexto:** nenhum dos dois models tem campo de temperatura hoje.
- **Decisão:** campos independentes em `Lead` e `Opportunity`, ambos manuais (sem IA/scoring — proibido explicitamente no prompt original, item 38).
- **Consequências:** greenfield, dois enums/campos `temperatura` (`frio|morno|quente`, nomes a confirmar em pt-BR nos labels).
- **Alternativas descartadas:** temperatura única herdada Lead→Oportunidade (rejeitado — podem divergir; uma oportunidade pode esfriar mesmo com o lead original tendo sido "quente").
- **Conflito com código atual:** nenhum.

## ADR-10 — Oportunidade perdida pode ser reaberta

- **Contexto:** `atualizarOportunidade` (`oportunidades/actions.ts:42`) já permite trocar `status` livremente entre `aberta|ganha|perdida` sem nenhuma guarda — reabrir já é **tecnicamente possível hoje**, só não é registrado em lugar nenhum.
- **Decisão:** sim, pode reabrir, com registro na timeline e no audit log.
- **Consequências:** a transição de estágio precisa passar a valer por um service único (já previsto no P9 item 7 do playbook) que grava `Activity` + `AuditLog` a cada mudança — hoje `atualizarOportunidade` faz `update` direto sem esse rastro.
- **Alternativas descartadas:** bloquear reabertura (rejeitado — vendas reais reabrem negociação depois de meses).
- **⚠️ Conflito com código atual:** `atualizarOportunidade` muda `status`/`etapa` via update genérico, sem gate de transição nem registro — precisa ser substituída pelo service único do P9.

## ADR-11 — Soft delete em Empresa, Contato, Lead, Oportunidade

- **Contexto:** **nenhum** dos 4 models tem soft delete hoje. Mais grave: `excluirOportunidade` (`oportunidades/actions.ts:80`) faz **hard delete** (`prisma.oportunidade.delete`) agora mesmo.
- **Decisão:** soft delete nos 4 (Empresa/Cliente, Contato, Lead, Oportunidade).
- **Consequências:** cada um ganha `excluidoEm: DateTime?`; leitura passa a filtrar automaticamente via extensão do Prisma client (`lib/prisma.ts`), no mesmo padrão já usado para `Lancamento`. Toda query hoje (`funilCompleto`, `listarOportunidades`, `obterLead`, `resumoComercial`, listagem de clientes) continua funcionando sem alteração de código **desde que** a extensão seja registrada corretamente para os 4 models novos.
- **Alternativas descartadas:** hard delete com confirmação dupla (é o padrão atual de `Oportunidade` — rejeitado justamente por não ter como reverter nem auditar o quê foi perdido).
- **⚠️ Conflito com código atual (o mais direto de todos):** `excluirOportunidade` precisa mudar de `.delete()` para `.update({ data: { excluidoEm: new Date() } })` — é uma mudança de comportamento em produção (hoje quem exclui uma oportunidade perde o registro para sempre; depois de soft delete, o registro fica recuperável). **Comunicar explicitamente antes de mudar** — usuários podem já contar com "excluir = sumir de vez".

## ADR-12 — Probabilidade: default por estágio, override manual

- **Contexto:** nem `Lead.etapa` (via `FunilEtapa`) nem `Oportunidade.etapa` (string livre) têm campo de probabilidade hoje. O P6 já prevê a tabela `StageProbability` com defaults (Escopo 20 / Orçamento 35 / Proposta 55 / Negociação 75 / Contratado 100).
- **Decisão:** probabilidade default vem de `StageProbability` (configurável, nunca hardcoded na UI), com override manual por oportunidade.
- **Consequências:** `StageProbability` referencia os estágios do **funil de Oportunidade** (o novo, com 5 estágios do P9: LEVANTAMENTO→ORCAMENTO→PROPOSTA_ENVIADA→NEGOCIACAO→CONTRATADO) — não o funil de Prospecção. Isso precisa estar explícito no schema (P3) para não ambiguizar qual "etapa" cada probabilidade serve.
- **Alternativas descartadas:** probabilidade só manual, sem default (rejeitado — cai na mesma armadilha do "número mágico no código" que o playbook já reprova, ver P16 item 4).
- **Conflito com código atual:** nenhum estrutural — campo novo, tabela nova.

## ADR-13 — Disciplinas na oportunidade têm valor individual opcional

- **Contexto:** `PropostaItem.valor` **já é** exatamente isso — valor opcional por disciplina, já em Decimal(14,2). O lado `Oportunidade` não tem nada equivalente hoje (nem N disciplinas, nem valor por disciplina).
- **Decisão:** sim, valor opcional por disciplina — habilita a análise por disciplina do P15/P17.
- **Consequências:** `OpportunityDiscipline` (tabela de junção, conforme P3) é greenfield do lado Oportunidade; do lado Proposta é evolução do padrão já existente em `PropostaItem`, só trocando `disciplina: String` por FK ao catálogo `Discipline` novo (ver **Q3**).
- **Alternativas descartadas:** valor só agregado na oportunidade (sem quebra por disciplina) — rejeitado, perde a granularidade que a Proposta já tem hoje.
- **Conflito com código atual:** nenhum no lado Proposta (só troca string→FK); greenfield no lado Oportunidade.

## ADR-14 — Moeda: BRL, `Decimal(14,2)`

- **Contexto:** já é o padrão hoje — `Lead.valorEstimado`, `Oportunidade.valorEstimado`, `PropostaItem.valor`, `PropostaCondicao.valor`, `MetaComercial.valor` são todos `Decimal(14,2)` (só `areaM2`/`ItemTabelaPreco.valorM2` usam `Decimal(12,2)`, mas não são valores monetários de negociação — são medida/preço unitário).
- **Decisão:** manter — BRL apenas, `Decimal(14,2)` em todo campo monetário novo.
- **Consequências:** nenhuma migração de tipo necessária nos campos existentes; só aplicar o mesmo padrão em campos novos (`Opportunity.valorProposto/valorNegociado/desconto`, `ProposalVersion.valor*`, etc.).
- **Alternativas descartadas:** nenhuma — já é a prática vigente e correta (nunca `Float` para dinheiro, confirmado no código atual).
- **Conflito com código atual:** nenhum.

## ADR-15 — Pipeline: mantidas as permissões atuais (REVISADO)

> **Revisão pós-P2:** a decisão abaixo substitui a versão original desta ADR. O usuário pediu para
> ignorar o default sugerido ("edita só responsável + admin") e manter o modelo de permissão vigente.

- **Contexto:** hoje existe **um único** par de permissão (`comercial:ver` / `comercial:gerir`, `src/lib/permissions-catalog.ts:92`) — quem tem `gerir` edita qualquer lead/proposta/oportunidade, sem checagem de dono.
- **Decisão:** **manter como está.** Todos com `comercial:ver` veem o pipeline inteiro; todos com `comercial:gerir` editam qualquer registro — sem gate de responsável. Nenhuma checagem de dono (`ctx.user.id === responsavelId`) entra no `defineAction` do Comercial.
- **Consequências:**
  - Zero mudança nas actions existentes quanto a permissão — `defineAction({ ...base, permissao: "gerir" })` continua exatamente como está.
  - `responsavelId` **ainda pode** ser adicionado a `Lead`/`Opportunity` (já existe em `Oportunidade` hoje) — mas passa a servir só para **atribuição/exibição** (quem é o dono nominal, usado no filtro "Meus x Todos" do P10/P16 e nos cards do Kanban), **não** como controle de acesso.
  - **Q4 muda de escopo:** o backfill de `responsavelId` em registros históricos deixa de ser bloqueio de edição e vira só preenchimento informativo (segue a recomendação de usar `autorId` como default).
- **Alternativas descartadas:** gate de dono na escrita (era o default sugerido — descartado a pedido do usuário).
- **Conflito com código atual:** nenhum — é a opção de menor atrito, mantém o comportamento vigente.

## ADR-16 — Leads existentes: regra determinística + `needsReview`

- **Contexto:** os 5 estágios seedados hoje (`Orçamento/Em negociação/Proposta enviada/Contratado/Perdido`) misturam prospecção e negociação avançada (ver `docs/crm/00-auditoria.md`, seção C).
- **Decisão:** regra determinística de classificação (a ser escrita no P4, com base em etapa atual + existência de proposta enviada/aceita) decide se um `Lead` vira só `Lead`(prospecção), vira `Opportunity`, ou os dois; ambíguos recebem `needsReview: Boolean` (novo campo).
- **Consequências:** a regra em si (quais etapas mapeiam pra quê) é conteúdo do P4, não desta ADR — aqui só fica registrado que a abordagem é "regra + flag", não decisão manual caso a caso.
- **Alternativas descartadas:** reclassificar tudo manualmente (inviável em escala) ou não reclassificar (perde a separação que é o objetivo #1 da reforma).
- **Conflito com código atual:** nenhum aqui — é puramente o plano de migração (P4).

---

## Decisões transversais

### T1 — LGPD
- **Decisão:** base legal registrada = **legítimo interesse** (prospecção B2B fria). Campos `optOut`, `optOutAt`, `dataCollectionSource`, `dataCollectedAt` em `Contact`/`ContatoCliente` desde a Fase 1. Contatos com `optOut = true` nunca entram em lista de abordagem nem exportação (já é requisito explícito do P13 item 6).
- **⚠️ Conflito com código atual:** `ContatoCliente` hoje não tem nenhum desses 4 campos — greenfield, sem dado legado a migrar (todo contato existente nasce com `optOut: false`, `dataCollectedAt` = null/desconhecido — ver **Q5**).

### T2 — Permissões e visibilidade
- Já coberto no ADR-15. Adicionalmente: **desconto acima de um limite exige registro de justificativa** (sugestão do playbook, seção A.2 item 8) — o limite percentual em si é conteúdo pendente (ver **Q6**).

### T3 — Soft delete
- Já coberto no ADR-11. Vale para os 4 models da tabela A.3; **não** se estende a `Proposal`/`ProposalVersion` (que já têm workflow próprio de status — uma proposta rejeitada não é "excluída", vira `RECUSADA`) nem a `Activity`/`AuditLog` (ambos são apend-only por natureza, nunca deletados).

### T4 — Moeda em Decimal
- Já coberto no ADR-14.

### T5 — Timezone
- **Decisão:** toda data com timezone, referência **America/Recife** (guardrail do playbook, `docs/crm/99-playbook.md:11`).
- **Conflito com código atual:** `salvarProposta` grava `validade` como `new Date(i.validade)` sem normalização explícita de timezone (`actions.ts:399`) — hoje depende do timezone do processo Node. Precisa de um helper central (mesmo espírito de `formatarData`/`brl` em `lib/utils.ts`) para todo campo de data novo do CRM, e idealmente também para `validade` existente.

### T6 — Enums em inglês, labels pt-BR centralizados
- **Decisão:** confirmado — todo enum/nome de código novo em inglês (`LEVANTAMENTO` fica em inglês? **não** — os *valores* de negócio ficam como o usuário os conhece; a convenção do projeto é **identificador em inglês, rótulo em pt-BR no arquivo de labels**, não traduzir o enum inteiro). Ver **Q7** para confirmar nomenclatura exata dos enums do funil de Oportunidade (o P9 já escreveu os estágios em português-maiúsculo: `LEVANTAMENTO`, `ORCAMENTO`, etc. — isso contradiz "enums em inglês" se lido literalmente).
- **⚠️ Conflito com código atual:** hoje `Oportunidade.etapa` e `Lead.etapaId→FunilEtapa.nome` já guardam o nome **em português, com acento** (ex.: "Em negociação"), exatamente o que o playbook (seção A.2 item 9) diz para evitar ("senão você fica preso a `NEGOCIACAO` com acento no banco"). A migração troca de nome-livre-em-português para enum-em-inglês-com-tabela-de-labels — é reescrita de dado, não só de schema.

### T7 — Timeline (Activity) vs AuditLog
- **Decisão:** duas tabelas, papéis diferentes — `Activity` (narrativa de negócio, visível ao time, editorial) e `AuditLog` (log técnico imutável, já existe no sistema via `defineAction`, granular por campo alterado).
- **⚠️ Conflito com código atual:** hoje `AtividadeLead`/`AtividadeOportunidade` fazem só o papel de `Activity`; o `AuditLog` do sistema já existe mas está **subutilizado** no Comercial (maioria das actions não passa `entidadeId`, ver `00-auditoria.md` seção E.5) — não é conflito de forma, é dívida de uso a fechar nas fases de implementação (P9 item 7 já prevê "único service que registra Activity e AuditLog").

---

## Perguntas em aberto — RESOLVIDAS (usuário aceitou as recomendações)

**Q1 — Regra de "1 prospecção ativa por empresa+campanha" quando não há campanha.**
✅ Resolvido: `campaignId = null` conta como "campanha implícita" para efeito da constraint — 1 prospecção ativa por empresa quando `campaignId` é null, e 1 por empresa+campanha quando preenchido.

**Q2 — Destino do model `Oportunidade` órfão atual.**
⏳ **AINDA ABERTA.** Abordagem aceita (confirmar uso real com o time; se baixo/zero, não migrar), mas **não fechada por dado**. A auditoria rodada em 2026-08-13 mostrou `oportunidade = 0`, porém **no banco de dev, que só tem `seed:demo`** — isso não prova nada sobre produção. Fecha quando `scripts/auditoria-crm.ts` rodar em produção (bloco 6).

**Q3 — Conteúdo do catálogo `DisciplinaPadrao`.**
⏳ **AINDA ABERTA.** O levantamento foi automatizado (bloco 4b do `scripts/auditoria-crm.ts`), mas a execução em dev devolveu 13 grafias **do seed demo** — strings limpas e artificiais. A variação real que interessa (`Elétrica`/`Elétrico`/`ELETRICA`, abreviações, erros de digitação) é exatamente o que uma base de demo não tem. Fecha com a saída do script em produção.

**Q4 — Quem vira `responsavelId` para registros históricos sem responsável.**
✅ Resolvido (com o escopo revisado pelo ADR-15): `autorId` (quem criou o lead/proposta) vira o `responsavelId` default no backfill — agora só para exibição/atribuição ("Meus x Todos"), não mais para controle de acesso, já que ADR-15 manteve as permissões atuais.

**Q5 — `dataCollectedAt` para contatos já cadastrados.**
✅ Resolvido: usa `ContatoCliente.createdAt` como proxy (campo novo — hoje `ContatoCliente` não tem `createdAt`, será adicionado junto dos campos de LGPD). Contatos existentes recebem `dataCollectedAt = createdAt` no backfill.

**Q6 — Limite de desconto que exige justificativa.**
✅ Resolvido: campo configurável em tabela (não hardcoded), valor inicial **10%**.

**Q7 — Nomenclatura dos enums do funil de Oportunidade.**
✅ Resolvido: identificadores em **português sem acento** (`LEVANTAMENTO`, `ORCAMENTO`, `PROPOSTA_ENVIADA`, `NEGOCIACAO`, `CONTRATADO`, como o P9 já escreve), com rótulo pt-BR no arquivo central de labels — consistente com `StatusDisciplina` e demais enums do schema atual.

---

*Decisões da P2 fechadas, **exceto Q2 e Q3**, que dependem de rodar `scripts/auditoria-crm.ts` contra
o banco de **produção** (o de dev só tem `seed:demo`, cujos números não representam a realidade).
Nenhuma das duas bloqueia o desenho do schema (P3) — bloqueiam o backfill (P4/§1) e o seed do
catálogo de disciplinas (P6).*
