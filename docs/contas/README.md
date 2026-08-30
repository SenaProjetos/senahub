# Documentação: Módulo Acessos e Credenciais

Central de documentação e planejamento do módulo **Acessos e Credenciais** — cofre corporativo de contas, portais, softwares, licenças e credenciais institucionais.

---

## Estrutura de Documentos

### 📋 Especificação

**[`specs/acessos-credenciais.md`](specs/acessos-credenciais.md)** — 2500+ linhas

Requisitos completos do módulo:
- Objetivo geral e regras fundamentais (§1-2)
- Visual reference (§3)
- Localização no menu e rotas (§4-5)
- Layout detalhado: cabeçalho, cards, filtros, tabela, drawer (§6-87)
- Modelo de dados conceitual (§65-67)
- Critérios de aceitação (§89-92)
- Segurança (§45-52): criptografia, auditoria, permissões, RLS
- Processo de implementação em 6 etapas (§93-97)

**Status:** ✅ Completa. Não alterar sem conselho.

---

### 🏗️ Plano Técnico

**[`plans/acessos-credenciais-plan.md`](plans/acessos-credenciais-plan.md)** — 25KB, 8 fases

Tradução da especificação em plano de implementação verificável:

#### Resumo Executivo
- Arquitetura: Server Actions + Prisma + node:crypto AES-256-GCM
- 8 fases sequenciais (11 dias estimado)
- 6 decisões resolvidas, 0 conflitos intransponíveis

#### Fases

| # | Fase | Duração | Estado |
|----|------|---------|--------|
| 1 | Schema + Crypto + Perms | 1d | ✅ **concluída** (2026-08-28) |
| 2 | Server Actions + Authz | 2d | ⬜ 3 perguntas abertas antes |
| 3 | Queries + Filtros | 1d | ⬜ |
| 4 | UI: Página + Tabela + Drawer | 2d | ⬜ falta referência visual |
| 5 | Reveal + Audit UI | 1d | ⬜ |
| 6 | Form Criar/Editar | 1.5d | ⬜ |
| 7 | Licenças + Alertas + Jobs | 1.5d | ⬜ |
| 8 | Testes + Docs + Polish | 1d | ⬜ |

#### Seções Principais
- Pendências bloqueantes (§1-6: imagem ref, dept check, env var, etc.)
- Fases detalhadas com: objetivo, arquivos a criar/alterar, validação, testes, riscos
- Decisões arquiteturais (8 resolvidas)
- Matriz de risco
- Deployment checklist

**Status:** ✅ Aprovado. Pronto para Fase 1.

---

## 🚀 Como Usar Este Diretório

### Para Product/Gerente
1. Ler `specs/acessos-credenciais.md` (requisitos) — compreender o que será construído
2. Ler `plans/acessos-credenciais-plan.md` (Resumo Executivo + Fases) — entender cronograma e riscos

### Para Desenvolvedor (Fase X)
1. Abrir `plans/acessos-credenciais-plan.md`
2. Ir para **FASE X** correspondente
3. Ver seção "Arquivos a Criar", "Arquivos a Alterar", "Riscos", "Critérios de Validação"
4. Código! Testar segundo "Testes Necessários"
5. PR com checklist da fase

### Para Revisor/QA
- Spec: critérios de aceitação (§89-92)
- Plano: critérios de validação por fase
- Smoke tests em `scripts/smoke-acessos*.ts`

---

## 📊 Decisões Trancadas ✅

| Decisão | Resolução | Justificativa |
|---------|-----------|---------------|
| Reveal endpoint | Server Action `defineAction` | Ganha: sessão + perm + Zod + audit automática |
| RLS | App-layer only | SENAHub padrão; sem Postgres roles por request |
| Crypto | node:crypto AES-256-GCM | Sem dep nova; built-in Node.js |
| Soft delete | `deletadoEm` column | Padrão SENAHub (Lancamento) |
| Compartilhamento | usuario\|perfil\|setor | Dept/cargo Fase 2 se needed |
| Nomes modelos | `Credencial*` | Evita colidir com `AcessoPagina` |
| Global scope | ❌ Deny sempre | Reveal gates: perm + individual check |
| Limites alerta | Hard-coded v1 | Configurável Fase 2 via `ConfigSistema` |

---

## ⚠️ Pendências

**Ação imediata do dono (a Fase 1 não roda sem isto):**

- [ ] **`ACESSOS_ENCRYPTION_KEY`** em `.env`, `.env.example` e `.env.production.example`.
  Já documentada em `CLAUDE.md` e `docs/DEPLOY.md`, mas o agente **não tem permissão de escrita
  em `.env*`** — precisa ser colada à mão. Gerar com:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  Sem ela, criptografar/descriptografar lança (falha fechada, nunca grava plaintext).

**Antes da Fase 2:** ✅ nada — as três decisões foram tomadas em 2026-08-28 e já estão no código
(só `administrativo` na semente · `acessos:credencial` separada de `gerir` · favoritos e
recentes entram na v1). Detalhes em "DECISÕES DO DONO" no plano.

**Antes da Fase 4 (UI):**

- [ ] **Imagem de referência** (§3): não encontrada em `docs/contas/`. Fornecer, ou autorizar
  o padrão visual de `/clientes` e `/projetos`?
- [ ] Drawer mobile: full-screen ou lateral?

**Resolvidas:**

- ✅ **Departamento/Cargo populados** — 8 cargos e 4 departamentos no catálogo (confirmado no
  `db:seed`). `tipoAlvo` é texto livre, então incluí-los depois não exige migration.

---

## 🧪 Testes por Fase

Cada fase tem seu próprio comando em `scripts/smoke-acessos*.ts`:

```bash
# Fase 1: criptografia
npm test -- encryption.test.ts

# Fase 2: autorização + IDOR (5 cenários)
npm run smoke:acessos

# Fase 8: e2e completo (setup + full journey + cleanup)
npm run smoke:acessos-completo
```

---

## 📦 Modelos Prisma

Criados em Fase 1:

```
CredencialCategoria (nome, icone, ativo)
Credencial (nome, categoria, estado, url, usuário ENCRIPTADO, senha ENCRIPTADO, responsável, status, vencimento, soft-delete)
CredencialCompartilhamento (credencialId, tipoAlvo, alvoId, podeVer*, podeEditar*, podeGerenciar*)
CredencialProjeto (M2M: credencialId ↔ projetoId)
CredencialTag (M2M: credencialId ↔ tag)
CredencialFavorito (M2M: userId ↔ credencialId) — §41, preferência individual
// Auditoria: AuditLog existente com modulo="acessos" (não há tabela própria)
// Recentes (§42): derivado do AuditLog, sem tabela
```

Migrations: `20260828170000_acessos_credenciais_fase1` + `20260828180000_acessos_favoritos`.

---

## 🔐 Segurança (Spec §90)

- ✅ Senha AES-256-GCM (nunca plaintext)
- ✅ Não retorna em listagem
- ✅ Reveal endpoint específico (Server Action)
- ✅ Autorização server (defineAction gate)
- ✅ IDOR: smoke test 5 cenários (A-E)
- ✅ Auditoria: `AuditLog` modulo="acessos"
- ✅ Redact em logs: `redact: ["senha"]`
- ⚠️ Cache-control: POST responses não cacheable (Next built-in)

---

## 📅 Timeline Recomendada

```
Semana 1 (Mon–Wed):
  - Fases 1-2: Schema + Server Actions + Queries
  - Review: Autorização + IDOR + crypto
  - Smoke: teste 5 cenários

Semana 1 (Thu–Fri):
  - Fase 3-4: UI (com imagem ref resolvida)
  - Visual review

Semana 2 (Mon–Wed):
  - Fase 5-6: Reveal + Form
  - Usability test

Semana 2 (Thu–Fri):
  - Fase 7-8: Alertas + Testes + Docs
  - Pre-deploy validation
```

---

## 🔗 Referências Externas

- [Spec Segurança](specs/acessos-credenciais.md#45--segurança--requisito-crítico) — §45-52
- [Spec Permissões](specs/acessos-credenciais.md#76--permissões-de-administração) — §76-77, 91
- [Plano Decisões](plans/acessos-credenciais-plan.md#decisões-arquiteturais) — 8 resolvidas
- [Matriz de Risco](plans/acessos-credenciais-plan.md#matriz-de-risco) — 7 linhas

---

## 📝 Histórico de Documentação

| Data | Quem | O quê |
|------|------|-------|
| 2026-08-28 | Claude Code (Auditoria) | Spec completa validada; plano 8-fase criado |
| 2026-08-28 | Claude Code (Fase 1) | Schema (5 tabelas), `lib/encryption.ts` + 12 testes, permissões no catálogo **e no seed**, migration gerada pelo Prisma e ensaiada; env var documentada |
| 2026-08-28 | Claude Code (Revisão) | Auditoria do que a Fase 1 entregou: 2 testes falhando corrigidos, 4 divergências migration↔schema eliminadas, 49 checkboxes falsos zerados, lacunas da spec (§40/§41/§42/§36/§37) registradas |

---

**Manutenção:** Atualizar com link de PRs, progress de cada fase, e eventuais revisões da spec.

Último update: 2026-08-28
