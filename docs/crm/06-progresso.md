# 06 — Log de progresso da reforma do CRM

Uma entrada por prompt executado, do mais recente para o mais antigo.

**Formato de cada entrada:**

```
## Pn — <nome> · <data> · <modelo>
**Feito:** o que saiu de fato
**Arquivos:** o que foi tocado
**Pendente:** o que ficou em aberto e depende de quem
**Riscos:** o que pode morder depois
```

---

## P4 — Plano de migração de dados · 2026-08-13 · Opus

**Feito:**
- `docs/crm/03-migracao.md` — plano EXPAND → BACKFILL → SWITCH → CONTRACT, com regras de classificação,
  dedup de empresas, de-para de origem, preservação de IDs, reversibilidade por fase, validação de
  backup e checklist pós-migração.
- `scripts/auditoria-crm.ts` — script de auditoria pré-migração, **100% somente leitura** (item 1 do P4).
  Roda com `npx tsx --tsconfig tsconfig.server.json scripts/auditoria-crm.ts`.
- Executado contra o banco de **dev**: rodou limpo, mas os números são de `seed:demo` e **não servem**
  para decidir a migração.
- Q2 e Q3 **reabertas** em `01-decisoes.md` — tinham sido marcadas como resolvidas, mas os dados que as
  fechariam vieram de base demo.

**Arquivos:** `docs/crm/03-migracao.md` (novo), `scripts/auditoria-crm.ts` (novo),
`docs/crm/01-decisoes.md` (Q2/Q3 reabertas), `docs/crm/06-progresso.md` (novo).

**Verificação:** `npx eslint scripts/auditoria-crm.ts` → limpo.
`npx tsc --noEmit -p tsconfig.server.json` (com `--max-old-space-size=8192`, senão estoura heap) → 2 erros,
ambos **pré-existentes** em `src/lib/backup-storage.test.ts` (commit `d27e270`), nenhum no código novo.
`next build` não rodado: nada do bundle mudou e o CLAUDE.md alerta contra buildar com `next dev` ativo.

**Pendente (bloqueia o P5):**
- ⛔ **Rodar o script contra PRODUÇÃO** e colar a saída em `03-migracao.md` §1. O plano tem um GATE:
  conforme o volume real, ele é executado como está, encolhe, ou é descartado.
- Decisão §2.1 — ordem entre as regras R6/R7 (lead perdido que já era cliente conta como perda real?).
- Decisão §2.2 — leads arquivados viram `excluidoEm` ou registro vivo com status terminal? (recomendo o 2º).
- Confirmação da nomenclatura `Negociacao`/`DisciplinaPadrao` (`02-schema.md` §8.1).

**Riscos:** os 7 listados em `03-migracao.md` §10. Os dois que mais mordem: token/numeração de proposta
já estão em e-mails de clientes reais (imutáveis), e o soft delete em `Cliente` respinga em módulos fora
do CRM (Projeto, Lancamento, Documento…).

---

## P3 — Schema alvo · 2026-08-13 · Sonnet

**Feito:** `docs/crm/02-schema.md` — diagrama ER em Mermaid, definição Prisma de cada entidade, índices
com a query que cada um serve, unicidade parcial de CNPJ, derivação do status comercial da Empresa.
Schema real **não** foi tocado; nenhuma migration gerada.

**Arquivos:** `docs/crm/02-schema.md` (novo).

**Pendente:** confirmação da nomenclatura (§8.1) — `Opportunity` virou `Negociacao` e `Discipline` virou
`DisciplinaPadrao` para não colidir com `Oportunidade` e `Disciplina`, que já existem no schema.

**Riscos:** documentados em §8. Destaques: o funil de prospecção deixa de ser configurável (`FunilEtapa`)
e vira enum fixo — perda deliberada de flexibilidade em troca de eliminar o `etapaEhPerdido()` por
substring; e `Proposta.projetoId` deixa de ser o único caminho para o `Projeto` (ADR-06), o que cria
dois lugares respondendo "de onde veio esse projeto".

---

## P2 — Decisões de produto (ADR) · 2026-08-13 · Sonnet

**Feito:** `docs/crm/01-decisoes.md` — 16 ADRs (tabela A.3) + 7 decisões transversais (LGPD, permissões,
soft delete, moeda, timezone, enums/labels, Timeline × AuditLog). Defaults do playbook aceitos, com uma
exceção: **ADR-15 revisado** — o usuário optou por manter as permissões atuais (`comercial:ver`/`gerir`,
sem gate de dono), descartando o default "edita só responsável + admin".

**Arquivos:** `docs/crm/01-decisoes.md`.

**Pendente:** Q2 e Q3 (ver P4).

**Riscos:** conflitos com o código atual registrados ADR a ADR. O mais direto: `excluirOportunidade`
faz hard delete hoje e passa a ser soft delete — mudança de comportamento visível para quem usa.

---

## P1 — Auditoria do Comercial · 2026-08-13 · Sonnet

**Feito:** `docs/crm/00-auditoria.md` — modelo de dados, código, comportamento real, classificação
REAPROVEITAR/EVOLUIR/MIGRAR/DEPRECIAR, 11 inconsistências e 9 riscos de migração.

**Arquivos:** `docs/crm/00-auditoria.md`.

**Achado principal:** o model `Oportunidade` tem um comentário no schema dizendo "estágio entre Lead e
Proposta", mas **não tem FK para nenhum dos dois** — é uma feature isolada, com Kanban próprio, que
nunca se conectou ao fluxo real. Zero testes cobrem o módulo Comercial (0 de 186 arquivos de teste).

**Pendente na época:** contagens de volume — o banco de dev estava fora do ar (`ECONNREFUSED`).
Resolvido no P4 com `scripts/auditoria-crm.ts`, mas os números continuam sendo de demo.

---

## P0 — Reconhecimento do repositório · 2026-08-13 · Sonnet

**Feito:** resposta em chat (sem arquivo, conforme o playbook): stack, organização, como são feitas as
mutações, camada de services, comandos, testes, permissões, multi-tenant, timezone/moeda, riscos.

**Achados que valem para todas as fases:** não é multi-tenant (nenhum `tenantId` no schema); toda mutação
passa por `defineAction` com auditoria automática; valores monetários já são `Decimal(14,2)`; o Comercial
não tem nenhum teste.
