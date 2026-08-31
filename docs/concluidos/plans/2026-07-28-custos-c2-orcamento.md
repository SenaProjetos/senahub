# Engenharia de Custos — Onda C2: Orçamento

**Data:** 2026-07-28 · **Status:** implementado — `tsc`/`test` (1336)/`lint`/`build` limpos, smoke real com SINAPI 06/2026, commit `0223f85` (schema em `009a05a`) · **Branch:** `dev` · **Modelo:** Opus

Depende de: [C0 — Fundação](2026-07-27-custos-c0-fundacao.md) (`9c0c2d5`) e
[C1 — Bancos](2026-07-28-custos-c1-bancos.md) (`3bd05d9`), ambas implementadas.
Fonte arquitetural: [design de conformidade](../specs/2026-07-27-engenharia-custos-design.md).

---

## 1. Goal

A planilha orçamentária de verdade: árvore hierárquica (grupo → subgrupo → serviço) com código WBS,
item vinculado a composição do banco, **custo unitário materializado** no momento do cálculo, roll-up
incremental persistido, BDI por grupo, bloqueio de item, duplicação de orçamento como modelo, troca de
data-base com relatório de impacto, e export analítico/sintético em XLSX e PDF.

Ao fim: montar o orçamento completo de uma obra pequena e exportar a planilha nos dois formatos.

## 2. Gap encontrado em C0/C1 — decisão necessária

`CustoOrcamento` (C0) guarda `dataBase` e `regimeEncargos`, mas **não guarda qual `CustoBasePreco`
usar**. Sem isso não há como resolver o preço de um insumo: em C1 a base é identificada por
`(fonte, uf, regime, dataBase)` e o orçamento não tem UF.

**Proposta:** `basePrecoId String?` (FK para `CustoBasePreco`) no `CustoOrcamento`.

- É explícito — o usuário escolhe "SINAPI-PE (sem desoneração) — 06/2026" numa lista, em vez de o
  sistema adivinhar a partir de 3 campos soltos.
- Torna a **troca de data-base** uma operação de uma linha só (apontar para outra base), que é
  exatamente o que o relatório de impacto compara (§3.4).
- `CustoOrcamento.dataBase` continua existindo como o **dado do documento** (sai no cabeçalho da
  planilha impressa); a base é de onde o preço veio. Ao trocar a base, `dataBase` acompanha.

**Coerência a sinalizar (não bloquear):** `CustoOrcamento.regimeEncargos` (`desonerado` /
`nao_desonerado`, encargos sociais de obra) e `CustoBasePreco.regime` (`com_desoneracao` /
`sem_desoneracao` / `sem_encargos`, planilha SINAPI) são eixos diferentes mas correlacionados. A tela
avisa quando divergem (ex.: orçamento desonerado apontando para base "sem desoneração"); não impede,
porque há caso legítimo de usar base sem encargos com encargos próprios.

## 3. Architecture

### 3.1 Schema — delta sobre C0/C1

```prisma
model CustoOrcamento {
  // … campos de C0 …
  /// Base de preço usada para resolver o custo dos itens (§2). Trocar = trocar data-base.
  basePrecoId String?
  basePreco   CustoBasePreco? @relation(fields: [basePrecoId], references: [id])
  @@index([basePrecoId])
}

model CustoOrcamentoItem {
  // … campos de C0 (codigo WBS, ordem, quantidade, custoUnitario, bdiPercentual, bloqueado, totais) …
  /// Composição de origem do custo. Null = item com custo digitado à mão.
  composicaoId     String?
  composicao       CustoComposicao? @relation(fields: [composicaoId], references: [id])
  /// MATERIALIZAÇÃO (design §7): de qual base o `custoUnitario` gravado veio, e quando.
  /// É isto que torna a revisão reproduzível anos depois, mesmo que a base mude ou suma.
  basePrecoUsadaId String?
  basePrecoUsada   CustoBasePreco?  @relation("ItemBaseUsada", fields: [basePrecoUsadaId], references: [id])
  custoCalculadoEm DateTime?
  @@index([composicaoId])
  @@index([basePrecoUsadaId])
}
```

`onDelete` das duas FKs novas de item = `SetNull` (apagar uma base não pode apagar orçamento; o
`custoUnitario` gravado sobrevive — é justamente o ponto da materialização).

### 3.2 Módulos puros novos (todos com `*.test.ts`)

`planilha-orcamento.ts` — achata a árvore em linhas de planilha, nas duas formas:
- **sintética**: uma linha por nó (grupo e serviço), com WBS, descrição, unidade, quantidade,
  custo unitário, BDI efetivo, total sem/com BDI. É a planilha orçamentária clássica.
- **analítica**: a sintética + as linhas-filhas de composição de cada serviço (insumo/auxiliar,
  coeficiente, preço unitário, subtotal), indentadas sob o serviço.
- Também o **resumo por grupo de 1º nível** (para o rodapé/curva de participação %).
Puro: recebe a árvore já montada e os dados de composição resolvidos; não toca em Prisma.

`troca-data-base.ts` — diff de impacto **antes × depois** de trocar a base:
`{ itemId, codigo, descricao, custoAntes, custoDepois, variacaoPct, situacao }` com
`situacao ∈ { alterado, inalterado, sem_preco_na_nova, bloqueado_preservado }`, mais os totais
agregados (antes, depois, variação %). Puro — o caller resolve os custos novos e passa os dois lados.

`duplicar-orcamento.ts` — remapeia a árvore para novos ids preservando a hierarquia e a ordem
(`Map<idAntigo, idNovo>`), devolvendo as linhas prontas para `createMany`. Puro e testável: é onde
mora o erro clássico de duplicação (pai apontando para id do orçamento original).

Reusados de C0/C1 sem alteração: `orcamento-arvore.ts` (WBS, herança de BDI, roll-up incremental),
`composicao.ts` (custo unitário recursivo), `bdi.ts`.

### 3.3 Persistência do roll-up (design §7 — o ponto de desempenho da onda)

- Editar `quantidade`/`custoUnitario`/`bloqueado` de um **serviço** → `recalcularIncremental` (já
  existe, testado em C0) e `UPDATE` **apenas nos nós do caminho até a raiz**. Nunca a árvore toda.
- Editar `bdiPercentual` de um **grupo** → afeta a subárvore inteira por herança; roda `rollUp` na
  subárvore e atualiza só ela (limitação já documentada no topo de `orcamento-arvore.ts`).
- **WBS ao mover/reordenar:** recalcula os códigos puros, faz o **diff contra os atuais** e grava só
  os que mudaram. Como `@@unique([orcamentoId, codigo])` colide durante a troca (1↔2), a gravação é
  em duas fases dentro da transação: primeiro um código temporário (`~<id>`) nos afetados, depois o
  final. Duas fases **só sobre o conjunto que mudou**, não sobre a árvore inteira.
- Toda edição de item recalcula e grava `totalSemBdi`/`totalComBdi` — leitura nunca calcula.

### 3.4 Vínculo item ↔ composição e materialização

Ao vincular um item a uma composição (ou ao recalcular), o service:
1. resolve o custo com `calcularCustoUnitario` (C1) contra `orcamento.basePrecoId`;
2. **grava** `custoUnitario`, `basePrecoUsadaId`, `custoCalculadoEm` no item;
3. roda o roll-up incremental do caminho.

Item `bloqueado` é pulado em qualquer recálculo em lote (preço travado — requisito do briefing).
Insumo sem preço na base não aborta: custo parcial + aviso na tela (comportamento já implementado e
testado em C1).

### 3.5 Export

- **XLSX**: `GET /api/custos/[id]/planilha.xlsx?tipo=sintetica|analitica` — ExcelJS na rota, padrão de
  [licitacoes/export/xlsx](../../../src/app/api/licitacoes/export/xlsx/route.ts). Cabeçalho da obra
  (projeto/contratante/data-base/BDI) + linhas do módulo puro + totais.
- **PDF**: rota `/custos/[id]/print?tipo=…` (Server Component com `<html>` próprio, padrão de
  [planejamento/[projetoId]/print](<../../../src/app/(dashboard)/planejamento/[projetoId]/print/page.tsx>))
  renderizada por `puppeteer-core` em `GET /api/custos/[id]/planilha.pdf`, igual ao PDF do cronograma.

Ambos gated por `custos:ver`, e ambos consomem **o mesmo** módulo puro — o XLSX e o PDF não podem
divergir em número.

### 3.6 Telas

`/custos/[id]` vira abas (a ficha de C0 fica intacta, só muda de lugar):
- **Itens** (nova, padrão) — árvore editável: adicionar grupo/serviço, indentar/desindentar, mover
  para cima/baixo, editar quantidade e custo, vincular composição (busca do C1), travar/destravar,
  excluir. Totais por linha e rodapé com total geral sem/com BDI.
- **Cabeçalho** — o que C0 já entrega (contratante, data-base, regime) + o seletor de **base de preço**.
- **BDI** / **Encargos** — os demonstrativos de C0.

Diálogos novos: `item-dialog` (criar/editar), `vincular-composicao-dialog` (busca + preview do custo),
`duplicar-orcamento-dialog`, `trocar-data-base-dialog` (escolhe a base nova → **mostra o relatório de
impacto antes de confirmar**, nunca aplica direto).

## 4. Tech Stack

Nada novo. ExcelJS (rota, via `createRequire`) · `puppeteer-core` + `CHROME_PATH` · Prisma 7 ·
`defineAction` · shadcn base-ui. **Zero dependência nova.** Nenhum componente de árvore de terceiro —
a árvore é `<table>` com indentação por nível, mesmo espírito do `eap-workspace`.

## 5. Global Constraints

Mesmas de C0/C1 +:
1. Nenhuma fórmula fora dos módulos puros — inclusive a montagem da planilha e o diff de data-base.
2. Roll-up **sempre incremental**; nenhuma edição pode varrer a árvore inteira.
3. `custoUnitario` é **materializado**, nunca recalculado na leitura.
4. Item bloqueado é imune a recálculo em lote.
5. XLSX e PDF consomem o mesmo módulo puro.

## 6. Passos

### Passo 1 — Schema + migração
- [ ] `basePrecoId` em `CustoOrcamento`; `composicaoId`/`basePrecoUsadaId`/`custoCalculadoEm` em
      `CustoOrcamentoItem`; relações inversas em `CustoComposicao`/`CustoBasePreco`; `@@index` em cada FK.
- [ ] Migração `custos_orcamento_itens` (aditiva, tudo nullable) + `db:generate`. Drift → mesmo
      contorno das ondas anteriores (`db push` + SQL à mão + `migrate resolve`), nunca `reset`.

**Aceite:** `prisma validate` ok, `tsc --noEmit` limpo, migração aplicada e `migrate status` limpo.

### Passo 2 — `planilha-orcamento.ts` puro + testes
- [ ] `linhasSinteticas(arvore, ctx)`, `linhasAnaliticas(arvore, composicoesResolvidas, ctx)`,
      `resumoPorGrupo(arvore)`.
- [ ] Testes: hierarquia de 3 níveis com WBS correto; BDI herdado por linha; total do grupo = soma dos
      filhos; analítica explode a composição sob o serviço; % de participação soma 100.

**Aceite:** vitest verde; nenhum import de Prisma/Next.

### Passo 3 — `troca-data-base.ts` + `duplicar-orcamento.ts` puros + testes
- [ ] Diff de impacto com as 4 situações e os totais agregados.
- [ ] Remapeamento de árvore na duplicação (pais, ordem, WBS preservados; ids novos).
- [ ] Testes: item sem preço na base nova sinalizado; item bloqueado preservado; variação % correta
      (inclusive de/para zero); duplicação de 3 níveis não deixa nenhum `parentId` do original.

**Aceite:** vitest verde nos dois arquivos.

### Passo 4 — `orcamento/` (service + actions + queries)
- [ ] `service.ts`: criar/editar/mover/excluir item, vincular composição + materializar custo,
      roll-up incremental persistido, WBS em duas fases, travar/destravar, duplicar, trocar base.
- [ ] `actions.ts`: tudo por `defineAction` (`recurso: "custos"`, `permissao: "gerir"`), com
      `capturarAntes` nas edições de item.
- [ ] `queries.ts`: árvore completa do orçamento (uma query + montagem em memória, sem N+1) e a
      pré-visualização do relatório de impacto.

**Aceite:** editar a quantidade de um serviço em árvore de ≥200 nós dispara `UPDATE` só no caminho até
a raiz (conferido no log do Prisma); item bloqueado não muda ao trocar a base; usuário sem
`custos:gerir` é barrado e a tentativa fica no `AuditLog`.

### Passo 5 — Telas (abas + árvore editável + diálogos)
- [ ] Abas em `/custos/[id]`; `orcamento-arvore-view` com indentação, totais e ações por linha.
- [ ] `vincular-composicao-dialog` (busca C1 + preview do custo antes de aplicar).
- [ ] `trocar-data-base-dialog` — **relatório de impacto antes de confirmar**.
- [ ] `duplicar-orcamento-dialog`.
- [ ] Seletor de base de preço no cabeçalho + aviso de divergência de regime (§2).

**Aceite:** DoD (§7) reproduzido no navegador.

### Passo 6 — Export XLSX + PDF
- [ ] Rota XLSX (sintética e analítica) e rota PDF + página `/print`.
- [ ] Cabeçalho da obra e data-base nos dois; números idênticos entre os formatos.

**Aceite:** baixar os dois formatos nas duas formas e conferir que o total bate com a tela.

### Passo 7 — Verificação e commit
- [ ] `npx tsc --noEmit` · `npm test` · `npm run lint` · `npm run build` (sem `next dev` na :3000).
- [ ] Commit `feat(custos): planilha orçamentária com árvore, composição e export`.

## 7. Definition of Done

- Montar um orçamento pequeno completo: grupos, subgrupos e serviços, com WBS correto.
- Vincular um serviço a uma composição SINAPI real (já importada) e ver o custo unitário materializado.
- Editar quantidade e ver o total do grupo e do orçamento subirem em cascata.
- Definir BDI diferente num grupo e ver só aquele ramo mudar.
- Travar um item, trocar a data-base e conferir: relatório de impacto exibido antes, item travado
  intacto depois.
- Duplicar o orçamento como modelo.
- Exportar planilha **sintética e analítica** em **XLSX e PDF**, com números iguais aos da tela.
- `tsc` + `test` + `lint` + `build` limpos.

## 8. Verificação manual (roteiro)

`npm run dev` basta (sem job nesta onda; PDF precisa de `CHROME_PATH`).

1. `/custos` → abrir um orçamento → aba **Cabeçalho** → escolher a base "SINAPI-PE (sem desoneração) — 06/2026".
2. Aba **Itens** → criar grupo "Serviços preliminares" → dentro dele, um serviço → vincular à composição
   `88316` → conferir custo unitário e total.
3. Criar um segundo grupo com BDI próprio → conferir que só ele muda.
4. Editar quantidade de um serviço → total do grupo e do rodapé acompanham.
5. Travar um item → **Trocar data-base** para outra UF/regime → ler o relatório de impacto → confirmar
   → conferir item travado inalterado.
6. **Duplicar orçamento** → abrir a cópia → árvore idêntica, ids novos.
7. Exportar XLSX sintética, XLSX analítica, PDF sintética, PDF analítica → conferir totais.

## 9. Fora de escopo (não invadir)

Quantitativos/BIM e caderno de quantitativos (C3). RFQ/cotações/fornecedores (C4). Cronograma, Curva S,
Curva ABC, histogramas (C5). Medições, revisões versionadas, diff de revisão, aprovação por alçada
(C6). Os 11 relatórios completos e a memória de cálculo (C7) — aqui só a planilha orçamentária.
Composição auxiliar **dentro do item de orçamento** (o item aponta para a composição do banco; editar a
composição é tela de C1).
