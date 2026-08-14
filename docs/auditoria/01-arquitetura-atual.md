# Auditoria — Arquitetura atual do módulo de arquivos/documentos de projeto

Auditoria factual, 100% leitura. Base para a refatoração descrita em `docs/spec-documentos-senahub.md` — nada aqui foi implementado ou proposto, só mapeado. Toda afirmação cita `arquivo:linha`; onde não há citação, é porque não foi encontrado.

Escopo real identificado: o alvo da spec ("arquivos/documentos de projeto") corresponde hoje a `src/modules/uploads/` + `src/modules/arquivos/` + rotas `/projetos/[id]/arquivos`, `/arquivos`, `/aprovacoes`, `/pendencias`, `/p/arquivos/[token]`. O módulo `src/modules/documentos/` ("Estúdio") é um sistema separado de **geração de relatórios por template** (tokens `[Campo]`, `[Sum(x)]` etc.) — não modela upload/versão de arquivo de disciplina e é citado só onde relevante (§5.9).

## 1. Resumo executivo

Hoje o módulo é um gerenciador de arquivos por disciplina, não um CDE. Cada `Upload` pertence a uma `Disciplina`, roteado por `PacoteUpload` (A/B/OUTROS/RECEBIDOS) ou por `PastaProjeto` (árvore custom, projetos Aprovação/Laudo). Existe um agrupador lógico de versões (`DocumentoDisciplina`, desde ago/2026) que amarra `Upload[]` por nome+local, com `Upload.versao` incremental — mas paralelamente existem **quatro outros** pares "documento+versão" isolados por domínio (jurídico, licitação, certidões, ART), sem reuso entre si. Apontamentos posicionais em PDF (`Pendencia`, pinos x/y por página) e em modelos 3D (`ApontamentoCoordenacao`, IFC) já existem e já geram `Tarefa`. Storage é disco local via `STORAGE_BASE_PATH`, sem thumbnail/preview de servidor. Visualizadores: PDF e IFC têm markup+medição; DWG só tem pan/zoom; imagem não tem visor algum (download-only). Permissões finas existem para `arquivos` (ver/baixar/enviar/ver_todas_disciplinas) e `uploads:validar`, mas exclusão/restauração/rename usam um gate hard-coded (`role === "admin"`) fora do catálogo. Não existe conceito de "lista/tag" reutilizável agrupando documentos.

## 2. Rotas e páginas

| Rota (URL) | Arquivo | O que renderiza | Quem consome |
|---|---|---|---|
| `/projetos/[id]/arquivos` | `src/app/(dashboard)/projetos/[id]/arquivos/page.tsx` | `ArquivosExplorer` — árvore de disciplinas/pastas, uploader, Recebidos/Geral/Base Arquitetônica, lixeira, link público, ARTs | Aba "Arquivos" da `ProjetoTabNav`, sempre visível (`src/app/(dashboard)/projetos/[id]/layout.tsx:130`); gate `projetos:ver` |
| `/projetos/[id]/arquivos/[uploadId]/visualizar` | `src/app/(dashboard)/projetos/[id]/arquivos/[uploadId]/visualizar/page.tsx` | `PdfViewer` — visor com pinos/apontamentos, markup, medição | Só linkado quando `extDe(nome)==="pdf"`: `arquivos-explorer.tsx:305,354`, `disciplina-card.tsx:1058,1096,1125,1144`, `pasta-tree-view.tsx:308,329`, `comparador-revisoes.tsx:207`, `pendencia-referencias.tsx:125` (deep-link `?pagina=&pin=`) |
| `/projetos/[id]/arquivos/[uploadId]/comparar` | `src/app/(dashboard)/projetos/[id]/arquivos/[uploadId]/comparar/page.tsx` | `ComparadorRevisoes` — lado-a-lado / sobreposição / cortina / diferenças | Linkado de `pdf-viewer.tsx` quando `temOutraRevisao` |
| `/arquivos` | `src/app/(dashboard)/arquivos/page.tsx` | `DiretorioView` — árvore global de todos os projetos/disciplinas, busca client-side | Item de nav "Arquivos" (`src/lib/nav-config.ts:120-124`), gate `arquivos:ver`, sem `roles[]` (setor-driven) |
| `/aprovacoes` | `src/app/(dashboard)/aprovacoes/page.tsx` | `AprovacoesView` + `ProntasAprovacaoView` + `PedidosExclusaoView` (só admin) | Item de nav "Aprovações" (`nav-config.ts:125-130`, gate `uploads:validar`); KPI cards em `(dashboard)/page.tsx:115,127` |
| `/pendencias` | `src/app/(dashboard)/pendencias/page.tsx` | `PendenciasConsolidadoView` — visão agregada de `Pendencia` (pinos PDF) por projeto/disciplina/responsável | Item de nav "Apontamentos" (`nav-config.ts:305-311`, gate `projetos:ver`) |
| `/projetos/[id]/coordenacao` | `src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx` | `CoordenacaoView` (viewer 3D IFC) + `DashboardCoordenacao` + `ConversaoStatusView` | Aba "Coordenação" da `ProjetoTabNav`, só se `podeCoordenacao` (`layout.tsx:132`); gate `coordenacao:ver` |
| `/p/arquivos/[token]` | `src/app/p/arquivos/[token]/page.tsx` | `ArquivosPublicoView` — lista download/preview nativo, sem login | Link público gerado em `link-publico-arquivos-dialog.tsx`, enviado por e-mail |

`/pendencias` (2D, `Pendencia`) e os apontamentos 3D de `/coordenacao` (`ApontamentoCoordenacao`) são sistemas paralelos, não a mesma entidade.

## 3. Componentes de UI

| Componente | Caminho | Responsabilidade | Reutilizável fora do módulo |
|---|---|---|---|
| `ArquivosExplorer` | `src/components/projetos/arquivos-explorer.tsx` | Orquestra a aba Arquivos inteira (2501 linhas): árvore, uploader, pastas Recebidos/Geral/Base Arquitetônica, lixeira, ARTs | Não |
| `PdfViewer` | `src/components/projetos/pdf-viewer.tsx` | Visor de PDF com pinos, markup, medição, calibração, thread, envio de tarefa | Não |
| `DocumentoViewer` | `src/components/projetos/documento-viewer.tsx` | Visor de PDF somente-leitura (zoom+busca), sem pinos | Sim — usado por Recebidos/Geral/RH via `PreviewPdfButton` |
| `ComparadorRevisoes` | `src/components/projetos/comparador-revisoes.tsx` | Compara 2 revisões: lado-a-lado, sobreposição, cortina, diff | Não |
| `PdfPagina` | `src/components/pdf/pdf-pagina.tsx` | Renderiza 1 página pdf.js (canvas+textLayer) | Sim — usado por `PdfViewer`, `DocumentoViewer`, `ComparadorRevisoes` |
| `PreviewPdfButton` | `src/components/pdf/preview-pdf-button.tsx` | Botão que abre `DocumentoViewer` em `Dialog` | Sim — genérico, recebe `url`/`titulo` |
| `DwgViewer` | `src/components/dwg/dwg-viewer.tsx` | Canvas 2D nativo: renderiza DXF convertido, pan/zoom/camadas | Sim |
| `VisualizarDwgButton` | `src/components/dwg/visualizar-dwg-button.tsx` | Botão + polling de status de conversão + `Dialog` com `DwgViewer` | Sim — usado em `arquivos-explorer.tsx`, `disciplina-card.tsx`, `diretorio-view.tsx`, `RecebidosPasta` |
| `CoordenacaoView` | `src/components/coordenacao/coordenacao-view.tsx` | Orquestra viewer 3D, apontamentos, clash, diff, BCF, vistas | Não |
| `Viewer3D` | `src/components/coordenacao/viewer-3d.tsx` | Wrapper React fino do `ViewerEngine`, sempre via `next/dynamic({ssr:false})` (`coordenacao-view.tsx:52-54`) | Não |
| `ViewerEngine` | `src/modules/coordenacao/viewer/engine.ts` | Confina todo o contato com three.js/@thatopen/fragments | Sim, por design |
| `MarkupEditor` | `src/components/coordenacao/markup-editor.tsx` | Ferramentas 2D sobre viewport 3D: seta/círculo/texto | Não |
| `MedicaoToolbar` | `src/components/coordenacao/medicao-toolbar.tsx` | Barra de medição 3D (distância/área) | Não |
| `ConversaoStatusView` | `src/components/coordenacao/conversao-status-view.tsx` | Tabela de modelos IFC + status/progresso | Não |
| `DiretorioView` | `src/components/arquivos/diretorio-view.tsx` | Árvore global (todos projetos), busca client-side | Não |
| `AprovacoesView` | `src/components/arquivos/aprovacoes-view.tsx` | Fila de entregáveis (pacotes A/B) aguardando validação | Não |
| `ProntasAprovacaoView` | `src/components/arquivos/prontas-aprovacao-view.tsx` | Lista de disciplinas prontas para aprovar — Server Component (`:12`) | Não |
| `PedidosExclusaoView` | `src/components/arquivos/pedidos-exclusao-view.tsx` | Fila de decisão admin (aprovar/manter exclusão) | Não |
| `ArquivosPublicoView` | `src/components/arquivos/arquivos-publico-view.tsx` | Página pública por token: lista, download, preview nativo | Não |
| `PendenciasConsolidadoView` | `src/components/projetos/pendencias-consolidado-view.tsx` | Agregação de `Pendencia` abertas | Não |
| `IconeArquivo` | `src/components/projetos/icone-arquivo.tsx` | Ícone por extensão — server-safe, evita ciclo entre `arquivos-explorer.tsx`/`pasta-tree-view.tsx` (`:10-12`) | Sim — usado em ≥3 módulos |
| `PastaTreeView`/`SeletorPasta` | `src/components/projetos/pasta-tree-view.tsx` | Árvore de pastas custom (Aprovação/Laudo), CRUD de pasta | Não |
| `AcoesValidacaoArquivo` | `src/components/projetos/acoes-validacao-arquivo.tsx` | Botões validar/reverter/pedir ajuste | Sim — usado em `arquivos-explorer.tsx`, `diretorio-view.tsx`, `pdf-viewer.tsx` |
| `LinkPublicoArquivosButton`/dialog | `src/components/projetos/link-publico-arquivos-dialog.tsx` | Gera/revoga/copia link público, envia e-mail | Não |
| `PainelProgressoEnvio` | `src/components/projetos/upload-progresso.tsx` | Painel de progresso por arquivo — compartilhado entre aba Arquivos e card de disciplina (`:8-9`) | Sim |

## 4. APIs / endpoints

| Método+path | Handler | Payload de entrada | Retorno | Consumidores conhecidos |
|---|---|---|---|---|
| `POST /api/uploads` | `src/app/api/uploads/route.ts:29-311` | multipart: `disciplinaId`, `pacote` (A\|B\|RECEBIDOS), `pastaId?`, `files[]`, `nomes[]`; modo chunked: `sessaoId`, `nome`, `total`, `tamanho`, `mime` | `{ resultados: [{nome, ok, pacote?, motivo?, realocado?}] }` | `arquivos-explorer.tsx:2033`, `upload-progresso.tsx:47`, `coordenacao-view.tsx:372` |
| `POST /api/uploads/chunk` | `src/app/api/uploads/chunk/route.ts:12-41` | query `sessao,i,n` + corpo cru (bytes) | `{ok, recebido}` | cliente, antes de finalizar via `/api/uploads` (`chunk/route.ts:9-10`) |
| `GET /api/uploads/[id]/download` | `src/app/api/uploads/[id]/download/route.ts:9-84` | `?disposition=inline` | bytes do arquivo | `comparador-revisoes.tsx:19`, `disciplina-card.tsx:1107,1155`, `pdf-viewer.tsx:328`, `medir-pdf-dialog.tsx:57` |
| `GET /api/uploads/zip` | `src/app/api/uploads/zip/route.ts:18-147` | query `ids` (csv, máx 500), `nome` | stream `.zip` | `arquivos-explorer.tsx:142`, `pasta-tree-view.tsx:203` |
| `GET /api/uploads/disciplina/[disciplinaId]/zip` | `src/app/api/uploads/disciplina/[disciplinaId]/zip/route.ts:10-108` | — | stream `.zip` | `disciplina-card.tsx:1040,1179`, `arquivos-explorer.tsx:891` |
| `GET /api/p/arquivos/[token]/[uploadId]` | `src/app/api/p/arquivos/[token]/[uploadId]/route.ts:11-42` | `?disposition=inline` | bytes (sem login) | `arquivos-publico-view.tsx:77,88` |
| `GET /api/p/arquivos/[token]/art/[id]` | `src/app/api/p/arquivos/[token]/art/[id]/route.ts:11-41` | — | bytes PDF de ART (sem login) | `arquivos-publico-view.tsx:134,143,159` |
| `GET /api/p/arquivos/[token]/zip` | `src/app/api/p/arquivos/[token]/zip/route.ts:12-56` | `?disciplinaId?` | stream `.zip` (sem login) | `arquivos-publico-view.tsx:54,187` |
| `GET /api/coordenacao/frag/[uploadId]` | `src/app/api/coordenacao/frag/[uploadId]/route.ts:19-25` | — | bytes `.frag` (IFC convertido) | viewer 3D; gate próprio `coordenacao:ver` |
| `GET /api/dwg/[desenhoId]/dxf` | `src/app/api/dwg/[desenhoId]/dxf/route.ts:18-29` | — | bytes `.dxf` (DWG convertido) | `DwgViewer`; gate próprio `resolverAcessoDesenho` |

Server Actions equivalentes (não-REST), todas em `src/modules/uploads/actions.ts`: `validarEntrega`, `validarArquivo`, `reverterValidacaoArquivo`, `solicitarAjusteArquivo`, `validarArquivosLote`, `renomearUpload`, `excluirUpload`, `excluirUploadsLote`, `restaurarUpload`, `excluirUploadDefinitivo`, `solicitarExclusaoUpload`, `aprovarSolicitacaoExclusao`, `recusarSolicitacaoExclusao`, `gerarAceiteCliente`.

Nenhum outro módulo depende do contrato de payload dessas rotas além dos consumidores listados (todos internos ao próprio domínio de arquivos/coordenação/dwg).

## 5. Modelo de dados

Fonte: `prisma/schema.prisma` + `prisma/migrations/`.

### 5.1 Repositório principal de arquivo de disciplina

**`enum PacoteUpload`** `prisma/schema.prisma:4111-4116`: `A | B | OUTROS | RECEBIDOS` (cresceu depois da criação — nasceu só com `A|B|OUTROS`, `prisma/migrations/20260611201700_onda1c_uploads_pagamento/migration.sql:2`; `RECEBIDOS` veio depois).

**`model Upload`** → tabela `upload`, `schema.prisma:4118-4179`:
- `id`, `disciplinaId`+FK `:4120-4121`, `pacote PacoteUpload?` `:4125` (opcional — regra "pacote XOR pastaId" é de código, não constraint), `pastaId String?`+FK `:4127-4128`, `nomeArquivo` `:4129`, `caminho` (relativo a `STORAGE_BASE_PATH`) `:4131`, `hashSha256` `:4132`, `tamanho Int` `:4133`, `mimeType String?` `:4134`, **`versao Int @default(1)`** `:4135` (existe desde a criação da tabela), `origem OrigemUpload @default(manual)` `:4136`, `validado Boolean @default(false)` `:4138`, `validadoPorId/validadoEm` `:4139-4141`, `revisaoObs/revisaoEm/revisaoPorId` `:4144-4147` (metadado de rejeição do validador, **não** ponteiro de versão anterior), `autorId`+FK `:4149-4150`, `createdAt` `:4151`, `excluidoEm/excluidoPorId` `:4156-4157` (soft delete, na extensão global `lib/prisma.ts`), `documentoId String?`+FK `:4162-4163` (adicionado em `20260806120000_documento_disciplina`).
- Relações reversas: `aceite AceiteCliente?` `:4165`; `solicitacoesExclusao SolicitacaoExclusaoUpload[]` `:4166`; `pendencias Pendencia[]` `:4167`; `pendenciasVerificadas Pendencia[]` `:4168`; `calibracoes CalibracaoPrancha[]` `:4169`; `conversao ConversaoModelo?` `:4170`; `conversaoDesenho ConversaoDesenho?` `:4171`.
- Índices: `[disciplinaId,pacote]` `:4173`, `[pastaId]` `:4174`, `[autorId]` `:4175`, `[excluidoEm]` `:4176`, `[documentoId]` `:4177`.

**`model DocumentoDisciplina`** → tabela `documento_disciplina`, `:4228-4250` — "Documento LÓGICO: agrupa as versões (Upload) do mesmo arquivo sob um id estável" (`:4223-4227`). Criado em `20260806120000_documento_disciplina` com backfill retroativo agrupando por `(disciplinaId, pacote|pastaId, nomeArquivo)`.
- `id`, `disciplinaId`+FK `:4230-4231`, `chave` (chave de agrupamento normalizada, não identidade — `:4232-4237`), `nomeArquivo` `:4239`, `createdAt` `:4240`.
- Relações: `uploads Upload[]` `:4242`; `pendencias Pendencia[]` `:4243`; `calibracoes CalibracaoPrancha[]` `:4244`; `leituras LeituraDocumento[]` `:4245`.
- `@@unique([disciplinaId, chave])` `:4247`.

**`model PastaProjeto`** → tabela `pasta_projeto`, `:4256-4275` — árvore auto-referente por disciplina (`parentId`/`parent`/`filhos` `:4260-4262`), alternativa a `PacoteUpload` para projetos `aprovacao`/`laudo`. `origem String @default("custom")` (`"template"|"custom"`) `:4268`.

**`model SolicitacaoExclusaoUpload`** → `:4194-4221` — fluxo de pedido/decisão de exclusão (não-admin pede, admin decide), `status StatusSolicitacaoExclusao` (enum `:4182-4186`: `pendente|aprovada|recusada`).

### 5.2 Apontamentos/pendências (tarefa vinculada a arquivo com coordenada)

**`model Pendencia`** → tabela `pendencia`, `:4282-4407` — "Apontamento posicional sobre uma prancha PDF... amarra à VERSÃO do arquivo (uploadId)" (`:4277-4281`).
- `uploadId`+FK `:4284-4285` (única FK real da tabela); `disciplinaId`/`projetoId` **sem FK**, denormalizados `:4286-4287`; `numero Int` `:4288`; `pagina Int` `:4289`; **`x Float`/`y Float`** `:4291-4292` (âncora normalizada 0..1 relativa à página); `texto` `:4293`; `status String @default("aberta")` (string livre, valores documentados em comentário: `aberta|em_correcao|resolvida|fechada|descartada|adiado`, `:4294-4299`); `autorId`, `tarefaId`/`tarefaItemId` (escalares, sem FK) `:4300-4302`; `documentoId String?`+FK `:4312-4313` (âncora estável); `ancoraTexto/ancoraOffset/ancoraDx/ancoraDy` `:4323-4328` (âncora textual de fallback entre revisões, adicionado em `20260806160000_pendencia_ancora_textual`); `severidade`/`tipo`/`marcacaoTipo`/`marcacaoGeo Json?` `:4336-4349`; `excluidoEm/excluidoPorId` `:4391-4393` — **não** entra na extensão global de soft delete (comentário `:4387-4390`: numeração sequencial por documento precisa contar as excluídas).
- Satélites: `PendenciaAnexo` `:4498-4528` (anexo tipo `arquivo|link`, `momento` `antes|depois`), `PendenciaResposta` `:4530-4542` (thread, sem soft delete — "a thread É a trilha", `:4409-4412`), `ReferenciaPendencia` `:4452-4467` (pendência referenciando outra), `CalibracaoPrancha` `:4422-4444` (calibração de escala px→mm por página), `ApontamentoPadrao` `:4472-4491` (textos-padrão reutilizáveis por disciplina).

**`model ApontamentoCoordenacao`** → tabela `apontamento_coordenacao`, `:4654-4691` — "Espelha a Pendencia" (comentário `:4645`), mas para o viewer 3D: `projetoId`+FK real `:4656-4657` (diferente de `Pendencia.projetoId`, sem FK), `uploadId` **sem FK** (polimórfico: uploadId cru ou `d:<documentoVersaoId>`, `:4664`), `guids Json` (IfcGuids) `:4669`, `camera Json` `:4671`, `snapshotPath` `:4672`, `bcfGuid` `:4677`. Não tem tabelas-satélite equivalentes a `PendenciaAnexo`/`PendenciaResposta`.

### 5.3 Outros pares "documento + versão", por domínio (não reusados entre si)

- `Documento`/`DocumentoVersao` `:2558-2586`/`:2588-2610` — repositório "Geral" do projeto/cliente (absorveu o antigo `ArquivoProjeto`, migração `20260705120000_documentos_geral`, que fez `INSERT INTO documento SELECT ... FROM arquivo_projeto` e `DROP TABLE`). `OrigemDocumento` (enum `:2541-2550`: `recebido_cliente|interno|contrato|comercial|base_arquitetonica`), `CanalDocumento` (`:2552-2556`: `interno|portal|link`).
- `DocumentoJuridico`/`DocJuridicoVersao` `:2491-2510`/`:2633-2648`.
- `DocumentoLicitacao`/`DocLicitacaoVersao` `:2885-2895`/`:2897-2910`.
- `Certidao`/`CertidaoVersao` `:2696,2708` (referenciado; não lido em detalhe nesta auditoria).
- `Art`/`ArtVersao` `:4905-4945`/`:4948-4966` — ART/RRT/TRT.
- `DocumentoFinanceiro` `:1540-1562` e `FuncionarioDocumento` `:2614-2631` — documento único, **sem** tabela de versão irmã.
- `Prancha` `:3813-3829` — item de Lista Mestre, com `revisao Int @default(0)` próprio (contador da prancha, não do arquivo); `PranchaCatalogo`/`NomenclaturaConfig` `:3854-3867`/`:3840-3850` — catálogo/regex de nomenclatura por projeto.

### 5.4 Permissões e auditoria (modelos)

- `Permissao` (`role,recurso,acao,permitido`, matriz global) `:570-580`; `PerfilAcesso`/`PermissaoPerfil` (perfis nomeados) `:585-605`/`:609-620`; `PermissaoUsuario` (override pontual por usuário, com `expiraEm`/`motivo`) `:627-646`.
- `AuditLog` (`userId?,modulo,acao,tipo,resultado,entidade,entidadeId,detalhe Json?,ip,createdAt`) `:652-670`. `AcessoPagina` `:675-686` é log de page-view, não de mutação.

### 5.5 Respostas diretas às perguntas obrigatórias

- **Já existe revisão/versão?** Sim, em três mecanismos paralelos, nenhum com ponteiro `versaoAnterior`/self-reference: (1) `Upload.versao Int` incremental por linha; (2) pares explícitos pai/versão com `@@unique([xId,numero])` em 5 domínios diferentes (Documento, Jurídico, Licitação, Certidão, ART); (3) `DocumentoDisciplina` como agrupador lógico sem número de versão próprio — a ordem vem de `Upload.versao`/`createdAt` dos filhos. Nenhum campo `versaoAnterior`/`substituiId` existe em model algum (confirmado por grep de `[Vv]ersao|[Rr]evisao` no schema inteiro).
- **Já existe lista/tag/conjunto lógico?** **Não**, no domínio de arquivos. Os únicos `String[]` de todo o schema são `ReferenciaTecnica.tags` `:984` (biblioteca técnica) e `Lancamento.tags` `:1464` (financeiro) — fora do domínio. `LinkPublicoArquivos.disciplinaIds` `:1185` é whitelist de exposição de link público, não uma lista nomeada reutilizável. O único agrupamento existente é estrutural: `PastaProjeto` (árvore), `PacoteUpload` (enum fixo), `DocumentoDisciplina.chave` (chave de agrupamento, não lista nomeada).
- **Já existe tarefa/apontamento com coordenada (x,y,página)?** Sim — `Pendencia` (`pagina Int`, `x Float`, `y Float`, `:4289-4292`), com fallback textual e marcação vetorial. Análogo 3D: `ApontamentoCoordenacao` (guids+câmera, não página/x/y).

### 5.6 Duplicações/concorrências confirmadas

1. **Dois repositórios de arquivo de projeto paralelos**: `Upload`+`DocumentoDisciplina`+`PastaProjeto` (por disciplina) vs. `Documento`+`DocumentoVersao` (repositório "Geral"/cliente) — dois esquemas de versionamento e dois storages de metadado para o mesmo conceito.
2. **Cinco reimplementações do par "documento com versão"** por domínio (Documento, Jurídico, Licitação, Certidão, ART) — mesma forma, sem reuso.
3. **Duas árvores de pastas auto-referentes**: `PastaProjeto` vs. `PastaJuridica` `:2513-2525` — mesma forma estrutural, sem reuso.
4. **Duas tabelas de conversão de formato**, deliberadamente duplicadas: `ConversaoModelo` (IFC→Fragments) `:4583-4609` vs. `ConversaoDesenho` (DWG→DXF) `:4615-4641` — o próprio schema admite a duplicação como decisão consciente (comentário `:4611-4614`).
5. **Duas entidades de apontamento sobre arquivo**: `Pendencia` (2D) vs. `ApontamentoCoordenacao` (3D) — a segunda "espelha" a primeira por comentário explícito, mas sem as tabelas-satélite (anexo/resposta/referência) que a primeira tem.

## 6. Upload, download e storage

- **Multipart**: `FormData` nativo do Web API (`src/app/api/uploads/route.ts:40`), sem lib terceira.
- **Destino**: disco local via `STORAGE_BASE_PATH` — `src/lib/storage.ts:6-11` (`base()` lança se a env não estiver setada); `salvarArquivo`/`lerArquivo`/`removerArquivo` `storage.ts:49-85`.
- **Anti-traversal**: `resolverCaminho()` `storage.ts:14-22` — resolve caminho absoluto e recusa se sair de `base()`.
- **Convenção de path**, fonte única `src/modules/uploads/caminho.ts`: diretório `{ano}/{cliente}/{codigo}_{projeto}/{SIGLA-ou-nome}` (`caminho.ts:27-41`); arquivo físico `{SIGLA}-{slug(base)}[__v{n}].{ext}` (`caminho.ts:50-60`), montado em `route.ts:104-136`.
- **Limites de tamanho** (`src/modules/uploads/limites.ts`): `TAMANHO_MAX = 500MB` (`:5`, padrão), `TAMANHO_MAX_BACKUP = 1536MB` (`:11`, pacote B); roteado por `limiteDoPacote()` (`:15-17`); checado duas vezes (direto contra `file.size` `route.ts:282`; chunked contra o tamanho remontado real `route.ts:224,234-237`).
- **Tipos aceitos**: sem bloqueio por tipo — `EXT_PACOTE_A` (`service.ts:4-18`) só decide roteamento (pacote A vs OUTROS), não whitelist/blacklist; sem verificação de MIME real além do `file.type` do navegador (`route.ts:287`).
- **Chunking** (`src/lib/upload-chunks.ts`, backend; `src/lib/upload-grande.ts`, frontend): acima de `LIMITE_ENVIO_DIRETO=70MB` (`upload-grande.ts:13`) fatia em `TAM_CHUNK=45MB` (`:15`) via XHR sequencial para `/api/uploads/chunk`, contorna teto de ~100MB do Cloudflare Tunnel. Backend remonta por streaming com hash SHA-256 incremental (`upload-chunks.ts:57-89`); `MAX_CHUNKS=200` (`:35`); limpeza de sessões órfãs por cron (`limparChunksOrfaos`, `:104-142`).
- **Fila assíncrona (pg-boss)**: só para conversão de modelo, não para o upload em si. IFC→Fragments via `enfileirarConversao()` (`src/modules/coordenacao/service.ts:65`, fire-and-forget em `route.ts:173-176`; se `boss` for `null` sob `npm run dev`, retorna `{enfileirado:false, motivo:"sem_worker"}` sem falhar o upload). DWG→DXF, mesmo padrão via `enfileirarConversaoDwg()` (`src/modules/dwg/service.ts:63-66`, chamado em `route.ts:180-183`).
- **Thumbnail/preview**: **NÃO ENCONTRADO** para arquivos de `Upload` (pranchas/DWG/PDF/IFC). `sharp` só é usado para avatar e imagem de Aviso. A única "miniatura" ligada a arquivo é `Pendencia.thumbPath` (entidade distinta de `Upload`). PDF é visualizado client-side via pdf.js contra a rota de download `?disposition=inline` — sem derivado gerado no servidor.

## 7. Visualizadores

| Formato | Componente | Lib externa | Zoom/pan | Markup/medição hoje |
|---|---|---|---|---|
| PDF (edição/pins) | `pdf-viewer.tsx` + `pdf-pagina.tsx` | `pdfjs-dist`, import dinâmico (`pdf-viewer.tsx:495-497`); render em `pdf-pagina.tsx:129,210`, `TextLayer:175` | Sim — botão/Ctrl+scroll (`:341-345,530-541`), pinça, pan por arraste (`:1143-1170`) | **Sim** — pinos+forma (ponto/retângulo/seta/nuvem/medida via `modules/projetos/pendencias/marcacao.ts`), atalhos 1-5, medição com calibração escala/2-pontos (`modules/.../medicao.ts`) |
| PDF (somente leitura) | `documento-viewer.tsx` | mesma lib | zoom/Ctrl+scroll (`:32-39,86-93`), pinça; **sem** pan por arraste (`:38`) | Não — "sem camada de apontamentos/pinos" (`:20-21`) |
| DWG (convertido p/ DXF) | `dwg-viewer.tsx` | `dxf-parser`, import dinâmico (`:153`); canvas 2D nativo (`desenharCena()`, `:33-94`) | Sim — pan por pointer drag (`:214-230`), zoom por wheel com pivot (`modules/dwg/viewer/canvas-render.ts`); camadas toggle (`:255-264`) | **Não** — nenhuma ferramenta de anotação/medição |
| IFC / modelo 3D | `viewer-3d.tsx` → `modules/coordenacao/viewer/engine.ts` | `three` (`:16`), `camera-controls` (`:17`), `@thatopen/fragments` (`FragmentsModels`, `:18-25`) | Sim — `CameraControls` (dolly/truck/rotate), `dollyToCursor=true` (`:208`) | **Sim** — markup 2D (seta/círculo/texto, `markup-editor.tsx`+`modules/coordenacao/markup.ts`) e medição 3D (`medicao-toolbar.tsx`+`modules/coordenacao/medicao.ts`) |
| Imagem (png/jpg) | **nenhum** | — | — | Não — `arquivos-explorer.tsx:314-318` renderiza só `<span>` com o nome, download-only (`:365-367`); link público (`arquivos-publico-view.tsx:66-94`) só oferece preview quando `a.ehPdf`, imagem cai em `Download` |

Assimetria: PDF e IFC têm markup+medição; DWG só pan/zoom/camadas; imagem não tem visor nenhum em nenhuma superfície auditada (logada, pública ou `/arquivos`).

Duas rotas divergem no visor que usam para PDF: a aba do projeto abre `/visualizar` (`PdfViewer`, com pinos); `/arquivos` (`DiretorioView`) abre o PDF cru via link `?disposition=inline` (`diretorio-view.tsx:59,256`) — sem pinos.

## 8. Versionamento existente

Mecanismo central do módulo, via `Upload.versao` (`prisma/schema.prisma:4135`, default 1).

- **Trigger**: ao persistir novo arquivo, busca o `Upload` mais recente com a mesma chave lógica — `{disciplinaId, pastaId, nomeArquivo}` (modo pasta) ou `{disciplinaId, pacote, nomeArquivo}` (modo pacote) — e usa `anterior.versao + 1` (`src/app/api/uploads/route.ts:124-130`).
- **O que é preservado**: o arquivo físico anterior não é apagado nem sobrescrito — nome físico embute `__v{n}` para `n>1` (`caminho.ts:59`); a linha `Upload` antiga permanece intacta no banco.
- **O que é reagrupado**: `DocumentoDisciplina` amarra as versões via `upsert` em `(disciplinaId, chave)` (`route.ts:143-153`, `chaveDocumento` em `src/modules/uploads/documento.ts:29-32`); cada nova versão herda o mesmo `documentoId`.
- **O que reseta por versão**: `validado` sempre nasce `false` — a nova versão volta a ser pendente de validação, via `entregaveisAtuais()` (`src/modules/uploads/validacao.ts:20-30`), que reduz à maior `versao` por `(pacote,nomeArquivo)` antes de calcular `statusValidacao` (`:42-56`).
- **Histórico**: `revisoesDoDocumento()` (`src/modules/uploads/queries.ts:186-193`) lista todas as versões de um `documentoId`, inclusive as na lixeira (bypass intencional do filtro global) — alimenta o comparador.
- **Risco de colisão física silenciosa**: `versao` é calculado por `nomeArquivo` exato (`route.ts:124-129`), mas o nome físico vem de `slug(base)` (`caminho.ts:56-58`), e `salvarArquivo()` é `fs.writeFile` sem checar existência (`storage.ts:49-55`). Nomes lógicos distintos que colapsam no mesmo slug (símbolos removidos por `slug()`, `storage.ts:25-34`, ou diferença de maiúsculas — relevante porque o deploy é nativo Windows/NTFS, case-insensitive) geram `documentoId` diferentes mas **o mesmo caminho físico**: o segundo upload sobrescreve o primeiro sem erro, com as duas linhas `Upload` continuando a existir.

## 9. Análise de pranchas / nomenclatura

Existe: `src/modules/projetos/pranchas/codigo.ts`.

- `parsePranchaFilename(filename)` (`codigo.ts:54-72`) — regex `^([A-Za-z0-9]+)-([A-Za-z0-9]+)-([A-Za-z]+)-(\d{1,6})-(?!RV?\d+$)([A-Za-z0-9]+)(?:-RV?(\d+))?$` sobre o nome sem extensão, extrai `codigoProjeto`, `especialidade` (sigla), `fase`, `numeracao`, `tipo`, `revisao` — formato `{projeto}-{sigla}-{fase}-{numeracao4}-{tipo}[-Rnn|-RVnn]`.
- `foraDoPadrao(nome, padrao?)` (`codigo.ts:29-39`) — usa regex custom por projeto (`NomenclaturaConfig.padrao`) ou cai no parser embutido; regex inválido não bloqueia.
- `codigoPrancha()`/`revisaoLabel()` (`codigo.ts:6-22`) — compõem o código para exibição.
- **Uso real**: só client-side — `arquivos-explorer.tsx:958` (badge de alerta) e `:2152` (aviso no upload, condicionado a `NomenclaturaConfig.exigir`), e no import da Lista Mestre (`src/modules/projetos/pranchas/queries.ts:125`, `proporPranchasImport`, descarta para `semPadrao[]`).
- **`src/app/api/uploads/route.ts` não chama `parsePranchaFilename`/`foraDoPadrao` em nenhum ponto** — a validação de nomenclatura é aviso de UI apenas; um POST direto ao endpoint persiste qualquer nome sem checagem de padrão no servidor.

## 10. Permissões

Duas fontes coexistem, com granularidade desigual.

**a) Catálogo fino** (`src/lib/permissions-catalog.ts`), separado por ação:
- `recurso:"arquivos"` (`:68-81`): `ver` (Diretório), `baixar`, `ver_todas_disciplinas` (muralha por disciplina), `enviar` — checados via `src/modules/arquivos/acesso.ts` (`podeVerDiretorio`, `podeBaixarArquivo`, `podeEnviarArquivo`, `podeVerTodasDisciplinas`).
- `recurso:"uploads"` (`:55-59`): só `validar` — usado em `validarEntrega`, `validarArquivo`, `reverterValidacaoArquivo`, `solicitarAjusteArquivo`, `validarArquivosLote`, `gerarAceiteCliente` (`actions.ts:224-232,269,307,321,364-370,1041-1048`).
- POST direto (`route.ts:78-93`): gate duplo — hard-coded ("responsável da disciplina OU perfil global", `:78-85`) + capability `arquivos:enviar` para não-globais (`:88-93`).
- Download (`[id]/download/route.ts:31-55`): combina participação no projeto + muralha por disciplina + capability `arquivos:baixar`, em duas checagens separadas (`:47-48`, `:53-55`).

**b) Gate hard-coded, fora do catálogo** — todas as ações de exclusão/restauração/rename usam `recurso:"projetos", permissao:"ver"` (permissão de LEITURA) no `defineAction`, com a autorização real dentro do handler:
- `excluirUpload`, `excluirUploadsLote`, `restaurarUpload`, `excluirUploadDefinitivo`, `aprovarSolicitacaoExclusao`, `recusarSolicitacaoExclusao` — todas chamam `exigirAdmin(user.role)` (`actions.ts:538-542`, `if (role !== "admin") throw`, fixo no código, não na matriz `Permissao`).
- `renomearUpload` (`actions.ts:441-531`) — mesmo padrão: `recurso:"projetos", permissao:"ver"` no `defineAction:446`, checagem real manual `ehGlobal || ehResp` (`:468-470`).
- `solicitarExclusaoUpload` (`actions.ts:808-889`) — inverso: recusa se `role==="admin"` (`:819-821`), escopo manual via `projetoVisivel` + `podeVerTodasDisciplinas`/responsável (`:843-846`).

Granularidade por ação, resumo: visualizar/baixar/enviar/ver_todas_disciplinas = checks separados (catálogo `arquivos`); validar = check separado (catálogo `uploads:validar`); excluir/restaurar/decidir-exclusão = um único gate hard-coded ("é admin?"), não catalogado; renomear = um único gate hard-coded ("é global ou responsável?"), não catalogado.

## 11. Auditoria/log

**Automática via `defineAction`** (`src/lib/with-action.ts:97-135`): toda action grava `AuditLog` com `userId, modulo, acao, resultado (sucesso|bloqueado|falha|rejeitado), entidade, entidadeId, detalhe, ip`. Com `capturarAntes`, `detalhe = {antes, novo: input}` (`:99,118`); falha da auditoria não reverte a ação, só loga no console (`:121-123`). Campos sensíveis redigidos por `sanitize()` (`src/lib/audit.ts:9-35`) — não se aplica na prática a uploads.

`renomearUpload` audita com `entidadeId=disciplinaId` (`actions.ts:449`), `capturarAntes` retorna o `nomeArquivo` anterior (`:450-451`).

**Log manual adicional** (rotas REST não passam por `defineAction`, chamam `logAudit()` direto):
- `POST /api/uploads`: um `logAudit` por request, `acao:"enviar-arquivos"`, `detalhe:{pacote,total,ok,chunked?}` (`route.ts:253-262,295-304`).
- `GET /api/uploads/[id]/download`: `acao:"download-arquivo"` por download (`[id]/download/route.ts:64-72`).
- `GET /api/uploads/zip` e `/disciplina/[id]/zip`: `acao:"download-zip-selecao"`/`"download-zip"` (`zip/route.ts:87-95`, `disciplina/[disciplinaId]/zip/route.ts:49-57`).
- Rotas públicas (`/api/p/arquivos/**`): `logAudit` com `userId` ausente (opcional em `AuditInput`, `audit.ts:45`) — log fica só com `ip`+`token` no `detalhe` (`[token]/[uploadId]/route.ts:24-32`, etc).
- **Sem log**: `POST /api/uploads/chunk` não chama `logAudit` em nenhum ponto — só a requisição que finaliza a montagem audita o resultado consolidado.

## 12. Design system

- Estilo shadcn configurado como **`base-nova`** (base-ui, não Radix) — `components.json:3`. `baseColor:"neutral"`, prefixo Tailwind vazio, CSS var-driven (`components.json:6-12`).
- Componentes base disponíveis em `src/components/ui/` (27 arquivos): `button.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `select.tsx`, `table.tsx`, `tabs.tsx`, `tooltip.tsx`, `popover.tsx`, `badge.tsx`, `status-badge.tsx`, `checkbox.tsx`, `switch.tsx`, `card.tsx`, `skeleton.tsx`, `empty-state.tsx`, `confirm-dialog.tsx`, `sortable-head.tsx`, `pagination.tsx`, `input.tsx`, `label.tsx`, `avatar.tsx`, `separator.tsx`, `scroll-area.tsx`, `sonner.tsx` (toast), `sparkline.tsx`, `logo-loader.tsx`.
- **Uso hoje no módulo de arquivos**: `Button`, `Dialog`, `Select`, `Badge`, `Checkbox`, `EmptyState`, `useConfirm` (de `confirm-dialog.tsx`) aparecem em praticamente todo componente listado na §3. `Table` só aparece em `conversao-status-view.tsx:18` (Coordenação) — `arquivos-explorer.tsx`, `diretorio-view.tsx` e `pendencias-consolidado-view.tsx` usam `<div>`/`<ul>` custom em vez do componente `Table`. `Tooltip`/`Popover`/`Switch` só aparecem em `viewer-toolbar.tsx` (viewer 3D). `Tabs` só em `comparador-revisoes.tsx:8`. **`Sheet` e `DropdownMenu` não aparecem em nenhum arquivo lido nesta auditoria** — existem no design system mas não são usados hoje no módulo de arquivos.
- **Tokens de cor** (`src/app/globals.css`, tema claro `:75-104` / escuro `:130-152`): paleta shadcn padrão (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--card`, `--popover`) mais extensões próprias — `--success`/`--warning`/`--info` (com `-foreground`, `:42-47`) e **`--status-aguardando`/`--status-andamento`/`--status-revisao`/`--status-entregue`/`--status-aprovado`** (`:49-53,94-98,148-152`) expostas como `--color-status-*` (`:49-53`) — usadas hoje para `StatusDisciplina`, candidatas naturais a mapear também `Documento.status` se a spec introduzir status documentais.
- **Tipografia**: `--font-sans`/`--font-heading` = `var(--font-schibsted-grotesk)` (`:10,12`), `--font-mono` = `var(--font-red-hat-mono)` (`:11`).
- **Border-radius**: base `--radius: 0.125rem` (`:104`), escala derivada `--radius-sm..4xl` como múltiplos de `--radius` (`:54-59`) — radius é deliberadamente pequeno/quadrado (0.125rem = 2px na base), não o padrão shadcn de 0.5rem+.
- **Como um novo painel lateral deveria ser construído**: usar `Sheet` (já no design system, hoje sem uso no módulo — candidato natural para painel contextual esquerdo/direito da spec) combinado com os tokens acima; seguir o padrão já usado em `CoordenacaoView`/`viewer-3d.tsx` para o padrão "workspace com painéis recolhíveis + `next/dynamic({ssr:false})`" caso o novo painel dependa de lib pesada.

## 13. Padrões de dados no front

- **Sem SWR/React Query**: `package.json` não lista `swr`, `react-query` nem `@tanstack/*`. Padrão dominante é **Server Actions + `useState`/`useTransition`** — ex. `pdf-viewer.tsx:404` (`const [pending, start] = useTransition()`), replicado na maioria dos componentes client do módulo.
- **Debounce**: único achado, `pdf-viewer.tsx:429-444` — sugestão de reincidência dispara `setTimeout(...,500)` (`:439`) só no formulário de criação de pendência, condicionado a texto ≥10 chars.
- **Polling**: `visualizar-dwg-button.tsx:19,41-57` — `setInterval(carregar, POLL_MS)` com `POLL_MS=2500` (`:19`), consultando status de conversão enquanto `fila`/`processando`.
- **Filtro client-side sem debounce**: `diretorio-view.tsx:70-93` — `useMemo` recalcula a cada tecla (`onChange` direto, `:102`), sem round-trip ao servidor.
- **Paginação**: não encontrada no módulo — nenhuma chamada a `parseListParams`/`useSetParams` (`lib/list-params.ts`) nos componentes de arquivos/pendências/coordenação lidos.
- **Virtualização**: não encontrada — nenhum `react-window`/`react-virtual` importado.
- **Skeleton/loading**: não há `loading.tsx` em nenhuma das rotas auditadas. Único uso de `Skeleton` é o fallback do `next/dynamic` do viewer 3D (`coordenacao-view.tsx:47,54`). Demais componentes usam spinner inline condicional (`Loader2`) — ex. `documento-viewer.tsx:145-148`, `dwg-viewer.tsx:289-293`.

## 14. Dívidas e riscos observados

1. **Zip routes não aplicam as mesmas capabilities do download individual** — `GET /api/uploads/zip` (`zip/route.ts:62-82`) e `GET /api/uploads/disciplina/[disciplinaId]/zip` (`disciplina/[disciplinaId]/zip/route.ts:30-44`) checam só `acessoGlobal`/membro-do-projeto/responsável, **sem** `podeVerTodasDisciplinas()` nem `podeBaixarArquivo()` (que `[id]/download/route.ts:47-55` aplica) — furando a "muralha entre disciplinas" que `src/modules/arquivos/acesso.ts:1-9` diz ser o propósito do recurso `arquivos`.
2. **Permissão de exclusão/rename não catalogada** (§10b) — gate hard-coded (`role==="admin"`) dentro do handler, divergente do padrão de permissão fina do resto do sistema.
3. **`excluirUploadDefinitivo` vaza `.dxf` de conversão DWG** — remove `upload.conversao?.caminhoFrag` (IFC) mas não `conversaoDesenho?.caminhoDxf` (`actions.ts:709-729`), diferente do job de purga automática (`purgarLixeiraArquivos`, `src/lib/jobs-handlers.ts:1263-1288`) que trata os dois; o `.dxf` fica órfão em disco pois a linha `ConversaoDesenho` já foi deletada por cascata.
4. **Gap na checagem de lixeira**: `carregarUploadEditavel()` (`actions.ts:235-260`, usada por `validarArquivo`/`reverterValidacaoArquivo`/`solicitarAjusteArquivo`) usa `findUnique` (fora da extensão global de soft delete) e não checa `excluidoEm` — um arquivo já na lixeira pode ser validado/ajustado via essas 3 actions.
5. **Dois caminhos de escrita paralelos em `Upload`**: `src/app/api/uploads/route.ts:143-169` sempre popula `documentoId`; `src/modules/ferramentas/auto-store.ts:47-84` (`salvarUpload`, chamado por `autoStore()`) cria `Upload` com `origem:"ferramenta"` mas nunca popula `documentoId` — qualquer leitura por `documentoId` (histórico de revisões, pendências por documento) não vê arquivos gerados por ferramentas.
6. **Colisão física silenciosa por `slug()`** (§8) — sem checagem de existência em `salvarArquivo`, nomes lógicos distintos podem colapsar no mesmo caminho físico (símbolos removidos, ou case-diferença em NTFS/Windows) e se sobrescrever sem erro nem aviso.
7. **Sem whitelist/blacklist de tipo de arquivo** — qualquer extensão é aceita; sem scan antivírus; sem validação de MIME real além do `file.type` enviado pelo cliente.
8. **Nomenclatura da Lista Mestre não é aplicada no servidor** (§9) — só aviso client-side; POST direto ignora `foraDoPadrao`/`parsePranchaFilename`.
9. **Sem teste para `actions.ts`** (1068 linhas — validação de entrega, liberação de pagamento, exclusão/lixeira, rename, aceite digital) nem para nenhuma rota em `src/app/api/uploads/**`/`src/app/api/p/arquivos/**`. Testes existentes cobrem só funções puras (`caminho.test.ts`, `documento.test.ts`, `lixeira.test.ts`, `service.test.ts`, `validacao.test.ts`) — orquestração I/O + lógica de permissão fica sem cobertura automatizada.
10. **`/api/uploads/chunk` sem log de auditoria**, e downloads via link público sem `userId` no log — rastreabilidade do lado público limitada a IP+token.
11. **Cinco reimplementações não-reusadas do par "documento+versão"** e **duas árvores de pasta paralelas** (§5.6) — risco de qualquer refatoração tocar só um dos cinco domínios e deixar os outros quatro divergentes.
12. **Ausência de visor de imagem** e **assimetria de markup/medição entre PDF/IFC (têm) e DWG (não tem)** (§7) — se a spec exige badges de extensão com ação apropriada por tipo, hoje só PDF e IFC atendem ao nível "visualizar com anotação".
13. **`Table` do design system subutilizada** no próprio módulo (§12) — `arquivos-explorer.tsx`/`diretorio-view.tsx`/`pendencias-consolidado-view.tsx` usam markup custom em vez do componente padrão, o que pode indicar que a tabela padrão não atende hoje à densidade/funcionalidade que essas telas precisam (colunas fixas, seleção, menu de contexto por linha).

## 15. Perguntas em aberto

- Qual dos dois repositórios paralelos (`Upload`/`DocumentoDisciplina` por disciplina vs. `Documento`/`DocumentoVersao` "Geral") deve virar a base do novo conceito de "Documento de engenharia" da spec — ou os dois devem convergir? Não dá para decidir só lendo o código.
- A colisão física silenciosa por `slug()` (§8, achado 6) é um risco conhecido/aceito pela equipe, ou passou despercebido? Afeta diretamente a confiabilidade de qualquer novo mecanismo de revisão.
- O gate hard-coded de exclusão/rename (`role==="admin"` fixo no handler, §10b) é intencional (trava de segurança deliberadamente fora da matriz editável) ou dívida a corrigir na refatoração?
- `DocumentoDisciplina` (ago/2026) é recente o suficiente para não ter volume de dados relevante ainda — vale confirmar com o time se há uploads pré-migração cujo `documentoId` ficou nulo/incorreto no backfill, antes de basear a nova revisão nele.
- Existe algum uso real do `PastaProjeto` fora dos tipos de projeto `aprovacao`/`laudo`? A tabela existe e tem uploads relacionados, mas não foi confirmado o volume/adoção real por tipo de projeto.
- O `Table` do design system foi deliberadamente descartado nas telas de arquivo por limitação técnica (densidade, seleção múltipla, menu de contexto), ou é só uma escolha histórica que pode ser revisitada?
