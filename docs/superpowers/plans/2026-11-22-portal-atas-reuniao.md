# Atas de reunião no portal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (escolha do dono: implementação direta, sem subagentes) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coordenação importa as anotações do Gemini, revisa decisões/tarefas, publica a ata no portal; o cliente confirma ou pede correção (versão nova); tarefas da equipe viram Tarefas, pendências do cliente ficam no portal com "Feito → conferida/reaberta"; decisões entram na lista "Decisões"; ata publicada por engano pode ser retirada.

**Architecture:** Módulo novo `src/modules/portal/atas/`: puros (`regras.ts`, `leitura-gemini.ts`, `docx.ts`, `sincronizar.ts`, `decisoes.ts`, `acoes.ts`), `service.ts` único escritor das tabelas novas e das Tarefas que a ata cria, `queries.ts` por lado, `actions.ts`, `avisos.ts`. Arquivos (anotações e transcrição) por rota multipart interna. Telas: seção na aba Cliente + página do editor da ata; cards no portal.

**Tech Stack:** Next.js 15 (RSC + Server Actions), Prisma 7 (PostgreSQL 17), Zod, `fflate` (já no projeto) para o .docx, `react-markdown` (já no projeto) para o texto da ata, vitest (node), smokes em `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md`

## Global Constraints

- UI, mensagens e commits em pt-BR; identificadores do domínio em pt-BR como os vizinhos.
- Commits semânticos pt-BR, terminando com `Co-Authored-By: <seu modelo> <noreply@anthropic.com>`. **Stage só arquivos seus, por caminho.** Arquivos do dono que NÃO entram inteiros em commit: `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx` (não se edita), `src/lib/permissao-efetiva.ts`, `src/lib/permissao-efetiva.test.ts`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno.ts`, `src/lib/so-interno.test.ts`. Edição neles = staging parcial (`git update-index --cacheinfo 100644,$(git hash-object -w --no-filters <arquivo-HEAD+sua-parte>),<caminho>`).
- **Schema:** editar com âncora única (Edit ou script com `assert count == 1`), nunca `sed` global. Migração: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/20261123120000_atas_reuniao/migration.sql`; **ler o SQL inteiro** (só objetos novos) → `npx prisma migrate deploy` → `npm run db:generate`. Nunca `migrate dev`/`prisma format`.
- vitest só pelo PowerShell. Nunca `next build` com `next dev` desta pasta rodando.
- Dentro de `$transaction`: sem `Promise.all`, sem `select`/`include` aninhado — leituras planas, em sequência.
- Só `atas/service.ts` escreve `ReuniaoProjeto`, `AtaVersao`, `AtaItem`, `PendenciaCliente`, `ArquivoAta`, e as Tarefas criadas/atualizadas/arquivadas pela ata.
- Versão publicada nunca muda (texto e itens); toda troca de estado é `updateMany` condicionado ao estado lido.
- Limites (após `trim`): título da reunião 1–120; texto da ata 0–20000; título do item 1–200; descrição do item 0–2000; observação do cliente 1–2000 (obrigatória em "Tenho observações"); comentário do "Feito" 0–1000; motivo de reabrir 1–500; motivo de retirar 1–500. Arquivos: `.docx`, `.md`, `.txt`, até 20 MB cada.
- Equipe = `podeVerConversaDoProjeto` (`portal/mensagens/service.ts`) + `interno: true`; recusa `MOTIVO_NAO_ENCONTRADA = "Ata não encontrada."`. Cliente = `contaPodeVerConversa`; recusas "Ata não encontrada." / "Pendência não encontrada.".
- O cliente NUNCA recebe: rascunho, reunião retirada, arquivos, nomes internos (publicou/conferiu/reabriu/retirou → "a coordenação"), responsável/descrição/situação da Tarefa (vê título, prazo e "a cargo da equipe").
- Avisos depois do commit, nunca derrubam a escrita. Cliente: sino sem categoria + e-mail `portal-ata-reuniao` (sem opt-out) na publicação; sino na reabertura. Equipe: categoria `ata_reuniao` (`notif_ata_reuniao`).
- Prazos são dia (`@db.Date`), dia de São Paulo (`lib/data.ts`); "atrasada" = prazo < `diaDeSaoPaulo()` e situação aberta/reaberta.
- Texto da ata renderizado com `react-markdown` sem HTML (`skipHtml`), links como texto.
- Tela nova: 390×844 sem rolagem lateral; `CabecalhoPagina` primeiro na página nova do editor.

## Review Focus

- Versão 2 publicada com um item removido e outro alterado depois que alguém editou a Tarefa à mão no quadro: a removida é arquivada, a alterada só recebe os campos que a ata mudou, nenhuma Tarefa nova duplicada. Teste: `sincronizar.test.ts` (Task 3) + smoke (Task 4).
- Cliente responde à versão 1 enquanto a coordenação publica a versão 2: a resposta é recusada ("Esta versão foi substituída…") ou vale só para a 1; nunca vale para a 2. Teste: smoke (Task 4).
- Ata colada num formato que o leitor não reconhece (texto livre, e-mail encaminhado): tudo vai para o texto, nenhum item, nenhum erro. Teste: `leitura-gemini.test.ts` (Task 2).
- Conta de OUTRO cliente / cliente inativo / projetista com `reuniaoId`/`pendenciaId` válido: recusa uniforme, nada vaza; reunião retirada some do portal e das Decisões. Teste: smoke (Task 4, 5).
- Duas contas do cliente marcando "Feito" ao mesmo tempo, ou "Feito" × "Reabrir": um vence, o outro recebe a frase do estado. Teste: smoke (Task 4).

---

### Task 1: Tabelas e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (enums + models + inversas `Projeto.reunioesProjeto ReuniaoProjeto[]`, `Tarefa.ataItens AtaItem[]` se usar relação — ver abaixo)
- Create: `prisma/migrations/20261123120000_atas_reuniao/migration.sql`
- Create: `src/modules/portal/atas/regras.ts`; Test: `src/modules/portal/atas/regras.test.ts`

**Interfaces:**
- Produces (schema):
  ```prisma
  enum EstadoAtaVersao { rascunho publicada substituida }
  enum RespostaAta { concorda observacoes }
  enum TipoItemAta { decisao tarefa_equipe pendencia_cliente }
  enum SituacaoPendenciaCliente { aberta aguardando_conferencia conferida reaberta cancelada }
  enum TipoArquivoAta { anotacoes transcricao }
  model ReuniaoProjeto {            // @@map("reuniao_projeto"), @@index([projetoId, data])
    id; projetoId (FK Projeto Cascade); titulo String; data DateTime @db.Date
    criadaPorId String; criadaEm DateTime @default(now())
    retiradaEm DateTime?; retiradaPorId String?; retiradaPorNome String?; motivoRetirada String?
  }
  model AtaVersao {                 // @@map("ata_versao"), @@unique([reuniaoId, numero]), @@index([reuniaoId, estado])
    id; reuniaoId (FK Cascade); numero Int; estado EstadoAtaVersao @default(rascunho)
    texto String @db.Text
    publicadaEm DateTime?; publicadaPorId String?; publicadaPorNome String?
    resposta RespostaAta?; observacao String? @db.Text
    respondidaPorId String?; respondidaPorNome String?; respondidaEm DateTime?
    criadaEm DateTime @default(now())
  }
  model AtaItem {                   // @@map("ata_item"), @@index([versaoId]), @@index([chave])
    id; versaoId (FK AtaVersao Cascade); chave String   // estável entre versões (cuid da 1ª aparição)
    tipo TipoItemAta; titulo String; descricao String? @db.Text
    responsavelId String?           // tarefa_equipe
    prazo DateTime? @db.Date; ordem Int
  }
  model PendenciaCliente {          // @@map("pendencia_cliente"), @@unique([chave]), @@index([reuniaoId]), @@index([projetoId, situacao])
    id; reuniaoId (FK ReuniaoProjeto Cascade); projetoId String; chave String
    titulo String; descricao String? @db.Text; prazo DateTime? @db.Date
    situacao SituacaoPendenciaCliente @default(aberta)
    feitaEm DateTime?; feitaPorId String?; feitaPorNome String?; comentarioFeito String?
    conferidaEm DateTime?; conferidaPorId String?
    reabertaEm DateTime?; reabertaPorId String?; motivoReabertura String?
    canceladaEm DateTime?
    criadaEm DateTime @default(now())
  }
  model TarefaDaAta {               // @@map("tarefa_da_ata"), @@unique([chave]), @@unique([tarefaId])
    id; reuniaoId (FK ReuniaoProjeto Cascade); chave String; tarefaId String   // texto, sem relação (Tarefa pesa no tsc)
  }
  model ArquivoAta {                // @@map("arquivo_ata"), @@index([reuniaoId])
    id; reuniaoId (FK ReuniaoProjeto Cascade); tipo TipoArquivoAta
    caminho String; nome String; tamanho Int; enviadoPorId String; criadoEm DateTime @default(now())
  }
  ```
  No fim do SQL, à mão: `CREATE UNIQUE INDEX "ata_versao_um_rascunho" ON "ata_versao" ("reuniaoId") WHERE "estado" = 'rascunho';` e `CREATE UNIQUE INDEX "ata_versao_uma_publicada" ON "ata_versao" ("reuniaoId") WHERE "estado" = 'publicada';`
- Produces (`regras.ts`, puro): constantes dos limites; motivos `MOTIVO_NAO_ENCONTRADA = "Ata não encontrada."`, `MOTIVO_PENDENCIA_NAO_ENCONTRADA = "Pendência não encontrada."`, `MOTIVO_JA_RESPONDIDA = "Esta versão já foi respondida."`, `MOTIVO_SUBSTITUIDA = "Esta versão foi substituída por uma mais nova. Recarregue a página."`, `MOTIVO_RETIRADA = "Esta ata foi retirada."`, `MOTIVO_SEM_RASCUNHO = "Não há rascunho para publicar."`, `MOTIVO_JA_TEM_RASCUNHO = "Já existe um rascunho desta ata."`, `MOTIVO_SEM_CONTEUDO = "Escreva o texto da ata ou inclua ao menos um item."`, `MOTIVO_SEM_RESPONSAVEL = "Escolha o responsável de cada tarefa da equipe."`, `MOTIVO_RESPONSAVEL_FORA = "O responsável precisa ser membro do projeto."`, `MOTIVO_OBSERVACAO = "Escreva a sua observação."`, `MOTIVO_PENDENCIA_ESTADO: Record<SituacaoPendencia, string>` (frase por situação atual para "Feito"/"Conferir"/"Reabrir" recusados), `MOTIVO_TIPO_ARQUIVO = "Anexe as anotações em .docx, .md ou .txt."`. Rótulos `ROTULO_SITUACAO_PENDENCIA`, `ROTULO_RESPOSTA_ATA` (`"Li e concordo"`, `"Tenho observações"`), `ROTULO_COORDENACAO = "a coordenação"`.
  ```ts
  export type SituacaoPendencia = "aberta" | "aguardando_conferencia" | "conferida" | "reaberta" | "cancelada";
  export type OperacaoPendencia = "feito" | "conferir" | "reabrir";
  export function motivoParaPendencia(op: OperacaoPendencia, s: SituacaoPendencia): string | null; // feito: aberta|reaberta; conferir/reabrir: aguardando_conferencia
  export function pendenciaAtrasada(p: { situacao: SituacaoPendencia; prazo: string | null }, hoje: string): boolean;
  export type ItemRascunho = { chave: string; tipo: "decisao" | "tarefa_equipe" | "pendencia_cliente"; titulo: string; descricao: string | null; responsavelId: string | null; prazo: string | null };
  export function motivoParaPublicar(p: { texto: string; itens: ItemRascunho[]; membros: ReadonlySet<string> }): string | null;
  export function motivoParaResponder(v: { estado: "rascunho" | "publicada" | "substituida"; resposta: string | null; retirada: boolean }): string | null;
  ```

- [ ] **Step 1: Testes que falham** (`regras.test.ts`): `"feito só de aberta ou reaberta"`, `"conferir e reabrir só de aguardando conferência"`, `"cancelada não aceita nada"`, `"atrasada só aberta/reaberta com prazo antes de hoje"` (prazo `"2026-11-21"`, hoje `"2026-11-22"` → true; mesma data → false; conferida → false), `"publicar sem texto nem item recusa"`, `"tarefa da equipe sem responsável recusa"`, `"responsável fora dos membros recusa"`, `"título de item vazio recusa"`, `"responder: substituída, já respondida e retirada recusam com a frase certa"`.
- [ ] **Step 2:** `npx vitest run src/modules/portal/atas` → FAIL.
- [ ] **Step 3:** schema, migração (ler o SQL), `regras.ts`; `migrate deploy` + `db:generate`.
- [ ] **Step 4:** vitest → PASS.
- [ ] **Step 5:** commit `feat(portal): tabelas e regras das atas de reunião`.

### Task 2: Leitura das anotações do Gemini

**Files:**
- Create: `src/modules/portal/atas/leitura-gemini.ts`, `src/modules/portal/atas/docx.ts`; Tests: `leitura-gemini.test.ts`, `docx.test.ts`
- Create: `src/modules/portal/atas/__amostras__/formato-novo.md`, `formato-novo.txt`, `formato-antigo.txt` — amostras **sintéticas** no formato das do dono (nomes e conteúdo inventados: nunca copiar as reuniões reais), e o `.docx` gerado no próprio teste com `fflate.zipSync` a partir de um `word/document.xml` mínimo.

**Interfaces:**
- Produces:
  ```ts
  // leitura-gemini.ts (puro)
  export type EtapaLida = { responsavelBruto: string | null; titulo: string; descricao: string | null };
  export type AnotacoesLidas = { titulo: string | null; data: string | null /* YYYY-MM-DD */; resumo: string; decisoes: { titulo: string; descricao: string | null }[]; etapas: EtapaLida[]; detalhes: string; reconhecido: boolean };
  export function lerAnotacoes(texto: string): AnotacoesLidas;
  export function normalizarNome(s: string): string; // sem acento, minúsculas, espaços simples
  export type Candidatos = { membros: { id: string; nome: string }[]; contas: { nome: string }[]; cliente: string | null };
  export function sugerirTipoEResponsavel(bruto: string | null, c: Candidatos): { tipo: "tarefa_equipe" | "pendencia_cliente"; responsavelId: string | null };
  // docx.ts (puro, usa fflate.unzipSync)
  export function textoDoDocx(bytes: Uint8Array): string; // parágrafos em linhas; parágrafo com numeração de lista vira "- …"
  export function textoDoArquivo(nome: string, bytes: Uint8Array): string; // .docx → textoDoDocx; .md/.txt → UTF-8 sem BOM; outro → lança Error(MOTIVO_TIPO_ARQUIVO)
  ```
  Regras do leitor: seções por linha que, sem `#`, `*`, espaços, é "Resumo", "Decisões", "Próximas etapas", "Próximas etapas sugeridas", "Detalhes" (sem caixa/acento); "Alinhada" sob Decisões é ignorada; remove linhas de rodapé que começam com "Revise as anotações do Gemini", "Como está a qualidade", "Envie feedback"; remove links markdown `[texto](url)` → `texto`, marcações de tempo `(00:12:26)`/`([00:12:26](...))`; desfaz `\[`, `\]`, `\-`, `**`; item de etapa: `[Resp] Título: descrição` (com `- [ ]`, `*`, `-` na frente) ou frase "<Nome> vai <resto>" (titulo = frase inteira, responsavelBruto = Nome); decisão do formato novo: `**Título** texto` → título/descrição. Cabeçalho: data de "Reunião em 8 de out. de 2026 às …" ou da 1ª linha "out. 8, 2026"/"19 de jan. de 2026"; título de "Reunião - <nome>" (sem o sufixo "- Transcrição"). `reconhecido = false` quando não achou nenhuma seção: então `resumo` = texto inteiro limpo.
  `sugerirTipoEResponsavel`: "sena engenharia", "o grupo", vazio → tarefa_equipe/null; casa membro por nome completo ou primeiro nome único → tarefa_equipe/id; casa conta do cliente (nome completo ou primeiro nome único) ou o nome do cliente → pendencia_cliente/null.

- [ ] **Step 1: Testes que falham** — `leitura-gemini.test.ts`: `"formato novo: decisões e etapas com responsável entre colchetes"` (amostra .md: 4 decisões, 6 etapas, `responsavelBruto = "SENA Engenharia"`, título sem `**`, sem `\[`); `"formato novo em .txt (sem marcação)"`; `"formato antigo: próximas etapas sugeridas em frase 'Fulano vai'"`; `"rodapé, links e marcações de tempo somem"`; `"cabeçalho: título e data"` (`"Reunião - Clube X"` → `"Reunião - Clube X"`, data `"2026-01-19"`; `"Reunião em 8 de out. de 2026 às 17:29"` → `"2026-10-08"`); `"texto que não é do Gemini vira só resumo, sem itens, reconhecido false"`; `"sugestão: membro, conta do cliente, nome do cliente, SENA Engenharia e primeiro nome ambíguo"`. `docx.test.ts`: `"docx com parágrafos e lista"` (zip montado no teste), `"md com BOM"`, `".pdf recusa"`.
- [ ] **Step 2:** vitest → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** vitest → PASS.
- [ ] **Step 5:** commit `feat(portal): leitura das anotações do Gemini`.

### Task 3: Sincronização entre versões (puro)

**Files:**
- Create: `src/modules/portal/atas/sincronizar.ts`; Test: `sincronizar.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ItemPublicado = ItemRascunho; // da versão vigente (vazio na 1ª publicação)
  export type PlanoPublicacao = {
    tarefas: { criar: ItemRascunho[]; atualizar: { chave: string; campos: Partial<{ titulo: string; descricao: string | null; responsavelId: string; prazo: string | null }> }[]; arquivar: string[]; desarquivar: string[] };
    pendencias: { criar: ItemRascunho[]; atualizar: { chave: string; campos: Partial<{ titulo: string; descricao: string | null; prazo: string | null }> }[]; cancelar: string[]; reabrirCancelada: string[] };
  };
  export function planejarPublicacao(p: { anteriores: ItemPublicado[]; novos: ItemRascunho[]; tarefasExistentes: ReadonlySet<string> /* chaves com TarefaDaAta */; pendenciasExistentes: ReadonlyMap<string, SituacaoPendencia> }): PlanoPublicacao;
  ```
  Regra: chave em `novos` e não em `anteriores` com tipo X → se já existe Tarefa/pendência dessa chave (item que saiu e voltou) → `desarquivar`/`reabrirCancelada` + `atualizar` com os campos que diferem do que existia na última vez (use os valores do novo item: o serviço compara com a linha); senão `criar`. Chave nos dois: mesmo tipo → `atualizar` só com campos diferentes entre anterior e novo (vazio = nada); tipo mudou → arquivar/cancelar do tipo antigo + criar/desarquivar do novo. Chave só em `anteriores` → `arquivar` (tarefa) / `cancelar` (pendência). Decisões não geram nada. Pendência `conferida` nunca é cancelada nem atualizada.

- [ ] **Step 1: Testes que falham**: `"1ª publicação cria tarefas e pendências, decisão não gera nada"`, `"versão 2 sem mudança não toca nada"`, `"campo mudado vai sozinho"` (só prazo → `campos = { prazo }`), `"item removido arquiva tarefa e cancela pendência"`, `"item que volta desarquiva a mesma tarefa"`, `"pendência conferida não é cancelada nem alterada"`, `"tipo trocado: tarefa vira pendência"`.
- [ ] **Step 2:** vitest → FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(portal): sincronização das versões da ata`.

### Task 4: Serviço e smoke

**Files:**
- Create: `src/modules/portal/atas/service.ts`, `scripts/smoke-portal-atas.ts`; Modify: `package.json` (`"smoke:portal-atas": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-atas.ts"`)

**Interfaces:**
- Consumes: Tasks 1–3; `podeVerConversaDoProjeto`, `contaPodeVerConversa`, `contasDoClienteDoProjeto` (`portal/mensagens/service.ts`).
- Produces:
  ```ts
  export type Equipe = { userId: string; nome: string };
  export async function membrosInternosDoProjeto(projetoId: string): Promise<{ id: string; nome: string }[]>;
  export async function criarReuniaoComRascunho(p: { projetoId: string; quem: Equipe; titulo?: string | null; data?: string | null; texto: string }): Promise<{ reuniaoId: string; versaoId: string }>; // lê com lerAnotacoes; itens sugeridos (decisões → decisao; etapas → sugerirTipoEResponsavel); titulo/data do cabeçalho quando não informados (data padrão = hoje SP; título padrão = "Reunião de dd/mm/aaaa")
  export async function salvarRascunho(p: { versaoId: string; quem: Equipe; texto: string; itens: ItemRascunho[]; titulo: string; data: string }): Promise<void>; // substitui os itens do rascunho (deleteMany + createMany); chave nova = cuid
  export async function descartarRascunho(p: { versaoId: string; quem: Equipe }): Promise<{ reuniaoId: string; reuniaoApagada: boolean }>; // rascunho da versão 1 apaga a reunião inteira (e arquivos)
  export async function publicar(p: { versaoId: string; quem: Equipe }): Promise<{ reuniaoId: string; tarefasNovas: { tarefaId: string; responsavelId: string; titulo: string }[] }>;
  export async function corrigirAta(p: { reuniaoId: string; quem: Equipe }): Promise<{ versaoId: string }>; // copia a vigente (texto + itens com as mesmas chaves)
  export async function responderAta(p: { versaoId: string; conta: { userId: string; nome: string }; resposta: "concorda" | "observacoes"; observacao: string | null }): Promise<{ reuniaoId: string }>;
  export async function retirarAta(p: { reuniaoId: string; quem: Equipe; motivo: string }): Promise<{ reuniaoId: string }>;
  export async function marcarPendenciaFeita(p: { pendenciaId: string; conta: { userId: string; nome: string }; comentario: string | null }): Promise<{ projetoId: string }>;
  export async function conferirPendencia(p: { pendenciaId: string; quem: Equipe }): Promise<{ projetoId: string }>;
  export async function reabrirPendencia(p: { pendenciaId: string; quem: Equipe; motivo: string }): Promise<{ projetoId: string }>;
  ```
  `publicar` (uma transação, leituras planas): `SELECT … FOR UPDATE` da reunião; recusa retirada; rascunho existe; `motivoParaPublicar` com membros; lê a vigente e seus itens, `TarefaDaAta` e `PendenciaCliente` da reunião; `planejarPublicacao`; aplica: Tarefa nova = `tx.tarefa.create` (primeira coluna ativa por `ordem`, `projetoId`, `criadorId = quem`, descrição `"<descrição>\n\nOrigem: ata de dd/mm/aaaa — <título>"`, responsável via `tarefaResponsavel`) + `TarefaDaAta`; atualizar Tarefa só se `concluidaEm` nulo (campos do plano; responsável = substitui a lista por um); arquivar = `arquivada: true` se não concluída; desarquivar = `arquivada: false`; pendências conforme o plano (`updateMany` condicionado a não `conferida`); vigente → `substituida`; rascunho → `publicada` com quem/quando. Avisos ficam para a action (Task 5). `responderAta`: porta do cliente; `motivoParaResponder`; `updateMany` condicionado a `estado: "publicada", resposta: null` (0 linhas → relê e devolve a frase). Pendências: `updateMany` condicionado à situação lida (`motivoParaPendencia`).

- [ ] **Step 1: Smoke que falha** (cria e apaga o próprio cenário: cliente A ativo com 2 contas, cliente B, cliente inativo, projeto P de A com coordenador e projetista membros, projeto do inativo): criar da amostra sintética do formato novo → itens sugeridos (decisões, etapas); projetista não cria; publicar sem responsável recusa; responsável fora dos membros recusa; publicar → Tarefas criadas (criador, projeto, coluna, `TarefaDaAta`) e pendências abertas; corrigir → rascunho com as mesmas chaves; editar Tarefa à mão (prazo) e publicar v2 mudando só o título → título atualizado, prazo manual mantido, nada duplicado; v2 remove item → Tarefa arquivada, pendência cancelada; v3 traz de volta → desarquivada/reaberta, mesma linha; cliente responde v1 depois da v2 → `MOTIVO_SUBSTITUIDA`; duas contas respondem a vigente ao mesmo tempo → uma; outro cliente e inativo → "Ata não encontrada."; observações sem texto → `MOTIVO_OBSERVACAO`; pendência: feito (conta 1) → aguardando; feito de novo → frase; conferir × reabrir ao mesmo tempo → um; reabrir sem motivo recusa; reaberta → feito de novo; atrasada; retirar → reunião retirada, Tarefas abertas arquivadas, pendências não conferidas canceladas, responder recusa `MOTIVO_RETIRADA`; descartar rascunho da v1 apaga a reunião.
- [ ] **Step 2:** `npm run smoke:portal-atas` → falha.
- [ ] **Step 3:** `service.ts`.
- [ ] **Step 4:** smoke → todos `[OK]`; `npx vitest run src/modules/portal` → PASS.
- [ ] **Step 5:** commit `feat(portal): serviço das atas de reunião e smoke`.

### Task 5: Leituras, ações, avisos e Decisões combinadas

**Files:**
- Create: `src/modules/portal/atas/queries.ts`, `schemas.ts`, `actions.ts`, `avisos.ts`, `decisoes.ts` (+ `decisoes.test.ts`)
- Modify: `src/modules/portal/mensagens/queries.ts` (`ConversaDTO.decisoesDeAtas`), `src/lib/email-templates-meta.ts` (template), `src/modules/usuarios/preferencias/queries.ts` + `src/components/configuracoes/preferencias-view.tsx` (`notif_ata_reuniao`, "Atas de reunião do cliente"), smoke

**Interfaces:**
- Produces (`queries.ts`):
  ```ts
  export type ItemAtaDTO = { chave: string; tipo: "decisao" | "tarefa_equipe" | "pendencia_cliente"; titulo: string; descricao: string | null; prazo: string | null; responsavelNome: string | null /* null no cliente */ };
  export type VersaoDTO = { id: string; numero: number; estado: "rascunho" | "publicada" | "substituida"; texto: string; itens: ItemAtaDTO[]; publicadaEm: string | null; publicadaPorNome: string | null /* null no cliente */; resposta: "concorda" | "observacoes" | null; observacao: string | null; respondidaPorNome: string | null; respondidaEm: string | null };
  export type PendenciaDTO = { id: string; titulo: string; descricao: string | null; prazo: string | null; situacao: SituacaoPendencia; atrasada: boolean; feitaPorNome: string | null; feitaEm: string | null; comentarioFeito: string | null; motivoReabertura: string | null; reuniaoTitulo: string; reuniaoData: string };
  export type ReuniaoDTO = { id: string; titulo: string; data: string; retirada: { em: string; motivo: string; por: string } | null /* sempre null no cliente */; vigente: VersaoDTO | null; rascunho: VersaoDTO | null /* null no cliente */; anteriores: VersaoDTO[]; arquivos: { id: string; tipo: "anotacoes" | "transcricao"; nome: string }[] /* [] no cliente */ };
  export async function atasParaCliente(projetoId: string, userId: string): Promise<{ reunioes: ReuniaoDTO[]; pendencias: PendenciaDTO[] } | null>; // sem retiradas, só com vigente
  export async function atasParaEquipe(projetoId: string, userId: string): Promise<{ reunioes: ReuniaoDTO[]; pendencias: PendenciaDTO[]; contasAtivas: number } | null>;
  export async function ataParaEditar(reuniaoId: string, userId: string): Promise<{ reuniao: ReuniaoDTO; projeto: { id: string; codigo: string; nome: string; cliente: string | null }; membros: { id: string; nome: string }[] } | null>;
  export async function decisoesDasAtas(projetoId: string): Promise<DecisaoDeAtaDTO[]>;
  ```
- Produces (`decisoes.ts`, puro): `export type DecisaoDeAtaDTO = { reuniaoId: string; titulo: string; descricao: string | null; reuniaoTitulo: string; reuniaoData: string; comObservacoes: boolean }` e `export function decisoesCombinadas(conversa: ConversaDTO["decisoes"], atas: DecisaoDeAtaDTO[]): ({ origem: "conversa"; … } | { origem: "ata"; … })[]` — por data desc (conversa: `mensagemEm`; ata: `reuniaoData`). `decisoesDasAtas`: decisões da versão vigente de reunião não retirada.
- `mensagens/queries.ts`: `ConversaDTO` ganha `decisoesDeAtas: DecisaoDeAtaDTO[]` (preenchido em `conversaParaCliente` e `conversaParaEquipe`; a conversa vazia também lê as atas). `mesclar.ts` passa a copiar `decisoesDeAtas` do dado novo.
- Produces (`actions.ts`): equipe (`interno: true`): `criarAtaDeTexto`, `salvarRascunhoAta`, `descartarRascunhoAta`, `publicarAta`, `corrigirAta`, `retirarAta`, `conferirPendenciaCliente`, `reabrirPendenciaCliente`; cliente: `responderAta`, `marcarPendenciaFeita`. `capturarAntes` nas de estado. Schemas Zod em `schemas.ts` com mensagens pt-BR e os limites (dobro do limite no Zod, conferência exata no serviço).
- Produces (`avisos.ts`, deps injetáveis como `aprovacao-entrega/avisos.ts`): `avisarPublicacao(versaoId)` (contas ativas do cliente: sino + e-mail `portal-ata-reuniao`, vars `nome`, `titulo`, `projeto`, `url` = `/portal/<id>#atas`), `avisarRespostaAta(versaoId)` e `avisarPendenciaFeita(pendenciaId)` (coordenadores do projeto na audiência, sem nenhum os globais; categoria `ata_reuniao`; href `/projetos/<id>/cliente#atas`), `avisarPendenciaReaberta(pendenciaId)` (contas ativas, sino), `avisarTarefasNovas(tarefas)` (mesmo texto do módulo de Tarefas: "Nova tarefa atribuída", corpo = título, href `/tarefas`, `tag: tarefa-<id>`).

- [ ] **Step 1: Teste e smoke que falham** — `decisoes.test.ts`: `"junta conversa e atas por data, mais nova primeiro"`, `"marca com observações"`. Smoke: publicação = 1 sino + 1 e-mail por conta ativa; resposta/feito = sino ao coordenador (não ao projetista), categoria `ata_reuniao`; reabertura = sino às contas; Tarefa nova = sino ao responsável; `atasParaCliente` sem rascunho, sem retirada, sem nomes internos, `responsavelNome` nulo; projetista → `atasParaEquipe` null; `conversaParaCliente(...).decisoesDeAtas` traz a decisão da vigente e some depois de retirar.
- [ ] **Step 2:** vitest + smoke → falham.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** PASS; `npx vitest run src/modules/portal` → PASS; lint sem erro novo.
- [ ] **Step 5:** commit `feat(portal): leituras, ações e avisos das atas`.

### Task 6: Importar por arquivo e baixar anexos

**Files:**
- Create: `src/app/api/portal/atas/importar/route.ts` (POST), `src/app/api/portal/atas/arquivos/[arquivoId]/route.ts` (GET)
- Modify: `service.ts` (`importarArquivoNaAta`, `arquivoParaEquipe`), smoke

**Interfaces:**
- POST multipart: campos `projetoId`, `titulo?`, `data?`, `anotacoes` (arquivo), `transcricao?` (arquivo). Esqueleto da rota do comprovante da aprovação (teto antes de ler o corpo, `limitarStream`, `salvarStream` em `portal/atas/<reuniaoId>/<aleatorio>-<slug>`, apagar o arquivo se o registro falhar); interno + audiência; o texto vem de `textoDoArquivo(nome, bytes)` (lido do arquivo salvo); chama `criarReuniaoComRascunho` e grava `ArquivoAta` dos dois. Resposta `{ reuniaoId }`. Recusa de porta = 404.
- GET: só interno da audiência; sempre `attachment`; `nosniff`; `logAudit`; recusa = 404 `"Arquivo indisponível."`.
- `arquivoParaEquipe(arquivoId: string, userId: string): Promise<{ caminho: string; nome: string } | null>`.

- [ ] **Step 1: Casos no smoke que falham**: `arquivoParaEquipe` = null para projetista e conta do cliente; caminho para o coordenador; `textoDoArquivo` com o .docx sintético cria a reunião com os itens (chamando o serviço como a rota chama).
- [ ] **Step 2:** smoke → falha. **Step 3:** rotas + serviço. **Step 4:** smoke `[OK]`; lint.
- [ ] **Step 5:** commit `feat(portal): importar ata por arquivo`.

### Task 7: Telas da equipe

**Files:**
- Create: `src/modules/portal/atas/acoes.ts` + `acoes.test.ts` (ADR-0002), `src/components/atas/reunioes-equipe.tsx` (seção da aba Cliente), `src/components/atas/nova-ata-dialog.tsx`, `src/components/atas/editor-ata.tsx`, `src/components/atas/item-ata-linha.tsx`, `src/components/atas/pendencias-equipe.tsx`, `src/components/atas/retirar-ata-dialog.tsx`, `src/components/atas/reabrir-pendencia-dialog.tsx`, `src/components/atas/texto-ata.tsx` (render `react-markdown` com `skipHtml`, links como texto)
- Create: `src/app/(dashboard)/projetos/[id]/cliente/ata/[reuniaoId]/page.tsx` (editor; `notFound()` fora da audiência; `CabecalhoPagina` "Ata — <título>")
- Modify: `src/app/(dashboard)/projetos/[id]/cliente/page.tsx` (seção `id="atas"` depois das aprovações), `src/components/mensagens-cliente/conversa-equipe.tsx` (painel Decisões usa `decisoesCombinadas`)

**Interfaces:**
- `acoes.ts`: `itensDaReuniao(r: Pick<ReuniaoDTO, "retirada" | "vigente" | "rascunho">): AcaoItem[]` — ids `abrir-rascunho` (link para o editor, se há rascunho), `corrigir-ata` (se vigente e sem rascunho), `retirar-ata` (destrutivo, diálogo próprio; se vigente e não retirada), `baixar-anotacoes`/`baixar-transcricao` (links, se houver); retirada → `[]`. `itensDaPendencia(p: Pick<PendenciaDTO, "situacao">): AcaoItem[]` — `conferir-pendencia` e `reabrir-pendencia` só em `aguardando_conferencia`.
- Nova ata (diálogo): abas "Colar texto" (textarea → `criarAtaDeTexto`) e "Anexar arquivo" (anotações + transcrição opcional → POST da Task 6); ao criar, navega para o editor.
- Editor: título, data, texto (textarea grande + prévia `TextoAta`), lista de itens (`ItemAtaLinha`: tipo, título, descrição, responsável = Select com nomes dos membros, prazo; adicionar, remover, subir/descer), "Virar decisão" em cada parágrafo do bloco "Resumo do Gemini" (lido de `lerAnotacoes(texto)` no cliente — `leitura-gemini.ts` é puro e sem `node:`), Salvar rascunho, Descartar (confirm), Publicar (diálogo de confirmação com **projeto, código e cliente em destaque** e o aviso de cliente sem conta).
- Lista da seção: título, data, versão, situação (Rascunho · Aguardando o cliente · Confirmada · Com observações · Retirada), pendências abertas/atrasadas; resposta e observação; versões anteriores recolhidas; "Nova ata".
- Pendências da equipe: situação, prazo, "Atrasada" em texto, feita por/em + comentário; Conferir / Reabrir.

- [ ] **Step 1: Teste que falha** — `acoes.test.ts`: `"retirada não tem ações"`, `"vigente sem rascunho oferece corrigir e retirar"`, `"com rascunho oferece abrir o rascunho, não corrigir"`, `"pendência só aguardando conferência tem conferir e reabrir"`.
- [ ] **Step 2:** vitest → FAIL. **Step 3:** telas. **Step 4:** vitest PASS; lint e `tsc --noEmit` (heap 8192) sem erro novo.
- [ ] **Step 5:** commit `feat(projetos): atas de reunião na aba Cliente`.

### Task 8: Telas do portal

**Files:**
- Create: `src/components/portal/atas-card.tsx`, `src/components/portal/responder-ata-dialog.tsx`, `src/components/portal/pendencias-cliente-card.tsx`, `src/components/portal/marcar-feito-dialog.tsx`
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (cards `id="atas"` e `id="pendencias"` em `LimiteErroEntregas` + `Suspense fallback={null}`, logo depois de Aprovações de entrega), `src/components/portal/mensagens/conversa-card.tsx` (Decisões combinadas)

**Interfaces:**
- Consumes: `atasParaCliente`, `responderAta`, `marcarPendenciaFeita`, `TextoAta` (Task 7), `decisoesCombinadas`.
- Card de atas: por reunião — data, título, versão vigente (texto, Decisões, "Tarefas da equipe" com título + prazo + "a cargo da equipe", "Pendências suas" da ata), resposta; aguardando: "Li e concordo" / "Tenho observações" (diálogo; observação obrigatória; aviso "fica registrado"); anteriores recolhidas com a resposta de cada uma. Pendências: abertas/reabertas no topo, "Atrasada" em texto, motivo da reabertura, "Marquei como feito" (comentário opcional); aguardando conferência; concluídas recolhidas. Falha de rede nas ações vira toast.

- [ ] **Step 1:** implementar; lint e tsc sem erro novo.
- [ ] **Step 2:** commit `feat(portal): atas e pendências no portal`.

### Task 9: Manual, registro e verificação

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (seção "Atas de reunião e pendências", staging parcial), `docs/manual/projetos/projetos.md` (aba Cliente → Reuniões e atas), `docs/manual/novidades.md`, `docs/manual/search-index.json`, `CLAUDE.md` (linha do `smoke:portal-atas` e categoria `ata_reuniao`, staging parcial)

- [ ] **Step 1:** textos.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run smoke:portal-atas`, `npm run smoke:portal-mensagens` (Decisões mexidas), `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit` e (sem `next dev`) `npm run build` → sem erro.
- [ ] **Step 3:** commit `docs(portal): atas de reunião no manual`.
- [ ] **Step 4:** auditoria nível 4 (`docs/PROTOCOLO_AUDITORIA_FINAL.md`): revisores, tela (colar amostra sintética → editor → publicar → portal concorda/observação → corrigir v2 → pendência feito/reabrir/conferir → retirar → Decisões) com prints + `LEIAME.md` em `prints-auditoria/2026-11-23_atas-reuniao/`; servidor encerrado.
