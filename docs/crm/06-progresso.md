# 06 — Log de progresso da reforma do CRM

> **Correção transversal (2026-08-13):** a auditoria (P1) afirmou que não existia catálogo de
> disciplinas. **Existe** — `DisciplinaCatalogo` (`schema.prisma:906`), seedado com 20 entradas, com
> sigla/numeração/categoria, já usado por engenharia, projetos, ferramentas e uploads. O P3 chegou a
> propor criar um `DisciplinaPadrao`; **cancelado** — seriam duas fontes de verdade concorrentes.
> Corrigido em `00-auditoria.md`, `02-schema.md` §8.1, `03-migracao.md` §5 e Q3 de `01-decisoes.md`.

Uma entrada por prompt executado, do mais recente para o mais antigo.

**Formato de cada entrada:**

```
## Pn — <nome> · <data> · <modelo>
**Feito:** o que saiu de fato
**Arquivos:** o que foi tocado
**Pendente:** o que ficou em aberto e depende de quem
**Riscos:** o que pode morder depois
```

---

## Fase 1a — Dívida técnica primeiro · 2026-08-14 · Sonnet (F1.1/F1.2 Opus na decisão de modelo, executadas em Sonnet)

Início da execução do backlog (`04-plano-fases.md`). F1.0 já estava feito (bullet no CLAUDE.md, P5).

**F1.1 — `src/modules/comercial/status.ts` + `.test.ts`** (commit `80ac5d8`)
- `etapaEhPerdido` extraído de arrow function anônima em `actions.ts` para função nomeada,
  documentada e testada. **Mesma regra, mesmo comportamento em produção** — substring
  case-insensitive `"perdid"`, cobre "Perdido"/"Perdida". Teste cobre explicitamente a limitação
  já conhecida (auditoria §E.1): etapa renomeada para fora do padrão deixa de ser reconhecida
  silenciosamente — documentado como comportamento atual, não bug escondido.
- `calcularStatusComercial(temPropostaAceita, override)` — função pura pronta para quando F1.5/F1.9
  trouxerem `Cliente.status` via migration (ADR-08, `02-schema.md` §6).

**F1.2 — `src/modules/comercial/numeracao.ts` + `.test.ts`** (commit `0924430`)
- `formatarNumeroProposta(ano, sequencial)` extraído do template literal inline em
  `proximoNumeroProposta`. O contador (`PropostaSequencia`, upsert transacional) continua em
  `actions.ts` — é estado, não regra. Testa explicitamente `sequencial >= 10000` (cresce, não
  trunca) e virada de ano. Número já emitido a clientes reais **não muda**.

**Verificação:** `npx vitest run` → **189 arquivos, 1938 testes, todos verdes** (14 novos:
`status.test.ts` + `numeracao.test.ts`). `eslint` limpo. `tsc --noEmit` (heap 8GB) → mesmos 2 erros
pré-existentes de `src/lib/backup-storage.test.ts` (commit `d27e270`), nada no código novo. `next
build` não rodado (regra: nunca junto com `next dev` ativo na mesma `.next`; nenhuma mudança de
bundle client aqui).

**Arquivos:** `src/modules/comercial/status.ts` + `.test.ts` (novos), `numeracao.ts` + `.test.ts`
(novos), `actions.ts` (religado nos dois extraídos), `CLAUDE.md` (corrige 99→104 tarefas).

**Nota de modelo:** F1.1/F1.2 estavam marcadas Sonnet no backlog; sessão trocou de Opus→Sonnet
antes de começar (regra do projeto: parar e trocar, não só avisar).

**F1.3 — `service.ts` + caracterização do aceite** (commit `a7498ee`, Opus)
- `criarPropostaDeLead`, `salvarProposta`, `aceitarProposta` + `proximoNumeroProposta` saem de
  `actions.ts` para `service.ts`. `actions.ts` fica com sessão/permissão/Zod/auditoria e
  revalidação de rota. **607 → 445 linhas.**
- `disciplinas.ts` + teste — mapeamento item→disciplina, puro e **genérico no tipo do valor**
  (assim o `Decimal` do Prisma atravessa sem virar `number` e perder precisão).
- `scripts/smoke-crm-fase1.ts` + `npm run smoke:crm-fase1` — **23 checks** contra o banco de dev.

**Preservado de propósito** (é movimentação, não reescrita):
`ActionError` continua sendo lançado do service; `ensureCanaisProjeto`/`notificarNovosMembros`/
`notificarMuitos` continuam **fora** da transação (falha de notificação não desfaz o aceite);
os callbacks `entidadeId` ficam na config do `defineAction`, alimentando a auditoria.

**Como a equivalência foi provada, e o que não deu para provar:**
- `git diff --color-moved=zebra --color-moved-ws=allow-indentation-change` → **317 linhas
  detectadas como movimentação**. As 113 restantes foram auditadas uma a uma: docblock novo,
  import, assinatura exportada e renomeação de parâmetro (`i.leadId`→`input.leadId`,
  `user.id`→`autorId`). Única troca semântica: `p.itens.map(...)` → `disciplinasDeItens(p.itens)`.
- ⚠️ **O smoke não pôde rodar ANTES da extração** — a lógica estava dentro de um `defineAction`,
  que exige sessão (`getSession()`), e não é invocável de um script `tsx`. Montar sessão falsa
  seria mais arriscado que o refactor. A equivalência apoia-se então no diff de movimentação
  literal **mais** os deltas de estado: sequência de proposta +1, de projeto +1, projetos +1,
  disciplinas +3 — todos lidos no início do próprio run, nunca hardcodados (o banco de dev é
  compartilhado com outras frentes).
- Baseline do dev antes de tudo: `propostaSeq=8, projetoSeq=15, proposta=6, projeto=10, disciplina=32`.

**F1.4 — `labels.ts` + teste** (commit `d2b8d64`, Sonnet no lugar do Haiku previsto, a pedido do usuário)
- 10 enums, **55 valores**, cobrindo tudo que `02-schema.md` define. Implementa a decisão
  transversal T6: identificador em código, rótulo pt-BR centralizado num arquivo só.
- Exaustividade por `satisfies Record<Enum, string>` — faltar valor quebra a **compilação**, não o
  teste. **Mecanismo verificado na prática**, não assumido: um mapa incompleto produz `TS1360`.
- O teste cobre o que o compilador não pega: contagem por enum contra o schema alvo, rótulo vazio,
  rótulo idêntico ao identificador (esqueceram de traduzir) e underscore vazando para o usuário.
- Tipos declarados localmente porque os enums só entram no `schema.prisma` na F1.5. Quando a
  migration vier, troca-se `type X` por `import type { X }` e o `satisfies` passa a validar contra
  a fonte real.
- Inclui `opcoesDe()`, que monta `value/label` para `Select` preservando a **ordem do funil**
  (ordem de declaração), não alfabética.

**Fase 1a completa** (F1.0–F1.4). Verificação: **192 arquivos, 1961 testes verdes**, lint limpo.

**F1.5 — catálogos e enums** (commit `97a0ecb`, Sonnet) — **primeira migration do CRM**
- 5 tabelas (`tipo_empreendimento`, `motivo_perda` +`exigeConcorrente`, `canal_aquisicao`,
  `segmento`, `probabilidade_estagio`) + 7 enums. **Puramente aditiva** — nada existente alterado.
- Disciplina **não** entra: `disciplina_catalogo` já é o catálogo do sistema (§8.1). As relações
  inversas (`Negociacao[]`, `Lead[]`, `Campanha[]`, `Cliente[]`) ficam para as tarefas que criam
  esses models — é lá que entram as FKs e seus índices.

**Como o drift foi contornado (sem reset):** `prisma migrate dev` pediu reset por drift acumulado em
`pendencia`/`pendencia_anexo`, **vindo de outra frente**. Reset recusado — apagaria o dataset de dev.
Caminho manual da skill `nova-migracao`:
`migrate diff --from-config-datasource --to-schema` (não precisa de shadow DB, que não está
configurada) gerou o SQL → revisado → `migrate deploy` aplicou. **O diff provou que o delta é só do
CRM**: 7 `CREATE TYPE` + 5 `CREATE TABLE` + 4 índices únicos, zero menção ao drift alheio.
`migrate status` limpo depois (161 migrations).

**`labels.ts` e `status.ts` religados:** os tipos agora vêm de `@/generated/prisma/enums` em vez de
declarados à mão — era a nota deixada na F1.4. **Verificado na prática**, não assumido: adicionei um
valor ao enum no Prisma, regenerei, e o `satisfies` acusou `TS1360`; depois restaurei o schema. O
arquivo de rótulos está genuinamente amarrado à fonte real agora.

Ainda declarados localmente, com o motivo: `StatusPropostaCrm` (`em_negociacao` só entra na Fase 5) e
`TipoProximaAcao`/`TipoAncoraCompromisso` (chegam na F2.1b, `Compromisso` v2).

**Erro meu, pego pelo tsc:** ao religar, deixei declarações locais duplicadas de `BaseLegalLgpd` e
`StatusRelacionamentoContato` conflitando com os imports (`TS2440`/`TS2484`). Corrigido antes do commit.

**Verificação:** `prisma validate` ✅ · `migrate status` limpo ✅ · `grep DisciplinaPadrao prisma/`
vazio ✅ (os 3 critérios de aceite) · 192 arquivos, 1961 testes verdes · lint limpo · tsc só os 2
pré-existentes de `backup-storage.test.ts`.

**Não rodei `db:seed`:** os catálogos nascem vazios e seu seed idempotente é a **F1.6**. Nenhum campo
obrigatório novo nem permissão nova nesta migration, que são os gatilhos que a skill lista.

⚠️ **Erro de tsc alheio detectado em `dev`:** `src/components/certidoes/certidoes-view.tsx:153` —
`return toast.error(...)` dentro de `startTransition`, cuja assinatura exige `void` (TS2345). Vem do
commit `77e5ce6` (frente de certidões), **não** do CRM. Registrado aqui porque quebra `tsc` na branch
compartilhada e alguém precisa corrigir.

---

**Critério de aceite emendado, com o motivo:** o backlog pedia `actions.ts < 250 linhas`. Ficou em
**445**. Para chegar a 250 seria preciso mover também Leads, Etapas do funil e Tabelas de preço —
que F1.3 não nomeia — inflando justamente o diff da tarefa cujo aceite é "só movimentação, nenhuma
regra alterada". A contagem de linhas era proxy; o objetivo real (lógica de negócio alcançável fora
do `defineAction`, com o aceite caracterizado) está cumprido. Critério corrigido no `04-plano-fases.md`.

**Verificação:** `npx vitest run` → **190 arquivos, 1953 testes, verdes**. `eslint` limpo.
`tsc --noEmit` → só os 2 pré-existentes de `backup-storage.test.ts`. `npm run smoke:crm-fase1` → 23/23.
`tsc` pegou um erro real que lint/vitest/smoke deixaram passar (`unknown` não atribuível a `Decimal`) —
corrigido com o genérico antes do commit.

---

## P5 — Plano de fases e backlog · 2026-08-14 · Opus

**Feito:**
- `docs/crm/04-plano-fases.md` — **99 tarefas** de ≤ meio dia em 7 fases, cada uma com ID estável,
  dependências, critério de aceite verificável, ideia de origem, marca de risco alto, modelo de IA
  recomendado e se exige migration / `db:seed` no deploy / teste puro / smoke.
- **Fusão dos dois planos concorrentes** (decisão do usuário): o roadmap de Ondas A–F
  (`docs/superpowers/specs/2026-07-24-crm-comercial-roadmap.md`) foi absorvido e marcado como
  **superseded**. Os vereditos do dono foram todos preservados; só a ordenação por Ondas mudou.
- `CLAUDE.md` — um bullet novo em `## Architecture` apontando para `docs/crm/`, no formato dos
  bullets vizinhos (`legal`, Ajuda/Manual). Nada do que já existia foi reescrito.

**Decisões do usuário nesta sessão:**
- **Fundir** os dois planos num só (em vez de arquivar um ou manter os dois).
- **Sem feature flag** — substituição direta. O projeto não tem mecanismo de flag, e com o módulo
  contornado não há operação ativa a proteger. Nenhuma tarefa desenha convivência antigo/novo.
- **Ordem das 7 fases do playbook** (em vez de "adoção primeiro").

**Arquivos:** `docs/crm/04-plano-fases.md` (novo), `docs/crm/06-progresso.md`, `CLAUDE.md`,
`docs/superpowers/specs/2026-07-24-crm-comercial-roadmap.md` (cabeçalho de superseded).

**Verificação** (P5 é planejamento — nenhum código mudou, lint/test/build não se aplicam):
99 tarefas com ID · **zero** critérios de aceite vagos · as **34 ideias A–F todas endereçadas**
(alocadas, rejeitadas com veredito preservado, ou em "não coube" com o porquê) · as únicas 2
menções a "feature flag"/"convivência" estão na seção que declara o cancelamento.

**Pendências FECHADAS no mesmo dia (2026-08-14), viraram ADR-17/18/19:**
- **F2.1 → ADR-17:** a Próxima Ação **reaproveita `Compromisso`** em vez de tabela nova. O follow-up
  comercial passa a viver na agenda existente (visão mês/semana/dia + export `.ics` de graça).
  ⚠️ Custo aceito e virou tarefa bloqueante **F2.1a**: a agenda precisa de filtro por `tipo` **antes**
  de o volume comercial entrar, senão "Ligar para a Záphis" polui a visão de reuniões.
- **F2.2 → ADR-18:** prospecção qualificada **libera** a empresa. Só `IDENTIFICADO`,
  `CONTATO_INICIADO`, `EM_CONTATO` e `QUALIFICADO` travam. Decidido com dado real: `Záphis` aparece
  3× e `Rbarros` 2× — **múltiplas obras por cliente é o padrão do escritório**, travar brigaria com
  a operação. (Detalhe técnico anotado no schema: `NULL` é distinto em índice único no Postgres, então
  `campaignId` nulo precisa de `COALESCE` ou sentinela para cumprir a Q1.)
- **#13 → ADR-19:** `Parceiro` vira **entidade própria**, escolhida de lista. Saiu de "não coube" e
  virou **F1.23a–F1.23c** (model + CRUD/seleção + relatório de negócios por parceiro).
  ⚠️ A **regra de comissão** (percentual ou fixo? sobre proposto ou contratado? vence no aceite ou no
  recebimento?) **não foi decidida** — o schema nasce sem campo de comissão e nenhum cálculo será
  implementado até a regra existir. Inventá-la seria fabricar política financeira.

Backlog passou de 99 → **104 tarefas** (F2.1a, F2.1b, F1.23a, F1.23b, F1.23c).

**Riscos:** os 8 em `04-plano-fases.md` §7. O maior continua sendo **adoção, não técnica** — nenhum
backlog faz o time parar de contornar o módulo; por isso cada fase declara seu próprio gancho, e o
mais forte (proposta que ganha do Word, F1.22) foi puxado para dentro da Fase 1.

**➡️ PARADA OBRIGATÓRIA do playbook:** revisar `00` a `04` pessoalmente antes de qualquer código.
É o último ponto em que corrigir rumo custa texto, não implementação.

---

## P4 — Plano de migração de dados · 2026-08-13 · Opus

**Feito:**
- `scripts/auditoria-crm.ts` — auditoria pré-migração, **100% somente leitura** (item 1 do P4).
  Rodado em dev (só `seed:demo`, inútil para decidir) e depois **em produção** pelo usuário.
- `docs/crm/03-migracao.md` — escrito como plano de 4 fases e **reescrito por completo** depois dos
  números de produção. O plano EXPAND→BACKFILL→SWITCH→CONTRACT foi **descartado**.
- Q2 e Q3 **fechadas com dado de produção**.

**O achado que decidiu tudo:** o módulo Comercial não é pouco usado — é **contornado**. 8 leads,
1 proposta *sem itens*, 0 atividades, 0 contatos, 0 oportunidades; contra **31 projetos e 46 clientes**.
O trabalho entra direto como `Projeto`; propostas e histórico comercial vivem fora do SenaHub.
Não há migração de dados relevante: o plano virou backup → schema novo → mover 8 leads à mão →
fundir 3 duplicatas de cliente → consolidar 24 grafias de disciplina.

**Outros achados de produção:**
- `Lead.origem` era para ser canal de aquisição, mas foi preenchido com **nome de empreendimento**
  (confirmado pelo usuário). Os 8 valores viram canal "Outro" com o texto preservado; `CanalAquisicao` e
  `Campanha` nascem **vazios** — não há de-para a fazer.
- 3 grupos de `Cliente` duplicado por nome (MADANO ×2, Záphis ×3, Nominal Engenharia ×2). Zero por
  documento — o índice único parcial não está bloqueado. A normalização se validou casando
  `NOMINAL ENGENHARIA` com `Nominal Engenharia LTDA`.
- 100% dos leads caíram em "ambíguo", mas isso é a **regra medindo a coisa errada**: R3/R4 tratam
  "sem proposta" como anomalia, quando aqui é o estado normal (existe 1 proposta em todo o sistema).

**Arquivos:** `docs/crm/03-migracao.md` (novo, reescrito), `scripts/auditoria-crm.ts` (novo),
`docs/crm/01-decisoes.md` (Q2/Q3 fechadas + nota pós-auditoria), `docs/crm/06-progresso.md` (novo).

**Verificação:** `npx eslint scripts/auditoria-crm.ts` → limpo.
`npx tsc --noEmit -p tsconfig.server.json` (com `--max-old-space-size=8192`, senão estoura heap) → 2 erros,
ambos **pré-existentes** em `src/lib/backup-storage.test.ts` (commit `d27e270`), nenhum no código novo.
`next build` não rodado: nada do bundle mudou e o CLAUDE.md alerta contra buildar com `next dev` ativo.

**Pendente:** nada bloqueando o P5.
- ✅ Nomenclatura `Negociacao` aprovada pelo usuário. `DisciplinaPadrao` **cancelado** (ver correção no topo).
- ✅ `Lógica` vs `CFTV`: são disciplinas **diferentes**; as 3 strings compostas viram `Cabeamento` + `CFTV`,
  desmembradas à mão (`Disciplina` carrega valor de pagamento, revisões e arquivos — não é `UPDATE` de texto).
- Decisões §2.1 (ordem R6/R7) e §2.2 (leads arquivados): **não se aplicam** — zero leads em `Perdido`,
  zero arquivados. Ficam documentadas para quando houver dado.

**Riscos:** os 6 em `03-migracao.md` §8. O mais concreto: fundir cliente duplicado pode mover projeto de
obra para a empresa errada (31 projetos em 46 clientes). O mais importante: **o risco real é de adoção,
não técnico** — migrar 8 leads é trivial, fazer o time parar de contornar o módulo é o problema de verdade.

---

## P3 — Schema alvo · 2026-08-13 · Sonnet

**Feito:** `docs/crm/02-schema.md` — diagrama ER em Mermaid, definição Prisma de cada entidade, índices
com a query que cada um serve, unicidade parcial de CNPJ, derivação do status comercial da Empresa.
Schema real **não** foi tocado; nenhuma migration gerada.

**Arquivos:** `docs/crm/02-schema.md` (novo).

**Pendente:** nada. Nomenclatura `Negociacao` aprovada pelo usuário; a proposta `DisciplinaPadrao` foi
**cancelada** — o catálogo `DisciplinaCatalogo` já existia (ver correção no topo deste arquivo).

**Riscos:** documentados em §8. Destaques: o funil de prospecção deixa de ser configurável (`FunilEtapa`)
e vira enum fixo — perda deliberada de flexibilidade em troca de eliminar o `etapaEhPerdido()` por
substring; e `Proposta.projetoId` deixa de ser o único caminho para o `Projeto` (ADR-06), o que cria
dois lugares respondendo "de onde veio esse projeto".

---

## P2 — Decisões de produto (ADR) · 2026-08-13 · Sonnet

**Feito:** `docs/crm/01-decisoes.md` — 16 ADRs (tabela A.3) + 7 decisões transversais (LGPD, permissões,
soft delete, moeda, timezone, enums/labels, Timeline × AuditLog). Defaults do playbook aceitos, com uma
exceção: **ADR-15 revisado** — o usuário optou por manter as permissões atuais (`comercial:ver`/`gerir`,
sem gate de dono), descartando o default "edita só responsável + admin".

**Arquivos:** `docs/crm/01-decisoes.md`.

**Pendente:** Q2 e Q3 (ver P4).

**Riscos:** conflitos com o código atual registrados ADR a ADR. O mais direto: `excluirOportunidade`
faz hard delete hoje e passa a ser soft delete — mudança de comportamento visível para quem usa.

---

## P1 — Auditoria do Comercial · 2026-08-13 · Sonnet

**Feito:** `docs/crm/00-auditoria.md` — modelo de dados, código, comportamento real, classificação
REAPROVEITAR/EVOLUIR/MIGRAR/DEPRECIAR, 11 inconsistências e 9 riscos de migração.

**Arquivos:** `docs/crm/00-auditoria.md`.

**Achado principal:** o model `Oportunidade` tem um comentário no schema dizendo "estágio entre Lead e
Proposta", mas **não tem FK para nenhum dos dois** — é uma feature isolada, com Kanban próprio, que
nunca se conectou ao fluxo real. Zero testes cobrem o módulo Comercial (0 de 186 arquivos de teste).

**Pendente na época:** contagens de volume — o banco de dev estava fora do ar (`ECONNREFUSED`).
Resolvido no P4 com `scripts/auditoria-crm.ts`, mas os números continuam sendo de demo.

---

## P0 — Reconhecimento do repositório · 2026-08-13 · Sonnet

**Feito:** resposta em chat (sem arquivo, conforme o playbook): stack, organização, como são feitas as
mutações, camada de services, comandos, testes, permissões, multi-tenant, timezone/moeda, riscos.

**Achados que valem para todas as fases:** não é multi-tenant (nenhum `tenantId` no schema); toda mutação
passa por `defineAction` com auditoria automática; valores monetários já são `Decimal(14,2)`; o Comercial
não tem nenhum teste.
