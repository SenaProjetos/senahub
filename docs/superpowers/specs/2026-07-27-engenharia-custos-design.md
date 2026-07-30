# Engenharia de Custos — Design de conformidade arquitetural

> **Propósito deste documento:** mapear os padrões já existentes no SenaHub e definir, item a item,
> como o módulo **Engenharia de Custos** deve segui-los. É pré-requisito de qualquer código: nenhum
> padrão novo pode ser criado onde já existe solução equivalente no projeto.
>
> **Estado:** design aprovado para revisão. **Nenhuma linha de código escrita ainda.**
> **Data:** 2026-07-27 · **Origem:** briefing "Engenharia de Custos" (orçamento de obras, BIM 5D).

---

## 0. Escopo

**É:** produção de documentação técnica de orçamento de obra a partir de projetos (IFC/DWG/PDF) —
quantitativos, composições, insumos, cotações, orçamento hierárquico, cronograma físico-financeiro,
curvas ABC/S, medições, revisões e relatórios.

**Não é:** CRM comercial nem elaboração de proposta comercial. Isso já existe em `modules/comercial`
(`Lead`, `Proposta`, `TabelaPreco`, `ItemComposicaoPreco`) e **não deve ser tocado nem duplicado**.
A ponte entre os dois é uma FK opcional, descrita em §4.

---

## 1. Inventário dos padrões existentes (o que já está resolvido)

### 1.1 Camadas de um módulo

Padrão fixo em `src/modules/<dominio>/`:

| Arquivo | Papel | Regra |
|---|---|---|
| `queries.ts` | leituras | `import "server-only"` na 1ª linha; exporta tipos DTO explícitos (ex.: `NormaItem`) |
| `actions.ts` | mutações | `"use server"`; **toda** export passa por `defineAction` |
| `service.ts` | regra de negócio | puro de Next/HTTP; compartilhado por actions **e** jobs-handlers |
| `schemas.ts` | Zod | schemas de entrada das actions |
| `*.ts` puros | algoritmos | sem `server-only`/Prisma → testáveis em vitest (node) |
| `*.test.ts` | testes | só para lógica pura |

Módulos grandes aninham subpastas por sub-feature, cada uma repetindo o trio
`actions.ts`/`queries.ts`/`schemas.ts` — ver `modules/licitacoes/{contrato,composicao,config,…}`,
`modules/financeiro/{cadastros,conciliacao,folha,…}`, `modules/rh/{banco,escalas,folha,…}`.
**Engenharia de Custos usará essa forma aninhada desde o início** (§5).

### 1.2 `defineAction` — o pilar

[src/lib/with-action.ts:50](src/lib/with-action.ts#L50). Cadeia: sessão → `mustChangePassword`/`ativo`
→ gate por `roles[]` → permissão fina `recurso:acao` → validação Zod → execução → **auditoria automática**.

- Erro de negócio exibível: `throw new ActionError("msg")`. Qualquer outro throw vira mensagem genérica.
- Diff antes/depois: `capturarAntes` **dentro do objeto de config** (não é 3º argumento).
- `entidade` + `entidadeId` alimentam o `AuditLog` (usado pelo Histórico do projeto).
- Retorno sempre `ActionResult<T>` = `{ok:true,data}` | `{ok:false,error,fieldErrors?}`.
- Config compartilhada por sub-feature via `const base = {...} as const` — ver
  [src/modules/financeiro/orcamento/actions.ts:8](src/modules/financeiro/orcamento/actions.ts#L8).

**Auditoria é obrigatória em toda mutação.** É de graça pelo `defineAction`; não há caso em que
Engenharia de Custos possa passar por fora.

### 1.3 Sessão, perfis e permissões

- [src/lib/session.ts](src/lib/session.ts): `requireUser` / `requireRole` / `requirePermission`.
  `getSession` é memoizado por request (`react.cache`). Sócio ativo = piso de **leitura** de supervisor.
- [src/lib/roles.ts](src/lib/roles.ts): 9 papéis + conjuntos (`GLOBAL_ROLES`, `INTERNAL_ROLES`,
  `PROJETO_MEMBRO_ROLES`…) e `acessoGlobal(u)`.
- [src/lib/permissions.ts:30](src/lib/permissions.ts#L30): `can(role, recurso, acao)`, `admin` bypassa,
  cache LRU por perfil (TTL 10 min) → `invalidatePermissions(role)` ao editar a matriz.
- [src/lib/permissions-catalog.ts](src/lib/permissions-catalog.ts): catálogo `recurso → ações` que monta
  a tela Configurações → Permissões.
- `prisma/seed.ts` concede as permissões base por perfil (idempotente, `upsert` em
  `role_recurso_acao`). **Recurso novo exige entrada no catálogo + no seed + `npm run db:seed` no deploy.**
- `middleware.ts` só faz checagem otimista de cookie — a autorização real é na página/action.

### 1.4 Rotas e páginas

- Página = Server Component em `src/app/(dashboard)/<rota>/page.tsx`: exporta `metadata`, chama
  `requirePermission(...)`, carrega dados com `Promise.all` e renderiza um único `*-view`.
  Referência canônica: [src/app/(dashboard)/engenharia/normas/page.tsx](src/app/\(dashboard\)/engenharia/normas/page.tsx).
- **REST só para:** multipart, token público, streaming/download, health. Todo o resto é Server Action.
  Não se cria endpoint CRUD REST.
- Rotas de export seguem: `getSession()` → `can()` → 401/403 JSON → gera buffer → `NextResponse` com
  `Content-Disposition`. Ver [src/app/api/licitacoes/export/xlsx/route.ts](src/app/api/licitacoes/export/xlsx/route.ts).

### 1.5 Listagens

[src/lib/list-params.ts](src/lib/list-params.ts): `parseListParams(sp, cfg)` → `{page,pageSize,skip,take,sort,dir,q}`
com **whitelist de `sortFields`** (anti-injeção). No cliente, `useSetParams`
([src/lib/use-set-param.ts](src/lib/use-set-param.ts)) atualiza a URL e reseta `page` quando outro filtro muda.
Componentes prontos: `ui/pagination.tsx`, `ui/sortable-head.tsx`.

### 1.6 Componentes e design system

- Convenção de nome: `*-view.tsx` (página inteira), `*-dialog.tsx` (modal), `*-form.tsx` (form reusável),
  `*-button.tsx` (ação contextual). Ficam em `src/components/<dominio>/`.
- `components/ui/` = shadcn **sobre base-ui, não Radix** → `render={<Comp/>}`, nunca `asChild`;
  `Select onValueChange` devolve `string | null`.
- Primitivas já existentes que **não** podem ser reescritas: `confirm-dialog` (`useConfirm()`),
  `empty-state`, `status-badge` (tons `success|warning|danger|info|neutral`), `sortable-head`,
  `pagination`, `skeleton`, `sparkline`, `table`, `tabs`, `sheet`, `scroll-area`.
- Tokens em `globals.css`: `--color-status-*`, `--color-chart-1..5`, `--color-success|warning|info`,
  escala de `--radius-*`. **Nada de hex/rgb hardcoded** nos componentes.
- Feedback ao usuário: `sonner` (`toast.success` / `toast.error(r.error)`), sempre em pt-BR.
- Formatação: `brl`, `brlInteiro`, `formatarData`, `formatarDataHora`, `formatarMesCurto`,
  `rotuloRevisao` em [src/lib/utils.ts](src/lib/utils.ts).
- **Gráficos são SVG à mão — não há biblioteca de charts no projeto** (nem recharts). Ver
  [src/components/financeiro/fluxo-projecao-chart.tsx](src/components/financeiro/fluxo-projecao-chart.tsx)
  (viewBox 100×40, `preserveAspectRatio="none"`, `fill-primary/10`) e `ui/sparkline.tsx`.
  Curva S e Curva ABC seguem exatamente esse padrão.

### 1.7 Prisma / banco

- Client gerado em `src/generated/prisma` → importar de `@/generated/prisma/client`, **nunca**
  `@prisma/client`. `DATABASE_URL` vive em `prisma.config.ts`.
- Convenções de modelo, verificadas em todo o schema (4230 linhas):
  - `id String @id @default(cuid())`
  - `createdAt DateTime @default(now())` / `updatedAt DateTime @updatedAt`
  - `@@map("snake_case")` obrigatório; `@@index` em toda FK usada em filtro
  - dinheiro = `Decimal @db.Decimal(14,2)`; percentual = `Decimal @db.Decimal(5,2)`;
    quantidade = `Decimal @db.Decimal(12,2)`; índice de reajuste = `Decimal @db.Decimal(6,3)`
  - datas puras = `DateTime @db.Date`
  - enums em minúsculo snake (`em_andamento`, `aguardando`)
  - `ativo Boolean @default(true)` para catálogos; `ordem Int @default(0)` para listas ordenáveis
  - comentários `///` documentam a intenção — o schema é documentação viva
- **Versionamento** tem padrão consolidado: entidade `X` + tabela `XVersao` com
  `numero Int` e `@@unique([xId, numero])`, arquivo/autor/`createdAt` por versão, nunca `UPDATE` destrutivo.
  Ver `DocumentoVersao`, `DocJuridicoVersao`, `DocLicitacaoVersao`, `CertidaoVersao`, `ArtVersao`,
  `PropostaVersao`, `DocumentoModeloVersao`.
- **Soft delete**: `excluidoEm DateTime?` + filtro automático via extensão do client em
  [src/lib/prisma.ts](src/lib/prisma.ts) (hoje aplicada a `Lancamento` e `Upload`).
- **Sequência anual atômica**: `ProjetoSequencia`/`PropostaSequencia` (`ano Int @id`, `ultimo Int`).

### 1.8 Arquivos e uploads

- Multipart em `/api/uploads` (e rotas por domínio: `/api/engenharia/normas`, `/api/comercial/anexos`…).
  A rota devolve **metadados** (`{caminho, nomeArquivo, mime, tamanho, hashSha256}`) e a Server Action
  persiste — ver o fluxo em [src/components/engenharia/normas-view.tsx:55](src/components/engenharia/normas-view.tsx#L55).
- `lib/storage.ts` → `resolverCaminho()` com guarda anti-traversal sobre `STORAGE_BASE_PATH`;
  caminho gravado é **sempre relativo**. `removerArquivo()` em exclusões.
- Árvore de pastas do projeto = `PastaProjeto` (auto-referente, template ou custom); arquivo = `Upload`
  (`pacote` XOR `pastaId`), com `versao`, `hashSha256`, validação e lixeira.
- Hook de conversão: `/api/uploads/route.ts` detecta a extensão e enfileira
  (`enfileirarConversao` para `.ifc`, `enfileirarConversaoDwg` para `.dwg`).

### 1.9 BIM

- `ConversaoModelo` (1:1 `Upload`/`DocumentoVersao`) guarda status/caminho do `.frag`;
  máquina de estado pura e testada em `modules/coordenacao/conversao-estado.ts`.
- Toda API three.js/`@thatopen/fragments` está confinada no adapter client-only
  `modules/coordenacao/viewer/engine.ts`, carregado por `next/dynamic({ssr:false})`.
- `modules/coordenacao/indice-elementos.ts` é **puro**: normaliza a árvore espacial do IFC e agrupa
  elementos por pavimento e por `IfcClass`. É exatamente o insumo de um levantamento automático.
- `viewer/coords.ts` (three Y-up ↔ IFC Z-up) e `bcf/writer.ts` (XML puro) mostram o padrão:
  formato/geometria em módulo puro testado, I/O fora.

### 1.10 Jobs, tempo real, notificações

- `pg-boss` sobre o mesmo PostgreSQL; filas e cron em `lib/jobs.ts`, handlers em `lib/jobs-handlers.ts`.
  `boss` vive em `globalThis.__senahubBoss` (split tsx ↔ webpack) — acessar só via `getBoss()`.
  **Jobs só rodam sob `npm run dev:server` / produção.**
- Socket.io compartilha o HTTP server; `io`/presença em `globalThis` por necessidade.
- `lib/notificar.ts` → `notificar()`/`notificarMuitos()` com `categoria` opcional e opt-out por usuário
  (`filtrarPorCategoria`). Categoria nova exige entrada na lista de categorias.

### 1.11 Importação e exportação

- Motor de importação em massa já existe: `lib/import/{csv,planilha,mapeamento,valores}.ts` —
  leitura CSV/XLSX (ExcelJS via `createRequire`, por causa do Turbopack), auto-detecção de colunas por
  sinônimos pt-BR, normalização de valores BR, teto de 20 MB.
- Export XLSX: ExcelJS na rota REST (§1.4). Export PDF: `puppeteer-core` + `CHROME_PATH` renderizando uma
  rota `/print` autenticada por cookie — ver [src/app/api/planejamento/[projetoId]/pdf/route.ts](src/app/api/planejamento/\[projetoId\]/pdf/route.ts).
- Export DOCX: `docx`. Export DXF: `lib/dxf.ts` (writer R12 puro).

### 1.12 Testes

`vitest` em ambiente **node**, sobre `src/**/*.test.ts`, com `server-only` stubado. Só se testa **lógica
pura** (cálculo, formato, máquina de estado, parsing). Nada de teste de componente ou de banco.

---

## 2. Colisões de nome detectadas (bloqueiam nomes "óbvios")

Levantamento sobre os ~200 models do schema:

| Nome desejado | Já existe | Significado atual |
|---|---|---|
| `Fornecedor` | **sim** ([schema:869](prisma/schema.prisma#L869)) | fornecedor do Financeiro (+ `FornecedorServico`) |
| `OrcamentoItem` | **sim** ([schema:806](prisma/schema.prisma#L806)) | orçamento **financeiro** anual por categoria |
| `Recurso` | **sim** ([schema:2862](prisma/schema.prisma#L2862)) | pessoa como recurso de planejamento |
| `ItemComposicao*` | **sim** | `ItemComposicaoPreco` (proposta), `ItemComposicaoLicitacao` (licitação) |
| `Medicao*` | **sim** | `MedicaoLicitacao` |
| `Composicao` / `Insumo` / `Cotacao` | não | livres |

A convenção do repo para desambiguar é **sufixar com o domínio** (`MedicaoLicitacao`,
`DocLicitacaoVersao`, `ItemComposicaoPreco`). Engenharia de Custos adota o mesmo (§5.2).

---

## 3. `Obra` × `Projeto` — a decisão estrutural

O briefing pede um submódulo "Projetos" com cliente, contratante, nome, localização, área construída,
tipo, data-base, BDI, encargos, regime tributário, responsáveis e anexos.

`Projeto` já carrega: `codigo` (AAXXXX com sequência anual), `cliente`, `nome`, `descricao`, `areaM2`,
`endereco`, `prazoFinal`, `valorContrato`, `situacao`, `tipo`, membros, disciplinas, pastas, uploads,
ARTs, EAP, coordenação BIM, histórico/auditoria.

**Diretriz (princípio "não duplicar"):** não se cria entidade `Obra`. O orçamento é **ancorado no
`Projeto`** por FK obrigatória, e os campos exclusivos de custo (data-base, BDI, encargos, regime
tributário, contratante quando difere do cliente) vivem no cabeçalho do orçamento — que é versionado —
e não no `Projeto`. Assim:

- não há cadastro paralelo de obra, nem cliente/endereço duplicados;
- BDI e data-base **têm que** ser versionados junto com o orçamento (mudam entre revisões), o que seria
  errado guardar no `Projeto`;
- Engenharia de Custos entra como **aba do projeto** (`/projetos/[id]/custos`) além da área global
  `/custos`, reusando `ABAS_CONFIGURAVEIS` ([src/modules/projetos/abas.ts:6](src/modules/projetos/abas.ts#L6)).

> **Pendência para o usuário (D1):** existe caso real de orçamento **sem** projeto cadastrado
> (estudo avulso, orçamento para terceiros)? Se sim, a FK vira opcional + `nomeAvulso`. Ver §9.

---

## 4. Mapa de reuso — requisito × o que já existe × veredito

| # | Requisito do briefing | Já existe no SenaHub | Veredito |
|---|---|---|---|
| 1 | Projetos/obra (cliente, área, endereço, responsáveis) | `Projeto`, `Cliente`, `ProjetoMembro`, `ResponsavelTecnico`, `Art` | **reusar**; só o cabeçalho de custo é novo (§3) |
| 1 | Anexos (IFC/DWG/PDF/memorial/fotos) + controle de revisão | `Upload` (versão, hash, lixeira) + `PastaProjeto` + `/api/uploads` | **reusar integralmente**; zero storage novo |
| 2 | Leitura de IFC | `ConversaoModelo` + job `converter-ifc` + `viewer/engine.ts` + `indice-elementos.ts` | **reusar**; levantamento automático consome `indice-elementos` |
| 2 | Leitura de DWG | `ConversaoDesenho` + job `converter-dwg` + `lib/dxf.ts` + `dxf-parser` | **reusar** |
| 2 | Leitura de PDF | `pdfjs-dist` (já usado no visualizador de pranchas + `Pendencia` posicional) | **reusar** o visualizador; medição manual sobre PDF é a camada nova |
| 3 | Quantitativos (auto/semi/manual) | — | **novo**, mas o motor de agregação é puro e testado |
| 4 | Banco de composições + import SINAPI/SICRO/… | `lib/import/*` (CSV/XLSX + mapeamento por sinônimos) | **reusar o motor de import**; entidades novas |
| 5 | Banco de insumos + múltiplas bases de preço | — | **novo** |
| 6 | Cadastro de fornecedores | ~~**`Fornecedor` + `FornecedorServico` já existem** — ESTENDER o model existente~~ **REVOGADO 2026-07-30** (ver nota abaixo) | novo model `CustoFornecedor`, dedicado — `Fornecedor`/`FornecedorServico` do financeiro seguem intocados |
| 7 | Cotações (RFQ) | — | **novo**; anexos de proposta reusam o padrão multipart + `Upload`/storage |
| 8 | Comparador de cotações | — | **novo**; motor de comparação = módulo **puro testado** |
| 9 | Histórico de preços | padrão de histórico: `LancamentoStatusHistorico`, `NotaFiscalPJHistorico`, `LicitacaoHistorico` | **novo**, seguindo o padrão de tabela-histórico append-only |
| 10 | Orçamento hierárquico | árvore auto-referente: `PastaProjeto`, `EapTarefa`, `PastaJuridica` | **novo**, mas com o padrão `parentId`/`filhos`/`ordem` já usado |
| 11 | Cronograma, Gantt, caminho crítico | `EapTarefa`+`EapDependencia`, `caminho-critico.ts` (CPM puro), `components/planejamento/gantt.tsx`, `LinhaBase` | **reusar** — não se escreve outro CPM nem outro Gantt |
| 12 | Cronograma físico-financeiro | `PlanejamentoLinha`, `plano-vs-real.tsx`, `modules/projetos/evm` | **reusar conceitos**; agregação nova, visual reaproveitado |
| 13 | Curva ABC / Curva S | SVG à mão (`fluxo-projecao-chart.tsx`, `ui/sparkline.tsx`) | **reusar o padrão**; **não** adicionar lib de gráfico |
| 14 | Medições mensais | `MedicaoLicitacao` (medição → `Lancamento` de receita previsto) | **espelhar o padrão**, inclusive a ponte para o Financeiro |
| 15 | Revisões / comparação de versões | `XVersao` + `@@unique([xId, numero])`; diff em `coordenacao/diff.ts`; `rotuloRevisao()` | **reusar padrão de versão**; motor de diff é módulo puro novo |
| 16 | Relatórios PDF/Excel | rota `/print` + puppeteer; ExcelJS na rota; `docx`; Estúdio de Documentos (tokens) | **reusar**; avaliar gerar Planilha Orçamentária pelo Estúdio |
| — | Fluxo de caixa previsto | `Lancamento`, `PlanejamentoLinha`, `lib/aging.ts` | **integrar**, não recriar |
| — | Aprovação por alçada | `lib/aprovacao.ts` (`devePassarPorAprovacao`), `financeiro/aprovacao/niveis.ts` | **reusar** se orçamento precisar de aprovação |
| — | Notificações (item sem cotação, cotação vencendo) | `lib/notificar.ts` + opt-out por categoria | **reusar**; categoria nova `custos` |
| — | Processamento pesado (import de base, recálculo de obra grande) | `pg-boss` (`lib/jobs.ts`) | **reusar**; lembrar que só roda em `dev:server`/prod |

**Ponto de atenção:** `lib/encargos.ts` é a calculadora **progressiva de INSS/IRRF da folha CLT** — não
tem relação com encargos sociais de composição de custo de obra. O fator de encargos (Grupo A/B) e o BDI
são módulos puros **novos** (`bdi.ts`, `encargos-obra.ts`), nomeados de modo a não confundir com o de RH.

---

## 5. Estrutura proposta

### 5.1 Pastas

```
src/modules/custos/
  registry.ts            # catálogos client-safe (tipos de empreendimento, bases de preço, naturezas)
  types.ts               # tipos compartilhados client/server
  queries.ts             # leituras de topo (lista de orçamentos)
  actions.ts             # ações de topo (criar orçamento, revisar)
  schemas.ts
  service.ts             # orquestração compartilhada actions ↔ jobs-handlers
  bdi.ts + bdi.test.ts               # PURO — BDI, encargos sociais, desoneração, regime tributário
  composicao.ts + .test.ts           # PURO — custo unitário a partir de coeficientes × preços
  orcamento-arvore.ts + .test.ts     # PURO — hierarquia, roll-up de totais, recálculo incremental
  curva-abc.ts + .test.ts            # PURO — classificação A/B/C por acumulado
  curva-s.ts + .test.ts              # PURO — distribuição planejado/realizado/previsto no tempo
  medicao.ts + .test.ts              # PURO — acumulado, saldo, % executado
  diff-revisao.ts + .test.ts         # PURO — comparação entre revisões
  quantitativos/         { actions, queries, schemas } + extrator-ifc.ts (puro, sobre indice-elementos)
  composicoes/           { actions, queries, schemas } + importador.ts (sobre lib/import)
  insumos/               { actions, queries, schemas } + historico-preco.ts (puro)
  cotacoes/              { actions, queries, schemas } + comparador.ts + .test.ts (puro)
  orcamento/             { actions, queries, schemas }
  cronograma/            { actions, queries }          # adapta EapTarefa; não reimplementa CPM
  medicoes/              { actions, queries, schemas }
  relatorios/            queries.ts                    # agregações para os 11 relatórios

src/app/(dashboard)/custos/…            # área global (bancos de composições/insumos/cotações)
src/app/(dashboard)/projetos/[id]/custos/…   # aba do projeto (orçamento daquela obra)
src/app/api/custos/…                    # SÓ multipart (anexo de proposta, import de base) e export
src/components/custos/                  # *-view / *-dialog / *-form / *-button
```

### 5.2 Nomes de entidade (sem colisão)

Prefixo `Custo…` para o que é do domínio de orçamento; sufixo de domínio quando o nome-base já existe.

| Entidade | Papel | Observação |
|---|---|---|
| `CustoOrcamento` | cabeçalho: projeto, contratante, data-base, BDI, encargos, regime, revisão vigente | FK `projetoId` |
| `CustoOrcamentoRevisao` | snapshot imutável de uma revisão | `@@unique([orcamentoId, numero])` |
| `CustoOrcamentoItem` | nó da árvore (grupo ou serviço) | `parentId`/`ordem`, código WBS |
| `CustoQuantitativo` | levantamento (origem auto/semi/manual, unidade, qtd, elemento BIM, responsável) | `origem` enum |
| `CustoComposicao` | composição do banco (código, descrição, unidade, base, produtividade) | `@@unique([baseId, codigo])` |
| `CustoComposicaoItem` | insumo/mão de obra/equipamento com coeficiente | recursivo p/ composição auxiliar |
| `CustoInsumo` | insumo (código, descrição, unidade, categoria, fabricante) | |
| `CustoBasePreco` | base de preços (SINAPI-PE, SINAPI-PB, própria, fornecedor) | com `dataBase` |
| `CustoPreco` | preço de um insumo numa base numa data-base | `@@unique([baseId, insumoId, dataBase])` |
| `CustoPrecoHistorico` | append-only de todo preço cotado (fornecedor, obra, data) | nunca deletar |
| `CustoRfq` / `CustoRfqItem` | solicitação de cotação e seus itens | |
| `CustoRfqConvite` | fornecedor convidado + status | FK para `CustoFornecedor` (dedicado, revogado 2026-07-30 — não é o `Fornecedor` do financeiro) |
| `CustoProposta` / `CustoPropostaItem` | proposta recebida (preço, frete, impostos, prazo, validade, condições) | anexos via `Upload` |
| `CustoMedicao` / `CustoMedicaoItem` | medição do período | espelha `MedicaoLicitacao`; gera `Lancamento` previsto |
| `CustoVinculoBim` | ligação item de orçamento ↔ IfcGuid | tabela de junção, base do 5D |

Campos de dinheiro `Decimal(14,2)`, quantidades `Decimal(12,2)`, coeficientes `Decimal(12,6)` (precisão
maior é necessária para coeficiente de composição), percentuais `Decimal(5,2)`.

### 5.3 Permissões

Entrada nova em `PERMISSOES_CATALOGO`:

```ts
{
  recurso: "custos",
  label: "Engenharia de Custos",
  acoes: [
    { acao: "ver",     label: "Ver orçamentos, composições e insumos" },
    { acao: "gerir",   label: "Criar/editar orçamentos, quantitativos e revisões" },
    { acao: "bancos",  label: "Administrar bancos de composições, insumos e bases de preço" },
    { acao: "cotacao", label: "Criar RFQs, receber propostas e escolher vencedor" },
  ],
}
```

Mais o seed correspondente (interno vê; `supervisor`/`administrativo` gerem; `cliente` fora).
`custos:bancos` é separado de propósito: base de preço corrompida contamina todos os orçamentos.

### 5.4 Navegação

Item novo no grupo **"Engenharia"** de `NAV_GROUPS` (onde já estão Ferramentas, Padrões e Normas):
`{ title: "Engenharia de Custos", href: "/custos", icon: Calculator|Coins, roles: [internos exceto ti] }`.
Sem `mobile: true` — orçamento não é fluxo de celular.
Aba do projeto: `"/custos"` acrescentada a `ABAS_CONFIGURAVEIS` + `ABA_LABEL`.

---

## 6. Contratos invioláveis

1. Toda mutação passa por `defineAction` com `modulo: "custos"`, `recurso: "custos"` e `entidade`/`entidadeId`.
2. Toda leitura fica em `queries.ts` com `import "server-only"`, devolvendo DTO tipado — Prisma não vaza
   para o componente.
3. Cálculo (BDI, composição, roll-up, ABC, S, medição, diff) mora em **módulo puro sem I/O**, com
   `*.test.ts`. Nenhuma fórmula dentro de action, query ou componente.
4. Nada de endpoint REST de CRUD. REST só para multipart, export/streaming e token público.
5. Prisma de `@/generated/prisma/client`; `@@map` snake_case; `@@index` em FK filtrada; `///` explicando
   o porquê de cada campo não óbvio.
6. UI 100% pt-BR, identificadores em inglês, commits semânticos em pt-BR.
7. shadcn base-ui: `render={<Comp/>}`, `onValueChange: string|null`.
8. Nenhuma dependência nova sem justificativa explícita — em especial **nenhuma lib de gráfico**
   (SVG à mão) e nenhum segundo motor de CPM ou de Gantt.
9. Códigos de composição/base publicados são **chaves estáveis** — mesma regra do `registry.ts` de
   ferramentas: renomear quebra orçamentos históricos.
10. Revisão nunca sobrescreve: novo `numero`, snapshot imutável, comparação por diff.

---

## 7. Desempenho (obras grandes)

Uma obra grande passa de 5–10 mil itens de orçamento e centenas de milhares de elementos IFC. Isso
condiciona o desenho desde já:

- Roll-up de totais é **incremental e puro** (recalcula só o caminho até a raiz), nunca um `SELECT` da
  árvore inteira a cada edição.
- Preço unitário de composição é **materializado** no item de orçamento no momento do cálculo
  (`custoUnitario` gravado + `versaoBase`), não recalculado a cada leitura — é isso que torna a revisão
  reproduzível anos depois.
- Import de base (SINAPI tem ~50 mil linhas) roda em **job pg-boss**, não em Server Action.
- Extração de quantitativos do IFC roda no **client** (o modelo já está carregado no viewer) e envia o
  agregado; não se sobe malha para o servidor.
- Listagens sempre com `parseListParams` + `skip/take` — nunca `findMany` sem paginação.

---

## 8. Preparação para IA (arquitetura, sem implementar)

Não se adiciona provedor de IA agora. O que se faz é deixar as costuras prontas:

- Todo dado extraído carrega **`origem`** (`manual | ifc | dwg | pdf | ia`) e **`confianca Decimal?`** —
  para que um item sugerido por IA seja distinguível e revisável.
- Todo levantamento guarda **rastro para a fonte** (uploadId + IfcGuid ou página/coordenada do PDF), que
  é o mesmo mecanismo de âncora já usado por `ApontamentoCoordenacao` e `Pendencia`.
- O comparador de cotações e o extrator de proposta expõem uma **interface de entrada normalizada**, de
  modo que a leitura por IA de um PDF de proposta apenas preencha a mesma estrutura que hoje é digitada.
- Regras determinísticas ("item sem cotação", "preço fora da faixa histórica") ficam em módulo puro —
  entregam valor imediato e viram *features* para um modelo depois.

---

## 9. Decisões pendentes do usuário

| # | Questão | Impacto |
|---|---|---|
| **D1** | Orçamento pode existir **sem** `Projeto` cadastrado (estudo avulso)? | FK obrigatória vs. opcional; muda escopo de acesso e o Histórico |
| **D2** | Import de SINAPI: qual formato real de entrada (planilha analítica oficial, exportação do OrçaFascio, ou base já tratada)? | define o mapeador; sem uma amostra real não dá para especificar |
| **D3** | O orçamento precisa passar por **aprovação por alçada** antes de virar revisão oficial? | reusa `lib/aprovacao.ts` ou não existe workflow |
| **D4** | Medição de custos gera `Lancamento` previsto no Financeiro (como `MedicaoLicitacao` faz) ou fica isolada? | define a integração financeira e o risco de dupla contagem com licitações |
| **D5** | Cronograma: estender `EapTarefa` com FK para item de orçamento, ou tabela de junção? | extensão é mais simples; junção evita poluir o planejamento de projeto |
| **D6** | "Múltiplas empresas" do briefing: é multi-tenant real (isolamento por empresa) ou só múltiplas bases de preço? | multi-tenant real é reforma transversal, muito além deste módulo |

D1, D4 e D6 são bloqueantes para o schema. D2, D3 e D5 podem ser resolvidos na onda correspondente.

---

## 10. Faseamento proposto

Ondas no formato dos planos existentes (`docs/superpowers/plans/`), cada uma fechando com
`tsc --noEmit` + `npm test` + `npm run lint` limpos e verificação manual no navegador.

| Onda | Entrega | Depende de |
|---|---|---|
| **C0 — Fundação** | schema base, permissões + seed, navegação, aba do projeto, cabeçalho do orçamento, módulos puros `bdi.ts`/`orcamento-arvore.ts` com testes | D1, D6 |
| **C1 — Bancos** | insumos, bases de preço, composições, importador de base (job pg-boss) | C0, D2 |
| **C2 — Orçamento** | árvore hierárquica, item ↔ composição, custo unitário materializado, recálculo, planilha orçamentária (XLSX/PDF) | C1 |
| **C3 — Quantitativos** | levantamento manual + semi-auto (DWG) + auto (IFC via `indice-elementos`), vínculo BIM, caderno de quantitativos | C2 |
| **C4 — Suprimentos** | `CustoFornecedor` dedicado (não é extensão do `Fornecedor` financeiro — ver §11), RFQ, propostas, comparador, escolha com justificativa, histórico de preços | C0 |
| **C5 — Tempo & dinheiro** | cronograma sobre `EapTarefa`, físico-financeiro, Curva S, Curva ABC | C2, D5 |
| **C6 — Medições & revisões** | medições mensais, integração financeira, revisões versionadas, diff | C5, D3, D4 |
| **C7 — Relatórios & 5D** | os 11 relatórios, histogramas, destaque visual de elementos no viewer por item de orçamento | C3, C6 |

Recomendação de modelo por onda (critério dos planos anteriores: scaffolding → Sonnet; lógica nova
sensível → Opus): **C0 Opus** (schema é irreversível na prática), **C1 Sonnet**, **C2 Opus**
(roll-up/precisão decimal), **C3 Opus** (extração BIM), **C4 Sonnet**, **C5 Opus** (curvas + integração
com CPM existente), **C6 Opus** (versionamento/diff + ponte financeira), **C7 Sonnet**.

---

## 11. Anti-padrões — o que explicitamente NÃO fazer

- Criar `ObraCusto` / segundo cadastro de cliente.
- ~~Criar `FornecedorCusto`~~ — **revogado 2026-07-30**: fornecedor do financeiro (serviços/
  subcontratados/despesas) e fornecedor de material cotado em RFQ são populações diferentes de verdade,
  não a mesma entidade duplicada — o anti-padrão original valia pra evitar duplicar cadastro da MESMA
  população, não pra forçar a fusão de duas populações distintas. C4 usa `CustoFornecedor`, dedicado;
  `Fornecedor`/`FornecedorServico` do financeiro seguem intocados. Ver plano de C4 §10 pro detalhe da
  migração.
- Escrever outro algoritmo de caminho crítico ou outro componente de Gantt.
- Adicionar recharts/chart.js/d3 — o padrão do repo é SVG à mão.
- Criar rotas REST de CRUD para orçamento/itens.
- Fazer cálculo dentro de Server Action, query ou componente React.
- Usar `Float`/`number` para dinheiro no schema — é `Decimal` sempre.
- Deletar ou sobrescrever revisão, quantitativo ou proposta rejeitada.
- Importar de `@prisma/client`, usar `asChild`, ou assumir que `onValueChange` devolve `string`.
- Rodar import de base pesada dentro de Server Action (estoura o tempo da request).
- Esquecer `npm run db:seed` no deploy — sem ele o recurso `custos` não existe e ninguém acessa a tela.
