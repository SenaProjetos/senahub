# ART do projeto + CREA/CAU no cadastro + responsável no memorial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna deixada pela Fase 1 do plano de fundações: hoje `MemoriaIdentificacao` tem os campos `responsavel`/`registro`/`art`, mas **nenhum deles tem origem no banco** — só obra/cliente/local são preenchidos (a partir do `Projeto`). Este plano cria as três origens: **CREA/CAU no cadastro do usuário**, **ARTs do projeto (N por projeto, versionadas, visíveis nos Arquivos)** e o **seletor no cabeçalho do memorial** (ART da lista do projeto; responsável importado do próprio cadastro, mas sempre editável).

**Architecture:** Nenhum módulo novo. `User` ganha campos profissionais (mesmo grupo de `cargo`/`departamento`); `Art`/`ArtVersao` espelham o par `Certidao`/`CertidaoVersao` (padrão canônico de versionamento do repo) e vivem em `modules/projetos/art/`; o seletor do memorial persiste a escolha em `CalculoFerramenta` e alimenta a `MemoriaIdentificacao` já existente (`modules/ferramentas/memoria/types.ts`). Toda mutação passa por `defineAction` (auditoria automática).

**Tech Stack:** Prisma 7 (client em `@/generated/prisma/client`), PostgreSQL 17 (dev na 5433), TypeScript, Zod, Vitest (node env), React 19 + shadcn sobre base-ui.

**Origem:** Pedido do usuário em 2026-07-27, após a entrega das Fases 0–3 de [2026-07-27-calculadoras-fundacoes-melhorias.md](2026-07-27-calculadoras-fundacoes-melhorias.md), que expôs a lacuna.

---

## Decisões pendentes (confirmar ANTES de executar a Fase 1)

Cada uma muda materialmente o trabalho. A recomendação está marcada com ✅.

### D1 — CREA/CAU: campo no `User` ou reuso do `ResponsavelTecnico`?

`ResponsavelTecnico` (schema.prisma:2459) **já tem** `nome`, `registro`, `conselho` ("CREA" | "CAU" | outro) e `userId String? @unique`. Mas é um cadastro de licitações: gated em `licitacoes:gerir`, editado só dentro de `licitacao-detail-view.tsx`, e serve também para RTs **externos** (que não são usuários do sistema).

- **✅ (a) Campos no `User`, `ResponsavelTecnico` continua para RT externo.** `User.conselho`, `User.registroProfissional`, `User.registroUf`. Quem é usuário tem o dado no próprio cadastro (junto de `cargo`/`departamento`); `ResponsavelTecnico` segue existindo para RT de licitação sem login. Quando `ResponsavelTecnico.userId` está setado, a UI de licitações passa a **exibir** o dado do `User` (uma tarefa de consistência, Task 1.3).
  *Prós:* o pedido é literalmente "no cadastro dos usuários"; não mexe em licitações; sem permissão nova. *Contra:* dois lugares guardam registro profissional — mitigado pela regra de precedência acima.
- **(b) Só `ResponsavelTecnico`, ligado por `userId`.** Zero campo novo no `User`. *Contra:* para editar o próprio CREA o usuário precisaria de acesso a um cadastro de licitações; a tela de usuários teria que criar/editar linha de outra tabela. Contraria o pedido.

### D2 — Onde vive o arquivo (PDF) da ART e como ela "aparece nos Arquivos"?

`Upload` pendura em `Disciplina` (`disciplinaId` obrigatório), não em `Projeto`. ART é documento **de projeto** (e frequentemente por disciplina, mas nem sempre).

- **✅ (a) Arquivo no próprio registro (`arquivoPath`/`arquivoNome`, como `Certidao`) + nó virtual "ARTs" no explorador de arquivos.** O `ArquivosExplorer` ganha um nó read-only alimentado pela query de ARTs, com download por versão.
  *Prós:* não força uma disciplina onde não há; ART não some pela lixeira de uploads nem entra em validação/aprovação de disciplina (que não faz sentido para ela); mesmo padrão já usado por `Certidao`. *Contra:* não herda zip/lixeira/versionamento do `Upload` — mas a ART tem versionamento próprio, que é o pedido.
- **(b) ART como `Upload` numa `PastaProjeto` "ARTs".** Aparece nativamente na árvore. *Contra:* exige escolher uma disciplina para toda ART; sujeita a ART à lixeira e ao fluxo de validação de arquivos de projeto; duplica versionamento (`Upload.versao` × `ArtVersao`).

### D3 — A escolha de ART/responsável do memorial é persistida ou escolhida na exportação?

- **✅ (a) Persistida em `CalculoFerramenta`** (`artId` + snapshot `responsavelNome`/`responsavelRegistro`). Reexportar o mesmo cálculo dá o **mesmo** documento — memorial é registro técnico.
- **(b) Escolhida em cada exportação.** Sem migração, mas dois PDFs do mesmo cálculo podem sair com responsáveis diferentes.

### D4 — Permissão

- **✅ Reusar `projetos:ver` / `projetos:gerir`** para as ARTs. Não exige `npm run db:seed` no deploy.
- (b) Recurso novo `arts` no catálogo → mais granular, mas **exige `db:seed` em produção** (ver [memória sobre deploy de recursos novos]).

---

## Global Constraints

- **Migração Prisma:** este plano é o primeiro em muito tempo a mexer no schema. No banco de dev, `prisma migrate dev` acusa drift e quer resetar — usar o contorno já conhecido: `db push` → escrever a migração à mão em `prisma/migrations/` → `prisma migrate resolve --applied`. **Nunca** resetar o banco de dev.
- **Campos novos são todos opcionais** (`String?`) — nenhum cadastro existente quebra, nenhum backfill obrigatório.
- **Toda mutação via `defineAction`** (`lib/with-action.ts`): auditoria automática, com `capturarAntes` nas edições de ART e de dados profissionais do usuário.
- **Snapshot, não referência viva, no memorial:** o nome/registro do responsável são **copiados** para o `CalculoFerramenta` no momento da escolha. Se o CREA do usuário mudar depois, memoriais já emitidos não se alteram.
- **Código em inglês, UI/strings em pt-BR, commits Conventional em pt-BR.**
- **Prova de execução:** `npm run lint`, `npm test` e `npx tsc --noEmit` verdes antes de cada commit; não rodar `next build` com `next dev` ativo.

---

## Fases

- **Fase 1 — CREA/CAU no cadastro do usuário** (independente; entrega valor sozinha).
- **Fase 2 — Cadastro de ARTs do projeto, versionado** (depende só do schema).
- **Fase 3 — ARTs visíveis nos Arquivos do projeto** (depende da Fase 2).
- **Fase 4 — Seletor de ART + responsável no cabeçalho do memorial** (depende das Fases 1 e 2).

---

## FASE 1 — CREA/CAU no cadastro do usuário

### Task 1.1: Campos no schema + migração

**Files:**
- Modify: `prisma/schema.prisma` (model `User`, bloco "Profissional")

- [ ] **Step 1: Acrescentar os campos ao bloco Profissional do `User`**

```prisma
  // Profissional
  cargo                 String?
  departamento          String?
  /// Conselho profissional: "CREA" | "CAU" | "CFT" | outro. Nulo = não é profissional registrado.
  conselho              String?
  /// Número do registro no conselho (ex.: "1234567890"). Exibido como "CREA-SP 1234567890".
  registroProfissional  String?
  /// UF do registro (sigla). Separada do número para montar o rótulo e permitir filtro.
  registroUf            String?
```

- [ ] **Step 2: Aplicar no banco de dev sem resetar**

```bash
npx prisma db push
# depois criar a migração à mão em prisma/migrations/<timestamp>_art_crea/migration.sql
npx prisma migrate resolve --applied <timestamp>_art_crea
npm run db:generate
```

> Não usar `prisma migrate dev` aqui — acusa drift e propõe reset do banco de dev.

- [ ] **Step 3: `npx tsc --noEmit`** → deve passar (campos opcionais, nada quebra).

---

### Task 1.2: Helper de formatação + expor nos schemas/actions/UI

**Files:**
- Create: `src/modules/usuarios/registro.ts` (+ `.test.ts`)
- Modify: `src/modules/usuarios/schemas.ts`
- Modify: `src/modules/rh/cadastro/whitelist.ts`
- Modify: `src/components/rh/editar-cadastro-dialog.tsx`, `src/components/rh/pessoa-360-view.tsx`

**Interfaces:**
- Produces: `formatarRegistro({ conselho, registroProfissional, registroUf }): string | null` → `"CREA-SP 1234567890"`, ou `null` quando faltar conselho ou número. Puro, client-safe, testado.

- [ ] **Step 1: Teste do helper (falha antes)**

```ts
// registro.test.ts
import { describe, it, expect } from "vitest";
import { formatarRegistro } from "./registro";

describe("formatarRegistro", () => {
  it("monta o rótulo completo", () => {
    expect(formatarRegistro({ conselho: "CREA", registroProfissional: "123456", registroUf: "SP" }))
      .toBe("CREA-SP 123456");
  });
  it("omite a UF quando ausente", () => {
    expect(formatarRegistro({ conselho: "CAU", registroProfissional: "A99" })).toBe("CAU A99");
  });
  it("retorna null sem conselho ou sem número", () => {
    expect(formatarRegistro({ conselho: "CREA" })).toBeNull();
    expect(formatarRegistro({ registroProfissional: "123" })).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar `registro.ts`**

- [ ] **Step 3: Schemas** — acrescentar `conselho`, `registroProfissional`, `registroUf` (todos `.max(...).optional().or(z.literal(""))`) ao schema de edição de cadastro do RH. **Não** entram em `criarUsuarioSchema` (cadastro inicial já é longo) nem em `CAMPOS_AUTOEDITAVEIS` — registro profissional é dado de identidade, validado pelo RH como `cpf`/`cargo`.

- [ ] **Step 4: UI** — três campos no grupo "Profissional" do `editar-cadastro-dialog.tsx` (`conselho` como `Select` CREA/CAU/CFT/Outro; UF como `Select` das 27 siglas); exibir o rótulo formatado na `pessoa-360-view.tsx`.

- [ ] **Step 5: Rodar `npm run lint && npm test`; commit**

```bash
git commit -m "feat(rh): registro profissional (CREA/CAU) no cadastro do usuário"
```

---

### Task 1.3: Consistência com `ResponsavelTecnico` (decisão D1a)

- [ ] **Step 1:** Em `modules/licitacoes/tecnico/queries.ts`, quando `ResponsavelTecnico.userId` estiver setado, ler `nome`/`registro`/`conselho` do `User` vinculado (o `User` passa a ser a fonte de verdade para RT que é usuário).
- [ ] **Step 2:** Na UI de licitações, marcar esses RTs como "vinculado a usuário — editar no cadastro da pessoa" (campos read-only).
- [ ] **Step 3:** Commit — `refactor(licitacoes): RT vinculado a usuário lê o registro do cadastro da pessoa`.

---

## FASE 2 — Cadastro de ARTs do projeto (versionado)

### Task 2.1: Modelos `Art` e `ArtVersao`

Espelha `Certidao`/`CertidaoVersao` (schema.prisma, padrão canônico de versionamento).

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Modelos**

```prisma
/// Anotação/Registro de Responsabilidade Técnica de um projeto. Pode haver várias por projeto
/// (uma por disciplina, por etapa, ou complementares). O histórico fica em ArtVersao — o registro
/// "cabeça" carrega sempre os dados da versão vigente.
model Art {
  id           String      @id @default(cuid())
  projetoId    String
  projeto      Projeto     @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  /// Disciplina a que a ART se refere. Nulo = ART do projeto como um todo.
  disciplinaId String?
  disciplina   Disciplina? @relation(fields: [disciplinaId], references: [id], onDelete: SetNull)

  /// "ART" (CREA) | "RRT" (CAU) | "TRT" (CFT).
  tipo         String   @default("ART")
  /// Número do documento no conselho.
  numero       String
  descricao    String?
  /// rascunho | registrada | baixada | cancelada | substituida
  situacao     String   @default("registrada")
  emitidaEm    DateTime? @db.Date
  /// Valor pago da taxa (controle de custo do projeto).
  valor        Decimal?  @db.Decimal(10, 2)

  /// Responsável técnico: usuário do sistema (preferencial) OU nome/registro avulsos.
  responsavelUserId String?
  responsavelUser   User?   @relation("ArtResponsavel", fields: [responsavelUserId], references: [id])
  responsavelNome   String?
  responsavelRegistro String?

  arquivoPath String?
  arquivoNome String?

  versoes  ArtVersao[]
  calculos CalculoFerramenta[]

  autorId   String
  autor     User     @relation("ArtAutor", fields: [autorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projetoId])
  @@index([disciplinaId])
  @@map("art")
}

/// Uma versão da ART (substituição/aditivo/baixa). `numero` é sequencial por ART.
model ArtVersao {
  id          String    @id @default(cuid())
  artId       String
  art         Art       @relation(fields: [artId], references: [id], onDelete: Cascade)
  numero      Int
  numeroArt   String
  situacao    String
  emitidaEm   DateTime? @db.Date
  arquivoPath String?
  arquivoNome String?
  /// Por que esta versão existe (ex.: "substituída por alteração de área").
  observacao  String?
  autorId     String
  autor       User      @relation("ArtVersaoAutor", fields: [autorId], references: [id])
  createdAt   DateTime  @default(now())

  @@unique([artId, numero])
  @@map("art_versao")
}
```

Acrescentar as relações inversas: `arts Art[]` em `Projeto` e em `Disciplina`; `artsResponsavel`/`artsAutor`/`artVersoes` em `User`.

- [ ] **Step 2:** `db push` + migração à mão + `migrate resolve` + `db:generate` (mesmo procedimento da Task 1.1).

---

### Task 2.2: Módulo `modules/projetos/art/`

**Files:**
- Create: `src/modules/projetos/art/schemas.ts`, `queries.ts`, `actions.ts`, `service.ts`, `service.test.ts`

**Interfaces:**
- `listarArtsDoProjeto(projetoId)` → ARTs + contagem de versões, ordenadas por `createdAt desc`.
- `artComVersoes(id)`.
- `salvarArt` / `excluirArt` / `novaVersaoArt` (todas `defineAction`, `modulo: "projetos"`, `recurso: "projetos"`, `permissao: "gerir"` — decisão D4a).
- `service.ts` (puro, testado): `proximoNumeroVersao(versoes)`, `rotuloArt({tipo, numero})`, `SITUACOES_ART` + `podeReceberNovaVersao(situacao)`.

- [ ] **Step 1:** Testes do `service.ts` (numeração sequencial começando em 1; ART `cancelada` não recebe nova versão).
- [ ] **Step 2:** Implementar `service.ts`.
- [ ] **Step 3:** `queries.ts` + `actions.ts`. **`novaVersaoArt` é transacional:** cria a `ArtVersao` com os dados **atuais** da ART (arquivamento do estado anterior) e só então atualiza a `Art` com os dados novos.
- [ ] **Step 4:** Upload do PDF — rota multipart `src/app/api/projetos/[id]/art/route.ts` (arquivo binário não passa por Server Action), gravando via `resolverCaminho()` de `lib/storage.ts` (guarda anti-traversal).
- [ ] **Step 5:** `npm test && npm run lint`; commit.

---

### Task 2.3: UI — aba "ARTs" do projeto

**Files:**
- Create: `src/app/(dashboard)/projetos/[id]/arts/page.tsx`, `src/components/projetos/arts-view.tsx`, `art-dialog.tsx`, `art-versao-dialog.tsx`
- Modify: `src/modules/projetos/abas.ts` (nova aba configurável)

- [ ] **Step 1:** Acrescentar `"/arts"` a `ABAS_CONFIGURAVEIS` e `ABA_LABEL` (`"ARTs"`). A aba entra automaticamente no fim da ordem dos projetos já existentes (`aplicarConfigAbas` cobre isso — sem backfill de `abasConfig`).
- [ ] **Step 2:** `arts-view.tsx` — tabela (tipo/número, disciplina, responsável, situação com `StatusBadge`, emissão, versões, download). `EmptyState` quando vazio.
- [ ] **Step 3:** `art-dialog.tsx` — criar/editar. Responsável: `Select` de usuários com registro profissional preenchido (mostra o rótulo de `formatarRegistro`) **+ opção "Outro (digitar)"** que libera nome/registro livres.
- [ ] **Step 4:** `art-versao-dialog.tsx` — nova versão: número novo, situação, data, PDF e observação obrigatória.
- [ ] **Step 5:** Commit — `feat(projetos): cadastro de ARTs com versionamento`.

---

## FASE 3 — ARTs visíveis nos Arquivos do projeto

Decisão D2a: nó virtual read-only, não `Upload`.

**Files:**
- Modify: `src/modules/projetos/arquivos/queries.ts` (ou o componente, conforme a forma da árvore)
- Modify: `src/components/projetos/arquivos-explorer.tsx`
- Modify: `src/app/(dashboard)/projetos/[id]/arquivos/page.tsx` (carregar as ARTs)

- [ ] **Step 1:** `page.tsx` passa a carregar `listarArtsDoProjeto(id)` junto do resto (adicionar ao `Promise.all` existente).
- [ ] **Step 2:** `ArquivosExplorer` ganha um nó "ARTs" no mesmo nível dos pacotes, listando `tipo + número` e as versões como filhos. Cada nó com arquivo tem download; nós sem arquivo aparecem esmaecidos com "sem PDF anexado".
- [ ] **Step 3:** Nó **read-only** — sem enviar/excluir/validar por ali; ação "Gerir ARTs" leva para a aba.
- [ ] **Step 4:** Verificar na UI que o link público de arquivos (`LinkPublicoArquivos`) **não** expõe as ARTs (documento interno) — ou expõe, se for decisão do usuário. **Confirmar antes de implementar.**
- [ ] **Step 5:** Commit — `feat(arquivos): ARTs do projeto visíveis no explorador de arquivos`.

---

## FASE 4 — Seletor de ART e responsável no memorial

### Task 4.1: Persistir a escolha no cálculo (decisão D3a)

**Files:**
- Modify: `prisma/schema.prisma` (model `CalculoFerramenta`)

- [ ] **Step 1:** Campos novos, todos opcionais:

```prisma
  /// ART do projeto associada a este memorial (cabeçalho técnico).
  artId               String?
  art                 Art?    @relation(fields: [artId], references: [id], onDelete: SetNull)
  /// Snapshot do responsável no momento da emissão — não acompanha alterações posteriores
  /// no cadastro da pessoa (memorial é registro técnico datado).
  responsavelNome     String?
  responsavelRegistro String?
```

- [ ] **Step 2:** `db push` + migração à mão + `migrate resolve` + `db:generate`.

### Task 4.2: Preencher `MemoriaIdentificacao` a partir do cálculo

**Files:**
- Modify: `src/modules/ferramentas/queries.ts` (`memoriaDoCalculo`)

Hoje o bloco monta só obra/cliente/local. Passa a montar também:

```ts
  const identificacao = calc.projeto
    ? {
        obra: `${calc.projeto.codigo} — ${calc.projeto.nome}`,
        cliente: calc.projeto.cliente.nome,
        local: calc.projeto.endereco ?? undefined,
        responsavel: calc.responsavelNome ?? undefined,
        registro: calc.responsavelRegistro ?? undefined,
        art: calc.art ? `${calc.art.tipo} ${calc.art.numero}` : undefined,
        assinaturas: Boolean(calc.responsavelNome),
      }
    : undefined;
```

- [ ] **Step 1:** Incluir `art` no `include` de `abrirCalculo`.
- [ ] **Step 2:** Montar a identificação como acima.
- [ ] **Step 3:** Teste do render já existe (`memoria/render-html.test.ts`) — acrescentar um caso cobrindo `art` + `assinaturas` vindos do cálculo.

### Task 4.3: UI — escolher ART e responsável ao salvar o cálculo

**Files:**
- Modify: `src/components/ferramentas/salvar-dialog.tsx`
- Modify: `src/modules/ferramentas/actions.ts` (schema do salvar)

- [ ] **Step 1:** Quando um projeto está selecionado no diálogo, carregar as ARTs dele e mostrar um `Select` (opção "— sem ART —" continua válida).
- [ ] **Step 2:** Responsável: prefill com o registro do **usuário logado** (`formatarRegistro`), campo de texto **sempre editável**; escolher uma ART com responsável definido re-prefilla os campos (sem travar).
- [ ] **Step 3:** Persistir `artId`/`responsavelNome`/`responsavelRegistro` no `CalculoFerramenta`.
- [ ] **Step 4:** Verificar o PDF gerado: cabeçalho com obra/cliente/responsável/ART e bloco de assinaturas.
- [ ] **Step 5:** `npm test && npm run lint && npm run build`; commit — `feat(ferramentas): seleção de ART e responsável técnico no memorial`.

---

## Fora de escopo (backlog)

- **Alerta de vencimento/baixa de ART** (job em `lib/jobs-handlers.ts` + categoria de notificação, como já existe para `certidao`). Só quando houver processo definido de baixa.
- **ART em documentos que não são memorial de cálculo** (pranchas do Estúdio, documentos jurídicos) — mesmo modelo `Art`, outro consumidor.
- **Importação automática do CREA** (consulta ao conselho) — não há API pública estável.
- **Migrar `ResponsavelTecnico` inteiramente para `User`** — só se os RTs externos deixarem de existir.

---

## Self-Review

- **Cobertura do pedido:** CREA/CAU no cadastro → Fase 1; ART por projeto, N por projeto, versionada → Fase 2; exibir nos arquivos → Fase 3; seletor no cabeçalho com responsável importável mas editável → Fase 4. ✔
- **Fases independentes:** 1 entrega sozinha (registro no cadastro); 2 entrega sozinha (cadastro de ART); 3 depende de 2; 4 depende de 1 e 2. ✔
- **Decisões materiais isoladas no topo** (D1–D4), com recomendação — nenhuma enterrada no meio das tasks. ✔
- **Riscos declarados:** migração no banco de dev sem reset; `assinaturas` passa a sair no PDF quando há responsável (mudança visível em memorial já existente — por isso é opt-in por cálculo, campo nulo = documento igual ao de hoje). ✔
