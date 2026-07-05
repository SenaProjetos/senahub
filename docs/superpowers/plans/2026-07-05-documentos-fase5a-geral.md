# Plano técnico — Fase 5a: absorver o "Geral" do projeto no repositório `Documento`

**Data:** 2026-07-05 · **Status:** 📋 planejamento (continuação de
[2026-07-05-recebidos-documentos-cliente.md](2026-07-05-recebidos-documentos-cliente.md))

Pré-requisito: Fases 1–4 do plano-mãe (model `Documento` client-anchored já existe e em uso).
Esta é a sub-fase de **baixo risco** da Fase 5: unificar o repositório "Geral" interno do projeto
(`ArquivoProjeto`) dentro de `Documento`. Sem aceite/jurídico envolvido.

---

## 1. Objetivo

Hoje a aba **Arquivos do projeto** tem dois repositórios paralelos de nível-projeto:
- **"Geral"** = `ArquivoProjeto` (+`ArquivoProjetoVersao`), gated `arquivos_gerais`, com categoria
  (contrato|planta|memorial|foto|administrativo|outro).
- **"Recebidos do cliente"** = `Documento` (Fases 1–4).

São o mesmo conceito (arquivo versionado de nível projeto). Fase 5a **funde o Geral em `Documento`**
(`origem=interno`), eliminando um model, dois endpoints, um conjunto de actions e a UI duplicada.

## 2. Estado atual a ser absorvido

- **Model:** `ArquivoProjeto { projetoId, nome, categoria?, descricao?, autorId, versoes[] }` +
  `ArquivoProjetoVersao { arquivoId, numero, caminho, nomeArquivo, mime, tamanho, hashSha256, autorId }`
  (`prisma/schema.prisma` ~1621).
- **Endpoints:** `POST /api/projetos/arquivos` (upload → meta) · `GET /api/projetos/arquivos/[versaoId]/download`.
- **Actions:** `modules/projetos/arquivos/actions.ts` → `criarArquivo` / `adicionarVersaoArquivo` /
  `editarArquivo` / `excluirArquivo` (recurso `projetos:arquivos_gerais:gerir`).
- **Query:** `arquivosDoProjeto(projetoId)` em `modules/projetos/arquivos/queries.ts` (tipo `ArquivoProjetoItem`).
- **UI:** `PastaGeral` em `components/projetos/arquivos-explorer.tsx` (dialogs de novo/editar, versão, excluir).
- **Permissão:** recurso `arquivos_gerais` (`ver`/`gerir`) no catálogo.

`Documento` já cobre tudo isso, faltando só o campo **categoria** (já existe: `Documento.categoria`).

## 3. Decisões

- **`origem=interno`** para os arquivos do Geral (distingue de `recebido_cliente`).
- **Categoria preservada** no campo `Documento.categoria` (mesmas opções).
- **Visibilidade:** o Geral hoje é gated por `arquivos_gerais`. Duas opções (D-5a-1):
  - **(a, recomendado)** mapear `arquivos_gerais` → acesso por âncora + flag "interno": docs
    `origem=interno` exigem `arquivos_gerais:ver`/`gerir` **ou** o acesso de projeto já existente.
    Manter a permissão `arquivos_gerais` só para o filtro de origem interna.
  - **(b)** aposentar `arquivos_gerais` e usar só acesso por projeto. Mais simples, mas muda quem vê
    (qualquer membro do projeto passaria a ver o Geral). Decidir com o usuário.
- **Uma pasta só na UI:** "Recebidos do cliente" e "Geral" viram duas **origens** exibidas como duas
  pastas de topo, alimentadas pela mesma query `documentosDoProjetoPorOrigem(projetoId)`.

## 4. Passos de implementação

1. **Query:** estender `recebidosDoProjeto` → `documentosDoProjeto(projetoId, { origem? })` OU adicionar
   `geralDoProjeto(projetoId)` (= `Documento where projetoId=este AND origem=interno`). Mapper já existe.
2. **Actions:** as de `documentos-cliente` já criam/versão/editam/excluem `Documento`. Adicionar suporte
   a `categoria` no `criarDocumento`/`editarDocumento` (o schema já aceita). Gate: para `origem=interno`
   exigir `arquivos_gerais` (D-5a-1a) dentro de `podeGerirDocumento`.
3. **Upload endpoint:** `POST /api/documentos` já serve; passar `origem=interno` + `categoria` no
   `criarDocumento`. (O endpoint só grava bytes; a origem vem na action.)
4. **UI:** substituir `PastaGeral` por uma `GeralPasta` que usa `Documento(origem=interno)` — reaproveitar
   `RecebidosPasta` parametrizando origem/label/categoria. Manter dialogs de nome/categoria/descrição.
5. **Migração de dados** (`arquivo_projeto` → `documento`): mesma técnica da migração da Fase 1 —
   criar nada novo (tabelas já existem), copiar linhas + versões, derivar `clienteId` de
   `projeto.clienteId`, setar `origem='interno'`, `canal='interno'`, `categoria` preservada; dropar
   `arquivo_projeto` + `arquivo_projeto_versao`.
   - Versões: `ArquivoProjetoVersao` → `DocumentoVersao` (já tem `hashSha256`, 1:1). Preserva `numero`.
6. **Remover legado:** `modules/projetos/arquivos/actions.ts` (parte Geral), `queries.ts`
   (`arquivosDoProjeto`), endpoints `/api/projetos/arquivos` + download, `PastaGeral`, tipo
   `ArquivoProjetoItem`, back-relation `Projeto.arquivos`.
7. **Catálogo de permissão:** manter `arquivos_gerais` (D-5a-1a) ou removê-lo (D-5a-1b).

## 5. Riscos / pontos abertos

- **D-5a-1** (visibilidade `arquivos_gerais`) precisa de OK antes de migrar.
- **Storage:** arquivos do Geral estão em `projetos/arquivos/...` (caminho antigo). A migração **não move
  arquivos no disco** — só copia o `caminho` para `DocumentoVersao.caminho` (relativo a `STORAGE_BASE_PATH`,
  continua válido). Não reprocessar bytes.
- **Referências ao tipo `ArquivoProjetoItem`** em outras telas (buscar antes de remover).
- **`ArquivoProjeto` usado em auditoria/histórico** (entidade "ArquivoProjeto") — logs antigos ficam
  com entidade órfã; aceitável (histórico).

## 6. Critério de pronto

- Aba Arquivos mostra "Geral" (origem interno) e "Recebidos do cliente" (recebido_cliente) do mesmo
  model, com categoria e versões preservadas.
- `arquivo_projeto`/`_versao` dropadas; sem endpoints/`actions`/`queries` do Geral antigo.
- `tsc` + `eslint` limpos; migração verificada (contagem antes/depois) num DB com dados.
