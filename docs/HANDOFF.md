# SenaHub Remake — Handoff / Estado do Projeto

> Documento de continuidade. Permite a qualquer dev/IA retomar o trabalho do ponto exato.
> Atualizado em 2026-06-13. Ondas 0–4 + **Onda D (Estúdio de Documentos v1)** + **Onda 5
> completa** (tarefas, agenda, jurídico, licitações, qualidade, suporte, **planejamento/recursos**
> + 7 automações pg-boss). Verificadas (tsc limpo, 41 testes, smokes O1–O5). Próximo:
> evoluções do Estúdio (§5.4b), restos opcionais (§5.2) e deploy (§5.4).

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
npm test                   # vitest (41 testes)
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

| **O5** (parcial) | **Complementares** (commits `fix(auth)` + `feat(onda-5)`): **Tarefas** (`/tarefas`, dnd-kit, colunas configuráveis `TarefaStatus`, **dependências com bloqueio de conclusão**, checklist, multi-responsáveis, prazos, notifica). **Agenda** (`/agenda`, compromissos+convites+confirmação, **prazos de projeto/disciplina no calendário marcação única**, notifica convidados). **Jurídico** (`/juridico`, docs por projeto/cliente **versionados** upload/download, certidões tipo+validade, `juridico:ver\|gerir`). **Licitações** (`/licitacoes`, processos+docs versionados, **medição→Lancamento receita previsto cat 1.02**, **importar ganha→projeto+canais+docs ao Jurídico**, `licitacoes:ver\|gerir`). **Qualidade** (`/qualidade`, índice de retrabalho por disciplina, snapshots mensais, **KPIs reais da home**). **Suporte** (`/suporte`, tickets+mensagens+status). **7 automações pg-boss** (`lib/jobs-handlers.ts`): prazo disciplina D-7/3/1, inadimplência D+1, certidões 30/15/7, licitações 15/7/1, lembrete ponto, snapshot qualidade mensal, resumo semanal e-mail. | tsc limpo, 41 testes, rotas compilam (307) |

| **O5b** | **Planejamento & Recursos** (commit `feat(onda-5): planejamento/recursos`). **Planejamento** (`/planejamento`, `modules/planejamento`): índice de projetos com resumo do plano; por projeto (`/planejamento/[id]`) **EAP hierárquica** (tarefa/subtarefa), **gantt de linha dupla** (`components/planejamento/gantt.tsx`: barra prevista + progresso × barra de linha de base, eixo por mês, marcador de hoje), **dependências FS** com detecção de ciclo, **definir/atualizar linha de base** (snapshot previsto→baseline na própria tarefa), **aplicar ao projeto** (grava prazo das disciplinas vinculadas), tabela WBS com coluna de desvio (±dias vs baseline). `planejamento:ver` (internos exceto freelancer, escopo de projeto) / `gerir` (gestores); **projetista vê read-only**. **Recursos** (`/recursos`): matriz pessoa × projeto com **multiplicador de capacidade** por pessoa, alocação %/período, **detecção de superalocação** (Σ% > capacidade×100, linha destacada), custo/hora e cor. `recursos:ver\|gerir` (gestores). Models: `EapTarefa`, `EapDependencia`, `Recurso`, `Alocacao`. | `smoke:onda5` (8/8) |

Fluxo crítico completo já funciona: lead→proposta→aceite→projeto→upload→validação→pagamento→folha→lançamento→caixa/DRE.

> **Login do admin (resolvido 2026-06-13):** o hash da conta do admin estava defasado e não
> validava contra `SenaHub@2026` (o seed só define a senha ao **criar** o admin; num admin
> pré-existente a senha não é reaplicada). Resolvido com **`npm run admin:reset-senha`**
> (`scripts/reset-admin-senha.ts`) — re-hasha a senha padrão pelo `auth.$context.password.hash`
> do better-auth e marca troca obrigatória. Login confirmado (200 → `/trocar-senha`).

## 5. O QUE FALTA

### 5.1 Onda 4 — Comercial/CRM ✅ ENTREGUE (ver tabela §4)
Restos opcionais da O4 (não bloqueiam): anexos em proposta; criar proposta direto do lead
(pré-preenchendo cliente); etapas do funil configuráveis por UI (hoje só seed);
gerar PDF da proposta pelo Estúdio com modelo padrão por tipo (ver §5.4b).

### 5.2 Onda 5 — Complementares ✅ ENTREGUE (ver tabela §4, linhas O5 e O5b)
Jurídico, Licitações, Tarefas, Agenda, Qualidade, Suporte, Planejamento/Recursos + 7 automações pg-boss.

Restos opcionais (não bloqueiam): comentários/anexos em Tarefas; anexos em Suporte;
gauge de qualidade com `recharts` (hoje barras); SLA de entregas e produtividade
(horas × valor) no Dashboard. **Planejamento** (evoluções): reordenar/indentar tarefas por
drag na EAP; setas de dependência no gantt; superalocação ciente do período (hoje soma total);
exportar cronograma (Excel/PDF); workspace de rascunho separado antes de aplicar.

### 5.3 Automações (jobs pg-boss — `lib/jobs.ts` + `lib/jobs-handlers.ts`)
| Job | Regra | Estado |
|---|---|---|
| Alertas prazo disciplina | D-7/D-3/D-1 → responsáveis + gestores (08:00 diário) | ✅ |
| Lembrete ponto não batido | CLT/estagiário sem sessão aberta hoje (dias úteis 09:15) | ✅ |
| Inadimplência | Lancamento receita previsto vencido D+1 → notificação gestores | ✅ |
| Certidões | vencimento 30/15/7 → gestores | ✅ |
| Licitações | prazo de proposta 15/7/1 → gestores | ✅ |
| Snapshot qualidade | dia 1º 02:00, grava índice do mês anterior | ✅ |
| Resumo semanal | seg 07h: entregas/a receber/a pagar → notificação + e-mail | ✅ |
| Snapshot dashboard | diário 23:30, série histórica de KPIs (home: card "Evolução") | ✅ |
| E-mail de cobrança | inadimplência → e-mail ao cliente (hoje só notificação interna) | ⬜ opcional |
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
A v1 está funcional; a visão é ser O gerador de TODO documento do escritório
(propostas O4, contratos, holerites, relatórios gerenciais). Próximos passos:
- **Novas fontes de dados**: ✅ proposta (O4), ✅ **cliente isolado** (+projetos), ✅ **licitação/medições**
  (O5), ✅ **holerite** (folha CLT, +itens), ✅ **DRE do mês** (reusa `relatorioDRE`). Adicionar fonte = `fontes-meta.ts` (metadados)
  + `fontes.ts` (resolução); o seletor de parâmetro é genérico por `tipo` em `preview-bar.tsx`
  (mes = input month; resto = select de `opcoesParametros`) — o editor pega a fonte automático.
- **Integração nos módulos**: ✅ botão "Gerar documento" no projeto/proposta/holerite
  (`GerarDocumentoButton` + `modelosPorFonte`) abre o preview com parâmetro pré-preenchido;
  ✅ **modelo padrão por tipo** em Configurações → Documentos padrão (`ConfigSistema 'documentos.padroes'`;
  o padrão aparece primeiro no dropdown). Sem modelo da fonte → botão oculto.
- ✅ **PDF server-side** (puppeteer-core): `GET /api/documentos/[id]/pdf` — Chrome headless (`CHROME_PATH`)
  navega no preview com o cookie de sessão e gera A4; botão "Baixar PDF". **Configurar `CHROME_PATH`
  no servidor** (caminho do chrome.exe) e validar a geração. Falta: anexar automaticamente ao e-mail da proposta.
- **Paginação real**: quebra por altura de página, rodapé de página repetido em cada página,
  `[Pagina]/[Paginas]` reais (hoje render é fluxo único; rodapePagina renderiza 1×).
- **Novos elementos**: tabela rica (colunas configuráveis, zebra), gráfico (recharts→SVG estático),
  KPI/cartão, código de barras/QR (qrcode), quebra de página manual, campo de assinatura,
  numerador automático de páginas, imagem por upload (storage) além de URL.
- **UX**: arrastar da paleta direto pro canvas, multi-seleção, alinhar/distribuir,
  guias inteligentes (smart guides), copiar/colar entre bandas e modelos, réguas (px/mm),
  grade configurável, modo mm (impressão técnica).
- **Documentos gerados persistidos**: ✅ model `DocumentoGerado` (snapshot schema+dados+params, nomes
  guardados), botão "Salvar geração" no preview, histórico em `/documentos/gerados` ("Reabrir" no preview).
  Falta: anexar o PDF no storage (depende do PDF server-side).
- **Condicionais**: visibilidade de elemento por expressão (ex.: só mostra se [Valor]>0);
  blocos repetidos aninhados (grupos com subtotal).

### 5.5 Melhorias e ferramentas sugeridas (backlog futuro)
- ✅ **Busca global** (Ctrl+K): `CommandPalette` próprio (sem cmdk) sobre o Dialog base-ui — projetos/clientes/lançamentos, escopado por viewer; gatilho no header.
- **Gráficos**: ✅ dashboard (receita 6m), ✅ qualidade (tendência), ✅ resultado mensal (orçamento), ✅ **projeção de caixa 8 semanas** (fluxo de caixa, com detecção de gap) — SVG/CSS/tabela próprios (sem recharts).
- ✅ **Dashboard executivo**: KPIs reais + gráfico de receita + tabela "Projetos recentes" (estilo mockup) + card "Evolução" (snapshots).
- ✅ **/api/health** (ping de banco; rota pública; Uptime Kuma/LB).
- ✅ **Orçamento anual** (`/financeiro/orcamento`): previsto×realizado por categoria + KPIs + gráfico de resultado mensal.
- ✅ **DFC/Balanço**: ⬜ ainda falta (além da DRE). **Paginação**: auditoria ✅ pagina; lançamentos faz filtro client-side (paginar exigiria mover filtros p/ server — quando o volume crescer).
- **@dnd-kit**: funil comercial (O4) e Kanban de tarefas (O5).
- **react-hook-form + @hookform/resolvers**: formulários grandes (proposta) — hoje forms são useState manual.
- ✅ **Avatares**: upload `POST /api/avatar` (sharp 256²) + serve `/api/avatar/[id]` + "Alterar foto" no menu; exibe no header/chat via `user.image`. **Validar upload no navegador.**
- **Holerite/Relatórios em PDF** (jspdf, além do Excel).
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
