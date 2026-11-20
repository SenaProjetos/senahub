# Portal — visualizador 3D e pedido de revisão no modelo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente abre no portal o 3D dos IFCs das Entregas e dos IFCs que ele enviou, explora (disciplinas, pavimentos, corte, propriedades), anda em primeira pessoa (também na Coordenação) e pede revisão marcando elementos; o aceite cria apontamentos 3D da coordenação.

**Architecture:** Módulo `src/modules/portal/modelo3d/` (regras puras, consultas, rota do `.frag`) sobre o `ViewerEngine` existente; o modo andar entra no motor (`modules/coordenacao/viewer/andar.ts` puro + métodos do motor). O pedido 3D estende `PedidoRevisaoCliente` (`tipo`), com marcação própria; o aceite cria `ApontamentoCoordenacao` por um escritor único extraído das ações da coordenação.

**Tech Stack:** Prisma 7 (2 migrações), Next 15, three.js + `@thatopen/fragments` + `camera-controls` (dentro do motor), Vitest, tsx smoke.

**Spec:** `docs/superpowers/specs/2026-11-20-portal-visualizador-3d-design.md` (D1–D5) — e o pedido de revisão `docs/superpowers/specs/2026-11-19-portal-pedido-revisao-design.md`.

## Global Constraints

- O cliente só recebe modelo que está nas Entregas da conta (`uploadLiberadoNoAlcance(alcanceDoPortal(projeto), U)`, sem bloqueio de download) ou um descendente realinhado de um deles, ou um IFC do card "Documentos" (`recebidosDoProjeto(projetoId)` SEM `incluirCompartilhadosDoGeral`). Nunca material interno do Geral.
- Modelo `d:<documentoVersaoId>` para IFC recebido (como `modelo-ref.ts`); upload cru para IFC de disciplina.
- `Upload.realinhadoDeId` é coluna de texto com índice, SEM relação Prisma.
- Câmera persistida no espaço IFC (Z para cima) — `capturarCamera`/`restaurarCamera` do motor.
- three.js/fragments só no motor e atrás de `next/dynamic({ ssr: false })`; o visualizador do portal NÃO importa `coordenacao-view.tsx`.
- Andar: olho a **1,60 m** acima do piso do pavimento; W/A/S/D e setas, Q/E e Page Up/Down, Shift corre, Esc sai; arrastar gira o olhar; sem colisão.
- Pedido 3D: mesmas regras do item 5 (comentário 1–4000, marcação texto 1–900, até 50 marcações, até 5 anexos, 20 aguardando por conta e projeto, status por `updateMany` condicionado). Imagem da vista: PNG ≤ 2 MB.
- Aceite 3D exige `arquivos:alterar_status` E `coordenacao:gerir` (`uploads:validar` não se aplica: não há rascunho de `Pendencia`); "Em revisão" uma vez por revisão IFC das Entregas marcada; IFC recebido não marca revisão.
- Mudanças alheias não commitadas em `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `src/app/(dashboard)/layout.tsx`, `src/lib/permissao-efetiva*`, `src/lib/permissions.ts`, `src/lib/session.ts`, `src/lib/so-interno*`: commitar só os próprios hunks. Vitest pelo PowerShell. UI pt-BR, 390 px sem rolagem lateral.

## Review Focus

1. Id de modelo válido de OUTRO projeto/cliente, ou upload realinhado que não descende do arquivo das Entregas, pedido na rota do `.frag` do portal → 404 (smoke Task 2).
2. IFC das Entregas ainda sem conversão e o realinhado convertido → o portal serve o realinhado; realinhado ainda convertendo → serve a origem (teste Task 1).
3. Pavimento com nome igual em disciplinas diferentes e elevações em unidades diferentes → um item só na lista, piso pela caixa dos elementos em metros (teste Task 1).
4. Aceite × cancelamento do pedido 3D ao mesmo tempo, e dois aceites → um vence, nenhum apontamento órfão (smoke Task 5).
5. Marcação num modelo que saiu das Entregas, ou num IFC recebido excluído → aceite recusado com a frase de retirada/substituída (smoke Task 5).

---

## Etapa 1 — ver e explorar

### Task 1: Regras puras do 3D do portal

**Files:** Create `src/modules/portal/modelo3d/regras.ts`, Test `src/modules/portal/modelo3d/regras.test.ts`

**Interfaces — Produces:**

```ts
export type UploadDaCadeia = { id: string; realinhadoDeId: string | null; versao: number; convertido: boolean };
/** O descendente realinhado mais recente de `origemId` com conversão concluída (cadeia por realinhadoDeId); senão a origem. */
export function modeloServidoDaOrigem(origemId: string, uploads: readonly UploadDaCadeia[]): string;
/** A cadeia inteira de descendentes de `origemId` (para a regra da rota). */
export function descendentesDe(origemId: string, uploads: readonly UploadDaCadeia[]): Set<string>;
export type PavimentoDoModelo = { modeloId: string; nome: string | null; pisoY: number; localIds: number[] };
export type PavimentoUnido = { chave: string; nome: string; pisoY: number; porModelo: Map<string, number[]> };
/** Une pavimentos de vários modelos por nome normalizado (sem acento/caixa/espaço extra); piso = menor pisoY; ordem crescente de piso; sem nome → "Sem pavimento", por último. */
export function unirPavimentos(lista: readonly PavimentoDoModelo[]): PavimentoUnido[];
```

- [ ] **Step 1: Testes** — `modeloServidoDaOrigem`: sem descendente → origem; U→R1 (convertido) → R1; U→R1→R2 (R2 não convertido) → R1; descendente de OUTRA origem nunca volta; ciclo defensivo (A→B→A) não trava. `descendentesDe(U)` = {R1, R2}. `unirPavimentos`: "Térreo" e "TERREO " de dois modelos = 1 item com `porModelo` dos dois e `pisoY` = menor; ordem por piso; elementos sem pavimento agrupados em "Sem pavimento" no fim.
- [ ] **Step 2:** `npx vitest run src/modules/portal/modelo3d/regras.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(portal): regras do 3D (modelo servido, pavimentos)`.

### Task 2: Ligação do realinhamento, modelos do portal e rota do `.frag`

**Files:** Modify `prisma/schema.prisma` (`Upload.realinhadoDeId String?` + `@@index([realinhadoDeId])`), Create `prisma/migrations/20261120120000_upload_realinhado_de/migration.sql` (gerar com `npx prisma migrate diff --from-schema <HEAD> --to-schema prisma/schema.prisma --script`, aplicar com `npx prisma migrate deploy`), Modify `src/modules/coordenacao/deslocamento.ts` (`realinharUpload` grava `realinhadoDeId: upload.id`), `src/modules/coordenacao/georreferenciamento.ts` (o upload `ferramenta` gravado a partir de outro upload grava `realinhadoDeId`); Create `src/modules/portal/modelo3d/queries.ts`, `src/app/api/portal/projetos/[projetoId]/modelos/[modeloId]/route.ts`, `scripts/smoke-portal-modelo3d.ts`; Modify `package.json` (`smoke:portal-modelo3d`), `CLAUDE.md` (linha do smoke).

**Interfaces:**
- Consumes: Task 1; `acessoDoUsuarioAoProjetoDoPortal`, `uploadLiberadoNoAlcance`, `uploadsComBloqueioDeDownload`, `recebidosDoProjeto`, `refDocumento` (`modelo-ref.ts`).
- Produces:

```ts
export type ModeloDoPortal = {
  modeloId: string;               // uploadId servido (origem ou realinhado) ou "d:<versaoId>"
  origem: "entrega" | "cliente";
  origemUploadId: string | null;  // U das Entregas; null no recebido
  documentoRecebidoId: string | null;
  disciplinaId: string | null;
  rotulo: string;                 // "Estrutural · R01" | "Referência enviada por você · base.ifc"
  situacao: "pronto" | "preparando" | "erro";
  url: string | null;             // /api/portal/projetos/<p>/modelos/<modeloId> quando pronto
};
export async function modelosDoPortal(user: UsuarioDaSessao, projetoId: string): Promise<ModeloDoPortal[] | null>; // null = sem acesso
export async function modeloPermitidoNoPortal(user: UsuarioDaSessao, projetoId: string, modeloId: string): Promise<{ caminhoFrag: string; concluidoEm: Date | null } | null>;
```

- [ ] **Step 1: Smoke que falha** (modelo `smoke-pedido-revisao-cliente.ts`: cliente/projeto/contas throwaway). Uploads IFC: U nas Entregas (ciclo, publicado, `enviado_cliente`) com `ConversaoModelo` concluída; R1 `ferramenta` com `realinhadoDeId: U` concluída; X IFC de outra disciplina fora das Entregas; Y `ferramenta` sem ligação; recebido: `Documento` origem `recebido_cliente` com versão IFC + conversão concluída; interno: `Documento` origem `interno` IFC. Checks:
  - `[OK] lista: realinhado no lugar da origem, recebido incluído, interno e fora das Entregas não`
  - `[OK] rota: serve U, R1 e o recebido; recusa X, Y, o IFC interno e o projeto de outro cliente`
  - `[OK] IFC sem conversão aparece como preparando, sem url`
  - `[OK] bloqueio de download tira o modelo`
  - `[OK] realinharUpload grava realinhadoDeId` (chamar a gravação do serviço com `spawnFn` falso, como os testes de `deslocamento`, ou checar via `prisma.upload.create` do caminho real se houver injeção — preferir o real).
  - Run `npm run smoke:portal-modelo3d` → falha.
- [ ] **Step 2:** Schema + migração + `realinhadoDeId` nos dois caminhos.
- [ ] **Step 3:** `queries.ts` e a rota (streaming e ETag como `/api/coordenacao/frag/[uploadId]`; extrair o corpo do streaming para `src/lib/frag-stream.ts` `servirFrag(req, caminhoFrag, concluidoEm)` e usar nas duas rotas). Registrar acesso como a rota interna (`registrarAcessoUploads`, origem `portal`) só para IFC de disciplina.
- [ ] **Step 4:** `npm run smoke:portal-modelo3d` → todos `[OK]`; `npx vitest run src/modules/coordenacao` sem regressão.
- [ ] **Step 5: Commit** `feat(portal): modelos 3D das entregas e do cliente, com o realinhamento da coordenação`.

### Task 3: Página 3D do portal (explorar)

**Files:** Create `src/app/(dashboard)/portal/[projetoId]/modelo/page.tsx` + `loading.tsx`, `src/components/portal/modelo3d/visualizador-modelo.tsx` (cliente), `painel-modelo.tsx` (disciplinas, pavimentos, corte), `src/components/portal/modelo3d/visualizador-modelo-dinamico.tsx` (`next/dynamic` ssr false); Modify `src/components/portal/entregas-do-portal.tsx` (IFC: olho → `/portal/<p>/modelo?modelo=<modeloId servido>`), `src/app/(dashboard)/portal/[projetoId]/page.tsx` ("Ver em 3D" no topo do card Entregas quando há IFC), `src/modules/coordenacao/viewer/engine.ts` (método `pisoDoPavimento(modeloId, localIds): Promise<number>` = menor Y das caixas, metros).

**Interfaces:**
- Consumes: Task 2 `modelosDoPortal`, Task 1 `unirPavimentos`; `Viewer3D` (`components/coordenacao/viewer-3d.tsx`, mesmo wrapper de clique/teclas), `PainelPropriedades`, `engine.indiceDoModelo`, `isolarPorModelo`, `definirCorte`, `enquadrar`, `irParaVista`.
- Produces: `VisualizadorModelo({ projetoId, modelos: ModeloDoPortal[], foco?: string | null, leitura?: MarcaModeloLeitura[], pedir?: {...} | null })` — Task 6 usa `pedir` e `leitura`.

- [ ] **Step 1:** Página: externo + `modelosDoPortal`; null → `notFound`; nenhum pronto → explicação + link de download das Entregas. `CabecalhoPagina` "Modelo 3D", trilha Meus projetos › projeto › Modelo 3D.
- [ ] **Step 2:** Visualizador: carrega os prontos (`carregarModelo(modeloId, url)`), lista de modelos com liga/desliga (`destacarModelo`/`descarregarModelo` ou ocultar — o que o motor permitir sem recarregar), pavimentos (`indiceDoModelo` → `PavimentoDoModelo` com `pisoDoPavimento` → `unirPavimentos` → `isolarPorModelo`), corte horizontal (`definirCorte`, eixo de altura), propriedades da seleção, enquadrar e vistas. Layout: altura da janela, painel lateral ≥ lg, folha no celular.
- [ ] **Step 3:** Links nas Entregas e no card.
- [ ] **Step 4:** lint, tsc, vitest; tela (dev): cliente demo com IFC das Entregas convertido (se o demo não tiver IFC convertido: subir um IFC de exemplo dos fixtures da coordenação com `npm run dev:server`, que roda a conversão, ou reaproveitar um `.frag` já convertido do banco de dev), 1366/390 claro/escuro, isolar pavimento, desligar disciplina, corte.
- [ ] **Step 5: Commit** `feat(portal): visualizador 3D das entregas`.

## Etapa 2 — andar

### Task 4: Modo andar no motor, no portal e na Coordenação

**Files:** Create `src/modules/coordenacao/viewer/andar.ts` (puro) + `andar.test.ts`, `src/components/coordenacao/controle-andar.tsx` (controle de direção na tela, toque); Modify `src/modules/coordenacao/viewer/engine.ts`, `src/components/coordenacao/viewer-3d.tsx` (teclas do andar quando ativo), `src/components/coordenacao/viewer-toolbar.tsx` (botão "Andar"), `src/components/coordenacao/coordenacao-view.tsx` (liga o botão ao pavimento do filtro), `src/components/portal/modelo3d/visualizador-modelo.tsx`.

**Interfaces:**

```ts
// andar.ts (puro, espaço three: Y para cima, metros)
export const ALTURA_OLHO_M = 1.6;
export type EstadoAndar = { pos: [number, number, number]; yaw: number; pitch: number };
export const VELOCIDADE_M_S = 1.4; export const FATOR_CORRER = 2.5;
export function entradaDoAndar(caixa: { min: [number, number, number]; max: [number, number, number] }, pisoY: number): EstadoAndar; // centro XZ, y = pisoY + ALTURA_OLHO_M, olhar horizontal
export function passoDoAndar(e: EstadoAndar, teclas: ReadonlySet<string>, dt: number, joystick?: { x: number; y: number }): EstadoAndar; // W/S frente-trás no plano do yaw, A/D lateral, Q/E e PageUp/PageDown sobe-desce, Shift corre
export function olhar(e: EstadoAndar, dx: number, dy: number): EstadoAndar; // pitch limitado a ±85°
export function alvoDoOlhar(e: EstadoAndar): [number, number, number];
// engine
iniciarAndar(opts: { pisoY: number }): void; trocarPisoDoAndar(pisoY: number): void; sairAndar(): Promise<void>; get andando(): boolean;
definirTeclasAndar(teclas: ReadonlySet<string>): void; olharAndar(dx: number, dy: number): void; definirJoystick(v: { x: number; y: number } | null): void;
```

- [ ] **Step 1: Testes** de `andar.ts`: entrada no centro com y = piso + 1,6; W 1 s anda 1,4 m na direção do yaw; Shift×2,5; A/D perpendicular; Q sobe; pitch não passa de 85°; joystick (0, −1) = frente.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Motor: no andar, `camera-controls` desligado do arrasto de órbita; o laço de frame (`onFrame`) aplica `passoDoAndar`; arrastar com o botão esquerdo chama `olharAndar` (clique curto continua selecionando, regra dos 5 px do `Viewer3D`); sair devolve a órbita com o alvo à frente da posição atual.
- [ ] **Step 4:** Botão "Andar" (portal e Coordenação), escolha do pavimento (o do filtro ou o mais baixo), "Sair do modo andar" e Esc; `ControleAndar` só em `pointer: coarse`; ajuda curta das teclas no canto.
- [ ] **Step 5:** lint, tsc, vitest; tela: portal (teclado e toque emulado em 390) e Coordenação.
- [ ] **Step 6: Commit** `feat(coordenacao): modo andar em primeira pessoa no 3D (portal e coordenação)`.

## Etapa 3 — pedido de revisão no modelo

### Task 5: Pedido 3D — dados, regras e serviço

**Files:** Modify `prisma/schema.prisma` (`PedidoRevisaoCliente.tipo String @default("prancha")`; `documentoId`, `revisaoId`, `uploadId` opcionais; novo `MarcacaoModeloCliente`), Create migração `20261120140000_pedido_revisao_modelo` (com `CHECK (tipo IN ('prancha','modelo'))` e `CHECK (tipo <> 'prancha' OR (upload/documento/revisão não nulos))`), Create `src/modules/coordenacao/apontamento-service.ts` (`criarApontamentoCoordenacaoNoTx`, usado por `criarApontamentoCoordenacao` e `importarTopicoBcf` — mesmo comportamento) , `src/modules/portal/pedido-revisao/modelo-regras.ts` + test, Modify `src/modules/portal/pedido-revisao/service.ts`, `schemas.ts`, `actions.ts`, `queries.ts` (views com `tipo`; prancha intacta), `scripts/smoke-pedido-revisao-cliente.ts`.

**Interfaces:**

```prisma
model MarcacaoModeloCliente {
  id String @id @default(cuid())
  pedidoId String  // FK Cascade
  ordem Int
  modeloId String          // uploadId servido ou "d:<versaoId>"
  origemUploadId String?   // U das Entregas
  documentoRecebidoId String?
  guids Json               // string[] ≤ 200
  ponto Json               // [x,y,z] espaço IFC
  camera Json              // { position, target } espaço IFC
  texto String
  snapshotPath String?
  apontamentoId String?    // preenchido no aceite (sem FK)
  @@index([pedidoId, ordem]) @@map("marcacao_modelo_cliente")
}
```

```ts
// modelo-regras.ts (puro)
export function tituloDoApontamento(texto: string): string; // primeiros 200 chars, sem quebra de linha
export function situacaoDaMarcacao(m: { origem: "entrega"; revisao: EstadoDaRevisao } | { origem: "cliente"; documentoExiste: boolean }): SituacaoDaRevisao; // recebido: existe → nas_entregas, senão retirada
export function motivoParaNaoAceitarModelo(p: { status: StatusPedido; situacoes: SituacaoDaRevisao[] }): string | null; // pior situação manda (substituida > retirada), igual às frases do item 5
// service.ts
export async function criarPedidoModeloNoBanco(p: { autor: UsuarioDaSessao; projetoId: string; comentario: string; marcacoes: MarcacaoModeloRecebida[] }): Promise<{ id: string; marcacaoIds: string[] }>; // cada modeloId tem de estar em modelosDoPortal(user, projeto) "pronto"
export async function aceitarPedidoModeloNoBanco(p: { id: string; quem: { id: string }; resposta: string | null }): Promise<{ apontamentos: number; emRevisao: number }>;
export async function criarApontamentoCoordenacaoNoTx(tx, p: { projetoId; disciplinaId: string | null; uploadId: string; titulo; texto; guids: string[]; camera; autorId; snapshotPath?: string | null; bcfGuid?: string | null }): Promise<{ id: string; numero: number }>;
```

- [ ] **Step 1: Testes puros** de `modelo-regras.ts` (título cortado em 200, situação do recebido, pior situação manda, pedido sem marcações nunca bloqueia).
- [ ] **Step 2: Smoke** ganha (projeto com U nas Entregas + R1 realinhado + recebido, do Task 2): `[OK] pedido de modelo cria com marcações nos modelos do portal`; `[OK] modelo que não está no portal: recusa`; `[OK] aceite cria apontamentos 3D sem tarefa, numerados no projeto, no modelo que o cliente viu, autor = quem aceitou`; `[OK] Em revisão uma vez por revisão das Entregas, nenhuma no recebido`; `[OK] aceitar × cancelar e dois aceites: um vence, sem apontamento órfão`; `[OK] modelo saiu das Entregas / recebido excluído: aceite recusado`; `[OK] pedido de prancha segue igual` (rodar o smoke inteiro).
- [ ] **Step 3:** Schema + migração (conferir o SQL), `apontamento-service.ts` (numeração por projeto com `pg_advisory_xact_lock` por projeto), serviço/ações (aceitar modelo: gate `arquivos:alterar_status` + `coordenacao:gerir`, escopo `exigirEscopoDaRevisao` para cada revisão de origem; recebido: projeto visível), copiar a imagem da marcação para `coordenacao/apontamentos/<projetoId>/<apontamentoId>.png` (o caminho da rota de snapshot) e gravar `snapshotPath`.
- [ ] **Step 4:** `npm run smoke:pedido-revisao-cliente` → todos `[OK]`; vitest da coordenação e do pedido.
- [ ] **Step 5: Commit** `feat(portal): pedido de revisão no modelo 3D vira apontamento da coordenação`.

### Task 6: Pedir revisão no 3D, fila, portal e documentação

**Files:** Create `src/app/api/portal/pedidos/[id]/marcacoes/[marcacaoId]/imagem/route.ts` (PNG ≤ 2 MB, assinatura PNG, só o autor, só aguardando), `src/components/portal/modelo3d/modo-pedir.tsx` (lista de marcações, comentário, anexos — reusar `CampoAnexos` e o padrão de `ListaMarcacoes`); Modify `visualizador-modelo.tsx` (modo "Pedir revisão": clique seleciona → marcação com guids/ponto/câmera/imagem; marcações aguardando esmaecidas; "ir para"), rascunho no navegador (`rascunho-local.ts` ganha chave por projeto para o 3D: `chaveDoRascunhoModelo(projetoId, userId)`), `pedidos-cliente-view.tsx`/`pedido-cliente-detalhe.tsx` (pedido de modelo: "Modelo 3D · N marcações", detalhe com o visualizador em leitura e aviso "A equipe já trabalha numa versão mais nova deste modelo."), `pedidos-revisao-card.tsx`, avisos (textos do item 5 com "modelo 3D"), docs `docs/manual/inicio/portal-cliente.md` (seção "Modelo 3D") e `docs/manual/projetos/projetos.md` (Pedidos do cliente + Coordenação: botão Andar), `search-index.json`, `CLAUDE.md` (bloco curto).

- [ ] **Step 1:** Rota da imagem + check no smoke (outro autor / não PNG / > 2 MB recusam) via funções do serviço como no item 5.
- [ ] **Step 2:** Modo pedir no 3D (computador e celular), envio: `criarPedidoModelo` → imagens uma a uma → anexos; rascunho limpo.
- [ ] **Step 3:** Fila, detalhe (aceitar abre o diálogo do item 5; o detalhe do modelo usa o gate próprio), card e selo nas Entregas para IFC com pedido aguardando.
- [ ] **Step 4:** lint, tsc, vitest, smokes; tela: cliente marca 3 elementos (um no recebido) e envia; coordenação aceita; apontamento abre na mesma vista no visualizador interno (`?apontamento=N`), com a imagem.
- [ ] **Step 5: Commit** `feat(portal): pedir revisão no modelo 3D`.

### Task 7: Auditoria final

- [ ] `docs/PROTOCOLO_AUDITORIA_FINAL.md` nível 4 (migrações, portal externo, motor compartilhado): revisores `prisma-migration-reviewer`, `action-guardian`, `upload-storage-auditor`, `client-boundary-auditor`, `ui-state-linter`, `design-system-guardian`, `a11y-auditor`, `i18n-convention-reviewer`, `test-coverage-scout` + revisor final do branch.
- [ ] Tela completa (portal 3D e Coordenação, 1366/390, claro/escuro), prints + `LEIAME.md` em `prints-auditoria/2026-11-20_<hora>_portal-3d/`; dados throwaway e overrides removidos.
- [ ] `npm run build` com o dev parado; relatório pt-BR; aviso de deploy (2 migrações novas + a do status de ontem).
