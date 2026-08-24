# Verificação de execução — refatoração de arquivos e plantas

**Data inicial:** 2026-08-23
**Atualizado em:** 2026-08-24
**Escopo:** confronto entre `01-arquitetura-atual.md`, `02-matriz-gap.md`, `03-plano-refatoracao.md`, o código atual e o banco de desenvolvimento configurado neste repositório.
**Método:** a auditoria inicial usou somente leitura do código, Git, migrations e validações automatizadas. A continuação registrada neste arquivo implementa F2-PR6a, F2-PR6c, F2-PR6b, F2-PR7, F2-PR9, F3-PR1 a F3-PR5, F4-PR1 e a correção A-03. No banco de desenvolvimento foram aplicadas as migrations aditivas M8, M7 e M9; o único backfill executado foi o de M9, descrito abaixo. Nenhum script de reconciliação ou merge de dados foi executado.

## Limites de evidência

- Na primeira leitura desta auditoria, `04-contexto-claude.md` tinha 0 bytes. Foi atualizado depois e agora registra uma transcrição de sessão do Claude Code. Os commits nela mencionados foram conferidos no Git; afirmações sobre produção, volumes de dados e testes manuais permanecem relato de sessão enquanto não houver evidência independente anexada.
- O banco configurado é `senahub_remake` em `localhost:5433`. `npx prisma migrate status` informou que o schema está atualizado, mas isso **não comprova** que os scripts manuais de reconciliação, backfill e merge foram executados, nem diz respeito a outro ambiente.
- A execução somente-leitura de `scripts/verificar-fase2-documentos.ts` não foi possível nesta máquina: o processo `tsx` falhou duas vezes com `ENOMEM` em `uv_os_get_passwd`. Por isso os contadores de dados da Fase 2 permanecem não verificados.

## Estado comprovado no repositório

| Fase/PR do plano | Estado | Evidência |
| --- | --- | --- |
| Fase 1, F1-PR1 a F1-PR11 | Componentes e commits presentes, mas não pronta para ativação | Commits `cd4bcba`, `c33e1b4`, `609f8cd`, `d68429e` e `cf637de`; componentes em `src/components/projetos/arquivos/`; paginação em `src/modules/uploads/queries.ts`. O CTA de A-03 foi conectado; A-05 e a validação manual ainda bloqueiam a ativação. |
| Corte da Fase 1 | Não comprovado como ativado | A rota só usa a nova tela com `NEXT_PUBLIC_DOCUMENTOS_V2=1` ou `?docsv2=1` (`src/app/(dashboard)/projetos/[id]/arquivos/page.tsx`). O arquivo `.env` local não declara a flag. Isto é compatível com o plano de convivência; não permite concluir o estado de outro ambiente. |
| F2-PR1 — `DocumentoRevisao` + `Upload.revisaoId` | Código e migration presentes; execução do backfill não comprovada | Migration `20260814140000_documento_revisao`; script `scripts/backfill-documento-revisao.ts`. |
| F2-PR2 — reconciliação de órfãos | Script presente; execução não comprovada | `scripts/reconciliar-uploads-orfaos.ts`, com modo relatório e `--aplicar`. |
| F2-PR3 — merge por nome-base | Código, migration e script presentes; execução não comprovada | `chaveDocumento()` agrupa sem extensão; migration `20260814150000_documento_substituido_por`; `scripts/merge-documentos-por-base.ts`. |
| F2-PR4 — resolver canônico e gravação de revisão no upload | Implementada no código | `resolverDocumentoCanonico()` em `src/modules/uploads/queries.ts`; persistência de `revisaoId` em `src/app/api/uploads/route.ts`. |
| F2-PR5 — metadados e status | Schema, migration e seed presentes; UI/action entregue por F2-PR6c | Migration `20260814160000_documento_metadados_status`; seed em `prisma/seed.ts`; edição e status na V2 descritos abaixo. |
| F2-PR6a — agrupamento da tabela | Implementado no código; validação visual/manual pendente | A rota V2 usa `listarDocumentosAgrupados()`; `TabelaDocumentos` mostra uma linha por `DocumentoDisciplina`, badges da revisão ativa e seleção que expande para os seus `Upload`s. O caso de revisão integralmente na lixeira tem teste unitário. |
| F2-PR6c — metadados, status e filtro de fases | Implementado no código; validação manual pendente | Painel de detalhe, Actions auditadas, filtro de status e seletor horizontal de fase; a atribuição padrão das novas permissões exige decisão A-06. |
| F2-PR6b — exigir fases por projeto | Implementado no código e schema de desenvolvimento; validação manual pendente | M8 cria `NomenclaturaConfig.exigirFase` com padrão `false`; configuração global/projeto, os dois uploaders e a rota validam/persistem a fase. |
| F2-PR7 — Listas de documentos | Implementado no código e schema de desenvolvimento; validação manual pendente | M7 cria `ListaDocumentos`/`ListaDocumentoItem`; Actions auditadas, aba Listas, filtro pela URL e ações em lote estão descritos abaixo. |
| F2-PR9 — upload explícito de revisão agrupada | Implementado no código; validação manual pendente | PDF/DWG (ou outras extensões distintas) com mesmo nome-base e destino passam a compartilhar a próxima `DocumentoRevisao`, sem alterar o upload comum. |
| F2-PR8 — histórico de revisões | Implementada | Drawer em `historico-revisoes-dialog.tsx`, query e action com escopo de projeto/disciplina. |
| F2-PR10 — colunas configuráveis | Implementada | `src/modules/uploads/colunas-documento.ts`, `seletor-colunas.tsx` e testes associados. |
| F3-PR1 — cabeçalho do visualizador | Implementado no código; validação manual pendente | Breadcrumb contextual com projeto/disciplina/documento, revisão lógica, status documental e arquivos ativos da mesma revisão; o comparador agora só aparece para outra revisão da mesma extensão. |
| F3-PR2 — painel de tarefas do documento | Implementado no código; validação manual pendente | `painel-tarefas-documento.tsx` é controlado pelo visualizador, filtra a mesma coleção mutável de `Pendencia` e preserva o envio em lote já decidido. |
| F3-PR3 — workspace de três painéis recolhíveis | Implementado no código; validação manual pendente | `PdfViewer` monta tarefas, prancha e detalhes em uma única área flexível; os painéis laterais preservam a seleção ao recolher. |
| F3-PR4 — sincronização card ↔ pin | Implementado no código; validação manual pendente | Selecionar um card centraliza o pin no canvas e eleva o zoom ao mínimo de 125%; selecionar o pin abre o detalhe. |
| F3-PR5 — detalhe contextual de tarefa | Implementado no código; validação manual pendente | A tarefa, responsáveis e item vinculado são consultados no servidor somente após `escopoTarefa`; ausência no resultado não expõe metadados. |
| F4-PR1 — M9 e backfill de origem | Implementado no código e no banco de desenvolvimento | M9 adiciona FKs opcionais para origem/resolução; o script idempotente vinculou 8 pendências de desenvolvimento à revisão do upload, sem preencher resolução. |
| F4-PR2 — resolução em revisão posterior | Implementado no código; validação manual pendente | Action auditada valida o mesmo documento e revisão posterior; o card herdado passa a oferecer “resolver na Rxx”. |
| F4-PR4 — comparador avançado | Implementada | Percentual de opacidade e zoom/scroll sincronizados em `comparador-revisoes.tsx`. |
| F4-PR3 | Não implementado | Ainda faltam os rótulos de origem/resolução no card e no histórico de revisões. |

## Integração da branch de refatoração

O contexto do Claude descreve trabalho posterior na branch local `refactor/documentos-cde`. Em 2026-08-23, os cinco commits abaixo foram integrados em `dev` pelo merge `e56c293`, sem conflitos. A validação após o merge passou: `npm run lint` e `npm test` (223 arquivos, 2.441 testes).

| Commit de origem | Conteúdo verificado | Situação para `dev` |
| --- | --- | --- |
| `c7813de` | F4-PR4: valor percentual da opacidade e sincronização de scroll/zoom no comparador | Integrado. |
| `84bbd4b` + `91a2c5c` | F2-PR6a, parte 1: query agrupada por `DocumentoDisciplina` em `documentos-agrupados.ts` | Integrada; a continuação deste trabalho passou a consumi-la na tela V2. |
| `85d9f0e` + `4ff6505` | F2-PR8: drawer de histórico de revisões, action com escopo por projeto/disciplina e correção para data/hora | Integrado. |

O relato da sessão informa que build, lint e testes passaram na branch de origem. Esta auditoria repetiu lint e testes depois do merge em `dev`; o build continua não executado porque há processos Node ativos no workspace.

### Referências locais duplicadas de agentes

Em verificação posterior, as branches locais `worktree-agent-aca730b53cb77bd3d` e `worktree-agent-a04b6fd11d28e4454` apontavam, respectivamente, para `3dedaa7` e `95cb25f`. Não há worktree ativo para elas (`git worktree list` contém somente `dev`) e elas não representam trabalho adicional:

| Referência encontrada | Patch já presente em `dev` | Evidência |
| --- | --- | --- |
| `3dedaa7` — comparador avançado | `c7813de` | Os dois commits têm o mesmo `patch-id` estável `7029b82b…`; `c7813de` está no histórico de `dev`. |
| `95cb25f` — drawer de histórico | `85d9f0e` | Os dois commits têm o mesmo `patch-id` estável `cb6d56b8…`; `4ff6505` acrescenta a correção posterior de hora e também está em `dev`. |

Portanto, essas referências **não devem ser mescladas novamente**. Elas podem ser removidas somente em uma limpeza de branches locais deliberada, sem impacto no conteúdo já integrado.

## Continuação — F2-PR6a e F2-PR6c

Após o merge `e56c293`, a continuação em `dev` concluiu a parte de interface da F2-PR6a:

- [`page.tsx`](../../src/app/(dashboard)/projetos/[id]/arquivos/page.tsx) passou a usar `listarDocumentosAgrupados()` e a whitelist `CAMPOS_ORDENACAO_DOC`; filtros, paginação, ordenação e muralha de disciplinas continuam resolvidos no servidor.
- [`tabela-documentos.tsx`](../../src/components/projetos/arquivos/tabela-documentos.tsx) recebe `LinhaDoc`, apresenta os badges de todos os arquivos da revisão vigente e mantém a barra de ações em lote. Selecionar um documento envia apenas os IDs dos arquivos da revisão vigente para zip, validação ou lixeira; revisões históricas não são afetadas.
- Os totais do cabeçalho e do painel de disciplinas passaram a contar documentos lógicos. Um upload legado sem `documentoId` ainda conta como uma unidade no painel, para expor a inconsistência em vez de ocultar o dado.
- [`documentos-agrupados.ts`](../../src/modules/uploads/documentos-agrupados.ts) calcula a revisão atual pelos uploads ativos, não pelo histórico completo de revisões. A regra foi isolada e coberta por [`documentos-agrupados-utils.test.ts`](../../src/modules/uploads/documentos-agrupados-utils.test.ts).
- O renomear de um documento com múltiplas extensões agora preserva a extensão de cada `Upload` (PDF permanece PDF e DWG permanece DWG). A regra está coberta em [`documento.test.ts`](../../src/modules/uploads/documento.test.ts).

Após a auditoria inicial, o CTA da superfície V2 foi conectado ao uploader já existente. A F2-PR6c acrescentou o painel de detalhe do documento: título, descrição e fase são salvos pela Action `editarMetadadosDocumento`; o status é salvo separadamente por `atualizarStatusDocumento`, ambas com auditoria automática e muralha de projeto/disciplina. A tabela mostra fase/status, o drawer de filtros aceita status e o seletor horizontal grava `fase` na URL. Status final impede uma nova revisão antes da gravação física em `POST /api/uploads`.

F2-PR6b foi implementada em desenvolvimento. A migration `20260823110000_exigir_fase_nomenclatura` acrescenta a coluna booleana obrigatória `NomenclaturaConfig.exigirFase`, com padrão `false`; portanto não há backfill e o comportamento dos projetos já existentes permanece fase opcional. A configuração é herdada do global pelo projeto até que este tenha uma linha própria. Ao ligar "Exige fases", os uploaders V2 e legado sempre abrem a revisão antes da confirmação, sugerem a fase pela sigla extraída por `parsePranchaFilename()` e exigem uma seleção ativa; a pessoa pode alterar a sugestão por arquivo. `POST /api/uploads` repete a resolução projeto→global, valida que a fase pertence ao catálogo ativo global ou do projeto e a persiste no `DocumentoDisciplina` antes de criar o `Upload`. A Action de metadados também recusa fase vazia quando o toggle está ligado, fechando a rota alternativa de edição.

Na primeira tentativa, `npx prisma migrate dev --name exigir_fase_nomenclatura` recusou executar porque o banco de desenvolvimento acusou três migrations históricas modificadas e três índices ausentes; ele solicitou reset do schema. O reset não foi aceito. Conforme o procedimento de drift, `npx prisma db push` sincronizou o schema do dev, a migration SQL M8 foi registrada manualmente e `npx prisma migrate resolve --applied 20260823110000_exigir_fase_nomenclatura` registrou sua aplicação. A checagem posterior `npx prisma migrate status` encontrou 191 migrations e informou schema atualizado. Isso é evidência somente do ambiente de desenvolvimento, não de produção.

F2-PR7 foi implementada em desenvolvimento. A migration `20260823120000_listas_documentos` cria `lista_documentos` e `lista_documento_item`: a segunda contém apenas o vínculo único entre a lista e o `DocumentoDisciplina`, portanto não duplica `Upload`, revisão nem arquivo físico. A tela V2 ganhou as abas Disciplinas e Listas no painel esquerdo. A seleção de uma lista é mantida em `?listaId=` e a query agrupada exige que a lista pertença ao projeto da página, além de preservar a muralha de disciplinas já existente.

A regra de acesso foi definida durante esta implementação: todas as pessoas que já podem ver o projeto veem os nomes das listas, mas a contagem é limitada aos documentos que cada pessoa pode ver. Criar, renomear e excluir lista exige `projetos:gerir` ou ser responsável por ao menos uma disciplina daquele projeto. Para adicionar ou remover um documento, a gestão do projeto pode operar qualquer disciplina; um responsável por disciplina só pode operar documentos das disciplinas pelas quais responde. Essas verificações são repetidas nas Server Actions `criarListaDocumentos`, `renomearListaDocumentos`, `excluirListaDocumentos`, `adicionarDocumentoLista` e `removerDocumentoLista`, todas por `defineAction`, com auditoria e revalidação da página do projeto. A UI espelha o gate, mas não o substitui.

Assim como em M8, `npx prisma migrate dev --name listas_documentos` detectou o drift histórico já conhecido e ofereceu reset do schema; o reset foi recusado. No banco de desenvolvimento, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` foi usado para conferir o SQL, `npx prisma db push` aplicou apenas o schema atual, a migration M7 foi registrada manualmente e `npx prisma migrate resolve --applied 20260823120000_listas_documentos` registrou sua aplicação. Esta sequência é evidência somente de desenvolvimento; não foi executada em servidor nem em produção.

F2-PR9 foi implementada sem migration e sem endpoint novo. A regra confirmada para esta implementação é: numa mesma seleção, arquivos de extensões diferentes, mesmo nome-base e mesmo destino formam uma revisão conjunta automaticamente; os demais arquivos mantêm exatamente o fluxo anterior. O primeiro arquivo da dupla cria a próxima `DocumentoRevisao` do documento lógico e recebe `novaRevisaoAgrupada=1`; na mesma requisição a rota mantém esse id por documento, e entre requisições (inclusive chunks) os seguintes recebem `revisaoDeId`. A rota valida, antes de gravar no disco, que esse id pertence ao mesmo documento e que a revisão ainda não tem arquivo da mesma extensão. Isso permite PDF+DWG (e outras extensões distintas) no mesmo ponto do histórico, inclusive no caminho de chunks, sem abrir escrita em outro documento nem sobrescrever uma extensão histórica. Após a operação, ambos os uploaders confirmam em toast a revisão comum. Os campos são opcionais: sem eles, a rota continua calculando a revisão pela versão do arquivo como antes. A auditoria do upload registra `revisaoAgrupada`.

## Continuação — F3-PR1, cabeçalho do visualizador

F3-PR1 foi implementada sem migration, alteração de banco ou endpoint novo. A rota do visualizador agora resolve o `documentoId` canônico apenas para leitura do status e da comparação, busca a `DocumentoRevisao` do `Upload` aberto e entrega ao cliente somente seus arquivos ativos. O cabeçalho mostra a trilha contextual projeto → disciplina → documento, nome/código, a revisão lógica (`DocumentoRevisao.numero`, com fallback seguro para `Upload.versao`), o status documental e os formatos da mesma revisão.

Uma decisão de implementação foi registrada após conselho técnico: `DocumentoStatus` é o único status exibido no cabeçalho, em `Badge` textual sem inventar mapeamento para `DocumentoStatus.cor`; a validação do arquivo e o status da disciplina continuam nos controles já existentes. A alternância se limita aos arquivos ativos da mesma `revisaoId`. O formato aberto fica marcado como atual; PDF e IFC mantêm suas ações existentes, enquanto DWG e demais formatos mantêm download no cabeçalho compacto. O preview DWG permanece no diretório de arquivos, evitando iniciar polling de conversão na tela já pesada do PDF. Para upload legado sem `revisaoId`, a tela mostra apenas o próprio arquivo e não infere par por nome ou número de versão.

O predicado de `temOutraRevisao` também foi alinhado ao comparador: usa o documento canônico e a mesma extensão do arquivo aberto. Assim, PDF+DWG numa única revisão não expõe mais o link de comparação que não teria duas versões de PDF para abrir. A revisão lógica mostrada no cabeçalho não substitui `Upload.versao`, que permanece como origem de apontamentos para preservar os dados legados.

## Continuação — F3-PR2, painel de tarefas do documento

F3-PR2 criou `src/components/projetos/arquivos/painel-tarefas-documento.tsx` como componente controlado, pronto para ser posicionado à esquerda pelo workspace de F3-PR3. Ele recebe a mesma coleção mutável de `Pendencia` já carregada por `pendenciasDoUpload()` e o id selecionado do `PdfViewer`; por isso não cria uma segunda consulta que poderia divergir depois de criar, editar, enviar ou excluir um apontamento. A lista tem pesquisa textual, filtros por status e severidade, cards compactos com número, miniatura quando existente, texto, classificação, prazo/atraso, autoria, página, contagens de comentários/anexos e estado de encaminhamento para tarefa.

Foi feito um conselho técnico curto antes da implementação porque a especificação usa o termo "responsável" para o card, enquanto `Pendencia` só tem autor e um `tarefaId` escalar. A decisão registrada D4/R4 já determina uma única `Tarefa` por lote de apontamentos, e não uma tarefa individual por pin. O conselho concluiu que chamar o autor de responsável seria semanticamente incorreto e que enriquecer a leitura com `Tarefa.responsaveis` sem aplicar `escopoTarefa(user)` vazaria dados: o visualizador também pode ser aberto por membro do projeto, mas a tarefa só é visível a global, criador ou responsável. Assim, nesta etapa o card diz explicitamente "Criado por", "Aguardando envio para tarefa" ou "Incluído em tarefa". F3-PR5 exibirá detalhes e responsáveis da tarefa no painel contextual, sob a muralha própria das tarefas.

O botão `+ Tarefa` é uma prop controlada e só será entregue a quem já tem `uploads:validar`; F3-PR3 o conectará ao fluxo existente `enviarApontamentos`/`TarefaDialog`, que cria uma tarefa e um item por pendência dentro da mesma transação. Não foi usado `criarTarefa`, pois ele perderia o vínculo `Pendencia` → `TarefaItem`. Também foi alinhado o cliente ao servidor: o cálculo de pendências enviáveis e a atualização otimista agora usam os helpers `enviaveis()`/`estaAberta()`, incluindo `em_correcao` como a action já fazia.

O componente ainda não é montado antes de F3-PR3 de propósito: o painel direito atual já contém a lista completa de apontamentos, e montá-lo agora duplicaria informação e seleção. F3-PR3 moverá a composição para as três colunas; F3-PR4 conectará a seleção à centralização/zoom e F3-PR5 acrescentará o detalhe contextual de tarefa.

## Continuação — F3-PR3, workspace de três painéis

F3-PR3 montou o componente de F3-PR2 à esquerda, preservou a coluna da prancha como centro do workspace e converteu a lateral direita em detalhe da pendência selecionada. `PdfViewer` continua dono de `pendencias`, seleção, envio e ações; o painel novo não consulta nem mantém uma cópia própria dos dados. Assim, criar, editar, excluir ou encaminhar um apontamento atualiza os três painéis pela mesma coleção otimista.

Os dois painéis laterais são recolhíveis no layout desktop (`lg`): tarefas usam 288 px, detalhes usam 320 px e a prancha mantém `min-w-0 flex-1`, sem largura fixa concorrente. Ao fechar um painel, a seleção do pin fica no pai e o foco volta ao botão que o reabre caso estivesse dentro do painel fechado. Os painéis não recolhidos deixam de ser montados, evitando controles invisíveis na navegação por teclado. A lista esquerda seleciona o apontamento, abre o detalhe e rola à página correspondente; clicar no pin também abre o detalhe. A centralização e o zoom exatos do pin continuam sendo o recorte seguinte, F3-PR4.

Esta etapa não altera schema, migration, endpoint, permissão ou banco. A composição é desktop-first; a validação manual deve ser feita em 1366 px, incluindo recolher/expandir cada lado, percorrer a lista por teclado, selecionar card e pin, verificar ausência de scroll horizontal e confirmar que as ações existentes do detalhe ainda funcionam.

## Continuação — F3-PR4, sincronização card ↔ pin

F3-PR4 mantém a seleção como estado único no `PdfViewer`. Ao escolher um card do painel esquerdo, `centralizarPin()` garante zoom mínimo de 125%, rola até a página e, após a atualização do canvas, usa o identificador `data-pendencia-id` do próprio botão do pin para centralizá-lo horizontal e verticalmente. Não há deep-link, query extra nem cópia de estado. Ao clicar diretamente no pin, a tela mantém sua posição atual e apenas seleciona/abre o detalhe, sem provocar um salto visual desnecessário.

O comportamento usa duas animações de quadro antes da centralização para esperar a renderização decorrente do zoom. A validação manual deve confirmar que o card selecionado em outra página chega ao pin correto, com zoom de pelo menos 125%, e que pin, card e painel direito continuam apontando para a mesma pendência.

## Continuação — F3-PR5, detalhe contextual de tarefa

`Pendencia` mantém apenas os ponteiros escalares `tarefaId` e `tarefaItemId`. Para não transformar esses ponteiros em vazamento de dados, `contextoTarefasDasPendencias()` recebe somente os ids já presentes nas pendências visíveis e aplica `escopoTarefa(viewer)` dentro do `where` Prisma. Ela devolve apenas título, status textual, responsáveis e itens da tarefa não arquivada. A página do visualizador faz essa leitura no servidor e o cliente recebe somente as tarefas que a pessoa já poderia abrir no módulo de tarefas.

Quando a pendência selecionada possui contexto autorizado, o painel direito mostra o título da tarefa, status, responsáveis e o item de checklist correspondente. Se a tarefa não estiver no resultado — por escopo, arquivamento ou item histórico removido — nada adicional é mostrado; a interface não informa a causa nem os metadados da tarefa. Após encaminhar uma rodada, o visualizador atualiza sua coleção otimista e faz `router.refresh()` para obter o novo contexto autorizado sem adicionar fetch de cliente.

Esta etapa não altera schema, migration, endpoint ou permissões. A validação manual deve usar dois perfis: criador/responsável da tarefa deve ver o contexto e um membro do projeto que não seja criador nem responsável deve continuar vendo apenas a pendência, sem título, responsáveis ou item da tarefa.

## Continuação — F4-PR1, M9 e backfill de origem

M9 acrescenta a `Pendencia` as colunas opcionais `revisaoOrigemId` e `revisaoResolucaoId`, com FKs `ON DELETE SET NULL` para `DocumentoRevisao` e índices próprios. A nulidade preserva qualquer linha legada cujo upload ainda não tenha revisão identificável. A revisão de resolução fica nula por desenho: não há evidência para declarar uma correção histórica como resolvida entre revisões.

`npx prisma migrate dev --name pendencia_revisao` identificou o drift histórico já conhecido e pediu reset; ele não foi aceito. No banco de desenvolvimento, `npx prisma db push` aplicou o schema aditivo, o SQL mínimo de M9 foi revisado em `prisma/migrations/20260824090000_pendencia_revisao/migration.sql` e `npx prisma migrate resolve --applied 20260824090000_pendencia_revisao` registrou a migration. `npm run db:generate` regenerou o cliente Prisma.

O script idempotente `scripts/backfill-pendencia-revisao-origem.ts` primeiro rodou em relatório: 8 pendências a vincular, 0 sem revisão no upload e 0 com origem já preenchida. A execução com `--aplicar` vinculou as 8; o relatório subsequente confirmou 8 preenchidas, 0 pendentes e 0 revisões de resolução alteradas. `npx prisma migrate status` informou 193 migrations e schema de desenvolvimento atualizado. Esta evidência não diz respeito a produção.

## Continuação — F4-PR2, resolução em revisão posterior

A action `marcarPendenciaResolvidaEmRevisao` usa `defineAction`, aplica os mesmos papéis e a mesma máquina de estados de uma resolução comum e, antes de escrever, confirma que origem e resolução pertencem ao `documentoId` da pendência. A regra pura `revisaoPosteriorDaOrigem()` recusa revisão igual, anterior ou origem ausente; seus quatro cenários estão cobertos em `helpers.test.ts`. Ao resolver, a action grava status, autor/data de resolução e `revisaoResolucaoId` na mesma transação que conclui o `TarefaItem` vinculado. Reabrir a pendência limpa o vínculo de resolução para não conservar uma informação que deixou de ser verdadeira.

No visualizador, somente pendência trazida de outra revisão, com origem identificada e revisão lógica atual, substitui o botão comum por “resolver na Rxx”. O comparador já existente continua disponível no cabeçalho quando há outra revisão da mesma extensão. A interface atualiza o estado otimista com o id da revisão de resolução; não cria endpoint nem muda permissões.

## Achados que exigem decisão antes de executar o merge de dados

### A-01 — crítico — o script de merge descarta registros, contrariando o plano

O plano estabelece que nenhum registro é descartado no merge de documentos. Entretanto, `scripts/merge-documentos-por-base.ts` faz `delete` de:

- revisões duplicadas após repontar seus uploads (linha 125);
- calibrações em colisões de `(documentoId, pagina)` (linhas 150 e 154);
- leituras em colisões de `(documentoId, userId)` (linhas 171 e 175).

Além da divergência funcional, o JSON de execução gravado no fim do script registra apenas o mapa canônico → absorvidos. Os ids e a quantidade de calibrações/leituras descartadas não entram nesse arquivo, embora o contador `descartadas` exista no código.

**Risco:** perda irreversível de histórico operacional ao rodar `--aplicar`, sem trilha suficiente para restaurar seletivamente.

**Decisão necessária:** definir se as relações colidentes devem ser preservadas em histórico/alias, se o plano deve ser revisado para autorizar descarte explícito, ou se o script deve ser corrigido antes de qualquer execução em dados relevantes.

### A-02 — resolvido no código — escrita de arquivos agora respeita o escopo de dados

Na versão inicialmente auditada, as ações de renomear e gerir a lixeira usavam `recurso: "projetos"` e `permissao: "ver"` em `defineAction`. A capacidade nova `arquivos:renomear`/`arquivos:excluir` era verificada dentro do handler, mas as ações de lixeira não verificavam se o usuário podia acessar o projeto/disciplina do `Upload` recebido.

`defineAction` verifica a permissão fina, mas não aplica escopo de projeto automaticamente (`src/lib/with-action.ts`). Naquele estado, uma pessoa que possuísse as duas capabilities globais poderia atuar sobre um `uploadId` fora de sua carteira, caso conseguisse informar o identificador.

**Correção aplicada:** `renomearUpload`, `excluirUpload`, `excluirUploadsLote`, `restaurarUpload` e `excluirUploadDefinitivo` agora declaram o recurso `arquivos` e exigem, no servidor, `projetos:ver`, `projetoVisivel()` e a muralha `responsável ou ver_todas_disciplinas`. A exclusão em lote reproduz a muralha no `where` Prisma, portanto IDs de disciplinas alheias são ignorados. As capabilities `arquivos:renomear` e `arquivos:excluir` continuam complementares aos gates históricos; não ampliam escopo de dados.

`responsavelOuVeTodas()` em `src/modules/arquivos/acesso.ts` tem cobertura unitária para os três ramos da decisão.

### A-03 — resolvido para envio — a nova tela agora reutiliza o fluxo de upload

Na versão inicialmente auditada, quando a flag da nova tela estava ligada a rota retornava apenas `DocumentosShell`; o `ArquivosExplorer` legado, que contém o uploader, deixava de ser renderizado. O CTA “Enviar documentos” não possuía ação.

**Correção aplicada:** o CTA abre `enviar-documentos-dialog.tsx`, que usa a mesma rota `POST /api/uploads` e o motor compartilhado `enviarArquivoComProgresso()`. A pessoa escolhe disciplina e pacote/pasta, pode arrastar arquivos ou uma pasta inteira, acompanha o progresso individual e recebe o aviso de nova revisão já existente no fluxo legado.

Naquele ponto, o fluxo explícito de múltiplas extensões sob uma revisão escolhida pela pessoa ainda estava pendente; ele foi entregue depois por F2-PR9, sem criar uma rota ou regra de versionamento paralela.

O bloqueio funcional de ativação da flag foi removido, sujeito à validação manual do envio e à comprovação de A-05.

### A-04 — resolvido no código — query agrupada podia deixar a linha sem arquivos

Este achado vale para `refactor/documentos-cde`, antes de integrar F2-PR6a parte 1. Em `src/modules/uploads/documentos-agrupados.ts`, a query base exclui uploads na lixeira, mas a hidratação calcula a revisão atual usando **todas** as revisões do documento. Se a R02 inteira estiver na lixeira e a R01 continuar ativa, a linha escolhe R02 como atual e filtra os uploads ativos por R02; o resultado é uma linha sem badges de arquivo, embora R01 ainda exista e possa ser baixada.

**Correção aplicada:** a revisão atual agora é calculada exclusivamente pelos uploads ativos hidratados pela query. Portanto, se R02 estiver inteiramente na lixeira e R01 continuar ativa, a linha mostra R01 e seus badges. O teste `documentos-agrupados-utils.test.ts` fixa esse comportamento.

### A-05 — alto — a ativação da V2 ainda depende de confirmar os uploads sem documento lógico

`listarDocumentosAgrupados()` usa `join upload u on u."documentoId" = d.id`; por definição, uploads ativos sem `documentoId` não aparecem na tabela agrupada. A F2-PR2 possui script para reconciliá-los, porém sua execução não foi comprovada nesta auditoria porque o diagnóstico de dados falhou no bootstrap de `tsx` com `ENOMEM`; a tentativa e seu escopo somente leitura estão registrados em `06-evidencia-verificacao-fase2-documentos-dev-2026-08-23.md`.

**Risco:** em um ambiente que ainda tenha órfãos, a tela V2 pode omitir arquivos enquanto o explorer legado continua a exibi-los.

**Decisão/validação necessária antes de ativar a flag:** executar e arquivar o resultado de `scripts/verificar-fase2-documentos.ts` no ambiente alvo, com contagem de uploads ativos sem `documentoId` igual a zero; ou alterar a consulta para representar explicitamente os órfãos.

### A-06 — decisão operacional pendente — permissões novas não têm concessão padrão

`arquivos:editar_metadados` e `arquivos:alterar_status` já existem no catálogo de permissões e as Actions F2-PR6c exigem cada uma delas. Porém, nenhuma das duas está em `PERMISSOES_BASE` de `prisma/seed.ts`. O comportamento atual é deliberadamente fail-closed: só administrador/superusuário ou perfil configurado explicitamente pode editar os campos.

**Decisão necessária:** registrar quais perfis recebem cada capability por padrão, se houver concessão padrão desejada. Não foi alterado o seed por não haver essa regra nos documentos do projeto.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou após F3-PR3. |
| `npm test` | Passou após F3-PR3: 226 arquivos, 2.453 testes. |
| Testes focados da continuação | Passaram: 9 testes em `acesso` e `lixeira`; a regra nova de acesso tem três cenários unitários. |
| Revisão de acessibilidade de F3-PR1 | Sem achados concretos no breadcrumb e nos controles novos do cabeçalho. |
| Revisão de fronteira cliente de F3-PR1 | Detectou que montar `VisualizarDwgButton` no cabeçalho poderia expor spinner de conversão persistente; o cabeçalho usa o download de DWG e não monta esse probe. |
| Conselho técnico de F3-PR2 | Convergiu para preservar tarefa em lote, não atribuir um responsável artificial a `Pendencia` e deixar dados de `Tarefa` para F3-PR5, quando a query aplicar o escopo próprio de tarefas. |
| Revisão de acessibilidade de F3-PR2 | Encontrou conteúdo de fluxo dentro do botão do card e contadores sem texto para leitor de tela; ambos foram corrigidos com spans de conteúdo textual e rótulos `sr-only`. |
| Revisão de fronteira cliente de F3-PR2 | Sem achados: o componente recebe dados serializáveis já obtidos pela página e não importa consulta/ação de servidor em tempo de execução. |
| Validação manual do envio V2 | Pendente: requer operar o diálogo com uma disciplina de teste e confirmar envio, aviso de revisão e atualização da tabela. |
| Validação manual de F2-PR6c | Pendente: em desenvolvimento, editar metadados, alterar status, filtrar por status/fase e confirmar o bloqueio de nova revisão para status final. |
| Validação manual de F2-PR6b | Pendente: em um projeto de teste, ligar/desligar "Exige fases"; confirmar herança global, sugestão por nome no padrão, alteração manual por arquivo, bloqueio sem fase e persistência no detalhe do documento, nos uploaders V2 e legado. |
| Validação manual de F2-PR7 | Pendente: na V2 e em um projeto de teste, criar uma lista, selecionar dois documentos e adicioná-los, selecionar a lista, remover um documento e confirmar contagem/tabela sem recarregar manualmente. Repetir com responsável de disciplina e com gestão do projeto para confirmar a muralha de escrita. |
| Validação manual de F2-PR9 | Pendente: em uma disciplina de teste, selecionar PDF e DWG com mesmo nome-base numa única operação, confirmar o toast da mesma revisão e o drawer de histórico com ambos os arquivos na mesma Rxx. Repetir com arquivos de nome-base ou destino diferentes para confirmar que seguem independentes. |
| Validação manual de F3-PR1 | Pendente: em desenvolvimento, abrir PDF único, PDF+DWG na mesma revisão e histórico legado com revisão sem par; conferir breadcrumb contextual, status nulo/final, formato atual, ações dos formatos irmãos e ausência do botão Comparar quando só houver outra extensão na mesma revisão. |
| Validação manual de F3-PR2/F3-PR5 | Pendente: em 1366 px, abrir o workspace, pesquisar/filtrar cards, confirmar foco por teclado, seleção única, recolher/expandir ambos os painéis sem perder a seleção, selecionar card em outra página e confirmar centralização do pin com zoom mínimo de 125%, abrir detalhes pelo pin, ausência de scroll horizontal, encaminhamento em lote e contexto de tarefa visível somente a criador/responsável. |
| Validação manual de F4-PR1 | Pendente: em desenvolvimento, abrir uma pendência criada em revisão conhecida e confirmar no banco que `revisaoOrigemId` aponta para a mesma `DocumentoRevisao` de seu upload; confirmar `revisaoResolucaoId` nulo antes de F4-PR2. |
| Validação manual de F4-PR2 | Pendente: criar pendência em R02, abrir R03 como responsável da disciplina, usar “resolver na R03” e confirmar `revisaoResolucaoId`; reabrir e confirmar que o vínculo volta a nulo. Repetir com R02/mesmo documento e outra disciplina para confirmar a recusa no servidor. |
| `scripts/verificar-fase2-documentos.ts` | Não executado: `tsx` falhou antes de conectar ao banco com `uv_os_get_passwd` / `ENOMEM`. Evidência em `06-evidencia-verificacao-fase2-documentos-dev-2026-08-23.md`. |
| `npx prisma migrate status` | Passou após M9: 193 migrations encontradas; schema do banco de desenvolvimento atualizado. As tentativas diretas de `migrate dev` estão documentadas acima e não houve reset. |
| `npx prisma db:seed` | Não executado: é uma escrita no banco de desenvolvimento e M7/M8 não exigem alteração no seed (a nova coluna tem default e listas não possuem catálogo inicial). A idempotência do seed permanece pendente de uma execução deliberada. |
| `npx tsc --noEmit` | Não concluído: esgotou o heap padrão do Node após 85,4 s. Não é evidência de erro de tipos. |
| `npm run build` | Não executado: havia processos Node ativos; o repositório proíbe build concorrente com `next dev` no mesmo `.next`. |

## Próximo passo seguro

Não executar `--aplicar` nos scripts da Fase 2 até haver decisão registrada para A-01. Antes de ativar `NEXT_PUBLIC_DOCUMENTOS_V2`, comprovar A-05 e validar manualmente o envio V2/F2-PR6b/F2-PR6c/F2-PR7/F2-PR9. Registrar também a decisão de A-06 antes de esperar que perfis não administrativos editem metadados ou status. A Fase 3 e F4-PR1/PR2 estão implementadas no código; a Fase 3 aguarda validação manual. O próximo recorte técnico é F4-PR3, os rótulos de origem e resolução nos cards e no histórico. Depois da correção/decisão, executar `scripts/verificar-fase2-documentos.ts` em cada ambiente relevante e anexar a saída datada a esta pasta, para transformar a execução de scripts manuais em evidência auditável.
