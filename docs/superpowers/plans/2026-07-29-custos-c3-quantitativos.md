# Engenharia de Custos — Onda C3: Quantitativos

**Data:** 2026-07-29 · **Status:** plano aguardando OK — **implementação bloqueada** (ver §0) · **Branch:** `dev` · **Modelo:** Opus

Depende de: [C0](2026-07-27-custos-c0-fundacao.md) (`9c0c2d5`), [C1](2026-07-28-custos-c1-bancos.md) (`3bd05d9`),
[C2](2026-07-28-custos-c2-orcamento.md) (`0223f85`) — todas implementadas.
Fonte arquitetural: [design de conformidade](../specs/2026-07-27-engenharia-custos-design.md) §4 (itens 2, 3) e §8.

---

## 0. Bloqueio operacional (não técnico)

C3 constrói sobre `modules/coordenacao/viewer/engine.ts` e `indice-elementos.ts`. No momento da
escrita, **outra sessão tem 15 arquivos de coordenação não-commitados**, incluindo **+291 linhas no
`engine.ts`** — exatamente o adapter que C3 usa para destacar elementos.

**Decisão do dono (2026-07-29):** escrever o plano agora, **implementar quando a coordenação
commitar**. Antes de começar o Passo 1, reconferir:

```bash
git status --short src/modules/coordenacao/
```

Se ainda houver `M` em `viewer/engine.ts`, **parar e avisar** — não começar por cima.

Mitigação de projeto (§3.4): C3 consome o engine pelos métodos **já commitados e estáveis** e precisa
de **um único método aditivo** nele. Todo o resto vive em `modules/custos/quantitativos/`.

---

## 1. Goal

Levantamento de quantidades com rastro até a fonte, alimentando o item de orçamento: automático a
partir do IFC (no client), semi-automático sobre DXF, manual sobre PDF, e sempre manual como escape.
Vínculo item ↔ elementos IFC (o 5D), destaque visual no viewer a partir da linha do orçamento, e o
caderno de quantitativos.

**DoD (§7):** levantar área de parede de um IFC real, vincular a um item do orçamento, e destacar os
elementos no viewer clicando na linha.

## 2. O achado que define a onda: de onde sai a quantidade

Inspecionei o parser de propriedades existente
([viewer/item-data.ts](../../../src/modules/coordenacao/viewer/item-data.ts)). Ele lê:

```
IsDefinedBy → { Name, HasProperties: [{ Name, NominalValue }] }
```

Isso captura **`IfcPropertySet`** (`Pset_*`) — texto/valores nominais. **Não captura
`IfcElementQuantity`** (`Qto_WallBaseQuantities`, `BaseQuantities`), que é onde o IFC guarda área,
volume, comprimento e contagem, porque a estrutura é diferente:

```
IsDefinedBy → IfcElementQuantity { Name, Quantities: [{ Name, AreaValue | VolumeValue | LengthValue | CountValue | WeightValue }] }
```

Como `Quantities ≠ HasProperties` e `AreaValue ≠ NominalValue`, o parser atual descarta essas linhas
(`props` fica vazio → o pset nem entra na lista). **Hoje o sistema não lê nenhuma quantidade do IFC.**

### 2.1 Consequência honesta — e o risco do DoD

Quantidade oficial só existe se **quem exportou o IFC marcou "exportar quantidades base"**. Revit,
ArchiCAD e afins têm isso **desligado por padrão em vários fluxos**. Então:

| Cenário no modelo real | O que C3 entrega |
|---|---|
| Tem `Qto_*`/`BaseQuantities` | Área/volume/comprimento reais por elemento → soma por categoria/pavimento |
| Só `Pset_*` com quantidade customizada (varia por escritório) | Mapeamento configurável de Pset→grandeza (§3.3) |
| Nenhuma quantidade | **Só contagem de elementos** (`CountValue` derivado) + aviso explícito na tela |

**Não vou fingir área a partir de bounding box** — para orçamento isso é número errado com cara de
número certo. Bbox entra apenas como *estimativa marcada como tal* (`origem: "ifc"`,
`confianca: 0.3`), nunca como valor padrão silencioso.

> **Passo 0 da implementação (barato, faz primeiro):** rodar um diagnóstico no IFC real do usuário e
> reportar **quais quantities existem**. Se não houver nenhuma, o DoD "levantar área de parede" não é
> alcançável com aquele arquivo, e isso precisa ser dito **antes** de escrever o extrator — não depois.

## 3. Architecture

### 3.1 Schema

```prisma
enum CustoOrigemDado { manual  ifc  dwg  pdf  ia }

enum CustoGrandeza { area  volume  comprimento  contagem  peso }

/// Levantamento de quantidade com rastro até a fonte. Nunca é sobrescrito nem deletado
/// (regra 10 do prompt): recontagem gera OUTRA linha; a antiga fica com `substituidoPorId`.
model CustoQuantitativo {
  id          String          @id @default(cuid())
  orcamentoId String
  orcamento   CustoOrcamento  @relation(fields: [orcamentoId], references: [id], onDelete: Cascade)
  /// Item de orçamento que este levantamento alimenta. Null = levantamento solto (ainda não vinculado).
  itemId      String?
  item        CustoOrcamentoItem? @relation(fields: [itemId], references: [id], onDelete: SetNull)

  descricao   String
  grandeza    CustoGrandeza
  unidade     String
  quantidade  Decimal         @db.Decimal(12, 2)

  origem      CustoOrigemDado
  /// 0–1. Null = valor exato (manual conferido / quantity oficial do IFC). Costura de IA (§8 do design).
  confianca   Decimal?        @db.Decimal(3, 2)

  // ── Rastro até a fonte (mesmo mecanismo de âncora de ApontamentoCoordenacao) ──
  /// uploadId cru (disciplina) ou `d:<documentoVersaoId>`, polimórfico SEM FK — igual ao apontamento.
  uploadId    String?
  /// IfcGuids dos elementos contados (string[]) — origem `ifc`.
  guids       Json?
  /// Página (1-based) e retângulo/pontos da medição — origem `pdf`/`dwg`.
  pagina      Int?
  ancoraJson  Json?
  /// Memória de como se chegou ao número (fórmula digitada, filtro aplicado, régua do PDF).
  memoria     String?

  substituidoPorId String?            @unique
  substituidoPor   CustoQuantitativo? @relation("QuantitativoSubstituicao", fields: [substituidoPorId], references: [id], onDelete: SetNull)
  substitui        CustoQuantitativo? @relation("QuantitativoSubstituicao")

  criadoPorId String
  criadoPor   User     @relation(fields: [criadoPorId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([orcamentoId])
  @@index([itemId])
  @@index([uploadId])
  @@map("custo_quantitativo")
}

/// Ligação item de orçamento ↔ elemento IFC — a base do 5D e do destaque no viewer.
model CustoVinculoBim {
  id       String             @id @default(cuid())
  itemId   String
  item     CustoOrcamentoItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  /// Polimórfico SEM FK, igual ApontamentoCoordenacao.uploadId.
  uploadId String
  /// IfcGuid do elemento. Um vínculo por (item, guid).
  ifcGuid  String
  createdAt DateTime @default(now())

  @@unique([itemId, ifcGuid])
  @@index([itemId])
  @@index([uploadId])
  @@map("custo_vinculo_bim")
}
```

`CustoOrcamentoItem` ganha as relações inversas + `quantitativos`/`vinculosBim`. **Nada de mexer em
`quantidade` do item por gatilho**: aplicar um quantitativo ao item é ação explícita (§3.5), porque
sobrescrever quantidade digitada sem pedir é perda de trabalho do orçamentista.

### 3.2 Módulos puros (todos com `*.test.ts`)

`quantitativos/quantidades-ifc.ts` — **o coração da onda.** Parser puro do `ItemData` cru para
`IfcElementQuantity`, o que `item-data.ts` não faz (§2):
- `extrairQuantidades(itemData)` → `{ grupo: string; nome: string; grandeza: CustoGrandeza; valor: number }[]`
  lendo `Quantities[]` + `AreaValue`/`VolumeValue`/`LengthValue`/`CountValue`/`WeightValue`.
- `escolherQuantidade(quantidades, preferencia)` — qual usar quando o elemento traz várias
  (`NetSideArea` vs `GrossSideArea` vs `NetVolume`): preferência explícita, com ordem padrão
  documentada e testada. Nunca "a primeira que apareceu".
- `diagnosticoQuantidades(amostra)` → que grupos/nomes existem no modelo e em quantos elementos.
  É o que alimenta o Passo 0 (§2.1).

`quantitativos/agregacao.ts` — soma por categoria (IfcClass) e por pavimento, sobre
`ElementoIndex[]` (reusa o índice da coordenação, não reimplementa) + as quantidades resolvidas:
- `agregarPorCategoria(elementos, quantidadePorLocalId, opts)` → linhas de levantamento com
  `quantidade`, `contagem`, `elementosSemQuantidade` (transparência do §2.1).
- `agregarPorPavimento(...)` idem.

`quantitativos/medicao-pdf.ts` — puro, geometria de medição sobre prancha:
- `comprimentoPolilinha(pontos, escala)`, `areaPoligono(pontos, escala)` (shoelace),
  `escalaPorReferencia(pixels, medidaReal)` — a régua: usuário clica dois pontos e digita a distância
  real, tudo depois deriva disso. Testado com triângulo/retângulo de área conhecida.

`quantitativos/medicao-dxf.ts` — puro, sobre `CenaDwg`/`Primitiva` de
[modules/dwg/parse.ts](../../../src/modules/dwg/parse.ts) (já existe e é testado): soma de
comprimento por camada e área de polilinhas fechadas. É o "semi-automático": o DXF já tem coordenadas
reais em mm, então **não precisa de régua** — só escolher camadas.

### 3.3 Mapeamento configurável Pset→grandeza

Para o cenário do meio da tabela §2.1 (escritório que exporta quantidade em Pset próprio):
`CustoMapeamentoQuantidade` — `(fonte: "pset", grupo, nome) → grandeza + unidade`, por orçamento ou
global. Pequeno, mas é o que evita "não consigo levantar nada" em modelo real que tem o dado com
outro nome. Puro na resolução, tabela no banco.

### 3.4 Superfície de contato com a coordenação (minimizada de propósito)

Consome **já commitado/estável**:
- `engine.guidsDaSelecao()` — âncora do levantamento a partir do que o usuário selecionou.
- `engine.selecionarPorGuids(guids)` — **o destaque do DoD**, já existe (usado pelo deep-link de
  apontamento). C3 só chama.
- `engine.indiceDoModelo()` / `indiceComPsetsDoModelo()` + `indice-elementos.ts` — que elementos
  existem, em que pavimento, de que classe.

Precisa de **1 método aditivo** em `viewer/engine.ts`:
```ts
/** ItemData cru de localIds — C3 lê IfcElementQuantity, que o índice de Psets não traz. */
async dadosBrutosPorLocalIds(modeloId: string, localIds: number[]): Promise<unknown[]>
```
Aditivo, sem tocar em método existente — para o merge com a outra sessão ser trivial. **Todo o parse
fica em custos** (`quantidades-ifc.ts`), não no engine.

Nada de escrever segundo viewer, segundo índice ou segundo parser de DXF/PDF.

### 3.5 Fluxo na tela

Aba **Quantitativos** dentro de `/custos/[id]` (ao lado de Itens/Cabeçalho/BDI/Encargos):
1. **Levantar do IFC** — escolhe o modelo do projeto (os `.frag` já convertidos), o viewer abre
   embutido, usuário filtra por categoria/pavimento (ou seleciona no 3D), vê a prévia agregada com
   aviso de quantos elementos não têm quantidade, e grava o levantamento.
2. **Levantar do DXF** — escolhe o desenho convertido, marca camadas, vê comprimento/área.
3. **Medir no PDF** — abre a prancha ([pdf-viewer.tsx](../../../src/components/projetos/pdf-viewer.tsx)),
   define a régua, mede linha/área, grava com página + pontos no rastro.
4. **Manual** — descrição, grandeza, valor, memória de cálculo.
5. **Aplicar ao item** — ação explícita: escolhe o item do orçamento, confirma a substituição da
   quantidade (mostra de→para), grava `CustoVinculoBim` para os guids envolvidos.

Na aba **Itens** (C2), a linha do serviço ganha: contador de elementos vinculados e o botão **"Ver no
modelo"** → abre o viewer com `selecionarPorGuids` (fecha o DoD).

### 3.6 Caderno de quantitativos

Relatório dedicado — por item de orçamento, todos os levantamentos com origem, rastro, memória, autor
e data; e o total conferido contra a quantidade do item (aponta divergência). XLSX + PDF pela rota
`/print`, **reusando o mesmo par de padrões da C2** (módulo puro → XLSX e PDF consomem o mesmo).

## 4. Tech Stack

Nada novo. `@thatopen/fragments` só via o adapter existente · `dxf-parser` já usado pelo módulo dwg ·
`pdfjs-dist` já usado no visualizador de pranchas · ExcelJS/puppeteer-core como na C2.
**Zero dependência nova. Nenhum cálculo de geometria 3D no servidor** (design §7: extração no client,
sobe só o agregado).

## 5. Global Constraints

Mesmas de C0–C2 +:
1. **Quantidade nunca é inventada.** Sem quantity no modelo → contagem + aviso. Bbox só como
   estimativa marcada (`confianca ≤ 0.3`), nunca padrão.
2. Quantitativo é **append-only** (regra 10): recontar cria linha nova, a antiga aponta para a nova.
3. Aplicar quantitativo ao item é **explícito e confirmado**, nunca gatilho automático.
4. Malha/geometria **não sobe** para o servidor — só o agregado e os guids.
5. Contato com a coordenação restrito a §3.4 (1 método aditivo).

## 6. Passos

### Passo 0 — Diagnóstico do IFC real (antes de qualquer código de extração)
- [ ] Script temporário sobre um `.frag`/IFC real do usuário reportando quais `IfcElementQuantity`
      existem, por categoria, e em que percentual dos elementos.
- [ ] **Reportar ao dono** antes de seguir. Se não houver quantities, o escopo de "área automática"
      muda (vira Pset mapeado ou contagem) e o DoD precisa ser renegociado.

**Aceite:** número real na mão — quantos % das paredes do modelo têm área exportada.

### Passo 1 — Schema + migração
- [ ] `CustoQuantitativo`, `CustoVinculoBim`, `CustoMapeamentoQuantidade`, 2 enums, relações inversas.
- [ ] Migração aditiva + `db:generate`. Drift → contorno das ondas anteriores, nunca `reset`.

**Aceite:** `prisma validate` ok, `tsc` limpo, `migrate status` limpo.

### Passo 2 — `quantidades-ifc.ts` puro + testes
- [ ] `extrairQuantidades`, `escolherQuantidade`, `diagnosticoQuantidades`.
- [ ] Testes com `ItemData` fixture cobrindo: `Quantities` com AreaValue/VolumeValue/LengthValue;
      elemento sem quantity; várias áreas concorrentes (preferência determinística); shape inesperado
      não quebra (mesma robustez de `item-data.ts`).

**Aceite:** vitest verde; nenhum import de three/fragments/Prisma.

### Passo 3 — `agregacao.ts` + `medicao-pdf.ts` + `medicao-dxf.ts` puros + testes
**Aceite:** área de retângulo/triângulo conhecidos exata; escala por referência correta; soma por
categoria/pavimento com `elementosSemQuantidade` contado.

### Passo 4 — service + actions + queries
- [ ] CRUD de quantitativo (append-only), aplicar ao item (com diff de→para), vínculo BIM.
- [ ] `defineAction` com `recurso: "custos"`, `permissao: "gerir"`, `capturarAntes` no aplicar.
- [ ] Queries: levantamentos por orçamento/item, guids por item (para o destaque), caderno.

**Aceite:** aplicar quantitativo grava vínculo e registra o de→para na auditoria; recontagem não
apaga a linha anterior.

### Passo 5 — 1 método aditivo no engine + extração no client
- [ ] `dadosBrutosPorLocalIds` no `viewer/engine.ts` (**só após a coordenação commitar**).
- [ ] Componente client de levantamento IFC: filtro por categoria/pavimento, prévia agregada, aviso
      de elementos sem quantidade, gravação do agregado.

**Aceite:** levantar de um IFC real sem subir malha (conferir no Network que só o agregado sai).

### Passo 6 — Telas (aba Quantitativos, medição PDF/DXF, "Ver no modelo")
**Aceite:** DoD (§7) reproduzido no navegador.

### Passo 7 — Caderno de quantitativos (XLSX + PDF)
**Aceite:** caderno sai nos dois formatos com rastro e divergências; números iguais aos da tela.

### Passo 8 — Verificação e commit
- [ ] `npx tsc --noEmit` · `npm test` · `npm run lint` · `npm run build` (sem dev na :3000).
- [ ] Smoke real com IFC do usuário, como nas ondas C1/C2.
- [ ] Commit `feat(custos): quantitativos com rastro à fonte e vínculo BIM`.

## 7. Definition of Done

- Levantar área de parede de um IFC real **(condicionado ao Passo 0 — ver §2.1)** e gravar o
  levantamento com rastro (uploadId + guids).
- Aplicar o levantamento a um item do orçamento, com confirmação do de→para.
- Clicar na linha do orçamento e **destacar os elementos no viewer**.
- Medir uma distância e uma área numa prancha PDF com régua, e gravar.
- Somar comprimento por camada num DXF convertido.
- Caderno de quantitativos em XLSX e PDF.
- `tsc` + `test` + `lint` + `build` limpos.

## 8. Verificação manual (roteiro)

`npm run dev:server` (conversão IFC/DWG é job pg-boss; o viewer precisa do `.frag` pronto).

1. Projeto com IFC já convertido → `/custos/[id]` → aba **Quantitativos** → **Levantar do IFC**.
2. Filtrar `IFCWALL` → conferir contagem, área somada e o aviso de elementos sem quantidade.
3. Gravar → **Aplicar ao item** → escolher o serviço de alvenaria → confirmar de→para.
4. Aba **Itens** → o serviço mostra os elementos vinculados → **Ver no modelo** → viewer abre com os
   elementos destacados.
5. **Medir no PDF**: abrir prancha, régua com medida conhecida, medir área, gravar.
6. **DXF**: escolher desenho, marcar camada de eixo, conferir comprimento.
7. Exportar o caderno de quantitativos (XLSX e PDF).

## 9. Fora de escopo (não invadir)

RFQ/cotações/fornecedores (C4). Cronograma, Curva S/ABC, histogramas (C5). Medições de obra,
revisões, diff de revisão (C6) — **"medição" de C6 é execução física, não levantamento**. Os 11
relatórios e a comparação entre versões de IFC com impacto de custo (C7). Nenhum provedor de IA: a
`origem: "ia"` e `confianca` existem como costura (design §8), sem implementação.
