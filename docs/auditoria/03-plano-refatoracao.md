# Plano de refatoração — Módulo de Documentos (SENAHub)

Baseado em `docs/auditoria/01-arquitetura-atual.md`, `docs/auditoria/02-matriz-gap.md` e `docs/spec-documentos-senahub.md`. Incorpora as 7 respostas de decisão registradas em `02-matriz-gap.md` (seção "Perguntas para decisão humana"). Restrições de negócio: desktop-first (1920/1600/1440/1366); sem mocks; preservar documentos e funcionalidades existentes; sem sistema paralelo de permissões nem segundo sistema de arquivos; migrations só quando necessárias.

**Desvio da matriz registrado aqui** (exigido pela regra "Fase 1 não pode exigir migration"): a matriz (`02-matriz-gap.md`) classificou os itens 4 (Listas) e 5 (Fases) como Fase 1, mas ambos exigem schema novo para funcionar de verdade — item 4 precisa de tabela N:N nova (`ListaDocumentos`), e item 5 só filtra de verdade depois que `DocumentoDisciplina` ganhar `faseId` (schema novo). Entregar qualquer um dos dois sem a coluna/tabela correspondente seria UI decorativa sem dado real por trás, o que a constraint "nenhuma fase pode depender de mock ou dado fake" proíbe. Os dois foram **movidos para a Fase 2** neste plano. A aba "Listas" do painel esquerdo (item 3) portanto só aparece na Fase 2 também — a Fase 1 entrega só a aba "Disciplinas".

## 1. Decisões de arquitetura

Uma entrada por ponto de decisão da matriz, com a resposta já dada, a alternativa descartada e o motivo (≤5 linhas cada).

**D1 — Chave de agrupamento do Documento lógico.** Recomendação (= resposta R1): reescrever `chaveDocumento()` (`src/modules/uploads/documento.ts:29-32`) para agrupar por nome-base sem extensão, com migração de merge dos `DocumentoDisciplina` existentes. Alternativa descartada: construir um nível novo por cima sem tocar a chave atual (mantinha 2 conceitos de "documento" coexistindo, mais confuso a longo prazo). Motivo: a spec exige PDF+DWG na mesma revisão; um nível extra por cima do problema não resolvido só adiava a dívida.

**D2 — Cor por disciplina na árvore.** Recomendação (= resposta R2): manter a decisão já registrada em `src/lib/disciplinas.ts:5-7` (cor vem só de status, nunca fixa por disciplina). Alternativa descartada: implementar cor por disciplina como a spec pede. Motivo: seria a única fonte de cor fora do token `--color-status-*`, contradizendo uma decisão de design já deliberada e documentada no código.

**D3 — Gate de permissão hard-coded.** Recomendação (= resposta R3): corrigir nesta refatoração — migrar `exigirAdmin()`/checks hard-coded de `src/modules/uploads/actions.ts:538-542,468-470` para o catálogo `Permissao`. Alternativa descartada: manter hard-coded e só adicionar os verbos novos da spec do mesmo jeito. Motivo: perpetuar duas convenções de permissão no mesmo módulo (catálogo fino para ver/baixar/enviar/validar, hard-code para excluir/renomear) aumenta a superfície de erro a cada ação nova.

**D4 — Modelo de trabalho de tarefa a partir de apontamento.** Recomendação (= resposta R4): manter o comportamento em lote (`enviarParaTarefa`, `src/modules/projetos/pendencias/actions.ts:578-611`) — 1 Tarefa por lote de apontamentos abertos, não 1 por apontamento clicado. Alternativa descartada: reescrever para 1 Tarefa por apontamento, como o mockup da spec sugere. Motivo: mudaria notificação e povoamento do Kanban de tarefas em produção; a spec descreve um mockup ilustrativo, não uma exigência de negócio confirmada.

**D5 — Tabela custom vs. `Table` do design system.** Recomendação (= resposta R5 + verificação desta sessão): estender `src/components/ui/table.tsx` na Fase 1 — confirmado sem limitação técnica (usado em 38 outras telas densas, já suporta checkbox de linha). Alternativa descartada: manter markup custom (`<div>`/`<ul>`) por precedente local. Motivo: nenhuma razão técnica encontrada; markup custom só duplicaria o que o design system já resolve.

**D6 — Escopo de `PastaProjeto` (Aprovação/Laudo) no modelo novo.** Recomendação (= resposta R6): o Document→Revision→File novo precisa considerar `PastaProjeto` desde a Fase 2, não adiar para depois — confirmado que há volume real de dados nesse caminho. Alternativa descartada: tratar só o caminho `PacoteUpload` (A/B/OUTROS/RECEBIDOS) primeiro e deixar `PastaProjeto` para uma fase futura não planejada. Motivo: adiar criaria dois caminhos de dado divergentes de novo (o mesmo padrão de duplicação já registrado como dívida em `01-arquitetura-atual.md` §5.6).

**D7 — Pendências órfãs do gap `auto-store.ts`.** Recomendação (= resposta R7): rodar script de reconciliação retroativa antes da migration do item 23 (Fase 4) — na prática, antes da migration de merge de chave (Fase 2, M4), porque é o momento em que `documentoId` de todo `Upload` precisa estar correto. Alternativa descartada: aceitar `revisaoOrigemId` nulo permanentemente para esses casos. Motivo: `Upload`s gerados por ferramentas (`src/modules/ferramentas/auto-store.ts:47-84`) ficariam permanentemente fora do histórico de revisões, um dos objetivos centrais da spec (item 36).

**D8 — Exigência de fase configurável por projeto (requisito novo, adicionado após o plano original).** Recomendação: estender `NomenclaturaConfig` (`prisma/schema.prisma:3840-3850`) com `exigirFase Boolean @default(false)`, em vez de criar tabela nova. Alternativa descartada: coluna direta em `Projeto`, ou tabela própria `FaseProjetoConfig`. Motivo: `NomenclaturaConfig` já é o singleton 1:1 por projeto certo para esse tipo de config (mesmo padrão do `exigir` de nomenclatura), e o parser (`src/modules/projetos/pranchas/codigo.ts:54-72`) já extrai fase do nome do arquivo hoje — só falta persistir e tornar obrigatório quando o projeto exigir.

## 2. Modelo de dados final

### Entidades

| Entidade | Origem | O que muda |
|---|---|---|
| `Documento` (renomeação conceitual de `DocumentoDisciplina`) | `prisma/schema.prisma:4228-4250` (reaproveitada) | Chave de agrupamento trocada (D1); ganha `titulo`, `descricao`, `faseId` (FK `PranchaCatalogo`), `statusId` (FK `DocumentoStatus` novo), `substituidoPorId` (self-FK, nullable — ver M4) |
| `DocumentoRevisao` (nova) | — | `id`, `documentoId` (FK), `numero Int`, `createdAt`, `createdById` — nível que faltava entre Documento e arquivo físico |
| `Upload` (arquivo físico) | `prisma/schema.prisma:4118-4179` (reaproveitada integralmente) | Ganha `revisaoId` (FK `DocumentoRevisao`, nullable). `documentoId`/`caminho`/`nomeArquivo`/`versao` continuam existindo sem alteração de significado — nenhum consumidor existente quebra |
| `DocumentoStatus` (nova, catálogo) | Espelha `TarefaStatus` (`schema.prisma:2402-2414`) | `id`, `nome`, `ordem`, `cor`, `ativo` |
| `ListaDocumentos` / `ListaDocumentoItem` (novas, N:N) | — | `ListaDocumentos { id, nome, projetoId, criadoPorId, createdAt }`; `ListaDocumentoItem { id, listaId, documentoId, adicionadoEm }` |
| `Pendencia` | `prisma/schema.prisma:4282-4407` (reaproveitada) | Ganha `revisaoOrigemId`/`revisaoResolucaoId` (FK `DocumentoRevisao`, nullable) — só na Fase 4 |
| `PastaProjeto` | `prisma/schema.prisma:4256-4275` (reaproveitada, sem alteração de schema) | Passa a alimentar `Documento`/`DocumentoRevisao` pelo mesmo caminho de `PacoteUpload` (unificação de código, não de tabela — ver D6) |
| `NomenclaturaConfig` | `prisma/schema.prisma:3840-3850` (reaproveitada) | Ganha `exigirFase Boolean @default(false)` (D8, requisito novo) — projeto define se documentos exigem fase (Anteprojeto/Projeto Básico/Projeto Executivo etc.) atribuída |

**Nada é recriado do zero**: `Upload` já é o `DocumentFile` da spec (`caminho`, `nomeArquivo`, `mimeType`, `tamanho` já existem); `DocumentoDisciplina` já é 90% do `Document` da spec. Só falta o nível `Revision` e os metadados (`titulo`/`descricao`/`fase`/`status`).

### Mapeamento de dados legados (arquivo antigo sem revisão → Documento + Revisão)

Todo `Upload` hoje já pertence a um `DocumentoDisciplina` (desde a migration `20260806120000_documento_disciplina`) **exceto** os criados por `auto-store.ts` (gap conhecido, D7). O caminho de backfill, em ordem:

1. **Reconciliar órfãos** (D7): para todo `Upload` com `documentoId` nulo, calcular a chave lógica com a MESMA função (`chaveDocumento`) usada no fluxo principal e fazer `upsert` em `DocumentoDisciplina` — igual ao backfill original de `20260806120000`, mas rodando agora sobre os registros que escaparam dele.
2. **Criar uma `DocumentoRevisao` por versão existente**: para cada `DocumentoDisciplina`, agrupar seus `Upload[]` por `versao` e criar uma `DocumentoRevisao` (`numero = versao`) por grupo; setar `Upload.revisaoId` de volta. Nenhum `Upload` é modificado além de ganhar essa FK — `caminho`/`nomeArquivo`/tudo mais continua igual, então nenhum link de download existente quebra.
3. **Merge por chave sem extensão** (D1): agrupar os `DocumentoDisciplina` de uma mesma disciplina pelo nome-base sem extensão (ex. `EST-FOR-001-R03.pdf` e `EST-FOR-001-R03.dwg` → mesma base `EST-FOR-001-R03`). Escolher o `DocumentoDisciplina` mais antigo (`createdAt` menor) do grupo como canônico. Nos demais do grupo: repontar `Upload.documentoId`, `Pendencia.documentoId`, `CalibracaoPrancha.documentoId`, `LeituraDocumento.documentoId` para o canônico; **não apagar a linha** — setar `substituidoPorId` apontando para o canônico (soft-retire, não delete). Isso preserva: (a) qualquer `AuditLog.entidadeId` histórico que referencie o id antigo (sem FK, mas continua resolvível via `substituidoPorId`); (b) qualquer link/bookmark que por acaso referencie o id antigo, através de uma função `resolverDocumentoCanonico(id)` que segue a cadeia `substituidoPorId` até o fim.
4. **`DocumentoRevisao` do grupo merged**: depois do merge, as revisões dos `DocumentoDisciplina` soft-retirados passam a apontar `documentoId` para o canônico — o número da revisão (`numero`) é preservado por arquivo; se PDF e DWG da "R03" foram enviados em momentos diferentes e hoje têm `versao` diferentes em cada `DocumentoDisciplina` de origem (ex. PDF em versão 3, DWG em versão 2 por ter sido reenviado menos vezes), o merge NÃO tenta forçar um número comum — cada `Upload` mantém sua própria linhagem de `DocumentoRevisao` sob o mesmo `documentoId` canônico. Alinhamento de numeração de revisão entre extensões de um mesmo documento é um problema de **fluxo de upload daqui pra frente** (Fase 2, upload de nova revisão pede as duas extensões juntas quando possível), não de backfill retroativo — forçar isso no histórico inventaria dados que não existem.
5. **Nenhum registro é descartado** em nenhum passo — confirmação explícita pedida pelo prompt desta sessão.

## 3. Plano de migrations

Uma por vez, ordem de execução. Todas usam o padrão expand/contract: coluna/tabela nova sempre nullable/opcional na migration, código que passa a exigi-la vem no PR seguinte (nunca no mesmo PR da migration) — se a migration rodar em produção sem o código novo (deploy parcial, rollback de código só), o sistema continua funcionando exatamente como hoje, porque nenhum campo novo é lido nem escrito pelo código antigo.

| # | Migration | O que altera | Reversível? | Backfill | Comportamento sem o código novo |
|---|---|---|---|---|---|
| M1 | `documento_revisao` (tabela nova) | Cria `DocumentoRevisao` vazia | Sim — `DROP TABLE`, nada referencia ainda | Nenhum (tabela nasce vazia) | Sistema ignora a tabela inteiramente; zero impacto |
| M2 | `Upload.revisaoId` (coluna nova, FK nullable) | Adiciona FK opcional em `Upload` | Sim — `DROP COLUMN`, `Upload` não perde nenhum dado próprio | Script (não-SQL puro, TS como `scripts/auditoria-crm.ts`): 1 `DocumentoRevisao` por `(documentoId, versao)` existente, depois `UPDATE upload SET revisaoId=...` | Código antigo nunca lê `revisaoId` — segue funcionando 100% igual |
| M3 | Reconciliação de órfãos (script de dados, não migration de schema) | Preenche `Upload.documentoId` nulo (gap `auto-store.ts`, D7) | Parcial — reversível restaurando `documentoId=null` a partir da lista de ids tocados (o script deve gravar um log dos ids alterados) | É o próprio backfill (passo 1 da seção 2) | Sem efeito em código — só preenche dado que faltava; nenhuma leitura existente dependia desse campo estar nulo |
| M4 | Merge de `DocumentoDisciplina` por chave sem extensão (D1) — inclui `substituidoPorId` (coluna nova, self-FK nullable) | Reagrupa `DocumentoDisciplina`, repontas de FK, soft-retire (sem DELETE) | **Não trivialmente reversível** — é a migration de maior risco do plano. Mitigação: `pg_dump -Fc` imediatamente antes (`docs/DEPLOY.md §8`), dry-run completo contra cópia do banco de produção antes de rodar em produção, script idempotente (pode rodar 2x sem duplicar merges) | É o passo 3-4 da seção 2 | Código antigo (que lê `chaveDocumento()` com extensão) continua funcionando sobre os `DocumentoDisciplina` que não foram merged; os que foram merged ficam com `Upload`/`Pendencia` repontados para o canônico, que o código antigo também sabe ler (é só um `DocumentoDisciplina` válido) — não quebra, só passa a agrupar diferente a partir do próximo upload feito com o código NOVO |
| M5 | `DocumentoDisciplina.titulo/descricao/faseId/statusId` (colunas novas, todas nullable) | Metadados do Documento (itens 1, 13, 26) | Sim — `DROP COLUMN` | Nenhum (todas nascem nulas; preencher é ação manual futura do usuário, não backfill automático) | Código antigo ignora colunas novas |
| M6 | `documento_status` (tabela nova, catálogo) + seed | Cria `DocumentoStatus`, insere os 8 valores sugeridos pela spec (item 26) como ponto de partida editável | Sim — `DROP TABLE` | Seed fixo (não é backfill de dado existente) | Sem efeito até o código novo referenciar `statusId` |
| M7 | `lista_documentos` + `lista_documento_item` (tabelas novas, N:N) | Suporta item 4 | Sim — `DROP TABLE` | Nenhum (conceito não existe hoje) | Sem efeito |
| M8 | `NomenclaturaConfig.exigirFase` (coluna nova, `Boolean @default(false)`) | Suporta exigência de fase configurável por projeto (item 5, D8, requisito novo) | Sim — `DROP COLUMN` | Nenhum (todo projeto nasce com `false` = fase opcional, igual ao comportamento atual) | Código antigo ignora a coluna nova |
| M9 | `Pendencia.revisaoOrigemId`/`revisaoResolucaoId` (colunas novas, FK nullable) — **só na Fase 4** | Suporta item 23 | Sim — `DROP COLUMN` | `revisaoOrigemId` = a `DocumentoRevisao` do `uploadId` atual de cada `Pendencia` (via `Upload.revisaoId`, já preenchido desde M2); `revisaoResolucaoId` fica nulo (nenhuma pendência é "resolvida entre revisões" retroativamente — isso só passa a existir daqui pra frente) | Código antigo ignora as colunas novas; nenhuma pendência existente muda de comportamento |

M1–M8 entram na Fase 2. M9 entra na Fase 4, isolada das demais (nenhum PR toca mais de uma fase).

## 4. Fases 1 a 4

### Fase 1 — Tela principal (sem migration)

**Objetivo**: substituir a experiência de navegação/listagem/ações da aba Arquivos por um painel de disciplinas + tabela densa + busca/filtros/ações em lote, usando só os dados que já existem hoje.

| PR | Título | Escopo de arquivos |
|---|---|---|
| F1-PR1 | Shell de 2 painéis + breadcrumb | `src/app/(dashboard)/projetos/[id]/arquivos/page.tsx`, novo `src/components/projetos/arquivos/` (diretório), reusa `src/components/shell/breadcrumb.tsx` |
| F1-PR2 | Painel esquerdo — árvore de disciplinas (só aba Disciplinas, sem Listas) | `src/components/projetos/arquivos/painel-disciplinas.tsx` (novo), extrai lógica de árvore de `arquivos-explorer.tsx` |
| F1-PR3 | Tabela densa de documentos, estendendo `Table` (D5) | `src/components/ui/table.tsx` (extensão, se necessário), novo `src/components/projetos/arquivos/tabela-documentos.tsx` |
| F1-PR4 | Badges de extensão por linha (compõe visores já existentes) | novo `src/components/projetos/arquivos/badge-extensao.tsx`, reusa `IconeArquivo`, `VisualizarDwgButton`, rota `/visualizar` |
| F1-PR5 | Menu de contexto por linha (ações já existentes, sem "alterar status"/"adicionar a lista") | novo `src/components/projetos/arquivos/menu-documento.tsx`, `src/components/ui/dropdown-menu.tsx` |
| F1-PR6 | Seleção múltipla + toolbar de lote (validar/excluir, únicas ações em lote já existentes) | `tabela-documentos.tsx`, reusa `validarArquivosLote`/`excluirUploadsLote` (`src/modules/uploads/actions.ts`) |
| F1-PR7 | Busca com debounce + drawer de filtros (disciplina, extensão, autor, período, validado, "com tarefas") — sem fase/status/lista | novo `src/components/projetos/arquivos/filtros-documentos.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/badge.tsx` (chips) |
| F1-PR8 | Upload unificado: dropzone em todas as sub-pastas + toast de nova revisão | `src/components/projetos/arquivos-explorer.tsx` (unificar `RecebidosPasta`/`PastaBaseArquitetonica`/`PastaGeral` no mesmo `Uploader`) |
| F1-PR9 | Correção do gate de permissão hard-coded (D3) | `src/lib/permissions-catalog.ts`, `src/modules/uploads/actions.ts:538-542,468-470`, seed de `Permissao` replicando o comportamento atual |
| F1-PR10 | Performance: paginação server-side + skeleton | `src/modules/uploads/queries.ts` (nova função paginada), `src/lib/list-params.ts`/`use-set-param.ts` (reaproveitados), novo `loading.tsx` na rota |
| F1-PR11 | Toolbar do visualizador: rotação + fullscreen | `src/components/projetos/pdf-viewer.tsx` |

**O que NÃO entra nesta fase**: aba "Listas" (item 4), seletor de fases funcional e exigência de fase configurável por projeto (item 5, D8), status documental (item 26), Documento multi-extensão (itens 1/13), workspace de 3 painéis do visualizador (item 16), tarefa entre revisões (item 23) — todos dependem de migration.

**Critérios de aceite binários**:
- [ ] Aba Arquivos renderiza painel de disciplinas + tabela sem erro, para um projeto com uploads existentes.
- [ ] Buscar por nome de arquivo com 1 tecla não dispara request antes de 500ms de pausa (debounce verificável no Network tab).
- [ ] Aplicar 2 filtros simultâneos reduz a lista e mostra 2 chips removíveis.
- [ ] Selecionar 3 documentos e clicar "Validar em lote" chama `validarArquivosLote` e atualiza a lista sem reload de página.
- [ ] Menu de contexto de uma linha PDF mostra "Visualizar"/"Download"/"Excluir" e oculta "Excluir" para um usuário sem a permissão (depois de F1-PR9).
- [ ] Upload de um arquivo dentro de "Recebidos" mostra a mesma dropzone/barra de progresso que hoje só existe no uploader principal.
- [ ] `npm test` passa sem nenhum teste novo quebrado.
- [ ] Nenhuma rota/API antiga (`/api/uploads/**`) muda de contrato — testável rodando os smokes existentes (`npm run smoke:onda3efg` ou equivalente que cubra arquivos, a confirmar qual smoke cobre o módulo).

**Paralelo vs. sequencial**: F1-PR1→PR2→PR3 são sequenciais (cada um depende do shell anterior). PR4, PR5, PR6, PR7 podem ser paralelos entre si depois de PR3 (todos consomem a mesma tabela, mas são adições independentes de coluna/ação). PR8 é independente, pode rodar em paralelo com qualquer um dos acima. PR9 (permissão) é independente, mas deve ir para produção ANTES de PR5/PR6 aparecerem para usuários finais (o menu de contexto/toolbar de lote expõem ações que hoje dependem do gate antigo). PR10 e PR11 são independentes, podem ser os últimos.

**Ponto de rollback**: cada PR é revertível individualmente via `git revert` — nenhum PR desta fase altera schema, então reverter não deixa dado inconsistente. Se um PR já em produção causar regressão, reverter o PR específico não afeta os demais (componentes novos vivem em arquivos próprios, não substituem `arquivos-explorer.tsx` até estarem prontos — ver seção 6, feature flag).

### Fase 2 — Documento, Revisão, Extensões, Histórico (com migrations M1–M7)

**Objetivo**: introduzir o nível de Revisão, unificar PDF+DWG de uma revisão sob um Documento, adicionar status documental e Listas.

| PR | Título | Escopo de arquivos |
|---|---|---|
| F2-PR1 | Migration M1+M2 + script de backfill de `DocumentoRevisao`/`Upload.revisaoId` | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, novo `scripts/backfill-documento-revisao.ts` |
| F2-PR2 | Script de reconciliação de órfãos (M3, D7) | novo `scripts/reconciliar-uploads-orfaos.ts` (mesma família de `scripts/auditoria-crm.ts`, 100% leitura+escrita controlada, log de ids tocados) |
| F2-PR3 | Migration M4 — reescrita de `chaveDocumento()` + merge/soft-retire | `src/modules/uploads/documento.ts`, `prisma/schema.prisma` (`substituidoPorId`), `prisma/migrations/<novo>/`, novo `scripts/merge-documentos-por-base.ts`, atualização de `src/modules/uploads/documento.test.ts` |
| F2-PR4 | `resolverDocumentoCanonico()` — todo consumidor de `documentoId` passa a resolver a cadeia de merge | `src/modules/uploads/queries.ts`, `src/app/api/uploads/route.ts` (persistência de novo upload), `src/components/projetos/comparador-revisoes.tsx` |
| F2-PR5 | Migration M5+M6 — metadados de Documento + catálogo `DocumentoStatus` | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, `src/lib/permissions-catalog.ts` (se status ganhar verbo próprio) |
| F2-PR6 | UI de metadados do Documento (título/descrição/fase/status) + seletor de fases funcional (item 5, agora com `faseId` real) | `src/components/projetos/arquivos/painel-documento-detalhe.tsx` (novo), `tabela-documentos.tsx` |
| F2-PR6b | Migration M8 + toggle "Exigir fases" na configuração do projeto (D8); upload pré-preenche fase a partir do parser de nomenclatura (`src/modules/projetos/pranchas/codigo.ts:54-72`) quando `exigirFase=true` | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, tela de config do projeto (config de `NomenclaturaConfig` já existente — localizar via `01-arquitetura-atual.md`), `src/app/api/uploads/route.ts` (pré-preenchimento) |
| F2-PR7 | Migration M7 — `ListaDocumentos`/`ListaDocumentoItem` + Server Actions + aba "Listas" no painel esquerdo | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, novo `src/modules/uploads/listas.ts` (actions), `src/components/projetos/arquivos/painel-listas.tsx` (novo) |
| F2-PR8 | Modal/drawer de histórico de revisões dedicado (item 14) | novo `src/components/projetos/arquivos/historico-revisoes-dialog.tsx`, reusa `revisoesDoDocumento()` |
| F2-PR9 | Upload de nova revisão — fluxo que aceita múltiplas extensões sob a mesma revisão de uma vez, com toast de confirmação | `src/app/api/uploads/route.ts`, `src/components/projetos/arquivos-explorer.tsx` (`Uploader`) |
| F2-PR10 | Colunas configuráveis + prioridade de coluna em tela menor (item 8 da spec) — em 1366px as colunas finais (Atualizado, Tamanho, menu) ficam atrás do scroll interno do `Table`; definir quais colunas cedem primeiro e deixar a escolha persistir por usuário | `src/components/projetos/arquivos/tabela-documentos.tsx`, novo seletor de colunas, `modules/usuarios/preferencias/` (persistência) |

**O que NÃO entra nesta fase**: workspace de 3 painéis do visualizador (Fase 3), tarefa rastreável entre revisões (Fase 4), comparação avançada com opacidade/zoom sincronizado (Fase 4).

**Critérios de aceite binários**:
- [ ] Depois de F2-PR1+PR2 rodarem em uma cópia de produção, `SELECT count(*) FROM upload WHERE "documentoId" IS NULL` retorna 0.
- [ ] Depois de F2-PR3, para um par PDF+DWG de teste com o mesmo nome-base, os dois aparecem sob o mesmo `documentoId` — verificável por query direta.
- [ ] Um link de download antigo (`GET /api/uploads/[id]/download` com um `id` de `Upload` que existia antes da migration) continua respondendo 200 com o mesmo arquivo.
- [ ] Um `documentoId` antigo que foi soft-retirado (`substituidoPorId` setado) resolve para o canônico via `resolverDocumentoCanonico()` — testável com teste automatizado.
- [ ] Criar uma Lista, adicionar 2 documentos, remover 1 — reflete corretamente na aba Listas sem reload.
- [ ] Alterar o status de um Documento persiste e aparece na tabela sem reload.
- [ ] Ligar "Exigir fases" na configuração de um projeto torna o campo fase obrigatório ao criar/editar Documento nesse projeto; em projeto com o toggle desligado, o campo continua opcional (comportamento atual preservado).
- [ ] Em 1366px, as colunas que a pessoa marcou como visíveis aparecem sem scroll interno; a escolha sobrevive a recarregar a página.
- [ ] Fazer upload de um arquivo com nome no padrão `{projeto}-{sigla}-{fase}-{numeracao4}-{tipo}[-Rnn]` em projeto com "Exigir fases" ligado pré-preenche a fase detectada pelo parser (`codigo.ts:54-72`), editável antes de confirmar.
- [ ] `npm run db:migrate` roda sem erro em ambiente limpo (seed incluso) e `npm run db:seed` continua idempotente.

**Paralelo vs. sequencial**: F2-PR1→PR2→PR3→PR4 são estritamente sequenciais (cada um depende do estado de dados do anterior). F2-PR5 pode começar em paralelo com PR3/PR4 (não depende do merge de chave). F2-PR6, PR6b, PR7, PR8 podem ser paralelos entre si depois de PR5/PR4 estarem em produção (F2-PR6b não depende de PR6 — é `NomenclaturaConfig`, tabela separada de `DocumentoDisciplina`). F2-PR9 depende de PR4 (precisa de `documentoId` canônico estável antes de mudar o fluxo de upload) e se beneficia de PR6b já estar em produção (pré-preenchimento de fase no upload), mas não é bloqueado por ele. F2-PR10 é independente de todos: só mexe na tabela e na preferência do usuário, sem tocar schema de documento — pode ir a qualquer momento da fase, inclusive primeiro.

**Ponto de rollback**: até F2-PR2 (inclusive), reversível via restore de backup pré-migration sem perda (nada foi merged ainda). A partir de F2-PR3 (merge), o ponto de rollback seguro é o `pg_dump` tirado imediatamente antes de M4 rodar em produção — reversão pós-merge por `DROP COLUMN`/migration reversa não desfaz o merge lógico (dados já reagrupados), só restore completo desfaz.

### Fase 3 — Visualizador, tarefas, pins (sem migration nova)

**Objetivo**: reestruturar `PdfViewer` num workspace de 3 painéis recolhíveis (tarefas / documento+pins / detalhes), sem alterar o modelo de dados de `Pendencia` (já cobre tudo que a spec pede nesta fase).

| PR | Título | Escopo de arquivos |
|---|---|---|
| F3-PR1 | Header do visualizador (breadcrumb, nome/código, revisão, status, alternância de extensão) | `src/components/projetos/pdf-viewer.tsx`, reusa `src/components/shell/breadcrumb.tsx` |
| F3-PR2 | Painel esquerdo de tarefas (lista de `Pendencia` do documento, busca/filtro/+Tarefa) | novo `src/components/projetos/arquivos/painel-tarefas-documento.tsx`, reusa queries de `src/modules/projetos/pendencias/queries.ts` |
| F3-PR3 | Reestruturação do layout em 3 colunas recolhíveis | `pdf-viewer.tsx` — extrai canvas central, painel esquerdo (PR2) e painel direito (detalhe de pendência já existente) |
| F3-PR4 | Sincronização tarefa↔pin dentro do próprio painel (sem depender de deep-link externo) | `pdf-viewer.tsx`, `painel-tarefas-documento.tsx` |
| F3-PR5 | Painel de detalhes da tarefa contextualizado (ligado a `Tarefa`/`TarefaItem` de origem) | `pdf-viewer.tsx`, reusa `src/modules/tarefas/actions.ts` |

**O que NÃO entra nesta fase**: tarefa rastreável entre revisões (item 23, precisa de M8, Fase 4); comparação avançada com opacidade ajustável (item 15, Fase 4).

**Critérios de aceite binários**:
- [ ] Abrir `/visualizar` de um documento mostra breadcrumb com nome do projeto/disciplina/documento.
- [ ] Painel esquerdo recolhe/expande sem perder o pin selecionado.
- [ ] Clicar num item da lista de tarefas centraliza e faz zoom no pin correspondente, sem precisar de deep-link `?pin=`.
- [ ] Clicar num pin no canvas abre o painel de detalhes da tarefa correspondente à direita.
- [ ] Em viewport de 1366px de largura, nenhum elemento do workspace gera scroll horizontal.

**Paralelo vs. sequencial**: F3-PR1 e F3-PR2 são paralelos (não dependem um do outro). F3-PR3 depende de ambos. F3-PR4 e F3-PR5 são sequenciais depois de PR3.

**Ponto de rollback**: reversão de PR individual via `git revert` — nenhuma migration nesta fase, nenhum risco de dado.

### Fase 4 — Comparação avançada e resolução entre revisões (com migration M8)

**Objetivo**: rastrear pendência entre revisões (`revisaoOrigem`/`revisaoResolucao`) e completar a comparação de revisões com opacidade ajustável e zoom/pan sincronizado.

| PR | Título | Escopo de arquivos |
|---|---|---|
| F4-PR1 | Migration M9 — `Pendencia.revisaoOrigemId`/`revisaoResolucaoId` + backfill de origem | `prisma/schema.prisma`, `prisma/migrations/<novo>/`, novo `scripts/backfill-pendencia-revisao-origem.ts` |
| F4-PR2 | UI "Comparar com nova revisão" / "Marcar como resolvida na R03" | `src/modules/projetos/pendencias/actions.ts` (nova action `marcarPendenciaResolvidaEmRevisao`), `pdf-viewer.tsx` |
| F4-PR3 | Rótulo "Criada na R02 / Resolvida na R03" no card de tarefa e no histórico | `painel-tarefas-documento.tsx` (Fase 3), `historico-revisoes-dialog.tsx` (Fase 2) |
| F4-PR4 | Comparação avançada: opacidade ajustável + zoom/pan sincronizado entre painéis | `src/components/projetos/comparador-revisoes.tsx` |

**O que NÃO entra nesta fase**: qualquer processamento CAD comparativo do zero (a spec explicitamente proíbe isso no item 15 — "não implementar processamento complexo de CAD do zero se não houver infraestrutura").

**Critérios de aceite binários**:
- [ ] Uma pendência criada sobre a R02 de um documento, depois de uma R03 ser enviada, mostra "Criada na R02" no card.
- [ ] Marcar como resolvida na R03 grava `revisaoResolucaoId` e o card passa a mostrar "Resolvida na R03".
- [ ] No comparador, arrastar o slider de opacidade altera visualmente a sobreposição em tempo real.
- [ ] Dar zoom no painel esquerdo do comparador aplica o mesmo zoom no painel direito.

**Paralelo vs. sequencial**: F4-PR1 é pré-requisito de F4-PR2/PR3 (sequencial). F4-PR4 é independente, pode rodar em paralelo com qualquer um dos três.

**Ponto de rollback**: M9 é aditiva e de baixo risco (só `Pendencia`, sem merge/reagrupamento) — reversível via `DROP COLUMN` sem perda de dado de `Pendencia` original.

## 5. Contratos de API

| Endpoint/Action | Tipo | Aditivo ou breaking | Estratégia |
|---|---|---|---|
| `GET /api/uploads/[id]/download`, `/zip`, `/disciplina/[id]/zip`, `/api/p/arquivos/**` | REST existente | **Aditivo** — nenhum payload/retorno muda | Nenhuma ação necessária; `Upload.id`/`caminho` não são tocados por nenhuma migration |
| `POST /api/uploads` | REST existente | **Aditivo** — ganha capacidade de aceitar múltiplas extensões da mesma revisão numa só chamada (F2-PR9), mas o formato atual (1 arquivo por vez) continua funcionando | Campo novo opcional no payload (ex. `revisaoDeId`); ausência dele mantém o comportamento atual (cria revisão nova a cada upload, como hoje) |
| `revisoesDoDocumento()` (`src/modules/uploads/queries.ts:186-193`) | função interna | **Aditivo** no contrato externo | Mesmo formato de retorno (lista de `Upload` por `documentoId`), reagrupando por `revisaoId` internamente — `ComparadorRevisoes` não muda |
| `resolverDocumentoCanonico(id)` | função nova | Aditiva | Nova função; todo ponto que hoje lê `documentoId` cru (F2-PR4) passa a passar por ela antes de assumir breaking em ids antigos |
| `criarLista`/`adicionarDocumentoALista`/`removerDocumentoDaLista`/`listarListas` | Server Actions novas | Aditivas | Módulo novo (`src/modules/uploads/listas.ts`), sem tocar actions existentes |
| `atualizarStatusDocumento` | Server Action nova | Aditiva | Módulo `src/modules/uploads/actions.ts`, novo verbo no catálogo `documentos:alterar_status` |
| `marcarPendenciaResolvidaEmRevisao` | Server Action nova | Aditiva | `src/modules/projetos/pendencias/actions.ts` |
| Permissões: `role==="admin"` hard-coded → catálogo `Permissao` (D3) | mudança de comportamento interna | **Potencialmente breaking em runtime** (não de API, mas de autorização) se o seed não replicar o estado atual exatamente | Seed de `Permissao` que reproduz "só admin" antes do PR de código trocar o `if` — nenhum usuário ganha/perde acesso no mesmo deploy que muda o mecanismo |

Nenhum endpoint é removido nesta refatoração inteira (Fases 1–4).

## 6. Feature flag / convivência

- Toda a Fase 1 é construída como componentes **novos** (`src/components/projetos/arquivos/*`), sem substituir `arquivos-explorer.tsx` até o conjunto estar completo — os dois convivem porque literalmente não competem: enquanto os PRs da Fase 1 sobem, a tela em produção continua sendo a atual.
- Corte para a tela nova acontece num único PR de "troca de rota" ao final da Fase 1 (depois de F1-PR1 a F1-PR11 mergeados), atrás de uma env var (`NEXT_PUBLIC_DOCUMENTOS_V2=1`) testável por projeto/usuário via query string de override em dev (`?docsv2=1`) — sem tabela nova, sem tocar `NomenclaturaConfig` nem nenhum model.
- Critério para desligar a tela antiga (deletar `arquivos-explorer.tsx` antigo): 2 semanas em produção com a tela nova como padrão para todos os projetos, zero regressão reportada, e todos os critérios de aceite da Fase 1 confirmados manualmente em pelo menos 1 projeto de cada `TipoProjeto` (`particular`, `licitacao`, `aprovacao`, `laudo`) — os dois últimos usam `PastaProjeto`, caminho que precisa de verificação própria (D6).
- Fase 2 em diante não precisa de flag adicional — são extensões da MESMA tela nova já em produção (metadados, listas, status), aditivas por natureza.
- O comparador de revisões (Fase 4) recebe os controles novos (opacidade/zoom sincronizado) direto no componente existente, sem flag — é aditivo visualmente (controles novos, comportamento atual preservado se o usuário não tocar neles).

## 7. Estratégia de testes

| Fase | Automatizado | Manual |
|---|---|---|
| 1 | Funções puras extraídas (ex. combinação de filtros, se implementada como função separada) ganham `*.test.ts` seguindo o padrão de `src/modules/uploads/*.test.ts`. Nenhum componente visual é testado automaticamente — o repositório não tem jsdom/testing-library configurado (`vitest.config.ts` roda só em ambiente `node`) | Checklist manual por PR contra os critérios de aceite binários listados na seção 4; verificação de responsividade nas 4 larguras-alvo (1920/1600/1440/1366); 1 rodada com `a11y-auditor`/`design-system-guardian` (agentes já disponíveis neste repo) antes do PR de corte de flag |
| 2 | `src/modules/uploads/documento.test.ts` estendido para a nova `chaveDocumento()`; script de backfill/merge testado em dry-run contra uma cópia local do banco antes de rodar em produção (não é teste Vitest, é execução supervisionada); `resolverDocumentoCanonico()` ganha teste unitário dedicado | Verificação manual pós-migration em produção: contagem de `Upload` órfãos = 0, contagem de `DocumentoDisciplina` com `substituidoPorId` não-nulo confere com o relatório do script de merge; 1 documento de cada `TipoProjeto` verificado manualmente |
| 3 | Se a lógica de sincronização pin↔tarefa for extraída como função pura (ex. "qual página/zoom dado um pin"), ganha teste — mesmo padrão de `src/modules/coordenacao/viewer/coords.test.ts` (conversão pura testada, render não) | Verificação manual do workspace 3 painéis em cada largura-alvo; verificação de que recolher/expandir painéis não perde estado de seleção |
| 4 | Transição de estado `revisaoOrigem`→`revisaoResolucao` como função pura testável, no espírito de `src/modules/coordenacao/conversao-estado.ts` (máquina de estado pura e testada já usada no repo) | Verificação manual do slider de opacidade e zoom sincronizado (não há infraestrutura de teste visual no repo) |

## 8. Riscos e mitigação (máx. 10, por severidade)

1. **Migration M4 (merge de `DocumentoDisciplina`) não é limpamente reversível** — mitigação: `pg_dump -Fc` obrigatório imediatamente antes, dry-run completo contra cópia de produção, script idempotente.
2. **Corrigir o gate de permissão hard-coded (D3) muda quem pode excluir/renomear em produção** — mitigação: seed de `Permissao` replicando exatamente o comportamento atual antes de qualquer troca de código, deploy em 2 passos (seed primeiro, código depois).
3. **`Upload.versao` muda de "identidade da revisão" para "atributo dentro da revisão"** — qualquer leitura direta (ex. `entregaveisAtuais()`, `src/modules/uploads/validacao.ts:20-30`) precisa ser auditada antes do F2-PR1 ir para produção, para não quebrar a lógica de "maior versão = entregável atual".
4. **Links antigos (`documentoId` cru) usados fora do que foi mapeado nesta auditoria** — mitigação: `resolverDocumentoCanonico()` cobre os pontos conhecidos (F2-PR4), mas se existir algum consumo não descoberto (ex. notificação por e-mail com link direto), ele quebra silenciosamente. Buscar por `documentoId` no código inteiro antes de fechar F2-PR3.
5. **Reconciliação de órfãos (D7) roda sobre dado de produção sem teste prévio possível 1:1** — mitigação: rodar primeiro em modo relatório (sem escrever), revisar a lista de `Upload`s que seriam afetados manualmente antes de rodar em modo escrita, seguindo o padrão já usado por `scripts/auditoria-crm.ts` (leitura primeiro, script separado para escrita).
6. **Flag `NEXT_PUBLIC_DOCUMENTOS_V2` mal testada em projetos `aprovacao`/`laudo`** (caminho `PastaProjeto`, D6) — mitigação: critério de corte de flag exige verificação explícita nesses dois tipos antes de virar padrão.
7. **Zip routes sem as mesmas capabilities do download individual** (dívida já existente, `01-arquitetura-atual.md` §14.1) — se F1-PR6/F2-PR7 tocarem essas rotas para exportação em lote, é o momento de corrigir o gap junto, ou o risco de vazamento entre disciplinas persiste com mais superfície de UI.
8. **Colisão física silenciosa por `slug()`** (dívida já existente, §14.6) — se F2-PR9 (upload de múltiplas extensões na mesma revisão) aumenta a frequência de upload por nome, o risco de colisão fica mais exposto; mitigação: checar existência de arquivo em `salvarArquivo()` antes de escrever (fix pequeno, pode entrar em F2-PR9 mesmo sem estar no escopo original da spec).
9. **`excluirUploadDefinitivo` não limpa `.dxf` de DWG** (dívida já existente, §14.3) — se a Fase 2 tocar o fluxo de lixeira/exclusão por causa de `substituidoPorId`, corrigir junto para não herdar o vazamento.
10. **Nenhum ambiente de teste com dado de produção real disponível para dry-run das migrations de merge** — mitigação: usar cópia de `pg_dump` restaurada em banco local (`docs/DEPLOY.md §8`), nunca rodar M3/M4 pela primeira vez direto em produção.

## 9. Estimativa (esforço relativo, sem prazo)

| Fase | PRs | Esforço agregado |
|---|---|---|
| 1 | 11 PRs — F1-PR3 (G), F1-PR7 (M), F1-PR8 (M), F1-PR10 (M), demais (P–M) | ~2G + 6M + 3P |
| 2 | 11 PRs — F2-PR1 (G), F2-PR3 (G), F2-PR4 (M), F2-PR7 (M), F2-PR10 (M), F2-PR6b (P), demais (P–M) | ~2G + 6M + 3P |
| 3 | 5 PRs — F3-PR3 (G), demais (M) | ~1G + 4M |
| 4 | 4 PRs — F4-PR1 (M), F4-PR2 (M), F4-PR3 (P), F4-PR4 (M) | ~3M + 1P |

Fases 2 e 3 concentram o maior risco (migrations de merge / reestruturação de workspace); Fase 1 concentra o maior número de PRs (mas a maioria de esforço baixo-médio, reaproveitando muito do já existente, conforme registrado no "Top 10 reaproveitamentos" da matriz).
