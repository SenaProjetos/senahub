# SenaHub Remake — Plano de Reconstrução

## Contexto

O SenaHub atual (ERP sob medida para escritório de engenharia BIM — `C:\SENA_ADM\SENAHUB\SENAHub`) funciona, mas cresceu por acreção de centenas de pedidos pontuais (ver `historico de prompts.txt`): 284 endpoints, 212 modelos, UX remendada, dores recorrentes de chat/notificações e de infraestrutura Docker/WSL2 em Windows (ex.: `EACCES: permission denied, mkdir 'C:'`). O usuário quer reconstruir do zero com arquitetura coerente, em `C:\SENA_ADM\SENAHUB\SENAHub-remake`.

**Decisões tomadas com o usuário:**
1. **Banco limpo** — sem migração de dados; re-cadastro manual do essencial. Sistema antigo continua rodando em paralelo até o cutover.
2. **Stack:** Next.js modernizado (Next 15 / React 19), monolito modular.
3. **Infra:** nativo Windows — sem Docker, sem WSL2, sem Redis, sem Nginx.
4. **Escopo:** core primeiro, módulos secundários em ondas seguintes.
5. **Visual:** apresentar 2–3 direções visuais em mockups (skill `frontend-design`) para o usuário escolher antes de codar a UI.

**Custo:** zero — tudo open source, mesmo servidor local Windows 11, Cloudflare Tunnel mantido.

## Stack nova

| Camada | Escolha | Substitui / Por quê |
|---|---|---|
| Framework | Next.js 15 App Router + React 19 + TS strict | Mesmo do atual, reconstruído limpo |
| UI | Tailwind v4 + shadcn/ui + lucide + recharts + @dnd-kit | Libs do atual aproveitadas |
| ORM/Banco | Prisma (atual) + **PostgreSQL 17 nativo Windows** (instalador, serviço) | Elimina Docker/WSL2 |
| Auth | **better-auth** (credenciais, sessões, rate-limit embutido) | Substitui NextAuth v4 |
| Jobs/cron | **pg-boss** (fila + agendamento sobre Postgres, in-process) | Elimina Redis-filas, Task Scheduler e rotas `cron/*` com `CRON_SECRET` |
| Cache | LRU em memória (instância única) | Elimina Redis-cache |
| Realtime | Socket.io em `server.ts` custom, instância única | Sem redis-adapter |
| API | **Server Actions + Server Components** via camada de serviço; route handlers só para streaming de arquivos, links públicos por token e webhooks | Reduz drasticamente a superfície de 284 endpoints |
| Validação | Zod compartilhado client/server | Mantido |
| E-mail/Push/PDF/Excel/ZIP/Imagens | nodemailer, web-push (VAPID), jsPDF+autotable, exceljs, archiver, sharp | Mantidos |
| Arquivos | Pasta local Windows (`STORAGE_BASE_PATH`), SHA-256, guarda anti-path-traversal | Caminhos Windows nativos resolvem a dor do EACCES |
| Serviço | Node 22 LTS rodando como serviço Windows (NSSM), script `scripts/instalar-servico.ps1` | |
| HTTPS externo | cloudflared como serviço → app direto na porta 3000 | Elimina Nginx; LAN acessa `http://servidor:3000` |
| Backup | Job pg-boss diário: `pg_dump` → pasta de rede, retenção 30 dias, notifica admin em falha | |

## Arquitetura modular

```
src/
  app/                    # rotas: (auth)/ e (dashboard)/, layouts
  modules/<dominio>/      # clientes, projetos, uploads, financeiro, rh, chat, ...
    schemas.ts            # Zod (compartilhado com forms)
    queries.ts            # leituras p/ Server Components (com escopo por perfil)
    actions.ts            # Server Actions (mutações)
    service.ts            # lógica de negócio — única porta ao Prisma
    components/           # UI do módulo
  lib/                    # auth, permissions, audit, storage, push, mail, jobs, socket, cache
  components/ui/          # design system (shadcn base + componentes próprios)
prisma/schema.prisma
server.ts                 # Next + Socket.io + pg-boss no mesmo processo
```

**Pilar transversal — `withAction` (HOF única para toda mutação):** sessão → permissão fina (`recurso:ação`, tabela no banco com cache em memória, TTL 10 min) → validação Zod → execução → **auditoria automática** (regra absoluta do CLAUDE.md original preservada). Acabou a disciplina manual rota a rota.

**Controle de acesso em 3 camadas (mantido do atual):** middleware por tela → permissão fina configurável em Configurações → escopo de dados no service (projetista vê só o que é dele). 8 perfis mantidos, incluindo `administrativo`.

**Schema:** redesenhado do zero, onda a onda, usando `C:\SENA_ADM\SENAHUB\SENAHub\prisma\schema.prisma` como referência de campos/regras — enxugar redundâncias (alvo ~140 modelos no total).

**Convenções preservadas:** commits semânticos pt-BR; código em inglês, UI em português; mobile-first; PWA instalável; auditoria obrigatória.

## Ondas de entrega

Cada onda = ciclo completo (design → TDD nos fluxos críticos → implementação → verificação com o usuário). Sistema utilizável a partir da Onda 1.

**Onda 0 — Fundação**
- Scaffold do projeto, git init, Prisma + Postgres local, `server.ts` (Next + Socket.io + pg-boss).
- **Design system:** gerar 2–3 direções visuais como mockups HTML (skill `frontend-design`) → usuário escolhe → tokens, componentes base, shell (sidebar colapsável sem bug de scroll, bottom-nav mobile, header).
- Auth (better-auth): login, troca de senha no 1º acesso, solicitação de reset com notificação ao admin, anti-força-bruta.
- Usuários, perfis, tabela de permissões + tela de configuração.
- Auditoria (`withAction` + visualizador), notificações (sininho + web-push + service worker + **som** — dor histórica), PWA.

**Onda 1 — Operação (coração)**
- Clientes PF/PJ (contatos, CEP automático via ViaCEP, resumo com financeiro do cliente).
- Projetos: numeração automática `AAXXXX`, disciplinas com status independente, múltiplos responsáveis, prazos por disciplina, membros, log de revisões (RV00, RV01…), inputs do projeto com link público por token.
- Uploads Pacote A/B: **validação arquivo a arquivo** (não falha o lote inteiro — dor histórica), formatos não suportados vão para pasta "outros" com confirmação, SHA-256, versões, download ZIP.
- Validação do supervisor → **cria pagamento automaticamente** (regra de ouro), notifica projetista e financeiro.

**Onda 2 — Financeiro**
- Plano de contas, centros de custo, contas bancárias, fornecedores, sócios, formas de pagamento.
- Lançamentos (recorrência, anexos, status), contas a pagar/receber, parcelas.
- Folha de projetistas (por entrega validada), fluxo de caixa, importação OFX + conciliação com regras de categorização, DRE/DFC/indicadores, exportação Excel.

**Onda 3 — Chat + RH**
- Chat Socket.io: #geral, canal por projeto **e por disciplina** (criados automaticamente), DM, menções, fixar, anexos, presença, status do usuário (Disponível/Ocupado/Reunião), **notificação push + som confiáveis em todos os tipos de conversa** (dor histórica nº 1).
- Ponto digital: cronômetro, **troca de projeto durante a jornada com confirmação**, banco de horas, escala, espelho; rateio automático de horas CLT por projeto.
- Férias, abono com atestado, folha CLT (rubricas, encargos, holerite por e-mail), onboarding, NF de PJ, clima emocional.

**Onda 4 — Comercial (CRM)**
- Leads, funil Kanban, oportunidades, metas.
- Propostas: versões, itens, condições em % ou R$, copiar proposta, **preços automáticos por tabela configurável + área do projeto**, PDF, envio por e-mail com pixel de abertura (rotas públicas por token).
- **Proposta aceita → projeto + disciplinas + canais de chat, sem redigitação.**

**Onda 5 — Complementares**
- Jurídico (contratos versionados, certidões com alertas 30/15/7), Licitações (prazos 15/7/1, medições → financeiro, importar licitação ganha → projeto com documentos indo ao jurídico), Tarefas Kanban (dependências, checklists), Planejamento/Recursos (Gantt com linha de base estilo MSProject, superalocação com multiplicador de capacidade), Agenda, Qualidade (índice de retrabalho com snapshots), Relatórios executivos, Suporte.

**Cutover:** ao fim da onda que o usuário considerar suficiente — re-cadastro do essencial, troca do Cloudflare Tunnel para o app novo, sistema antigo vira leitura.

## Automações novas (inferidas — distribuídas nas ondas)

1. Proposta aceita → projeto + disciplinas + canais de chat (O4)
2. Validação de pacotes → pagamento + notificações (O1)
3. Alertas de prazo de disciplina D-7/D-3/D-1 (O1)
4. Lembrete de ponto não batido conforme escala (O3)
5. Auto-conciliação OFX para matches exatos por regra (O2)
6. Inadimplência: notificação interna D+1 + e-mail de cobrança opcional (O2)
7. Admissão → conta + onboarding checklist + entrada no #geral (O3)
8. Snapshot diário de indicadores do dashboard (tendências) (O5)
9. Resumo semanal do escritório por e-mail para admin/supervisor (O5)
10. Frase motivacional diária no herocard (`frases.json`, determinística por dia) (O0)

## Verificação

- **Vitest** nos services críticos: liberação de pagamento, rateio de horas, ponto/banco de horas, permissões/escopo, numeração de projeto, conciliação OFX.
- Cada onda termina com: `npm run build` limpo, testes verdes, smoke test roteirizado no navegador (preview) cobrindo os fluxos da onda, e validação do usuário antes da onda seguinte.
- Fluxos de segurança verificados por teste: escopo de dados por perfil (projetista não vê dados alheios), path-traversal no storage, rate-limit de login.

## Primeiros passos da execução

1. Git init em `SENAHub-remake`, scaffold Next 15 + TS + Tailwind + Prisma, Postgres local de dev.
2. Skill `frontend-design`: 2–3 direções visuais em mockups → escolha do usuário.
3. Onda 0 completa → demo → Onda 1.
