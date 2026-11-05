# Sobreposição de disciplinas em 2D — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sobrepor as plantas (PDF/DWG) de várias disciplinas de um pavimento sobre uma base, alinhar cada uma com o
alinhamento guardado por documento, e transformar interferências em apontamentos (`Pendencia`) na prancha da disciplina
que deve alterar.

**Architecture:** Módulo novo `src/modules/coordenacao/sobreposicao/`, com a conta e as regras em arquivos puros testados
(transformação de similaridade, escolha do arquivo vigente, `SENA_ARQ`, conversão ponto ↔ pino, cruzamentos), um
`service.ts` com I/O chamado pelas actions e pelo smoke, e uma tela client-only (pdf.js + desenho do DXF em canvas) numa
sub-rota da aba Coordenação. O apontamento reaproveita as actions que já existem (`criarPendencia`, `enviarApontamentos`,
rota `/api/pendencias/anexo`): nada de segundo caminho de escrita de `Pendencia`.

**Tech Stack:** Next.js 15 (App Router, Server Actions via `defineAction`), React 19, Prisma 7 (PostgreSQL), pdfjs-dist 6,
canvas 2D, vitest, tsx (smoke).

**Spec:** [docs/superpowers/specs/2026-11-05-sobreposicao-disciplinas-design.md](../specs/2026-11-05-sobreposicao-disciplinas-design.md)
— ler inteiro antes da primeira tarefa. Este plano decide nomes, arquivos e testes. O spec decide o comportamento.

## Global Constraints

- Código em inglês ou português como o módulo vizinho (`coordenacao` usa português). **Todo texto de tela em pt-BR.** Commits em pt-BR, Conventional.
- Toda escrita por `defineAction` (`lib/with-action.ts`): `{ modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir", schema }` e, no handler, a checagem de escopo do projeto pela mesma regra da página (`projetoVisivel` de `modules/planejamento/queries`).
- Leitura: `coordenacao:ver` + `projetoVisivel`. Apontar: o gate de `criarPendencia` (`uploads:validar`) continua valendo por ser a mesma action.
- Sem `Promise.all` com o client de transação. Sem `prisma.pendencia.create` neste módulo.
- Arquivos puros (`transformacao.ts`, `regras.ts`, `cruzamentos.ts`, `pixels.ts`, `acoes.ts`) não importam Prisma, `server-only`, Next nem `node:*`, porque rodam no navegador.
- Import do Prisma de `@/generated/prisma/client`, nunca de `@prisma/client`.
- Nome do layer da arquitetura de fundo: constante `LAYER_ARQUITETURA = "SENA_ARQ"`, comparada sem diferenciar maiúsculas e minúsculas.
- Coordenadas: o **mundo** é Y para baixo, em pontos PDF da página do primeiro arquivo da base. Coordenada nativa de camada PDF = `page.getViewport({ scale: 1, rotation: 0 })`, que é o espaço de `Pendencia.x/y` (ver `components/pdf/pdf-pagina.tsx`, `rotacao = 0`, e `pendencias/giro.ts`). Coordenada nativa de camada DWG = `(x, -y)` do DXF, porque o DXF tem Y para cima e a similaridade não espelha.
- Menu de contexto pelo ADR-0002: descritor puro + `LinhaComMenu`/`BotaoAcoes` com o mesmo array, nunca handler de `contextmenu` à mão.
- `await confirm()` sempre antes de `startTransition`.
- Tela pesada atrás de `next/dynamic({ ssr: false })`. Viewport 390×844 sem rolagem horizontal; no celular o painel de camadas vira gaveta.
- Nada de `next build` com `next dev` rodando nesta pasta. Dev desta worktree: porta 3001, banco `senahub_remake_vscode`.

## Review Focus

1. **Camada cujo documento perdeu o arquivo do formato** (foi para a lixeira, ou o documento não tem `.dwg`): a cena abre, a camada mostra "Sem arquivo PDF/DWG vigente" e as outras desenham normalmente. Teste em `regras.test.ts` (`arquivoVigente` → `null`) e no smoke.
2. **DWG ainda convertendo ou com erro**: a camada mostra o estado da conversão e o botão "Usar o PDF". O resto da cena não espera. Teste no smoke (`cenaDaSobreposicao` devolve `dwg.status`).
3. **Clique fora da folha do PDF de destino ao apontar**: recusa com "O ponto fica fora da prancha de {disciplina}." e não chama `criarPendencia`. Teste em `regras.test.ts` (`pontoParaPino` → `null`).
4. **Dois coordenadores salvando o alinhamento da mesma camada**: o segundo recebe "Outra pessoa alinhou esta camada enquanto você editava. Recarregue para ver o alinhamento atual." Teste no smoke.
5. **Documento de outro projeto, ou sem o formato pedido, mandado para `adicionarCamada`**: recusa com mensagem, sem gravar. Teste no smoke.

---

### Task 1: Conta do alinhamento (pura)

**Files:**
- Create: `src/modules/coordenacao/sobreposicao/transformacao.ts`
- Test: `src/modules/coordenacao/sobreposicao/transformacao.test.ts`

**Interfaces:**
- Produces:
  - `type Ponto = { x: number; y: number }`
  - `type Alinhamento = { tx: number; ty: number; giro: number /* graus, horário em Y-baixo */; escala: number }`
  - `const IDENTIDADE: Alinhamento` (`{ tx: 0, ty: 0, giro: 0, escala: 1 }`)
  - `aplicar(a: Alinhamento, p: Ponto): Ponto` — `x' = s(cosθ·x − sinθ·y) + tx`, `y' = s(sinθ·x + cosθ·y) + ty`
  - `inverter(a: Alinhamento): Alinhamento`
  - `compor(externo: Alinhamento, interno: Alinhamento): Alinhamento` — `aplicar(compor(e,i), p) = aplicar(e, aplicar(i, p))`
  - `porUmPonto(atual: Alinhamento, origemNativa: Ponto, destinoMundo: Ponto): Alinhamento` — mantém giro e escala, só ajusta `tx/ty`
  - `porDoisPontos(o1: Ponto, o2: Ponto, d1: Ponto, d2: Ponto): { ok: true; alinhamento: Alinhamento } | { ok: false; erro: string }` — origens nativas, destinos no mundo
  - `encaixeInicial(caixaCamada: Caixa, caixaMundo: Caixa): Alinhamento` — giro 0, mesma largura, centros coincidentes
  - `type Caixa = { minX: number; minY: number; maxX: number; maxY: number }`
  - `const DISTANCIA_MINIMA = 1e-6` (relativa à diagonal da caixa dos pontos de origem)

- [ ] **Step 1: Escrever os testes**

```ts
it("aplicar ∘ inverter = identidade", () => {
  const a = { tx: 120, ty: -40, giro: 33, escala: 2.5 };
  const p = aplicar(inverter(a), aplicar(a, { x: 7, y: 11 }));
  expect(p.x).toBeCloseTo(7, 9); expect(p.y).toBeCloseTo(11, 9);
});
it("porDoisPontos recupera a transformação que gerou os destinos", () => {
  const a = { tx: 50, ty: 80, giro: -90, escala: 0.5 };
  const o1 = { x: 0, y: 0 }, o2 = { x: 100, y: 0 };
  const r = porDoisPontos(o1, o2, aplicar(a, o1), aplicar(a, o2));
  expect(r.ok && r.alinhamento.giro).toBeCloseTo(-90, 9);
  expect(r.ok && r.alinhamento.escala).toBeCloseTo(0.5, 9);
});
it("porDoisPontos recusa origens coincidentes", () => {
  expect(porDoisPontos({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, { x: 9, y: 9 }))
    .toEqual({ ok: false, erro: "Os dois pontos estão no mesmo lugar. Escolha pontos afastados." });
});
it("porDoisPontos recusa destinos coincidentes", () => { /* mesma mensagem */ });
it("porUmPonto só desloca", () => {
  const a = porUmPonto({ tx: 0, ty: 0, giro: 30, escala: 2 }, { x: 10, y: 0 }, { x: 500, y: 500 });
  expect(a.giro).toBe(30); expect(a.escala).toBe(2);
  const p = aplicar(a, { x: 10, y: 0 }); expect(p.x).toBeCloseTo(500); expect(p.y).toBeCloseTo(500);
});
it("compor bate com aplicar duas vezes", () => { /* dois alinhamentos quaisquer, um ponto */ });
it("encaixeInicial: mesma largura e mesmo centro", () => {
  const a = encaixeInicial({ minX: 0, minY: 0, maxX: 10, maxY: 5 }, { minX: 100, minY: 100, maxX: 300, maxY: 200 });
  expect(a.escala).toBe(20); expect(aplicar(a, { x: 5, y: 2.5 })).toEqual({ x: 200, y: 150 });
});
it("giro normalizado em (-180, 180]", () => { /* porDoisPontos com 270° devolve -90 */ });
```

- [ ] **Step 2:** `npx vitest run src/modules/coordenacao/sobreposicao/transformacao.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar.** `porDoisPontos`: escala = |d2−d1| / |o2−o1|, giro = atan2(d2−d1) − atan2(o2−o1), e depois `porUmPonto` com o par 1.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(coordenacao): conta do alinhamento da sobreposição 2D`

---

### Task 2: Regras puras da sobreposição

**Files:**
- Create: `src/modules/coordenacao/sobreposicao/regras.ts`
- Test: `src/modules/coordenacao/sobreposicao/regras.test.ts`

**Interfaces:**
- Consumes: `Alinhamento`, `Ponto`, `aplicar`, `inverter` (Task 1); `Primitiva` de `@/modules/dwg/parse` (só tipo).
- Produces:
  - `type Formato = "pdf" | "dwg"`
  - `const LAYER_ARQUITETURA = "SENA_ARQ"`
  - `formatoDoArquivo(nomeArquivo: string): Formato | null`
  - `arquivoVigente<T extends { id: string; nomeArquivo: string; versao: number; excluidoEm: Date | null }>(uploads: T[], formato: Formato): T | null` — maior `versao` do formato e fora da lixeira
  - `type EstadoAlinhamento = "sem_alinhamento" | "alinhada" | "revisao_anterior"`
  - `estadoDoAlinhamento(al: { uploadConferidoId: string | null } | null, uploadVigenteId: string | null): EstadoAlinhamento`
  - `ehLayerArquitetura(nome: string): boolean`
  - `primitivasDaCamada(primitivas: readonly Primitiva[], ehBase: boolean): { primitivas: Primitiva[]; achouArquitetura: boolean }` — fora da base, tira as do `SENA_ARQ`
  - `nativoDwg(p: Ponto): Ponto` → `{ x: p.x, y: -p.y }`
  - `pontoParaPino(mundo: Ponto, alinhamentoPdf: Alinhamento, pagina: { largura: number; altura: number }): { x: number; y: number } | null` — normalizado 0..1, `null` fora da folha
  - `pinoParaMundo(pino: { x: number; y: number }, alinhamentoPdf: Alinhamento, pagina: { largura: number; altura: number }): Ponto`
  - `const PALETA_CAMADAS: readonly string[]` (8 cores hex de bom contraste sobre branco; a base é `#374151`)
  - `corSugerida(usadas: readonly string[]): string` — primeira da paleta não usada; todas usadas → a menos repetida
  - `motivoParaNaoRemover(camada: { base: boolean }, totalCamadas: number): string | null` → base com outras camadas: `"Defina outra camada como base antes de remover esta."`

- [ ] **Step 1: Escrever os testes**, entre eles:
  - `arquivoVigente` ignora `excluidoEm` preenchido e outro formato; tudo na lixeira → `null`.
  - `estadoDoAlinhamento(null, "u1") === "sem_alinhamento"`; `({uploadConferidoId:"u1"}, "u1") === "alinhada"`; `({uploadConferidoId:"u0"}, "u1") === "revisao_anterior"`.
  - `ehLayerArquitetura("sena_arq") === true`, `("SENA_ARQ_COTAS") === false`.
  - `primitivasDaCamada` na base mantém tudo; fora da base tira só `SENA_ARQ` e devolve `achouArquitetura: true`.
  - `pontoParaPino` com `IDENTIDADE` e página 600×400: `(300,200)` → `{x:0.5,y:0.5}`; `(700,10)` → `null`; ida e volta com `pinoParaMundo` num alinhamento girado bate com 1e-9.
  - `corSugerida` não repete enquanto há cor livre.
- [ ] **Step 2:** `npx vitest run src/modules/coordenacao/sobreposicao/regras.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** `formatoDoArquivo` por extensão, sem diferenciar maiúsculas e minúsculas.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(coordenacao): regras da sobreposição 2D (arquivo vigente, SENA_ARQ, pino)`

---

### Task 3: Schema e migração

**Files:**
- Modify: `prisma/schema.prisma` (3 models novos + back-relations em `Projeto`, `DocumentoDisciplina`, `Upload`)
- Create: `prisma/migrations/<timestamp>_sobreposicao_planta/migration.sql`

**Interfaces:**
- Produces (Prisma):

```prisma
model SobreposicaoPlanta {
  id          String   @id @default(cuid())
  projetoId   String
  projeto     Projeto  @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  nome        String
  ordem       Int      @default(0)
  criadoPorId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  camadas     SobreposicaoCamada[]
  @@unique([projetoId, nome])
  @@map("sobreposicao_planta")
}

model SobreposicaoCamada {
  id             String              @id @default(cuid())
  sobreposicaoId String
  sobreposicao   SobreposicaoPlanta  @relation(fields: [sobreposicaoId], references: [id], onDelete: Cascade)
  documentoId    String
  documento      DocumentoDisciplina @relation(fields: [documentoId], references: [id], onDelete: Cascade)
  formato        String              // "pdf" | "dwg"
  base           Boolean             @default(false)
  cor            String
  opacidade      Int                 @default(80) // 0–100
  visivel        Boolean             @default(true)
  ordem          Int                 @default(0)
  pagina         Int                 @default(1)
  alinhamentos   SobreposicaoAlinhamento[]
  @@unique([sobreposicaoId, documentoId])
  @@index([documentoId])
  @@map("sobreposicao_camada")
}

model SobreposicaoAlinhamento {
  id                String             @id @default(cuid())
  camadaId          String
  camada            SobreposicaoCamada @relation(fields: [camadaId], references: [id], onDelete: Cascade)
  formato           String
  tx                Float
  ty                Float
  giro              Float
  escala            Float
  uploadConferidoId String?
  uploadConferido   Upload?            @relation(fields: [uploadConferidoId], references: [id], onDelete: SetNull)
  versao            Int                @default(1)
  salvoPorId        String
  salvoEm           DateTime           @default(now())
  @@unique([camadaId, formato])
  @@index([uploadConferidoId])
  @@map("sobreposicao_alinhamento")
}
```

- [ ] **Step 1:** Editar o schema. Rodar `npm run db:migrate -- --name sobreposicao_planta`. Se acusar drift e pedir reset, **não resetar**: seguir a memória `migracao-drift-reset` (gerar o SQL com `npx prisma migrate diff`, aplicar com `db execute`, `migrate resolve --applied`).
- [ ] **Step 2:** Acrescentar à `migration.sql`, fora do schema.prisma, o índice parcial de uma base por sobreposição:
  `CREATE UNIQUE INDEX "sobreposicao_camada_uma_base" ON "sobreposicao_camada" ("sobreposicaoId") WHERE "base";`
- [ ] **Step 3:** `npm run db:generate` e `npx tsc --noEmit -p tsconfig.json` (com `NODE_OPTIONS=--max-old-space-size=8192`) → sem erro novo.
- [ ] **Step 4: Commit** `feat(coordenacao): tabelas da sobreposição 2D`

---

### Task 4: Serviço, actions, leituras e smoke

**Files:**
- Create: `src/modules/coordenacao/sobreposicao/schemas.ts`, `service.ts`, `actions.ts`, `queries.ts`
- Create: `scripts/smoke-sobreposicao.ts`
- Modify: `package.json` (script `"smoke:sobreposicao": "tsx --tsconfig tsconfig.server.json scripts/smoke-sobreposicao.ts"`), `CLAUDE.md` (linha do smoke na lista de comandos)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces — `service.ts` (recebe `db: PrismaClient | Tx`, `userId`; lança `ActionError` com a mensagem pt-BR):
  - `criarSobreposicaoNoBanco(db, { projetoId, nome }, userId): Promise<{ id: string }>` — nome repetido no projeto → `"Já existe uma sobreposição com esse nome neste projeto."`
  - `renomearSobreposicaoNoBanco(db, { id, nome })`, `excluirSobreposicaoNoBanco(db, { id })`
  - `adicionarCamadaNoBanco(db, { sobreposicaoId, documentoId, formato }, userId): Promise<{ id: string }>` — o documento tem que ser de disciplina do MESMO projeto (`"Este documento não é deste projeto."`) e ter arquivo vigente do formato (`"Este documento não tem arquivo {PDF|DWG} vigente."`). A primeira camada nasce `base: true` com alinhamento `IDENTIDADE` conferido no arquivo vigente. Cor = `corSugerida`.
  - `atualizarCamadaNoBanco(db, { camadaId, cor?, opacidade?, visivel?, ordem?, formato?, pagina? })` — trocar formato exige arquivo vigente do novo formato (mesma mensagem).
  - `removerCamadaNoBanco(db, { camadaId })` — usa `motivoParaNaoRemover`.
  - `definirBaseNoBanco(db, { camadaId })` — numa transação: tira a base atual e marca esta. Não mexe em alinhamento nenhum (o mundo não muda).
  - `salvarAlinhamentoNoBanco(db, { camadaId, formato, alinhamento, versaoLida: number | null }, userId)` — `versaoLida = null` cria (P2002 → mensagem de corrida); senão `updateMany` condicionado a `versao = versaoLida`, `count ≠ 1` → `"Outra pessoa alinhou esta camada enquanto você editava. Recarregue para ver o alinhamento atual."`. Grava `uploadConferidoId` = arquivo vigente do formato e `versao + 1`.
  - `confirmarAlinhamentoNoBanco(db, { camadaId, formato, versaoLida }, userId)` — "Está certo": só troca `uploadConferidoId` para o vigente, com a mesma trava.
- `actions.ts`: uma action por função acima (`criarSobreposicao`, `renomearSobreposicao`, `excluirSobreposicao`, `adicionarCamada`, `atualizarCamada`, `removerCamada`, `definirBase`, `salvarAlinhamento`, `confirmarAlinhamento`), todas `{ modulo: "coordenacao", recurso: "coordenacao", permissao: "gerir", interno: true }`, com `capturarAntes` nas de edição, escopo do projeto checado no handler e `revalidatePath` da rota da Task 5.
- `queries.ts` (`server-only`):
  - `sobreposicoesDoProjeto(projetoId): Promise<{ id: string; nome: string; camadas: number }[]>` ordenado por `ordem, nome`
  - `cenaDaSobreposicao(sobreposicaoId, user): Promise<CenaSobreposicao | null>` — `null` se o projeto não for visível para o usuário
  - `documentosParaCamada(projetoId): Promise<{ documentoId: string; disciplina: string; titulo: string; temPdf: boolean; temDwg: boolean }[]>`
  - `type CenaSobreposicao = { id; nome; projetoId; podeGerir: boolean; camadas: CamadaDaCena[] }`
  - `type CamadaDaCena = { id; documentoId; disciplinaId; disciplina: string; titulo: string; formato: Formato; base; cor; opacidade; visivel; ordem; pagina; pdf: ArquivoDaCamada | null; dwg: (ArquivoDaCamada & { desenhoId: string; status: "fila" | "processando" | "concluido" | "erro" | "sem_conversao" }) | null; alinhamentos: Partial<Record<Formato, { alinhamento: Alinhamento; versao: number; estado: EstadoAlinhamento; revisaoConferida: string | null }>>; pinos: PinoDaCena[] }`
  - `type ArquivoDaCamada = { uploadId: string; revisao: string /* rotuloRevisao */; estado: string | null /* estado do ciclo, rótulo de tela */ }`
  - `type PinoDaCena = { id: string; numero: number; status: string; x: number; y: number; uploadId: string; rascunho: boolean; meu: boolean }` — pendências do documento em `STATUS_ABERTOS`, `excluidoEm: null`, `pagina = camada.pagina`, rascunho alheio fora (mesma regra de visibilidade do visualizador)

- [ ] **Step 1: Escrever o smoke** `scripts/smoke-sobreposicao.ts` no molde de `scripts/smoke-ifc-federado.ts` (cria projeto, disciplinas e `DocumentoDisciplina` com uploads `.pdf`/`.dwg` próprios, limpa no fim, recusa banco fora de `_remake|_dev|_test|_vscode`). Ele verifica:
  1. a primeira camada vira base com alinhamento identidade conferido;
  2. a segunda camada não é base e não tem alinhamento;
  3. documento de outro projeto → recusa, e nada gravado (Review Focus 5);
  4. `formato: "dwg"` em documento só com PDF → recusa (Review Focus 5);
  5. salvar alinhamento com `versaoLida` velha → mensagem de corrida (Review Focus 4);
  6. revisão nova do PDF (upload `versao` maior) → `estado: "revisao_anterior"`, e `confirmarAlinhamento` → `"alinhada"`;
  7. PDF na lixeira → `pdf: null` na cena, e as outras camadas vêm normais (Review Focus 1);
  8. DWG sem `ConversaoDesenho` → `dwg.status: "sem_conversao"` (Review Focus 2);
  9. remover a base com outra camada → recusa; `definirBase` troca e o índice parcial nunca deixa duas;
  10. excluir a sobreposição leva camadas e alinhamentos, e `Pendencia` do documento fica.
- [ ] **Step 2:** `npm run smoke:sobreposicao` → FAIL (serviço não existe).
- [ ] **Step 3: Implementar** `schemas.ts` (Zod; `cor` hex `#rrggbb`, `opacidade` 0–100, `nome` 1–60 caracteres, `formato` enum), `service.ts`, `queries.ts` e `actions.ts`.
- [ ] **Step 4:** `npm run smoke:sobreposicao` → todas as verificações OK. `npm test` → verde.
- [ ] **Step 5: Commit** `feat(coordenacao): serviço e ações da sobreposição 2D`

---

### Task 5: Abas internas da Coordenação e rota da tela

Decisão do dono (2026-11-05): a aba Coordenação ganha duas abas internas, **Modelo 3D (IFC)** | **Sobreposição 2D**, cada
uma com seu endereço. Com IFC convertido o padrão é o Modelo 3D, que fica exatamente como hoje. Sem IFC (EP típico) a
aba Coordenação abre na Sobreposição 2D. O IFC não vira camada da sobreposição.

**Files:**
- Create: `src/components/coordenacao/nav-coordenacao.tsx` — duas abas (links), a ativa pela rota; renderizada logo DEPOIS do `CabecalhoPagina` de cada página (nunca antes dele)
- Modify: `src/app/(dashboard)/projetos/[id]/coordenacao/page.tsx` — sem IFC convertido E sem `?3d=1` → `redirect` para `/projetos/[id]/coordenacao/sobreposicao`; com IFC, nada muda além da `NavCoordenacao` no topo. O link "Modelo 3D (IFC)" da nav leva `?3d=1`, para o projeto sem IFC ainda mostrar o "Nenhum modelo IFC" de hoje
- Create: `src/app/(dashboard)/projetos/[id]/coordenacao/sobreposicao/page.tsx` — `?s=<id>`; sem `s` abre a primeira; sem nenhuma, `EmptyState` com "Nova sobreposição"
- Create: `src/components/coordenacao/sobreposicao/nova-sobreposicao-dialog.tsx` (`FormData`, só o nome)
- Create: `src/modules/coordenacao/sobreposicao/acoes.ts` + `acoes.test.ts` — `itensDaSobreposicao({ podeGerir })` (renomear, excluir com confirmação) e `itensDaCamada({ podeGerir, base, formato, temPdf, temDwg, totalCamadas })` (definir como base, usar PDF/DWG, alinhar, remover desabilitado com o motivo de `motivoParaNaoRemover`)
- Create: `src/modules/coordenacao/nav.ts` + `nav.test.ts` — `abaInicialDaCoordenacao({ temIfcConvertido: boolean, pediu3d: boolean }): "3d" | "sobreposicao"` (pura) e a lista das 2 abas com `href`; teste que cada `href` tem `page.tsx`, no molde de `financeiro/nav.ts`

**Interfaces:**
- Consumes: `sobreposicoesDoProjeto`, `cenaDaSobreposicao`, `documentosParaCamada`, actions da Task 4.
- Produces: a página entrega `CenaSobreposicao` + `documentos` para `SobreposicaoView` (Task 6) via `next/dynamic({ ssr: false })`.

- [ ] **Step 1:** Testes de `nav.test.ts` (sem IFC e sem `?3d=1` → `"sobreposicao"`; com IFC → `"3d"`; sem IFC com `?3d=1` → `"3d"`) e de `acoes.test.ts`: sem `podeGerir` → nenhum item de escrita; base → "Definir como base" omitido; camada só com PDF → "Usar o DWG" desabilitado com `"Este documento não tem arquivo DWG vigente."`; remover a base com 2 camadas → desabilitado com o motivo.
- [ ] **Step 2:** `npx vitest run src/modules/coordenacao/sobreposicao/acoes.test.ts src/modules/coordenacao/nav.test.ts` → FAIL; implementar; → PASS.
- [ ] **Step 3:** Páginas e nav. Conferir na tela que o 3D de um projeto com IFC fica igual ao de antes (mesma posição, sem nada acima além da nav). A página abre com `CabecalhoPagina` (título "Sobreposição 2D", uma frase de descrição, ações: seletor de pavimento e "Nova sobreposição"). Gate: `requirePermission("coordenacao", "ver")` + `projetoVisivel`.
- [ ] **Step 4:** `npm run lint` e `npm test` → verdes.
- [ ] **Step 5: Commit** `feat(coordenacao): abas Modelo 3D e Sobreposição 2D na Coordenação`

---

### Task 6: Tela — camadas e desenho (PDF tingido, DWG sem SENA_ARQ)

**Files:**
- Create: `src/modules/coordenacao/sobreposicao/pixels.ts` + `pixels.test.ts`
- Create: `src/components/coordenacao/sobreposicao/sobreposicao-view.tsx` (barra: modos Sobrepor/Cortina/Cruzamentos, Alinhar, Apontar interferência, ⋯)
- Create: `src/components/coordenacao/sobreposicao/painel-camadas.tsx` (olho, cor, opacidade, revisão + estado, aviso de alinhamento, `LinhaComMenu`/`BotaoAcoes` com `itensDaCamada`, "+ Adicionar disciplina" com `documentosParaCamada`; seletor de página quando o PDF tem mais de uma; gaveta no celular)
- Create: `src/components/coordenacao/sobreposicao/palco.tsx` (canvas, zoom pela roda sob o cursor, pan arrastando, "ajustar à tela")
- Create: `src/components/coordenacao/sobreposicao/render-pdf.ts`, `render-dwg.ts` (client)

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5; `use-pdf-camadas.ts` (lógica de OCG que já existe); `/api/uploads/[id]/download?disposition=inline`; `/api/dwg/[desenhoId]/dxf` + `converterParaCena`.
- Produces:
  - `pixels.ts`: `tingir(dados: Uint8ClampedArray, cor: [number, number, number]): void` — in place: RGB = cor, alfa = `round(255 × (1 − luminância))` (fundo branco some, traço preto fica opaco); `mascaraDeTinta(dados: Uint8ClampedArray, limiar = 32): Uint8Array` (1 onde alfa > limiar)
  - `type CamadaRenderizada = { camadaId: string; formato: Formato; imagem: HTMLCanvasElement | OffscreenCanvas; caixaNativa: Caixa; avisoArquitetura: boolean }` — o palco compõe cada uma com `compor(vista, alinhamentoEfetivo)` via `setTransform`
  - `alinhamentoEfetivo(camada: CamadaDaCena, caixaMundo: Caixa, caixaNativa: Caixa): Alinhamento` (em `regras.ts`, com teste): salvo do formato → ele; senão `encaixeInicial`
  - `type Vista = Alinhamento` (giro sempre 0): tela = `aplicar(vista, mundo)`

- [ ] **Step 1:** Testes de `pixels.test.ts`: pixel branco → alfa 0; preto → alfa 255 com a cor da camada; cinza médio → alfa ≈ 128. `mascaraDeTinta` respeita o limiar. Teste de `alinhamentoEfetivo` em `regras.test.ts`.
- [ ] **Step 2:** `npx vitest run src/modules/coordenacao/sobreposicao` → FAIL; implementar `pixels.ts` e `alinhamentoEfetivo`; → PASS.
- [ ] **Step 3: Render PDF.** Rasterizar a página `camada.pagina` com `getViewport({ scale, rotation: 0 })`, `scale` limitado para a imagem não passar de 4096 px no lado maior. Fora da base: se `getOptionalContentConfig()` tem grupo cujo nome casa `ehLayerArquitetura`, deixar invisível antes do render; se não tem, `avisoArquitetura = true`. `tingir` com a cor da camada. A base é tingida também (cinza `#374151`).
- [ ] **Step 4: Render DWG.** Baixar o DXF, `converterParaCena`, `primitivasDaCamada(…, base)`, `nativoDwg` em cada ponto e desenhar vetorial na cor da camada, recriando ao mudar o zoom. Status ≠ `concluido` → sem desenho, o painel mostra o estado e o botão "Usar o PDF" (`atualizarCamada({ formato: "pdf" })`). `achouArquitetura === false` fora da base → aviso "Arquitetura de fundo não encontrada (layer SENA_ARQ)".
- [ ] **Step 5: Palco.** Ordem: base embaixo, depois `ordem`. `globalAlpha = opacidade/100`, camada invisível não desenha. A caixa do mundo é a caixa nativa da base passada pelo alinhamento dela.
- [ ] **Step 6: Conferir na tela** (porta 3001, `npm run dev -- -p 3001`): um pavimento com arquitetura PDF e estrutura DWG; olho, cor e opacidade respondem; 390×844 sem rolagem horizontal; 1366×768 com o menu aberto sem o cabeçalho sobrepor a barra.
- [ ] **Step 7:** `npm run lint`, `npm test` → verdes. **Commit** `feat(coordenacao): tela da sobreposição 2D com camadas PDF e DWG`

---

### Task 7: Alinhar (1 ponto, 2 pontos, ajuste fino) e revisão nova

**Files:**
- Create: `src/components/coordenacao/sobreposicao/ferramenta-alinhar.tsx`
- Modify: `palco.tsx` (modo de alinhamento: cliques devolvem ponto no mundo e na coordenada nativa da camada), `painel-camadas.tsx` (aviso "Alinhamento da revisão anterior ({revisaoConferida})" + "Está certo" + "Alinhar")

**Interfaces:**
- Consumes: `porUmPonto`, `porDoisPontos`, `inverter`, `aplicar` (Task 1); `salvarAlinhamento`, `confirmarAlinhamento` (Task 4).
- Produces: nada para outras tarefas.

- [ ] **Step 1: Comportamento** (o spec, seção "Alinhamento", é o contrato):
  - escolher a camada (a do menu "Alinhar" ou a selecionada no painel); durante o alinhamento a camada é desenhada **com** o `SENA_ARQ` em cinza `#9ca3af` (DWG: as primitivas do layer em cinza; PDF: sem esconder o grupo);
  - **1 ponto**: clique na camada → clique na base → `porUmPonto`;
  - **2 pontos**: dois pares camada → base → `porDoisPontos`; erro → `toast` com a mensagem;
  - **ajuste fino**: arrastar a camada; setas 1 px de tela, Shift+setas 10 px; campos X, Y, giro (°) e escala;
  - desfazer (Ctrl+Z) dentro da sessão; "Cancelar" volta ao salvo; "Salvar alinhamento" chama `salvarAlinhamento` com a `versao` lida da cena (`null` se não havia).
- [ ] **Step 2:** Implementar.
- [ ] **Step 3: Conferir na tela:** alinhar a estrutura por 2 pontos; recarregar e ver no lugar; subir uma revisão nova do DWG da estrutura e ver o aviso; "Está certo" tira o aviso. Alinhar com 1 ponto mantém a escala. Duas abas salvando → a segunda vê a mensagem de corrida.
- [ ] **Step 4:** `npm run lint`, `npm test` → verdes. **Commit** `feat(coordenacao): alinhar camadas da sobreposição 2D`

---

### Task 8: Apontar interferência, imagem de contexto, pinos e envio

**Files:**
- Create: `src/components/coordenacao/sobreposicao/apontar-dialog.tsx` (disciplina que deve alterar, entre as camadas visíveis, base inclusive; texto; os mesmos campos opcionais de classificação do apontamento comum)
- Create: `src/components/coordenacao/sobreposicao/rascunhos-painel.tsx` (lista dos meus rascunhos na cena + "Enviar apontamentos")
- Modify: `palco.tsx` (modo apontar; desenha `PinoDaCena` de todas as camadas visíveis via `pinoParaMundo`; clique no pino abre a prancha no apontamento pelo deep link que o visualizador de PDF já aceita — conferir o formato em `components/projetos/pdf-viewer.tsx` antes de montar a URL)

**Interfaces:**
- Consumes: `pontoParaPino`, `pinoParaMundo` (Task 2); `criarPendencia` e `enviarApontamentos` de `@/modules/projetos/pendencias/actions`; `POST /api/pendencias/anexo` (`pendenciaId`, `file`); `useLote` (`components/ui/use-lote.tsx`).
- Produces: nada para outras tarefas.

- [ ] **Step 1: Fluxo** (spec, "Apontar interferência", passos 1–7):
  1. "Apontar interferência" → clique no desenho → diálogo.
  2. Camada escolhida em DWG → o diálogo pede "Para apontar, use o PDF desta prancha" com o botão que troca o formato. PDF sem alinhamento salvo → "Alinhe o PDF desta prancha antes de apontar." Sem PDF vigente → "Esta prancha não tem PDF vigente para receber o apontamento."
  3. `pontoParaPino(mundo, alinhamentoPdf, tamanho da página em escala 1)`. `null` → "O ponto fica fora da prancha de {disciplina}." (Review Focus 3) e nada é chamado.
  4. `criarPendencia({ uploadId: camada.pdf.uploadId, pagina: camada.pagina, x, y, texto, … })`.
  5. Sucesso → recortar o palco como está na tela, 800×600 px centrados no ponto (borda do canvas limita), PNG, `POST /api/pendencias/anexo`. Falha do anexo → `toast` "Apontamento criado, mas a imagem da sobreposição não foi anexada." O apontamento não é desfeito.
  6. `router.refresh()` → o pino aparece como rascunho.
- [ ] **Step 2: Enviar.** `rascunhos-painel` agrupa meus rascunhos por `uploadId` e roda `useLote` com `acao: (uploadId) => enviarApontamentos({ uploadId })`, `substantivo: ["prancha", "pranchas"]`, confirmação com a contagem. O relatório de falha parcial é o do `useLote`.
- [ ] **Step 3: Conferir na tela:** apontar no tubo × pilar escolhendo o hidrossanitário; abrir a prancha do hidrossanitário e ver o pino no mesmo lugar, com a imagem anexada; enviar e ver a tarefa criada; clicar fora da folha → mensagem.
- [ ] **Step 4:** `npm run lint`, `npm test` → verdes. **Commit** `feat(coordenacao): apontar interferência na sobreposição 2D`

---

### Task 9: Cortina e Cruzamentos

**Files:**
- Create: `src/modules/coordenacao/sobreposicao/cruzamentos.ts` + `cruzamentos.test.ts`
- Modify: `sobreposicao-view.tsx`, `palco.tsx`

**Interfaces:**
- Consumes: `mascaraDeTinta` (Task 6); `agruparRegioes`, `TILE`, `RegiaoDiff` de `@/modules/projetos/pendencias/diff`.
- Produces: `gradeDeCruzamentos(a: Uint8Array, b: Uint8Array, largura: number, altura: number, tile = TILE, minimo = 4): { grade: Uint8Array; cols: number; rows: number }` — ladrilho marcado quando ≥ `minimo` pixels têm tinta nas duas máscaras; `cruzamentos(...)` = `agruparRegioes` dessa grade.

- [ ] **Step 1: Testes:** duas máscaras sem sobreposição → nenhuma região; um quadrado 20×20 nas duas → 1 região que o cobre; 3 pixels em comum com `minimo = 4` → nada.
- [ ] **Step 2:** `npx vitest run src/modules/coordenacao/sobreposicao/cruzamentos.test.ts` → FAIL; implementar; → PASS.
- [ ] **Step 3: Cortina:** escolher UMA camada; a base de um lado e essa camada do outro da divisória arrastável, na interação de `components/projetos/cortina-revisoes.tsx`.
- [ ] **Step 4: Cruzamentos:** escolher duas camadas (padrão: base + a selecionada). Rasterizar as duas na vista atual em canvases fora da tela, `mascaraDeTinta`, `cruzamentos`, desenhar retângulos vermelhos tracejados por cima. Contagem na barra ("12 cruzamentos"). Nunca cria apontamento. Recalcula ao soltar o zoom ou pan, não a cada quadro.
- [ ] **Step 5: Conferir na tela** e rodar `npm run lint`, `npm test`. **Commit** `feat(coordenacao): cortina e cruzamentos na sobreposição 2D`

---

### Task 10: Manual, CLAUDE.md e auditoria final

**Files:**
- Create: `docs/manual/<seção de coordenação>/sobreposicao-2d.md` (seguir o manifesto de `docs/manual/`) — montar pavimento, alinhar (1 ponto, 2 pontos, ajuste fino), `SENA_ARQ`, apontar e enviar
- Modify: `CLAUDE.md` — parágrafo curto sob "Coordenação BIM": módulo, mundo em pontos PDF com Y para baixo, DWG com `(x, −y)`, alinhamento por camada+formato com `uploadConferidoId`, apontamento só por `criarPendencia`, `SENA_ARQ`

- [ ] **Step 1:** Escrever os dois.
- [ ] **Step 2:** Rodar `docs/PROTOCOLO_AUDITORIA_FINAL.md`. Nível 3 (schema novo + tela nova + escrita em `Pendencia` por outro caminho de tela), com os revisores da seção 13 (`action-guardian`, `prisma-migration-reviewer`, `client-boundary-auditor`, `design-system-guardian`), prints em `prints-auditoria/2026-11-05_sobreposicao-2d/` com `LEIAME.md`.
- [ ] **Step 3: Commit** `docs(coordenacao): manual da sobreposição 2D`
