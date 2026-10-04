# IFC federado — exportar o modelo unificado da Compatibilização

Contrato da feature. Desenho aprovado com o dono em 2026-10-04, por seção, na conversa que originou
este arquivo. Vence o plano em caso de conflito.

## 1. O problema

A Compatibilização (`/projetos/[id]/coordenacao`) já mostra todos os IFCs do projeto juntos no
visualizador, mas não existe um jeito de **tirar** essa maquete do sistema. O escritório precisa de:

- **(A)** um arquivo que o cliente ou um terceiro abra num visualizador simples (BIMvision, Solibri
  Anywhere, usBIM) e veja a obra inteira de uma vez — portanto **um único IFC válido**, com um
  `IfcProject` e todas as disciplinas dentro;
- **(C)** esse arquivo **guardado no projeto** como entrega/registro ("modelo federado da revisão X"),
  com histórico de versões e o mesmo caminho de envio ao cliente que os demais documentos.

Fora do escopo: pacote .zip com um IFC por disciplina (uso em Navisworks/Solibri para clash) — o
dono escolheu o arquivo único.

## 2. Decisões do dono (2026-10-04)

| # | Decisão |
|---|---|
| D1 | O resultado é **um único IFC** (um `IfcProject`), não um pacote. |
| D2 | A pessoa **escolhe os modelos** num diálogo com lista de marcar, que já abre com os modelos **ligados no visualizador**. Modelos que não podem entrar aparecem desabilitados **com o motivo**. IFCs recebidos do cliente também podem entrar. |
| D3 | O arquivo vira `Documento` do projeto com origem nova **`modelo_federado`** (mesmo caminho da Base Arquitetônica). Cada geração é **uma versão nova do mesmo documento** (R01, R02…). |
| D4 | Na aba Arquivos ele aparece numa pasta **"Modelo federado" dentro do Desenvolvimento, no mesmo nível das pastas das disciplinas** — e não em "Geral", que nem todos veem. |
| D5 | **Não** se cria disciplina falsa nem se torna `disciplinaId` opcional em `Upload`/`DocumentoDisciplina` (a `Disciplina` tem 16 relações: prazo, valor, pagamento, EAP, cards, saúde; o `Upload` é lido em quase toda consulta da aba Arquivos). |
| D6 | **Visibilidade = a da Compatibilização**: vê a pasta e baixa quem tem `coordenacao:ver` e enxerga o projeto (`veModelosDoProjeto`, `modules/coordenacao/acesso.ts`), **independente da muralha por disciplina** — essa pessoa já vê todos os IFCs juntos no visualizador, então nada vaza. Gerar e excluir: `coordenacao:gerir`. |
| D7 | Fase 2: marcar **Compartilhado / Liberado para obra** com ponteiro próprio para a versão marcada (versão nova não move o ponteiro, igual a `DocumentoDisciplina.revisaoCompartilhadaId`). No link público, opção própria **"Incluir modelo federado"**, desligada por padrão — o link libera disciplinas a dedo e o federado traz todas. |
| D8 | Junção **no texto STEP, em streaming, num child process** (abordagem A). Sem web-ifc na junção. |
| D9 | **Schema único** (IFC2X3, IFC4 ou IFC4X3) e **unidade de comprimento única** entre os modelos escolhidos — o resto fica bloqueado com motivo. Converter mm↔m fica para o futuro, se virar dor real. |
| D10 | **GlobalId repetido** entre modelos **não bloqueia**: o arquivo sai e a geração registra um aviso com quantos e em quais modelos. |

## 3. Fatiamento

- **Fase 1** — gerar o IFC federado, pasta "Modelo federado" no Desenvolvimento, versões, baixar,
  excluir, aviso no sino.
- **Fase 2** — Compartilhado / Liberado para obra + link público (página, download de arquivo, .zip).

As seções 4–9 descrevem a Fase 1; a seção 10, a Fase 2.

## 4. Elegibilidade de um modelo (puro)

Arquivo `modules/coordenacao/federado/regras.ts`, sem I/O, testado. Entrada: os modelos que o
visualizador conhece (disciplina = `Upload` IFC vigente; recebido = `DocumentoVersao` IFC), com
schema e unidade lidos do arquivo (seção 5.1) e o estado da conversão.

Um modelo fica **desabilitado** — com a frase exibida na lista — quando:

| Caso | Motivo exibido |
|---|---|
| Conversão não concluída ou com erro | "Este modelo ainda não foi convertido. Aguarde ou reconverta na lista de modelos." |
| IFC sumiu do disco | "O arquivo IFC deste modelo não está mais no servidor." |
| Schema diferente do primeiro marcado | "IFC2X3 — os marcados são IFC4. Exporte de novo em IFC4." |
| Unidade diferente do primeiro marcado | "Em metros — os marcados estão em milímetros. Exporte de novo na mesma unidade." |
| Cabeçalho ilegível / não é IFC | "Não foi possível ler o cabeçalho deste IFC." |

"Primeiro marcado" = o primeiro da lista na ordem exibida (disciplinas pela `ordem`, depois os
recebidos). Ele define o schema, a unidade e o `IfcProject` mestre. Desmarcar o primeiro passa o papel
ao próximo e reavalia os demais. Pelo menos **2** modelos marcados para gerar.

O servidor revalida tudo isso na action e de novo no job (o arquivo pode ter mudado entre o diálogo e a
geração) — a mesma função pura, a mesma frase.

## 5. Motor de junção (abordagem A)

### 5.1 Varredura (passada 1, por arquivo)

`modules/coordenacao/federado/step.ts` (puro: recebe linhas/strings, devolve estruturas) +
`scripts/federar-ifc.ts` (I/O, child process, lê em stream). De cada IFC:

- **schema**: `FILE_SCHEMA(('IFC4'))` do cabeçalho;
- **id do `IfcProject`** e seus `RepresentationContexts` (atributo 8, igual em IFC2X3 e IFC4) e
  `UnitsInContext` (atributo 9);
- **unidade de comprimento**: o `IfcSIUnit` de `UnitType = .LENGTHUNIT.` dentro do
  `IfcUnitAssignment` do projeto → `MILLI`/`CENTI`/`""`(METRE)…; `IfcConversionBasedUnit` → o nome
  (`FOOT`, `INCH`). Comparação por esse rótulo canônico;
- **maior `#id`**;
- **GlobalIds** (primeiro atributo das entidades `IfcRoot`: string de 22 caracteres do alfabeto IFC),
  para o aviso de repetidos.

### 5.2 Escrita (passada 2)

- **Cabeçalho**: `FILE_DESCRIPTION` com a `ViewDefinition` do mestre + uma linha por modelo da
  composição (nome, disciplina, versão); `FILE_NAME` com o nome do arquivo, data, autor e
  `'SenaHub'`; `FILE_SCHEMA` do mestre.
- **Renumeração**: o modelo *i* soma `offsetᵢ = Σ maiorId dos anteriores` a **toda** referência `#n` e
  ao id de cada instância. O mestre tem offset 0.
- **Projeto único**: nos modelos não-mestre, a linha do `IfcProject` **não é escrita** e toda
  referência a ele passa a apontar para o id do projeto mestre — assim o `IfcRelAggregates` de cada
  modelo pendura o seu `IfcSite` no projeto único (e `IfcRelDeclares`/`IfcRelDefinesByProperties` do
  projeto seguem o mesmo caminho).
- **Contextos**: a linha do `IfcProject` mestre é reescrita com `RepresentationContexts` = os dele +
  os contextos **raiz** (não os subcontextos) de cada outro modelo, já renumerados.
- **Unidades** dos outros modelos ficam no arquivo (órfãs do projeto, mas referenciadas por
  propriedades com `Unit`) — inofensivo e igual nos dois schemas.
- **Geometria e posições**: copiadas byte a byte. As posições são as do arquivo — as mesmas que o
  visualizador mostra; realinhamento e georreferência já viram **versão nova do IFC** antes de
  chegar aqui.

### 5.3 Leitor STEP (o que o tokenizador precisa aguentar)

Instância que ocupa várias linhas; string entre aspas simples com `''` escapado e com `#`, `;`, `(`
dentro (não são referências); `\X2\…\X0\`; comentário `/* … */`; `$` e `*`; enums `.X.`. Só `#n`
**fora de string** é referência. Tudo isso tem teste unitário com IFC sintético em string.

### 5.4 Saída e limites

- Escreve em `<destino>.parcial`, calcula SHA-256 no caminho e renomeia no fim; em falha, apaga o
  parcial.
- Memória constante: linha a linha, sem carregar o arquivo inteiro. Só o conjunto de GlobalIds fica em
  memória (≈ 80 MB para 1 milhão de elementos).
- Limite: soma dos tamanhos de entrada ≤ `2 × TAMANHO_MAX_IFC` (4 GB) — acima disso a action recusa
  com "Os modelos marcados somam X GB; o limite é 4 GB. Desmarque algum modelo."
- Contrato do child igual ao `deslocar-ifc.ts`: caminhos relativos a `STORAGE_BASE_PATH`, uma linha
  JSON em stdout (`{"ok":true,"tamanho":N,"sha256":"…","avisos":[…]}` ou `{"ok":false,"erro":"…"}`),
  exit 0/1. Timeout no orquestrador: 30 min.

## 6. Fluxo

1. Compatibilização → **"Exportar IFC federado"** (nas ações da tela, ao lado de "Exportar BCF") abre o
   diálogo da lista de marcar (D2). Cada linha: nome, disciplina ou "Recebido do cliente", versão,
   schema, unidade, tamanho; bloqueados desabilitados com o motivo; total em GB no rodapé.
2. **"Gerar"** → `gerarModeloFederado` (`defineAction`, `coordenacao:gerir`, Zod: `projetoId` +
   lista de `modeloId`, auditado) revalida, grava a `GeracaoModeloFederado` em `fila` com a
   **composição congelada** (ids de `Upload`/`DocumentoVersao` exatos) e envia o job
   `gerar-ifc-federado` com `singletonKey = projetoId`. Já existindo geração `fila|processando` do
   projeto → `ActionError("Já há uma geração do modelo federado em andamento neste projeto.")`.
3. **Job** (handler em `lib/jobs-handlers.ts`, `boss` via accessor do `globalThis`): marca
   `processando`, roda o child sobre as versões da composição (se alguma sumiu → erro dizendo qual),
   e numa transação cria o `Documento` (`origem = modelo_federado`, `projetoId`, `clienteId` do
   projeto, nome "Modelo federado") **ou** reaproveita o existente, cria a `DocumentoVersao`
   (`numero` = último + 1) e marca a geração `concluido` com `documentoVersaoId` e `avisos`. Nome do
   arquivo: `<Projeto.codigo>-FEDERADO-R<nn>.ifc`. Caminho no storage ao lado dos demais documentos do
   projeto, via `resolverCaminho`.
4. **Sino** para quem pediu, categoria `coordenacao`: "Modelo federado R03 pronto" (link para a pasta)
   ou "Não foi possível gerar o modelo federado: <motivo>".
5. A Compatibilização mostra a **última geração**: status, versão, data, autor, avisos (GlobalId
   repetido) e "Baixar". Enquanto `fila|processando`, o botão de gerar fica desabilitado com o motivo.

O job só roda sob `dev:server`/produção (como a conversão de IFC); em `npm run dev` a geração fica em
`fila`, e a tela diz isso.

## 7. Dados (1 migração, aditiva)

- `OrigemDocumento` ganha `modelo_federado`.
- Tabela `GeracaoModeloFederado`: `id`, `projetoId` (FK, índice), `status`
  (`fila | processando | concluido | erro`), `composicao Json` (lista de
  `{ modeloId, tipo, versaoRef, nome, disciplina, schema, unidade }`), `erro String?`,
  `avisos Json?`, `documentoVersaoId String?` (FK `SetNull`), `autorId`, `criadoEm`,
  `iniciadoEm?`, `concluidoEm?`.
- A composição responde, para sempre, **quais versões entraram em cada R** — a versão é imutável:
  não existe "Nova versão" manual no documento federado.

## 8. Onde o arquivo aparece e o que pode ser feito

- **Aba Arquivos → Desenvolvimento**: pasta virtual **"Modelo federado"** no nível das disciplinas,
  só quando o documento existe e a pessoa passa em D6. Lista as versões (vigente em destaque).
  Ações (descritor puro `itensDoModeloFederado()`, ADR-0002, mesmo array no menu de contexto, no
  `⋯` e na barra de seleção): **Baixar**; **Excluir versão** (`coordenacao:gerir`, com confirmação).
  Sem "Nova versão", sem status documental, sem renomear.
- **Diretório geral `/arquivos`** (mesma tela da aba): a pasta aparece igual, sob o projeto.
- **Download**: rota existente `/api/documentos/[id]/download`, com dois ajustes: `podeLerDocumento`
  (`modules/documentos-cliente/acesso.ts`) ganha o ramo da origem `modelo_federado` = gate D6; e a
  resposta passa a ser **streaming** (`createReadStream`, como a rota `.frag`) — hoje ela lê o
  arquivo inteiro num `Buffer` (`lerArquivo`), o que não cabe num federado de vários GB.
- **Não aparece** em: Recebidos do cliente, Base Arquitetônica, Geral, portal do cliente, lista de
  modelos da Compatibilização (carregaria a obra duas vezes) e no diff/clash.

**Armadilha conhecida — filtros por origem.** Hoje "Recebidos" e o portal filtram
`origem notIn [interno, base_arquitetonica]` e a lista de modelos da Compatibilização filtra
`origem not interno` (`modules/coordenacao/queries.ts`). Uma origem nova entraria em todos eles. O
plano substitui os literais por constantes únicas num arquivo puro (ex.:
`ORIGENS_FORA_DE_RECEBIDOS`, `ORIGENS_FORA_DA_COORDENACAO`) e um teste-guarda varre `src/` atrás de
`notIn: ["interno"` / `not: "interno"` soltos sobre `documento`.

## 9. Testes e verificação

- **Unitários (vitest, puros)**: tokenizador STEP (5.3); renumeração e reescrita do `IfcProject`
  mestre; leitura de schema/unidade/projeto/contextos; detecção de GlobalId repetido; regras de
  elegibilidade (4) com cada motivo; descritor de ações da pasta; constantes de origem.
- **Teste-guarda** dos filtros por origem (8).
- **Smoke `npm run smoke:ifc-federado`** (banco de dev): gera dois IFC4 sintéticos mínimos
  (projeto → site → edifício → pavimento → parede extrudada), roda o child, abre a saída com web-ifc e
  confere: um só `IfcProject`; as duas paredes com os GlobalIds originais; contagem de entidades =
  soma − (n−1) projetos; `RepresentationContexts` com os contextos de ambos. Depois roda o
  `converter-ifc.ts` sobre a saída (prova que a geometria é legível). Cobre também: recusa de schema
  e de unidade diferentes, geração simultânea recusada, versão R02 na segunda geração, exclusão de
  versão, federado ausente de Recebidos e da lista da Compatibilização.
- **Verificação com IFC real** `npm run verify:ifc-federado <projetoId>`: junta os modelos vigentes
  de um projeto do banco de dev, converte para `.frag` e compara a contagem de elementos com a soma
  das conversões individuais. Rodar em ao menos um projeto com Revit (mm) de 3+ disciplinas antes do
  merge.
- **Tela**: abrir o arquivo gerado num visualizador externo (BIMvision) e conferir que as disciplinas
  caem no mesmo lugar que no visualizador do SenaHub.

## 10. Fase 2 — Compartilhado, Liberado para obra e link público (desenho)

- `Documento` ganha `versaoCompartilhadaId` / `versaoLiberadaObraId` (FK para `DocumentoVersao`,
  `SetNull`), usados só pela origem `modelo_federado`. Marcar/desmarcar = ação na pasta (mesmo
  descritor), `coordenacao:gerir`; versão nova não move o ponteiro (mesma regra de
  `modules/uploads/revisao-marcada.ts`).
- As pastas-mãe **Compartilhado** e **Liberado para obra** mostram uma pasta "Modelo federado" com a
  versão marcada, na mesma posição relativa que no Desenvolvimento.
- `LinkPublicoArquivos.incluirModeloFederado Boolean @default(false)`; ligado, o link mostra a versão
  marcada como Compartilhado (ou Liberado para obra, conforme a pasta) — na página, no download de um
  arquivo e no `.zip`, pela mesma regra pura (as quatro rotas do link não podem discordar, ver
  `link-publico-regras.ts`).
- Fase 2 ganha seu próprio bloco no plano e smoke próprio quando a Fase 1 estiver em dev.
