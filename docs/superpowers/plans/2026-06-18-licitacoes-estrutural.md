# Licitações — Build Estrutural (Itens 1–5 + P1–P10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Este é um PLANO-MESTRE (programa).** O escopo cobre ~12 subsistemas independentes. Conforme a skill writing-plans (specs multi-subsistema → um plano por subsistema), cada **Fase** abaixo é um subsistema entregável e testável por si só. O detalhamento bite-sized (test code + passos TDD + commits) de cada fase é produzido **no momento de executar aquela fase**, não todo aqui — manter os 12 detalhados num só doc seria ingerível e envelheceria antes de rodar.

**Goal:** Transformar o módulo de licitações de "pasta de oportunidades + medição" em gestão completa de licitação pública (Lei 14.133), implementando as 15 decisões de design aprovadas.

**Architecture:** Aditivo por fase — cada fase adiciona models/migration próprios, queries (`server-only`), actions (`defineAction`), UI client e, quando aplicável, job de alerta. Parâmetros legais e toggles ficam em `ConfigSistema` (chave/valor Json), editáveis por Admin. Nada de constante legal hardcoded.

**Tech Stack:** Next.js 15 (App Router, server actions), Prisma 7 (Postgres :5433), Vitest (TDD), base-ui (Tooltip/Select), `puppeteer-core` (PDF), `exceljs` (Excel), motor de alerta em `src/lib/jobs-handlers.ts`.

## Global Constraints

- **Migrations:** estritamente aditivas (CREATE TABLE / colunas opcionais). Nenhuma coluna existente alterada/removida. `npx prisma generate` após cada migration.
- **Git:** commits locais por task (TDD). **NÃO fazer push** (padrão das tasks anteriores deste projeto). Branch dedicada por fase.
- **TDD obrigatório:** lógica pura (cálculos de saldo, % acréscimo, conflito de RT, transições) sai em módulos testáveis com teste falhando antes. Vitest `src/**/*.test.ts`.
- **Legal nunca hardcoded:** prazos de recurso, % limite de acréscimo, obrigatoriedade/modo PNCP, modo de reajuste → `ConfigSistema` key `licitacoes.config`, com defaults que preservam comportamento e **redação vigente a confirmar** antes de virar regra rígida.
- **Não remover** `DisciplinaValorLicitacao` nem o histórico/extras existentes (constraint herdada).
- **Reuso de infra:** alertas via `diaAlvo`+`notificarMuitos`+`tag`; PDF/Excel via rotas existentes; config via `ConfigSistema`; eventos de timeline via `registrarHistorico` (já criado).
- **base-ui:** Select precisa de valor não-vazio (sentinela `__none__`); Tooltip em botão desabilitado usa wrapper `<span>` + `pointer-events-none`.

## Decisões aprovadas (travadas)

| Item | Escolha | Resumo |
|---|---|---|
| 1 | **B** | `LicitacaoEvento` (tabela + enum) p/ datas-chave por fase |
| 2 | **A** | `LicitacaoComposicaoPreco`+`ItemComposicaoLicitacao` próprios; copia p/ projeto no import |
| 3 | **B** | `ContratoLicitacao` + `AditivoContrato` |
| 4 | **B** | Checklist habilitação: modelo reutilizável + instância |
| 5 | **A+B+C** | Dashboard on-the-fly **+** snapshot mensal **+** `ResultadoLicitacao` (concorrência) |
| P1 | **B** | Recursos/impugnações reusam `LicitacaoEvento` (tipos de recurso) |
| P2 | **A** | `AditivoContrato` + `limiteAcrescimoPct` configurável + acumulado derivado |
| P3 | **B** | Duas tabelas: `SancaoPropria` × `SancaoConcorrente` |
| P4 | **B** | `MatrizRiscoItem` estruturada (1:N do contrato) |
| P5 | **A** | `ResponsavelTecnico` + junção `LicitacaoResponsavelTecnico` + detecção de conflito |
| P6 | **A** | `SubcontratacaoLicitacao` + `subcontratacaoMaxPct` por licitação |
| P7 | **A+B** | PNCP manual **e** API — **selecionável via Configurações por Admin** (`pncpModo`) |
| P8 | **A+B** | Reajuste manual **e** automático — **selecionável via Configurações por Admin** (`reajusteModo`) |
| P9 | **A+B** | Viabilidade: critérios fixos **ou** configuráveis — **selecionável por licitação** (`viabilidadeModo`) |
| P10 | **B** | Modelos de relatório configuráveis **+ seleção de Modelo do Estúdio** |

### Toggles em `ConfigSistema` (key `licitacoes.config`, valor Json)

```jsonc
{
  "recurso": { "alertaDiasPadrao": [3, 1] },        // P1 — prazos CONFIGURÁVEIS (confirmar lei)
  "aditivo": { "limiteAcrescimoPctPadrao": 25, "fatorAviso": 0.8 }, // P2 — % limite CONFIGURÁVEL
  "pncp":    { "modo": "manual" },                  // P7 — "manual" | "api"
  "reajuste":{ "modo": "manual", "indices": ["IPCA","INCC","IGP-M"] }, // P8 — "manual" | "automatico"
  "datasChave": { "alertaDiasPadrao": [15, 7, 1] }  // Item 1 — antecedências padrão
}
```
Acesso por helper `getConfigLicitacoes()` (espelha `getConfigFinanceiro`), defaults preservam comportamento.

---

## File Structure (visão geral)

```
src/modules/licitacoes/
  config/queries.ts        getConfigLicitacoes()  (key licitacoes.config)
  config/actions.ts        salvarConfigLicitacoes() (Admin)
  eventos/{queries,actions}.ts        Fase 1 (Item 1-B + P1-B)
  composicao/{queries,actions}.ts     Fase 2 (Item 2-A)
  contrato/{queries,actions,saldo.ts} Fase 3 (Item 3-B + P2-A) — saldo.ts = puro/TDD
  contrato/{matriz,reajuste}.ts       Fase 4 (P4-B + P8)
  habilitacao/{queries,actions}.ts    Fase 5 (Item 4-B)
  tecnico/{queries,actions,conflito.ts} Fase 6 (P5-A) — conflito.ts = puro/TDD
  subcontratacao/{queries,actions}.ts Fase 6 (P6-A)
  sancoes/{queries,actions}.ts        Fase 7 (P3-B)
  resultado/{queries,actions}.ts      Fase 7 (Item 5-C)
  viabilidade/{queries,actions}.ts    Fase 8 (P9)
  dashboard/queries.ts                Fase 9 (Item 5-A+B)
  pncp/{queries,actions,client.ts}    Fase 10 (P7)
  relatorios/{pdf,xlsx}.ts            Fase 11 (P10)
src/app/(dashboard)/licitacoes/...    páginas/abas por fase
src/app/(dashboard)/configuracoes/licitacoes/  config Admin (toggles/legais)
prisma/migrations/...                 uma migration aditiva por fase
src/lib/jobs-handlers.ts              estende alertas (Fases 1,3,4,5,9)
```

---

## Fase 0 — Fundação de configuração

**Subsistema:** `ConfigSistema` key `licitacoes.config` + página Configurações (Admin) + helper.
**Models:** nenhum novo (reusa `ConfigSistema`). **Migration:** nenhuma.
**Arquivos:** `src/modules/licitacoes/config/{queries,actions}.ts`; `src/app/(dashboard)/configuracoes/licitacoes/page.tsx` + view; card em `configuracoes/page.tsx`.
**Test focus:** `getConfigLicitacoes()` retorna defaults quando ausente; merge parcial preserva chaves não enviadas. (TDD em módulo puro de parse/merge.)
**Deliverable:** Admin edita prazos/limite/toggles; demais fases consomem via helper.
**Integração:** `requireRole("admin")`; padrão de `financeiro/config`.

## Fase 1 — Datas-chave por fase + recursos/impugnações + alertas (Item 1-B, P1-B)

**Models:**
```prisma
enum TipoEventoLicitacao {
  abertura
  sessao
  resultado
  assinatura
  vigencia_inicio
  vigencia_fim
  // P1-B (recursos reusam a mesma tabela)
  pedido_esclarecimento
  impugnacao
  recurso
  contrarrazao
}

model LicitacaoEvento {
  id          String              @id @default(cuid())
  licitacaoId String
  licitacao   Licitacao           @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  tipo        TipoEventoLicitacao
  data        DateTime            @db.Date
  alertaDias  Int[]               @default([])
  /// P1: autoria de peça de recurso ("propria" | "concorrente"); null p/ datas-chave
  autoria     String?
  protocolo   String?
  observacao  String?
  concluidoEm DateTime?
  createdAt   DateTime            @default(now())
  @@index([licitacaoId])
  @@index([data])
  @@map("licitacao_evento")
}
```
Relação inversa em `Licitacao`: `eventos LicitacaoEvento[]`.
**Migration:** aditiva (enum + tabela + relação).
**Arquivos:** `eventos/{queries,actions}.ts`; aba/section na view; estende `alertaLicitacoes` em `jobs-handlers.ts` p/ varrer `licitacao_evento` (`data = diaAlvo(d)`, `concluidoEm: null`, dedup `tag=evt-{id}-{d}`).
**Integração:** `registrarHistorico` ao criar/alterar evento; alertaDias default vem de `getConfigLicitacoes()`.
**Test focus:** geração de alertas (quais eventos disparam em D-n); cálculo de "próxima data".
**Deliverable:** CRUD de eventos/recursos por licitação + alertas por fase.

## Fase 2 — Composição de preço da licitação (Item 2-A)

**Models:** `LicitacaoComposicaoPreco` (1:1 licitação) + `ItemComposicaoLicitacao` (igual forma ao de projeto). Relação inversa em `Licitacao`.
**Migration:** aditiva (2 tabelas).
**Arquivos:** `composicao/{queries,actions}.ts`; section na view (CRUD itens, total = Σ qtd×unitário); em `importarLicitacao`, copiar itens → `ProjetoComposicaoPreco` (como já copia docs ao Jurídico).
**Integração:** total vira "valor proposto" (base p/ saldo/avanço nas Fases 3/9). `DisciplinaValorLicitacao` permanece (não remover).
**Test focus:** soma da composição; cópia idempotente no import (sem duplicar se reimportar — guard já existe via `projetoId`).
**Deliverable:** proposta estruturada por itens, propagada ao projeto no ganho.

## Fase 3 — Contrato + aditivos + limite de acréscimo (Item 3-B, P2-A)

**Models:** `ContratoLicitacao` (1:1; `valorHomologado`, `numeroContrato/Empenho`, vigência, `reajuste` texto base, garantia, `limiteAcrescimoPct?`) + `AditivoContrato` (1:N; `tipo`, `valorDelta?`, `novaVigencia?`, justificativa, data).
**Migration:** aditiva (2 tabelas).
**Arquivos:** `contrato/{queries,actions}.ts`; `contrato/saldo.ts` (**puro/TDD**: `saldoContratual(homologado, Σaditivos, Σmedicoes)`, `acrescimoAcumuladoPct`, `proximoLimiteAtingido(pct, limite, fator)`); criar contrato no import (`valorHomologado` default = `valorEstimado`); alerta de proximidade do limite (config `aditivo.*`).
**Integração:** `registrarMedicao` passa a avisar/limitar quando estoura saldo; alerta de limite reusa motor; vigência/garantia entram no alerta.
**Test focus:** `saldo.ts` (vários cenários, incl. medição cancelada via soft-delete); % acréscimo acumulado; gatilho de aviso a 80%.
**Deliverable:** gestão de contrato com saldo e teto legal configurável.

## Fase 4 — Matriz de risco + reajuste (P4-B, P8-A+B)

**Models:** `MatrizRiscoItem` (1:N do contrato: evento, probabilidade, impacto, alocacao, mitigacao, ordem); `ReajusteContrato` (1:N: indice, dataBase, aniversario, percentualAplicado?, valorAnterior/Reajustado, aplicadoEm).
**Migration:** aditiva (2 tabelas).
**Arquivos:** `contrato/{matriz,reajuste}.ts` + actions/UI; alerta de aniversário de reajuste; **toggle** `reajuste.modo` (manual = digita %; automatico = calcula/notifica — fase 2 da própria feature, sem fonte externa travada).
**Test focus:** cálculo de valor reajustado dado %; seleção de comportamento por `reajuste.modo`.
**Deliverable:** matriz versionável + reajuste por índice configurável com alerta.

## Fase 5 — Checklist de habilitação ↔ Certidao (Item 4-B)

**Models:** `ChecklistHabilitacaoModelo` + `ChecklistHabilitacaoModeloItem` (global, editável em Config) **+** `LicitacaoHabilitacaoItem` (instância por licitação: `exigencia`, `certidaoId?` → `Certidao`, `atendido`, `obrigatorio`, observacao, ordem).
**Migration:** aditiva (3 tabelas + FK opcional p/ `Certidao`).
**Arquivos:** `habilitacao/{queries,actions}.ts`; semear instância a partir do modelo ao abrir; UI de checklist; "atende?" = `atendido` OU (`certidao.validade >= dataSessao`).
**Integração:** leitura de `Certidao.validade` (Jurídico, sem alterar); alerta "certidão vencendo antes da sessão" (cruza com Fase 1).
**Test focus:** regra de "item atendido"; semear a partir do modelo.
**Deliverable:** checklist padronizado ligado às certidões da empresa.

## Fase 6 — Responsável técnico + subcontratação (P5-A, P6-A)

**Models:** `ResponsavelTecnico` (nome, registro, conselho, `userId?` interno) + `LicitacaoResponsavelTecnico` (junção: documentoTipo ART|RRT|CAT, numero, arquivo); `SubcontratacaoLicitacao` (fornecedorId? | nomeLivre, objeto, percentual) + coluna `subcontratacaoMaxPct?` em `Licitacao`.
**Migration:** aditiva (3 tabelas + 1 coluna opcional).
**Arquivos:** `tecnico/{queries,actions}.ts` + `tecnico/conflito.ts` (**puro/TDD**: detectar RT em obras com vigência sobreposta); `subcontratacao/{queries,actions}.ts` (valida Σ% ≤ teto).
**Integração:** `Fornecedor` (subcontratado); projetos ativos (conflito de RT); alerta de conflito.
**Test focus:** sobreposição de vigência (conflito); validação de soma de %.
**Deliverable:** vínculo de RT com aviso de conflito + controle de subcontratação por edital.

## Fase 7 — Sanções + resultado/concorrência (P3-B, Item 5-C)

**Models:** `SancaoPropria` (compliance) e `SancaoConcorrente` (`fornecedorId?`|nomeLivre, inteligência) — duas tabelas (P3-B); `ResultadoLicitacao` (1:1: vencedor, valorVencedor, nossaClassificacao).
**Migration:** aditiva (3 tabelas).
**Arquivos:** `sancoes/{queries,actions}.ts`; `resultado/{queries,actions}.ts`.
**Integração:** sanção própria ativa → sinal p/ go/no-go (Fase 8); resultado/concorrente alimenta dashboard (Fase 9).
**Test focus:** "sanção própria ativa hoje?" (janela início–fim).
**Deliverable:** compliance de sanções + inteligência de concorrência.

## Fase 8 — Viabilidade go/no-go (P9-A+B)

**Models:** `ViabilidadeLicitacao` (1:1: `modo` = "fixo"|"configuravel" **por licitação**, margemEsperadaPct?, equipeDisponivel?, concorrenciaPrevista?, decisao pendente|go|no_go, decididoPorId?, decididoEm, justificativa) + `ViabilidadeCriterioModelo`/`...Item` (quando `modo=configuravel`).
**Migration:** aditiva (3 tabelas).
**Arquivos:** `viabilidade/{queries,actions}.ts`; gate de aprovação = `User` com relação `Socio` (sem mexer no `enum Role`); bloqueio de avanço p/ proposta até `go` (acopla `status.ts`).
**Integração:** sanção própria (Fase 7) pesa no no-go; timeline.
**Test focus:** gate de aprovação (sócio); bloqueio de transição sem `go`.
**Deliverable:** decisão go/no-go aprovada por sócio, fixa ou por critérios.

## Fase 9 — Dashboard / funil (Item 5-A+B)

**Models:** `LicitacaoMetricaMensal` (snapshot: abertas/ganhas/perdidas, valores, emDisputa; `@@unique([ano,mes])`).
**Migration:** aditiva (1 tabela).
**Arquivos:** `dashboard/queries.ts` (KPIs on-the-fly: taxa vitória, valor em disputa, ganho/perdido, próximos prazos, valor em execução); job mensal de snapshot; página de dashboard (reusa cards de `financeiro/rentabilidade`).
**Integração:** consome composição (valor proposto), contrato (homologado/saldo), resultado, eventos (prazos).
**Test focus:** cálculos de KPI (módulo puro); idempotência do snapshot mensal.
**Deliverable:** funil com indicadores + série histórica.

## Fase 10 — Integração PNCP (P7-A+B, selecionável por Admin)

**Models:** colunas em `Licitacao` (`numeroControlePNCP?`, `pncpUrl?`, `origemPNCP`, `publicadoPNCPEm?`); `IntegracaoPNCPLog` (direcao, referencia, status, mensagem, payload).
**Migration:** aditiva (colunas opcionais + 1 tabela).
**Arquivos:** `pncp/{queries,actions,client.ts}`; toggle `pncp.modo` (manual = só campos + alerta "publicar"; api = import/push via `client.ts`).
**⚠️ Legal/API:** confirmar documentação oficial do PNCP antes de ativar modo `api`. Modo `manual` é o default seguro.
**Test focus:** alerta "não publicado no PNCP" (modo manual); parse de resposta (modo api, com mock).
**Deliverable:** rastreabilidade PNCP manual já; API ativável por Admin quando validada.

## Fase 11 — Exportação de relatórios (P10-B + Modelo do Estúdio)

**Models:** `ModeloRelatorioLicitacao` (cabeçalho/colunas/logo; referência ao Modelo do Estúdio existente — confirmar entidade em `/configuracoes/documentos`).
**Migration:** aditiva (1 tabela).
**Arquivos:** `relatorios/{pdf,xlsx}.ts`; rotas `app/api/licitacoes/.../export` (PDF via `puppeteer-core` espelhando `api/documentos/[id]/pdf`; XLSX via `exceljs` espelhando `api/financeiro/contas/export`).
**Deliverable:** pipeline/funil em Excel e proposta/processo em PDF, com modelo selecionável.

---

## Sequenciamento & dependências

```
Fase 0 (config) ─┬─> Fase 1 (eventos+recursos+alertas)
                 ├─> Fase 2 (composição) ─────────────┐
                 └─> Fase 3 (contrato+aditivos+limite) ┤
Fase 3 ─> Fase 4 (matriz+reajuste)                     │
Certidao ─> Fase 5 (habilitação)                       │
Fornecedor ─> Fase 6 (RT+subcontratação)               │
Fase 7 (sanções+resultado) ─> Fase 8 (go/no-go)        │
Fases 2,3,7,1 ────────────────> Fase 9 (dashboard) <───┘
Fase 10 (PNCP)  ·  Fase 11 (export) — consomem o que existir
```
Ordem recomendada de execução: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Cada fase: branch própria, migration aditiva, TDD, commits locais (sem push), checkpoint de revisão ao fim.

## Self-Review (cobertura do spec)

- 15 decisões → 12 fases: Item1+P1→F1 · Item2→F2 · Item3+P2→F3 · P4+P8→F4 · Item4→F5 · P5+P6→F6 · P3+Item5C→F7 · P9→F8 · Item5A/B→F9 · P7→F10 · P10→F11 · config transversal→F0. ✅ todas cobertas.
- Toggles "selecionável": P7/P8 (Admin via `ConfigSistema`) ✅; P9 (`modo` por licitação) ✅; P10 (Modelo do Estúdio) ✅.
- Legal não hardcoded: F0 + callouts F1/F3/F4/F10 ✅.
- Migrations todas aditivas ✅; `DisciplinaValorLicitacao`/extras preservados ✅.

## Próximo passo / Execução

Plano-mestre salvo. Cada **fase** recebe seu plano detalhado bite-sized (test code + passos TDD + commits) no início da execução daquela fase — não antes, para não envelhecer.

**Aguardando decisão de como executar** (ver pergunta no chat): subagente por task vs inline, e confirmação da ordem 0→11.
