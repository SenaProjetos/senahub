# Plano técnico — Aceite de Termo de Uso (colaboradores + clientes)

**Data:** 2026-06-23 · **Status:** ✅ implementado (textos pendentes de revisão jurídica)

## Status de implementação

Entregue em código:
- `prisma/schema.prisma`: enum `TipoTermo` + model `AceiteTermo` (migration `20260623120607_termo_aceite`).
- `src/modules/legal/`: `termos.ts` (fonte única do texto + versão), `queries.ts`
  (`precisaAceitarTermo`), `schemas.ts`, `actions.ts` (`aceitarTermo` com hash SHA-256, IP e
  user-agent), `termos.test.ts`.
- `src/app/(dashboard)/layout.tsx`: gate que redireciona para `/termo` quando há pendência.
- `src/app/(auth)/termo/page.tsx` + `src/components/legal/termo-aceite-form.tsx`: tela bloqueante.
- Verificado: `tsc --noEmit`, `eslint` e `vitest` (5 testes) — todos limpos.

Decisões que divergiram do plano original:
- **Sem entrada no catálogo de permissões.** O aceite é self-service; a action não usa `recurso`,
  apenas exige sessão. (Um relatório admin de aceites, se desejado depois, aí sim usaria `legal:aceites`.)
- **Sem parâmetro `next`.** O gate redireciona para `/termo` e, após o aceite, volta para `/`
  (evita superfície de open-redirect; o roteamento por perfil já acontece em `/`).
- **Texto vive em `termos.ts`** (não lido dos `.md` em runtime) — versão limpa para o usuário final,
  sem o front-matter nem o aviso de "modelo-base" dos `.md`. Os `.md` seguem como doc de revisão.

---

**Branch sugerida (original):** `feat/termo-aceite`

Objetivo: bloquear o uso do sistema até o usuário aceitar o Termo aplicável ao seu perfil,
registrando prova legal do aceite (versão, data/hora, IP, user-agent) e suportando re-aceite quando
o termo for atualizado.

Textos: [docs/legal/termo-uso-colaboradores.md](../../legal/termo-uso-colaboradores.md) e
[docs/legal/termo-uso-clientes.md](../../legal/termo-uso-clientes.md).

---

## Decisões de design

- **Dois tipos de termo:** `colaborador` (perfis em `INTERNAL_ROLES`) e `cliente` (perfil
  `cliente`). O tipo aplicável é derivado do `role`, não armazenado.
- **Histórico append-only** numa tabela própria `AceiteTermo` — preferível a campos no `User`
  porque preserva re-aceites (cada nova versão gera nova linha) e serve de prova.
- **Versão no código** (constante), não no banco. Bump da constante → todos re-aceitam no próximo
  acesso. Texto versionado junto no git.
- **Hash do conteúdo** gravado no aceite: prova exatamente *qual texto* foi aceito, mesmo que o
  arquivo mude depois sem bump de versão (não-repúdio).
- **Enforcement em Server Component** (layout), não no `middleware.ts` — coerente com o padrão do
  projeto (middleware só faz checagem otimista de cookie; gate real em RSC/actions).

## 1. Modelo de dados (Prisma)

Nova tabela em `prisma/schema.prisma`:

```prisma
enum TipoTermo {
  colaborador
  cliente
}

model AceiteTermo {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tipo         TipoTermo
  versao       String                       // ex.: "2026-06-23"
  conteudoHash String                       // sha256 do markdown aceito
  ip           String?
  userAgent    String?
  aceitoEm     DateTime  @default(now())

  @@index([userId, tipo])
  @@unique([userId, tipo, versao])          // idempotência: 1 aceite por usuário/tipo/versão
}
```

- Adicionar `aceitesTermo AceiteTermo[]` na relação inversa do `model User`.
- `npm run db:migrate` (migration `termo_aceite`) + `npm run db:generate`.

## 2. Conteúdo e versão no código

Novo módulo `src/modules/legal/`:

- `termos.ts` (server-only ou shared): exporta, por tipo, `{ versao, titulo, conteudoMarkdown,
  conteudoHash }`. O markdown pode ser importado dos `.md` (via `?raw` ou `fs.readFile` no build) ou
  copiado para constantes — recomendado **ler o `.md` e calcular o `sha256` em build/módulo** para
  manter uma fonte única de verdade.
- `TERMO_POR_ROLE(role): TipoTermo` → `INTERNAL_ROLES.includes(role) ? "colaborador" : "cliente"`.
- `VERSAO_ATUAL[tipo]` derivada do front-matter dos arquivos.

## 3. Leitura — `queries.ts`

`precisaAceitarTermo(userId, role): Promise<{ tipo, versao } | null>`:

- resolve `tipo` pelo `role`;
- busca `AceiteTermo` com `userId + tipo + versao == VERSAO_ATUAL[tipo]`;
- retorna `null` se já aceitou a versão vigente, ou `{ tipo, versao }` se pendente.

## 4. Server Action — `actions.ts`

```ts
export const aceitarTermo = defineAction(
  { modulo: "legal", recurso: "termo", permissao: "aceitar", schema: aceitarTermoSchema },
  async (input, ctx) => {
    const tipo = termoPorRole(ctx.user.role);
    if (input.versao !== VERSAO_ATUAL[tipo]) throw new ActionError("Versão do termo desatualizada.");
    const h = await headers();
    await prisma.aceiteTermo.upsert({
      where: { userId_tipo_versao: { userId: ctx.user.id, tipo, versao: input.versao } },
      create: { userId: ctx.user.id, tipo, versao: input.versao,
                conteudoHash: hashDoTermo(tipo), ip: ipDe(h), userAgent: h.get("user-agent") },
      update: {},
    });
  },
);
```

- Auditoria é automática via `defineAction` (registra em `AuditLog`), além da prova na própria
  tabela `AceiteTermo`.
- `permissao: "aceitar"` é self-service (qualquer autenticado aceita o próprio termo) — adicionar ao
  catálogo (`lib/permissions-catalog.ts`) liberado a todos os perfis, ou tratar como ação sem gate
  fino. Se houver relatório administrativo de aceites, criar `legal:aceites` (`ver`) à parte.

## 5. Enforcement (gate)

- **Colaboradores:** no layout `src/app/(dashboard)/layout.tsx`, após `requireUser`, chamar
  `precisaAceitarTermo`; se pendente e a rota atual não for `/termo`, `redirect("/termo")`.
- **Clientes:** mesmo gate no layout do portal (rota do `cliente`), redirecionando para a tela de
  aceite do portal.
- **Ordem com `mustChangePassword`:** resolver a troca de senha primeiro, depois o termo (ou gate
  combinado). Definir sequência única para não criar loop de redirecionamento.
- **Rotas isentas:** `/login`, logout, endpoints públicos (`/p/...`, `inputs` por token) e a própria
  tela `/termo` não entram no gate.

## 6. Tela de aceite

- Página `src/app/(dashboard)/termo/page.tsx` (e equivalente no portal):
  - renderiza o markdown do termo do tipo aplicável (componente de markdown já existente ou simples);
  - área rolável + checkbox "Li e aceito" + botão (desabilitado até marcar);
  - usa primitivos `components/ui/` (base-ui — `render={...}`, não `asChild`);
  - on submit → `aceitarTermo({ versao })` → on success `redirect` para o destino original (ou home).

## 7. Versionamento / re-aceite

- Atualizar o termo = editar o `.md` + **incrementar `versao`** no front-matter.
- No próximo acesso, `precisaAceitarTermo` detecta a versão nova e força o re-aceite; nova linha em
  `AceiteTermo` (histórico preservado).

## 8. Bootstrap / seed

- O `admin` também precisa aceitar. Opções: (a) deixar o admin aceitar na primeira vez (mais
  honesto p/ prova) ou (b) semear um aceite no `db:seed`. Recomendado **(a)**.
- `seed:demo`: opcionalmente semear aceites dos usuários demo para não atrapalhar smokes.

## 9. Pontos que dependem da empresa (não-técnicos)

- [ ] Preencher dados da empresa nos `.md` (razão social, CNPJ, endereço, comarca).
- [ ] Definir e publicar o **Encarregado (DPO)** e e-mail de contato.
- [ ] Revisão jurídica das cláusulas de monitoramento, LGPD e PI.
- [ ] Confirmar conformidade do ponto eletrônico com a Portaria MTP 671/2021 (jurídico/RH).

## 10. Testes

- Unit: `termoPorRole`, `precisaAceitarTermo` (mock Prisma), cálculo de hash estável.
- Garantir idempotência do `upsert` (mesmo usuário/tipo/versão não duplica).
- Smoke: usuário sem aceite é redirecionado; após aceitar, acessa normalmente; bump de versão força
  novo aceite.
