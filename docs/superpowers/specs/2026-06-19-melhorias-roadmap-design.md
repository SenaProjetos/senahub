# Roadmap de Melhorias do SenaHub — Design

> **Data:** 2026-06-19
> **Origem:** [docs/MELHORIAS_SENAHUB.md](../../MELHORIAS_SENAHUB.md) (análise de UX/UI/funcionalidades, 19/06/2026)
> **Objetivo:** Transformar os ~80 itens da análise num roadmap priorizado em ondas (M0–M6),
> filtrando o que já está entregue e o que conflita com decisões fixas do projeto.
> Cada onda vira `spec → plano → execução` em ciclo próprio, uma por vez.

---

## 1. Premissas e decisões (acordadas com o usuário)

A análise original foi escrita observando a UI rodando, sem ler o código. Por isso parte dos
"problemas" é (a) já resolvida no backend, faltando só UI, ou (b) preferência que contraria
decisões fixas do HANDOFF. Decisões tomadas nesta sessão:

1. **Manter arquitetura atual.** Não adotar `react-hook-form` nem `SWR`. Forms = Server Actions
   + Zod no `defineAction`; leitura = Server Components + cache LRU em memória. Os itens 6
   ("padronizar react-hook-form") e "Cache/SWR" são **descartados** — o feedback de form é polido
   com o que já existe (`sonner`, `fieldErrors` do `defineAction`, estado de loading no botão),
   sem nova abstração.
2. **Integrações externas: alternativa on-prem onde der.** A decisão fixa é infra nativa Windows,
   sem nuvem. Logo:
   - Google Calendar/Outlook OAuth → **substituído por export `.ics`** (download local).
   - WhatsApp Business, DocuSign/ClickSign/D4Sign, storage S3/Drive/Dropbox → **descartados**
     (assinatura digital fica como item opcional on-prem em M6, sem SaaS).
3. **Bugs que não reproduzem por inspeção entram em M0 com passo explícito de reprodução.**

---

## 2. Triagem — estado real vs. análise

### 2.1 Já entregue (gap, se houver, é só de UI)

| Item da análise | Estado no código | Vira |
|---|---|---|
| Email (SMTP) — §5.1 | `lib/mail.ts` (nodemailer) já em uso | nada / usar nos novos alertas |
| OFX + conciliação — §5.1 | `lib/ofx.ts` (Onda 2) | nada |
| PNCP (Licitações) — §5.1, §3.18 | actions + alerta + campos no detalhe (commits recentes); UI no `licitacao-detail-view` | M6: completar importação automática |
| Alertas de vencimento (certidões/licitações/qualidade/prazos) — §3.17/§3.18/§3.19 | jobs pg-boss em `lib/jobs.ts` rodam D-30/15/7, 15/7/1 etc. | M4: expor **badge/alerta na UI** (job já existe) |
| Busca global Ctrl+K — §4.2 | backend `modules/busca/actions.ts` existe | M2: verificar/ligar UI Ctrl+K |
| Toast/feedback — §4.4 | `sonner` em ~85 arquivos | gap é pontual (folha-lote) → M0/M1 |
| bottom-nav mobile — §4.1 | `components/shell/bottom-nav.tsx` existe | M6: virar drawer/offcanvas |

### 2.2 Descartado (conflita com decisão fixa)

react-hook-form · SWR · storage S3/Drive/Dropbox · WhatsApp Business · DocuSign/ClickSign/D4Sign
(SaaS) · Google Calendar/Outlook OAuth (→ vira `.ics` em M5).

### 2.3 Contradição da análise a resolver

§7 diz "Módulo Funcionários completo (atualmente inacessível)", mas a página existe e parece
correta (`app/(dashboard)/rh/funcionarios/page.tsx` → `requireRole(...HR_ADMIN_ROLES)` →
`FuncionariosView`). Tratado como **bug de acesso a reproduzir** (M0), não como módulo a construir.

---

## 3. Ondas

Ordem por valor × risco × dependência. M1 (fundação) destrava visualmente M2–M5. Cada item
referencia a seção da análise original.

### M0 — Bugs e correções
- `/rh/funcionarios` redireciona errado — **reproduzir** (provável `requireUser/requireRole`
  mandando p/ `/sem-permissao` ou `/trocar-senha`; análise diz `/auditoria`) e corrigir. §2.1
- `gerar-folha-lote` (FolhaProjetista): server já lança `ActionError` ("Nenhum pagamento liberado…").
  Falta **mostrar o erro na UI** (toast) na tela de Folha de Projetistas. §2.3, §3.12
- Página **404 personalizada** (`not-found.tsx`) + `/clientes/[id]` inválido → redirect p/ listagem
  com toast. §2.2
- Dashboard "Receita 6 meses": meses passados com "Previsto: R$ 0" — revisar query (separar
  "previsto original" de "previsto em aberto"). §2.4
- Chat: status online do próprio usuário incorreto; carregar últimas N mensagens ao abrir canal —
  **reproduzir e corrigir** (código de unread/histórico já existe). §3.8
- Ponto: timer não persiste ao trocar de aba — persistir em `localStorage`. §3.9
- Remover textos de roadmap interno visíveis na UI (ex.: "Integra com o Financeiro na Onda 2"). §3.4

### M1 — Fundação UX (reaproveitável)
- Componente `<EmptyState>` padrão (ícone SVG, título, descrição, CTA) + rollout em pranchas,
  chat `#geral`, planejamento vazio, documentos, etc. §3.3/§3.8/§3.14/§4.3
- `AlertDialog` de confirmação consistente para ações destrutivas (ex.: lixeira de documentos). §3.14/§4.4
- Estado de loading visível nos botões de ação (padrão atual, sem nova abstração de form). §4.4
- Helpers de formatação: moeda e data padronizadas por contexto (`lib/utils`). §4.7
- Tags de status com **ícone + cor** (não só cor) para daltonismo. §4.6
- `aria-label` nos emojis do clima (RH) e demais ícones interativos. §3.10/§4.6

### M2 — Listagens (padrão de tabela)
- Ordenação por clique no cabeçalho (Projetos, Clientes, Tarefas). §3.2/§3.6
- Filtros multi-seleção: Projetos (cliente/responsável/disciplina), Clientes (tipo/cidade/situação),
  Tarefas (projeto/responsável/período), Comercial (responsável/origem), Recursos (projeto). §3.2/§3.4/§3.5/§3.6/§3.16
- Paginação **cursor-based** genérica (estender o helper de `licitacoes/pagination.ts` para
  Clientes, Projetos, Auditoria, Folha). §6/§3.4/§3.12
- Busca full-text em Tarefas e Chat (reusar `modules/busca`); verificar/ligar Ctrl+K global. §3.6/§3.8/§4.2
- Toggle lista/kanban (Projetos, Tarefas). §3.2/§3.6

### M3 — Dashboard e navegação
- KPIs clicáveis com filtro pré-aplicado (Projetos ativos, Entregas pendentes). §3.1/§7
- Card "Contas vencidas" + KPI de inadimplência, link p/ `/financeiro#aging`. §3.1
- Tooltips/legendas e rótulo de eixo Y nos gráficos (evolução, despesas, qualidade, projeção). §3.1/§3.13/§3.19
- Ocultar card de citação do dia (preferência). §3.1
- Menu lateral agrupado/colapsável por grupo + breadcrumb consistente. §4.1

### M4 — Alertas e badges (UI sobre jobs existentes)
- Badge/alerta vermelho para licitações com prazo hoje/vencido. §3.18
- Alerta visual de certidões a vencer (30/15/7) no Jurídico; preview de status. §3.17
- Qualidade: alerta por threshold de retrabalho + linhas "Maiores atrasos" clicáveis p/ projeto. §3.19
- Badges de contagem: quicklinks do Financeiro, "Arquivos (n)"/"Revisões (n)" em Projetos,
  não-lidas no Chat, progresso de onboarding (X/Y). §3.13/§3.2/§3.8/§3.11
- Qualidade ↔ Projetos: atraso de disciplina gera alerta no detalhe do projeto. §5.2

### M5 — Módulos (aprofundamento)
- **Comercial:** página dedicada `/comercial/:id`; "motivo da perda" obrigatório ao mover p/ Perdido;
  "Agendar follow-up" → Agenda; histórico de notas no modal. §3.5
- **Agenda:** vistas semanal/diária; lembrete configurável por compromisso; **export `.ics`**. §3.7
- **Ponto:** "Solicitar correção" (colaborador); export do espelho (PDF/Excel); exibir todos os dias
  do mês; tooltip do cálculo do banco de horas. §3.9
- **RH:** "Minhas solicitações" (histórico); upload customizado no abono; toast de confirmação. §3.10
- **RH Admin:** prazo de fechamento do banco de horas; feedback 1:1 estruturado; histórico de NFs
  validadas. §3.11
- **Folha CLT/Projetistas:** histórico paginado; preview do holerite antes de fechar. §3.12
- **Financeiro:** subcategorias no donut de despesas; seletor de período; DRE resumido; tooltip da
  projeção de caixa. §3.13
- **Documentos:** categorias/filtros; documentação de variáveis/tokens; preview do template. §3.14
- **Planejamento:** CTA "Iniciar planejamento"; export do Gantt (PDF/PNG); destacar caminho crítico;
  confirmação detalhada em "Aplicar ao projeto". §3.15
- **Recursos:** view timeline/heat map; botão "Rebalancear"; filtro por projeto. §3.16
- **Jurídico:** preview inline de PDFs. §3.17
- **Suporte:** "Meus tickets" vs "Todos"; prioridade/categoria; notificação ao criador; SLA visível. §3.20
- **Configurações:** reorganizar em grupos; **registrar alterações no log de auditoria**; preview do
  aviso geral; seção de Integrações (on-prem: SMTP). §3.21
- **Auditoria:** export CSV/Excel; filtro de período; mapear nomes técnicos → descrições pt-BR;
  destacar linhas "falha". §3.22
- **Clientes:** aba "Histórico" (timeline); "+ Contato" no detalhe; campo categoria. §3.4
- **Projetos:** duplicar projeto; histórico de status por disciplina; progresso geral no topo;
  "Inputs do projeto" colapsável quando vazia. §3.2

### M6 — Plataforma e técnico
- Error boundaries por módulo (erro no Financeiro não quebra o Chat). §6
- Lazy loading de rotas + tree-shaking de gráficos (bundle). §6
- Responsividade: kanban/Gantt em telas menores; sidebar → drawer/offcanvas no mobile. §4.5
- Acessibilidade: auditoria de contraste WCAG AA; verificação completa do dark mode. §4.6
- Unificar Planejamento ↔ Tarefas (**investigar** se compartilham fonte de dados; unificar se não). §5.2/§7
- Financeiro ↔ Projetos: lançamento avulso referenciar projeto automaticamente. §5.2
- PNCP: completar importação automática de editais (job). §5.1
- Assinatura digital **on-prem** (registro/carimbo próprio, sem SaaS) — opcional. §3.17/§5.1
- PWA com suporte offline para registro de ponto. §7

---

## 4. Itens fora do roadmap (registro)

Descartados por decisão (§2.2): react-hook-form, SWR, S3/Drive/Dropbox, WhatsApp Business,
DocuSign/ClickSign/D4Sign (SaaS), Google Calendar/Outlook OAuth.

---

## 5. Próximos passos

1. Este roadmap é o índice mestre. **Não** se executa de uma vez.
2. Para cada onda: `spec-phase` (ou brainstorming focado) → `writing-plans` → execução com commits atômicos.
3. Começar por **M0 (bugs)** — menor risco, destrava confiança. Os bugs com "reproduzir" exigem
   `systematic-debugging` antes do fix.

---

## 6. Estado de execução

### M0 — executada em 2026-06-19 (branch `feat/melhorias-m0`)

| Item | Veredito | Commit |
|---|---|---|
| 2.3 folha-lote / ruído no audit | corrigido — `ActionError` agora vira `resultado: rejeitado`, não `falha` | `fix(auditoria): classifica ActionError como 'rejeitado'` |
| 2.4 dashboard previsto zerado | corrigido — `serieReceita` usa previsto original por vencimento | `fix(dashboard): previsto original…` |
| 3.8 chat presença | corrigido — snapshot inicial de presença ao conectar (histórico já carregava) | `fix(chat): snapshot inicial de presença` |
| 2.2 404 | corrigido — `app/not-found.tsx` (clientes/[id] já usava `notFound()`) | `feat(app): página 404 personalizada` |
| 3.4 texto de roadmap na UI | corrigido — removido de `clientes/[id]` | `fix(clientes): remove texto de roadmap interno` |
| 2.1 `/rh/funcionarios` redirect | **não reproduzido por inspeção** — página/query/view corretas, nav OK; repro interativa (login admin) pendente | — |
| 3.9 timer de ponto | **não reproduzido por inspeção** — `Cronometro` deriva de `aberta.inicio` do servidor e recalcula no remount; repro interativa pendente | — |

**Verificação:** `tsc --noEmit` limpo + `npm test` (267 testes). Verificações visuais que exigem
browser/sessão (gráfico de receita, presença com 2 usuários, página 404, chat) e a repro
interativa de 2.1/3.9 ficam para validação do usuário.

### M1 — Fundação UX ✅ (mergeada em master, 2026-06-19/20)
- M1.0 primitivos: `EmptyState`, `ConfirmDialog`+`useConfirm`, `StatusBadge`, `Button loading`, formatadores `brl/brlInteiro/formatarData/formatarMesCurto/formatarDiaMes` (com testes).
- M1.1 moeda: 51 arquivos → `brl`/`brlInteiro`; `licitacoes/_shared` reexporta de utils.
- M1.2 data: 38 arquivos → helpers; one-offs (weekday/mês-extenso/dia-mês-curto) preservados.
- M1.3 EmptyState: ~78 estados vazios em 63 arquivos (ícone/título/CTA por tela).
- M1.4 ConfirmDialog: 4 `window.confirm` → `useConfirm`.
- M1.5 StatusBadge+aria: 16 arquivos (cor+ícone) + aria-labels no clima RH. **Parcial:** badges de status de `projetos` (disciplina-card, projetos-view) ainda no `<Badge>` antigo (agente caiu por limite) — compila/funciona, adoção incremental.

### M2 — Listagens ✅ núcleo (mergeada)
- M2.0 primitivos: `parseListParams` (testado) + `useSetParams` + `<SortableHead>` + `<Pagination>` (offset, `PAGE_SIZES`).
- M2.1 Projetos: filtros (cliente/responsável/disciplina/situação) + sort + paginação server-side.
- M2.2 Clientes: `listarClientesPaginado` + filtros (tipo/situação/UF) + sort + paginação (mantido `listarClientes` array p/ 5 consumidores).
- M2.3 Tarefas: filtros (projeto/responsável/período) + busca, client-side no kanban com estado na URL.
- **Adiado:** M2.4 (Comercial/Recursos filtros, paginar Auditoria/Folha), M2.5 (toggle lista/kanban), verificar Ctrl+K.

### M3 — Dashboard & nav ✅ (mergeada)
- KPIs clicáveis (filtro pré-aplicado) + card "Contas vencidas" + âncora `#aging`.
- Citação do dia dispensável (localStorage). Sidebar com grupos colapsáveis (localStorage). Breadcrumb no header. Rótulo no gráfico de tendência.

### M4 — Alertas & badges ✅ parcial (mergeada)
- **Feito:** alerta vermelho de prazo de proposta (vencido/hoje) em Licitações.
- **Já existiam (roadmap impreciso):** linhas "Maiores atrasos" da Qualidade já linkam ao projeto; alerta de vencimento de certidões no Jurídico (`badgeValidade`: vencida/vence em Nd/ok); badges de não-lidas no Chat.
- **Pendente (polish):** badges de contagem em quicklinks do Financeiro e botões Arquivos/Revisões em Projetos; progresso X/Y de onboarding; alerta de atraso de disciplina no detalhe do projeto.

### M5 — Módulos (aprofundamento) ✅ (mergeada; via subagentes em 3 batches)
- **Auditoria:** filtro de período, export CSV (rota), ações legíveis (~200 labels), destaque de falha.
- **Agenda:** vistas semanal/diária + export `.ics` (helper puro + testes) — on-prem (substitui Google Calendar).
- **Ponto:** espelho com todos os dias do mês, export CSV, tooltip do banco de horas.
- **Projetos detalhe:** progresso geral (PESO_STATUS centralizado), duplicar projeto (action), inputs colapsável quando vazio.
- **Financeiro:** seletor de período, DRE resumido, subcategorias no donut (hierarquia paiId), tooltip de projeção.
- **Documentos:** busca/filtro de modelos, doc de variáveis/tokens, preview.
- **Suporte:** filtro meus/todos, SLA visível (date-fns), notifica autor na mudança de status.
- **Configurações:** grupos, preview do aviso, seção de integrações on-prem (status SMTP/VAPID).
- **Comercial:** página `/comercial/[id]`, histórico de notas no modal, follow-up → Agenda (`criarCompromisso`).
- **RH (colaborador):** "Minhas solicitações", upload customizado de atestado.
- **RH admin:** progresso de onboarding X/Y, histórico de NFs validadas, prazo do banco de horas.
- **Folha:** histórico paginado (primitivo `Pagination`), preview do holerite antes de fechar.
- **Planejamento:** CTA "Iniciar planejamento", caminho crítico (CPM, helper + teste) no Gantt, confirmação detalhada ao aplicar.
- **Recursos:** filtro por projeto, heatmap mensal de carga, sugestão de rebalanceamento.
- **Jurídico:** preview inline de PDFs (rota com `?inline=1`).
- **Clientes:** "+ Contato" no detalhe (action `adicionarContato`), timeline de histórico (agrega projetos/propostas/lançamentos).
- **Adiado (precisa migração de schema):** motivo da perda obrigatório (Lead), categoria do cliente, prioridade/categoria de ticket.

### M6 — Plataforma/técnico ✅ parcial (mergeada)
- **Feito:** error boundaries por módulo (`error.tsx` em 20 segmentos + `ErrorBoundaryCard`) — erro num módulo não derruba o app; shell permanece.
- **Já existia:** lançamento avulso já referencia projeto (filtro + exibição na view de contas a pagar/receber).
- **Pendente:** responsividade (sidebar→drawer mobile, scroll contido de kanban/gantt); lazy loading/bundle (dynamic imports do editor/charts); auditoria de acessibilidade WCAG AA + dark mode; completar importação automática de editais do PNCP (job).
- **Adiado (decisão/risco):** unificar Planejamento ↔ Tarefas (exige investigação + provável migração de schema); assinatura digital on-prem (decisão de negócio); PWA com offline para ponto (escopo grande).

---

## 7. Pendências e decisões para o usuário (resumo)

**Itens que exigem migração de schema** (não feitos para não rodar `prisma migrate` de forma autônoma):
motivo-da-perda (Lead) · categoria do cliente · prioridade/categoria de ticket · (opcional) reforço de `projetoId` já existe em Lancamento.

**Decisões de negócio/arquitetura adiadas:** unificação Planejamento↔Tarefas (pode mudar modelo de dados); assinatura digital on-prem; PWA offline.

**Verificação visual (browser) pendente do usuário** em tudo que é UI (não verificável sem sessão/navegador).

> Toda a execução manteve `master` verde (tsc 0 + `npm test`) a cada merge. Sem `git remote` configurado — nada foi pushado.

---

## 8. Decisões executadas (2026-06-20, branch `feat/decisoes` → master)

Após rodada de decisão com o usuário, implementado:
- **Schema + migração** `20260620155615_melhorias_...` (campos nullable, aditiva): `Lead.motivoPerda`, `Cliente.categoria`, `TicketSuporte.prioridade`/`categoria`, novo model `AceiteDocumento`.
- **Motivo da perda** (Comercial): exigido ao mover lead para "Perdido" (drag e select), exibido no detalhe/modal.
- **Categoria do cliente**: campo no form + filtro server-side na listagem + exibição.
- **Prioridade/categoria de ticket** (Suporte): selects ao abrir, StatusBadge de prioridade, filtro.
- **Assinatura on-prem** (Jurídico): action `registrarAceite` (SHA-256 do arquivo + quem/quando), lista de aceites por versão.
- **Planejamento ↔ Tarefas — link leve:** action `gerarTarefaDeEap` + botão "Gerar tarefa" na EAP (one-way, sem unificar).
- **M6:** sidebar→drawer no mobile (Sheet) + boards com scroll contido; lazy load do editor de documentos (`next/dynamic`); contraste `--muted-foreground` ajustado p/ AA + foco visível na navegação.

**Ainda pendente / precisa de você:**
- **PNCP import automático:** a integração atual é manual (nº PNCP + marcar publicado). Auto-importar editais exige (1) **critério de negócio** (quais órgãos/UF/modalidades/palavras-chave vigiar) e (2) confirmar a **API pública vigente do PNCP**. Não construído (evita poller especulativo). Aguarda decisão de critério.
- **PWA offline para ponto:** não selecionado nesta rodada.
- **Verificação visual (browser)** de toda a UI continua pendente do usuário. Sem `git remote`.
