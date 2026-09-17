# Comercial — funil único, toolbar fixa e modal por card

> Plano de execução. Nenhum código foi alterado ao escrever este documento. Decisão de produto do
> §2 (a costura entre Prospecção e Negociação) está registrada em
> [`docs/adr/0004-funil-comercial-unico.md`](../../adr/0004-funil-comercial-unico.md) — aprovada
> pelo dono em 2026-09-16, junto com as respostas às perguntas abertas deste documento.

## Contexto

A reforma CRM (F0-F7, `docs/crm/`) fechou em 2026-09-02: `Lead` (prospecção) e `Negociacao` são
entidades separadas, cada uma com Kanban próprio (`/comercial/prospeccao`, `/comercial/negociacoes`).
Pedido do dono (2026-09-16), a partir de screenshots do sistema em produção:

1. Toolbar do Comercial (Inteligência/Prospecção/Negociações/Parceiros/…) só existe em `/comercial`
   — some ao navegar pra qualquer subtela.
2. Prospecção e Negociação são "um fluxo único" e deveriam virar um board único, colunas
   minimizáveis.
3. Edição de dados/anexos/versionamento/propostas/timeline/follow-ups deveria ser um modal por
   card, não a página cheia `/comercial/[id]` que existe hoje (que também não existe pro lado da
   negociação).
4. Card mostra: Cliente, Demanda, temperatura sempre, campanha só em prospecção, probabilidade +
   valor + desconto só em negociação, Parceiro nos dois lados, responsável como avatar sem nome.
5. Revisão do fluxo de elaboração de propostas — **aberto**, aguardando exemplos reais (§7).
6. Agenda dedicada de follow-ups dentro do Comercial **e** filtro comercial na agenda geral.
7. Investigar erro ao editar card em prospecção (auditoria mostra falhas repetidas).

Decisões já tomadas nas perguntas de esclarecimento (2026-09-16):
- Probabilidade só aparece quando o card já é negociação (não cria campo novo em `Lead`).
- Terminais (Sem oportunidade/Em espera/Descartado/Perdido/Cancelado) viram 1 grupo "Encerrados"
  colapsado por padrão; o status original fica como campo em cada card.
- Follow-ups: view dedicada dentro de `/comercial` **e** filtro na agenda geral dos responsáveis.

## Fase A — Toolbar fixa

**Objetivo:** a barra Inteligência/Prospecção(→board único)/Parceiros/Campanhas/Tabelas/Importar/
Propostas/Configurações aparece em toda rota `/comercial/**`, destacando a ativa.

- `src/app/(dashboard)/comercial/layout.tsx` (novo, Server Component): `requirePermission("comercial","ver")`
  + `can(user, "comercial", "gerir")` pro ícone de Configurações (hoje isso já roda em `page.tsx` —
  vira responsabilidade do layout, `page.tsx` não repete).
- Nav em client component (`comercial-nav.tsx`), usa `usePathname()` do App Router pra decidir o item
  ativo — sem estado próprio, sem prop drilling de rota.
- Layout **não recebe `searchParams`** — `AlternanciaVisaoComercial` (`?visao=meus`) continua sendo
  responsabilidade de `page.tsx` (a home), não do layout.
- `/comercial/[id]` (ficha do lead) e `/comercial/propostas/[id]` também caem sob este layout —
  decisão de exibição: nenhum item da nav marca como ativo (são fichas individuais, não uma das
  telas do menu); a nav continua visível pra navegação lateral.
- `page.tsx` perde o bloco de botões (linhas 42-79 hoje) — vira só título + resumo + `MetaCard` +
  `HomeComercialView`.
- Atenção: o board (Fase B) usa `sm:overflow-x-auto` nas colunas — a toolbar fixa (`sticky top-0`)
  não pode roubar o scroll horizontal do board; testar em viewport estreito.

**Risco:** baixo, isolado, não toca dado nem action.

## Fase B — Board único de Prospecção + Negociação

Decisão de produto em [ADR-0004](../../adr/0004-funil-comercial-unico.md). Aqui só a execução.

### B.1 — Rota e dados

- Nova rota `/comercial/funil` (nome a confirmar) substitui as duas atuais como destino principal.
  `/comercial/prospeccao` e `/comercial/negociacoes` viram `redirect()` permanente pra cá —
  preservando querystring relevante (`?negociacao=<id>` do deep link F7.3, `?page=`).
- Colunas, na ordem: Identificado, Contato iniciado, Em contato, Qualificado, **Levantamento**,
  Orçamento, Proposta enviada, Negociação, Contratado, **Encerrados** (grupo).
- `OPORTUNIDADE_CRIADA` não é coluna — nenhum card fica "parado" nela visualmente; ao qualificar, o
  card já nasce em Levantamento (ver B.2).
- Query: mantém o padrão do F6.11 (uma busca de ids fixos por coluna, 25/coluna, "carregar mais").
  Colunas colapsadas (manual ou o grupo Encerrados fechado) **pulam a query** — não busca e descarta,
  não busca mesmo.
- Estado de coluna colapsada: preferência por viewer, `localStorage` (não precisa persistir no
  servidor nem sincronizar entre dispositivos — é uma conveniência de tela, não um dado de negócio).

### B.2 — A costura (qualificação pelo drag)

- Soltar um lead em **Levantamento** chama uma action nova (`qualificarPeloDrag` ou reaproveitar
  `qualificarProspeccao` exposta como action) que:
  1. se o lead já tem `Negociacao` (`leadId` único) — não deveria acontecer (lead qualificado some
     do lado prospecção do board), mas se acontecer é no-op idempotente, não erro;
  2. se o lead está em `SEM_OPORTUNIDADE`/`EM_ESPERA`/`DESCARTADO` — recusa por padrão; a UI mostra
     confirmação ("Esta prospecção está X. Qualificar vai reativá-la e abrir uma negociação.");
     confirmando, reenvia com um campo explícito de consentimento no payload (mesmo padrão do
     `criarPropostaDeLead`, ADR-21 §5b) — nunca inferido do clique, sempre no payload;
  3. senão, qualifica normal — `Lead.status = OPORTUNIDADE_CRIADA`, cria `Negociacao` em
     `LEVANTAMENTO`.
- **Extração pra `tx`:** `qualificarProspeccao` hoje abre sua própria `$transaction` e faz o
  `findUnique` fora dela (mesma armadilha já documentada em ADR-21 pra `criarPropostaDeLead`) — o
  miolo precisa aceitar `tx` como parâmetro pra rodar dentro da transação da action de drag, senão
  uma falha no meio deixa estado inconsistente.
- Drag de um card de negociação pra qualquer coluna de prospecção é recusado no servidor
  (`validarMovimentoProspeccao` já cobre isso) — a UI nem deveria deixar soltar (impedir no
  `onDragEnd` pelo tipo de origem/destino), mas a recusa do servidor é a garantia real.

### B.3 — Grupo Encerrados

- 1 coluna, colapsada por padrão, badge com contagem total (soma das 6).
- Ao expandir: lista única (não sub-colunas), cada card mostra badge do status original
  (ex.: "Perdido", "Descartado", "Em espera") — cor/label do `STATUS_PROSPECCAO_LABEL` ou
  `ESTAGIO_LABEL` conforme o lado.
- `reabrirNegociacao` (já existe, F5.11) continua disponível no card dentro do grupo.
- Prospecção não tem hoje um "reabrir" equivalente pros 3 status dela — checar se falta ação
  simétrica ou se a reativação-por-drag (B.2) já cobre o caso (arrastar de volta pra Levantamento).

### B.4 — Fallout a atualizar (não esquecer)

- `scripts/audit-crm-performance.ts` / `scripts/explain-crm-performance.ts` (F6.11): mediam "Kanban
  de prospecção" e "Kanban de negociação" separados — revisar pra refletir o board único e as
  colunas novas; os `EXPLAIN` continuam precisando bater índice, não Seq Scan.
- `docs/crm/08-aceite-e2e.md` e `smoke:crm-e2e`: os 20 critérios apontam pras rotas atuais — emendar
  pra rota nova (ou confirmar que o redirect mantém os critérios válidos).
- Notificações/automações (F7.3) escrevem `/comercial/negociacoes?negociacao=<id>` — confirmar que o
  redirect preserva a query e o board rola/destaca o card (comportamento que já existe hoje em
  `NegociacaoBoard`, só migra de rota).

## Fase C — Modal por card

- Rota interceptadora `@modal/(.)comercial/[id]` pro lado do lead (reaproveita o que
  `lead-detalhe-view.tsx` já carrega, hoje em página cheia).
- Equivalente novo pro lado da negociação — **hoje não existe detalhe próprio de negociação**, só o
  card no board. Precisa de rota (`/comercial/negociacao/[id]` ou sob o mesmo namespace) + o RSC que
  carrega dados/anexos/versionamento/propostas/timeline/follow-ups equivalente ao do lead.
- `/comercial/[id]` (e o novo de negociação) sobrevivem como página cheia — fallback sem JS, link
  direto, e é o que os deep links de notificação já apontam.
- Formulário de edição dentro do modal: campos longos em `DialogBody` (cabeçalho/rodapé fixos,
  conteúdo rola) + `CollapsibleSection` com `resumo` pros grupos opcionais — padrão já usado no
  resto do sistema.
- Cuidado já conhecido no projeto: **nunca** `await confirm()` dentro de `startTransition` — sempre
  confirmar antes de chamar `start()` (React 19 suspende o `setState` da action; há um teste-guarda
  varrendo `src/` pra isso).
- Base-ui: triggers usam `render={<Comp />}`, não `asChild`. `Select.onValueChange` devolve
  `string | null`.

## Fase D — Campos do card

Já decidido nas perguntas de esclarecimento:

| Campo | Prospecção | Negociação |
|---|---|---|
| Cliente / Demanda | sempre | sempre |
| Temperatura | sempre | sempre |
| Campanha | sim | não |
| Probabilidade | não | sim |
| Valor + desconto | valor estimado (já existe) | valor + desconto (campo já existe no schema) |
| Parceiro | sim (já vem na query, só falta renderizar) | sim (idem) |
| Responsável | avatar (`User.image`), sem nome | idem |

- `LeadProspeccao`/`CardNegociacao` (`queries.ts`) já trazem `parceiro` — só adicionar ao card.
  Adicionar `responsavel.image` ao select de `LeadProspeccao` (hoje só `CardNegociacao` tem
  `responsavel`; conferir se prospecção também tem responsável pra mostrar).
- Avatar sem nome visível precisa de `title`/`aria-label` com o nome completo — ícone/imagem sem
  texto alternativo é achado certo do `a11y-auditor`.
- Campanha: conferir se `LeadProspeccao` já seleciona `campanha` (grep não confirmou) — se não,
  adicionar ao select.

## Fase E — Agenda de follow-ups

Decisão: os dois.

- **Filtro comercial na agenda geral** (`modules/agenda/queries.ts`, `components/agenda/agenda-view.tsx`):
  fecha a pendência que o próprio ADR-17 já previu ("toda query de agenda precisa ganhar filtro por
  tipo, senão follow-up comercial polui a visão de reuniões"). Adicionar filtro por tipo/origem
  (comercial vs demais compromissos).
- **View dedicada em `/comercial`**: reusa a mesma fonte (`Compromisso` ancorado em lead/negociação),
  filtrada só pro comercial, dentro do layout da Fase A.

## Fase F — Investigar erro ao editar card em prospecção

Auditoria mostra 4-5 falhas seguidas de "Editou lead" no mesmo formulário (Lúcio Sena, produção,
2026-09-16 ~16:14-16:18). **Não corrigir nesta fase — só diagnosticar.**

Hipótese mais provável, pela evidência (falha imediatamente após editar um lead com e-mail vazio no
diálogo): `editarLeadSchema = criarLeadSchema.extend({ id })` herda toda validação de criação —
se `email` usa `.email()` sem aceitar string vazia (`.or(z.literal(""))`), salvar com e-mail em
branco falha no Zod antes de chegar no `service`, e vira mensagem genérica + `AuditLog` de falha.
Mesma classe de risco no sentinel `SEM_PARCEIRO` passando por `validarParceiroId`.

Próximos passos concretos:
1. Ler `schemas.ts:1-40` (`criarLeadSchema`) e conferir a regra de `email`.
2. Pedir ao dono 1 registro de `/auditoria` com o erro real, ou reproduzir localmente editando um
   lead com e-mail vazio pelo mesmo diálogo.
3. Só depois de confirmado, decidir o fix (schema aceitar vazio, ou UI não mandar string vazia).

## Fase G — Elaboração de propostas (em aberto)

Não desenhar ainda. Registrado o incômodo: o sistema de propostas hoje é rígido em valor/prazo, mas
o Comercial trabalha com textos grandes de escopo por disciplina, descrição de etapas, textos-padrão
e variações por projeto — que não têm onde morar hoje. Aguardando exemplos reais de propostas
enviadas pra desenhar a partir de casos concretos, não de suposição.

Nota de guarda-corpo já registrada em ADR-21 §6: a saída renderizada de `/a/proposta/[token]` está
**congelada** — o PDF imprime essa página ao vivo, então qualquer mudança ali reescreve
retroativamente o PDF de propostas já enviadas. Qualquer redesenho de conteúdo (Fase G) precisa de
decisão própria sobre o que acontece com a página pública, separada da revisão do editor interno.

## Ordem sugerida de execução

A (isolada, baixo risco) → F (só investigação, informa se G3/D têm dependência) → B (a mudança
estrutural, precisa do ADR aprovado) → D (campos, anda junto com B pois already toca os boards) →
C (modal, consome o que B deixou) → E (agenda, independente, pode entrar em paralelo com C) → G
(aberta, aguarda insumo).

## Documentação a manter em dia

- `CLAUDE.md`, parágrafo "Comercial / CRM": hoje diz "607 linhas, sem `service.ts`, zero testes" —
  desatualizado (existe `service.ts`, 2872+ testes no repo, F7 fechado 2026-09-02). Corrigir junto,
  fato e não feature.
- `docs/crm/06-progresso.md` ganha entrada nova quando a Fase B/C fechar (mesmo formato das
  entradas existentes).
