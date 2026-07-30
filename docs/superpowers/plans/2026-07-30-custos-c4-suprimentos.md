# Engenharia de Custos — Onda C4: Suprimentos

**Data:** 2026-07-30 · **Status:** implementado — tsc/test/lint/build limpos; falta smoke em navegador (usuário) · **Branch:** `dev` · **Modelo:** Sonnet

Depende de: [C0 — Fundação](2026-07-27-custos-c0-fundacao.md) (`9c0c2d5`), já implementada. **Não**
depende de C1/C2/C3 — RFQ/cotação é ortogonal a bancos/orçamento/quantitativos (usa `CustoInsumo` de
C1 só como link opcional de proveniência, nunca obrigatório).
Fonte arquitetural: [design de conformidade](../specs/2026-07-27-engenharia-custos-design.md) §4 (linha
6, 7, 8), §5.2 (linha 306-308), §10 (linha 224-231).

---

## 1. Goal

RFQ (solicitação de cotação) para fornecedores existentes, registro manual das propostas recebidas
(preço, frete, impostos, prazo, validade, condições), comparador **puro e testado** que soma o total
comparável por proposta, escolha do vencedor com justificativa obrigatória, e alimentação automática de
`CustoPrecoHistorico` (append-only) com o preço vencedor. Extensão do `Fornecedor` existente (regiões,
categorias, condições comerciais, prazo médio, avaliação, representantes) — nunca um `FornecedorCusto`
paralelo.

Ao fim: criar uma RFQ, registrar 3 propostas de fornecedores diferentes, comparar, escolher vencedor com
justificativa, e ver o preço aparecer no histórico.

**Não é** CRM comercial nem proposta comercial ao cliente — isso é `modules/comercial` e não se toca.

## 2. Decisões de escopo (resolvidas antes do schema, para não arqueologizar depois)

### 2.1 Sem portal público de fornecedor

A proposta é **registrada por um funcionário interno** (recebida por e-mail/telefone/WhatsApp, digitada
no sistema) — não um formulário público que o fornecedor preenche sozinho. `modules/inputs` já resolve
"formulário público token-gated" para outro caso de uso; reabrir essa máquina aqui (fluxo de convite por
link, autenticação fraca, validação de fornecedor externo) é escopo muito maior que o D̀oD pede e o
design doc não menciona token público em nenhum lugar da §5.2. `CustoRfqConvite` existe só para marcar
"quem foi convidado e respondeu/não respondeu" (alimenta o alerta de "cotação vencendo" — §2.4) — a
costura para IA lida no §8 do prompt de implementação é justamente "a leitura de PDF por IA preenche a
mesma estrutura que hoje é digitada", ou seja, o caminho de entrada continua sendo o funcionário (ou a
IA no lugar dele), nunca o fornecedor direto.

### 2.2 Impostos: `impostosInclusos` boolean, não percentual

Fornecedor cota preço **com** ou **sem** impostos embutidos — não uma alíquota que o sistema aplica por
cima. Um campo `impostosPercentual` convidaria o comparador a fazer
`precoUnitario × (1 + impostosPercentual/100)` e contar imposto em dobro pra quem já cotou com imposto
incluso — é exatamente o tipo de erro silencioso que este módulo existe pra evitar (mesmo princípio do
levantamento de quantitativo em C3: nunca assumir, sempre confirmar o que a fonte já diz). Campo real:
`impostosInclusos Boolean @default(true)` + `impostosValor Decimal(14,2)?` informativo (quanto o
fornecedor destacou, só pra leitura humana). O comparador só soma imposto ao total comparável quando
`impostosInclusos = false` **e** `impostosValor` foi informado.

### 2.3 Comparador: total comparável, não nota composta

`CustoProposta` tem 6 eixos (preço, frete, imposto, prazo, validade, condições, avaliação do
fornecedor). Uma nota ponderada exigiria pesos que ninguém definiu — inventar pesos é uma decisão de
negócio, não uma decisão técnica, e o usuário nunca pediu isso. `comparador.ts` calcula só o **total
comparável em R$** por proposta (`Σ precoUnitario × quantidade do item` + `frete` + `impostosValor` se
não incluso) e ordena por ele; os outros eixos (prazo, validade, avaliação do fornecedor) aparecem como
colunas na tela pro humano ler. **A escolha do vencedor continua sendo decisão humana** com
`justificativaEscolha` obrigatória — o sistema nunca escolhe sozinho.

### 2.4 Notificações: passo isolado, aceite por chamada direta

`alertaCotacoesCusto` (cron 08:00, mesmo grupo de `alertaCertidoes`/`alertaLicitacoes` em `jobs.ts`) só
roda de verdade sob `dev:server`/produção — não dá pra provar em sessão de desenvolvimento que o cron
dispara (mesma limitação de C3 com o `.frag`: o ambiente não sustenta a verificação end-to-end). Fica
como **Passo 5, isolado**, com aceite explícito "chamada direta do handler contra dado real, não cron
disparado" — não bloqueia o DoD central (criar RFQ → propostas → comparar → escolher → histórico), que
não menciona notificação.

### 2.5 Fornecedor: colunas escalares + 1 tabela satélite

`regioesAtendidas String[]` (UFs) e `categoriasFornecidas CategoriaInsumo[]` (reusa o enum de C1) —
**array escalar do Postgres já é idioma estabelecido no schema** (`CustoImportacao.ufs`/`.regimes`,
`Aviso.alvoRoles`, `DisciplinaVersao.tags`), não introduz padrão novo. `prazoMedioDiasEntrega Int?` e
`condicoesComerciais String?` (texto livre — "30/60/90 dias", "à vista com desconto") também escalares.
`avaliacaoNota Decimal(3,2)?` é uma nota subjetiva editável por quem gerencia fornecedores (não
calculada automaticamente a partir de RFQs nesta onda — vira feature de IA/analytics depois, ver §8 do
prompt). **Representantes** (nome, cargo, telefone, e-mail — múltiplos por fornecedor, cada um com
campos próprios) não cabe em array escalar → tabela satélite `FornecedorRepresentante`, mesma forma de
`FornecedorServico` (sem `updatedAt`, `@@index([fornecedorId])`).

## 3. Architecture

### 3.1 Schema

```prisma
// Extensão do Fornecedor existente (nunca FornecedorCusto)
model Fornecedor {
  // ...campos existentes inalterados...
  regioesAtendidas      String[]          @default([])
  categoriasFornecidas  CategoriaInsumo[] @default([])
  prazoMedioDiasEntrega Int?
  condicoesComerciais   String?
  avaliacaoNota         Decimal?          @db.Decimal(3, 2)  // 0.00–5.00, editável manualmente

  representantes CustoFornecedorRepresentante[]
  rfqConvites    CustoRfqConvite[]
  propostas      CustoProposta[]
  precoHistorico CustoPrecoHistorico[]
}

model CustoFornecedorRepresentante {
  id           String     @id @default(cuid())
  fornecedorId String
  fornecedor   Fornecedor @relation(fields: [fornecedorId], references: [id], onDelete: Cascade)
  nome         String
  cargo        String?
  telefone     String?
  email        String?
  ativo        Boolean    @default(true)
  createdAt    DateTime   @default(now())

  @@index([fornecedorId])
  @@map("custo_fornecedor_representante")
}

enum CustoStatusRfq { rascunho aberta encerrada cancelada }
enum CustoStatusConvite { convidado respondido sem_resposta }
enum CustoStatusProposta { recebida vencedora nao_escolhida }

model CustoRfq {
  id            String         @id @default(cuid())
  /// Opcional — RFQ pode ser de obra (ligada a um orçamento) ou de compra avulsa/recorrente.
  orcamentoId   String?
  orcamento     CustoOrcamento? @relation(fields: [orcamentoId], references: [id])
  titulo        String
  descricao     String?
  status        CustoStatusRfq  @default(rascunho)
  prazoResposta DateTime?       @db.Date
  criadoPorId   String
  criadoPor     User            @relation(fields: [criadoPorId], references: [id])
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  itens     CustoRfqItem[]
  convites  CustoRfqConvite[]
  propostas CustoProposta[]

  @@index([orcamentoId])
  @@index([status])
  @@map("custo_rfq")
}

model CustoRfqItem {
  id         String   @id @default(cuid())
  rfqId      String
  rfq        CustoRfq @relation(fields: [rfqId], references: [id], onDelete: Cascade)
  /// Link opcional pro banco de insumos — habilita rastro de preço histórico por insumo.
  /// Null = item fora do catálogo (ex.: aluguel de equipamento específico, serviço avulso).
  insumoId   String?
  insumo     CustoInsumo? @relation(fields: [insumoId], references: [id])
  descricao  String
  quantidade Decimal  @db.Decimal(12, 2)
  unidade    String

  propostaItens CustoPropostaItem[]

  @@index([rfqId])
  @@index([insumoId])
  @@map("custo_rfq_item")
}

model CustoRfqConvite {
  id           String             @id @default(cuid())
  rfqId        String
  rfq          CustoRfq           @relation(fields: [rfqId], references: [id], onDelete: Cascade)
  fornecedorId String
  fornecedor   Fornecedor         @relation(fields: [fornecedorId], references: [id])
  status       CustoStatusConvite @default(convidado)
  convidadoEm  DateTime           @default(now())
  respondidoEm DateTime?

  @@unique([rfqId, fornecedorId])
  @@index([rfqId])
  @@index([fornecedorId])
  @@map("custo_rfq_convite")
}

model CustoProposta {
  id                   String              @id @default(cuid())
  rfqId                String
  rfq                  CustoRfq            @relation(fields: [rfqId], references: [id], onDelete: Cascade)
  fornecedorId         String
  fornecedor           Fornecedor          @relation(fields: [fornecedorId], references: [id])
  status               CustoStatusProposta @default(recebida)
  frete                Decimal?            @db.Decimal(14, 2)
  /// true = preço unitário do item já inclui impostos; comparador não soma `impostosValor` de novo.
  impostosInclusos     Boolean             @default(true)
  /// Informativo — quanto o fornecedor destacou de imposto, só pra leitura humana quando incluso.
  impostosValor        Decimal?            @db.Decimal(14, 2)
  prazoEntregaDias      Int?
  validadeAte          DateTime?           @db.Date
  condicoesPagamento   String?
  observacoes          String?
  /// Obrigatório só quando status vira `vencedora` (validado em service.ts).
  justificativaEscolha String?
  escolhidoPorId       String?
  escolhidoPor         User?               @relation("PropostaEscolhidaPor", fields: [escolhidoPorId], references: [id])
  escolhidoEm          DateTime?
  criadoPorId          String
  criadoPor            User                @relation(fields: [criadoPorId], references: [id])
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  itens         CustoPropostaItem[]
  anexos        CustoPropostaAnexo[]
  precoGerado   CustoPrecoHistorico[]

  @@index([rfqId])
  @@index([fornecedorId])
  @@map("custo_proposta")
}

model CustoPropostaItem {
  id            String        @id @default(cuid())
  propostaId    String
  proposta      CustoProposta @relation(fields: [propostaId], references: [id], onDelete: Cascade)
  rfqItemId     String
  rfqItem       CustoRfqItem  @relation(fields: [rfqItemId], references: [id])
  precoUnitario Decimal       @db.Decimal(14, 2)
  observacao    String?

  @@unique([propostaId, rfqItemId])
  @@index([propostaId])
  @@index([rfqItemId])
  @@map("custo_proposta_item")
}

/// Mesma forma de LancamentoAnexo — sem passar por Upload/disciplina (proposta não pertence a um projeto).
model CustoPropostaAnexo {
  id         String        @id @default(cuid())
  propostaId String
  proposta   CustoProposta @relation(fields: [propostaId], references: [id], onDelete: Cascade)
  caminho    String
  nome       String
  mime       String
  tamanho    Int
  autorId    String
  autor      User          @relation(fields: [autorId], references: [id])
  createdAt  DateTime      @default(now())

  @@index([propostaId])
  @@map("custo_proposta_anexo")
}

/// Append-only — nunca deletar/atualizar. 1 linha por item da proposta vencedora, gravada no momento
/// da escolha (service.ts, mesma transação que marca a proposta `vencedora`).
model CustoPrecoHistorico {
  id           String         @id @default(cuid())
  insumoId     String?
  insumo       CustoInsumo?   @relation(fields: [insumoId], references: [id])
  descricao    String
  fornecedorId String?
  fornecedor   Fornecedor?    @relation(fields: [fornecedorId], references: [id])
  propostaId   String?
  proposta     CustoProposta? @relation(fields: [propostaId], references: [id])
  valor        Decimal        @db.Decimal(14, 2)
  unidade      String
  data         DateTime       @db.Date
  createdAt    DateTime       @default(now())

  @@index([insumoId])
  @@index([fornecedorId])
  @@map("custo_preco_historico")
}
```

Inverse relations a adicionar: `User.rfqsCriadas`, `.propostasCriadas`, `.propostasEscolhidas`,
`.propostaAnexos`; `CustoOrcamento.rfqs`; `CustoInsumo.rfqItens`, `.precoHistorico`.

### 3.2 Módulo puro — `comparador.ts`

```ts
// src/modules/custos/cotacoes/comparador.ts — SEM Prisma, SEM I/O
type ItemComparado = { rfqItemId: string; precoUnitario: number; quantidadeItem: number };
type PropostaEntrada = {
  propostaId: string; fornecedorNome: string;
  itens: ItemComparado[]; frete: number; impostosInclusos: boolean; impostosValor: number | null;
  prazoEntregaDias: number | null; validadeAte: Date | null; avaliacaoFornecedor: number | null;
};
type PropostaComparada = PropostaEntrada & { totalComparavel: number; itensFaltando: string[] };

function compararPropostas(entradas: PropostaEntrada[], rfqItemIds: string[]): PropostaComparada[]
```

`totalComparavel = Σ(precoUnitario × quantidadeItem) + frete + (impostosInclusos ? 0 : impostosValor ?? 0)`.
`itensFaltando` = ids de `CustoRfqItem` sem `CustoPropostaItem` correspondente (proposta parcial —
sinalizado na tela, não impede comparar o que existe). Ordenação: `totalComparavel` crescente, propostas
com itens faltando vão para o fim independente do total (parcial nunca vence por default — a tela mostra
por quê). Testado com fixtures: proposta completa vs parcial, imposto incluso vs não-incluso, frete
zero, duas propostas empatadas (desempate por `prazoEntregaDias` menor, depois por ordem de chegada).

### 3.3 Fluxo

1. Criar RFQ (título, descrição, prazo de resposta, itens — cada um com descrição/quantidade/unidade e
   link opcional a `CustoInsumo` via busca) → `rascunho`.
2. Convidar fornecedores (busca em `Fornecedor` ativo, filtro sugerido por `categoriasFornecidas`) →
   `CustoRfqConvite` por fornecedor, RFQ vira `aberta`.
3. Registrar proposta recebida: escolher fornecedor convidado, preencher preço por item (só os itens que
   o fornecedor cotou — parcial é permitido), frete, imposto, prazo, validade, condições, anexar PDF/e-mail
   da cotação (rota multipart dedicada, sem passar por disciplina).
4. Tela de comparação: tabela com uma linha por proposta, `totalComparavel` calculado, colunas de prazo/
   validade/avaliação do fornecedor, aviso de item faltando.
5. Escolher vencedor: seleciona a proposta, digita justificativa (campo obrigatório) → `service.ts`, numa
   transação: marca a escolhida `vencedora` (+ `escolhidoPorId`/`escolhidoEm`), as demais `recebida` do
   mesmo RFQ viram `nao_escolhida`, RFQ vira `encerrada`, e grava 1 `CustoPrecoHistorico` por
   `CustoPropostaItem` da vencedora (unidade vem do `CustoRfqItem`, data = hoje).
6. Histórico de preços: lista append-only por insumo/fornecedor, navegável a partir do banco de insumos
   (C1) e da tela de fornecedor.

## 4. Tech Stack

Mesmas libs já em uso — nenhuma dependência nova (regra invíolavel #8). Anexo de proposta usa
`lib/storage.ts` (`salvarArquivo`/`lerArquivo`/`removerArquivo`) direto, mesma forma de
`LancamentoAnexo` — não passa por `/api/uploads` (que exige `disciplinaId`).

## 5. Global Constraints

- Toda mutação por `defineAction`, `modulo: "custos"`, `recurso: "custos"`, `permissao: "cotacao"` (ação
  já seeded em C0 — `administrativo` tem; `supervisor`/`admin` bypass ou ver apenas conforme seed atual,
  reconferir no Passo 1 se `supervisor` precisa do `acao: "cotacao"` também — hoje só tem `ver`+`gerir`).
- `capturarAntes` dentro do config, nunca 3º argumento.
- Proposta rejeitada **nunca** é deletada — só muda de status (regra invólavel #10).
- Código/chave publicada não se aplica aqui (não há "chave estável" em RFQ).
- `Decimal(14,2)` dinheiro, `Decimal(12,2)` quantidade, `Decimal(3,2)` avaliação (0.00–5.00).
- `@@index` em toda FK filtrada.
- pt-BR na UI, inglês nos identificadores.

## 6. Passos

### Passo 1 — Schema + migração
- [x] Extensão de `Fornecedor` (colunas escalares) + `CustoFornecedorRepresentante`.
- [x] `CustoRfq`, `CustoRfqItem`, `CustoRfqConvite`, `CustoProposta`, `CustoPropostaItem`,
      `CustoPropostaAnexo`, `CustoPrecoHistorico` + 3 enums.
- [x] Reconferido: `custos:cotacao` fica só `administrativo`+`admin`, sem mudança no seed (mesma
      régua de `custos:bancos`, já seedada em C0).
- [x] Migração `20260730150000_custos_suprimentos` — drift pré-existente e não-relacionado
      (`20260706150000_drop_escala_trabalho`, mesmo do C3) contornado via `db push` + diff por banco
      shadow temporário + `migrate resolve --applied` (padrão do skill `/nova-migracao`, sem
      `migrate reset`). Status pós-resolve ainda mostra `20260728231000_alerta_licitacao_dedup` como
      não aplicada — commit `2694c6a` de outra sessão (licitações), pré-existente, não tocado.

**Aceite:** tabelas confirmadas via `prisma migrate status` + client regenerado; `tsc --noEmit` e
`npm test` (1422/1422) limpos.

### Passo 2 — `comparador.ts` puro + testes
- [x] `compararPropostas` + `melhorPropostaCompleta` conforme §3.2, com os casos de fixture listados.

**Aceite:** `npm test` cobre proposta completa/parcial, imposto incluso/não, empate — 8/8 verde,
`tsc` limpo.

### Passo 3 — service + actions + queries (`src/modules/custos/cotacoes/`)
- [x] `schemas.ts`, `service.ts`, `queries.ts`, `actions.ts` conforme planejado.
- [x] Rota multipart `POST /api/custos/cotacoes/anexo` + `GET .../anexo/[id]` (mesma forma da rota
      de anexo de lançamento).
- [x] Extensão de `Fornecedor` (`fornecedores-section.tsx` ganhou os campos novos + seção de
      representantes — adiantado do Passo 4 porque o `tsc` do Passo 3 já exigia o call-site
      atualizado; UI completa então feita aqui, não em duplicidade no Passo 4).

**Aceite:** `tsc` limpo; smoke via script direto contra o banco de dev — **achou e corrigiu um bug
real**: `detalheRfq` calculava `compararPropostas` (ordenado por total comparável) mas depois
REMAPEAVA por cima de `rfq.propostas` (ordem `createdAt asc`), jogando fora a ordenação — o
ranking voltava pra ordem de chegada, exatamente o tipo de erro silencioso que este módulo existe
pra evitar. Corrigido (retorna `comparadas` direto). Reconfirmado no smoke: fornecedor com menor
total (188) agora rankeia antes do de maior total (200), parcial fica por último, vencedor e
`CustoPrecoHistorico` corretos. `tsc` limpo, `npm test` 1430/1430.

### Passo 4 — Telas
- [x] `/custos/cotacoes` (lista de RFQs) + `NovaRfqDialog` (itens com busca opcional no catálogo de
      insumos).
- [x] `/custos/cotacoes/[id]`: itens, convites (+ `ConvidarFornecedoresDialog`), propostas
      registradas (+ `RegistrarPropostaDialog`), tabela de comparação (`totalComparavel` + status +
      colunas), `EscolherVencedorDialog` (justificativa obrigatória), anexo por proposta (upload +
      lista + remover).
- [x] Extensão do formulário de fornecedor — adiantada no Passo 3.
- [x] Histórico de preço: expandable inline na aba Insumos de `/custos/bancos` (por insumo) E na
      linha de fornecedor em `/financeiro/cadastros` (por fornecedor) — ambos lazy-load,
      gated por `custos:cotacao` (não vaza pra quem só tem `financeiro:gerir`). Ficha dedicada
      continua fora de escopo (C1 não tem ficha individual).

**Aceite:** `tsc`/`test` (1430/1430)/`lint` limpos. `npm run build` **exit 0**, 4 rotas novas
renderizadas (`/custos/cotacoes`, `/custos/cotacoes/[id]`, `/api/custos/cotacoes/anexo[/[id]]`).
Build loga 3x `"use server" file can only export async functions, found number` — **pré-existente,
não relacionado**: `src/modules/perfis/actions.ts:115` reexporta uma constante numérica morta
(commit `009a05a`, não tocado nesta sessão); não bloqueia, não corrigido aqui (fora do escopo desta
onda). Revisão do advisor achou e corrigiu 5 problemas antes deste ponto: total exibido em
`PropostaRow` somava preço unitário sem multiplicar pela quantidade (divergia do `totalComparavel`
da tabela de comparação); nada impedia duas propostas do mesmo fornecedor na mesma RFQ (agora
bloqueado em `service.ts` + filtrado no seletor do dialog); a comparação sumia da tela assim que a
decisão era tomada (tirado o filtro, status agora aparece como coluna); busca de fornecedores no
convite disparava uma Server Action por tecla (trocado pra Enter/botão); `historicoPrecoFornecedor`
estava morto (agora usado). Também corrigido, achado por mim: `<>` sem key dentro de `.map()` em
`insumos-tab.tsx` (virou `<Fragment key={i.id}>`).

**Verificação em navegador: NÃO executada nesta sessão — sem ferramenta de browser disponível.**
Diferente do gap do `.frag` em C3 (uma cadeia de biblioteca isolada), aqui são ~1400 linhas de UI
interativa nova; a rota de checagem mais provável de esconder bug é justamente a que nenhum smoke
de script cobre: abrir/fechar diálogo, reenviar anexo, clique real. Fica como roteiro pendente do
usuário (§8) antes de considerar o DoD 100% fechado.

### Passo 5 — Notificações (isolado, ver §2.4)
- [x] `alertaCotacoesCusto()` em `jobs-handlers.ts`: RFQ `aberta` com `prazoResposta` em 3/1 dia(s) →
      `criadoPorId` + gestores (`admin`,`administrativo`) via `notificarMuitos`, `categoria: "custos"`.
      Segundo alerta: RFQ `aberta` com `prazoResposta` já passado e algum `CustoRfqConvite` ainda
      `convidado` (nunca respondeu) → mesmo grupo, mensagem "sem resposta".
- [x] Registrado em `jobs.ts` no grupo `alertas-diarios` (08:00).
- [x] `notifCustos`/`notif_custos` em `carregarPreferenciasDaConta()` + toggle em
      `preferencias-view.tsx` ("Cotações (suprimentos)").

**Aceite:** chamada direta de `alertaCotacoesCusto()` contra dado de dev real — **não** aceite por
cron disparado (gap documentado, mesmo padrão do `.frag` em C3). Smoke: 2 RFQs reais (uma com
`prazoResposta` em 3 dias, outra vencida com convite `convidado` sem resposta) → notificações reais
gravadas na tabela com título/corpo/href corretos (`"Cotação: prazo em 3 dia(s)"` e `"Cotação com
fornecedor sem resposta"`). A 1ª chamada do script crashou numa query de verificação antes de
limpar (sem afetar `alertaCotacoesCusto` em si) — refeito com dado limpo, confirmado 1:1 (2 RFQs → 2
eventos), e removido todo resíduo `TESTE*` do banco de dev ao final.

### Passo 6 — Verificação e commit
- [x] `npx tsc --noEmit` · `npm test` (1430/1430) · `npm run lint` · `npm run build` (sem dev na :3000,
  exit 0 — único warning é o pré-existente `perfis/actions.ts:115` "found number", não tocado nesta onda,
  root-causado a `009a05a`, fora de escopo).
- [ ] Smoke real no navegador, roteiro do §8. **NÃO executado nesta sessão** — sem ferramenta de browser
  disponível. Fica como roteiro pendente do usuário antes de considerar o DoD 100% fechado.
- [x] Revisão via advisor (pós-Passo 5) achou 2 bugs reais, ambos corrigidos e reverificados
  (tsc/test/lint limpos de novo + smoke dedicado):
  1. **Spam de notificação diária** — `alertaCotacoesCusto`'s "sem resposta" (`jobs-handlers.ts`) filtrava
     só `prazoResposta: { lt: new Date() }`, sem limitar a janela: uma RFQ vencida e sem resposta reenviava
     o alerta TODO dia, indefinidamente, até alguém fechar/cancelar a RFQ manualmente (efeito "todo mundo
     silencia a categoria"). Corrigido pra usar `diaAlvo(-1)` (mesmo padrão do D-3/D-1 acima e de
     `alertaCertidoes`/`alertasPrazoDisciplina`) — dispara só no dia seguinte ao vencimento, uma vez.
     Verificado por raciocínio de datas (janela de 1 dia útil só bate no dia D+1) + smoke que confirmou
     zero resíduo na tabela `Notificacao` após a corrida.
  2. **Corrida em `escolherVencedor`** — o guard `status !== "recebida"` era um `findUnique` fora da
     `$transaction`; dois cliques/chamadas concorrentes na MESMA proposta passavam ambos no guard antes
     de qualquer commit, podendo gerar 2 linhas `vencedora` + `CustoPrecoHistorico` duplicado. Corrigido
     movendo o guard pra dentro da transação: `updateMany({ where: { id, status: "recebida" }, ... })` e
     tratando `count === 0` como "já foi decidida" (sem tabela nova, sem lock explícito). Verificado com
     smoke de `Promise.allSettled` disparando a mesma proposta 2x em paralelo: 1 sucesso, 1 rejeitado com
     a mensagem esperada, exatamente 1 linha de histórico de preço.
- [x] Commit `feat(custos): RFQ, propostas, comparador e histórico de preços` (`13ff95c`).

## 7. Definition of Done

- Criar RFQ com itens (ao menos um linkado a `CustoInsumo`, outro livre).
- Convidar 3 fornecedores; registrar proposta de cada um (uma delas parcial — faltando 1 item).
- Tabela de comparação mostra `totalComparavel` correto e aponta o item faltando na parcial.
- Escolher vencedor com justificativa; as outras 2 viram `nao_escolhida`; RFQ vira `encerrada`.
- `CustoPrecoHistorico` ganha 1 linha por item da vencedora, visível na ficha do insumo.
- Extensão de `Fornecedor` (regiões/categorias/prazo/condições/avaliação/representantes) editável na
  tela existente de cadastro.
- `tsc` + `test` + `lint` + `build` limpos.

## 8. Verificação manual (roteiro)

`npm run dev` é suficiente (sem job/realtime no caminho principal — só a rota multipart de anexo).

1. `/custos/cotacoes` → **Nova RFQ** → título, prazo de resposta, 2 itens (1 com busca de insumo, 1
   livre) → salvar (`rascunho`).
2. Convidar 3 fornecedores (cadastrar 1 novo em `/financeiro/cadastros` se faltar, com região/categoria
   preenchidas) → RFQ vira `aberta`.
3. **Registrar proposta** × 3 — a terceira deixando 1 item sem preço (parcial). Anexar 1 PDF de teste
   numa delas.
4. Aba comparação: conferir `totalComparavel`, aviso de item faltando na parcial, colunas de prazo/
   validade/avaliação.
5. **Escolher vencedor** numa das completas → justificativa obrigatória (tentar salvar vazio → bloqueia)
   → confirmar → as outras 2 mostram `nao_escolhida`, RFQ `encerrada`.
6. Ficha do insumo linkado (C1, `/custos` bancos) → aba/seção de histórico de preço → linha nova com
   fornecedor, valor, data.
7. `/financeiro/cadastros` → fornecedor → conferir campos novos salvos + representante adicionado.

## 9. Fora de escopo (não invadir)

- Portal público do fornecedor (self-service) — §2.1.
- Nota composta ponderada no comparador — §2.3.
- Verificação real de cron disparado (só chamada direta) — §2.4.
- Regra determinística "preço fora da faixa histórica" (fica pronta a base — `CustoPrecoHistorico` — mas
  a regra em si é C7/IA, não esta onda).
- Qualquer coisa de C1 (bancos)/C2 (orçamento)/C3 (quantitativos) além do link opcional a `CustoInsumo`.
- Cronograma, medições, revisões (C5/C6/C7).
