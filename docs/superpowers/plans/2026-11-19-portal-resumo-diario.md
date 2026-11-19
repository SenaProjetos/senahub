# Portal — resumo diário por e-mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Às 7h, mandar a cada conta do portal um e-mail (e um sino) por projeto que andou desde a última rodada, com as linhas da linha do tempo daqueles dias; nada nos dias sem andamento.

**Architecture:** Regra pura (`portal/resumo-diario.ts`) decide quais dias avaliar e monta o texto. Serviço (`portal/resumo-service.ts`) roda `andamentoDoPortal` por projeto, reserva cada envio em `AvisoPortalEnviado` (reserva → envia → libera se falhar) e avança `ultimoDia` em `ConfigSistema portal.resumoDiario`. Job pg-boss 07:00. Tela de liga/desliga em `/configuracoes/portal`; o cliente desliga o e-mail em `/portal`.

**Tech Stack:** Prisma 7 (migração nova), pg-boss (`lib/jobs.ts`), `enviarEmailTemplate` + catálogo `email-templates-meta.ts`, `notificar`, Next 15 RSC + client view, Vitest, tsx smoke.

**Spec:** `docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md`

## Global Constraints

- Dia = dia de São Paulo (`diaDeSaoPaulo`, `lib/data.ts`); datas como `YYYY-MM-DD`; `ontem` = `hoje − 1` em dias corridos.
- Cada dia é avaliado uma vez (`ultimoDia`); limite de recuperação 7 dias; nunca antes de `desde`.
- Um sino e um e-mail por (conta, projeto, rodada), cobrindo todos os dias avaliados com itens.
- Destinatário: `User.tipo = externo`, `ativo`, `clienteId` = cliente do projeto, cliente `ativo`; conta criada depois do fim do dia não recebe esse dia. Troca de senha/termo pendente recebe.
- E-mail só com SMTP configurado, e-mail na conta e sem opt-out (`notif_portal_resumo === false`). Sino sempre, `push: false`.
- Sem linha de config = `{ ativo: true, desde: null, ultimoDia: null }`; primeira rodada com `desde` nulo grava `desde = ontem`.
- Texto vindo do banco escapado para Markdown no e-mail (disciplina, projeto, nome).
- Mudanças não commitadas alheias em `CLAUDE.md`, `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md` (trabalho "so-interno"): commitar só os próprios hunks (blob a partir de `HEAD` + `git update-index --cacheinfo`), nunca os alheios.
- Vitest pelo PowerShell; commits pt-BR terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Duas rodadas ao mesmo tempo (job duplicado) → cada conta recebe um e-mail só (P2002 na reserva) — smoke Task 2.
2. Rodada que cai no meio (exceção depois de alguns envios) → `ultimoDia` não avança e a rodada seguinte não repete quem já recebeu — smoke Task 2.
3. Cliente desativado ou conta inativa entre o andamento e as 7h → não recebe — smoke Task 2.
4. Projeto com andamento, cliente sem nenhuma conta do portal → nenhuma reserva, nenhum erro — smoke Task 2.
5. Nome de projeto com `*`/`_`/`[` → e-mail renderiza sem quebrar o Markdown — teste Task 1.

---

### Task 1: Regra pura do resumo

**Files:**
- Create: `src/modules/portal/resumo-diario.ts`
- Test: `src/modules/portal/resumo-diario.test.ts`

**Interfaces:**
- Consumes: `type ItemLinhaDoTempo` (`./andamento`).
- Produces:

```ts
export const CHAVE_CONFIG_RESUMO = "portal.resumoDiario";
export type ConfigResumo = { ativo: boolean; desde: string | null; ultimoDia: string | null };
export const CONFIG_RESUMO_PADRAO: ConfigResumo; // { ativo: true, desde: null, ultimoDia: null }
export function normalizarConfigResumo(valor: unknown): ConfigResumo; // campos inválidos caem no padrão
export function somarDiasIso(dia: string, n: number): string;        // "2026-11-01" -1 → "2026-10-31"
export function diasParaAvaliar(o: { hoje: string; desde: string | null; ultimoDia: string | null; limite?: number }): string[];
export function itensDosDias(linha: ItemLinhaDoTempo[], dias: readonly string[]): Map<string, ItemLinhaDoTempo[]>; // só dias com itens, chave = dia
export function periodoDoResumo(dias: readonly string[]): string;   // ["2026-11-18"] → "18/11/2026"; vários → "15/11/2026 a 18/11/2026" (min a max)
export function escaparMarkdown(s: string): string;                  // escapa \ ` * _ [ ] < > # |
export function listaEmMarkdown(porDia: ReadonlyMap<string, ItemLinhaDoTempo[]>): string;
export function textoDoSino(porDia: ReadonlyMap<string, ItemLinhaDoTempo[]>): string; // 1ª linha "Estrutural · 8 pranchas compartilhadas com você" + " e mais N" (N = itens restantes)
```

- [ ] **Step 1: Testes que falham**

```ts
describe("diasParaAvaliar", () => {
  it("desde nulo = nada", ...)                     // ({hoje:"2026-11-20",desde:null,ultimoDia:null}) → []
  it("desde ontem = só ontem", ...)                // desde "2026-11-19" → ["2026-11-19"]
  it("desde hoje = nada (primeiro resumo amanhã)", ...) // desde "2026-11-20" → []
  it("ultimoDia ontem = nada", ...)                // desde "2026-11-01", ultimoDia "2026-11-19" → []
  it("ultimoDia há 3 dias = os dois que faltam", ...) // ultimoDia "2026-11-17" → ["2026-11-18","2026-11-19"]
  it("limite de 7 dias", ...)                      // desde "2026-10-01", ultimoDia null → 7 dias: "2026-11-13".."2026-11-19"
  it("vira o mês", ...)                            // hoje "2026-12-01", desde "2026-11-29" → ["2026-11-29","2026-11-30"]
});
it("normalizarConfigResumo cai no padrão com lixo", ...) // (null) e ({ativo:"x",desde:12}) → CONFIG_RESUMO_PADRAO; ({ativo:false,desde:"2026-11-19",ultimoDia:null}) mantém
it("itensDosDias só traz dias com item", ...)      // linha com dias 18 e 20, dias ["2026-11-18","2026-11-19"] → Map só com "2026-11-18"
it("periodoDoResumo um dia e vários", ...)         // "18/11/2026" e "15/11/2026 a 18/11/2026" (entrada fora de ordem)
it("listaEmMarkdown de um dia", ...)               // "- **Estrutural** · 8 pranchas compartilhadas com você"
it("listaEmMarkdown de vários dias com subtítulo, do mais antigo", ...) // "**15/11/2026**\n\n- ...\n\n**18/11/2026**\n\n- ..."
it("escapa texto do banco", ...)                   // disciplina "Elét*rica_[A]" → "- **Elét\\*rica\\_\\[A\\]** · ..."; escaparMarkdown("Ed. *Sol*") → "Ed. \\*Sol\\*"
it("textoDoSino com e mais N", ...)                // 3 itens → "Estrutural · 8 pranchas compartilhadas com você e mais 2"; 1 item → sem sufixo
```

- [ ] **Step 2:** Run (PowerShell) `npx vitest run src/modules/portal/resumo-diario.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `resumo-diario.ts` (puro; `somarDiasIso` por `Date.UTC`).
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(portal): regra do resumo diário do cliente` (os dois arquivos).

---

### Task 2: Banco, serviço, job e smoke

**Files:**
- Modify: `prisma/schema.prisma` (model `AvisoPortalEnviado` + back-relations em `User` e `Projeto`)
- Create: `prisma/migrations/20261119180000_aviso_portal_enviado/migration.sql` (via `npx prisma migrate dev --name aviso_portal_enviado --create-only`, conferir, depois `npm run db:migrate`)
- Create: `src/modules/portal/resumo-service.ts`
- Modify: `src/lib/email-templates-meta.ts` (template `resumo-andamento-portal`, grupo "Projetos", logo depois de `acompanhamento-projeto`)
- Modify: `src/lib/jobs-handlers.ts` (`resumoDiarioPortal()`), `src/lib/jobs.ts` (fila `portal-resumo-diario`, cron `"0 7 * * *"`)
- Create: `scripts/smoke-portal-resumo.ts`; Modify: `package.json` (`smoke:portal-resumo`), `CLAUDE.md` (linha do smoke depois de `smoke:portal-andamento`; `portal_resumo` na lista de categorias de notificação)

**Interfaces:**
- Consumes: Task 1 inteira; `andamentoDoPortal` (`./andamento-queries`); `filtrarPorCategoria`; `diaDeSaoPaulo`.
- Produces:

```prisma
model AvisoPortalEnviado {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  projetoId String
  projeto   Projeto  @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  dia       DateTime @db.Date
  canal     String   // "email" | "sino"
  enviadoEm DateTime @default(now())
  @@unique([userId, projetoId, dia, canal])
  @@index([projetoId])
  @@map("aviso_portal_enviado")
}
```

```ts
// resumo-service.ts ("server-only")
export type EnviarEmailResumo = (para: string, vars: { nome: string; projeto: string; periodo: string; lista: string; url: string }) => Promise<boolean>;
export type NotificarSino = (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
export type ResultadoResumo = { dias: string[]; projetos: number; emails: number; sinos: number; duplicados: number; semEmail: number; optOut: number; falhas: number };
export async function getConfigResumo(): Promise<ConfigResumo>;
export async function salvarConfigResumo(c: ConfigResumo): Promise<void>; // upsert ConfigSistema
export async function rodarResumoDiario(o: { hoje?: string; enviar: EnviarEmailResumo | null; notificar: NotificarSino }): Promise<ResultadoResumo>;
// enviar = null → sem SMTP: só sinos
```

- [ ] **Step 1: Schema + migração.** Gerar com `--create-only`, conferir que o SQL só cria a tabela, o índice único, o índice e as duas FKs; aplicar `npm run db:migrate`; `npm run db:generate`.
- [ ] **Step 2: Template.** Variáveis `nome`, `projeto`, `periodo`, `lista`, `url` com exemplos; assunto e corpo EXATOS da spec. Run (PowerShell) `npx vitest run src/lib/email-templates.test.ts` → PASS (o teste "todo template renderiza sem sobrar tokens" cobre o novo).
- [ ] **Step 3: Smoke que falha** — `scripts/smoke-portal-resumo.ts`, modelo `smoke-portal-andamento.ts` (cliente/projeto/doc throwaway, `finally` apaga; também apaga a linha `ConfigSistema` que criar e restaura a anterior). Usa `enviar`/`notificar` falsos que gravam em arrays (o `enviar` falso pode ser configurado para falhar). Cenário com `hoje = "2026-11-20"` e marcação (evento `situacao_marcada`) em `2026-11-19T15:00Z`, config `{ ativo: true, desde: "2026-11-01", ultimoDia: "2026-11-18" }`:
  - `[OK] uma conta do portal recebe 1 e-mail e 1 sino` (lista contém "1 prancha compartilhada com você", periodo "19/11/2026", url termina em `/portal/<id>`)
  - `[OK] ultimoDia avança para 2026-11-19`
  - `[OK] segunda rodada no mesmo dia não manda nada`
  - `[OK] reservas impedem duplicado` (volta `ultimoDia` para 18 e roda de novo → 0 e-mails, `duplicados` > 0)
  - `[OK] dois dias perdidos viram um e-mail` (marca outro documento em 2026-11-18, apaga as reservas, `ultimoDia` 17 → 1 e-mail com periodo "18/11/2026 a 19/11/2026")
  - `[OK] opt-out: sino sim, e-mail não` (`userPreference.dados.notif_portal_resumo = false`)
  - `[OK] falha no envio libera a reserva` (enviar → false: `falhas` 1 e nenhuma linha `canal=email` do dia)
  - `[OK] cliente desativado não recebe`, `[OK] conta inativa não recebe`, `[OK] outro cliente não recebe`
  - `[OK] projeto sem conta do portal: nada e sem erro`
  - `[OK] config desligada: nada`
  - `[OK] primeira rodada com desde nulo grava desde = ontem e manda só ontem` (andamento em 18 e 19, desde null → só 19)
  - `[OK] enviar null (sem SMTP): só sino`
  - Run `npm run smoke:portal-resumo` → falha na importação (serviço não existe).
- [ ] **Step 4: Implementar `resumo-service.ts`.** Ordem: config (desligada → resultado vazio; `desde` nulo → grava `desde = ontem`); `diasParaAvaliar`; vazio → termina sem gravar. Projetos: `projeto.findMany({ where: { cliente: { ativo: true, usuarios: { some: { tipo: "externo", ativo: true } } } } })` (relação `Cliente.usuarios`, "ClienteUsuarios"). Por projeto, sequencial: `andamentoDoPortal`, `itensDosDias`; vazio → próximo. Destinatários do cliente; por conta: dias em que a conta já existia (`createdAt ≤ fim do dia em SP`, ou seja `< dia+1 03:00Z`); sem dia → próxima. Sino: reserva uma linha `canal=sino` por dia (todas em sequência; P2002 em qualquer uma → desfaz as reservadas nesta conta e conta `duplicados`), `notificar`. E-mail: só se `enviar`, `email` e não opt-out; mesma reserva `canal=email`; `enviar` → `false`/exceção → `deleteMany` das reservas desta conta/projeto/canal/dias e `falhas += 1`. No fim, `salvarConfigResumo({ ...cfg, ultimoDia: ontem })`. URL = `${process.env.APP_URL}/portal/${projetoId}`; título do sino `Novidades em ${projeto.nome}`; `nome` = primeiro nome escapado; `projeto` escapado.
- [ ] **Step 5: Job.** `jobs-handlers.ts`: `export async function resumoDiarioPortal(): Promise<void>` chama `rodarResumoDiario({ enviar: smtpConfigurado() ? (para, vars) => enviarEmailTemplate(para, "resumo-andamento-portal", vars) : null, notificar: (id, n) => notificar(id, n, { push: false }) })` e loga `[portal] resumo diário dias=… e-mails=… sinos=… duplicados=… sem-email=… opt-out=… falhas=…` quando houve algo. `jobs.ts`: entrada `{ fila: "portal-resumo-diario", cron: "0 7 * * *", handler: resumoDiarioPortal }` com comentário (spec D2).
- [ ] **Step 6: Verificar.** `npm run smoke:portal-resumo` → tudo `[OK]`, exit 0. `npm run smoke:portal-andamento` → 12 `[OK]`. (PowerShell) `npx vitest run src/modules/portal src/lib/email-templates.test.ts` → PASS.
- [ ] **Step 7: Commit** schema, migração, serviço, template, jobs, smoke, package.json e o hunk próprio do CLAUDE.md: `feat(portal): resumo diário por e-mail ao cliente às 7h`.

---

### Task 3: Telas — ligar/desligar e opt-out do cliente

**Files:**
- Create: `src/modules/portal/resumo-actions.ts` (`"use server"`)
- Create: `src/app/(dashboard)/configuracoes/portal/page.tsx`, `src/components/configuracoes/portal-config-view.tsx`
- Modify: `src/app/(dashboard)/configuracoes/page.tsx` (item "Portal do cliente", grupo Projetos & Operação, ícone `Mail` ou `Send`, descrição "Resumo diário por e-mail aos clientes do portal.")
- Create: `src/components/portal/resumo-email-toggle.tsx` (`"use client"`)
- Modify: `src/app/(dashboard)/portal/page.tsx` (rodapé com o toggle, só para cliente ativo)
- Modify: `docs/manual/inicio/portal-cliente.md`, `docs/manual/sistema/configuracoes.md`, `docs/manual/search-index.json` (hunks próprios)

**Interfaces:**
- Consumes: `getConfigResumo`, `salvarConfigResumo` (Task 2); `salvarPreferencia` (`modules/usuarios/preferencias/actions.ts`, chave `notif_portal_resumo`).
- Produces: `salvarResumoPortal` = `defineAction({ modulo: "portal", recurso: "configuracoes", permissao: "gerir", acao: "salvar-resumo-portal", entidade: "ConfigSistema", schema: z.object({ ativo: z.boolean() }), capturarAntes: () => getConfigResumo() }, …)`: ligar quando estava desligado grava `desde = diaDeSaoPaulo()` e `ultimoDia = ontem`; desligar só `ativo: false`.

- [ ] **Step 1:** Página `/configuracoes/portal`: `requirePermission("configuracoes", "gerir")`, `CabecalhoPagina` "Portal do cliente" / "Avisos enviados aos clientes do portal."; card "Resumo diário por e-mail" com `Switch` (ou `Checkbox`) ligado/desligado, texto "Às 7h, cada conta do portal recebe um e-mail por projeto que andou no dia anterior. Dia sem novidade não manda nada." e "Ligado desde dd/mm/aaaa" quando `desde`. Ação com `toast` e `router.refresh()`.
- [ ] **Step 2:** Toggle do cliente em `/portal`: lê `notif_portal_resumo` da preferência do usuário no servidor (`prisma.userPreference.findUnique`, ausente = ligado) e passa ao componente; `Checkbox` com rótulo "Receber por e-mail o resumo dos dias em que um projeto andar"; chama `salvarPreferencia({ chave: "notif_portal_resumo", valor })`.
- [ ] **Step 3:** Manuais: seção "Resumo por e-mail" no portal-cliente.md (o que chega, quando, como desligar); página Portal do cliente no configuracoes.md; palavras-chave no `search-index.json`.
- [ ] **Step 4: Verificar.** `npm run lint`; `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`; (PowerShell) `npx vitest run --maxWorkers=6` → PASS.
- [ ] **Step 5: Commit** `feat(portal): liga e desliga do resumo diário e opção do cliente` (hunks próprios dos manuais).

---

### Task 4: Auditoria final

- [ ] Reler `docs/PROTOCOLO_AUDITORIA_FINAL.md`; nível 3 (job + e-mail para fora + migração): revisores `prisma-migration-reviewer`, `realtime-jobs-auditor`, `action-guardian`, `design-system-guardian`, `a11y-auditor`, mais o revisor final do branch.
- [ ] Tela: `/configuracoes/portal` (usuário interno com `configuracoes:gerir`) e `/portal` com o toggle (`cliente.portal@demo.senahub`), 1366 e 390, claro e escuro, `scrollWidth` 390; print do HTML do e-mail renderizado (`renderTemplate("resumo-andamento-portal", exemplo)` gravado num `.html` e aberto no Chrome). Prints + `LEIAME.md` em `prints-auditoria/2026-11-19_<hora>_portal-resumo/`.
- [ ] `npm run build` com o dev parado; relatório em pt-BR.
