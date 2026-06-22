# SenaHub Remake — Handoff / Estado do Projeto

> Documento de continuidade. Permite a qualquer dev/IA retomar o trabalho do ponto exato.
> **Atualizado em 2026-06-22 (sessão 3c).** Ondas 0–5 + OD + auditorias + infra + testes.
> 55 arquivos de teste, 450 testes passando, tsc limpo.
> Novidades (sessão 3c): busca global inclui licitações e propostas; CLT_ROLES/PROJETO_MEMBRO_ROLES/PJ_ROLES
> centralizados em lib/roles.ts (P-10); N-27 atalho "Novo lançamento" no projeto; N-50 filtro "Meus projetos";
> P-49 filtro "com atraso" no cronograma geral; fechamento automático de banco de horas (dia 1 do mês, job pg-boss).
> 70 migrações; prisma generate executado.
> Próximo: deploy (§5.4), P1 (custo real — Opus 4.8), paginação real do Estúdio (§5.4b).

---

## 1. O que é

Reconstrução do zero do SenaHub (ERP sob medida para escritório de engenharia BIM) em
`C:\SENA_ADM\SENAHUB\SENAHub-remake`. O sistema antigo (`..\SENAHub`, Next 15 + Docker/WSL2/Redis)
continua rodando em paralelo até o cutover. Relatório do sistema antigo: `docs/RELATORIO-SISTEMA.md`.

**Decisões fixas (acordadas com o usuário — não rediscutir):**
1. **Banco limpo** — sem migração de dados; re-cadastro manual no cutover.
2. **Stack:** Next 15 + React 19, monolito modular (Server Actions + camada de serviço; rotas REST só para streaming/multipart/token público).
3. **Infra nativa Windows** — sem Docker/WSL2/Redis/Nginx. PostgreSQL 17 nativo (porta **5433** em dev), pg-boss (jobs), cache LRU em memória, Cloudflare Tunnel mantido.
4. **Visual "Marca Registrada"**: paleta da marca (Navy `#1C2D58`, Steel `#576980`, Slate `#6E838B`, Mist `#A8B2B4`, Fog `#CACAC8`), bordas retas 2px, fundo mosaico SVG da marca (`public/MARCA/background_M2.svg` escuro / `background_L2.svg` claro, **211×179px inteiros** para não gerar linhas de emenda), Schibsted Grotesk + Red Hat Mono, tema claro+escuro (next-themes, dark default). Mockup aprovado: `docs/design/direcao-final.html`.
5. Convenções: commits semânticos pt-BR; código em inglês, UI em português; mobile-first; PWA; **auditoria obrigatória em toda mutação**.

## 2. Setup de desenvolvimento

```
npm install                # postinstall roda prisma generate
npm run dev                # Next só (sem socket/jobs) — chat NÃO funciona aqui
npm run dev:server         # server.ts completo (Next + Socket.io + pg-boss) — usar p/ chat
npm run build              # next build --turbopack
npm test                   # vitest (55 arquivos, 450 testes)
npm run db:migrate         # prisma migrate dev
npm run db:seed            # admin + permissões + catálogos (idempotente)
npm run seed:demo          # dataset de demonstração (uso corrente) — limpa dados de negócio e recria; usuários demo senha Demo@2026
npm run admin:reset-senha  # reseta senha do admin p/ SenaHub@2026 (hash better-auth + troca obrig.)
npm run smoke:onda1|onda2|onda3|onda3efg|onda4|onda5   # smokes e2e contra o banco de dev
```

- **Banco dev:** PostgreSQL 17 nativo Windows, porta **5433**, db `senahub_remake` (`.env` → `DATABASE_URL`). O 5432 é o Docker do sistema ANTIGO — não tocar.
- **Admin seed:** `tadrio@senaprojetos.com.br` / senha inicial `SenaHub@2026` (troca obrigatória no 1º login).
- **Storage:** `STORAGE_BASE_PATH` no `.env` (uploads de projeto, atestados, NFs).
- **NUNCA** rodar `next build` com `next dev` ativo no mesmo `.next` (corrompe; se acontecer: apagar `.next`).

## 3. Arquitetura

```
src/
  app/                  # (auth)/login, (dashboard)/<módulos>, api/ (multipart/token/streaming)
  modules/<dominio>/    # schemas.ts (Zod) · queries.ts (server-only) · actions.ts ("use server") · service.ts
  components/<dominio>/ # client components do módulo
  components/ui/        # shadcn (base-ui, NÃO Radix — triggers usam render={}, não asChild)
  lib/                  # auth, session, permissions, with-action, audit, storage, push, notificar,
                        # mail, jobs, socket, cache, cep, ofx
server.ts               # Next + Socket.io + pg-boss num processo (tsx, tsconfig.server.json)
prisma/schema.prisma    # + prisma.config.ts (Prisma 7: URL fica no config, não no schema)
```

**Pilar central — `defineAction` (`lib/with-action.ts`):** toda Server Action passa por
sessão → gate de roles → permissão fina (`recurso:ação`, tabela `Permissao`, cache LRU 10min, admin bypass) →
Zod → execução → **auditoria automática** (`AuditLog`). Erros de negócio: `throw new ActionError("msg")`.

**Escopo de dados:** perfis globais (`admin`,`supervisor`) veem tudo; demais filtrados
(`escopoProjeto` em `modules/projetos/queries.ts`; extrato próprio no financeiro; RH gate por
`HR_ADMIN_ROLES` = admin+supervisor+administrativo — padrão `{ modulo:"rh", roles: HR_ADMIN_ROLES }`).

**8 perfis:** admin, supervisor, administrativo, clt, estagiario, projetista_pj, freelancer, cliente.
Matriz fina configurável em Configurações→Permissões (catálogo em `lib/permissions-catalog.ts` + seed).

## 4. Estado — ondas entregues (0–3, todas verificadas)

| Onda | Conteúdo | Verificação |
|---|---|---|
| **O0** | Design system + shell (sidebar colapsável, bottom-nav, header), better-auth (1º acesso troca senha, reset notifica admin, rate-limit), usuários+permissões, defineAction+auditoria (+visualizador /auditoria), notificações (sino+web-push+som)+PWA, server.ts (Socket.io+pg-boss, job backup pg_dump) | smoke O0 |
| **O1** | Clientes (PF/PJ, CEP ViaCEP), Projetos (numeração atômica **AAXXXX**, disciplinas status independente, multi-responsáveis, prazos, revisões RVxx, escopo), Uploads A/B (arquivo-a-arquivo, não-suportado→OUTROS, SHA-256, versões, ZIP, anti-path-traversal), **validação→PagamentoProjetista** (regra de ouro, split por responsável, notifica), Inputs+link público token | `smoke:onda1` |
| **O2** | Financeiro: plano de contas hierárquico (1.x/2.x semeado), cadastros, **Lancamento unificado** (previsto=a pagar/receber, confirmado=caixa/DRE; recorrência; valorEfetivo parcial), folha projetistas (**pagar→Lancamento confirmado por tipo**: PJ→2.01, freelancer→2.02, CLT→2.03, estag→2.04), fluxo de caixa, **OFX+conciliação** (dedup fitid, auto-match valor/sinal/±5d), DRE+indicadores+Excel | `smoke:onda2` |
| **O3** | Chat (canais geral/projeto/disciplina auto-criados, DM, presença, status, **push+som em toda conversa**; freelancer/cliente fora do #geral), Ponto (**troca de projeto na jornada**, banco de horas, escala, espelho, rateio CLT por projeto), RH (abono+atestado, férias, clima anônimo, **folha CLT→2.03 com reabrir**, holerite e-mail, onboarding templates, NF-PJ upload+validação) | `smoke:onda3`, `smoke:onda3efg` |

| **OD** | **Estúdio de Documentos v1** (`/documentos`): editor visual de modelos em **bandas** (cabeçalho do relatório / cabeçalho de colunas / **detalhe que repete por linha** / rodapés), elementos com posição absoluta (label, campo, linha, retângulo, imagem) com drag/resize/snap 8px, zoom, undo/redo (Ctrl+Z/Y), atalhos (Delete, setas), painel de propriedades (texto, inserir token, x/y/w/h, fonte, negrito, alinhamento, cores, borda, travado/visível), duplicar elemento. **Tokens**: `[Campo]`, `[Fonte.Campo]`, `[Sum/Count/Avg/Min/Max(X)]`, `[Hoje]`, `[Pagina]/[Paginas]`, formatos `:c2` moeda `:d` data `:p1` percent `:n0` número (`modules/documentos/tokens.ts`, puro+testado). **Fontes de dados** dos módulos do Hub (`fontes-meta.ts` metadados client + `fontes.ts` resolução server): empresa, projeto(+disciplinas), extrato do projetista(+pagamentos), lançamentos do mês. Salvar **versiona** (DocumentoModeloVersao, restaurar). Preview com dados reais (seletor de parâmetros) + **Imprimir/PDF** (print CSS A4 em globals.css, classes `doc-pagina`/`doc-no-print`/`doc-print-area`). Permissões `documentos:ver|gerir`. Modelo exemplo no seed ("Relatório do projeto"). | testes tokens (41 total) |

| **O4** | **Comercial/CRM** (`/comercial`, `modules/comercial`): funil Kanban com **@dnd-kit** (etapas semeadas: Orçamento→Em negociação→Proposta enviada→Contratado→Perdido; arrastar move etapa), leads (atividades/notas, **converter→cliente**), meta mensal editável com barra de progresso (realizado = propostas aceitas no mês). **Propostas** `PR-AAXXXX` (sequência atômica): itens por disciplina, condições **% ou R$**, copiar ("— cópia"), **versões snapshot** a cada salvar, **tabela de preço R$/m² × área** (`/comercial/tabelas`, botão "Aplicar"), status rascunho/enviada/aceita/recusada. **Página pública** `/a/proposta/[token]` (só totais, sem unitários) com **pixel** `/api/t/proposta/[token]/pixel` (grava ip/UA, badge de aberturas), **envio por e-mail** com link. Fonte **"proposta"** no Estúdio de Documentos. **Aceitar → cria projeto AAXXXX + disciplinas (valores) + canais de chat (`ensureCanaisProjeto`) + notifica** — zero redigitação. Permissões `comercial:ver\|gerir`. | `smoke:onda4` |

| **O5** | **Complementares** (commits `fix(auth)` + `feat(onda-5)`): **Tarefas** (`/tarefas`, dnd-kit, colunas configuráveis `TarefaStatus`, **dependências com bloqueio de conclusão**, checklist, multi-responsáveis, prazos, notifica). **Agenda** (`/agenda`, compromissos+convites+confirmação, **prazos de projeto/disciplina no calendário marcação única**, notifica convidados). **Jurídico** (`/juridico`, docs por projeto/cliente **versionados** upload/download, certidões tipo+validade, `juridico:ver\|gerir`). **Licitações** (`/licitacoes`, processos+docs versionados, **medição→Lancamento receita previsto cat 1.02**, **importar ganha→projeto+canais+docs ao Jurídico**, `licitacoes:ver\|gerir`). **Qualidade** (`/qualidade`, índice de retrabalho por disciplina, snapshots mensais, **KPIs reais da home**). **Suporte** (`/suporte`, tickets+mensagens+status). **7 automações pg-boss** (`lib/jobs-handlers.ts`): prazo disciplina D-7/3/1, inadimplência D+1, certidões 30/15/7, licitações 15/7/1, lembrete ponto, snapshot qualidade mensal, resumo semanal e-mail. | tsc limpo, 41 testes |

| **O5b** | **Planejamento & Recursos**: **EAP hierárquica** + gantt de linha dupla (prevista + progresso × baseline, eixo mês, hoje), dependências FS com detecção de ciclo, definir/atualizar baseline, aplicar ao projeto, tabela WBS com desvio ±dias. Recursos: matriz pessoa×projeto, alocação %/período, superalocação (Σ%>capacidade), custo/hora. Models: `EapTarefa`, `EapDependencia`, `Recurso`, `Alocacao`. | `smoke:onda5` (8/8) |

| **Licitações F0–F11** | **Fases 0–10** (plano `docs/superpowers/plans/2026-06-18-licitacoes-estrutural.md`): config editável, eventos/datas, composição de preço, contrato+aditivos, matriz de risco, reajuste, habilitação, RT+conflito, subcontratação, sanções, viabilidade, dashboard, PNCP automático. **Fase 11**: `GerarDocumentoButton` no detalhe da licitação + modelo exemplo no seed (fonte "licitacao" já existia em fontes-meta+fontes.ts). 49 testes. | tsc limpo, testes |

| **Chat C0–C5** | **Auditoria completa do chat** (plano `docs/superpowers/plans/2026-06-21-chat-auditoria.md`, 32 achados): C0 performance (pg_trgm, índices GIN), C1 menções/ações (notifica, badge canalId), C2 arquivos (validação MIME+tamanho), C3 moderação (DM ban, silenciar), C4 busca (FTS, resultado clicável), C5 UX/PWA (SW cacheia só `immutable`, toast de nova mensagem, `presenca-inicial` socket, scroll inteligente). | tsc limpo, 391 testes |

| **Projetos P0–P6** | **Auditoria completa projetos+planejamento** (plano `docs/superpowers/plans/2026-06-21-projetos-planejamento-auditoria.md`, 115 intervenções): P0 índices+quick wins, P1 custo real (PagamentoProjetista+Servico→Lancamento), P2 receita/contrato (Projeto.valorContrato+parcelas), P3 plano×execução (EAP progresso derivado, reagendar, superalocação ciente), P4 visão geral/UX (7 abas, KPIs, kanban, gantt, donut), P5 entregas/qualidade (CRUD disciplinas, máquina de estados, catálogo, checklist, riscos, carteira CSV), P6 colaboração (notificações status, portal cliente, EVM básico, deep-link chat). | 391 testes |

| **M0–M1** | **Melhorias de produto**: M0 bugs (ActionError→rejeitado na auditoria, dashboard previsto original, chat snapshot presença, 404 personalizado), M1.0 primitivos UX (brl/formatarData/formatarDiaMes/brlInteiro, EmptyState, ConfirmDialog, StatusBadge, Button.loading), M1.2 rollout formatadores de data. | tsc limpo, 391 testes |

Fluxo crítico completo já funciona: lead→proposta→aceite→projeto→upload→validação→pagamento→folha→lançamento→caixa/DRE.

> **Login do admin (resolvido 2026-06-13):** o hash da conta do admin estava defasado e não
> validava contra `SenaHub@2026` (o seed só define a senha ao **criar** o admin; num admin
> pré-existente a senha não é reaplicada). Resolvido com **`npm run admin:reset-senha`**
> (`scripts/reset-admin-senha.ts`) — re-hasha a senha padrão pelo `auth.$context.password.hash`
> do better-auth e marca troca obrigatória. Login confirmado (200 → `/trocar-senha`).

## 5. O QUE FALTA

### 5.1–5.2 Ondas 4–5 ✅ ENTREGUES + auditorias/melhorias ✅ ENTREGUES
Ver tabela §4. Todo o backlog funcional das ondas 4–5 foi implementado e auditado.

**Restos opcionais (baixa prioridade):** anexos em proposta/suporte; etapas do funil configuráveis por UI; comentários em Tarefas; gauge de qualidade com recharts; setas de dependência no gantt; exportar EAP (Excel/PDF); workspace de rascunho no planejamento; aceite digital de cliente (N-43); preferências de notificação (N-55); canal por disciplina (N-54). Paginação real do Estúdio (engine de layout server-side — hoje é estimativa CSS-print); PDF salvo no storage após geração; régua px/mm no editor.

### 5.3 Automações (jobs pg-boss — `lib/jobs.ts` + `lib/jobs-handlers.ts`)
| Job | Regra | Estado |
|---|---|---|
| Alertas prazo disciplina | D-7/D-3/D-1 → responsáveis + gestores (08:00 diário) | ✅ |
| Lembrete ponto não batido | CLT/estagiário sem sessão aberta hoje (dias úteis 09:15) | ✅ |
| Inadimplência | Lancamento receita previsto vencido D+1 → notificação gestores | ✅ |
| Certidões | vencimento 30/15/7 → gestores | ✅ |
| Licitações | prazo de proposta 15/7/1 → gestores | ✅ |
| Snapshot qualidade | dia 1º 02:00, grava índice do mês anterior | ✅ |
| Resumo semanal | seg 07:00: entregas/a receber/a pagar → notificação + e-mail + status report por projeto | ✅ |
| Snapshot dashboard | diário 23:30, série histórica de KPIs (home: card "Evolução") | ✅ |
| Alerta risco projeto | seg 08:00: projetos em andamento acima do prazo → gestores | ✅ |
| Lembrete inputs cliente | qua 09:00: inputs sem resposta → notifica usuários cliente | ✅ |
| E-mail de cobrança | inadimplência → e-mail ao cliente (SMTP opt-in, `smtpConfigurado()`) | ✅ |
Existente: backup diário (pg_dump → pasta; conferir destino/retenção no deploy).

### 5.4 Deploy / Cutover (produção no mesmo servidor Windows 11)
1. `.env` produção: `DATABASE_URL` (db novo `senahub` prod na instância 5433 ou nova), senha forte do Postgres, `BETTER_AUTH_SECRET` forte (32+ bytes), `BETTER_AUTH_URL`/`APP_URL` = domínio público, `NODE_ENV=production`, SMTP real, `STORAGE_BASE_PATH` = pasta de rede definitiva.
2. `npm run build` + rodar `npm start` (server.ts) como **serviço Windows via NSSM** — ✅ `scripts/instalar-servico.ps1` criado (node tsx server.ts; AppDirectory; env; logs com rotação; restart on failure; idempotente). Rodar como admin no servidor após `npm install`+`npm run build`. **Não executado** (precisa nssm/prod).
3. **cloudflared** como serviço apontando `http://localhost:3000` (tunnel já existe p/ sistema antigo — criar rota nova ou trocar no cutover). LAN acessa direto `http://servidor:3000`.
4. Backup: job pg_boss diário roda `pg_dump` → pasta de rede, retenção 30 dias; testar restauração.
5. better-auth: remover `disableCSRFCheck` de dev; conferir `trustedOrigins=[BETTER_AUTH_URL]`.
6. PWA: ✅ ícones reais já existem em `public/icons/` (192/512/maskable, via `scripts/gerar-icones.ts`).
7. Re-cadastro do essencial (usuários, clientes, projetos ativos); sistema antigo vira leitura.
8. Security pass: rate-limit login ok; revisar CSP/headers (`next.config.ts`); `robots` já noindex.

### 5.4b Estúdio de Documentos — evoluções (roadmap do módulo)
A v2 está funcional (todos os elementos D1-D5 implementados); a visão é ser O gerador de TODO documento
do escritório (propostas O4, contratos, holerites, relatórios gerenciais).
- **Novas fontes de dados**: ✅ proposta, ✅ cliente, ✅ licitação/medições, ✅ holerite, ✅ DRE do mês,
  ✅ extrato projetista, ✅ empresa, ✅ CSV (datasets). Adicionar fonte = `fontes-meta.ts` + `fontes.ts`.
- **Integração nos módulos**: ✅ `GerarDocumentoButton` em projeto/proposta/holerite/licitação/cliente/RH-PJ/lançamentos mensais;
  ✅ modelo padrão por tipo (Configurações → Documentos). Sem modelo da fonte → botão oculto.
- ✅ **PDF server-side** (puppeteer-core): `GET /api/documentos/[id]/pdf` e `/api/documentos/gerados/[id]/pdf` — Chrome headless.
  ✅ **PDF salvo no storage**: `DocumentoGerado.arquivoPath` (migração 20260622070000); PDF cacheado é servido do disco.
  Falta: anexar automaticamente ao e-mail da proposta.
- ✅ **PDF público da proposta**: `GET /api/t/proposta/[token]/pdf` + botão "Baixar PDF" na página pública.
- **Paginação real**: o `doc-render.tsx` usa `alturaFixa + detalhe × nLinhas` para estimar `[Paginas]`
  (aproximação; não quebra páginas de verdade). Quebra real exigiria uma engine de layout server-side.
  Contorno: tabelas (`doc-tabela`) já repetem thead e evitam corte de linha via CSS print.
  `numerarPaginas: true` no schema usa footer nativo do Puppeteer (números exatos no PDF).
- ✅ **Todos os elementos**: label, campo, paragrafo, assinatura, linha, retangulo, imagem (upload),
  tabela (colunas, zebra, thead repete), qrcode, condicional (`condicao`).
- ✅ **UX**: multi-seleção, alinhar/distribuir (Ctrl+A*), guias, undo/redo, Ctrl+C/V/D (copiar/colar/duplicar).
- ✅ **Compartilhamento**: `visibilidade` (pessoal/perfis/global) + `donoId` + perfis autorizados.
- ✅ **DocumentoGerado** com `serie`/`numero` automático (DOC-AAXXXX), histórico, "Reabrir".
- ✅ **DXF export** (`GET /api/documentos/[id]/dxf`): carimbo ABNT, px→mm, origem CAD.
- ✅ **ABNT A0–A4**: `FORMATOS_FOLHA`, `dimensoesPx`, `margemAbntPx` em `schema.ts`.
- ✅ **Condicionais** de visibilidade de elemento por expressão.

### 5.5 Melhorias e ferramentas sugeridas (backlog futuro)
- ✅ **Busca global** (Ctrl+K): `CommandPalette` próprio (sem cmdk) sobre o Dialog base-ui — projetos/clientes/lançamentos, escopado por viewer; gatilho no header.
- **Gráficos**: ✅ dashboard (receita 6m), ✅ qualidade (tendência), ✅ resultado mensal (orçamento), ✅ **projeção de caixa 8 semanas** (fluxo de caixa, com detecção de gap) — SVG/CSS/tabela próprios (sem recharts).
- ✅ **Dashboard executivo**: KPIs reais + gráfico de receita + tabela "Projetos recentes" (estilo mockup) + card "Evolução" (snapshots).
- ✅ **/api/health** (ping de banco; rota pública; Uptime Kuma/LB).
- ✅ **Orçamento anual** (`/financeiro/orcamento`): previsto×realizado por categoria + KPIs + gráfico de resultado mensal.
- ✅ **DFC/Balanço**: `/financeiro/dfc` (DfcView, categorias editáveis) e `/financeiro/balanco` (balanço gerencial base caixa). **Paginação**: auditoria ✅ pagina; lançamentos faz filtro client-side.
- **@dnd-kit**: funil comercial (O4) e Kanban de tarefas (O5).
- **react-hook-form + @hookform/resolvers**: formulários grandes (proposta) — hoje forms são useState manual.
- ✅ **Avatares**: upload `POST /api/avatar` (sharp 256²) + serve `/api/avatar/[id]` + "Alterar foto" no menu; exibe no header/chat via `user.image`. **Validar upload no navegador.**
- ✅ **Holerite/Relatórios em PDF**: via Estúdio (fonte "holerite") + PDF server-side.
- ✅ **Preferências de notificação**: toggles por categoria (prazo_disciplina, inadimplencia, certidao, licitacao, digest_semanal, risco_projeto) em `/preferencias`; `filtrarPorCategoria` respeita opt-out em `notificar.ts`.
- ✅ **Segurança**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy em `next.config.ts`.
- ✅ **Estúdio — snapshot**: "Reabrir" usa `DocRender` com snapshot imutável (`/documentos/gerados/[id]`); PDF do snapshot via `/api/documentos/gerados/[id]/pdf`; toast "Salvar geração" tem link direto ao snapshot.
- ✅ **DFC** (`/financeiro/dfc`, método direto por atividade, classificação de categoria) e ✅ **Balanço gerencial** (`/financeiro/balanco`, posição base caixa — não é Balanço contábil formal).
- ✅ **Encargos folha (INSS/IRRF)**: motor progressivo (`lib/encargos.ts`, testado) + faixas configuráveis (Configurações → Encargos) + botão "Calcular INSS/IRRF" no holerite. **Estrutura pronta — informar os valores vigentes em Configurações.**
- **Logs estruturados** (pino) + rotação de arquivos. (`/api/health` ✅ já existe.)
- **Playwright e2e** nos fluxos críticos (login, upload→validação, lançamento).
- **2FA opcional** (plugin better-auth) para admin.
- **Multi-instância** (só se precisar): presença do chat + socket.io para Redis adapter.
- ✅ **Chat**: anexos (imagem/arquivo, `/api/chat/anexo` membership-gated), **emoji picker** e **menções** com autocomplete (`@`). **Validar no navegador (`dev:server`).**
- ✅ **Portal do cliente externo** (`/portal`): projetos read-only + disciplinas, escopo estrito por `User.clienteId` (vinculado em Configurações → Usuários). Cliente é redirecionado p/ o portal no login. Layout reusa o shell (nav filtrado).

### 5.6 Revisão de front-end — fidelidade ao mockup (`docs/design/direcao-final.html`)
Tokens (paleta dark/light, radius 2px, fundo mosaico, cores de status), fontes e fundo estão fiéis.
Já corrigido (commit `fix(design): fidelidade ao mockup`):
- **Fonte** (causa raiz): variáveis do next/font estavam no `<body>`, mas `font-sans` é aplicado no
  `<html>` → corpo caía no serif do navegador. Movidas para o `<html>`. **Conferir visualmente** que
  todo texto agora é Schibsted Grotesk (e mono = Red Hat Mono).
- **Card**: borda 1px + borda-esquerda 4px de acento (Navy) + sombra (era `ring` fraco); título 700.
- **Badge** `rounded-sm`; **chips de status** com quadradinho de acento.
- **Cabeçalho de tabela** (shadcn `TableHead`): mono 10px uppercase tracking, igualando ao mockup.

Pendente (auditoria ampla, varrer todas as telas comparando com o mockup):
- **Hierarquia tipográfica**: conferir pesos/tamanhos por tela (mockup: h1 800/-.02em, KPI 800,
  título de card 700, h2 de login 700; rótulos mono 10px uppercase tracking .14–.16em).
- **Login**: comparar layout/espaçamentos com o card de login do mockup.
- **Tabelas**: cabeçalho mono uppercase + `tracking` e linhas (`row-line`/`row-hover`) como no mockup.
- **KPIs/dashboard**: deltas (▲ verde / warn) e tamanhos.
- **Barras de progresso**: gradiente `interactive→accent` (mockup) vs cor sólida atual.
- **Sidebar/header/bottom-nav**: revisar contra a identidade (não há no mockup; validar coerência).
- Rodar com `npm run dev` e comparar lado a lado claro/escuro; idealmente Playwright screenshot diff.

### 5.7 Paridade com o sistema antigo (`docs/RELATORIO-SISTEMA.md`)
Auditoria do remake × spec do sistema antigo. Núcleo (§4.1–4.14, fluxos §5) completo.
**Lacunas fechadas (4 blocos):**
- ✅ **Dependentes** + dedução de IRRF por dependente (`/rh/funcionarios`, config em Encargos).
- ✅ **Feriados** (`/configuracoes/feriados`, importar nacionais via Páscoa) — descontam no banco de horas.
- ✅ **Pranchas** por disciplina (`/projetos/[id]/pranchas`) e ✅ **SLA de entregas** (Qualidade, `Disciplina.entregueEm`).
- ✅ **Geração automática de folha CLT** (salário base + INSS/IRRF) e ✅ **cron RH noturno** (propostas vencidas, férias do dia).
- ✅ **Comentários/anexos em Tarefas**, ✅ **anexos em Suporte**, ✅ **Habilidades** (matriz de recursos), ✅ **Serviços terceirizados** por projeto.

**Restos do antigo ainda não portados (menores/opcionais):** fechamento automático de banco de horas e
geração automática de folha de projetistas (hoje manuais); composição de preço detalhada (remake usa
tabela R$/m²); transição de ciclo de férias (status é só aprovação); `LmConfig` (lista de material BIM);
"comparar versões" de proposta. Diferenças intencionais (stack/design) não são lacunas — ver §1.

## 6. Gotchas técnicos (economizam horas)

- **Prisma 7**: URL no `prisma.config.ts` (não no schema); client gerado em `src/generated/prisma` (ESM);
  **sempre** `npx prisma generate` após editar schema (migrate dev já gera); driver adapter `@prisma/adapter-pg` em `lib/prisma.ts`.
- **shadcn atual = base-ui** (não Radix): `DialogTrigger`/`DropdownMenuTrigger`/`TooltipTrigger` usam
  `render={<.../>}`; `Select onValueChange` recebe `string | null` → tratar `?? ""`.
- **CJS sob Turbopack** (`archiver`, `exceljs`): `createRequire(import.meta.url)` + cast — ver
  `api/uploads/disciplina/[id]/zip/route.ts` e `api/financeiro/relatorios/dre/xlsx/route.ts`.
- **Scripts tsx** (seed, smokes, server.ts): rodar com `--tsconfig tsconfig.server.json`
  (stub de `server-only` + polyfill AsyncLocalStorage como 1º import do server.ts).
- **pg-boss v12**: export nomeado `import { PgBoss } from "pg-boss"`.
- **better-auth dev**: porta dinâmica do preview quebrava origin → `disableCSRFCheck` só em dev.
- **Logos**: usar `<img>` (não next/image) — SVGs com ratios variados; sufixo `_dark` = arte clara p/ fundo escuro.
- **Som do chat**: WebAudio em `lib/chat-client.ts` (sem asset de áudio).
- **Helpers usados no client** não podem morar em arquivo com `import "server-only"` (ex.: `ponto/format.ts` separado).
- **Smoke e2e via script tsx** contra o banco > dirigir preview MCP (contexto de navegação instável).

## 7. Referências no repo

- `docs/RELATORIO-SISTEMA.md` — espec funcional completa do sistema antigo (fonte de requisitos de O4/O5).
- `docs/design/direcao-final.html` — mockup aprovado do design system.
- `C:\SENA_ADM\SENAHUB\SENAHub\prisma\schema.prisma` — schema antigo (referência de campos p/ O4/O5).
- `C:\SENA_ADM\SENAHUB\historico de prompts.txt` — dores históricas do usuário (muitas já resolvidas).
- Git log: convenção `feat(onda-Nx): …` / `test(onda-N): …`.
