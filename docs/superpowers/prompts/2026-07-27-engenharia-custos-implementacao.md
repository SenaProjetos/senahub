# Prompt de implementação — Módulo Engenharia de Custos

> Prompt de trabalho para o Claude Code. Cole o bloco de abertura (§0) na sessão e mantenha este arquivo
> referenciado com `@docs/superpowers/prompts/2026-07-27-engenharia-custos-implementacao.md`.
> Ele é a instrução; o **design de conformidade** é a fonte de verdade arquitetural.

---

## 0. Bloco de abertura (colar na sessão)

```
Implemente o módulo Engenharia de Custos do SenaHub seguindo
@docs/superpowers/prompts/2026-07-27-engenharia-custos-implementacao.md
e o design de conformidade @docs/superpowers/specs/2026-07-27-engenharia-custos-design.md.

Comece pela Onda C0. Antes de tocar no schema, faça as perguntas bloqueantes D1/D4/D6.
Não escreva código fora da onda corrente.
```

---

## 1. Contexto obrigatório (ler antes de qualquer código)

Leia, nesta ordem, e **não re-derive** o que já está escrito:

1. `CLAUDE.md` — arquitetura, comandos, gotchas.
2. `docs/superpowers/specs/2026-07-27-engenharia-custos-design.md` — **fonte de verdade**: inventário de
   padrões, colisões de nome, mapa de reuso, nomes de entidade, permissões, faseamento, anti-padrões.
3. `docs/HANDOFF.md` — estado do sistema até a Onda 5.

Referências de padrão a imitar literalmente:
- `src/lib/with-action.ts` · `src/lib/session.ts` · `src/lib/permissions-catalog.ts` · `src/lib/list-params.ts`
- Módulo canônico enxuto: `src/modules/engenharia/{queries,actions,schemas}.ts` + `src/app/(dashboard)/engenharia/normas/page.tsx` + `src/components/engenharia/normas-view.tsx`
- Módulo canônico em camadas puras: `src/modules/ferramentas/` (registry client-safe + `calc/` puro + testes)
- Cálculo financeiro versionado: `src/modules/licitacoes/contrato/` (reajuste, saldo, aditivo)
- Cronograma: `src/modules/planejamento/caminho-critico.ts` + `src/components/planejamento/gantt.tsx`
- BIM: `src/modules/coordenacao/indice-elementos.ts` (puro) + `viewer/engine.ts` (client-only)
- Gráfico SVG: `src/components/financeiro/fluxo-projecao-chart.tsx`

---

## 2. Objetivo e benchmark

Produzir toda a documentação técnica de orçamento de obra a partir de projetos IFC/DWG/PDF, com
**paridade funcional com o OrçaFascio** e três diferenciais que ele não tem: BIM 5D real, suprimentos
(cotação/comparador/histórico de preço) e integração nativa com o resto do ERP.

**Não é** CRM comercial nem proposta comercial — isso é `modules/comercial` e não se toca.

### 2.1 Paridade OrçaFascio — checklist funcional

Cada item precisa existir e funcionar, ainda que na onda em que está previsto:

**Orçamento**
- [ ] Planilha orçamentária **analítica** e **sintética**, hierárquica (grupo → subgrupo → serviço), com código WBS (1.2.3)
- [ ] Item = quantidade × custo unitário; total com e sem BDI; recálculo automático em cascata
- [ ] Duplicar orçamento como modelo (obra nova a partir de obra anterior)
- [ ] Itens de administração local / mobilização como grupo próprio
- [ ] Bloqueio/desbloqueio de item (preço travado, não recalcula ao trocar a base)

**BDI**
- [ ] Fórmula do Acórdão TCU 2622/2013: `BDI = [((1+AC+S+R+G)·(1+DF)·(1+L)) / (1−I)] − 1`
      com AC (administração central), S (seguro), R (risco), G (garantia), DF (despesas financeiras),
      L (lucro), I (tributos: PIS, COFINS, ISS, CPRB)
- [ ] BDI diferenciado por grupo/serviço (equipamentos e materiais com BDI reduzido)
- [ ] Demonstrativo de BDI imprimível

**Encargos sociais**
- [ ] Grupos A, B, C, D com reincidências, para **horista** e **mensalista**
- [ ] Regime **desonerado** e **não desonerado**
- [ ] Percentual editável por orçamento; planilha de encargos imprimível

**Bases de preço e composições**
- [ ] Importar SINAPI (por UF/mês, desonerado e não desonerado), SICRO, SEINFRA, CPOS, TCPO
- [ ] Múltiplas bases coexistindo; base própria da empresa
- [ ] Composição com insumos, mão de obra, equipamentos, coeficientes, produtividade
- [ ] Composição auxiliar (composição dentro de composição), com profundidade controlada
- [ ] Troca de data-base do orçamento inteiro com relatório de impacto (antes × depois)
- [ ] Nunca duplicar composição: chave `(base, código)` única

**Cronograma**
- [ ] Cronograma físico-financeiro por etapa e por mês, com distribuição percentual editável
- [ ] Soma dos percentuais validada em 100% por serviço
- [ ] Gantt + caminho crítico
- [ ] Cronograma resumido e executivo

**Curvas e relatórios**
- [ ] Curva ABC de serviços, materiais, mão de obra e equipamentos
- [ ] Curva S: planejado, realizado, previsto
- [ ] Histograma de mão de obra e de equipamentos
- [ ] Memória de cálculo e caderno de quantitativos
- [ ] Lista de insumos consolidada
- [ ] Exportação **PDF e Excel** de todos os relatórios acima, com cabeçalho da obra e data-base

**Medição e revisão**
- [ ] Medição mensal: período, % executado, quantidade executada, acumulado, saldo
- [ ] Revisões versionadas com comparação item a item (incluído / removido / quantidade / preço)
- [ ] Reajustamento por índice

### 2.2 Diferenciais exigidos (o que o OrçaFascio não faz)

1. **BIM 5D real** — vínculo item de orçamento ↔ elementos IFC (IfcGuid), quantitativo automático a partir
   do modelo, destaque visual no viewer a partir da linha do orçamento, recálculo ao subir nova versão do IFC.
2. **Suprimentos** — RFQ para fornecedores, recebimento de propostas, comparador (preço, frete, impostos,
   prazo, validade, avaliação), escolha do vencedor com justificativa registrada, histórico de preços
   append-only alimentando os próximos orçamentos.
3. **Integração nativa** — obra é o `Projeto` que já existe; medição gera lançamento previsto no Financeiro;
   cronograma usa a EAP do Planejamento; arquivos usam o Diretório; tudo auditado.

---

## 3. Regras invioláveis

Violação destas regras é motivo de refazer o passo, não de seguir adiante:

1. **Toda mutação** passa por `defineAction` com `modulo: "custos"`, `recurso: "custos"`, `entidade` e
   `entidadeId`. `capturarAntes` vai **dentro do objeto de config**, não como 3º argumento.
2. **Toda leitura** fica em `queries.ts` com `import "server-only"` e devolve DTO tipado. Prisma não vaza
   para componente.
3. **Todo cálculo** (BDI, encargos, composição, roll-up, ABC, curva S, medição, diff) mora em módulo
   **puro, sem I/O**, com `*.test.ts`. Nenhuma fórmula em action, query ou componente React.
4. **Nada de REST CRUD.** REST só para multipart, export/streaming e token público.
5. Prisma de `@/generated/prisma/client`. `@@map` snake_case, `@@index` em toda FK filtrada, `///`
   explicando campo não óbvio. Dinheiro `Decimal(14,2)`, quantidade `Decimal(12,2)`, coeficiente
   `Decimal(12,6)`, percentual `Decimal(5,2)`.
6. shadcn sobre **base-ui**: `render={<Comp/>}` (nunca `asChild`); `Select onValueChange` devolve `string | null`.
7. UI 100% pt-BR, identificadores em inglês, commits semânticos em pt-BR.
8. **Zero dependência nova.** Em especial: nenhuma lib de gráfico (SVG à mão), nenhum segundo motor de
   CPM, nenhum segundo componente de Gantt.
9. **Não criar** `Obra`, `FornecedorCusto`, nem segundo cadastro de cliente. Orçamento ancora em `Projeto`;
   fornecedor **estende** o `Fornecedor` do Financeiro.
10. Revisão, quantitativo e proposta rejeitada **nunca** são deletados ou sobrescritos.
11. Código de composição/base publicado é **chave estável** — renomear quebra orçamento histórico.
12. Trabalho em branch de **dev**; `master` é estável/deploy.

---

## 4. Decisões bloqueantes — PARE e pergunte

Antes de escrever a primeira linha do schema (C0), faça estas perguntas ao usuário e **aguarde resposta**.
Não assuma default:

- **D1** — Orçamento pode existir **sem** `Projeto` cadastrado (estudo avulso / orçamento para terceiros)?
  → define se `projetoId` é FK obrigatória ou opcional + `nomeAvulso`.
- **D4** — Medição de custos gera `Lancamento` previsto no Financeiro (como `MedicaoLicitacao` faz) ou fica
  isolada? → define a ponte financeira e o risco de dupla contagem com licitações.
- **D6** — "Múltiplas empresas" é **multi-tenant real** (isolamento por empresa em todas as tabelas) ou
  apenas **múltiplas bases de preço**? → multi-tenant real é reforma transversal, muito além deste módulo.

Não bloqueiam C0, perguntar na onda correspondente:
- **D2** (C1) — formato real do arquivo de importação SINAPI. Peça uma **amostra real** antes de escrever o mapeador.
- **D3** (C6) — orçamento passa por aprovação por alçada (`lib/aprovacao.ts`) antes de virar revisão oficial?
- **D5** (C5) — cronograma estende `EapTarefa` com FK para item de orçamento, ou usa tabela de junção?

---

## 5. Método de trabalho

Para **cada onda**, nesta ordem:

1. **Plano** — escreva `docs/superpowers/plans/AAAA-MM-DD-custos-cX-<nome>.md` no formato dos planos
   existentes (Goal / Architecture / Tech Stack / Status / Global Constraints / Passos com `- [ ]` e
   critério de **Aceite** por passo / Definition of Done / fora de escopo). Apresente e **aguarde OK**.
2. **Implementação** — passo a passo, marcando `- [x]` e atualizando o **Status** no topo do plano.
3. **Verificação** — obrigatória ao fim da onda, sem exceção:
   ```
   npx tsc --noEmit
   npm test
   npm run lint
   npm run build          # NUNCA com `next dev` ativo na :3000 — corrompe o .next
   ```
   Reporte o resultado real. Teste que falha é reportado com a saída, não escondido.
4. **Verificação manual no navegador** — liste o roteiro de clique (`npm run dev:server` quando houver
   job/realtime envolvido; `npm run dev` não roda pg-boss).
5. **Commit** — semântico em pt-BR, escopo `custos`. Ex.: `feat(custos): banco de composições e insumos`.

**Migrações:** `npm run db:migrate` com nome semântico + `npm run db:generate`. Se der drift do banco de
dev, não faça `migrate reset` às cegas — avise o usuário e ofereça o contorno (`db push` + migração escrita
à mão + `migrate resolve`).

**Seed:** recurso `custos` novo em `permissions-catalog.ts` **e** em `prisma/seed.ts`. Registre no plano que
o deploy exige `npm run db:seed`, senão ninguém acessa a tela.

**Troca de modelo:** se a onda seguinte pedir um modelo diferente do que está ativo, **PARE e espere** o
usuário trocar com `/model`. Não siga só avisando.

---

## 6. Ondas

Escopo resumido; o detalhe fino está no design §10. Não invada a onda seguinte.

### C0 — Fundação  · modelo: **Opus**
Schema base (`CustoOrcamento`, `CustoOrcamentoRevisao`, `CustoOrcamentoItem` + enums), recurso `custos`
com ações `ver`/`gerir`/`bancos`/`cotacao` no catálogo e no seed, item de navegação no grupo "Engenharia",
aba `/custos` em `ABAS_CONFIGURAVEIS`, cabeçalho do orçamento (contratante, data-base, BDI, encargos,
regime tributário), e os módulos puros `bdi.ts` + `encargos-obra.ts` + `orcamento-arvore.ts` com testes.
**DoD:** criar orçamento vinculado a projeto, editar cabeçalho, ver BDI e encargos calculados e
demonstrativo na tela. Bloqueado por D1/D4/D6.

### C1 — Bancos  · modelo: **Sonnet**
`CustoInsumo`, `CustoBasePreco`, `CustoPreco`, `CustoComposicao`, `CustoComposicaoItem` (com auxiliar).
Importador de base sobre `lib/import/*`, rodando em **job pg-boss** (SINAPI tem ~50 mil linhas — não cabe
em Server Action). CRUD de composição própria. Bloqueado por D2 (amostra real do arquivo).
**DoD:** importar uma base real, navegar/buscar composições e insumos, criar composição própria, ver o
custo unitário calculado a partir dos coeficientes.

### C2 — Orçamento  · modelo: **Opus**
Árvore hierárquica com `parentId`/`ordem`/código WBS, vínculo item ↔ composição, **custo unitário
materializado** no item (`custoUnitario` + `versaoBase` gravados), roll-up incremental, BDI por grupo,
bloqueio de item, duplicar orçamento como modelo, troca de data-base com relatório de impacto.
Planilha orçamentária analítica e sintética em XLSX e PDF.
**DoD:** montar orçamento completo de uma obra pequena e exportar a planilha nos dois formatos.

### C3 — Quantitativos  · modelo: **Opus**
`CustoQuantitativo` com `origem` (`manual | ifc | dwg | pdf | ia`) e rastro para a fonte
(uploadId + IfcGuid, ou página/coordenada do PDF). Extração automática do IFC no **client**, sobre
`indice-elementos.ts` (o modelo já está carregado no viewer — não subir malha para o servidor).
Semi-automático sobre DXF; manual sobre PDF reusando o visualizador de pranchas. `CustoVinculoBim`.
Caderno de quantitativos.
**DoD:** levantar área de parede de um IFC real, vincular a um item do orçamento, e destacar os elementos
no viewer clicando na linha do orçamento.

### C4 — Suprimentos  · modelo: **Sonnet**
**Estender** o `Fornecedor` existente (regiões atendidas, categorias, condições comerciais, prazo médio,
avaliação, representantes) — colunas novas ou tabela satélite, nunca model paralelo. `CustoRfq`,
`CustoRfqItem`, `CustoRfqConvite`, `CustoProposta`, `CustoPropostaItem`. Comparador como **módulo puro
testado**. Escolha do vencedor com justificativa obrigatória; propostas rejeitadas preservadas.
`CustoPrecoHistorico` append-only. Notificação categoria `custos` (item sem cotação, cotação vencendo).
**DoD:** criar RFQ, registrar 3 propostas, comparar, escolher vencedor com justificativa, e ver o preço
aparecer no histórico.

### C5 — Tempo e dinheiro  · modelo: **Opus**
Cronograma sobre `EapTarefa`/`EapDependencia` (**sem** reescrever CPM ou Gantt), distribuição percentual
por mês com validação de 100%, cronograma físico-financeiro, Curva S (planejado/realizado/previsto) e
Curva ABC (serviços, materiais, mão de obra, equipamentos) — **SVG à mão**. Histogramas de mão de obra e
equipamentos. Bloqueado por D5.
**DoD:** cronograma físico-financeiro coerente com o orçamento, Curva S e ABC na tela e no PDF.

### C6 — Medições e revisões  · modelo: **Opus**
`CustoMedicao`/`CustoMedicaoItem` espelhando `MedicaoLicitacao`; acumulado, saldo, % executado; ponte para
o Financeiro conforme D4. Revisões: snapshot imutável, `@@unique([orcamentoId, numero])`, motor de **diff**
puro (incluído / removido / quantidade / preço / composição). Reajustamento por índice — reusar a lógica de
`licitacoes/contrato/reajuste.ts`. Aprovação por alçada conforme D3.
**DoD:** medir dois períodos, ver Curva S realizada atualizar, criar revisão e comparar com a anterior
item a item.

### C7 — Relatórios e 5D  · modelo: **Sonnet**
Os 11 relatórios do briefing em PDF (rota `/print` + puppeteer) e Excel (ExcelJS na rota), com cabeçalho da
obra e data-base. Memória de cálculo e demonstrativos de BDI/encargos. Comparação entre versões de IFC
com impacto de custo (reusar `coordenacao/diff.ts`). Documentação: atualizar `docs/manual/**` (a rota
`/ajuda` lê o markdown direto) e o `docs/HANDOFF.md`.
**DoD:** todos os relatórios saem nos dois formatos; manual do módulo publicado.

---

## 7. Desempenho (obra grande = 5–10 mil itens)

- Roll-up **incremental**: recalcula só o caminho até a raiz. Nunca `SELECT` da árvore inteira por edição.
- Custo unitário **materializado** no item no momento do cálculo — é o que torna a revisão reproduzível anos depois.
- Import de base e recálculo global → **job pg-boss**, nunca Server Action.
- Extração de quantitativo IFC → **client**, envia só o agregado.
- Toda listagem com `parseListParams` + `skip`/`take`. Nenhum `findMany` sem paginação.

---

## 8. Costuras para IA (arquitetar agora, não implementar)

Sem provedor de IA nesta entrega. Deixar pronto:
- `origem` (`manual | ifc | dwg | pdf | ia`) e `confianca Decimal?` em todo dado extraído.
- Rastro para a fonte em todo levantamento (mesmo mecanismo de âncora de `ApontamentoCoordenacao`).
- Interface de entrada normalizada no comparador de cotações, para que a leitura de PDF por IA apenas
  preencha a mesma estrutura que hoje é digitada.
- Regras determinísticas ("item sem cotação", "preço fora da faixa histórica") em módulo puro — valor
  imediato e viram features de modelo depois.

---

## 9. Anti-padrões — reprovação automática

- Criar `Obra`, `FornecedorCusto`, ou segundo cadastro de cliente.
- Escrever outro CPM ou outro Gantt.
- Adicionar recharts/chart.js/d3.
- Rota REST de CRUD para orçamento/itens.
- Cálculo dentro de action, query ou componente.
- `Float`/`number` para dinheiro no schema.
- Deletar ou sobrescrever revisão, quantitativo ou proposta rejeitada.
- Importar de `@prisma/client`; usar `asChild`; assumir que `onValueChange` devolve `string`.
- Import de base pesada dentro de Server Action.
- Esquecer `npm run db:seed` no roteiro de deploy.
- Rodar `npm run build` com `next dev` ativo na :3000.
- Marcar onda como concluída sem `tsc` + `test` + `lint` + `build` limpos e reportados.
