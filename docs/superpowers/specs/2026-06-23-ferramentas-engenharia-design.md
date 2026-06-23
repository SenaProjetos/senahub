# Módulo Ferramentas de Engenharia — Design / Plano em Fases

> **Data:** 2026-06-23
> **Branch:** `feat/ferramentas-engenharia` (sessão paralela, isolada do `master`).
> **Base:** reconhecimento do código (`src/modules/documentos/dxf.ts`, infra PDF/Excel,
> `lib/nav-config.ts`, `lib/permissions-catalog.ts`, catálogo de disciplinas do seed).
> **Origem:** pedido do usuário — módulo de ferramentas: calculadoras rápidas + ferramentas
> completas de cálculo, dimensionamento e **detalhamento** de elementos, com exportação de
> **DXF** e memória de cálculo em **PDF / Word / Excel**.

---

## 1. O que é

Um módulo novo (`ferramentas`) que coloca dentro do SenaHub um conjunto de **calculadoras e
ferramentas de dimensionamento** para apoiar os projetistas no dia a dia. Dois níveis:

- **⚡ Calculadora rápida** — entrada → resultado → memória curta. Uso pontual e frequente.
- **🔧 Ferramenta completa** — dimensionamento + **detalhamento DXF** + **memória de cálculo**
  (PDF/Word/Excel) reproduzível e arquivável, opcionalmente vinculada a um projeto/disciplina.

Não substitui software de cálculo dedicado (TQS, Eberick, QiBuilder); é **apoio** ao projetista,
com a conferência e a responsabilidade técnica (ART/RRT) sempre do engenheiro.

## 2. Decisões confirmadas com o usuário (2026-06-23)

- **Disciplinas do Lote 1:** **Estrutural + Fundações** (maior volume de cálculo manual).
- **Profundidade do Lote 1:** **misto** — várias calculadoras rápidas + **1 ferramenta completa
  end-to-end** (Viga de concreto à flexão) exercitando todo o pipeline.
- **Exportação no Lote 1:** **PDF, Excel, DXF e Word (.docx)** — os quatro.
- **Base normativa:** **ABNT / NBR**.

## 3. Decisões a confirmar (NÃO assumidas — pendentes de aval)

> Diretriz do usuário: *sempre confirmar antes de assumir*. Estes pontos ficam abertos.

1. **Biblioteca de Word (.docx):** proponho `docx` (npm, JS puro, sem binário externo — combina com
   "nativo Windows"). Alternativa hacky (HTML→`.doc`) tem fidelidade ruim. → **Adicionar dependência `docx`?**
2. **DXF:** estender o **writer próprio R12 ASCII** (já existe p/ carimbo) com novas entidades
   (CIRCLE, ARC, LWPOLYLINE, layers, cotas). **Sem DWG nativo** (sem SDK pago), igual à decisão do Estúdio. OK?
3. **Persistência:** salvar cálculos (`CalculoFerramenta`) com **histórico** e vínculo opcional a
   **projeto/disciplina**? (vs. uso efêmero sem salvar). Recomendo salvar — habilita memória reproduzível e auditoria.
4. **Fluxo de exportação:** exportar sempre **a partir de um cálculo salvo** (memória reproduzível e
   auditada) vs. exportar direto de inputs não salvos. Recomendo "salvar → exportar".
5. **Perfis com acesso:** todos os internos (`admin, supervisor, administrativo, clt, estagiario,
   projetista_pj, freelancer`); **`cliente` fora**. Estagiário pode usar/salvar? Confirmar.
6. **Escopo da Viga (F2):** flexão simples + cisalhamento (estribos) + flecha (ELS) + ancoragem;
   seções **retangular e T**; viga isolada (não pórtico). Vigas contínuas/multi-vão entram depois? Confirmar.
7. **Edições das normas:** NBR 6118:2014, NBR 6122:2022, NBR 7480 (aço), NBR 8681 (ações/combinações).
   Confirmar edições vigentes que o escritório adota.
8. **Responsabilidade técnica:** incluir disclaimer fixo na memória ("ferramenta de apoio; conferência e
   ART do engenheiro responsável"). Confirmar texto/posição.

## 4. Infra reutilizável (já existe no código)

| Recurso | Onde | Reuso |
|---|---|---|
| **DXF** R12 ASCII (writer próprio, px→mm, Y invertido) | `src/modules/documentos/dxf.ts` | Provar/extrair primitivas p/ `lib/dxf.ts` (CIRCLE/ARC/POLYLINE/cotas) |
| **PDF** server-side | `puppeteer-core` + `CHROME_PATH` (rotas `/api/**/pdf`) | Render HTML da memória → PDF |
| **Excel** | `exceljs` (dependência) | Quantitativos/resumos |
| **Auditoria + permissão + Zod** | `lib/with-action.ts` (`defineAction`) | Toda mutação (salvar/editar/excluir cálculo) |
| **Lista paginada** | `lib/list-params.ts` + `useSetParams` | Galeria/histórico de cálculos |
| **Storage** | `lib/storage.ts` | Anexar memória gerada a projeto/disciplina (uploads) |
| **Word (.docx)** | — **não existe** | Nova dependência (decisão #1) |

## 5. Arquitetura proposta

Segue o padrão do projeto: **lógica pura testável** separada de Server Actions/HTTP; nada de REST CRUD.

```
src/modules/ferramentas/
  registry.ts        # metadados CLIENT-SAFE de cada ferramenta (key, nome, disciplina, tipo,
                     #   norma, exportaveis[], icon) — alimenta nav/galeria, SEM lógica de cálculo
  calc/              # 1 arquivo por ferramenta: Zod schema (entradas) + função pura calcular() + tipos
                     #   ex.: concrete-beam-flexure.ts, section-properties.ts, unit-convert.ts,
                     #        rebar-summary.ts, anchorage.ts, pile-spt.ts  (+ *.test.ts cada)
  memoria/           # monta um "MemoriaDoc" normalizado (seções, fórmulas, valores, unidades) —
                     #   puro/testável; renderers para HTML (PDF/print) e modelo docx partem dele
  dxf/               # builders de desenho por ferramenta (usam lib/dxf primitives)
  schemas.ts         # re-export dos Zod schemas
  service.ts         # orquestra calc + monta MemoriaDoc (sem Next/HTTP — compartilhável)
  actions.ts         # defineAction: salvar/editar/excluir cálculo (audita)
  queries.ts         # server-only: listar/abrir cálculos (escopo por autor/projeto)

src/lib/dxf.ts       # writer DXF R12 genérico, PURO/testado: text, line, circle, arc, polyline,
                     #   layers, cota linear. (documentos/dxf.ts pode migrar p/ cá depois)

src/components/ferramentas/   # *-view (galeria + cada ferramenta), *-form, *-result, *-dialog

src/app/(dashboard)/ferramentas/          # galeria + rota por ferramenta (/ferramentas/[key])
src/app/api/ferramentas/calculos/[id]/    # pdf · docx · xlsx · dxf  (download/streaming — REST OK)
```

**Catálogo de ferramentas = código** (registry), não linhas de banco. **Persistência = cálculos
salvos** do usuário (entradas + snapshot de saída), p/ histórico, memória reproduzível e auditoria.

### 5.1 Modelo de dados (Prisma)

```prisma
/// Cálculo salvo de uma ferramenta (histórico + regerar memória de forma reproduzível).
model CalculoFerramenta {
  id            String      @id @default(cuid())
  ferramenta    String      // chave do registry (ex.: "concrete-beam-flexure")
  titulo        String
  norma         String?     // ex.: "NBR 6118:2014"
  entradasJson  Json        // inputs validados (Zod)
  resultadoJson Json        // snapshot de saída (memória reproduzível)
  autorId       String
  autor         User        @relation(fields: [autorId], references: [id])
  projetoId     String?
  projeto       Projeto?    @relation(fields: [projetoId], references: [id], onDelete: SetNull)
  disciplinaId  String?
  disciplina    Disciplina? @relation(fields: [disciplinaId], references: [id], onDelete: SetNull)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([autorId])
  @@index([projetoId])
  @@index([ferramenta])
  @@map("calculo_ferramenta")
}
```

### 5.2 Permissões e navegação

- **Catálogo** (`lib/permissions-catalog.ts`): módulo `ferramentas`, recursos
  `ferramentas:usar` (usar + salvar próprios + exportar) e `ferramentas:gerir` (admin: ver de todos,
  parametrizações futuras). `admin` faz bypass.
- **Nav** (`lib/nav-config.ts`): item **"Ferramentas"** (ícone `Calculator`), perfis internos, `cliente` fora,
  `mobile: true` (calculadoras rápidas são úteis em campo). Grupo "Gestão" ou novo grupo "Engenharia".

### 5.3 Pipeline de exportação

`MemoriaDoc` (puro) → renderizadores:
- **PDF:** HTML (template da memória) → puppeteer (reusa padrão das rotas `/api/**/pdf`).
- **Word:** `MemoriaDoc` → `docx` (decisão #1).
- **Excel:** `exceljs` (quadros/quantitativos).
- **DXF:** builders em `dxf/` sobre `lib/dxf` (seção cotada, corte, armadura).

## 6. Catálogo enumerado (backlog de implementação)

IDs estáveis por área (= chave do `registry`, ex.: `E01`→`concrete-beam-flexure`). Implementar sob
demanda; marcar concluídas no plano de execução de cada onda.
Legenda: **⚡** rápida · **🔧** completa (dimensionamento + detalhamento DXF) · **★L1** = Lote 1.
Export: **PDF** (memória) · **DOC** (Word) · **XLS** (Excel) · **DXF** (CAD).

### 6.1 Universais (U01–U10)

| ID | Ferramenta | Tipo | Norma | Export | L1 |
|----|------------|:----:|-------|--------|:--:|
| U01 | Conversor de unidades técnico (força, tensão, momento, vazão…) | ⚡ | — | PDF | ★ |
| U02 | Propriedades geométricas de seção (A, I, W, i, centroide; ret./T/L/I/circ./poligonal) | ⚡ | — | PDF·DXF | ★ |
| U03 | Área/perímetro por coordenadas (Gauss) + volume de corte/aterro | ⚡ | — | PDF·XLS·DXF | |
| U04 | Interpolação linear e em tabelas de norma | ⚡ | — | PDF | |
| U05 | Escalas de prancha e conversão de medidas | ⚡ | NBR 8196/10068 | PDF | |
| U06 | Inclinação/rampa e verificação de acessibilidade | ⚡ | NBR 9050 | PDF | |
| U07 | Estatística de amostras (média, desvio, valor característico fk) | ⚡ | — | PDF·XLS | |
| U08 | Vetores de força — resultante/decomposição/equilíbrio de nó | ⚡ | — | PDF | |
| U09 | Reações e diagramas (V, M) de viga isostática (biapoiada/balanço/2 vãos) | 🔧 | — | PDF·DXF | |
| U10 | Bitolas/calibres + tabela de pesos de materiais | ⚡ | NBR 7480 | PDF·XLS | |

### 6.2 Estrutura / Fundações (E01–E24)

| ID | Ferramenta | Tipo | Norma | Export | L1 |
|----|------------|:----:|-------|--------|:--:|
| E01 | Viga de concreto à flexão (As, As', detalhamento) | 🔧 | NBR 6118 | PDF·DOC·DXF·XLS | ★ |
| E02 | Cisalhamento / estribos de viga | ⚡ | NBR 6118 | PDF | |
| E03 | Flecha e ELS — verificação de deformação | ⚡ | NBR 6118 | PDF | |
| E04 | Pilar de concreto — flexo-compressão (ábacos) | 🔧 | NBR 6118 | PDF·DXF | |
| E05 | Laje maciça — esforços (Marcus/Czerny), armadura, flecha | 🔧 | NBR 6118 | PDF·DXF·XLS | |
| E06 | Laje nervurada / treliçada | 🔧 | NBR 6118 | PDF·DXF | |
| E07 | Punção em laje lisa | ⚡ | NBR 6118 | PDF | |
| E08 | Escada / lance — dimensionamento e armadura | 🔧 | NBR 6118 | PDF·DXF | |
| E09 | Consolo / dente Gerber | ⚡ | NBR 6118 | PDF | |
| E10 | Ancoragem e traspasse de barras | ⚡ | NBR 6118 | PDF | ★ |
| E11 | Resumo / quantitativo de aço (corte e dobra) | ⚡ | NBR 7480 | XLS·PDF | ★ |
| E12 | Descida de cargas por área de influência | ⚡ | NBR 6120 | PDF·XLS | |
| E13 | Ação do vento (pressão dinâmica, coeficientes) | ⚡ | NBR 6123 | PDF | |
| E14 | Combinações de ações (ELU/ELS) | ⚡ | NBR 8681 | PDF | |
| E15 | Viga metálica — flexão/cisalhamento | 🔧 | NBR 8800 | PDF·DXF | |
| E16 | Pilar metálico — compressão/flambagem | ⚡ | NBR 8800 | PDF | |
| E17 | Ligação parafusada/soldada | ⚡ | NBR 8800 | PDF | |
| E18 | Terça / telhado metálico (flexão oblíqua) | ⚡ | NBR 8800 | PDF | |
| E19 | Peça de madeira (viga/pilar) | ⚡ | NBR 7190 | PDF | |
| E20 | Alvenaria estrutural — verificação de parede | ⚡ | NBR 16868 | PDF | |
| E21 | Sapata isolada — solo + armadura | 🔧 | NBR 6118/6122 | PDF·DXF | |
| E22 | Bloco sobre estacas / sapata corrida | 🔧 | NBR 6118/6122 | PDF·DXF | |
| E23 | Estaca/tubulão por SPT (Aoki-Velloso / Décourt-Quaresma) | ⚡ | NBR 6122 | PDF·XLS | ★ |
| E24 | Muro de arrimo / empuxo de terra (Rankine-Coulomb) | 🔧 | NBR 11682/6122 | PDF·DXF | |

### 6.3 Instalações (I01–I25) — hidrossanitário · elétrico/SPDA · incêndio · AVAC/gás

| ID | Ferramenta | Tipo | Norma | Export |
|----|------------|:----:|-------|--------|
| I01 | Água fria — dimensionamento por pesos/consumo | ⚡ | NBR 5626 | PDF·XLS |
| I02 | Esgoto sanitário — ramais/coletores (UHC) | ⚡ | NBR 8160 | PDF·XLS |
| I03 | Ventilação sanitária | ⚡ | NBR 8160 | PDF |
| I04 | Águas pluviais — calhas e condutores | ⚡ | NBR 10844 | PDF·XLS |
| I05 | Reservatório — volume (consumo + reserva de incêndio) | ⚡ | NBR 5626/16527 | PDF |
| I06 | Bomba / recalque — altura manométrica, potência, NPSH | ⚡ | — | PDF |
| I07 | Água quente — consumo e dimensionamento | ⚡ | NBR 7198 | PDF |
| I08 | Reúso / aproveitamento de água pluvial | ⚡ | NBR 15527 | PDF·XLS |
| I09 | Fossa séptica / sumidouro (não atendido por rede) | ⚡ | NBR 7229/13969 | PDF |
| I10 | Condutores — capacidade de corrente + queda de tensão | 🔧 | NBR 5410 | PDF·XLS |
| I11 | Eletroduto — taxa de ocupação | ⚡ | NBR 5410 | PDF |
| I12 | Quadro de cargas + demanda (fator de demanda) | ⚡ | NBR 5410 | XLS·PDF |
| I13 | Proteção / disjuntor + corrente de curto-circuito | ⚡ | NBR 5410 | PDF |
| I14 | Luminotécnica — método dos lúmens | ⚡ | NBR 8995 | PDF·XLS |
| I15 | SPDA — esferas rolantes / Franklin / Faraday | 🔧 | NBR 5419 | PDF·DXF |
| I16 | Aterramento — resistência de malha | ⚡ | NBR 5419/5410 | PDF |
| I17 | Eletrocalha / perfilado — ocupação | ⚡ | NBR 5410 | PDF |
| I18 | Carga de incêndio | ⚡ | NBR 14432 | PDF·XLS |
| I19 | Hidrantes / mangotinhos + reserva técnica de incêndio | ⚡ | NBR 13714 | PDF |
| I20 | Saídas de emergência — lotação e largura | ⚡ | NBR 9077 | PDF |
| I21 | Extintores — dimensionamento e distribuição | ⚡ | NBR 12693 | PDF |
| I22 | Chuveiros automáticos (sprinklers) — estimativa | ⚡ | NBR 10897 | PDF |
| I23 | Carga térmica / BTU (climatização) | ⚡ | — | PDF·XLS |
| I24 | Dutos de ar — velocidade / igual atrito | ⚡ | — | PDF |
| I25 | Gás (GLP/GN) — dimensionamento de tubulação | ⚡ | NBR 13103/15526 | PDF·XLS |

### 6.4 Orçamento (O01–O10) (Executar por último)

> **Verificação (a confirmar):** o sistema **já tem** peças de orçamento — composição de preço e
> medição em `licitacoes` (`LicitacaoComposicaoPreco`, `MedicaoLicitacao`), tabela de preço/proposta em
> `comercial` (`TabelaPreco`, `Proposta`) e cronograma em `planejamento` (EAP/baseline). As ferramentas
> abaixo devem **reusar/estender** esses módulos, **não duplicar**. Confirmar quais entram como ferramenta
> própria vs. melhoria no módulo existente.

| ID | Ferramenta | Tipo | Base/Integração | Export |
|----|------------|:----:|-----------------|--------|
| O01 | Composição de custo unitário (insumo + MO + encargos) | ⚡ | SINAPI/base própria | PDF·XLS |
| O02 | BDI — composição (parcelas e fórmula) | ⚡ | Acórdão TCU 2622/2013 | PDF |
| O03 | Encargos sociais sobre MO da construção | ⚡ | — (distinto de `lib/encargos.ts` da folha) | PDF·XLS |
| O04 | Curva ABC de insumos/serviços | ⚡ | — | XLS·PDF |
| O05 | Orçamento sintético/analítico (quant × custo unitário) | 🔧 | ↔ `comercial`/`licitacoes` | XLS·PDF |
| O06 | Cronograma físico-financeiro (desembolso por etapa) | 🔧 | ↔ `planejamento` (EAP) | XLS·PDF |
| O07 | Levantamento de quantitativos (fôrma, concreto, aço) | ⚡ | ↔ Estrutura (E11) | XLS·PDF |
| O08 | Reajuste de preços por índice (INCC/IPCA) | ⚡ | — | PDF |
| O09 | Honorários de projeto (m² / tabela CAU-CONFEA) | ⚡ | ↔ `comercial` (`TabelaPreco`) | PDF |
| O10 | Boletim de medição (% executado × valor) | 🔧 | ↔ `licitacoes` (`MedicaoLicitacao`) | XLS·PDF |

**Totais do backlog:** 10 universais · 24 estrutura/fundações · 25 instalações · 10 orçamento = **69 ferramentas**.

## 7. Plano em FASES

Cada fase = `spec → plano → execução` própria. `master` (na branch) verde a cada merge interno.

### Onda F0 — Fundação do módulo  ⬛ novo subsistema · ◼ migração
- Prisma `CalculoFerramenta` + `npm run db:migrate` (nome semântico) + `db:generate`.
- Esqueleto: `registry.ts`, `service.ts`, `actions.ts` (salvar/editar/excluir via `defineAction`,
  audita), `queries.ts` (escopo: autor vê os seus; global vê tudo).
- Permissões (`ferramentas:usar|gerir`) + item de nav + página `/ferramentas` (galeria por disciplina).
- **Prova de pipeline:** ⚡ **Conversor de unidades** (`U01`) end-to-end (form → resultado → salvar), **sem** export ainda.
- `lib/dxf.ts` primitivas (puras, testadas) — base para F1.

### Onda F1 — Memória + exportação (genérico)  ⬛
- `MemoriaDoc` (modelo puro) + renderer HTML.
- Rotas de export: **PDF** (puppeteer), **Word** (`docx` — dep nova), **Excel** (`exceljs`),
  **DXF** (`lib/dxf`). Todas operando sobre um cálculo salvo.
- Aplicar numa ferramenta de prova: ⚡ **Propriedades de seção** (`U02`) (memória PDF/Word + Excel + DXF da seção cotada).

### Onda F2 — Lote 1 Estrutural/Fundações
- 🔧 **Viga de concreto à flexão** (`E01`, NBR 6118): flexão (As, As'), cisalhamento (estribos), flecha (ELS),
  ancoragem; seções retangular/T → memória PDF/Word + DXF (seção cotada + corte com armadura) + Excel (resumo de aço).
- ⚡ **Resumo/quantitativo de aço** (`E11`, Excel) standalone.
- ⚡ **Ancoragem e traspasse** (`E10`, NBR 6118).
- ⚡ **Estaca por SPT** (`E23`, Aoki-Velloso / Décourt-Quaresma).
- Vínculo opcional a projeto/disciplina + anexar memória ao projeto (reusa `uploads`).

### Onda F3+ — Demais disciplinas
- Hidrossanitário · Elétrico/SPDA · Incêndio/AVAC — cada uma com spec própria.

## 8. Restrições (herdadas do projeto)

- Server Actions + Zod no `defineAction`; leituras em `queries.ts`/Server Components. REST só p/
  download/streaming (export). **Sem** SWR/react-hook-form.
- Código/identificadores em inglês; **toda** UI em pt-BR; commits semânticos pt-BR.
- Prisma de `@/generated/prisma/client`. shadcn é base-ui (`render={<Comp/>}`, não `asChild`;
  `Select onValueChange` devolve `string | null`).
- **Auditoria obrigatória** em mutações. Testes automatizados **só para lógica pura** (engines de cálculo,
  `lib/dxf`, MemoriaDoc); UI/rota = `npx tsc --noEmit` + verificação manual.

## 9. Não-objetivos

- Análise estrutural global (pórtico/FEM), modelagem 3D/BIM, DWG nativo.
- Substituir TQS/Eberick/QiBuilder ou emitir ART automaticamente.
- Cálculos sem conferência humana — a ferramenta é apoio; a responsabilidade é do engenheiro.

## 10. Riscos

- **Precisão normativa** → cobertura por testes (vetores de exemplos de norma/bibliografia) + disclaimer
  + revisão por engenheiro do escritório antes de liberar cada ferramenta.
- **Detalhamento DXF** (armadura) é a parte mais cara — isolada em `dxf/` e validada visualmente no CAD.
- **Fidelidade do Word** depende da lib — validar layout antes de prometer paridade com o PDF.
