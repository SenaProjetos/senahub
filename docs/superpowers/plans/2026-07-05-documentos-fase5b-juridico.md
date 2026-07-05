# Plano técnico — Fase 5b: consolidar contratos/jurídico no repositório `Documento`

**Data:** 2026-07-05 · **Status:** 📋 planejamento (continuação de
[2026-07-05-recebidos-documentos-cliente.md](2026-07-05-recebidos-documentos-cliente.md))

Pré-requisitos: Fases 1–4 do plano-mãe + **Fase 5a** (padrão de absorção já rodado no Geral). Esta é a
sub-fase de **maior risco** — envolve prova legal (aceite/assinatura), pastas e certidões. **Só fazer
depois de decidir o destino do fluxo de aceite** (D-5b-1 abaixo).

---

## 1. Objetivo

Trazer os documentos do `/juridico` (contratos, aditivos, procurações…) para o mesmo repositório
`Documento` ancorado no cliente, para que apareçam na aba "Documentos" da ficha do cliente e sigam a
mesma cadeia Cliente → Proposta → Projeto. Sem perder a **assinatura/aceite interno** (não-repúdio).

## 2. Estado atual a ser considerado

- **`DocumentoJuridico { titulo, tipo(contrato|aditivo|proposta|procuracao|outro), projetoId?,
  clienteId?, pastaId?, observacao }`** → **`DocJuridicoVersao { numero, arquivoPath, arquivoNome,
  autorId }`** → **`AceiteDocumento { versaoId, quem assinou, quando, hashSha256 do arquivo }`**
  (prova legal por versão). (`prisma/schema.prisma` ~1581–1770.)
- **`PastaJuridica`** — árvore de pastas para organizar os jurídicos (`DocumentoJuridico.pastaId`).
- **`Certidao` / `CertidaoVersao` / `CertidaoTipo`** — certidões com **validade**, ligadas a
  **licitações** (`LicitacaoHabilitacaoItem`). Concern diferente (vencimento/habilitação).
- **`ModeloContrato`** — modelos de texto (não é arquivo do cliente).
- Rota `/juridico` é feature completa (reads inline em `page.tsx` + `components/juridico/`), não um
  `modules/juridico/queries.ts`.

## 3. Escopo — o que entra e o que NÃO entra

**Entra na consolidação:**
- `DocumentoJuridico` + `DocJuridicoVersao` → `Documento` (`origem=juridico` ou `contrato`, conforme `tipo`).
- `AceiteDocumento` (assinatura) — **precisa ser preservado** (ver D-5b-1).

**NÃO entra (ficam como estão):**
- **`Certidao`** e cia. — são certidões com validade p/ **licitações**, não "documento do cliente".
  Fora de escopo (concern de habilitação/vencimento).
- **`ModeloContrato`** — é template de texto, não arquivo. Fica no Estúdio/jurídico.
- **`PastaJuridica`** — organização em árvore. Decisão D-5b-2: portar como `Documento.categoria`/tags,
  ou manter a árvore só para a visão `/juridico`. Recomendação: **não** portar a árvore agora (mapear
  `pasta` → `categoria`/`descricao` textual); reavaliar depois.

## 4. Decisões (precisam de OK antes de codar)

### D-5b-1 (a mais importante) — Onde vive o aceite/assinatura?
`Documento`/`DocumentoVersao` **não têm** aceite hoje. Opções:
- **(a, recomendado)** Portar o aceite: criar `AceiteDocumentoCliente { documentoVersaoId, userId,
  assinadoEm, hashSha256, ip, userAgent }` (espelha `AceiteDocumento` + `AceiteTermo`) e migrar os
  aceites existentes. O jurídico passa a assinar `DocumentoVersao`. Fluxo/telas de assinatura migram
  para o novo model.
- **(b)** Híbrido: `DocumentoJuridico` **continua existindo só para o aceite/assinatura**, e cada um
  espelha um `Documento` (origem=juridico) para aparecer na ficha do cliente. Menos migração, mas
  mantém dois models — contraria a meta de unificação.
- **(c)** Adiar jurídico: fazer só 5a e deixar o jurídico fora até haver necessidade real.

### D-5b-2 — `PastaJuridica` (árvore) → `categoria`/tags planas, ou manter árvore? (ver §3)

### D-5b-3 — `tipo` do jurídico (contrato/aditivo/procuração…) → `Documento.categoria` ou um enum
`OrigemDocumento` estendido? Recomendação: `categoria` livre (já existe), origem = `juridico`.

## 5. Passos de implementação (assumindo D-5b-1a)

1. **Schema:** novo `AceiteDocumentoCliente` (assinatura de `DocumentoVersao`); estender
   `OrigemDocumento` com `juridico` se necessário; back-relations.
2. **Migração de dados:** `documento_juridico` → `documento` (origem por `tipo`), `doc_juridico_versao`
   → `documento_versao` (preserva `numero`, `arquivoPath`→`caminho`; **hashSha256 ausente** no legado →
   `''` como na Fase 1; `mime`/`tamanho` a derivar do disco ou `null`/`0`), e `aceite_documento` →
   `aceite_documento_cliente`. `clienteId` do doc: `DocumentoJuridico.clienteId` ou via `projeto.cliente`.
3. **Actions/endpoints:** reusar `documentos-cliente`; adicionar action `assinarDocumento`
   (cria aceite com hash do arquivo no momento — espelha o padrão de `AceiteTermo`/`gerarAceiteCliente`).
4. **UI `/juridico`:** apontar para `Documento(origem=juridico)`; tela de assinatura usa o novo aceite.
   Ficha do cliente já mostra tudo (Fase 4) — jurídico passa a aparecer lá automaticamente.
5. **Acesso:** `podeLer/GerirDocumento` para origem `juridico` deve exigir permissão jurídica
   (recurso `juridico`/`legal` conforme catálogo) além do acesso por âncora. Definir na implementação.
6. **Remover legado:** `documento_juridico`, `doc_juridico_versao`, `aceite_documento` (após migrar);
   endpoints/telas jurídicas de upload/download apontando para o novo model.

## 6. Riscos / pontos abertos

- **Prova legal (não-repúdio):** a migração do aceite não pode perder `hashSha256`/quem/quando. A cópia
  precisa ser exata e auditável; guardar um backup das tabelas antes de dropar.
- **`hashSha256` ausente** nas versões jurídicas legadas — os aceites referenciam o hash **do arquivo**
  no momento do aceite (esse existe em `AceiteDocumento.hashSha256`), mas `DocJuridicoVersao` não guarda
  hash da versão. Recalcular do disco na migração (ler arquivo, SHA-256) para popular `DocumentoVersao.hashSha256`.
- **Licitações:** garantir que nada de `Certidao`/habilitação seja tocado (fora de escopo).
- **`mime`/`tamanho`** ausentes no legado jurídico → derivar do arquivo em disco na migração (stat + sniff)
  ou aceitar `application/octet-stream` + tamanho real via `fs.stat`.
- **Blast radius** em `components/juridico/` + `app/(dashboard)/juridico/` (feature inline, sem módulo de
  queries) — mapear todas as telas antes.

## 7. Recomendação de sequenciamento

Fazer **5a primeiro** (baixo risco, valida o padrão de absorção na aba Arquivos). Só depois **5b**, e
começando por **D-5b-1**. Se o custo/risco do aceite não se justificar, **D-5b-1c** (adiar jurídico) é
uma saída legítima — Fases 1–4 + 5a já entregam a unificação prática do material do cliente.
