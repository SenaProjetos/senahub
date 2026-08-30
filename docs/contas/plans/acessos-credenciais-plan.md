# PLANO DE IMPLEMENTAÇÃO: MÓDULO "ACESSOS E CREDENCIAIS"

**Data do plano:** 2026-08-28  
**Especificação:** `docs/contas/specs/acessos-credenciais.md`  
**Status:** 🟢 **Fases 1–4 concluídas** (2026-08-28 / 2026-08-30) · Fases 5–8 não iniciadas

| Fase | Estado |
|---|---|
| 1 — Schema, criptografia, permissões | ✅ concluída e validada (+ favoritos §41) |
| 2 — Server Actions + autorização | ✅ concluída (2a+2b+2c) |
| 3 — Queries, filtros, busca | ✅ concluída |
| 4 — Página, tabela, drawer | ✅ concluída (referência visual fornecida) |
| 5 — Reveal, copy, auditoria | ⬜ não iniciada |
| 6 — Formulário criar/editar | ⬜ não iniciada |
| 7 — Licenças, alertas, projetos | ⬜ não iniciada |
| 8 — Testes, docs, polish | ⬜ não iniciada |

> **Como ler os checkboxes:** `[x]` significa "um comando confirmou". Até 2026-08-28 o documento
> tinha 49 itens marcados de fases que nunca rodaram — foram todos zerados e só os da Fase 1
> foram remarcados, contra saída real de comando.

---

## RESUMO EXECUTIVO

Implementação incremental do módulo **Acessos e Credenciais** — um cofre corporativo de contas, portais, softwares e licenças, com controle de permissões granular, auditoria automática e criptografia server-side.

**Arquitetura:**
- Backend: Server Actions (`defineAction`) + Prisma + `node:crypto` AES-256-GCM
- Frontend: Página `/acessos` + drawer de detalhes + tabela paginada
- Banco: **6** modelos (`Credencial`, `CredencialCategoria`, `CredencialCompartilhamento`, `CredencialProjeto`, `CredencialTag`, `CredencialFavorito`) + reuso do `AuditLog` existente
- Segurança: Application-layer IDOR gates (padrão SENAHub), permissões via `defineAction`, revelação auditada

**Fases:** 8 fases, cada uma entregável e testável isoladamente.

---

## PENDÊNCIAS / DECISÕES BLOQUEANTES

### 1. Imagem de Referência Visual (§3)

**Status:** ❌ NÃO ENCONTRADA

A spec referencia uma imagem na `docs/contas/` como referência visual principal para hierarquia, densidade e linguagem estética (§3). A pasta existe, mas não contém nenhuma imagem.

**Decisão necessária:**
- [ ] Fornecer a imagem de referência antes da Fase 4 (UI)
- [ ] Ou confirmar: usar exemplos visuais de módulos similares (clientes, projetos) e dar liberdade de design dentro do design system

**Impacto:** Bloqueia aceitação dos critérios visuais de Fase 4 e Fase 5.

---

### 2. Entidades de Compartilhamento (§28)

**Conflito:** A spec oferece `Departamento | Cargo | Setor | Usuários específicos | Restrito`, mas o SENAHub está no meio da reforma Onda D (Setor × Contratação × Perfil de acesso).

**Status:** ✅ RESOLVIDO

Mapeamento definitivo:
- `usuario` → Usuário específico (sempre suportado)
- `perfil` → PerfilAcesso (sempre suportado)
- `setor` → Enum Setor existente (suportado; é endereço, não permissão, e a UI vai apenas filtrar/reparar)
- `departamento` → Vestigial; verificar em `modules/rh/` se população existe. Se vazio, oferecer em Fase 2.
- `cargo` → Vestigial; mesmo padrão.

**Ação:** Grep `Departamento.id` no seed para confirmar populated; se 0, anotar em Fase 1 e marcar como Fase 2.

---

### 3. Endpoint de Revelação (§48)

**Conflito:** Spec propõe `POST /api/access-vault/:id/reveal`, mas CLAUDE.md §54 proíbe REST sob `src/app/api/` exceto multipart/public-token/streaming/health.

**Status:** ✅ RESOLVIDO

**Solução:** Usar Server Action `revelarCredencial()` via `defineAction()`. 

**Trade-offs:**
- ✅ Ganha: sessão + permissão + Zod + auditoria automática (steps 1–6 da spec §48)
- ✅ Ganha: CSRF token automático (Next built-in)
- ⚠️ Perde: Header `Cache-Control: no-store` explícito. **Mitigação:** Server Action POST responses nunca entram cache HTTP (comportamento Next 15); documentar no relatório final.

**Fluxo:**
```
Frontend clica "Visualizar" → Next POST /acessos/[id] (formulário oculto)
→ revelarCredencial(id) via defineAction
→ Middleware: sessão ✓, permissão:acessos:credencial ✓, CompartilhamentoCheck ✓
→ Decrypt server-side, log auditoria, retorna plaintext
→ Frontend exibe 30s, fade-out automático
```

---

### 4. Criptografia de Senhas (§45–47)

**Status:** ✅ RESOLVIDO

**Escolha:** `node:crypto` AES-256-GCM. Não adiciona dependência (existe em Node.js nativo).

**Por quê:**
- ✅ Autenticada (não apenas confidencial)
- ✅ IV aleatório por criptografia (não reutilização)
- ✅ keyVersion para rotação futura (sem migration)
- ✅ Testável (módulo puro em `lib/encryption.ts`)

**Armazenamento:**
```json
{
  "encrypted": {
    "iv": "base64(12 bytes)",
    "authTag": "base64(16 bytes)",
    "ciphertext": "base64(encrypted)",
    "keyVersion": 1
  }
}
```

**Env var:** `ACESSOS_ENCRYPTION_KEY` — 32 bytes em base64. Boot falha se ausente ou comprimento errado.

---

### 5. RLS (§52)

**Status:** ✅ NÃO APLICÁVEL

SENAHub não usa PostgreSQL Row-Level Security:
- Prisma Client único (não múltiplos roles de DB por request)
- Autorização é **application-layer** via `defineAction` + `escopoProjeto`-style `where` filtering
- Cada query de leitura `where` inclui o filtro de acesso

**Defesa IDOR:** Sempre fetch-then-check via `where` clause, nunca fetch-all-then-filter.

---

### 6. Soft Delete vs. Hard Delete (§53)

**Status:** ✅ RESOLVIDO

**Decisão:** Usar soft delete com coluna `deletadoEm: DateTime?` (padrão SENAHub para `Lancamento`).

**Razão:** Credenciais deletadas acidentalmente causam impacto operacional alto. Admin pode restaurar. `deletadoEm IS NULL` em toda leitura (padrão Prisma extension em `lib/prisma.ts`).

---

## FASES DE IMPLEMENTAÇÃO

### **FASE 1 — SCHEMA, CRIPTOGRAFIA, PERMISSÕES** ⏱ Estimado: 1d

**Objetivo:** Fundação segura — dados + crypto puro + permissões.

#### Arquivos a Criar

**`src/lib/encryption.ts`**
- Funções: `criptografarSenha(plaintext: string): Promise<EncryptedPayload>`
- Função: `descriptografarSenha(payload: EncryptedPayload): Promise<string>`
- Type: `EncryptedPayload = { iv, authTag, ciphertext, keyVersion }`
- Validação: `ACESSOS_ENCRYPTION_KEY` env var em boot
- Testes: `src/lib/encryption.test.ts` (node env)

**`prisma/migrations/YYYYMMDD[...]/migration.sql`**
```sql
-- Categóricas
CREATE TABLE IF NOT EXISTS "credencial_categoria" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome VARCHAR(100) NOT NULL UNIQUE,
  icone VARCHAR(50),
  ativo BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT now()
);

-- Principal
CREATE TABLE IF NOT EXISTS "credencial" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome VARCHAR(150) NOT NULL,
  nomeCompleto VARCHAR(255),
  categoriaId TEXT NOT NULL REFERENCES "credencial_categoria"(id),
  estado VARCHAR(2), -- UF ou NULL/Nacional
  descricao TEXT,
  url VARCHAR(2000),
  -- Credencial criptografada (JSON com iv/authTag/ciphertext/keyVersion)
  usuarioEncriptado VARCHAR(500),
  senhaEncriptada TEXT,
  -- Gestão
  responsavelId TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  departamento VARCHAR(100), -- Fase 2
  status VARCHAR(50) NOT NULL DEFAULT 'ativo', -- ativo | atencao | expirado | bloqueado | inativo
  -- Validade
  vencimentoEm DATE,
  proximaRevisaoEm DATE,
  ultimaRevisaoEm TIMESTAMP,
  renovacaoAutomatica BOOLEAN NOT NULL DEFAULT false,
  -- Licença (Phase 2: campos apenas quando categoria = Software/Licença)
  fornecedor VARCHAR(255),
  tipoLicenca VARCHAR(100),
  numeroLicenca VARCHAR(255),
  assentos INT,
  dataContratacao DATE,
  dataRenovacao DATE,
  -- Soft delete
  deletadoEm TIMESTAMP,
  -- Auditoria
  criadoEm TIMESTAMP NOT NULL DEFAULT now(),
  criadoPorId TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  atualizadoEm TIMESTAMP NOT NULL DEFAULT now(),
  atualizadoPorId TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  @@index([categoriaId])
  @@index([responsavelId])
  @@index([status])
  @@index([vencimentoEm])
  @@index([deletadoEm])
  @@map("credencial")
);

-- Compartilhamento: quem vê o cadastro / quem vê a credencial
CREATE TABLE IF NOT EXISTS "credencial_compartilhamento" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  credencialId TEXT NOT NULL REFERENCES "credencial"(id) ON DELETE CASCADE,
  -- Alvo: usuario | perfil | setor
  tipoAlvo VARCHAR(50) NOT NULL,
  alvoId TEXT NOT NULL, -- userId | perfilId | valor de enum Setor
  -- Dois nivels
  podeVerCadastro BOOLEAN NOT NULL DEFAULT false,
  podeVerCredencial BOOLEAN NOT NULL DEFAULT false,
  podeEditar BOOLEAN NOT NULL DEFAULT false,
  podeGerenciarPermissoes BOOLEAN NOT NULL DEFAULT false,
  criadoEm TIMESTAMP NOT NULL DEFAULT now(),
  @@unique([credencialId, tipoAlvo, alvoId])
  @@index([credencialId])
  @@index([tipoAlvo])
  @@map("credencial_compartilhamento")
);

-- Projetos associados
CREATE TABLE IF NOT EXISTS "credencial_projeto" (
  credencialId TEXT NOT NULL REFERENCES "credencial"(id) ON DELETE CASCADE,
  projetoId TEXT NOT NULL REFERENCES "projeto"(id) ON DELETE CASCADE,
  PRIMARY KEY (credencialId, projetoId)
  @@map("credencial_projeto")
);

-- Tags
CREATE TABLE IF NOT EXISTS "credencial_tag" (
  credencialId TEXT NOT NULL REFERENCES "credencial"(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  PRIMARY KEY (credencialId, tag)
  @@map("credencial_tag")
);

-- Histórico (Fase 2): reutilizar AuditLog com modulo="acessos"
-- Índices para buscas frequentes
CREATE INDEX idx_credencial_estado ON "credencial"(estado) WHERE "deletadoEm" IS NULL;
CREATE INDEX idx_credencial_categoria_status ON "credencial"(categoriaId, status) WHERE "deletadoEm" IS NULL;
```

#### Arquivos a Alterar

**`prisma/schema.prisma`** — adicionar models:
```prisma
model CredencialCategoria {
  id        String       @id @default(cuid())
  nome      String       @unique
  icone     String?
  ativo     Boolean      @default(true)
  createdAt DateTime     @default(now())
  credenciais Credencial[]

  @@map("credencial_categoria")
}

model Credencial {
  id         String    @id @default(cuid())
  nome       String    @db.VarChar(150)
  nomeCompleto String? @db.VarChar(255)
  
  // Categorização
  categoriaId String
  categoria   CredencialCategoria @relation(fields: [categoriaId], references: [id])
  estado      String? // UF (AC..TO) ou NULL
  descricao   String?
  url         String? @db.VarChar(2000)
  
  // Credenciais (sempre criptografadas)
  usuarioEncriptado String? @db.VarChar(500)
  senhaEncriptada String?
  
  // Gestão
  responsavelId String?
  responsavel   User? @relation(fields: [responsavelId], references: [id], onDelete: SetNull)
  departamento  String? // Fase 2
  status        String @default("ativo") // ativo | atencao | expirado | bloqueado | inativo
  
  // Validade
  vencimentoEm        DateTime? @db.Date
  proximaRevisaoEm    DateTime? @db.Date
  ultimaRevisaoEm     DateTime?
  renovacaoAutomatica Boolean   @default(false)
  
  // Licença (preenchido quando categoria = Software/Licença)
  fornecedor        String?
  tipoLicenca       String?
  numeroLicenca     String?
  assentos          Int?
  dataContratacao   DateTime? @db.Date
  dataRenovacao     DateTime? @db.Date
  
  // Soft delete
  deletadoEm DateTime?
  
  // Auditoria
  criadoEm      DateTime @default(now())
  criadoPorId   String?
  criadoPor     User?    @relation("CredencialCriadoPor", fields: [criadoPorId], references: [id], onDelete: SetNull)
  atualizadoEm  DateTime @default(now())
  atualizadoPorId String?
  atualizadoPor User?   @relation("CredencialAtualizadoPor", fields: [atualizadoPorId], references: [id], onDelete: SetNull)
  
  // Relacionamentos
  compartilhamentos CredencialCompartilhamento[]
  projetos CredencialProjeto[]
  tags CredencialTag[]
  
  @@index([categoriaId])
  @@index([responsavelId])
  @@index([status])
  @@index([vencimentoEm])
  @@index([deletadoEm])
  @@map("credencial")
}

model CredencialCompartilhamento {
  id String @id @default(cuid())
  
  credencialId String
  credencial   Credencial @relation(fields: [credencialId], references: [id], onDelete: Cascade)
  
  // Alvo: usuario | perfil | setor
  tipoAlvo String // TipoAlvoCompartilhamento enum
  alvoId   String // userId | perfilId | Setor enum value
  
  // Dois níveis independentes
  podeVerCadastro      Boolean @default(false)
  podeVerCredencial    Boolean @default(false)
  podeEditar           Boolean @default(false)
  podeGerenciarPermissoes Boolean @default(false)
  
  criadoEm DateTime @default(now())
  
  @@unique([credencialId, tipoAlvo, alvoId])
  @@index([credencialId])
  @@index([tipoAlvo])
  @@map("credencial_compartilhamento")
}

model CredencialProjeto {
  credencialId String
  credencial   Credencial @relation(fields: [credencialId], references: [id], onDelete: Cascade)
  
  projetoId String
  projeto   Projeto @relation(fields: [projetoId], references: [id], onDelete: Cascade)
  
  @@id([credencialId, projetoId])
  @@map("credencial_projeto")
}

model CredencialTag {
  credencialId String
  credencial   Credencial @relation(fields: [credencialId], references: [id], onDelete: Cascade)
  tag          String
  
  @@id([credencialId, tag])
  @@map("credencial_tag")
}
```

**`src/lib/permissions-catalog.ts`** — adicionar recurso:
```typescript
{
  recurso: "acessos",
  label: "Acessos e Credenciais",
  acoes: [
    { acao: "ver", label: "Ver acessos cadastrados", leitura: true },
    { acao: "gerir", label: "Criar/editar acessos" },
    { acao: "credencial", label: "Revelar credenciais" },
    { acao: "permissoes", label: "Gerenciar permissões de acesso" },
    { acao: "auditoria", label: "Ver histórico de auditoria", leitura: true },
    { acao: "categorias", label: "Gerenciar categorias" },
  ],
}
```

#### Alterações no Banco

- Migration com **5** tabelas + índices (o plano dizia 4 — `CredencialTag` não tinha sido contada)
- Sem RLS (application-layer only)
- Soft delete via coluna `deletadoEm`. **A extension do Prisma NÃO entra aqui** — é Fase 2,
  junto com as queries que dependem dela. Até lá, `deletadoEm` é só uma coluna.

#### Riscos

1. **Env var ausente em produção:** Boot falha, módulo não funciona. ✅ Controlado (fail-closed).
2. **Key rotation:** Schema suporta (keyVersion), implementação em Fase 6.

#### Dependências

Nenhuma. Fase independente.

---

#### ✅ EXECUÇÃO — 2026-08-28

**Critérios de Validação** (marcado só o que um comando confirmou)

- [x] Migration roda sem erro — `20260828170000_acessos_credenciais_fase1` aplicada e registrada;
      ensaiada num schema descartável (24 statements, 5 tabelas, 8 FKs, 18 índices) para provar
      que executa do zero, não só que o banco atual bate. `prisma migrate status` → *up to date*.
- [x] Modelos Prisma compilam — `npm run db:generate` OK; `User` e `Projeto` ganharam os lados
      opostos das relações (sem eles o `generate` falhava com 4 erros de validação).
- [x] `src/lib/encryption.test.ts` testa criptografia bidirecional — **12 testes**, incluindo
      "plaintext não aparece no payload" (§90), authTag adulterada, authTag de tamanho inválido
      e keyVersion desconhecida. Suíte cheia: 2787 testes / 266 arquivos, tudo verde.
- [x] Env var validado — falha fechada coberta por teste (ausente → `{ok:false}`; 16 bytes →
      `{ok:false}`), via `vi.resetModules()` porque a chave é cacheada na primeira leitura.
- [x] Permissões aparecem em `permissions-catalog.ts` — recurso `acessos` com 6 ações.
- [x] **Permissões materializadas no banco** (não estava na lista original e é o que de fato
      libera o recurso): `PERMISSOES_BASE` em `prisma/seed.ts` + `db:seed` → **5 linhas** em
      `Permissao` e 5 em `PermissaoPerfil`. O catálogo sozinho só desenha a tela.
      São 5 e não 6 porque `acessos:credencial` fica fora da semente (decisão do dono — ver
      "DECISÕES DO DONO"); revelar senha é concessão explícita, nunca herdada de `gerir`.
- [x] **Favoritos (§41)** — `CredencialFavorito` criada na migration `20260828180000`.
      Verificado no banco: duplicata bloqueada pela PK composta, e apagar a credencial
      remove os favoritos por cascade.
- [x] `ACESSOS_ENCRYPTION_KEY` documentada — `CLAUDE.md` (env list + `lib/`) e `docs/DEPLOY.md`
      (§5 + tabela de troubleshooting).

**Pendente da Fase 1** (não bloqueia Fase 2, mas bloqueia execução real)

- [ ] `ACESSOS_ENCRYPTION_KEY` presente em `.env`, `.env.example` e `.env.production.example` —
      **o agente não tem permissão de escrita em `.env*`; o dono precisa colar a chave à mão.**
      Sem ela, qualquer chamada a `criptografarSenha`/`descriptografarSenha` lança. Os testes
      não dependem disso (definem a própria chave), por isso a suíte passa mesmo sem.

**Comandos efetivamente rodados**

```bash
npx prisma db push                                  # aplicou sem reset (skill nova-migracao)
npx prisma migrate diff --from-empty --to-schema … # gerou o DDL das migrations
npx prisma migrate resolve --applied 20260828170000_acessos_credenciais_fase1
npx prisma migrate resolve --applied 20260828180000_acessos_favoritos
npm run db:generate                                 # OK
npm run db:seed                                     # 128 permissões + 8 perfis (podou credencial)
npx vitest run                                      # 2787 passed / 266 files
npm run lint                                        # limpo
npx prisma migrate status                           # Database schema is up to date!
# ensaio das 2 migrations em schema descartável: 28 statements, 6 tabelas, 10 FKs
```

**Migrations desta fase**

| Migration | Conteúdo |
|---|---|
| `20260828170000_acessos_credenciais_fase1` | 5 tabelas base do cofre |
| `20260828180000_acessos_favoritos` | `credencial_favorito` (§41, decisão do dono) |

**Desvios do plano, e por quê**

| Plano dizia | O que foi feito | Motivo |
|---|---|---|
| `npm run db:migrate` | `db push` + `migrate diff` + `migrate resolve` | `migrate dev` exigia **reset** por drift pré-existente (índices de `pendencia`, alheio a esta fase). A skill `.claude/skills/nova-migracao` manda explicitamente não aceitar o reset. Nenhum dado de dev foi perdido. |
| migration escrita à mão | migration **gerada pelo Prisma** | A versão manual tinha 4 divergências contra o schema: FK `credencial_tag_credencialId_fkey` faltando, 2 índices que o schema não declarava, e `status VARCHAR(50)` onde o schema pedia `TEXT`. |
| índices só em `credencial` | `+ @@index([projetoId])` em `CredencialProjeto`, `+ @@index([tag])` em `CredencialTag` | A PK composta indexa só o prefixo. Sem eles, "acessos deste projeto" (§39) e busca por tag (§31) fazem seq scan. |
| seed de credenciais demo | **não feito** | O plano coloca o seed de dados demo na Fase 2 (junto das actions que criptografam). Só as permissões entraram aqui. |

---

### **FASE 2 — SERVER ACTIONS + AUTORIZAÇÃO** ⏱ Estimado: 2d

**Objetivo:** Backend completo com gates seguro, IDOR-proof, auditado.

#### Arquivos a Criar

**`src/modules/acessos/schemas.ts`**
- Zod schemas para criar/editar credencial
- Schema para compartilhamento
- Validações: URL, UF enum, categoria obrigatória, senha não-vazia

**`src/modules/acessos/queries.ts`** (server-only)
- `listarCredenciaisPaginado(opts)` → lista sem senhas
- `buscarCredencial(id)` → sem senha
- `buscarCredencialComSecretos(id)` → SÓ COM AUTORIZAÇÃO (audit log)
- `escopoCredencial(viewer)` → Prisma.CredencialWhereInput (IDOR gate)
- `listarFiltrosAcessos()` → categorias, estados, UFs, responsáveis

**`src/modules/acessos/actions.ts`** (Server Actions via defineAction)

1. **`criarCredencial()`**
   - Entrada: nome, categoria, url, usuário, senha, responsável, compartilhamento
   - Criptografa senha antes de INSERT
   - Audita: `credencial_criada`
   - Redact: `["senha"]`

2. **`atualizarCredencial()`**
   - Valida `acessos:gerir`
   - Se senha fornecida, criptografa
   - Captura antes/depois para auditoria
   - Audita: `credencial_atualizada`

3. **`revelarCredencial(id)`** ⚠️ SENSÍVEL
   - Valida `acessos:credencial` **+** compartilhamento individual
   - Descriptografa server-side
   - Retorna apenas para aquele request (não cacheable)
   - Audita: `credencial_revelada` (sem plaintext)
   - Redact: `["senhaDescriptografada"]` em detalhe

4. **`copiarSenha(id)`**
   - Valida `acessos:credencial` **+** compartilhamento
   - SÓ faz auditoria, não retorna plaintext
   - Audita: `credencial_copia_senha`
   - FrontEnd depois chama revelarCredencial e copia do DOM

5. **`copiarUsuario(id)`**
   - Mesma validação
   - Audita: `credencial_copia_usuario`

6. **`gerenciarCompartilhamento(id, targets[])`**
   - Valida `acessos:permissoes` **+** proprietário ou global
   - Substitui compartilhamentos antigos
   - Audita: `credencial_compartilhamento_alterado`

7. **`desativarCredencial(id)`** / **`reativarCredencial(id)`**
   - Soft delete
   - Audita: `credencial_desativada` / `credencial_reativada`

8. **`marcarComoRevisada(id)`**
   - Atualiza `ultimaRevisaoEm`
   - Audita: `credencial_revisada`

**`src/modules/acessos/service.ts`** (lógica pura)
- `verificarCompartilhamentoCredencial(userId, credencialId)` → { podeVerCadastro, podeVerCredencial, ... }
- `obterStatusCredencial(credencial)` → string (ativo | atencao | expirado | bloqueado)
- `gerarAlertasCredenciais()` → Array<{ credencialId, tipo, mensagem }> (para Fase 5)

#### Arquivos a Alterar

**`src/lib/prisma.ts`** — estender extension para `Credencial` soft delete:
```typescript
// Extensão existente para Lancamento; expandir para Credencial
$extends({
  query: {
    credencial: {
      async findUnique(args) {
        args.where = { ...args.where, deletadoEm: null };
        return prisma.credencial.findUnique(args);
      },
      async findMany(args) {
        args.where = { ...args.where, deletadoEm: null };
        return prisma.credencial.findMany(args);
      },
      // ... findFirst, etc.
    },
  },
})
```

**`prisma/seed.ts`** — adicionar seed:
```typescript
// 3 categorias demo
await prisma.credencialCategoria.createMany({
  data: [
    { nome: "Corpo de Bombeiros", icone: "Flame" },
    { nome: "CREA", icone: "Landmark" },
    { nome: "Software", icone: "Monitor" },
  ],
});

// 5 credenciais demo (senhas dummy: criptografadas no seed)
await prisma.credencial.create({
  data: {
    nome: "CBMMG",
    nomeCompleto: "Corpo de Bombeiros Militar de Minas Gerais",
    categoriaId: categories[0].id,
    estado: "MG",
    url: "https://bombeiros.mg.gov.br",
    usuarioEncriptado: criptografarSenha("demo@user"),
    senhaEncriptada: criptografarSenha("demo@pass"),
    responsavelId: adminId,
    status: "ativo",
    compartilhamentos: {
      create: [
        { tipoAlvo: "usuario", alvoId: adminId, podeVerCadastro: true, podeVerCredencial: true },
      ],
    },
  },
});
```

#### Alterações no Banco

Nenhuma (migration anterior).

#### Riscos

1. **Autorização falha (escopoCredencial):** Usuário vê credencial que não deveria. **Mitigação:** Smoke test (Fase 5) testa todos os 5 cenários de §84.
2. **Revelação sem registro:** Auditoria falha silenciosamente. **Mitigação:** `defineAction` com `audit: false` é explícito; padrão é `true`.

#### Dependências

Fase 1 (schema, crypto).

---

#### ✅ EXECUÇÃO — 2026-08-30

Entregue em três fatias, cada uma com commit próprio. A divisão foi feita porque escrever oito
actions — incluindo a de revelar senha — antes de verificar qualquer coisa concentra o risco
exatamente onde ele é mais caro.

| Fatia | Commit | Conteúdo |
|---|---|---|
| 2a | `a79f8c5` | `service.ts` (puro) + `schemas.ts` + `queries.ts` + `smoke-acessos.ts` |
| 2b | `2f4dab9` | 7 actions de CRUD com gate por registro |
| 2c | `8cd9704` | `revelarCredencial` + `copiarCredencial` + smoke dos dois gates |

**Critérios de Validação**

- [x] Actions compilam — `tsc --noEmit` sem erro; `npm run build` compila (o build é o que
      valida `"use server"`, que `tsc` não checa).
- [x] Schemas Zod validam entrada — inclui a URL do portal restrita a `http/https`, porque
      `javascript:` viraria XSS no botão "Abrir plataforma" (§55) com href vindo do banco.
- [x] Encrypt/decrypt bidirecional — o smoke lê a coluna **crua** via SQL, como quem abrisse o
      dump: sem plaintext, envelope AES-GCM, decifra de volta, IV distinto a cada gravação.
- [x] Permissões — **32 checagens verdes** no `npm run smoke:acessos`, contra o banco real.
- [x] AuditLog — `defineAction` grava `detalhe: input` e **nunca o retorno** (verificado em
      `with-action.ts:118`, não presumido); `redact: ["usuario","senha"]` nas actions que os
      recebem.
- [x] Suíte completa: 2826 testes / 268 arquivos. Lint limpo.

**Os dois gates** (o ponto da fase)

Toda action passa por dois, e o segundo é o que importa:

1. `defineAction({ recurso: "acessos" })` — gate de TELA: "esta pessoa mexe no módulo?"
2. `exigir()` / `revelarCredencialPara()` — gate de REGISTRO: "…nesta credencial específica?"

Sem o segundo, quem tem `acessos:gerir` editaria (ou leria) qualquer credencial trocando o id no
payload — o IDOR da §83. `defineAction` não conhece compartilhamento; essa metade é sempre do
módulo. **É invisível na leitura**: sem o gate 2, o caminho autorizado continua funcionando
igual. Por isso o smoke tem o caso que o distingue — usuário COM `acessos:credencial` e SEM
`podeVerCredencial` naquele registro.

**Decisões tomadas durante a execução, que não estavam no plano**

| O que | Por quê |
|---|---|
| `SessionUser` ganhou **`setor`** | Sem ele `ViewerCofre.setor` seria sempre `null` e todo compartilhamento por SETOR falharia **em silêncio** — o modo de falha mais caro, porque parece funcionar. O dado já era cache denormalizado em `User`, no round-trip que `getSession` já fazia. Não autoriza nada. |
| `reativarCredencial` exige **`superUsuario`** | Soft-deletada, a credencial sai do escopo de todos — `exigir()` responderia "não encontrado" até para quem a criou, e afrouxar o escopo para permitir restaurar reabriria a porta que o soft delete fechou. |
| **Responsável não revela** | Ganha `verCadastro` + `editar`, nunca `verCredencial`. Se ser responsável desse a senha, definir alguém como responsável viraria porta lateral para o cofre. Custo assumido: revisar (§44) exige concessão explícita. |
| `copiarCredencial` **devolve o valor** | O desenho original (auditar aqui, UI chama `revelar` para pegar o texto) faria cada cópia disparar dois eventos e duas autorizações, e deixaria no histórico uma revelação que ninguém viu. Uma chamada, uma autorização, um evento. |
| Mensagem de recusa **única** | A primeira versão carregava o motivo na `ActionError` — que é exibida ao usuário. Isso recriava o oráculo de existência da §84: varrer ids e ler a diferença entre "não encontrada" e "sem permissão" mapearia o cofre sem acesso a nada. |
| `viewerDe` mora em `queries.ts` | Em `actions.ts` vale `"use server"`, onde todo export vira endpoint RPC chamável pelo cliente — uma função que recebe o usuário por argumento seria convite a forjar um. |
| Gates dentro de `revelarCredencialPara` | Actions dependem de sessão e não são chamáveis de script. Pondo os gates na função, o smoke consegue exercitá-los. |

**Cobertura do smoke** (`npm run smoke:acessos`)

```
A  admin (superUsuario)      vê tudo, inclusive credencial sem compartilhamento
B  autorizado por perfil     vê cadastro + revela · não alcança a não compartilhada
C  limitado por setor        vê cadastro · NÃO revela (§27)
D  estranho                  não encontra o registro (§84-D)
E  responsável               vê e edita · NÃO revela
   soft delete               some até para o admin; volta com incluirDeletadas
   criptografia em repouso   coluna crua sem plaintext, IV por operação (§83/§90)
   revelação                 gate de tela sozinho recusa · gate de registro sozinho recusa ·
                             os dois juntos revelam · id alheio recusa · id inexistente recusa ·
                             usuário inativo recusa
```

**Pendente da Fase 2**

- [ ] Chamar as actions ponta a ponta (com sessão real) — só é possível pela UI, na Fase 4.
      O smoke cobre os gates; o que falta é o trajeto HTTP.

---

### **FASE 3 — QUERIES, FILTROS, BUSCA** ⏱ Estimado: 1d

**Objetivo:** Listagem eficiente com filtros/busca server-side, sem overloading.

#### Arquivos a Criar

**`src/modules/acessos/queries.ts`** — expandir com:

1. **`listarCredenciaisPaginado(opts)`**
   - Entrada: `{ q?, categoria?, estado?, responsavel?, status?, projeto?, sort, dir, skip, take }`
   - Saída: `{ items: Credencial[], total: number }`
   - Filtro full-text: `nome | nomeCompleto | descricao | tags` (ilike, case-insensitive)
   - Scope via `escopoCredencial(viewer)` (nunca traz credencial que usuário não pode ver)
   - Exclui senha (sempre)
   - Ordenação: nome, categoria, estado, responsável, vencimento, ultimaRevisao, status
   - N+1 prevention: SELECT com `include: { categoria: true, responsavel: { select: { id, name, image } } }`

2. **`buscarCredenciaisRapido(q)`** (Fase 5: suporte search global)
   - Query curtíssima (top 5)
   - Usada pelo global search (/search)

3. **`listarFiltrosAcessos()`** (precached)
   - `{ categorias: [...], estados: [...], responsaveis: [...], statuses: [...] }`
   - Cacheado 5 min

#### Arquivos a Alterar

**`src/lib/list-params.ts`** — suportado de novo (parsing já existe).

#### Riscos

1. **Full-text search lento:** `ilike` em coluna longa sem índice. **Mitigação:** PostgreSQL GIN index on `descricao` (migration posterior, Fase 2.5 opcional).

#### Dependências

Fase 2.

#### ✅ EXECUÇÃO — 2026-08-30 (commit `8444316`)

- [x] `listarCredenciaisPaginado` retorna paginado — 12 linhas renderizadas na tela real
- [x] Filtros isolados e combinados funcionam — todos passam por `escopoCredencial`
- [x] Busca cobre nome, nome completo, descrição, fornecedor, nº de licença e tags
- [x] Nenhuma senha vaza — `SELECT_LISTA` não tem os campos cifrados, e o smoke confirma

**Decisão:** a busca **não** cobre usuário/senha, apesar de §9 mencionar usuário. Estão
cifrados com IV aleatório: `LIKE` não casaria nada, e comparar exigiria decifrar a base inteira
a cada tecla. Registrado aqui para ninguém "consertar" isso depois.

**Contadores sob escopo:** indicadores, contagem por categoria e alertas usam
`escopoCredencial`. Um contador global diria quantas credenciais existem no cofre para quem não
alcança nenhuma — oráculo pelo agregado.

---

### **FASE 4 — PÁGINA + TABELA + DRAWER (VISUAL)** ⏱ Estimado: 2d

**Objetivo:** Interface de leitura: lista, filtros, categorias rápidas, drawer de visualização.

**Blocagem:** Requer imagem de referência (Pendência 1).

#### Arquivos a Criar

**`src/app/(dashboard)/acessos/page.tsx`**
- Layout: cabeçalho (título + botão "Novo Acesso") → cards indicadores → área atenção → search → filtros → categorias rápidas → tabela
- Padrão SENAHub: `parseListParams()`, `requirePermission()`, RSC com componente view
- Carregamento paralelo: `Promise.all([ listar(), filtros(), podeGerir() ])`

**`src/components/acessos/acessos-view.tsx`** (client)
- Estado: filtros, página, busca (via `useSetParams`)
- Renderiza: cards, alertas, search, filtros, categorias, tabela, paginação

**`src/components/acessos/acessos-table.tsx`** (client)
- Colunas: Plataforma, Categoria, UF, Responsável, Compartilhamento, Status, Ações
- Ações por linha: menu `...` → Abrir detalhes, Editar, Histórico, Duplicar, Desativar
- Loading: skeleton (SENAHub tem `Skeleton` em ui/)
- Empty state: "Nenhum acesso cadastrado" + botão "Criar"

**`src/components/acessos/acessos-drawer.tsx`** (client, usa Sheet)
- Aberto por clique em linha ou "Ver" button
- Abas/seções: Geral, Permissões, Projetos, Histórico (Fase 2)
- Seção Geral: nome, categoria, UF, URL, responsável, status, descrição, tags
- Seção Credencial (se perm):
  - Usuário: botão Copiar
  - Senha: oculta (`•••`), botão Visualizar (chama `revelarCredencial`), botão Copiar
  - Tooltip: "Esta ação será registrada no histórico de auditoria"
- Seção Permissões (se `acessos:permissoes`): multi-select de usuários/perfis/setores

**`src/components/acessos/indicadores-cards.tsx`**
- 4 cards compactos: Total, Portais públicos, Softwares, Restritos
- Cálculo simples: contadores de cada categoria no banco

**`src/components/acessos/area-atencao.tsx`**
- Renderiza alerts baseado em `gerarAlertasCredenciais()` (Fase 5)
- Cada alert: icon + nome credencial + mensagem + severidade (info/atencao/critico)
- Dismissable por padrão

**`src/components/acessos/categorias-rapidas.tsx`**
- Cards de filtro rápido (Bombeiros, CREA, Prefeituras, Softwares, Outros)
- Clique aplica filtro category automaticamente
- Ativo visual quando filtro está ativo

**`src/components/acessos/credencial-formulario.tsx`** (Fase 4, básico) / (Fase 5, completo)
- Campos: nome, nomeCompleto, categoria, UF, URL, usuário, senha, responsável, status, descrição
- Validação: Zod via `parseFormData()` ou form hook
- Botões: Salvar, Cancelar, Duplicar (Fase 2)

#### Arquivos a Alterar

**`src/lib/nav-config.ts`** — adicionar item:
```typescript
{
  title: "Acessos",
  href: "/acessos",
  icon: KeyRound, // ou ShieldCheck
  permissao: "acessos:ver",
  tipo: "interno",
},
```

**`src/components/ui/`** — reutilizar existentes:
- Button, Input, Select, Badge, Card, Skeleton, Drawer/Sheet, Dialog, Dropdown, Status-badge, Empty-state

#### Riscos

1. **Design não alinhado com sistema:** Spec §3 menciona referência visual, que não existe. **Mitigação:** Usar padrão SENAHub (densidad, cores, radius de projetos/clientes).
2. **Tabela com muitas colunas não cabe:** Fase responsiva (mobile) em Fase 5.

#### Dependências

Fase 1 + Fase 2 + Fase 3.

#### ✅ EXECUÇÃO — 2026-08-30 (commit `8444316`)

Referência visual fornecida pelo dono: `docs/contas/ref_img.png` (tela de Projetos do próprio
SenaHub). Dela vieram a densidade dos cards, o cabeçalho de tabela em maiúsculas pequenas, a
linha com nome + subtítulo e os badges discretos.

- [x] Referência fornecida e considerada
- [x] Página renderiza — verificada com Chrome headless sobre o app rodando, 12 linhas
- [x] Cards calculam sob o escopo do viewer
- [x] Filtros mudam e limpam pela URL (`useSetParams` reseta `page`)
- [x] Paginação — server-side via `parseListParams`
- [x] Clique na linha abre o drawer; drawer fecha
- [x] Empty state em dois sabores: "nenhum cadastrado" × "nenhum encontrado" (§56)
- [x] Skeleton enquanto o drawer carrega
- [x] Console sem erro nosso (os 404 são de `/socket.io`, que `npm run dev` não sobe)

**Busca sem debounce, de propósito.** O plano pedia 500ms; a busca é submit (Enter), não
`onChange`. Debounce dispara uma navegação a cada pausa de digitação e enche o histórico do
browser; §9 pede "não realizar pesquisas excessivas no servidor", e não buscar até o Enter
atende melhor que buscar a cada 500ms.

**Dois bugs achados por olhar a tela** — nenhum apareceria em teste ou tipo:

1. A coluna Status usava o campo GRAVADO, então TQS ("vence em 22 dias") e Autodesk ("vence em
   5 dias") apareciam como *Ativo*, contradizendo a área de Atenção na mesma tela. O servidor
   passou a mandar `statusExibido` já resolvido — calcular no cliente com `new Date()` daria
   divergência de hidratação na virada do dia.
2. `credencial.estado` era `VARCHAR(2)` e guarda `NACIONAL`/`NA` (§10/§15): o primeiro software
   nacional estouraria com 22001. Migration `20260830120000_acessos_estado_varchar16`.

**Pendente:** o botão "Novo acesso" fica desabilitado — o formulário é a Fase 6.

#### Testes Necessários

```bash
npm run dev                           # Visual
# Manual: abrir /acessos, verificar cards, tabela, drawer, filtros
```

---

### **FASE 5 — CREDENCIAL: REVEAL, COPY, AUDITORIA** ⏱ Estimado: 1d

**Objetivo:** Revelação segura de senhas com auditoria, copy-to-clipboard, tela de auditoria.

#### Arquivos a Criar

**`src/components/acessos/credencial-secao.tsx`**
- Renderiza bloco "Credenciais"
- Usuário: `projetos@...` + botão Copiar
- Senha: `•••••` (hidden por padrão)
  - Clique "Visualizar" → chama `revelarCredencial` → descriptografa → mostra 30s → fade-out
  - Tooltip: "Esta ação será registrada..."
  - Botão "Copiar" durante revelado
  - Erro: "Sem permissão para revelar"

**~~`src/modules/acessos/actions.ts`~~ — JÁ FEITO na Fase 2c:**
- `revelarCredencial(id)` ✅
- `copiarCredencial({ id, campo })` ✅ — substitui o `copiarSenha` desenhado aqui. O desenho
  original ("só audita; a UI chama revelar e copia do DOM") faria cada cópia disparar dois
  eventos e duas autorizações, e registraria uma revelação que ninguém viu na tela.
  **A UI da Fase 5 deve chamar `copiarCredencial` uma vez, não a dupla revelar+copiar.**

**`src/components/acessos/acessos-auditoria-tabela.tsx`**
- Tabela: Data | Usuário | Ação | Resultado | Detalhes (redacted)
- Ações: `credencial_revelada`, `credencial_copia_senha`, `credencial_atualizada`, etc.
- Filtros: usuário, ação, data range
- Reutiliza `AuditLog`; filtra por `modulo: "acessos"`

**`scripts/smoke-acessos.ts`**
- Teste e2e dos 5 cenários (§84 A–E)
- A: Admin vê tudo
- B: Projetista autorizado vê cadastro + credencial
- C: Projetista limitado vê cadastro, credencial bloqueada
- D: Usuário sem acesso não encontra
- E: Usuário tenta endpoint direto, recebe acesso negado
- Roda: criar credencial → compartilhar → testar cada perfil → revelar → auditar → validar logs

#### Arquivos a Alterar

**`src/components/acessos/acessos-drawer.tsx`** — adicionar aba/seção Histórico
- Chama `listarAuditoriaAcessos(credencialId)`
- Renderiza com `acessos-auditoria-tabela`

#### Riscos

1. **Timeout revelar:** 30s muito curto? Spec não dice; usar padrão SENAHub (confirmar em Clientes/similar). **Mitigação:** Config em `lib/config.ts` se necessário.
2. **Auditoria falha silenciosa:** Senha revelada mas log não inserido. **Mitigação:** `defineAction` com `audit: true` é default; testes cobrem.

#### Dependências

Fase 2, Fase 4.

#### Critérios de Validação

- [ ] `revelarCredencial` retorna plaintext após permissão
- [ ] Sem permissão, retorna erro
- [ ] AuditLog registra revela/copy
- [ ] Redact funciona (senha não aparece em log)
- [ ] Timeout fade-out automático (ou user dismiss)
- [ ] Auditoria UI filtra por usuário/ação
- [ ] Smoke test rodas, 5 cenários passam

#### Testes Necessários

```bash
npm test -- acessos/actions.test.ts           # Permissões, criptografia
npm run smoke:acessos                         # e2e 5 cenários
npm run dev                                   # Manual: revelar, copiar, verificar drawer
```

---

### **FASE 6 — FORMULÁRIO CRIAR/EDITAR** ⏱ Estimado: 1.5d

**Objetivo:** Criar e editar credenciais com validação, multi-step para software/licença.

#### Arquivos a Criar

**`src/components/acessos/credencial-form.tsx`** (client)
- Modo: criar | editar
- Passo 1 — Básico: nome, nomeCompleto, categoria, UF, descrição, tags
- Passo 2 — Portal: URL
- Passo 3 — Credencial: usuário, senha (confirmação)
- Passo 4 — Gestão: responsável, departamento, status
- Passo 5 — Validade: vencimentoEm, proximaRevisaoEm, renovacaoAutomatica
- Passo 6 — Compartilhamento: (se `acessos:permissoes`) multi-select usuários/perfis/setores
- [OPT] Passo 7 — Projetos: multi-select projetos (Fase 7)

Validação via Zod (schemas.ts). Disabled submit até todos campos válidos.

**`src/components/acessos/credencial-dialog-novo.tsx`**
- Modal/Drawer grande com `credencial-form`
- Botão "+ Novo Acesso" da página root abre isto

**`src/components/acessos/credencial-form-software.tsx`** (condicional)
- Renderizado APENAS se `categoria.nome` inclui "Software" ou "Licença"
- Campos adicionais: fornecedor, tipoLicenca, numeroLicenca, assentos, dataContratacao, dataRenovacao
- Reutiliza framework de steps

#### Arquivos a Alterar

**`src/components/acessos/acessos-drawer.tsx`** — adicionar botão "Editar"
- Abre `credencial-dialog-novo` em modo edição
- Pré-popula formulário
- `criarCredencial` vs `atualizarCredencial` detectado automaticamente

#### Riscos

1. **Formulário com muitos steps:** UX confusa. **Mitigação:** Spec §34 define os steps; usar acordeão ou abas se n-steps > 4.
2. **Senha confirmada:** Usuário digita errado, salva sem querer. **Mitigação:** Mostrar "•••••" em ambos campos, validar igualdade no submit.

#### Dependências

Fase 2, Fase 4.

#### Critérios de Validação

- [ ] Formulário renderiza
- [ ] Validação rejeita email inválido, senha vazia, etc.
- [ ] Submit desabilitado enquanto inválido
- [ ] Software/Licença mostra campos extras
- [ ] Criar insere no banco
- [ ] Editar atualiza
- [ ] Duplicar copia todos campos exceto ID/senhas (prompt confirm)

#### Testes Necessários

```bash
npm run dev                           # Manual: criar, editar, duplicar
npm test -- acessos/schemas.test.ts   # Validação Zod
```

---

### **FASE 7 — LICENÇAS, ALERTAS, INTEGRAÇÃO PROJETOS** ⏱ Estimado: 1.5d

**Objetivo:** Alertas automáticos de vencimento/revisão, integração com projetos, refinamentos finais.

#### Arquivos a Criar

**`src/modules/acessos/service.ts`** — expandir:

1. **`gerarAlertasCredenciais(viewer?)`** → Array<Alert>
   - Vencimento: `vencimentoEm < now() + 90 dias` → tipo "atencao", mensagem "Vence em X dias"
   - Vencimento crítico: `vencimentoEm < now() + 7 dias` → tipo "critico"
   - Revisão: `ultimaRevisaoEm IS NULL OR < now() - 180 dias` → tipo "atencao"
   - Bloqueado: `status = "bloqueado"` → tipo "critico"
   - Sem responsável: `responsavelId IS NULL` → tipo "atencao"
   - Sem política de compartilhamento: `compartilhamentos.count = 0` → tipo "info"

2. **`alertasCredenciaisCached()`** — cached 1h, reutilizado por dashboard

**`src/modules/acessos/jobs.ts`** (pg-boss, Fase 7b)
- Job: `alertas-acessos-diarios` — roda a cada dia 8:00
- Chama `gerarAlertasCredenciais()`
- Envia notificações via `notificar()` para `categoria: "acessos"`
- Não gera duplicatas (rastreamento por credencialId + tipo)

**`src/app/(dashboard)/acessos/[id]/page.tsx`** (Fase 7b)
- Página dedicada (§5 spec permite)
- RSC renderiza drawer em tela cheia se rota, senão drawer lateral
- Opcional; drawer já funciona

**`src/components/acessos/projetos-secao.tsx`**
- Renderiza lista: "Projetos associados"
- Multi-select para edição
- Busca de projeto integrada

#### Arquivos a Alterar

**`src/modules/acessos/queries.ts`** — adicionar:
- `listarAcessosPorProjeto(projetoId)` — para integração (Fase 7b)

**`src/app/(dashboard)/projetos/[id]/page.tsx`** (OU novo arquivo) — adicionar seção:
```
"Acessos relacionados"
→ chama listarAcessosPorProjeto(projetoId)
→ renderiza cards compactos de credenciais
```

**`src/lib/jobs.ts`** — registrar job:
```typescript
await boss.schedule('alertas-acessos-diarios', {}, '0 8 * * *');
```

**`src/lib/jobs-handlers.ts`** — handler:
```typescript
boss.subscribe('alertas-acessos-diarios', async () => {
  const alertas = await gerarAlertasCredenciais();
  for (const alert of alertas) {
    await notificar({
      // ...
      categoria: "acessos",
    });
  }
});
```

#### Riscos

1. **Notificações excessivas:** Job roda, cria N alertas, notifica todo mundo. **Mitigação:** Dedup by (credencialId, tipoAlerta); enviar digest 1x/dia.
2. **Integração projeto quebraria:** Projeto está em migration de ID. **Mitigação:** Testar apenas em projeto existente; não mudar fk.

#### Dependências

Fase 2, Fase 5, jobs infrastructure (`lib/jobs.ts` já existe).

#### Critérios de Validação

- [ ] Alertas calculados corretamente (unit test)
- [ ] Job roda sem erro
- [ ] Notificações não duplicam (dedup funciona)
- [ ] Projetos aparecem em drawer
- [ ] Acessos aparecem em página de projeto

#### Testes Necessários

```bash
npm test -- acessos/service.test.ts           # Geração de alertas
npm run smoke:acessos                         # Job schedule e handler
npm run dev:server                            # Manual: verificar notificações
```

---

### **FASE 8 — TESTES COMPLETOS, DOCUMENTAÇÃO, POLISH** ⏱ Estimado: 1d

**Objetivo:** Cobertura de testes, readme, UX refinements, responsividade.

#### Arquivos a Criar

**`docs/acessos/README.md`**
- Como usar (end-user)
- Permissões e compartilhamento
- Segurança (criptografia, auditoria)
- Admin guide (alertas, gestão de categorias)

**`src/modules/acessos/acessos.test.ts`** (testes integrados)
- IDOR: usuário A tenta acessar credencial de usuário B → erro
- Criptografia: senha salva é diferente de plaintext
- Auditoria: reveal/copy registram eventos
- Soft delete: deletada credencial não aparece em listas
- Filtros: combinação de filtros funciona

**`scripts/smoke-acessos-completo.ts`** (e2e full)
- Setup: cria 3 usuários, 10 credenciais, 2 categorias
- Teste: cada usuário navega, filtra, busca, tenta revelar (com/sem permissão)
- Auditoria: valida 20+ eventos registrados
- Cleanup: deleta dados de teste

#### Arquivos a Alterar

**`src/components/acessos/acessos-view.tsx`** — responsividade:
- Desktop (1200px+): tabela 8 colunas
- Tablet (768-1199px): tabela 5 colunas, scroll horizontal
- Mobile (<768px): cards compactos, drawer fullscreen

**`README.md` do projeto** — adicionar seção Acessos (changelog).

#### Riscos

Nenhum novo.

#### Dependências

Todas as fases anteriores.

#### Critérios de Validação

- [ ] npm test passa (toda suite)
- [ ] npm run build sem erro
- [ ] npm run lint sem warning novo
- [ ] Responsividade: mobile/tablet/desktop OK
- [ ] Smoke test e2e passa
- [ ] Documentação escrita e revisada

#### Testes Necessários

```bash
npm test
npm run build
npm run lint
npm run smoke:acessos-completo
npm run dev
# Manual: testar em mobile (DevTools), tablet (resize), desktop
```

---

## SÍNTESE DE ALTERAÇÕES

### Arquivos a Criar

**Schema + Criptografia (Fase 1):**
- `src/lib/encryption.ts` + tests
- `prisma/migrations/YYYYMMDD.../migration.sql`
- Schema Prisma (models em `schema.prisma`)

**Backend (Fase 2-3):**
- `src/modules/acessos/schemas.ts`
- `src/modules/acessos/queries.ts`
- `src/modules/acessos/actions.ts`
- `src/modules/acessos/service.ts`
- `src/modules/acessos/acessos.test.ts`

**Frontend (Fase 4-7):**
- `src/app/(dashboard)/acessos/page.tsx`
- `src/app/(dashboard)/acessos/[id]/page.tsx` (opcional Fase 7b)
- `src/components/acessos/acessos-view.tsx`
- `src/components/acessos/acessos-table.tsx`
- `src/components/acessos/acessos-drawer.tsx`
- `src/components/acessos/acessos-form.tsx`
- `src/components/acessos/acessos-form-software.tsx`
- `src/components/acessos/credencial-secao.tsx`
- `src/components/acessos/credencial-auditoria.tsx`
- `src/components/acessos/acessos-categorias-rapidas.tsx`
- `src/components/acessos/acessos-area-atencao.tsx`
- `src/components/acessos/acessos-indicadores.tsx`

**Jobs + Scripts:**
- `src/modules/acessos/jobs.ts` (Fase 7b)
- `scripts/smoke-acessos.ts` (Fase 5)
- `scripts/smoke-acessos-completo.ts` (Fase 8)

**Documentação:**
- `docs/acessos/README.md`
- `docs/plans/acessos-credenciais-plan.md` (este arquivo)

### Arquivos a Alterar

- `prisma/schema.prisma` — models (Fase 1)
- `src/lib/permissions-catalog.ts` — novo recurso (Fase 1)
- `src/lib/prisma.ts` — soft delete extension (Fase 2)
- `src/lib/nav-config.ts` — novo menu item (Fase 4)
- `prisma/seed.ts` — dados demo (Fase 1)
- `src/lib/jobs.ts` — registrar job (Fase 7b)
- `src/lib/jobs-handlers.ts` — handler job (Fase 7b)
- Projeto arquivo de projeto (project details) — seção acessos (Fase 7b)

---

## DECISÕES ARQUITETURAIS

### 1. **Server Action vs REST Endpoint (§48)**

✅ **Decisão:** Server Action `revelarCredencial()` via `defineAction`.

**Justificativa:**
- Ganha: sessão + permissão + Zod + auditoria automática
- CSRF token automático (Next built-in)
- Trade-off: perde header `Cache-Control: no-store` explícito, mas responses POST nunca são cached

### 2. **RLS vs Application-Layer Authorization (§52)**

✅ **Decisão:** Application-layer only. Sem RLS (SENAHub não usa Postgres roles).

**Justificativa:**
- Prisma Client único
- Padrão SENAHub já estabelecido (`escopoProjeto`)
- `where` clauses sempre incluem filtros de acesso

**IDOR Defense:** Nunca fetch-all-then-filter. Sempre `where: { AND: [escopoCredencial(user)] }`.

### 3. **Soft Delete (§53)**

✅ **Decisão:** Usar coluna `deletadoEm: DateTime?`.

**Justificativa:**
- Credenciais deletadas causam impacto operacional alto
- Admin pode restaurar
- Padrão SENAHub (`Lancamento`)

### 4. **Global Scope Shortcut para Reveal**

❌ **Decisão:** NÃO permitir.

**Justificativa:**
- `acessoGlobal()` autoriza "lê tudo", não "vê tudo sensível"
- Reveal gates em `acessos:credencial` **+** `CredencialCompartilhamento` individual
- Nenhum `podeVerTudo()` fallback

### 5. **Criptografia: node:crypto AES-256-GCM**

✅ **Decisão:** `node:crypto` built-in.

**Justificativa:**
- Não adiciona dependência
- Autenticada (AEAD)
- IV aleatório por criptografia
- `keyVersion` para rotação futura

**Armazenamento:** JSON `{ iv, authTag, ciphertext, keyVersion }` em coluna TEXT.

### 6. **Compartilhamento: Tipos de Alvo**

✅ **Decisão:** `usuario | perfil | setor` (departamento + cargo em Fase 2 se populated).

**Justificativa:**
- Usuario: sempre suportado (já existe)
- Perfil: motor Onda D (PerfilAcesso)
- Setor: enum existente (endereço, não permissão; UI apenas)
- Departamento/Cargo: verificar população; se 0, defer to Fase 2

### 7. **Modelagem: Nomes com Prefixo**

✅ **Decisão:** `Credencial*`, não `Acesso*`.

**Justificativa:**
- `AcessoPagina` já existe (page-view tracking)
- `Credencial` é mais descritivo
- Sem conflito de naming

### 8. **Limites de Alerta**

✅ **Decisão:** Hard-coded, configurável em Fase 2 via `ConfigSistema`.

Limites de padrão:
- Vencimento: 90, 60, 30, 15, 7 dias
- Revisão: 180 dias sem revisar
- Dedup: 1 notificação/dia/credencial/tipo

---

## LACUNAS DA SPEC NÃO COBERTAS PELO PLANO ORIGINAL

Achadas na auditoria de 2026-08-28, ao conferir a spec contra o schema entregue na Fase 1.
Nenhuma delas está no schema hoje, e **nenhuma foi adicionada** — o pedido era "apenas a Fase 1",
e mexer no schema agora obrigaria a regerar a migration. Estão aqui para serem decididas
**antes** da fase que as consome, não depois.

> ⚠️ **Janela barata:** o schema ainda não existe em produção. Acrescentar coluna agora custa
> uma migration aditiva; depois do primeiro deploy com dados reais, custa backfill.

### ✅ Resolvidas pelo dono em 2026-08-28

| § | O que a spec pede | Decisão | Onde |
|---|---|---|---|
| §41 | **Favoritos** — preferência individual, filtro próprio | **Entra na v1.** Tabela `CredencialFavorito` já criada (migration `…180000`); UI na Fase 3 | schema ✅ · UI ⬜ Fase 3 |
| §42 | **Acessados recentemente** — por usuário, sem expor atividade alheia | **Entra na v1**, derivado do `AuditLog` — sem tabela nova | ⬜ Fase 5 |

### Ainda sem dono — precisa de decisão

| § | O que a spec pede | Por que não cabe onde está | Sugestão |
|---|---|---|---|
| §40 | **Responsável backup / secundários** + transferência de responsabilidade | Schema tem só `responsavelId` (escalar). Suportar N exige tabela de junção ou um segundo campo. | Decidir: 1 backup (coluna) vs N (tabela). Fase 7 |

### Pertencem à Fase 7 (licenças) — só faltou listar

| § | Campo | Situação |
|---|---|---|
| §36 | `valor`, `periodicidade` | Ausentes. Licença tem custo recorrente; sem eles não há visão de gasto. |
| §36 | `contrato associado` | Ausente. Existe `DocumentoJuridico`/contratos no sistema — deveria ser FK, não texto. |
| §36 / §74 | **computadores vinculados** ("SENA-ENG-03…") | Ausente. **`MaquinaTI` já existe** (`patrimonio`) — é relação M:N, não campo livre. Não duplicar (§66). |
| §36 | `usuários disponíveis` (assentos em uso × total) | Só `assentos` existe. "Disponíveis" é derivado de quem está usando — precisa saber quem ocupa. |
| §37 | `período de aviso` configurável | Ausente. O plano fixou 90/60/30/15/7 em código (Decisão 8). Se o dono quer por-credencial, vira coluna. |

### Já cobertas (conferido, sem ação)

`§30` observações → `descricao` · `§31` tags → `CredencialTag` · `§27` cadastro × credencial →
`podeVerCadastro` / `podeVerCredencial` separados · `§53` soft delete → `deletadoEm` ·
`§65` metadados → `criadoPor`/`criadoEm`/`atualizadoPor`/`atualizadoEm`/`ultimaRevisaoEm`

---

## CONFLITOS E RESOLUÇÕES

### Conflito A: Imagem de Referência Ausente

**Spec:** §3 — imagem é "referência visual principal"  
**Realidade:** Arquivo não encontrado em `docs/contas/`

**Resolução:** Usuário decide
- [ ] Opção 1: Fornecer imagem antes Fase 4
- [ ] Opção 2: Usar design system SENAHub (projetos, clientes) como guia

**Impacto:** Critérios visuais (§89) não podem ser validados sem referência.

---

### Conflito B: Duplo Mapeamento de Compartilhamento

**Spec:** §28 oferece 6 tipos; §85 diz verificar se `Departamento`/`Cargo` estão populated

**Realidade:** SENAHub reforma Onda D em andamento; `Setor` é vivo, `Departamento`/`Cargo` podem ser vestigiais

**Resolução:** Fase 1.5 verifica população; se 0 rows:
- Implementar Fase 2 com ambos (codificação simples, UX pode ignorar)
- OU documentar em relatório como future work

---

### Conflito C: Nenhuma Biblioteca de Criptografia Instalada

**Spec:** §45–47 quer AES-256-GCM  
**Realidade:** package.json tem `node:crypto`, nenhuma lib especializada

**Resolução:** `node:crypto` built-in é suficiente. Sem dependência nova (spec §94 proíbe).

---

## ROLL-OUT STRATEGY

### Ordem de Fases

**Recomendação:** Seguir sequência 1→8, mas com check-gates:

1. **Fase 1 é bloqueadora** — sem schema, nada compila.
2. **Fase 2 é bloqueadora** — sem actions, sem backend.
3. **Fase 3 é paralela a Fase 2** — queries podem ser desenvolvidas simultaneamente.
4. **Fase 4 requer Fase 1+2+3** — UI depende de dados.
5. **Fase 5 requer Fase 2+4** — reveal + audit já têm backend (Fase 2), ui (Fase 4).
6. **Fase 6 requer Fase 2+4** — formulário em cima de actions/queries.
7. **Fase 7 requer Fase 1-6** — alertas + jobs, tudo junto.
8. **Fase 8 é síntese** — testes de tudo.

### Deployment Checklist

```
[ ] Fase 1: db:migrate, db:seed OK
[ ] Fase 1: npm test encryption OK
[ ] Fase 2: npm test actions OK
[ ] Fase 2: smoke-acessos 5 cenários OK
[ ] Fase 3: queries sem N+1
[ ] Fase 4: página renderiza, sem hardcoded
[ ] Fase 5: reveal audit log OK
[ ] Fase 6: criar/editar persistem
[ ] Fase 7: alertas não duplicam
[ ] Fase 8: npm run build OK
[ ] Fase 8: npm run lint OK (sem warnings)
[ ] Deploy: NODE_ENV=production, ACESSOS_ENCRYPTION_KEY set
[ ] Post-deploy: verificar via admin dashboard
```

---

## MATRIZ DE RISCO

| Fase | Risco | Probabilidade | Impacto | Mitigação |
|------|-------|---------------|---------|-----------|
| 1 | Env var ausente em prod | Alta | Crítico | Fail-closed boot check |
| 1 | Criptografia inválida | Média | Crítico | Unit tests + crypto module puro |
| 2 | IDOR na query | Média | Crítico | Smoke tests (5 cenários) |
| 2 | Auditoria falha | Baixa | Alto | `audit: true` default; testes |
| 4 | Design não alinha | Alta | Médio | Aguardar imagem ref. ou usar padrão |
| 5 | Timeout reveal muito curto | Baixa | Baixo | Config via `ConfigSistema` Fase 2.5 |
| 7 | Notif excessivas | Média | Médio | Dedup + digest 1x/dia |

---

## DECISÕES DO DONO — 2026-08-28

As três perguntas que bloqueavam a Fase 2 foram respondidas e **já estão aplicadas no código**.

### 1. Quem entra no cofre → **só `administrativo`. CONFIRMADO.**

`admin` entra por bypass (`superUsuario`). Coordenador, CLT, estagiário, projetistas, freelancer,
TI e cliente ficam de fora da semente. Liberação é ato explícito na tela de Permissões.

### 2. Separar `credencial` de `gerir` → **SIM.**

`acessos:credencial` **saiu da semente**. Consequências, todas deliberadas:

- Quem administra o cofre (`gerir`) **não revela senha por consequência** — a separação exigida
  por §27/§29/§91 passa a ser real, não nominal.
- Enquanto ninguém receber a ação pela tela, **só `admin` revela** (via `superUsuario`). É o
  estado fail-closed correto para um cofre recém-criado, e é exatamente o cenário C/D dos testes
  de permissão da §84.
- `credencial` **não** é marcada `leitura: true` no catálogo: ações de leitura são materializadas
  como override pelo piso de sócio, e revelar credencial não pode ser concedido automaticamente
  por piso nenhum. Revelar é ato auditado, não consulta.
- A poda do `db:seed` removeu a linha que já existia no banco (129 → 128 permissões).

### 3. Favoritos e Recentes na v1 → **SIM.**

- **Favoritos (§41):** tabela `CredencialFavorito` **criada agora**, na migration
  `20260828180000_acessos_favoritos`. Feita nesta fase de propósito: o schema ainda não foi a
  produção, então a coluna custa uma migration aditiva; depois do primeiro deploy custaria
  backfill. A UI (marcar/desmarcar + filtro) fica na **Fase 3**, junto dos outros filtros.
  - PK `(userId, credencialId)` — "meus favoritos" usa o prefixo; duplicata é bloqueada no banco.
  - `onDelete: Cascade` nos dois lados; apagar a credencial limpa os favoritos. Ambos verificados.
  - **Favoritar não concede acesso**: a listagem segue filtrada por `CredencialCompartilhamento`.
- **Recentes (§42):** **sem tabela nova.** Deriva do `AuditLog` já existente
  (`modulo="acessos"`, `userId` do próprio usuário, ações de revelar/abrir). Entra na **Fase 5**,
  quando esses eventos passam a ser gravados — antes disso não haveria o que ler.
  §42 exige "não expor atividade de outros usuários": a query filtra por `userId` da sessão.

---

## PERGUNTAS ABERTAS PARA USUÁRIO

### Bloqueiam a Fase 4 (UI)

4. **Imagem de referência (§3):** ainda ausente em `docs/contas/`. Fornecer, ou autorizar o
   padrão visual de `/clientes` e `/projetos` como base?
5. **Responsividade mobile (§59):** drawer full-screen ou lateral?

### Bloqueiam a Fase 7 (licenças)

6. **Responsável backup (§40):** um só (coluna) ou vários (tabela)?
7. **Equipamentos da licença (§36/§74):** ligar em `MaquinaTI` (já existe em `patrimonio`)?
8. **Período de aviso (§37):** fixo em código (90/60/30/15/7) ou configurável por credencial?

### Não bloqueiam / já respondidas

- **Departamento/Cargo como alvo de compartilhamento:** o catálogo tem **8 cargos e 4
  departamentos** semeados (confirmado no `db:seed`). Portanto são utilizáveis — mas a Fase 1
  gravou `tipoAlvo` como texto livre, então incluí-los depois não exige migration.
- **Timeout do reveal:** decidir na Fase 5, junto com a UI que o consome.
- **Categorias iniciais:** os nomes da §81 são exemplos da spec; entram no seed da Fase 2.

---

## PRÓXIMOS PASSOS

1. ~~Iniciar Fase 1 (schema + crypto)~~ — **✅ concluída em 2026-08-28** (ver bloco EXECUÇÃO)
2. **Dono:** colar `ACESSOS_ENCRYPTION_KEY` em `.env` / `.env.example` / `.env.production.example`
   (o agente não escreve em `.env*`). Gerar com
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. **Dono:** responder as perguntas 1–3 (bloqueiam a Fase 2)
4. **Time:** Fase 2 (service + actions + autorização + auditoria)
5. **Review:** após Fase 2, rodar `smoke:acessos` e validar os 5 cenários de IDOR (§84 A–E)

---

## APÊNDICE A — ESTRUTURA DE PASTA FINAL

```
src/
  modules/acessos/
    schemas.ts
    queries.ts
    actions.ts
    service.ts
    acessos.test.ts
    jobs.ts (Fase 7b)
  
  components/acessos/
    acessos-view.tsx
    acessos-table.tsx
    acessos-drawer.tsx
    acessos-form.tsx
    acessos-form-software.tsx
    credencial-secao.tsx
    credencial-auditoria.tsx
    acessos-categorias-rapidas.tsx
    acessos-area-atencao.tsx
    acessos-indicadores.tsx
  
  app/(dashboard)/acessos/
    page.tsx
    [id]/page.tsx (Fase 7b)
  
  lib/
    encryption.ts
    encryption.test.ts

prisma/
  migrations/
    YYYYMMDD[...]/migration.sql

scripts/
  smoke-acessos.ts
  smoke-acessos-completo.ts

docs/
  acessos/
    README.md
  plans/
    acessos-credenciais-plan.md (este arquivo)
```

---

## APÊNDICE B — TEMPLATE PERMISSÕES SEED

Após `db:seed`, adicionar a `lib/permissions-catalog.ts` em seedtime:

```typescript
async function seedPermissoes() {
  const recurso = await prisma.permissao.findFirst({ where: { recurso: "acessos" } });
  if (recurso) return; // já existe

  const roles = ["admin", "supervisor"];
  const acoes = ["ver", "gerir", "credencial", "permissoes", "auditoria", "categorias"];
  
  for (const role of roles) {
    for (const acao of acoes) {
      await prisma.permissao.create({
        data: { role: role as Role, recurso: "acessos", acao, permitido: true },
      });
    }
  }
  
  // Projetista: só lê
  await prisma.permissao.create({
    data: { role: "projetista_pj", recurso: "acessos", acao: "ver", permitido: true },
  });
}
```

---

**Fim do Plano**

Última revisão: 2026-08-28  
Autor: Auditoria arquitetônica SENAHub  
Status: ✅ Pronto para Implementação (com resoluções de pendências)
