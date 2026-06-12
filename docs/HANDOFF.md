# SenaHub Remake — Handoff / Estado do Projeto

> Documento de continuidade. Permite a qualquer dev/IA retomar o trabalho do ponto exato.
> Atualizado em 2026-06-12. Ondas 0–4 + **Onda D (Estúdio de Documentos v1)** completas e
> verificadas; faltam O5, automações, evoluções do Estúdio e deploy.

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
npm test                   # vitest (33 testes)
npm run db:migrate         # prisma migrate dev
npm run db:seed            # admin + permissões + catálogos (idempotente)
npm run smoke:onda1|onda2|onda3efg   # smokes e2e contra o banco de dev
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

Fluxo crítico completo já funciona: lead→proposta→aceite→projeto→upload→validação→pagamento→folha→lançamento→caixa/DRE.

## 5. O QUE FALTA

### 5.1 Onda 4 — Comercial/CRM ✅ ENTREGUE (ver tabela §4)
Restos opcionais da O4 (não bloqueiam): anexos em proposta; criar proposta direto do lead
(pré-preenchendo cliente); etapas do funil configuráveis por UI (hoje só seed);
gerar PDF da proposta pelo Estúdio com modelo padrão por tipo (ver §5.4b).

### 5.2 Onda 5 — Complementares (próxima)
- **Jurídico**: pastas por projeto/cliente, contratos versionados (minuta→assinado→aditivo),
  modelos, certidões (tipos configuráveis, validade), download. Alertas de vencimento 30/15/7 dias (job).
- **Licitações**: processos (modalidade, datas), documentos versionados, alertas 15/7/1,
  **medições → Lancamento receita**, importar licitação ganha → projeto (status "Em execução")
  com documentação indo ao Jurídico em pastas por projeto.
- **Tarefas**: Kanban colunas configuráveis (`TarefaStatus`), dependências entre tarefas,
  checklist, multi-responsáveis, comentários, anexos.
- **Planejamento/Recursos**: workspace (kanban+gantt rascunho→aplicar), **EAP com linha de base**
  estilo MSProject (gantt com linha dupla: baseline vs real), matriz de recursos com
  **multiplicador de capacidade** por pessoa, detecção de superalocação. Projetista vê seus projetos read-only.
- **Agenda**: compromissos, convites com confirmação, agenda do dia; prazos de projeto/disciplina
  no calendário (marcação única, sem duplicar — bug do sistema antigo).
- **Qualidade**: índice de retrabalho por disciplina (fonte: `RevisaoDisciplina` já existe),
  snapshot mensal (job dia 1º), gauge + linha de tendência (instalar `recharts`).
- **Dashboard/Relatórios executivos**: KPIs reais na home (hoje mostram "—"): projetos ativos,
  receita prevista, entregas pendentes; SLA de entregas; produtividade (horas × valor — rateio já existe).
- **Suporte**: tickets internos com anexos e status.

### 5.3 Automações pendentes (jobs pg-boss — `lib/jobs.ts`)
| Job | Regra |
|---|---|
| Alertas prazo disciplina | D-7/D-3/D-1 → notificar responsáveis + gestores (diário) |
| Lembrete ponto não batido | CLT sem sessão aberta após X min do início da `EscalaTrabalho` (dias úteis) |
| Inadimplência | Lancamento receita previsto vencido D+1 → notificação interna; e-mail de cobrança opcional |
| Certidões/contratos | vencimento 30/15/7 (O5 jurídico) |
| Licitações | prazos 15/7/1 (O5) |
| Snapshot qualidade | dia 1º, grava índice mensal (O5) |
| Snapshot dashboard | diário, série histórica de KPIs (O5) |
| Resumo semanal | e-mail seg 07h para admin/supervisor: entregas, vencimentos, caixa |
Existente: backup diário (pg_dump → pasta; conferir destino/retenção no deploy).

### 5.4 Deploy / Cutover (produção no mesmo servidor Windows 11)
1. `.env` produção: `DATABASE_URL` (db novo `senahub` prod na instância 5433 ou nova), senha forte do Postgres, `BETTER_AUTH_SECRET` forte (32+ bytes), `BETTER_AUTH_URL`/`APP_URL` = domínio público, `NODE_ENV=production`, SMTP real, `STORAGE_BASE_PATH` = pasta de rede definitiva.
2. `npm run build` + rodar `npm start` (server.ts) como **serviço Windows via NSSM** — criar `scripts/instalar-servico.ps1` (nssm install SenaHub "node caminho" …; AppDirectory; stdout/stderr log; restart on failure).
3. **cloudflared** como serviço apontando `http://localhost:3000` (tunnel já existe p/ sistema antigo — criar rota nova ou trocar no cutover). LAN acessa direto `http://servidor:3000`.
4. Backup: job pg_boss diário roda `pg_dump` → pasta de rede, retenção 30 dias; testar restauração.
5. better-auth: remover `disableCSRFCheck` de dev; conferir `trustedOrigins=[BETTER_AUTH_URL]`.
6. PWA: gerar ícones reais (`public/icons/icon-192.png`/512 a partir de `public/MARCA/icon.ico`).
7. Re-cadastro do essencial (usuários, clientes, projetos ativos); sistema antigo vira leitura.
8. Security pass: rate-limit login ok; revisar CSP/headers (`next.config.ts`); `robots` já noindex.

### 5.4b Estúdio de Documentos — evoluções (roadmap do módulo)
A v1 está funcional; a visão é ser O gerador de TODO documento do escritório
(propostas O4, contratos, holerites, relatórios gerenciais). Próximos passos:
- **Novas fontes de dados**: proposta (O4 — itens/condições/totais), holerite (folha CLT),
  cliente isolado, licitação/medições (O5), DRE do período. Basta adicionar em
  `fontes-meta.ts` (metadados) + `fontes.ts` (resolução) — o editor pega automático.
- **Integração nos módulos**: botão "Gerar documento" no projeto/proposta/holerite abrindo
  o preview com parâmetros pré-preenchidos (`/documentos/[id]/preview?projetoId=…`);
  campo "modelo padrão por tipo" (ex.: proposta usa modelo X) em Configurações.
- **PDF server-side** (puppeteer-core + chrome headless local) p/ anexar a e-mail
  (proposta por e-mail O4) sem depender do diálogo de impressão.
- **Paginação real**: quebra por altura de página, rodapé de página repetido em cada página,
  `[Pagina]/[Paginas]` reais (hoje render é fluxo único; rodapePagina renderiza 1×).
- **Novos elementos**: tabela rica (colunas configuráveis, zebra), gráfico (recharts→SVG estático),
  KPI/cartão, código de barras/QR (qrcode), quebra de página manual, campo de assinatura,
  numerador automático de páginas, imagem por upload (storage) além de URL.
- **UX**: arrastar da paleta direto pro canvas, multi-seleção, alinhar/distribuir,
  guias inteligentes (smart guides), copiar/colar entre bandas e modelos, réguas (px/mm),
  grade configurável, modo mm (impressão técnica).
- **Documentos gerados persistidos**: model `DocumentoGerado` (modeloId, params, snapshot do
  schema+dados, PDF no storage) p/ histórico imutável do que foi enviado ao cliente.
- **Condicionais**: visibilidade de elemento por expressão (ex.: só mostra se [Valor]>0);
  blocos repetidos aninhados (grupos com subtotal).

### 5.5 Melhorias e ferramentas sugeridas (backlog futuro)
- **Busca global** (Ctrl+K): shadcn `command` (cmdk) — projetos/clientes/lançamentos.
- **Gráficos**: `recharts` no dashboard, DRE (barras mensais), fluxo de caixa projetado, qualidade.
- **@dnd-kit**: funil comercial (O4) e Kanban de tarefas (O5).
- **react-hook-form + @hookform/resolvers**: formulários grandes (proposta) — hoje forms são useState manual.
- **Avatares**: upload com `sharp` (resize), exibir no header/chat.
- **Holerite/Relatórios em PDF** (jspdf, além do Excel).
- **DFC e Balanço** (além da DRE); **orçamento anual** (previsto×realizado por categoria).
- **Encargos automáticos folha** (tabelas INSS/IRRF progressivas → calcular descontos).
- **Paginação/virtualização** nas tabelas grandes (lançamentos, auditoria) quando o volume crescer.
- **Logs estruturados** (pino) + rotação de arquivos; endpoint `/api/health` p/ monitoramento (Uptime Kuma local).
- **Playwright e2e** nos fluxos críticos (login, upload→validação, lançamento).
- **2FA opcional** (plugin better-auth) para admin.
- **Multi-instância** (só se precisar): presença do chat + socket.io para Redis adapter.
- **Anexos no chat** com preview de imagem; **emoji picker**; **menções** com autocomplete (hoje texto simples).
- **Tema do cliente externo**: portal mínimo do cliente (projetos read-only + extrato) com layout próprio.

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
