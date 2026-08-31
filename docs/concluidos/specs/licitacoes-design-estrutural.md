# Design estrutural — Módulo de Licitações (proposta, sem implementação)

> Data: 2026-06-18 · Base: [auditoria-modulo-licitacoes.md](auditoria-modulo-licitacoes.md), seção 4 (o que deveria fazer) e 5 (itens estruturais 6–10).
>
> **Status: PROPOSTA.** Nenhum código ou schema foi alterado. Cada item traz schema Prisma sugerido, pontos de integração, ≥2 abordagens com trade-offs e impacto de migration. A escolha final é do time — nada deve ser implementado sem aprovação.

## Contexto da codebase (o que já existe e é reaproveitável)

| Entidade | Local | Fato relevante |
|---|---|---|
| `Licitacao` | `schema.prisma:1510` | Já tem `projetoId String? @unique`, enum `StatusLicitacao` (em_andamento/ganha/perdida/em_execucao/concluida), `valorEstimado Decimal?`. |
| `MedicaoLicitacao` | `schema.prisma:1589` | `lancamentoId String? @unique` → cria `Lancamento` receita prevista (cat. 1.02). |
| `ProjetoComposicaoPreco` + `ItemComposicaoPreco` | `schema.prisma:1135` | **1:1 com `Projeto`** via `projetoId @unique`. Item: `descricao`, `quantidade`, `valorUnitario`, `ordem`. |
| `Certidao` + `CertidaoVersao` + `CertidaoTipo` | `schema.prisma:1458` | Certidão é **global da empresa** (não ligada a projeto/cliente). Tem `validade Date`, `tipoId`. |
| `Proposta` + `PropostaItem` | `schema.prisma:1909` | Módulo comercial. Numeração própria (PR-AANNNN), `projetoId @unique` no aceite. `PropostaItem`: `disciplina`, `valor`. Separado de composição. |
| `FechamentoMensal` | `schema.prisma:2554` | Único lugar com retenções hoje (`retencaoIss/Inss/Ir`). **`Lancamento` NÃO tem campos de retenção.** |
| `DisciplinaValorLicitacao` | `schema.prisma:1550` | "Valor por disciplina solto" que a auditoria quer superar com composição estruturada. |
| Infra de alertas | `src/lib/jobs-handlers.ts:99` | Padrão: handler diário + `diaAlvo(dias)` + `notificarMuitos(ids, {...})` + dedup por `tag`. `alertaLicitacoes` já cobre só `prazoProposta` em `em_andamento`. |

Princípio transversal adotado nas propostas: **aditivo sempre que possível** (novas tabelas/colunas opcionais), espelhando a migration `modalidade` já entregue. Decisões que exigiriam alterar/remover colunas existentes estão sinalizadas como trade-off de risco.

---

## Item 1 — Datas-chave por fase + alertas

Hoje só existe `prazoProposta`. O domínio (Lei 14.133) pede: abertura, sessão/disputa, resultado/homologação, assinatura do contrato, início e fim de vigência — cada uma alertável.

### Abordagem A — Colunas fixas em `Licitacao` (achatado)

```prisma
model Licitacao {
  // ...campos atuais...
  dataAbertura     DateTime? @db.Date
  dataSessao       DateTime? @db.Date
  dataResultado    DateTime? @db.Date
  dataAssinatura   DateTime? @db.Date
  vigenciaInicio   DateTime? @db.Date
  vigenciaFim      DateTime? @db.Date
}
```

- **Prós:** trivial de consultar/exibir/ordenar; zero joins; alertas viram `where` simples por coluna (igual ao `alertaLicitacoes` atual). Migration 100% aditiva (colunas opcionais).
- **Contras:** rígido — toda nova data-chave é nova coluna + migration; sem histórico de remarcação ("sessão remarcada de X para Y"); não dá pra anexar observação por data; semântica de "qual data alerta em quantos dias" fica hardcoded no job.

### Abordagem B — Tabela `LicitacaoEvento` (linha por data-chave)

```prisma
enum TipoEventoLicitacao {
  abertura
  sessao
  resultado
  assinatura
  vigencia_inicio
  vigencia_fim
}

model LicitacaoEvento {
  id           String              @id @default(cuid())
  licitacaoId  String
  licitacao    Licitacao           @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  tipo         TipoEventoLicitacao
  data         DateTime            @db.Date
  /// dias de antecedência p/ alerta (override do padrão); null = usa o padrão do tipo
  alertaDias   Int[]               @default([])
  observacao   String?
  /// marcado quando o evento já ocorreu/foi cumprido (some dos alertas)
  concluidoEm  DateTime?
  createdAt    DateTime            @default(now())

  @@index([licitacaoId])
  @@index([data])
  @@map("licitacao_evento")
}
```

- **Prós:** extensível sem migration (novo tipo = valor de enum, ou usar `String` livre e nem isso); alerta configurável por evento (`alertaDias`); permite múltiplas datas do mesmo tipo (remarcação) com observação; o job de alerta vira uma query única sobre `licitacao_evento` em vez de N colunas; `concluidoEm` resolve "parar de alertar".
- **Contras:** exibir "a data de sessão" exige agregação/lookup (não é coluna direta); ordenar a lista por "próxima data" é um join + `min(data)`; mais peças (enum + tabela + UI de CRUD de eventos).

### Pontos de integração
- **Job de alertas** (`jobs-handlers.ts`): generaliza `alertaLicitacoes` para varrer datas futuras (A: cada coluna; B: `licitacao_evento` com `data = diaAlvo(d)` e `concluidoEm: null`). Reaproveita `diaAlvo` + `notificarMuitos` + `tag`.
- **Máquina de estados** (`status.ts`): datas podem ser pré-condição de transição (ex.: `→ ganha` sugere preencher `dataResultado`). Acoplamento opcional.
- **Timeline** (`LicitacaoHistorico`): registrar automaticamente quando uma data-chave é definida/alterada (reusa `registrarHistorico` já criado).

### Impacto em migration
- A: aditiva pura (6 colunas opcionais). Sem backfill.
- B: aditiva (novo enum + nova tabela). `prazoProposta` atual pode coexistir ou ser migrado para um `LicitacaoEvento` tipo `abertura`/`sessao` (backfill opcional, decisão à parte — **não** remover a coluna sem aprovação).

✅ **Item 1 concluído.**

---

## Item 2 — Vínculo proposta ↔ `ProjetoComposicaoPreco`

Objetivo: substituir `DisciplinaValorLicitacao` (valor solto) por uma proposta estruturada como composição de preço, reaproveitando `ProjetoComposicaoPreco`/`ItemComposicaoPreco`.

**Problema central:** `ProjetoComposicaoPreco` é **1:1 com `Projeto`** (`projetoId @unique`). A licitação só vira projeto **no import (pós-ganha)**. Antes disso não há `Projeto` onde pendurar a composição. As três abordagens divergem em como resolver isso.

### Abordagem A — Composição própria da licitação (espelhar o modelo)

Nova tabela 1:1 com `Licitacao`, idêntica em forma à de projeto:

```prisma
model LicitacaoComposicaoPreco {
  id          String                       @id @default(cuid())
  licitacaoId String                       @unique
  licitacao   Licitacao                    @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  observacao  String?
  updatedAt   DateTime                     @updatedAt
  itens       ItemComposicaoLicitacao[]

  @@map("licitacao_composicao_preco")
}

model ItemComposicaoLicitacao {
  id           String                   @id @default(cuid())
  composicaoId String
  composicao   LicitacaoComposicaoPreco @relation(fields: [composicaoId], references: [id], onDelete: Cascade)
  descricao    String
  quantidade   Decimal                  @default(1) @db.Decimal(12, 2)
  valorUnitario Decimal                 @default(0) @db.Decimal(14, 2)
  ordem        Int                      @default(0)

  @@index([composicaoId])
  @@map("item_composicao_licitacao")
}
```

- **Prós:** sem conflito com a regra 1:1 de projeto; ciclo de vida limpo (composição da licitação ≠ composição do projeto); cascade natural. No import, copia itens → `ProjetoComposicaoPreco` (como já se copiam docs ao Jurídico).
- **Contras:** duplica o modelo (duas tabelas quase iguais); lógica de cópia no import; dois lugares para manter se o formato de item evoluir.

### Abordagem B — Generalizar `ProjetoComposicaoPreco` para dono polimórfico

Trocar `projetoId @unique` por par opcional `projetoId?` / `licitacaoId?` (XOR por constraint de app):

```prisma
model ProjetoComposicaoPreco {
  id          String   @id @default(cuid())
  projetoId   String?  @unique
  projeto     Projeto? @relation(...)
  licitacaoId String?  @unique
  licitacao   Licitacao? @relation(...)
  // ...itens iguais...
}
```

- **Prós:** uma só tabela e um só conjunto de telas/queries; no import basta setar `projetoId` (sem copiar linhas).
- **Contras:** **mexe em coluna existente** (`projetoId` de obrigatório → opcional) → migration com risco e revisão obrigatória; XOR "exatamente um dono" não é expressável em Prisma puro (validação só em app); o nome `Projeto...` fica enganoso; toca um módulo estável (projetos) por causa de licitações.

### Abordagem C — Reusar `Proposta` do comercial como camada de proposta

Ligar `Licitacao` a uma `Proposta` (que já tem itens, versões, link público) em vez de criar composição própria.

```prisma
model Licitacao {
  // ...
  propostaId String?  @unique
  proposta   Proposta? @relation(...)
}
```

- **Prós:** reaproveita todo o maquinário de proposta (versões, anexos, visualização); unifica "proposta comercial" e "proposta de licitação".
- **Contras:** `Proposta` carrega numeração PR-, cliente obrigatório, token público, fluxo de aceite → semântica comercial que não cabe em licitação pública; forçar isso polui o módulo comercial; `PropostaItem` é `disciplina+valor`, não composição `qtd×unitário` — não atende o pedido de "composição de preço".

### Pontos de integração
- **Import** (`importarLicitacao`): A copia itens p/ `ProjetoComposicaoPreco`; B só seta FK; C já teria projeto via proposta.
- **`valorEstimado` × composição × medições** (gap da auditoria): a soma da composição vira o "valor proposto", base para % de avanço e saldo a medir (ver Item 3).
- **Migração de `DisciplinaValorLicitacao`:** dados atuais podem ser convertidos em itens de composição (1 disciplina = 1 item, `quantidade=1`). Backfill opcional; **não** remover `DisciplinaValorLicitacao` sem aprovação.

### Impacto em migration
- A: aditiva pura (2 tabelas novas).
- B: **altera coluna existente** (risco) + nova FK; precisa garantir que nenhuma composição órfã viole o XOR.
- C: aditiva (1 FK opcional), mas o custo real é semântico, não de schema.

✅ **Item 2 concluído.**

---

## Item 3 — Contrato/empenho pós-ganha (valor homologado ≠ estimado, reajuste, garantia)

Hoje, ao ganhar+importar, só se cria o `Projeto`. Falta registrar o instrumento contratual: nº do contrato/empenho, valor homologado (que difere do estimado), vigência, reajuste, garantia. E a medição precisa abater de um **saldo contratual**.

### Abordagem A — Tabela `ContratoLicitacao` (1:1 com licitação)

```prisma
model ContratoLicitacao {
  id              String    @id @default(cuid())
  licitacaoId     String    @unique
  licitacao       Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  numeroContrato  String?
  numeroEmpenho   String?
  valorHomologado Decimal   @db.Decimal(14, 2)
  vigenciaInicio  DateTime? @db.Date
  vigenciaFim     DateTime? @db.Date
  /// índice/regra textual de reajuste (ex.: "IPCA anual")
  reajuste        String?
  /// garantia contratual (caução, seguro-garantia, fiança)
  garantiaTipo    String?
  garantiaValor   Decimal?  @db.Decimal(14, 2)
  garantiaValidade DateTime? @db.Date
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("contrato_licitacao")
}
```

- **Prós:** separa claramente "oportunidade" (Licitacao) de "contrato firmado"; `valorHomologado` vira base do saldo a medir; permite alertar vigência/garantia (reusa Item 1); aditivo puro. Suporta 1 contrato por licitação (caso comum).
- **Contras:** não modela aditivos/termos contratuais (1 contrato só); saldo contratual = `valorHomologado − Σ medições` é derivado (calculado, não armazenado) — ok, mas exige cuidado com medições canceladas (já temos soft-delete no lançamento).

### Abordagem B — Contrato + aditivos (duas tabelas)

`ContratoLicitacao` (como acima) **+** `AditivoContrato` (linha por termo aditivo de valor/prazo):

```prisma
model AditivoContrato {
  id          String   @id @default(cuid())
  contratoId  String
  contrato    ContratoLicitacao @relation(fields: [contratoId], references: [id], onDelete: Cascade)
  tipo        String   // "valor" | "prazo" | "valor_prazo"
  valorDelta  Decimal? @db.Decimal(14, 2)   // +/- no valor homologado
  novaVigencia DateTime? @db.Date
  justificativa String?
  data        DateTime @db.Date
  @@index([contratoId])
  @@map("aditivo_contrato")
}
```

- **Prós:** fiel à realidade de contrato público (aditivos são a regra, não exceção); valor vigente = homologado + Σ aditivos; histórico auditável.
- **Contras:** mais complexidade agora; saldo contratual fica `homologado + Σaditivos − Σmedições` (cálculo em 3 fontes); só compensa se aditivos forem mesmo usados.

### Abordagem C — Campos achatados em `Licitacao` (mínimo)

Só adicionar `valorHomologado`, `numeroContrato`, `vigenciaFim` em `Licitacao`.

- **Prós:** menor esforço; resolve o "homologado ≠ estimado" imediato.
- **Contras:** mistura contrato com oportunidade; sem garantia/reajuste/aditivo; teto baixo de evolução. Bom só como passo intermediário.

### Pontos de integração
- **Financeiro/medição** (`registrarMedicao`): saldo a medir = `valorHomologado − Σ medições`. Bloquear/avisar medição que estoure o saldo. Liga ao Item 5 (valor em execução).
- **Retenções** (gap da auditoria): hoje retenção só em `FechamentoMensal`; `Lancamento` não tem campos de retenção. Para ISS/INSS/IR por medição seria preciso **ou** adicionar colunas de retenção em `Lancamento` (mexe em tabela do financeiro — decisão à parte), **ou** registrar a retenção como lançamento de despesa irmão. Sinalizado como sub-decisão.
- **Alertas:** vigência e garantia entram no mesmo motor do Item 1.
- **Import:** `importarLicitacao` poderia já criar o `ContratoLicitacao` com `valorHomologado` (default = `valorEstimado`, editável depois).

### Impacto em migration
- A: aditiva pura (1 tabela). C: aditiva (3 colunas). B: aditiva (2 tabelas).
- Integrar retenção em `Lancamento` **não** é aditivo-trivial (altera tabela central do financeiro) → revisar separadamente.

✅ **Item 3 concluído.**

---

## Item 4 — Checklist de habilitação ligado a `Certidao`

O edital exige um conjunto de documentos/certidões. Precisa de um checklist por licitação que aponte para as `Certidao` da empresa (que já têm `validade`) e sinalize itens vencidos/faltantes.

**Fato-chave:** `Certidao` é **global da empresa** (não ligada a cliente/projeto). Então o checklist liga *exigências do edital* ↔ *certidões existentes*.

### Abordagem A — `LicitacaoHabilitacaoItem` referenciando `Certidao` (opcional)

```prisma
model LicitacaoHabilitacaoItem {
  id          String    @id @default(cuid())
  licitacaoId String
  licitacao   Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  /// exigência do edital (texto livre: "CND Federal", "Atestado de capacidade técnica")
  exigencia   String
  /// certidão da empresa que atende (se aplicável)
  certidaoId  String?
  certidao    Certidao? @relation(fields: [certidaoId], references: [id])
  /// estado do item no checklist
  atendido    Boolean   @default(false)
  obrigatorio Boolean   @default(true)
  observacao  String?
  ordem       Int       @default(0)

  @@index([licitacaoId])
  @@map("licitacao_habilitacao_item")
}
```

- **Prós:** flexível — cada item pode ou não apontar p/ uma `Certidao`; itens que não são certidão (atestados, balanço) cabem como texto livre; o "vencido" sai de graça via `certidao.validade` quando há link; aditivo puro. `atendido` permite check manual para itens sem certidão.
- **Contras:** checklist montado item a item por licitação (trabalho manual repetido entre editais) — mitigável com "modelos de checklist" (ver B); status "atende?" combina dois sinais (`atendido` manual + `validade` da certidão) → regra de exibição precisa ser clara.

### Abordagem B — Modelo de checklist reutilizável + instância por licitação

`ChecklistHabilitacaoModelo` (+itens) global, instanciado em `LicitacaoHabilitacaoItem` ao abrir a licitação.

- **Prós:** evita remontar o checklist a cada edital; padroniza exigências comuns (CNDs, FGTS, trabalhista); editável em Configurações (mesmo padrão de `Modalidade`).
- **Contras:** duas camadas (modelo + instância) e lógica de "semear a partir do modelo"; over-engineering se cada edital for muito diferente.

### Abordagem C — Vínculo direto Licitação↔Certidao (M:N puro, sem checklist)

Tabela de junção `LicitacaoCertidao` só listando quais certidões se aplicam.

- **Prós:** mínimo; responde "quais certidões essa licitação usa".
- **Contras:** não modela exigências que **não** são certidão; sem estado de checklist (atendido/faltante/obrigatório); não cobre o pedido real ("checklist de habilitação").

### Pontos de integração
- **Jurídico/`Certidao`:** leitura da `validade` para marcar item vencido; link para a tela da certidão. Sem alteração no Jurídico (só FK de leitura).
- **Alertas:** "licitação X tem certidão vencida/vencendo antes da sessão" — cruza `LicitacaoHabilitacaoItem.certidao.validade` com a data de sessão do Item 1. Reusa motor de alerta.
- **Bloqueio de transição (opcional):** `→ ganha`/envio de proposta poderia exigir checklist obrigatório 100% atendido (acoplar à `status.ts`). Decisão à parte.

### Impacto em migration
- A: aditiva pura (1 tabela + FK opcional p/ `Certidao`). C: aditiva (1 junção). B: aditiva (modelo+itens+instância), maior superfície.

✅ **Item 4 concluído.**

---

## Item 5 — Dashboard / funil (taxa de vitória, valor em disputa)

Indicadores: taxa de vitória, valor em disputa (em andamento), ganho/perdido por período, próximos prazos, valor em execução. Hoje: zero indicadores.

### Abordagem A — Agregação on-the-fly (sem persistência)

Query server-side (`groupBy`/`aggregate` Prisma) calculada a cada visita ao dashboard.

```
- valorEmDisputa  = Σ valorEstimado where status=em_andamento
- taxaVitoria     = count(ganha) / count(ganha+perdida)  [período]
- ganhoPerdido    = groupBy status, _count, _sum(valorEstimado)  [por mês]
- emExecucao      = Σ valorHomologado where status=em_execucao  (depende do Item 3)
- proximosPrazos  = LicitacaoEvento futuros (depende do Item 1)
```

- **Prós:** sempre exato (lê o estado atual); zero novas tabelas; padrão já usado nos dashboards financeiros do remake. Aditivo zero (só código).
- **Contras:** custo de query cresce com volume (mitigável com índices em `status`/datas, já há `@@index([status])`); "taxa de vitória histórica" depende de o status atual refletir o passado — se um registro muda de status, o histórico "se reescreve" (não há foto do passado).

### Abordagem B — Snapshot periódico (tabela de métricas)

Job mensal grava `LicitacaoMetricaMensal` (igual ao espírito de `FechamentoMensal`/snapshot de qualidade).

```prisma
model LicitacaoMetricaMensal {
  id            String   @id @default(cuid())
  ano           Int
  mes           Int
  totalAbertas  Int
  totalGanhas   Int
  totalPerdidas Int
  valorGanho    Decimal  @db.Decimal(14, 2)
  valorPerdido  Decimal  @db.Decimal(14, 2)
  valorEmDisputa Decimal @db.Decimal(14, 2)
  createdAt     DateTime @default(now())
  @@unique([ano, mes])
  @@map("licitacao_metrica_mensal")
}
```

- **Prós:** série histórica estável (não se reescreve); dashboard de tendência barato (lê linhas prontas); reusa infra de job noturno.
- **Contras:** nova tabela + job; "tempo real" do mês corrente ainda precisa de agregação on-the-fly (modelo híbrido); redundância a manter consistente.

### Abordagem C — Inteligência de concorrência (escopo estendido)

Tabela `ResultadoLicitacao` (quem ganhou, valor vencedor, nossa classificação) para enriquecer o funil com mercado.

```prisma
model ResultadoLicitacao {
  id            String    @id @default(cuid())
  licitacaoId   String    @unique
  licitacao     Licitacao @relation(...)
  vencedor      String?
  valorVencedor Decimal?  @db.Decimal(14, 2)
  nossaClassificacao Int?
  @@map("resultado_licitacao")
}
```

- **Prós:** habilita "perdemos por quanto", benchmarking de preço, taxa de vitória por órgão/faixa; alto valor comercial.
- **Contras:** mais coleta de dados manual; só compensa com disciplina de preenchimento; ortogonal aos KPIs básicos (pode vir depois).

### Pontos de integração
- **Depende de Itens 1 e 3:** "próximos prazos" usa datas do Item 1; "valor em execução" usa `valorHomologado` do Item 3 (senão cai em `valorEstimado`).
- **Permissões:** dashboard sob `licitacoes:ver`; KPIs de valor talvez sob `gerir`.
- **Reuso de UI:** componentes de card/indicador dos dashboards financeiros (`financeiro/rentabilidade`, `dfc`) servem de molde.

### Impacto em migration
- A: nenhuma (só código/queries). B: aditiva (1 tabela) + job. C: aditiva (1 tabela) + entrada de dados.
- Recomendação de sequência (não decisão): A primeiro (KPIs imediatos sem schema), B/C quando houver necessidade de série histórica/mercado.

✅ **Item 5 concluído.**

---

## Quadro-resumo (abordagens × risco de migration)

| Item | Abordagens | Menor risco | Maior valor | Mexe em tabela existente? |
|---|---|---|---|---|
| 1 Datas-chave | A colunas / B tabela+enum | A | B | Não (ambas aditivas) |
| 2 Composição | A própria / B polimórfica / C reusa Proposta | A | A ou B | **B sim** (projetoId→opcional) |
| 3 Contrato | A contrato / B +aditivos / C achatado | C | B | Não (retenção em Lancamento sim, se escolhida) |
| 4 Checklist | A item+certidão / B modelo / C M:N | C | B | Não |
| 5 Dashboard | A on-the-fly / B snapshot / C concorrência | A | C | Não |

## Dependências entre itens
- **2 → 3 → 5:** composição dá "valor proposto"; contrato dá "valor homologado/saldo"; dashboard consome ambos.
- **1 → 4 → 5:** datas-chave alimentam alertas de certidão (4) e "próximos prazos" (5).
- **Sub-decisão isolada (fora dos 5):** retenções por medição exigem tocar `Lancamento` — avaliar junto do Item 3, não decidir aqui.

---

# Parte 2 — 10 pontos adicionais

> ⚠️ **AVISO LEGAL (vale para P1, P2, P3, P7).** Vários pontos abaixo dependem de prazos, percentuais e obrigações da **Lei 14.133/2021** e da regulamentação do **PNCP**, que sofreram decretos e atualizações. **Nenhum valor legal (prazo de recurso, % limite de acréscimo, obrigatoriedade PNCP) deve ser hardcoded como regra de negócio.** Princípio adotado nestas propostas: todo parâmetro legal entra como **configuração editável** (mesmo padrão de `Modalidade`), com a redação vigente a ser confirmada antes de travar qualquer regra. Onde houver constante legal, o schema deixa o valor em config/coluna, nunca embutido no código.

Infra já existente reaproveitável nesta parte:

| Recurso | Local | Uso |
|---|---|---|
| `Fornecedor` | `schema.prisma:534` | Concorrentes/subcontratados/sancionados podem referenciá-lo (ou ficar texto livre). |
| `Socio` (1:1 `User`) | `schema.prisma:59,580` | Aprovação go/no-go por sócio. **`enum Role` NÃO tem "socio"** — gate é via relação `Socio` ou role admin/supervisor (trade-off em P9). |
| PDF | `puppeteer-core` · `src/app/api/documentos/[id]/pdf/route.ts` | Geração de PDF server-side já estabelecida. |
| Excel | `exceljs` · `src/app/api/financeiro/contas/export/route.ts`, `.../relatorios/dre/xlsx/route.ts` | Export XLSX já estabelecido. |
| Motor de alerta | `jobs-handlers.ts` + `diaAlvo` + `notificarMuitos` + `tag` | Todos os alertas abaixo reusam isto. |

---

## P1 — Recursos administrativos e impugnações

⚠️ **Legal:** prazos de impugnação/recurso/contrarrazão são curtos e definidos em lei — **configuráveis, não fixos no código**.

### Abordagem A — Tabela dedicada `RecursoLicitacao`

```prisma
enum TipoPeca {
  pedido_esclarecimento
  impugnacao
  recurso
  contrarrazao
}
enum StatusPeca {
  protocolada
  em_analise
  deferida
  indeferida
}

model RecursoLicitacao {
  id           String     @id @default(cuid())
  licitacaoId  String
  licitacao    Licitacao  @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  tipo         TipoPeca
  /// quem apresentou: nós ou um concorrente (inteligência)
  autoria      String     // "propria" | "concorrente"
  protocolo    String?
  dataProtocolo DateTime? @db.Date
  /// prazo-limite calculado a partir de parâmetro CONFIGURÁVEL (não hardcoded)
  prazoLimite  DateTime?  @db.Date
  status       StatusPeca @default(protocolada)
  decisao      String?
  observacao   String?
  createdAt    DateTime   @default(now())

  @@index([licitacaoId])
  @@index([prazoLimite])
  @@map("recurso_licitacao")
}
```

- **Prós:** modela a fase de julgamento com prazo alertável (`prazoLimite` → motor de alerta); separa peças próprias × de concorrentes; aditivo puro.
- **Contras:** `prazoLimite` precisa ser preenchido (manual ou cálculo a partir de config) — risco de erro legal se automatizado sem revisão; mais um enum a manter.

### Abordagem B — Reusar `LicitacaoEvento` (Item 1 B) com tipos de recurso
Tratar recurso/impugnação como eventos datados, sem tabela própria.
- **Prós:** zero schema novo se o Item 1 B for adotado; alerta unificado.
- **Contras:** não comporta protocolo/status/decisão estruturados; mistura datas-de-fase com peças jurídicas; perde a inteligência "concorrente impugnou".

### Integração / migration
- Timeline (`registrarHistorico`), alerta (`prazoLimite`), máquina de estados (fase julgamento entre `em_andamento` e `ganha/perdida`). Migration aditiva (A: enum+tabela; B: nenhuma além do Item 1).

✅ **P1 concluído.**

---

## P2 — Aditivos contratuais + alerta de limite legal

⚠️ **Legal:** o **percentual-limite de acréscimo** é definido em lei e mudou ao longo do tempo — **deve ser um parâmetro configurável**, não constante no código.

Sobrepõe-se ao **Item 3, Abordagem B** (`AditivoContrato`). Aqui o foco é o **alerta de proximidade do limite**.

### Abordagem A — `AditivoContrato` (do Item 3 B) + limite configurável + total derivado
- Limite (%) vive em **config** (ex.: tabela `ParametroLicitacao` ou coluna `limiteAcrescimoPct` em `ContratoLicitacao`, default editável).
- Acumulado = `Σ AditivoContrato.valorDelta / valorHomologado`. Calculado on-the-fly.
- Job alerta quando `acumulado ≥ limite × fatorAviso` (ex.: 80% do limite).

```prisma
model ContratoLicitacao {
  // ...campos do Item 3...
  /// % limite de acréscimo (CONFIGURÁVEL; default vindo de parâmetro global)
  limiteAcrescimoPct Decimal? @db.Decimal(5, 2)
}
```

- **Prós:** sem duplicar dado; limite por contrato (permite exceções); alerta reusa motor existente; aditivo puro.
- **Contras:** acumulado recalculado a cada checagem; depende de `valorDelta` bem preenchido; "tipo de objeto" (obra × serviço) pode ter limites diferentes — exige config por tipo.

### Abordagem B — Persistir acumulado em coluna (`acrescimoAcumuladoPct`)
Gravar o acumulado a cada aditivo.
- **Prós:** leitura/alerta triviais.
- **Contras:** dado redundante a manter sincronizado (risco de divergência ao editar/excluir aditivo).

### Integração / migration
- Liga a Item 3 (contrato) e ao motor de alerta. Migration aditiva (coluna(s) opcional(is); parâmetro global = linha em tabela de config).

✅ **P2 concluído.**

---

## P3 — Penalidades e sanções administrativas

Dois públicos: **compliance** (sanções contra a própria empresa, que podem impedir participação) e **inteligência** (sanções contra concorrentes).

### Abordagem A — Tabela única `SancaoAdministrativa` com alvo polimórfico

```prisma
enum TipoSancao {
  advertencia
  multa
  suspensao
  impedimento
  inidoneidade
}

model SancaoAdministrativa {
  id          String     @id @default(cuid())
  /// "propria" (compliance) | "concorrente" (inteligência)
  alvo        String
  /// concorrente: referência opcional a Fornecedor, ou nome livre
  fornecedorId String?
  fornecedor   Fornecedor? @relation(fields: [fornecedorId], references: [id])
  nomeLivre   String?
  tipo        TipoSancao
  valor       Decimal?   @db.Decimal(14, 2)
  inicio      DateTime?  @db.Date
  fim         DateTime?  @db.Date
  orgao       String?
  processo    String?
  /// vínculo opcional à licitação de origem
  licitacaoId String?
  licitacao   Licitacao? @relation(fields: [licitacaoId], references: [id])
  observacao  String?
  createdAt   DateTime   @default(now())

  @@index([alvo])
  @@index([fim])
  @@map("sancao_administrativa")
}
```

- **Prós:** um só lugar para as duas finalidades; `fim` alertável (sanção própria vencendo/ativa); concorrente via `Fornecedor` **ou** texto livre (concorrente raramente é fornecedor cadastrado); aditivo puro.
- **Contras:** `alvo` como string exige disciplina; sanção própria ativa bloqueando participação é regra de negócio à parte (acoplar a go/no-go P9).

### Abordagem B — Duas tabelas (própria × concorrente)
- **Prós:** semântica explícita por público; campos sob medida.
- **Contras:** duplica modelo e telas; relatórios cruzados ficam mais chatos.

### Integração / migration
- Go/no-go (P9): sanção própria ativa → alerta/bloqueio. Inteligência comercial (Item 5 C — concorrência). Alerta de vigência. Migration aditiva.

✅ **P3 concluído.**

---

## P4 — Matriz de risco do contrato

Lei pede o documento em obras/serviços de engenharia. Decisão central: **documento anexado** vs **dados estruturados**.

### Abordagem A — Anexo versionado (documento)
Reusar o padrão de documento/versão já existente (como `DocLicitacaoVersao`), vinculado ao contrato.
- **Prós:** atende a exigência legal (é um documento); mínimo; reusa upload/versão/storage e a limpeza física já implementada.
- **Contras:** conteúdo opaco (não consultável); sem alerta por risco individual.

### Abordagem B — Matriz estruturada (1:N de riscos)

```prisma
model MatrizRiscoItem {
  id          String    @id @default(cuid())
  /// vincula ao contrato (Item 3) ou direto à licitação
  contratoId  String
  contrato    ContratoLicitacao @relation(fields: [contratoId], references: [id], onDelete: Cascade)
  evento      String
  probabilidade String   // baixa | media | alta
  impacto       String   // baixo | medio | alto
  /// alocação do risco: contratante | contratado
  alocacao      String
  mitigacao     String?
  ordem         Int      @default(0)

  @@index([contratoId])
  @@map("matriz_risco_item")
}
```

- **Prós:** consultável, exportável (P10), permite análise; base para relatório formatado.
- **Contras:** mais esforço de captura; a lei pede o *documento* — pode-se ter de gerar o PDF a partir da matriz (P10) de qualquer forma.

### Integração / migration
- Item 3 (contrato), padrão de versão (A), P10 (gerar PDF da matriz em B). Migration aditiva.

✅ **P4 concluído.**

---

## P5 — Responsável técnico vinculado (ART/RRT/CAT) + conflito

Amarrar a licitação ao profissional que comprova capacidade técnica, detectando conflito com outras obras ativas do mesmo RT.

### Abordagem A — Entidade `ResponsavelTecnico` global + junção

```prisma
model ResponsavelTecnico {
  id        String   @id @default(cuid())
  nome      String
  registro  String   // nº CREA/CAU
  conselho  String?  // "CREA" | "CAU"
  /// se for colaborador interno, link opcional ao User
  userId    String?  @unique
  user      User?    @relation(fields: [userId], references: [id])
  ativo     Boolean  @default(true)

  @@map("responsavel_tecnico")
}

model LicitacaoResponsavelTecnico {
  id            String   @id @default(cuid())
  licitacaoId   String
  licitacao     Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  responsavelId String
  responsavel   ResponsavelTecnico @relation(fields: [responsavelId], references: [id])
  /// documento de comprovação
  documentoTipo String   // ART | RRT | CAT
  numeroDocumento String?
  arquivoPath   String?
  arquivoNome   String?

  @@unique([licitacaoId, responsavelId, documentoTipo])
  @@index([responsavelId])
  @@map("licitacao_responsavel_tecnico")
}
```

- **Prós:** RT pode ser externo ou interno (`userId` opcional); junção M:N comporta vários RTs por licitação e vários certames por RT → **detecção de conflito** = query de licitações/projetos ativos por `responsavelId`; aditivo puro.
- **Contras:** nova entidade a cadastrar/manter; "conflito" precisa de definição (sobreposição de vigência? limite de obras simultâneas?) — regra configurável à parte.

### Abordagem B — Reusar `User`/`Funcionario` quando o RT é interno
- **Prós:** sem entidade nova para o caso interno; aproveita cadastro de pessoal.
- **Contras:** não cobre RT externo (sócio/terceiro); registro CREA/CAU não existe em `User` → colunas novas mesmo assim.

### Integração / migration
- Alerta de conflito (motor de alerta cruzando obras ativas); módulo de projetos (obras em andamento). Migration aditiva.

✅ **P5 concluído.**

---

## P6 — Subcontratação

Registrar subcontratados e respeitar o **% permitido pelo edital** (parâmetro do edital, não da lei — varia por certame).

### Abordagem A — Tabela `SubcontratacaoLicitacao` + teto por licitação

```prisma
model Licitacao {
  // ...
  /// % máximo de subcontratação permitido pelo edital (por certame)
  subcontratacaoMaxPct Decimal? @db.Decimal(5, 2)
}

model SubcontratacaoLicitacao {
  id           String   @id @default(cuid())
  licitacaoId  String
  licitacao    Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  fornecedorId String?
  fornecedor   Fornecedor? @relation(fields: [fornecedorId], references: [id])
  nomeLivre    String?
  objeto       String
  percentual   Decimal  @db.Decimal(5, 2)

  @@index([licitacaoId])
  @@map("subcontratacao_licitacao")
}
```

- **Prós:** valida `Σ percentual ≤ subcontratacaoMaxPct`; subcontratado via `Fornecedor` ou texto livre; teto por edital (correto, pois não é constante legal); aditivo puro.
- **Contras:** validação de soma é regra de app; coluna nova em `Licitacao`.

### Abordagem B — Só lista, sem teto
- **Prós:** mais simples.
- **Contras:** perde a verificação contra o limite do edital (o ponto principal).

### Integração / migration
- `Fornecedor` (financeiro); validação de %; relatório (P10). Migration aditiva (1 tabela + 1 coluna opcional).

✅ **P6 concluído.**

---

## P7 — Integração com o PNCP

⚠️ **Legal/API:** obrigatoriedade de publicação e a **API do PNCP** podem ter mudado — **confirmar a documentação oficial vigente antes de desenhar a integração ativa.** Proposta deliberadamente faseada para não acoplar regra de negócio a uma API incerta.

Duas direções: **importar editais** publicados e **publicar dados do contrato** (obrigação).

### Abordagem A — Campos de vínculo manual (fase 1, baixo risco)

```prisma
model Licitacao {
  // ...
  /// nº de controle PNCP do edital/contrato (string)
  numeroControlePNCP String?
  pncpUrl            String?
  origemPNCP         Boolean  @default(false)
  publicadoPNCPEm    DateTime?
}
```

- **Prós:** rastreabilidade imediata sem dependência externa; lembrete de "publicar no PNCP" vira alerta sobre `publicadoPNCPEm == null`; zero risco de API; aditivo puro.
- **Contras:** entrada/publicação manual (não automatiza import nem push).

### Abordagem B — Integração ativa via API (fase 2)
Job de importação de editais + push de dados de contrato, com tabela de log.

```prisma
model IntegracaoPNCPLog {
  id          String   @id @default(cuid())
  direcao     String   // "import" | "publicacao"
  referencia  String?  // nº controle PNCP
  licitacaoId String?
  payload     Json?
  status      String   // ok | erro
  mensagem    String?
  createdAt   DateTime @default(now())
  @@map("integracao_pncp_log")
}
```

- **Prós:** automatiza descoberta de editais e cumprimento da obrigação de publicar; auditável via log.
- **Contras:** **dependência externa** (auth, rate limit, drift de schema da API, indisponibilidade); risco legal se a obrigatoriedade/contrato da API mudar; manutenção contínua. Não começar por aqui.

### Integração / migration
- Recomendação de sequência (não decisão): **A primeiro** (campos manuais + alerta de publicação), **B depois** com a documentação do PNCP confirmada. Migration aditiva em ambos.

✅ **P7 concluído.**

---

## P8 — Reajuste/repactuação automática por índice

Estrutura o `reajuste` (que no Item 3 era texto livre): índice, data-base, aniversário, e alerta/cálculo no aniversário.

### Abordagem A — Eventos de reajuste + índice configurável + entrada manual do %

```prisma
model ReajusteContrato {
  id            String   @id @default(cuid())
  contratoId    String
  contrato      ContratoLicitacao @relation(fields: [contratoId], references: [id], onDelete: Cascade)
  /// índice CONFIGURÁVEL (lista editável: IPCA, INCC, IGP-M…)
  indice        String
  dataBase      DateTime @db.Date
  aniversario   DateTime @db.Date
  percentualAplicado Decimal? @db.Decimal(6, 3)
  valorAnterior   Decimal? @db.Decimal(14, 2)
  valorReajustado Decimal? @db.Decimal(14, 2)
  aplicadoEm    DateTime?
  @@index([contratoId])
  @@index([aniversario])
  @@map("reajuste_contrato")
}
```

- **Prós:** alerta no aniversário (motor existente); histórico de reajustes; índice em **lista configurável** (padrão `Modalidade`); valor reajustado propaga para saldo/medições futuras (Item 3). Aditivo puro. **Não** depende de fonte externa de índice (% entrado/manualmente conferido).
- **Contras:** % do índice precisa ser informado (não busca automática) — mas isso é o seguro: evita aplicar índice errado de fonte não confiável.

### Abordagem B — Cálculo automático puxando o índice de fonte externa
- **Prós:** zero digitação do %.
- **Contras:** dependência de API de índice (IBGE/FGV), risco de valor incorreto aplicado automaticamente a um contrato → exposição financeira/legal. Alto risco; não recomendado sem revisão humana no loop.

### Integração / migration
- Item 3 (contrato/valor), motor de alerta, financeiro (valor das próximas medições). Migration aditiva.

✅ **P8 concluído.**

---

## P9 — Checklist de viabilidade (go/no-go) com aprovação de sócio

Antes de investir na proposta: margem mínima, equipe, concorrência → decisão **go/no-go aprovada por sócio**.

**Fato:** `enum Role` **não tem "socio"**; existe model `Socio` (1:1 com `User`). Gate de aprovação tem duas leituras (ver abordagens).

### Abordagem A — `ViabilidadeLicitacao` 1:1 com campos fixos

```prisma
model ViabilidadeLicitacao {
  id              String    @id @default(cuid())
  licitacaoId     String    @unique
  licitacao       Licitacao @relation(fields: [licitacaoId], references: [id], onDelete: Cascade)
  margemEsperadaPct Decimal? @db.Decimal(5, 2)
  equipeDisponivel  Boolean?
  concorrenciaPrevista String?
  decisao         String    @default("pendente") // pendente | go | no_go
  /// aprovador: User que possui relação Socio (ou admin) — gate em app
  decididoPorId   String?
  decididoPor     User?     @relation(fields: [decididoPorId], references: [id])
  decididoEm      DateTime?
  justificativa   String?

  @@map("viabilidade_licitacao")
}
```

- **Prós:** simples; bloqueio "não avança para proposta sem go" acopla à máquina de estados; aprovação registrada/auditável; aditivo puro.
- **Contras:** critérios fixos (margem/equipe/concorrência) — se o time quiser critérios variáveis, vira B.

### Abordagem B — Critérios configuráveis (modelo + itens)
Mesmo padrão do checklist de habilitação (Item 4 B): modelo global de critérios + instância por licitação.
- **Prós:** critérios editáveis em Configurações; pesos/escala.
- **Contras:** mais peças; over-engineering se 3 critérios bastam.

### Gate de aprovação (sub-decisão, vale para A e B)
- **Opção 1:** aprovador = `User` com relação `Socio` (semântica exata de "sócio").
- **Opção 2:** aprovador = role `admin`/`supervisor` (mais simples, menos preciso).
- **Opção 3:** adicionar `socio` ao `enum Role` (**altera enum existente** → migration de maior atenção; não recomendado só por isto).

### Integração / migration
- Máquina de estados (bloquear avanço até `go`), permissões, timeline, P3 (sanção própria pesa no no-go). Migration aditiva (A/B); Opção 3 do gate alteraria enum.

✅ **P9 concluído.**

---

## P10 — Exportação de relatórios (PDF/Excel)

Em grande parte **código, não schema** — a infra já existe.

### Abordagem A — Reusar a stack existente (recomendado avaliar)
- **PDF:** `puppeteer-core`, como em `src/app/api/documentos/[id]/pdf/route.ts` → proposta formatada, matriz de risco (P4 B), processo licitatório.
- **Excel:** `exceljs`, como em `src/app/api/financeiro/contas/export/route.ts` e `.../relatorios/dre/xlsx/route.ts` → pipeline de licitações, funil (Item 5).
- Novas rotas `app/api/licitacoes/.../export`.
- **Prós:** zero dependência nova; padrões consolidados; sem migration.
- **Contras:** layout de PDF dá trabalho de template; relatório "ao vivo" pode ficar pesado em volume alto (mitigável com filtros do servidor já existentes).

### Abordagem B — Modelos de relatório configuráveis
Tabela `ModeloRelatorioLicitacao` (cabeçalho, colunas, logo) para o usuário ajustar export.
- **Prós:** flexibilidade de apresentação a sócios.
- **Contras:** complexidade desproporcional ao ganho inicial; só se houver demanda real de customização.

### Integração / migration
- Consome dados dos demais itens (composição, contrato, funil). A: nenhuma migration. B: aditiva (1 tabela de config).

✅ **P10 concluído.**

---

## Quadro-resumo — Parte 2

| Ponto | Risco migration | Constante legal? (manter configurável) | Reusa infra |
|---|---|---|---|
| P1 Recursos/impugnações | Aditivo | ⚠️ prazos | alerta, timeline |
| P2 Aditivos + limite | Aditivo | ⚠️ % limite | Item 3 B, alerta |
| P3 Sanções | Aditivo | — | `Fornecedor`, Item 5 C |
| P4 Matriz de risco | Aditivo | — | doc/versão, P10 |
| P5 Responsável técnico | Aditivo | — | `User`, projetos |
| P6 Subcontratação | Aditivo | edital (não lei) | `Fornecedor`, P10 |
| P7 PNCP | Aditivo | ⚠️ obrigatoriedade/API | alerta |
| P8 Reajuste | Aditivo | índice (config) | Item 3, alerta, financeiro |
| P9 Go/no-go | Aditivo (gate Opção 3 altera enum) | — | `Socio`, status, P3 |
| P10 Export | Nenhuma (A) | — | `puppeteer-core`, `exceljs` |

Nenhum ponto da Parte 2 exige, por si, alterar tabela existente — exceto colunas opcionais em `Licitacao`/`ContratoLicitacao` (aditivas) e a Opção 3 do gate de P9 (alterar `enum Role`), que não é recomendada.

---

## Próximo passo
Documento concluído (Parte 1: itens 1–5 estruturais · Parte 2: P1–P10 adicionais) — **aguardando aprovação humana**. Nenhuma abordagem foi escolhida e nada será implementado sem decisão explícita por item. Os parâmetros legais (Lei 14.133/PNCP) estão propositalmente modelados como **configuração editável** e devem ter a redação vigente confirmada antes de virar regra.
