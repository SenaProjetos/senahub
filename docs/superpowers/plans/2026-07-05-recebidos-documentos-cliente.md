# Plano técnico — Documentos do cliente ao longo de Cliente → Proposta → Projeto

**Data:** 2026-07-05 · **Status:** 🔨 Fases 1–4 implementadas · Fase 5 (futura) pendente

## Status de implementação (Fase 4 — Portal + ficha do Cliente)

Entregue (branch `dev`):
- `acesso.ts`: `podeLerDocumento` também libera quem tem `clientes:ver` (equipe vê os docs na ficha
  do cliente). `AncoraDocumento` ganhou `clienteId`.
- `queries.ts`: `documentosDoCliente(clienteId)` **agrupado por proposta → projeto** (+ grupo "gerais").
- Ficha do cliente (`clientes/[id]`): card **"Documentos"** com os grupos + download (read-only).
- Portal do cliente logado: `api/portal/documentos` (upload no projeto do PRÓPRIO cliente →
  `Documento(canal=portal)`, escopo estrito por `clienteId`) + card `PortalDocumentos`
  (lista + envio) na página do projeto.
- Verificado: `tsc` (arquivos da fase limpos) + `eslint` limpos; runtime confirma agrupamento e escopo.

---


## Status de implementação (Fase 3 — Link tokenizado)

Entregue (branch `dev`):
- `src/app/api/t/proposta/[token]/documentos/route.ts`: upload público (sem login) por token da
  proposta → cria `Documento(origem=recebido_cliente, canal=link, enviadoPor)` ancorado na proposta
  (autorId null). Limite de tamanho (`TAMANHO_MAX`) + teto de 100 arquivos por link (anti-flood).
- `src/components/comercial/proposta-publica-upload.tsx`: formulário público (nome opcional + envio
  multi-arquivo com status por arquivo), plano (sem providers do dashboard).
- `src/app/a/proposta/[token]/page.tsx`: seção "Enviar arquivos" na página pública.
- O projeto gerado no aceite herda esses arquivos (Fase 2). Autor exibido cai em `enviadoPor` quando
  não há user. Verificado: `tsc`+`eslint` limpos, runtime confirma create/mapeamento.

---


## Status de implementação (Fase 2 — Projeto herda da Proposta)

Entregue (branch `dev`):
- `modules/documentos-cliente/acesso.ts`: `podeLerDocumento`/`podeGerirDocumento` por **âncora**
  (proposta → `comercial`; projeto → membro interno/global via `escopoProjeto`). Actions e endpoints
  passaram a gatear por sessão + verificação de âncora (fim do gate fixo em `comercial`).
- `queries.ts`: `recebidosDoProjeto` (join `Proposta.projetoId`) + `clienteDoProjeto`.
- Projeto → aba Arquivos: pasta de topo **"Recebidos do cliente"** (`RecebidosPasta`) = docs do
  projeto **+ herdados da proposta de origem**, com upload interno (cria `Documento(projetoId)`),
  versão e exclusão. O pacote `RECEBIDOS` saiu do uploader e do agrupamento por disciplina.
- Verificado: `tsc` (src limpo), `eslint` limpo, e runtime — `recebidosDoProjeto` retorna o doc do
  projeto **e** o herdado da proposta (sem misturar projetos irmãos).

---


## Status de implementação (Fase 1 — Fundação/Proposta)

Entregue em código (branch `dev`):
- `prisma/schema.prisma`: enums `OrigemDocumento`/`CanalDocumento` + models `Documento`/`DocumentoVersao`
  (migration `20260705033332_documentos_cliente`, que **absorve e migra** `proposta_anexo`).
- `src/modules/documentos-cliente/`: `schemas.ts`, `queries.ts` (`documentosDaProposta`,
  `recebidosDoProjeto` [pronto p/ Fase 2]), `actions.ts` (`criarDocumento`/`adicionarVersaoDocumento`/
  `editarDocumento`/`excluirDocumento`).
- `src/app/api/documentos/route.ts` (upload multipart → meta+hash) e `.../[versaoId]/download/route.ts`.
- Proposta: `proposta-extras.tsx` card **"Documentos"** (multi-arquivo + versões) + página religada;
  `PropostaAnexo` (model, endpoints, actions, query) **removido/absorvido**.
- Verificado: `tsc` (src limpo), `eslint` limpo, e teste de runtime (create → `documentosDaProposta`
  → cascade delete) no DB dev. *(Erros residuais de `.next/types` referentes às rotas deletadas somem
  no próximo `next dev`/build.)*

**Desvios do plano:**
- **Permissão:** Fase 1 reusa o recurso `comercial` (`ver`/`gerir`) — mesma regra dos antigos anexos,
  sem lacuna. O recurso dedicado `documentos_cliente` (§4) entra quando Projeto/portal/cliente chegarem.
- **origem default:** upload interno na proposta grava `origem=comercial`, `canal=interno`.
- **Hash legado:** anexos migrados de `proposta_anexo` ficam com `hashSha256=''` (não havia hash antes).

---

**Status original:** 📋 planejamento (aguardando revisão antes de codar)

Origem: "facilitar a postagem do material fornecido por externos" e tirar **Recebidos do cliente**
de dentro das disciplinas. Ao evoluir, ficou claro que o material do cliente chega **na etapa de
proposta** (comercial), e que existe uma hierarquia real no sistema:

> **Cliente → Proposta → Projeto** · um Projeto **herda de exatamente uma Proposta**
> (`Proposta.projetoId @unique`, "Projeto gerado no aceite").

Os arquivos que o cliente/externo envia são **anexos da Proposta**. O Projeto gerado no aceite
**herda** esses documentos pela ligação proposta→projeto — sem união por cliente, então **não há
mistura** entre projetos irmãos do mesmo cliente.

Item já entregue (fora deste plano): cabeçalho "Enviar arquivos", disciplina sem pré-seleção com
placeholder e botões travados até escolher — [arquivos-explorer.tsx](../../../src/components/projetos/arquivos-explorer.tsx).

---

## 1. Objetivo

1. **Recebidos do cliente** deixa de ser pacote (`PacoteUpload.RECEBIDOS`) dentro de cada disciplina.
   Passa a ser um **repositório de documentos** ancorado na **Proposta** (comercial) e/ou no
   **Projeto**, com o **Cliente** como dono/umbrella.
2. **Facilitar o envio por externos** por canais que gravam nesse repositório: equipe interna,
   link tokenizado (já existe token de proposta: `/a/proposta/[token]`) e portal do cliente logado.
3. **Herança automática comercial → projeto:** documentos anexados na Proposta aparecem no Projeto
   gerado no aceite, via `Proposta.projetoId`. Nada de passo manual nem de vazamento entre projetos.

---

## 2. Hierarquia e âncora (base de tudo)

```
Cliente ──< Proposta ──(aceite, 1:1)── Projeto
   │            │                          │
   │            └─ docs comerciais         └─ docs do projeto
   └─ docs gerais do cliente (raros; contratos/cadastro)
```

- **Proposta** é a âncora principal do material recebido (é onde o cliente envia). `Proposta.clienteId`
  já existe; `PropostaAnexo` já guarda anexos hoje (single-version, `propostaId` escalar).
- **Projeto** herda os docs da sua Proposta por consulta (join por `Proposta.projetoId`), **sem cópia**.
  Também pode ter docs próprios criados já na fase de projeto.
- **Cliente** é o dono/umbrella: a ficha do cliente mostra tudo, **agrupado por proposta → projeto**.
- Sem mistura: como Projeto ↔ Proposta é 1:1, cada projeto herda só os docs da sua proposta.

---

## 3. Modelo de dados (D1) — **a confirmar na revisão**

Precisamos de versões, origem/canal e um mesmo documento acessível de Proposta **e** do Projeto que
ela gerou. `PropostaAnexo` atual é fino demais (sem versões, sem origem, sem projeto).

### D1-A (recomendado) — Model unificado `Documento` (evolui/absorve `PropostaAnexo`)

```prisma
enum OrigemDocumento {
  recebido_cliente   // externo enviou (proposta/portal/link)
  interno            // equipe subiu p/ compartilhar
  contrato
  comercial
}
enum CanalDocumento { interno portal link }

model Documento {
  id         String  @id @default(cuid())
  clienteId  String                       // dono (denormalizado p/ ficha do cliente + escopo do portal)
  cliente    Cliente @relation(...)
  propostaId String?                       // âncora comercial
  proposta   Proposta? @relation(...)
  projetoId  String?                       // âncora de projeto (docs criados já na fase de projeto)
  projeto    Projeto?  @relation(...)
  origem     OrigemDocumento @default(recebido_cliente)
  canal      CanalDocumento  @default(interno)
  nome       String
  categoria  String?
  descricao  String?
  autorId    String?                       // null quando veio de link público sem user interno
  enviadoPor String?                       // nome digitado no link/portal
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  versoes    DocumentoVersao[]

  @@index([clienteId]); @@index([propostaId]); @@index([projetoId])
}
// DocumentoVersao: numero, caminho, nomeArquivo, mime, tamanho, hashSha256, autorId (espelha ArquivoProjetoVersao)
```

Pelo menos uma âncora entre `propostaId`/`projetoId` deve estar setada (ou é doc geral do cliente).
`clienteId` sempre setado (de `proposta.clienteId` ou `projeto.clienteId`).

- **Prós:** um repositório só p/ Proposta+Projeto; herança é join, sem cópia; suporta os canais;
  absorve `PropostaAnexo`.
- **Contras:** migração de `PropostaAnexo` (single-version) → `Documento`+`DocumentoVersao` (1 versão).

### D1-B — `PropostaAnexo` ganha versões/origem + `projetoId` opcional
Menos model novo, mas fragmenta (proposta-only) e não cobre bem doc criado direto no projeto.

**Recomendação:** **D1-A**. `ArquivoProjeto` ("Geral" interno) fica intocado; `Documento` é o
repositório do **cliente/comercial** (unifica o que hoje é `PropostaAnexo`).

### Regra de exibição (sem mistura)
- **Proposta → aba Documentos:** `Documento where propostaId = <proposta>`.
- **Projeto → pasta "Recebidos do cliente":** `projetoId = <projeto>` **OU** `propostaId =
  <proposta que gerou este projeto>` (join por `Proposta.projetoId`). Herança automática, só da
  proposta de origem — nunca de proposta/projeto irmão.
- **Cliente → aba Documentos:** todos do `clienteId`, **agrupados por proposta → projeto** + grupo
  "gerais do cliente".

---

## 4. Permissões e visibilidade

- Novo recurso no catálogo (`lib/permissions-catalog.ts`), ex. `documentos_cliente` (`ver`/`gerir`),
  distinto de `arquivos_gerais` (Geral interno) e integrado ao módulo `comercial`/`clientes`.
- **Cliente (portal):** só o próprio `clienteId`; nunca o Geral interno.
- **Equipe interna:** escopo já existente (global vê tudo; demais via membro/comercial).
- **Link tokenizado:** reusar o **token da Proposta** (`/a/proposta/[token]`) — sem novo model de
  token. O upload público cria `Documento(propostaId=<da proposta do token>, canal=link,
  origem=recebido_cliente)`, com rate-limit + limite de tamanho (`limites.ts`).
- Auditoria obrigatória (via `defineAction`); uploads por link/portal gravam `canal`/`enviadoPor`.

---

## 5. Storage

- Reusa `lib/storage.ts`. Caminho sugerido (segue o cliente): `clientes/<slug(cliente)>/documentos/<origem>/<arquivo>`.
- Endpoint multipart dedicado (App Router só usa REST p/ multipart): `POST /api/documentos` → grava e
  devolve `meta`; a action cria `Documento`. Endpoint público separado p/ o fluxo por token.
- Download/zip: espelhar os endpoints de `uploads` já corrigidos — **streaming `ReadableStream`
  nativo + `new ZipArchive(...)`** (padrão validado neste ciclo).

---

## 6. UI

### Proposta (módulo comercial)
- Aba/seção **"Documentos"** na proposta (substitui/reusa a UI de `PropostaAnexo`): enviar (multi +
  progresso, reusando o padrão do uploader atual), versionar, baixar, zip.
- Mostra o **link público** (token já existe) com aviso "envie aqui os arquivos do projeto".

### Projeto (aba Arquivos)
- Nova pasta de topo **"Recebidos do cliente"** (irmã de "Geral" e disciplinas), lista plana.
  Conteúdo = docs do projeto **+ herdados da proposta de origem** (§3), com badge de canal/origem.
- `RECEBIDOS` sai de `agruparPorPacote` (não aparece mais dentro de cada disciplina).
- Envio interno aqui cria `Documento(projetoId=<este>)` (ou na proposta, se preferir manter no
  comercial — decidir na Fase 1).

### Ficha do Cliente
- Aba **"Documentos"**: tudo do cliente **agrupado por proposta → projeto** + "gerais". É o "segue o
  cliente".

---

## 7. Fases

| Fase | Entrega | Depende de |
|------|---------|-----------|
| **0** | Este plano + revisão | — |
| **1 — Fundação (Proposta)** | Schema `Documento`(+versão, enums, migração; absorver `PropostaAnexo`) · storage + endpoint multipart · actions (criar/versão/editar/excluir) · queries · **UI de Documentos na Proposta** (é onde os arquivos chegam) | 0 |
| **2 — Projeto herda** | Pasta de topo "Recebidos do cliente" no projeto = próprios + herdados da proposta (join `Proposta.projetoId`); sai o pacote `RECEBIDOS`; envio interno no projeto | 1 |
| **3 — Link tokenizado** | Upload público reusando o token da proposta (`/a/proposta/[token]`): página + endpoint público com rate-limit | 1 |
| **4 — Portal / Cliente** | Upload no portal do cliente logado + aba "Documentos" na ficha do cliente (agrupado por proposta→projeto) | 1 |
| **5 (futuro)** | Consolidar contratos/jurídico no mesmo repositório; avaliar absorver o "Geral" interno | 1–4 |

---

## 8. Riscos / pontos abertos

- **D1 (§3)** precisa de OK antes da Fase 1.
- **Migração `PropostaAnexo` → `Documento`** (script único: 1 versão por anexo, `origem=comercial`).
- **Dados legados:** `Upload` com `pacote=RECEBIDOS` já existentes — migrar p/ `Documento` (setando
  `projetoId`) ou manter read-only? Decidir na Fase 1/2.
- **Projeto sem proposta:** projetos criados fora do fluxo de proposta (`Projeto.proposta = null`) —
  a pasta Recebidos mostra só os docs próprios (`projetoId`), sem herança. OK.
- **Proposta sem cliente formal:** proposta sempre tem `clienteId` (obrigatório) — ok. Lead cru sem
  proposta fica fora do escopo (arquivos só a partir da proposta).
- **LGPD/retenção:** docs podem ter dado sensível; portal estritamente por `clienteId`; validar antes
  do canal público (Fase 3).

---

## 9. Fora de escopo (por ora)

- Assinatura/aceite eletrônico dos documentos (já há `AceiteCliente` p/ entregas).
- OCR/indexação.
- Consolidar o "Geral" interno (`ArquivoProjeto`) — Fase 5, só se desejado.
