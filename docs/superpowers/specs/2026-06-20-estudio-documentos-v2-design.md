# Estúdio de Documentos v2 — Design / Plano em Fases

> **Data:** 2026-06-20
> **Base:** análise do Estúdio atual (`src/modules/documentos/**`, `src/components/documentos/**`).
> **Origem:** pedido do usuário para concentrar esforços no Estúdio — backlog dele + 12 propostas + decisões.

---

## 1. Estado atual (resumo)
Designer por **bandas** (cabeçalho / cabeçalho de colunas / detalhe-repete / rodapés). Elementos:
label, campo, linha, retângulo, imagem (caminho fixo). Estilo por elemento (fonte tamanho, negrito,
itálico, alinhamento, cores, borda). Editor com snap 8px, zoom, undo/redo, duplicar, travar/ocultar.
Tokens (`[Campo]`, agregados, `[Hoje]`, `[Pagina]`, formatos). **9 fontes** (1 por modelo). Versão,
duplicar, arquivar, padrão por fonte, `DocumentoGerado` (snapshot). Saída **A4 fixo** via print do navegador.

## 2. Decisões (acordadas com o usuário)
- **PDF:** manter print do navegador (preview rápido) **+ adicionar render server-side com Puppeteer**
  (`puppeteer-core` já é dependência) para PDF oficial, envio por e-mail e anexar a projeto/proposta/jurídico.
- **Multi-fonte:** (a) um modelo pode combinar **múltiplas coleções** (sub-relatórios), (b) **fonte externa
  via upload CSV**, e (c) **as fontes visíveis no editor/geração respeitam a permissão do usuário**
  (ex.: projetista não vê a fonte "lançamentos"/"DRE"/"holerite").
- **Compartilhamento:** modelos com **visibilidade por perfil/grupo** (além de pessoal).
- **CAD:** **DXF** (writer próprio, em mm, origem CAD) com foco em **carimbo/selo de prancha**; **DWG nativo
  fora** (sem SDK pago). Suportar **formatos ABNT A0–A4** (NBR 10068) + **carimbos padrão por formato**.
- **Unidades:** página em **mm** com presets; coordenadas de elemento seguem em **px @96dpi** (sem migrar
  modelos existentes); conversão px↔mm centralizada (fator 96/25.4) para presets e DXF.

## 3. Funções a incorporar (do usuário + propostas)
Do usuário: imagens personalizadas (upload) · campo de assinatura · formatos de folha + margens · estilo/
espessura de linha · fontes (família) · texto livre × parágrafo · multi-fonte · modelos por usuário +
compartilhamento · DXF (carimbo) · pranchas ABNT A0–A4 + carimbos padrão por formato.
Propostas (12): PDF server-side · paginação real · agrupamento+subtotais · elemento tabela · condicionais ·
campos calculados · QR/verificação · marca d'água/fundo · multi-seleção+alinhar/distribuir+guias · biblioteca
de blocos · catálogo de modelos + import/export JSON · numeração automática.

## 4. Plano em FASES
Cada fase = `spec → plano → execução` própria (como as ondas M). `master` verde a cada merge.

### Fase D1 — Página, formatos ABNT e elementos base
- **Formatos de folha:** presets A4/A5/Carta **+ ABNT A0–A4** (mm) + **orientação** retrato/paisagem; margens
  por preset (NBR 10068: margem esquerda 25mm p/ encadernação, demais 10/7mm). `pagina` passa a guardar
  `formato`/`orientacao` (dimensões derivadas em mm→px). Modelos atuais (A4) seguem funcionando.
- **Estilo de linha:** `borderStyle` (sólida/tracejada/pontilhada) + espessura, em linha e retângulo.
- **Fontes:** `fontFamily` por elemento (catálogo: Schibsted Grotesk, Red Hat Mono, + 1 serif p/ contratos).
- **Texto parágrafo:** novo tipo "paragrafo" (multilinha, wrap, justificado) além de label de 1 linha.
- **Imagem upload:** elemento imagem aponta para arquivo enviado (reusa `lib/storage`/uploads); galeria simples.
- *Schema JSON evolui (sem migração).* 

### Fase D2 — Geração & saída
- **PDF server-side (Puppeteer):** rota/serviço que renderiza o `DocRender` e produz PDF; manter print.
- **Envio/anexo:** gerar e enviar por e-mail (reusa `lib/mail`) e/ou anexar a projeto/proposta/jurídico.
- **Paginação real:** quebra automática da banda detalhe em páginas, repetindo cabeçalho de colunas + rodapé;
  `[Pagina]/[Paginas]` reais.
- **Numeração automática:** sequência por tipo (ex.: REL-AAXXXX) no `DocumentoGerado` + token `[NumeroDocumento]`.

### Fase D3 — Dados (multi-fonte + permissão + CSV)
- **Múltiplas coleções por modelo:** modelo referencia 1..N fontes; bandas detalhe/sub-relatório por fonte.
- **Permissão por fonte:** cada fonte declara o `recurso:acao` exigido; editor e geração só listam/resolvem as
  fontes que o usuário pode ver (mapa: lançamentos/DRE→`financeiro:ver`, holerite/extrato→`rh`/próprio, projeto→
  `projetos:ver`, licitação→`licitacoes:ver`, etc.).
- **Fonte externa CSV:** upload de CSV → vira uma coleção (mapeamento de colunas → campos do token).
- **Agrupamento + subtotais** e **elemento tabela** (colunas com largura/header/alinhamento).
- *Migração leve possível (CSV armazenado / metadados de fonte no modelo).*

### Fase D4 — Pranchas & DXF (ABNT)
- **Carimbos padrão por formato** (A4/A3/A2/A1/A0) como catálogo de fábrica, seguindo ABNT.
- **Export DXF:** writer próprio (label/campo→TEXT, linha→LINE, retângulo→LWPOLYLINE, imagem ignorada/aviso),
  px→mm, origem CAD (Y para cima), unidades mm. Foco: carimbo/selo + layout vetorial simples.

### Fase D5 — Colaboração & produtividade
- **Propriedade + compartilhamento por perfil/grupo:** `DocumentoModelo` ganha `donoId`, `visibilidade`
  (pessoal | perfis | global) e `perfis String[]`; listagem filtra pelo que o usuário pode ver; publicar.
  *(Migração de schema.)*
- **Biblioteca de blocos reutilizáveis** + **catálogo de modelos de fábrica** + **import/export JSON**.
- **Produtividade do editor:** multi-seleção, alinhar/distribuir, guias/régua.
- **Condicionais + campos calculados + QR/verificação + marca d'água.**

## 5. Schema / migrações (consolidado)
- D1–D4: maior parte evolui dentro de `schemaJson` (Json) — sem migração. CSV (D3) pode exigir armazenamento.
- D5: migração em `DocumentoModelo` (`donoId`, `visibilidade`, `perfis`) + numeração (D2) em `DocumentoGerado`.
- Migrações sempre aditivas/nullable, rodadas de forma controlada (como na rodada de decisões).

## 6. Ordem sugerida
D1 (fundação visível, destrava carimbos/pranchas) → D2 (saída/PDF, alto valor) → D3 (dados/permissão) →
D4 (DXF/ABNT) → D5 (colaboração). Cada uma entregue e mergeada antes da próxima.

## 7. Pendências p/ confirmar
- Ordem das fases acima OK? Começar por **D1**?
- Catálogo de fontes tipográficas (quais famílias liberar)?
- CSV: só upload manual no momento da geração, ou também salvar datasets reutilizáveis?
