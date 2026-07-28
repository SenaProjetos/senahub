# Engenharia de Custos — Onda C1: Bancos

**Data:** 2026-07-28 · **Status:** plano aguardando OK · **Branch:** `dev` · **Modelo:** Sonnet

Depende de: [C0 — Fundação](2026-07-27-custos-c0-fundacao.md) (implementada, commits `9c0c2d5`/`9bc7695`,
schema em `804bc37`). Fonte arquitetural: [design de conformidade](../specs/2026-07-27-engenharia-custos-design.md).

---

## 1. Goal

Banco de insumos, composições (com auxiliar) e bases de preço, com **importador real do SINAPI**
(job pg-boss) e CRUD de composição própria. Ao fim: importar a base real fornecida, navegar/buscar
insumos e composições, criar composição própria com itens, e ver o custo unitário calculado a partir
dos coeficientes — nunca copiado do SINAPI.

## 2. D2 — resolvido com arquivo real

Amostra: `docs/SINAPI-2026-06-formato-xlsx.zip` (Caixa, mês de referência 06/2026). Contém 4 arquivos;
**só o `SINAPI_Referência_2026_06.xlsx` (13 MB) entra no importador desta onda** — os outros 3
(`mao_de_obra` = % de mão de obra por composição/UF, `familias_e_coeficientes` = substituição regional
de insumo equivalente, `Manutenções` = changelog mês a mês) não alimentam nenhum item do DoD de C1;
ficam registrados como uso futuro (§9).

### 2.1 Estrutura real do `Referência.xlsx` (inspecionada com ExcelJS, não suposta)

| Planilha | Papel | Cabeçalho real | Observação |
|---|---|---|---|
| `ISD` / `ICD` / `ISE` | Preço de **insumo** por UF — SEM desoneração / COM desoneração / SEM encargos | linha **10**: `Classificação, Código do Insumo, Descrição, Unidade, Origem de Preço, AC..TO` (27 UFs) | Dados de valores puros (`cell.type` numérico); célula de preço vazia = **sem cotação naquela UF**, não é zero. `Classificação` ∈ {SERVIÇOS, MATERIAL, MAO DE OBRA, ENCARGOS COMPLEMENTARES, EQUIPAMENTO (AQUISIÇÃO), ESPECIAIS} → vira `CustoInsumo.categoria`. 4.876 insumos, catálogo **idêntico** nas 3 planilhas (só o preço muda). |
| `CSD` / `CCD` / `CSE` | Custo **total** de composição por UF, já somado pelo SINAPI | — | **Fora do importador.** O código da composição é uma fórmula `HYPERLINK(...)` (`cell.type === 6`, `.text` vazio) — não vale a pena parsear só para um valor que vamos recalcular do zero em `composicao.ts` a partir do próprio Analítico. Evita duplicar lógica de custo em dois lugares. |
| `Analítico` | **Estrutura** de cada composição (o que importa) | linha 10: `Grupo, Código da Composição, Tipo Item, Código do Item, Descrição, Unidade, Coeficiente, Situação` | Sem coluna de UF — coeficientes são **nacionais**, só o preço varia por UF. Linha "cabeçalho" da composição = `Tipo Item` vazio; linhas seguintes = itens, `Tipo Item` ∈ {`INSUMO`, `COMPOSICAO`}. **Confirmado com dado real**: código 88316 ("SERVENTE COM ENCARGOS COMPLEMENTARES") é ele mesmo uma composição-cabeçalho com um item `COMPOSICAO` (curso, código 95378) e um item `INSUMO` (EPI, código 43491) — SINAPI aninha mão de obra dentro de composição. **Composição auxiliar recursiva não é opcional, é obrigatória** para importar mão de obra corretamente. 10.454 composições, 21.612 itens INSUMO + 34.045 itens COMPOSICAO = 55.657 itens. |
| `Analítico com Custo` | Planilha-modelo (macro/fórmula, usuário digita 1 código por vez) | — | 201 linhas, não é dado em lote. Fora do importador. |

### 2.2 Escopo deste import (decisão do usuário)

- **UFs:** `PE`, `RN`, `MG` (parametrizável por import — não hardcoded no mapeador; outra UF é só rodar
  de novo marcando-a).
- **Regimes:** os 3 juntos (`sem_desoneracao`, `com_desoneracao`, `sem_encargos`).
- Volume real desta carga (contado no arquivo, não estimado): 4.876 insumos · 10.454 composições ·
  55.657 itens · preços = 11.518 células não-vazias por planilha de regime × 3 regimes = **34.554**
  `CustoPreco`. Total ≈ **105.500 linhas** numa carga só → confirma job pg-boss, nunca Server Action
  (design §7 já previa isso para "SINAPI ~50 mil linhas"; o real é o dobro).

---

## 3. Architecture

### 3.1 Ajuste de schema sobre o esboço do design (§5.2) — com justificativa

O design original sugeria `CustoBasePreco` = 1 base por UF (`"SINAPI-PE"`) e `CustoComposicao` com
`@@unique([baseId, codigo])`. Aplicado ao arquivo real isso duplicaria a **estrutura** da composição
(que não tem UF) uma vez por UF×regime escolhido — 9× neste import (10.454 → 94.086 linhas,
55.657 → 500.913 linhas) só porque o preço varia por UF, não o coeficiente.

**Ajuste:** `CustoBasePreco` ganha `uf`/`regime` **não-nulos com sentinela** (`"NACIONAL"` / `"padrao"`)
em vez de nulos — nulo não force unicidade no Postgres (`NULL ≠ NULL`), sentinela sim. Existem dois
tipos de base, ambos na mesma tabela:

- **Base de preço** (`uf` = sigla real, `regime` = um dos 3): só guarda `CustoPreco`.
- **Base estrutural** (`uf = "NACIONAL"`, `regime = "padrao"`): âncora de `CustoComposicao` — 1 linha
  por `(fonte, dataBase)`, nunca duplicada por UF. Composição própria (fonte `"propria"`) usa uma base
  estrutural singleton própria (criada sob demanda, `dataBase` = data da 1ª composição própria).

Resultado desta carga: **9** `CustoBasePreco` de preço (3 UF × 3 regime) + **1** estrutural = 10.
`CustoComposicao`/`CustoComposicaoItem` importam **uma única vez**, não 9×.

### 3.2 Schema novo (`prisma/schema.prisma`)

```prisma
enum CategoriaInsumo { servicos material mao_de_obra encargos_complementares equipamento especiais }

model CustoInsumo {
  id          String   @id @default(cuid())
  codigo      String   // código SINAPI, string p/ acomodar outras fontes não-numéricas depois
  fonte       String   // "sinapi" | "propria" | ...
  descricao   String
  unidade     String
  categoria   CategoriaInsumo
  precos      CustoPreco[]
  itensUsando CustoComposicaoItem[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([fonte, codigo])
  @@index([fonte])
}

model CustoBasePreco {
  id          String   @id @default(cuid())
  nome        String   // rótulo: "SINAPI-PE (sem desoneração) — 06/2026" | "SINAPI — estrutural — 06/2026"
  fonte       String   // "sinapi" | "sicro" | "propria"
  uf          String   @default("NACIONAL")
  regime      String   @default("padrao") // sem_desoneracao | com_desoneracao | sem_encargos | padrao
  dataBase    DateTime @db.Date
  ativo       Boolean  @default(true)
  precos      CustoPreco[]
  composicoes CustoComposicao[]
  createdAt   DateTime @default(now())
  @@unique([fonte, uf, regime, dataBase])
  @@index([fonte, uf])
}

model CustoPreco {
  id        String         @id @default(cuid())
  baseId    String
  base      CustoBasePreco @relation(fields: [baseId], references: [id], onDelete: Cascade)
  insumoId  String
  insumo    CustoInsumo    @relation(fields: [insumoId], references: [id], onDelete: Cascade)
  valor     Decimal        @db.Decimal(14, 2)
  createdAt DateTime       @default(now())
  @@unique([baseId, insumoId])
  @@index([insumoId])
}

model CustoComposicao {
  id          String   @id @default(cuid())
  baseId      String
  base        CustoBasePreco @relation(fields: [baseId], references: [id], onDelete: Cascade)
  codigo      String
  descricao   String
  unidade     String
  grupo       String?
  itens       CustoComposicaoItem[]
  usadaComoItem CustoComposicaoItem[] @relation("ComposicaoAuxiliar")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([baseId, codigo])
  @@index([baseId])
}

enum TipoItemComposicao { insumo composicao }

model CustoComposicaoItem {
  id                String   @id @default(cuid())
  composicaoId      String
  composicao        CustoComposicao @relation(fields: [composicaoId], references: [id], onDelete: Cascade)
  tipo              TipoItemComposicao
  insumoId          String?
  insumo            CustoInsumo? @relation(fields: [insumoId], references: [id])
  composicaoAuxId   String?
  composicaoAux     CustoComposicao? @relation("ComposicaoAuxiliar", fields: [composicaoAuxId], references: [id])
  coeficiente       Decimal  @db.Decimal(12, 6)
  ordem             Int      @default(0)
  createdAt         DateTime @default(now())
  @@index([composicaoId])
  @@index([insumoId])
  @@index([composicaoAuxId])
}

/// Rastreio de import assíncrono — espelha ConversaoModelo (fila/processando/concluido/erro + progresso).
model CustoImportacao {
  id                 String   @id @default(cuid())
  fonte              String   @default("sinapi")
  dataBase           DateTime @db.Date
  ufs                String[]
  regimes            String[]
  caminhoArquivo     String   // relativo a STORAGE_BASE_PATH
  status             String   @default("fila") // fila | processando | concluido | erro
  progresso          Int?
  insumosCriados     Int      @default(0)
  precosCriados      Int      @default(0)
  composicoesCriadas Int      @default(0)
  itensCriados       Int      @default(0)
  erro               String?
  autorId            String
  autor              User     @relation(fields: [autorId], references: [id])
  iniciadoEm         DateTime?
  concluidoEm        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([status])
}
```

`item XOR`: `tipo=insumo` → `insumoId` obrigatório/`composicaoAuxId` nulo; `tipo=composicao` → o
inverso. Validado no mapeador e num `CHECK` não é possível de forma limpa entre 2 FKs opcionais no
Prisma — validação fica no `service.ts` (mesma abordagem do XOR `projetoId`/`nomeAvulso` em C0).

### 3.3 Módulo puro `composicao.ts` (+ testes)

Recebe **resolvers em memória** (não Prisma) — quem popula os Maps é `queries.ts`/o job, o cálculo em
si é puro e testável com fixtures pequenas (não com o arquivo de 66 mil linhas):

```ts
type ItemRef = { tipo: "insumo" | "composicao"; refId: string; coeficiente: number };
type ResolverItens = (composicaoId: string) => ItemRef[] | undefined;
type ResolverPreco = (insumoId: string) => number | undefined;

calcularCustoUnitario(composicaoId, resolverItens, resolverPreco, { profundidadeMax = 8 } = {}):
  { ok: true; custoUnitario: number; semPreco: string[] /* ids sem cotação, custo parcial */ }
  | { ok: false; erro: string } // ciclo detectado ou profundidade excedida
```

Recursivo com **detecção de ciclo** (visitados por caminho) e **profundidade controlada** (design §2.1:
"composição auxiliar... com profundidade controlada"). Insumo sem preço na base escolhida não aborta o
cálculo — soma 0 e lista em `semPreco` (a tela mostra "custo parcial, X insumo(s) sem cotação").

Testes: composição simples (só insumo), composição com auxiliar 1 nível (espelha o caso real 88316),
2 níveis, ciclo (`A→B→A`) rejeitado, profundidade estourada rejeitada, insumo sem preço não quebra o
cálculo.

### 3.4 Importador SINAPI (job pg-boss)

**Não reusa `lib/import/planilha.ts#lerPlanilha`** — aquele helper assume 1 sheet, header na linha 1,
sinônimo pt-BR (pensado pra CSV/XLSX de terceiro nesse formato livre). O Referência é um relatório
oficial de layout fixo: 4 sheets nomeadas, header na linha 10, sem sinônimo a resolver. Reaproveita
o **padrão** de `lib/import/*` (ExcelJS via `createRequire` — mesmo contorno do Turbopack — e o
extrator de célula rich-text/hyperlink de `celulaTexto()`), não a função pronta.

`modules/custos/composicoes/importador-sinapi.ts` (puro: recebe o `Workbook` já carregado, devolve
listas normalizadas — sem Prisma, testável com um `.xlsx` fixture pequeno de 2-3 linhas por sheet
criado à mão, não o arquivo de 13 MB):

1. `lerInsumos(sheet, regime)` → `{codigo, descricao, unidade, categoria, precosPorUf: Map<UF, number>}[]`,
   pulando linhas sem `Código do Insumo`.
2. `lerComposicoes(sheetAnalitico)` → duas listas: cabeçalhos (`{codigo, descricao, unidade, grupo}`) e
   itens (`{composicaoCodigo, tipo, itemCodigo, coeficiente}`), usando a troca de `Tipo Item` vazio →
   presente pra saber onde uma composição termina e a próxima começa.

`lib/jobs-handlers.ts` ganha `importar-base-custos(job)`:
- Lê o `.xlsx` de `STORAGE_BASE_PATH` (via `resolverCaminho()`), roda os 2 parsers puros acima.
- **Passo 1:** upsert `CustoBasePreco` (9 de preço + 1 estrutural) → upsert `CustoInsumo` (dedup por
  código, since catálogo idêntico nas 3 planilhas) → `createMany` de `CustoPreco` em lotes de 2.000.
- **Passo 2:** `createMany` de `CustoComposicao` (base estrutural) em lotes de 2.000 → resolve
  `composicaoAuxId`/`insumoId` por código (Map em memória, não N+1 query) → `createMany` de
  `CustoComposicaoItem` em lotes de 2.000.
- Atualiza `CustoImportacao.progresso`/contadores a cada lote; `status: concluido` ou `erro` + `erro`
  no fim. Nunca lança sem gravar o erro na linha (senão a import fica "processando" pra sempre).
- Idempotente por reexecução: upserts por chave natural (`fonte+codigo`, `fonte+uf+regime+dataBase`,
  `baseId+codigo`) — reimportar o mesmo mês não duplica.

`enfileirarImportacaoCusto()` em `service.ts` (mesmo papel de `enfileirarConversao` em coordenação):
cria a linha `CustoImportacao` (`status: fila`) e publica no boss via `getBoss()`
(`globalThis.__senahubBoss`, nunca módulo-scoped — mesma regra de `lib/socket.ts`/`lib/jobs.ts`). Sem
worker em `npm run dev`; fica em `fila`.

### 3.5 Upload

`POST /api/custos/importar-base` (multipart, único uso REST desta onda): `requirePermission("custos","bancos")`
→ valida extensão `.xlsx` + tamanho (`IMPORT_TAMANHO_MAX` de `lib/import/planilha.ts`, 20 MB — o arquivo
real tem 13 MB) → grava via `resolverCaminho()`/storage → devolve `{caminho}`. A action
`iniciarImportacaoBase({caminho, dataBase, ufs, regimes})` chama `enfileirarImportacaoCusto`.

### 3.6 Composição própria (CRUD)

`actions.ts`/`queries.ts` em `modules/custos/composicoes/`: criar composição (`fonte: "propria"`, base
estrutural própria singleton), adicionar/remover/reordenar item (insumo de qualquer base ativa ou
composição existente como auxiliar), com o mesmo XOR de `service.ts`. Custo unitário recalculado ao
vivo na tela via `composicao.ts` (sem persistir "custoUnitario" na composição nesta onda — quem
materializa preço é o **item de orçamento** em C2, aqui é só consulta).

---

## 4. Tech Stack

Nada novo. ExcelJS (já dependência, via `createRequire`) · pg-boss (`lib/jobs.ts`/`lib/jobs-handlers.ts`)
· `resolverCaminho()`/storage · `defineAction`/`parseListParams` · vitest. **Zero dependência nova.**

## 5. Global Constraints

Mesmas de C0 (§5 do plano C0) +: import pesado **só** em job pg-boss, nunca Server Action; mapeador do
Referência é módulo puro (sem Prisma) testado com fixture pequena; código de insumo/composição
publicado é chave estável (`fonte+codigo`) — nunca reescrever ao reimportar, só upsert.

## 6. Passos

### Passo 1 — Schema + migração
- [ ] Models/enums de §3.2. `npm run db:migrate` (nome `custos_bancos`) + `db:generate`. Se der drift,
      contorno do C0 (db push + migração à mão + `migrate resolve`), não `reset` às cegas.

**Aceite:** `npx tsc --noEmit` limpo com o client regenerado; `npx prisma validate` ok.

### Passo 2 — `composicao.ts` puro + testes (§3.3)
**Aceite:** `npx vitest run` do arquivo verde, incluindo ciclo/profundidade/insumo-sem-preço.

### Passo 3 — `importador-sinapi.ts` puro + testes com fixture pequena
- [ ] Fixture `.xlsx` de 2-3 insumos + 1 composição com 1 item auxiliar (espelhando o caso real 88316),
      criada por script e comitada em `src/modules/custos/composicoes/__fixtures__/`.
- [ ] `lerInsumos`/`lerComposicoes` cobertos: linha de metadado (1-9) ignorada, `Tipo Item` vazio inicia
      composição nova, célula de preço vazia não vira `CustoPreco`, categoria mapeada certo.

**Aceite:** testes verdes; nenhum import de Prisma no arquivo.

### Passo 4 — Job `importar-base-custos` + rota de upload + `enfileirarImportacaoCusto`
- [ ] `lib/jobs-handlers.ts`: handler batelado (lotes de 2.000), upsert idempotente, grava progresso/erro.
- [ ] `/api/custos/importar-base` (multipart) + action `iniciarImportacaoBase`.

**Aceite:** rodando `npm run dev:server`, importar o arquivo real (PE/RN/MG × 3 regimes) sem estourar
memória/tempo; `CustoImportacao` termina `concluido` com os 4 contadores batendo com §2.2; reimportar
não duplica (mesmo total de linhas antes/depois).

### Passo 5 — Queries/actions de insumos, composições, bases
- [ ] Listagem paginada (`parseListParams`) de insumos e composições, busca por código/descrição.
- [ ] `obterComposicao(id, {baseUf, regime})` monta os Maps e chama `composicao.ts` pro custo unitário.
- [ ] CRUD de composição própria (§3.6) por `defineAction`, `recurso: "custos"`, `permissao: "bancos"`.

**Aceite:** usuário sem `custos:bancos` não vê botão de criar/importar; com `custos:bancos`, cria
composição própria com 2 itens (1 insumo + 1 sub-composição) e o custo bate com cálculo manual.

### Passo 6 — Telas
- [ ] `/custos/bancos` (nova área, gated `custos:bancos`): abas Bases · Insumos · Composições.
- [ ] Dialog de import: upload + checkboxes de UF (lista fixa de 27 siglas) + regime + data-base
      (auto-detectada de "Mês de Referência", editável) → mostra progresso da `CustoImportacao`
      (poll simples, sem socket nesta onda).
- [ ] Lista + busca de insumos; lista + busca de composições; detalhe de composição = itens (com
      indentação por nível de auxiliar) + seletor de UF/regime + custo unitário calculado.
- [ ] Form de composição própria (header + itens, adicionar insumo ou sub-composição existente).

**Aceite:** DoD (§7) reproduzido no navegador.

### Passo 7 — Verificação e commit
- [ ] `npx tsc --noEmit` · `npm test` · `npm run lint` · `npm run build`.
- [ ] Commit `feat(custos): banco de composições, insumos e importador SINAPI`.

## 7. Definition of Done

- Importar o `SINAPI_Referência_2026_06.xlsx` real (PE, RN, MG × 3 regimes) via `dev:server` e ver
  `CustoImportacao` concluída com os contadores certos.
- Buscar um insumo pelo código/descrição e ver seu preço nas 3 UFs importadas.
- Abrir uma composição importada (ex.: código 88316) e ver a árvore de itens (incluindo o auxiliar) e
  o custo unitário calculado — não copiado do SINAPI.
- Criar composição própria com pelo menos 1 insumo e 1 sub-composição, ver o custo recalculado.
- `tsc`/`test`/`lint`/`build` limpos.

## 8. Verificação manual (roteiro)

`npm run dev:server` (job pg-boss só roda aqui).

1. Configurações → Permissões: nada novo pra conferir (recurso `custos` já existe desde C0).
2. `/custos/bancos` → aba Bases → "Importar base" → upload do `Referência.xlsx` real → marcar PE/RN/MG
   × os 3 regimes → confirmar data-base (06/2026) → acompanhar progresso até `concluido`.
3. Aba Insumos → buscar "CIMENTO" → conferir preço em PE/RN/MG.
4. Aba Composições → buscar "88316" → ver os 2 itens (curso + EPI) e o custo unitário.
5. "Nova composição" → montar uma com 1 insumo + a composição 88316 como auxiliar → ver o custo somar.
6. Reimportar o mesmo arquivo/seleção → conferir que não duplicou (mesma contagem de insumos).

## 9. Fora de escopo (não invadir)

Vínculo item de orçamento ↔ composição (C2), planilha, troca de data-base do orçamento, quantitativos
BIM, cotações/fornecedores, cronograma, medições. Importador de SICRO/SEINFRA/TCPO (formato próprio,
D2 resolvido só pra SINAPI). Import de `mao_de_obra`/`familias_e_coeficientes`/`Manutenções` (nenhum
item do DoD depende deles; `Manutenções` é candidato natural ao "relatório de impacto" de troca de
data-base da C2, avaliar lá). Materializar custo unitário na composição (isso é o item de orçamento
em C2, aqui é sempre calculado on-the-fly).
