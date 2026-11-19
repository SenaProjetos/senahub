# Portal — pedido de revisão do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente pede revisão de uma prancha das Entregas (comentário, anexos e marcações na PDF); a coordenação aceita (marca "Em revisão" e cria rascunhos de apontamento) ou recusa com resposta; avisos e situação no portal.

**Architecture:** Módulo `src/modules/portal/pedido-revisao/` (regras puras, serviço, ações, consultas) com tabelas próprias; o pedido só toca `Pendencia` e `ControleRevisao` no aceite, pelos serviços existentes (`criarPendenciaNoTx` extraído de `criarPendencia`; `aplicarControleNoTx` do ciclo). Visualizador do portal novo, feito das peças de desenho (`PdfPagina`, `MarcacaoSvg`, `marcacao.ts`, `giro.ts`, `medicao.ts`), sem importar `pdf-viewer.tsx`. Três etapas (D4).

**Tech Stack:** Prisma 7 (migração), Next 15 (RSC + rotas multipart), pdf.js via `components/pdf`, Vitest, tsx smoke.

**Spec:** `docs/superpowers/specs/2026-11-19-portal-pedido-revisao-design.md` (inclui "Decisões do revisor de design").

## Global Constraints

- Pedido do cliente nunca muda nada para obra/projetista sem aceite; pedido aguardando nunca entra em consulta de `Pendencia`.
- Estados `aguardando → aceito | recusado | cancelado`, terminal não volta; toda troca é `updateMany` condicionado a `status: "aguardando"`; `count ≠ 1` → `ActionError(MOTIVO_JA_RESPONDIDO)`.
- Aceitar exige `arquivos:alterar_status` E `uploads:validar`, revisão ainda nas Entregas (publicada/não arquivada, upload não substituído); rascunhos `publicadoEm: null`, autor = quem aceitou, texto `Cliente (<primeiro nome>): <texto>` + ` (ver pedido do cliente)` se há anexos.
- Ações do cliente: `defineAction` sem `recurso`, checagem no handler (`acessoDoUsuarioAoProjetoDoPortal` + `uploadLiberadoNoAlcance(alcanceDoPortal(projeto), uploadId)`).
- Textos limite: comentário 1–4000, texto de marcação 1–2000, resposta 1–2000 (obrigatória ao recusar), motivo do "Em revisão" = `"Pedido do cliente: " + comentário` cortado em 500.
- Anexos: até 5 por pedido, cada um ≤ `TAMANHO_MAX` (`modules/uploads/limites`), extensões `pdf png jpg jpeg dwg dxf`, só o autor, só aguardando.
- Mudanças alheias não commitadas em `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`: commitar só os próprios hunks.
- Toda nova `Pendencia` passa por `criarPendenciaNoTx` (nada de `pendencia.create` neste módulo). Nada de `Promise.all` em transação. UI pt-BR, `CabecalhoPagina`, menu de contexto pelo padrão ADR-0002, 390 px sem rolagem lateral. Vitest pelo PowerShell.

## Review Focus

1. Cliente de outro cliente/projeto chamando as ações ou a rota de anexo com ids válidos → recusa (smoke Task 2/3).
2. Aceite e cancelamento ao mesmo tempo → um vence, nenhum rascunho órfão (smoke Task 2).
3. Revisão publicada nova entre o pedido e o aceite → aceite recusado com a frase, Recusar disponível (smoke Task 2).
4. Página com `/Rotate` → rascunho cai no mesmo ponto em que o cliente marcou (teste Task 4).
5. Marcação de cota sem calibração mandada à força pela API → recusa sem gravar (teste/smoke Task 4).

---

## Etapa 1 — pedido e aprovação (sem marcações)

### Task 1: Regras puras do pedido

**Files:** Create `src/modules/portal/pedido-revisao/regras.ts`, Test `src/modules/portal/pedido-revisao/regras.test.ts`

**Interfaces — Produces:**

```ts
export const STATUS_PEDIDO = ["aguardando", "aceito", "recusado", "cancelado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];
export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string>; // "Aguardando a equipe" | "Aceito" | "Recusado" | "Cancelado"
export const MOTIVO_JA_RESPONDIDO = "Este pedido já foi respondido ou cancelado.";
export const MOTIVO_REVISAO_SUBSTITUIDA = "A prancha ganhou revisão nova depois deste pedido. Recuse com uma resposta e peça ao cliente que confira a revisão nova.";
export const MOTIVO_SEM_VALIDAR = "Só quem valida arquivos pode aceitar: os apontamentos ficam em rascunho com você.";
export const MOTIVO_RECUSA_SEM_RESPOSTA = "Escreva a resposta ao cliente.";
export const EXTENSOES_ANEXO = ["pdf", "png", "jpg", "jpeg", "dwg", "dxf"] as const;
export const MAX_ANEXOS = 5;
export type EstadoDaRevisao = { estado: string | null; participa: boolean; uploadSubstituido: boolean; arquivada: boolean };
export function revisaoAindaNasEntregas(r: EstadoDaRevisao): boolean;   // participa → estado publicado e !arquivada; fora do ciclo → só !uploadSubstituido
export function motivoParaNaoAceitar(p: { status: StatusPedido; podeValidar: boolean; revisao: EstadoDaRevisao }): string | null; // ordem: status → validar → revisão
export function motivoParaNaoRecusar(p: { status: StatusPedido; resposta: string }): string | null;
export function motivoParaNaoCancelar(p: { status: StatusPedido }): string | null;
export function motivoEmRevisao(comentario: string): string;           // "Pedido do cliente: …" ≤ 500 (corta com "…")
export function textoDoRascunho(p: { nomeAutor: string; texto: string; temAnexos: boolean }): string;
export function motivoDoAnexo(p: { nome: string; jaTem: number }): string | null; // extensão fora da lista / limite de 5
export function itensDoPedido(p: { status: StatusPedido; podeAceitar: string | null; podeRecusar: boolean }): AcaoItem[]; // ADR-0002: "aceitar", "recusar"
```

- [ ] **Step 1: Testes** — `motivoParaNaoAceitar` (aguardando+validar+publicada → null; aceito → MOTIVO_JA_RESPONDIDO; sem validar → MOTIVO_SEM_VALIDAR; arquivada → MOTIVO_REVISAO_SUBSTITUIDA; fora do ciclo com upload substituído → MOTIVO_REVISAO_SUBSTITUIDA; fora do ciclo vigente → null); `motivoParaNaoRecusar` (resposta "  " → MOTIVO_RECUSA_SEM_RESPOSTA); `motivoParaNaoCancelar` (recusado → MOTIVO_JA_RESPONDIDO); `motivoEmRevisao` (texto de 600 → 500 chars, termina com "…", começa "Pedido do cliente: "); `textoDoRascunho({nomeAutor:"Mariana Souza",texto:"Ajustar cota",temAnexos:true})` → `"Cliente (Mariana): Ajustar cota (ver pedido do cliente)"`; `motivoDoAnexo` ("x.exe" recusa; "planta.PDF" ok; jaTem 5 recusa); `itensDoPedido` (aceitar desabilitado com o motivo; recusado → sem itens).
- [ ] **Step 2:** `npx vitest run src/modules/portal/pedido-revisao/regras.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(portal): regras do pedido de revisão do cliente`.

### Task 2: Modelo, serviço, ações e smoke da etapa 1

**Files:** Modify `prisma/schema.prisma` (3 models do spec + back-relations em Projeto, DocumentoDisciplina, DocumentoRevisao, Upload, User ×2), Create `prisma/migrations/20261119200000_pedido_revisao_cliente/migration.sql` (gerar com `npx prisma migrate diff --from-schema <HEAD> --to-schema prisma/schema.prisma --script`, aplicar com `npx prisma migrate deploy`, `npx prisma generate` — `migrate dev` pede reset neste banco), Create `src/modules/portal/pedido-revisao/service.ts`, `actions.ts`, `queries.ts`, `scripts/smoke-pedido-revisao-cliente.ts`; Modify `package.json` (`smoke:pedido-revisao-cliente`), `CLAUDE.md` (linha do smoke).

**Interfaces:**
- Consumes: Task 1; `aplicarControleNoTx`, `carregarRevisao` (ciclo `service.ts`); `participaDoCiclo`; `acessoDoUsuarioAoProjetoDoPortal`; `uploadLiberadoNoAlcance`, `alcanceDoPortal`; `escopoProjeto`; `can`.
- Produces:

```ts
// service.ts (server-only; quem chama já checou acesso)
export async function criarPedidoNoBanco(p: { autorId: string; projetoId: string; uploadId: string; comentario: string; marcacoes: MarcacaoDoPedido[] }): Promise<{ id: string }>; // etapa 1: marcacoes = []
export async function cancelarPedidoNoBanco(p: { id: string; clienteId: string }): Promise<void>;
export async function aceitarPedidoNoBanco(p: { id: string; quem: { id: string; podeValidar: boolean }; resposta: string | null }): Promise<{ emRevisao: boolean; rascunhos: number }>;
export async function recusarPedidoNoBanco(p: { id: string; quem: { id: string }; resposta: string }): Promise<void>;
export async function estadoDaRevisaoDoPedido(db, pedido): Promise<EstadoDaRevisao>;
// actions.ts ("use server")
criarPedidoRevisao({ projetoId, uploadId, comentario, marcacoes? })       // cliente; defineAction sem recurso
cancelarPedidoRevisao({ id })                                             // cliente
aceitarPedidoRevisao({ id, resposta? })                                   // recurso "arquivos", permissao "alterar_status"; checa uploads:validar no handler
recusarPedidoRevisao({ id, resposta })                                    // recurso "arquivos", permissao "alterar_status"
// queries.ts
pedidosDoProjetoNoPortal(projetoId: string, clienteId: string): Promise<PedidoPortalView[]>;
pedidosParaCoordenacao(user, filtro: "aguardando" | "respondidos"): Promise<PedidoFilaView[]>;  // escopoProjeto
pedidoParaCoordenacao(user, id): Promise<PedidoDetalheView | null>;
contarPedidosAguardando(user): Promise<number>;
```

- [ ] **Step 1: Smoke que falha** (modelo `smoke-portal-andamento.ts`: cliente/projeto/doc throwaway, `finally` apaga). Documento DENTRO do ciclo (`chave` `A/...`) publicado + `enviado_cliente` pelo serviço do ciclo (`publicarNoBanco` ou criar estado/controle como o smoke do ciclo faz — seguir `scripts/smoke-ciclo-documental.ts`). Checks:
  - `[OK] cliente cria pedido em prancha das Entregas` · `[OK] prancha fora das Entregas: recusa` · `[OK] conta de outro cliente: recusa`
  - `[OK] pedido aguardando não aparece em pendencia` (`pendencia.count({ where: { documentoId } }) === 0`)
  - `[OK] aceitar sem uploads:validar: recusa` · `[OK] aceite marca Em revisão com o comentário` (controle `em_revisao` ativo, motivo começa "Pedido do cliente: ")
  - `[OK] segundo aceite: já respondido` · `[OK] aceitar × cancelar ao mesmo tempo: um vence` (`Promise.allSettled` dos dois serviços, fora de transação)
  - `[OK] recusar sem resposta: recusa` · `[OK] recusa grava resposta`
  - `[OK] revisão nova publicada: aceite recusado, recusa possível`
  - `[OK] documento fora do ciclo: aceite sem marca`
  - Run `npm run smoke:pedido-revisao-cliente` → falha (módulo não existe).
- [ ] **Step 2:** Schema + migração (conferir SQL: 3 tabelas, FKs, índices do spec).
- [ ] **Step 3:** Serviço: `criar` valida comentário e cria pedido (+ marcações, Task 4); `aceitar` = transação: lê pedido + revisão, `motivoParaNaoAceitar`, `updateMany` aguardando→aceito, se `participa` e publicada sem `em_revisao` ativo → `aplicarControleNoTx(tx, revisao, "em_revisao", { quem, motivo: motivoEmRevisao(...), origem: "pedido_cliente" })` (sem `notificarControle`), rascunhos (Task 4). `recusar`/`cancelar` = `updateMany` condicionado.
- [ ] **Step 4:** Ações e consultas (views só com o que cada tela mostra; o cliente nunca recebe `respondidoPorId`).
- [ ] **Step 5:** `npm run smoke:pedido-revisao-cliente` → todos `[OK]`; `npm run smoke:ciclo-documental` → sem regressão.
- [ ] **Step 6: Commit** `feat(portal): pedido de revisão do cliente — modelo, serviço e aprovação`.

### Task 3: Telas da etapa 1 e anexos

**Files:** Create `src/app/api/portal/pedidos/[id]/anexos/route.ts` (POST, cliente), `src/app/api/pedidos-cliente/anexo/[id]/route.ts` (GET, coordenação ou cliente do projeto), `src/components/portal/pedir-revisao-dialog.tsx`, `src/app/(dashboard)/arquivos/pedidos-cliente/page.tsx`, `src/app/(dashboard)/arquivos/pedidos-cliente/[id]/page.tsx`, `src/components/arquivos/pedidos-cliente-view.tsx`, `src/components/arquivos/pedido-cliente-detalhe.tsx`; Modify `src/components/arquivos/arquivos-publico-view.tsx` (prop opcional `acoesDoArquivo?: (arquivo) => ReactNode`, usada SÓ pelo portal — o link público não passa nada), `src/app/(dashboard)/portal/[projetoId]/page.tsx`, a navegação de Arquivos (link "Pedidos do cliente" com contador, mesmo gate).

- [ ] **Step 1:** Rota de anexo do cliente: esqueleto de `/api/portal/documentos/route.ts` (`limitarStream`, `salvarStream`, `nomeArquivoLimpo`, `extensaoSegura`), regras `motivoDoAnexo`; salva em `portal/pedidos/<pedidoId>/<aleatório>-<nome>`; recusa: outro autor, não aguardando, 6º anexo, extensão.
- [ ] **Step 2:** Rota de download: coordenação (`arquivos:alterar_status` + projeto no `escopoProjeto`) ou conta externa do cliente do projeto; `resolverCaminho`.
- [ ] **Step 3:** Diálogo "Pedir revisão" (botão na linha de cada PDF das Entregas do portal): comentário obrigatório, até 5 anexos; cria o pedido e depois envia os anexos um a um; anexo que falha vira aviso no toast, o pedido fica.
- [ ] **Step 4:** Tela da coordenação: lista (aguardando | respondidos) com `LinhaComMenu` + `BotaoAcoes` (`itensDoPedido`), detalhe com comentário, anexos, Aceitar (resposta opcional) / Recusar (resposta obrigatória, confirm antes do `startTransition`).
- [ ] **Step 5:** Smoke da Task 2 + checks das rotas (cliente de outro cliente → 404; 6º anexo → 400). `npm run lint`, tsc, vitest.
- [ ] **Step 6:** Tela (dev server): cliente pede com anexo; coordenação aceita (usuário demo + override temporário `uploads:validar`/`arquivos:alterar_status` se preciso, removido no fim). Prints 1366/390.
- [ ] **Step 7: Commit** `feat(portal): pedir revisão nas entregas e fila da coordenação`.

## Etapa 2 — visualizador e marcações

### Task 4: Marcações no pedido e rascunhos no aceite

**Files:** Create `src/modules/projetos/pendencias/marcacao-schema.ts` (o `z.object` de marcação hoje dentro de `criarSchema`, exportado e reusado por `criarPendencia` e pelo pedido), `src/modules/projetos/pendencias/criar-service.ts` (`criarPendenciaNoTx`), `src/modules/portal/pedido-revisao/conversao.ts` (+ test); Modify `src/modules/projetos/pendencias/actions.ts` (`criarPendencia` passa a chamar `criarPendenciaNoTx`, mesmo comportamento), pedido `service.ts`/`actions.ts`, smoke.

**Interfaces:**

```ts
export const marcacaoSchema: z.ZodType<…>; // mesmo de criarPendencia
export type DadosPendencia = { pagina: number; x: number; y: number; texto: string; marcacao: Marcacao | null; medida: { mm: number; fator: number; modo: string } | null };
export async function criarPendenciaNoTx(tx, p: { upload: { id; documentoId; disciplinaId; projetoId }; autorId: string; dados: DadosPendencia; publicar: boolean }): Promise<{ id: string; numero: number }>;
// conversao.ts (puro)
export type MarcacaoDoPedido = { pagina: number; x: number; y: number; texto: string; marcacao: Marcacao | null };
export function dadosDoRascunho(m: MarcacaoDoPedido, p: { nomeAutor: string; temAnexos: boolean; calibracao: { mmPorPonto: number; modo: string } | null; paginaPt: { w: number; h: number } | null }): DadosPendencia | { erro: string };
```

- [ ] **Step 1: Testes puros** de `dadosDoRascunho`: ponto (marcacao null), retângulo/nuvem/seta (geo igual), livre (tracos+estilos), cota com calibração → `mm` recalculado por `medirMm` e fator/modo da calibração; cota sem calibração → `{ erro: "A escala desta prancha ainda não foi definida pela equipe." }`; texto do rascunho.
- [ ] **Step 2: Refatorar** `criarPendencia` para `criarPendenciaNoTx` (numeração por documento, mesmos campos); `npx vitest run src/modules/projetos/pendencias` e `npm run smoke:sobreposicao` sem regressão.
- [ ] **Step 3:** `criarPedidoNoBanco` grava marcações (schema `marcacaoSchema` + texto 1–2000, até 50 marcações), cota recalculada pela `CalibracaoPrancha` (documento + página) ou recusa; aceite cria um rascunho por marcação (`publicar: false`, autor = quem aceitou) e grava `pendenciaId`.
- [ ] **Step 4: Smoke** ganha: `[OK] aceite cria rascunhos não publicados da coordenação com número seguindo o documento`, `[OK] rascunho no mesmo ponto e com a mesma geometria`, `[OK] cota sem calibração recusada`, `[OK] pendenciaId gravado`.
- [ ] **Step 5: Commit** `feat(portal): marcações do pedido viram rascunhos de apontamento no aceite`.

### Task 5: Visualizador do portal e detalhe da coordenação

**Files:** Create `src/app/(dashboard)/portal/[projetoId]/prancha/[uploadId]/page.tsx`, `src/components/portal/visualizador/visualizador-prancha.tsx` (cliente, `next/dynamic` sem SSR como o viewer interno), `barra-ferramentas.tsx`, `lista-marcacoes.tsx`, `rascunho-local.ts` (puro + test: chave por upload, ler/gravar/limpar com try/catch); Modify `arquivos-publico-view.tsx` (o olho no portal aponta para a rota nova via `acoesDoArquivo`/prop de link), `pedido-cliente-detalhe.tsx` (visualizador em modo leitura com as marcações do pedido).

- [ ] **Step 1:** Página: `requireUser`, externo, acesso ao projeto, `uploadLiberadoNoAlcance`; PDF pela rota de arquivo do portal que já existe (`disposition=inline`); calibração da página e marcações AGUARDANDO da mesma revisão (leitura) vão como props.
- [ ] **Step 2:** Visualizador: `PdfPagina` por página, zoom (`usePinchZoom`/`useZoomAncorado`, `SeletorZoom`), giro (`giro.ts`), camada de marcações (`MarcacaoSvg`). Modo "Pedir revisão": 6 ferramentas (`construirMarcacao`, `construirRabisco`, `construirMedidas`; cota desabilitada com o motivo sem calibração), texto por marcação, lista (lateral ≥ md, folha embaixo no celular), comentário, anexos, Enviar → `criarPedidoRevisao` + anexos. Rascunho em `localStorage` (`rascunho-local.ts`).
- [ ] **Step 3:** Detalhe da coordenação mostra o mesmo componente em modo leitura (sem ferramentas).
- [ ] **Step 4:** `npm run lint`, tsc, vitest; tela: cliente marca 1 de cada tipo (390 e 1366), envia, coordenação vê e aceita, rascunhos aparecem no visualizador interno na mesma posição (print lado a lado).
- [ ] **Step 5: Commit** `feat(portal): visualizador da prancha com marcações para pedir revisão`.

## Etapa 3 — avisos e portal

### Task 6: Avisos, card, selos e documentação

**Files:** Modify pedido `service.ts`/`actions.ts` (avisos), `src/lib/email-templates-meta.ts` (template `pedido-revisao-respondido`), `src/components/configuracoes/preferencias-view.tsx` (categoria `pedido_revisao_cliente` "Pedidos de revisão do cliente"), `src/app/(dashboard)/portal/[projetoId]/page.tsx` (card "Pedidos de revisão"), `arquivos-publico-view.tsx` (selo "Pedido aguardando" no portal), visualizador (marcações aguardando em leitura); Create `src/components/portal/pedidos-revisao-card.tsx`; docs: `docs/manual/inicio/portal-cliente.md`, seção "Pedidos de revisão do cliente" em `docs/manual/projetos/projetos.md` (não há página própria de Arquivos no manual), `search-index.json`, `CLAUDE.md` (bloco curto do módulo + categoria).

- [ ] **Step 1:** Pedido novo → `notificarMuitos(destinatariosDaConclusao({ coordenadores, gestores, autorId }), …, { categoria: "pedido_revisao_cliente" })`, href `/arquivos/pedidos-cliente/<id>`; resposta → `notificar(autor, …)` + `enviarEmailTemplate` (se `smtpConfigurado()`), template com `nome, projeto, prancha, situacao, resposta, url`; aviso nunca derruba a ação (try/catch + log), notificar injetável no serviço para o smoke.
- [ ] **Step 2:** Smoke ganha `[OK] pedido novo avisa a coordenação (ou gestores sem coordenador)`, `[OK] resposta avisa quem pediu`.
- [ ] **Step 3:** Card e selo; marcações aguardando no visualizador.
- [ ] **Step 4:** Manuais e CLAUDE.md (hunks próprios); lint, tsc, vitest, smokes do portal.
- [ ] **Step 5: Commit** `feat(portal): avisos e situação dos pedidos de revisão no portal`.

### Task 7: Auditoria final

- [ ] `docs/PROTOCOLO_AUDITORIA_FINAL.md` nível 4 (etapa completa, migração, portal externo): revisores `prisma-migration-reviewer`, `action-guardian`, `upload-storage-auditor`, `client-boundary-auditor`, `ui-state-linter`, `design-system-guardian`, `a11y-auditor`, `i18n-convention-reviewer`, `test-coverage-scout` + revisor final do branch.
- [ ] Tela completa (portal e coordenação, 1366/390, claro/escuro), prints + `LEIAME.md` em `prints-auditoria/2026-11-19_<hora>_pedido-revisao/`; overrides temporários removidos.
- [ ] `npm run build` com o dev parado; relatório em pt-BR; aviso de deploy (migração nova).
