# Ciclo documental — envio ao cliente, "Em revisão" e descrição do carimbo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar já envia ao cliente (config por projeto), a coordenação marca "Em revisão" numa revisão publicada, e o "Enviar para análise" lê a descrição da revisão no quadro do carimbo, recusando vazia/genérica com contestação registrada.

**Architecture:** Emenda do ciclo documental (`src/modules/uploads/ciclo/`). "Em revisão" é um novo `TipoControleRevisao` que passa pelas mesmas funções de controle do `service.ts`. A leitura do quadro é pura (`quadro-revisao.ts`, testada com fixtures recortadas dos PDFs reais) e entra na leitura de carimbo que o envio já faz fora da transação.

**Tech Stack:** Next.js 15 (Server Actions via `defineAction`), Prisma 7 + PostgreSQL 17, Vitest (node), pdfjs-dist legacy (servidor), shadcn sobre base-ui.

**Spec:** [docs/superpowers/specs/2026-10-21-ciclo-documental-revisao-cliente-design.md](../specs/2026-10-21-ciclo-documental-revisao-cliente-design.md) — emenda [2026-10-08-ciclo-documental-iso19650.md](../specs/2026-10-08-ciclo-documental-iso19650.md). Ler os dois.

## Global Constraints

- Trabalhar só em `C:\SENA_ADM\SENAHUB\SENAHub-remake-vscode`, branch `dev-vscode`, banco `senahub_remake_vscode` (porta 5433), dev server na porta 3001.
- Toda mudança de estado/controle só em `ciclo/service.ts`: `updateMany` condicionado + evento dentro da transação (`gravarEventoNoTx`). Toda mutação por `defineAction`. Leitura sem efeito: `defineAction` com `audit: false`.
- Sem `Promise.all` num cliente de transação (guarda `lib/promise-all-em-transacao.test.ts`).
- Arquivos puros (`transicoes.ts`, `acoes.ts`, `regras.ts`, `estados.ts`, `carimbo.ts`, `quadro-revisao.ts`, `envio-regras.ts`) sem Prisma/Next/`server-only`.
- Textos de tela em pt-BR; a MESMA frase no `ActionError` e no item de menu desabilitado (ADR-0002). Confirmar sempre ANTES de `startTransition`.
- shadcn em base-ui: `render={<Comp />}`, nunca `asChild`; `Select.onValueChange` recebe `string | null`.
- Commits: Conventional em pt-BR, `git add` de arquivos específicos (nunca `-A`/`.`), conferir com `git show --stat`, rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Em PowerShell, mensagem com aspas vai por arquivo (`git commit -F`).
- PDFs de `D:\DOWNLOADS\carimbo-exemplo\` NUNCA entram no repositório; fixtures só com os itens do quadro e do campo REVISÃO, com nome de cliente trocado por `CLIENTE`, nomes de pessoas por `AUTOR`.
- Migração com `prisma migrate dev`; se acusar drift e pedir reset, NÃO resetar: aplicar o SQL à mão (`npx prisma db execute --file …`) e `npx prisma migrate resolve --applied <nome>`.
- Comandos: teste único `npx vitest run <arquivo>`; tudo `npm test`; `npm run lint`; tipos `npx tsc --noEmit` (app) e `$env:NODE_OPTIONS="--max-old-space-size=8192"; npx tsc --noEmit -p tsconfig.server.json` (servidor); smoke `npm run smoke:ciclo-documental`.

## Review Focus

1. Dois cliques simultâneos em "Marcar em revisão" na mesma revisão → só uma marca ativa (índice parcial) e a segunda pessoa vê "Esta revisão já está "Em revisão"." — smoke na Task 3.
2. Projeto com o envio automático DESLIGADO: R00 enviada e marcada em revisão, R01 publicada → R00 arquivada sem marca e R01 enviada pela herança N4 (comportamento antigo) — smoke na Task 3.
3. Projeto que já tinha linha em `config_documentos_projeto` antes da migração → passa a enviar ao cliente (a coluna nasce `true` para as linhas existentes) — smoke na Task 3.
4. Carimbo girado 90° e texto palavra por palavra (modelos A e B) → descrição na ordem de leitura, sem palavras da coluna AUTOR — fixtures na Task 7.
5. Contestação com o carimbo sem descrição (`lido = null`) → aviso à coordenação diz "o carimbo não tinha descrição", nunca "dizia: null" — teste na Task 8.

---

### Task 1: Banco — enum `em_revisao`, envio automático e origem da descrição

**Files:**
- Modify: `prisma/schema.prisma` (enum `TipoControleRevisao` ~l.7159; `model ConfigDocumentosProjeto` ~l.9369; `model DocumentoRevisao`)
- Create: `prisma/migrations/20261021100000_ciclo_revisao_cliente/migration.sql`
- Create: `prisma/migrations/20261021100100_controle_em_revisao_um_ativo/migration.sql`
- Modify: `src/modules/uploads/ciclo/estados.ts`

**Interfaces:**
- Produces: `TipoControle` inclui `"em_revisao"`; `ROTULO_CONTROLE.em_revisao = "Em revisão"`; `COR_CONTROLE.em_revisao = "aguardando"`; coluna `ConfigDocumentosProjeto.enviarAoClienteAutomaticamente: boolean`; colunas `DocumentoRevisao.descricaoOrigem: string | null` (`"carimbo" | "digitada" | "contestada"`) e `DocumentoRevisao.descricaoCarimbo: string | null` (o que o carimbo dizia quando contestada).

- [ ] **Step 1:** No schema: `em_revisao` no fim do enum; `enviarAoClienteAutomaticamente Boolean @default(true)` com `///` "Publicar já envia ao cliente (2026-10-21)"; em `DocumentoRevisao`, `descricaoOrigem String?` e `descricaoCarimbo String?` com `///` explicando os três valores.
- [ ] **Step 2:** Migração 1: `ALTER TYPE "TipoControleRevisao" ADD VALUE 'em_revisao';` + os três `ADD COLUMN` (o `DEFAULT true` preenche as linhas que já existem — é a decisão do spec).
- [ ] **Step 3:** Migração 2 (separada: valor novo de enum não pode ser usado na mesma transação em que nasce): `DROP INDEX "controle_revisao_um_ativo";` e recriar com `"tipo" IN ('liberado_obra', 'enviado_cliente', 'em_revisao')`. Atualizar o comentário do índice no schema.
- [ ] **Step 4:** `npm run db:migrate` (ver regra de drift nas Global Constraints) e `npm run db:generate`. Esperado: as duas migrações aplicadas.
- [ ] **Step 5:** `estados.ts`: `em_revisao` em `TIPOS_CONTROLE`, `ROTULO_CONTROLE`, `COR_CONTROLE`. NÃO entra em `CONTROLES_DE_PASTA`.
- [ ] **Step 6:** `npx tsc --noEmit`. Esperado: erros só onde um `Record<TipoControle, …>` ficou incompleto (ex.: `ROTULO_REMOVER` em `acoes.ts`) — completar com o texto da Task 2 e rodar de novo até zerar.
- [ ] **Step 7:** Commit `feat(arquivos): banco do envio automático ao cliente e do controle "Em revisão"`.

### Task 2: Regras puras de "Em revisão" e do envio automático

**Files:**
- Modify: `src/modules/uploads/ciclo/transicoes.ts`, `src/modules/uploads/ciclo/acoes.ts`, `src/modules/uploads/ciclo/regras.ts`
- Test: `src/modules/uploads/ciclo/transicoes.test.ts`, `src/modules/uploads/ciclo/acoes.test.ts`, `src/modules/uploads/ciclo/regras.test.ts`

**Interfaces:**
- Produces: `motivoParaNaoAplicar("em_revisao", …)`; itens de menu com ids `ciclo:aplicar:em_revisao` (rótulo "Marcar em revisão…") e `ciclo:remover:<controleId>` (rótulo "Cancelar revisão…"); `decidirEnvioAoCliente(p: { automatico: boolean; anteriorEnviada: boolean }): "automatico" | "herdado" | null`.

- [ ] **Step 1: testes que falham**
  - `transicoes.test.ts`: em revisão `em_andamento` → `'Só uma revisão publicada pode ficar "Em revisão".'`; publicada com `em_revisao` ativo → `'Esta revisão já está "Em revisão".'`; publicada sem motivo → `"Informe o motivo."`; publicada com `bloqueio` ativo e motivo → `null` (a marca não é barrada por bloqueio); `arquivado` → `"Revisão arquivada é somente leitura."`.
  - `acoes.test.ts`: publicada, `podeAlterarPasta: true`, sem marca → contém item `ciclo:aplicar:em_revisao` habilitado com rótulo `"Marcar em revisão…"`; com marca ativa → não contém o aplicar e contém `ciclo:remover:<id>` com rótulo `"Cancelar revisão…"`; `podeAlterarPasta: false` → nenhum dos dois; estado `compartilhado` → nenhum dos dois.
  - `regras.test.ts`: `decidirEnvioAoCliente({ automatico: true, anteriorEnviada: false })` = `"automatico"`; `(true, true)` = `"automatico"`; `(false, true)` = `"herdado"`; `(false, false)` = `null`.
- [ ] **Step 2:** `npx vitest run src/modules/uploads/ciclo/transicoes.test.ts src/modules/uploads/ciclo/acoes.test.ts src/modules/uploads/ciclo/regras.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Em `motivoParaNaoAplicar`, tratar `em_revisao` como os de pasta (só publicada, um ativo) sem entrar em `CONTROLES_DE_PASTA` — uma constante `CONTROLES_SO_PUBLICADA = [...CONTROLES_DE_PASTA, "em_revisao"]` em `estados.ts` resolve. Em `itensDoCiclo`, o item de marcar fica no bloco `podeAlterarPasta && estado === "publicado"` (ícone `MessageSquareWarning` do lucide); o remover segue `podeAlterarPasta`. `ROTULO_REMOVER.em_revisao = "Cancelar revisão…"`.
- [ ] **Step 4:** mesmos testes → PASS; `npx vitest run src/modules/uploads/ciclo` → PASS.
- [ ] **Step 5:** Commit `feat(arquivos): regras do controle "Em revisão" e do envio automático ao cliente`.

### Task 3: Serviço, ações e avisos

**Files:**
- Modify: `src/modules/uploads/ciclo/service.ts` (`transicionarNoTx` ~l.146, `configDoProjeto` ~l.241, `publicarNoBanco` ~l.346, `ResultadoPublicacao` ~l.326)
- Modify: `src/modules/uploads/ciclo/actions.ts`, `src/modules/uploads/ciclo/notificacoes.ts`
- Modify: `scripts/smoke-ciclo-documental.ts`

**Interfaces:**
- Consumes: `decidirEnvioAoCliente` (Task 2).
- Produces: `ResultadoPublicacao.envioAoCliente: "automatico" | "herdado" | null` (substitui `enviadoAoClienteHerdado: boolean` — atualizar quem lê); action `marcarEmRevisao({ revisaoId: string; motivo: string })` (`recurso: "arquivos"`, `permissao: "alterar_status"`); `removerControlePasta` passa a aceitar `em_revisao` (`PERMISSAO_DO_TIPO.em_revisao = "alterar_status"`); `salvarConfigDocumentos` recebe `enviarAoClienteAutomaticamente: boolean`; `notificarControle` avisa em `em_revisao`.

- [ ] **Step 1: smoke que falha** — em `scripts/smoke-ciclo-documental.ts`, novas checagens com os nomes:
  - `"publicar R00 com o padrão envia ao cliente"` — config sem linha; publicar → controle `enviado_cliente` ativo, `origem = "publicacao"`, `revisaoCompartilhadaId` apontando a R00.
  - `"config antiga nasce com envio automático"` — projeto com linha criada antes (só os campos antigos) lê `enviarAoClienteAutomaticamente = true`.
  - `"marcar em revisão: só uma ativa"` — duas chamadas concorrentes de `aplicarControleNoBanco` com `tipo: "em_revisao"` na mesma revisão → exatamente 1 ativa; a outra cai em `ActionError`.
  - `"marca não tira a R00 do cliente nem da obra"` — R00 enviada e liberada, marcar → os dois ponteiros continuam na R00.
  - `"publicar R01 tira a marca da R00"` — R01 publicada → R00 `arquivado`, `em_revisao` com `removidoEm`, `motivoRemocao = "Revisão R01 publicada"`.
  - `"envio automático desligado = herança antiga"` — config `false`, R00 enviada e marcada, R01 publicada → R01 com `enviado_cliente` (herdado) e R00 sem marca.
  - `"cancelar revisão exige motivo"` — remover sem motivo → `"Informe o motivo."`.
- [ ] **Step 2:** `npm run smoke:ciclo-documental` → as novas checagens falham.
- [ ] **Step 3:** `configDoProjeto` devolve `enviarAoClienteAutomaticamente: c?.enviarAoClienteAutomaticamente ?? true`. Em `publicarNoBanco`, trocar o bloco N4 por `decidirEnvioAoCliente({ automatico: config.enviarAoClienteAutomaticamente, anteriorEnviada: anteriorEnviadaAoCliente })`; `"automatico"` aplica com motivo `"Envio automático ao cliente na publicação"`, `"herdado"` mantém o motivo atual; ambos `quem: null, origem: "publicacao"`.
- [ ] **Step 4:** `transicionarNoTx`: ao arquivar, remover também o `em_revisao` ativo. Motivo: na substituição `` `Revisão ${rotuloRevisao(numeroDaNova)} publicada` `` (passar o número da nova por `opts`, ex. `opts.substituidaPor?: number`); no arquivar à mão, `"Revisão arquivada"`.
- [ ] **Step 5:** Ações: `marcarEmRevisao` (mesma forma de `aplicarControlePasta`, `acao: "ciclo-marcar-em-revisao"`); `em_revisao` em `PERMISSAO_DO_TIPO`; campo novo no schema de `salvarConfigDocumentos`; `publicarRevisao` devolve `envioAoCliente`.
- [ ] **Step 6:** `notificarControle`: com `tipo === "em_revisao"` e `"aplicado"`, avisa os `DisciplinaResponsavel` vigentes da disciplina (`r.disciplinaId`), sem o ator: título `"Revisão solicitada"`, corpo `` `${rotuloRevisao(r.numero)} de ${r.nome} em revisão: ${motivo}` ``, `href(r)` com `&emRevisao=1`. `"removido"` avisa os mesmos com `"Revisão cancelada"`. `notificarPublicacao`: com `envioAoCliente = "automatico"`, o corpo ao autor vira `` `${rev} foi publicada e enviada ao cliente.` ``.
- [ ] **Step 7:** `npm run smoke:ciclo-documental` → PASS (todas, antigas e novas); `npx vitest run src/modules/uploads` → PASS.
- [ ] **Step 8:** Commit `feat(arquivos): publicar envia ao cliente e controle "Em revisão" no serviço`.

### Task 4: Tela da aba Arquivos — menu, lote, selo da R00, filtro e configuração

**Files:**
- Modify: `src/modules/uploads/documentos-agrupados.ts` (select ~l.480, montagem da linha ~l.600, filtro na SQL)
- Modify: o shell que trata `escolhaDoCiclo` + `src/components/projetos/arquivos/ciclo-acao-dialog.tsx`
- Modify: `src/components/projetos/arquivos/barra-selecao-documentos.tsx`, `src/components/projetos/arquivos/ciclo-selos.tsx`
- Modify: o diálogo "Ciclo dos documentos" (procurar o chamador de `salvarConfigDocumentos`) e a barra de filtros da aba Arquivos

**Interfaces:**
- Consumes: `marcarEmRevisao`, `removerControlePasta` (Task 3); ids de menu (Task 2).
- Produces: `LinhaDoc.emRevisao: { numero: number; motivo: string } | null` (a revisão PUBLICADA do documento com marca ativa, qualquer que seja a revisão da linha); filtro de URL `emRevisao=1`.

- [ ] **Step 1:** `documentos-agrupados.ts`: preencher `emRevisao` pela revisão `publicado` com `em_revisao` ativo (já vem em `revisoes[].controles`); filtro `emRevisao=1` como `exists` em `controle_revisao` × `documento_revisao` (tipo `em_revisao`, `removidoEm is null`), seguindo os parâmetros posicionais da SQL que já existe.
- [ ] **Step 2:** Selo: na linha cuja revisão NÃO é a marcada (ex.: R01 em andamento em Desenvolvimento), mostrar `"R00 em revisão"` com a cor `COR_CONTROLE.em_revisao` e o motivo no `title`; na linha da própria revisão marcada, o selo de controle normal já aparece.
- [ ] **Step 3:** Menu: `ciclo:aplicar:em_revisao` abre o `ciclo-acao-dialog` pedindo motivo (rótulo `"O que o cliente pediu"`) e chama `marcarEmRevisao`; o remover pede motivo e chama `removerControlePasta`.
- [ ] **Step 4:** Lote: `LoteCiclo` ganha `"marcar_em_revisao"` (só revisões publicadas sem marca, um motivo para todas); a confirmação do lote "Publicar" avisa `"As revisões publicadas vão para o cliente."` quando o projeto tem o envio automático ligado.
- [ ] **Step 5:** Config: interruptor `"Publicar já envia ao cliente"` ao lado de `liberarObraAutomaticamente`, ligado por padrão.
- [ ] **Step 6:** Verificar em tela (dev server :3001, admin de teste): marcar R00 na pasta Compartilhado, ver o selo em Desenvolvimento, o filtro "Em revisão", cancelar; 390×844 sem rolagem horizontal; 1366×768 com menu aberto. Prints em `prints-auditoria/2026-10-21_revisao-cliente/`.
- [ ] **Step 7:** `npm run lint` e `npx tsc --noEmit` → limpos. Commit `feat(arquivos): marcar em revisão na aba Arquivos, em lote e no filtro`.

### Task 5: Link público mostra "Em revisão"

**Files:**
- Modify: `src/modules/projetos/arquivos/link-publico.ts` (`ArquivoPublico` l.60, `paraArquivoPublico` l.316, `emPastas` l.336, os três selects de upload: `conteudoDaSelecao` l.288, `porSituacao` l.397 e o link comum)
- Modify: `src/app/p/arquivos/[token]/page.tsx` (e o componente que desenha o arquivo)

**Interfaces:**
- Produces: `ArquivoPublico.emRevisao: string | null` (o motivo; `null` = sem marca), levado também em `ArquivoPublicoEmPasta`.

- [ ] **Step 1:** Nos três selects, `revisao: { select: { numero: true, controles: { where: { tipo: "em_revisao", removidoEm: null }, select: { motivo: true }, take: 1 } } }` — juntar ao `revisao` que `SELECT_REGRAS` já pede (um só `revisao` por select). `paraArquivoPublico` e `emPastas` levam `emRevisao`.
- [ ] **Step 2:** Página: selo `"Em revisão"` âmbar ao lado do nome, motivo no `title`; nada muda no download nem no .zip.
- [ ] **Step 3:** Verificar abrindo um link `porSituacao` de teste com a R00 marcada (Compartilhado e Liberado para obra). `npx tsc --noEmit` limpo.
- [ ] **Step 4:** Commit `feat(arquivos): link público mostra a revisão marcada "Em revisão"`.

### Task 6: Código do carimbo com sublinhado

**Files:**
- Modify: `src/modules/uploads/ciclo/carimbo.ts` (`CODIGO` l.40, `REV_FINAL` l.42, `codigoBase` l.47)
- Test: `src/modules/uploads/ciclo/carimbo.test.ts`

- [ ] **Step 1: testes que falham:** `codigoBase("2558_HDR_EX_6001_DTC_R00.DWG")` = `"2558-HDR-EX-6001-DTC"`; `lerCarimbo` com `it_("2558_HDR_EX_6001_DTC_R00.DWG", …)` + `it_("REVISÃO:", …)`/`it_("00", …)` → `codigos` = `["2558-HDR-EX-6001-DTC"]`, `revisao` = 0; `conferirCarimbo` dessa leitura com `nomeArquivo: "2558_HDR_EX_6001_DTC_R01.pdf"`, `numero: 2` → problema de revisão (R00 × R01) e nenhum de código; `"25102_EST_EX_DTC_4001"` lido sem `_Rnn`. Os testes atuais continuam passando.
- [ ] **Step 2:** `npx vitest run src/modules/uploads/ciclo/carimbo.test.ts` → FAIL.
- [ ] **Step 3:** Aceitar `_` como separador em `CODIGO` e `[-_]R(\d{1,3})$` em `REV_FINAL`; `codigoBase` troca `_` por `-` depois de tirar a extensão.
- [ ] **Step 4:** mesmo teste → PASS. Commit `fix(arquivos): carimbo confere código separado por sublinhado`.

### Task 7: Leitura do quadro de revisão (pura)

**Files:**
- Create: `src/modules/uploads/ciclo/quadro-revisao.ts`
- Create: `src/modules/uploads/ciclo/quadro-revisao.test.ts`
- Create: `src/modules/uploads/ciclo/__fixtures__/quadros-revisao.json`

**Interfaces:**
- Consumes: `ItemTextoPdf` (`@/lib/ler-texto-pdf`), `paraEspacoDeLeitura` (`../titulo-carimbo`).
- Produces:
  ```ts
  export type LinhaQuadro = { numero: number; texto: string }; // número como impresso; texto "" = linha vazia
  export type QuadroRevisao = { linhas: LinhaQuadro[] };       // ordenadas por número
  export function lerQuadroDeRevisao(itens: readonly ItemTextoPdf[]): QuadroRevisao | null;
  /** Revisão 0 = R00. Âncora "EMISSÃO INICIAL"; null = não há linha para essa revisão. */
  export function textoDaRevisao(q: QuadroRevisao, revisao: number): string | null;
  export function descricaoGenerica(texto: string): boolean;
  ```

- [ ] **Step 1: fixtures.** Script descartável no scratchpad (não commitar): para cada PDF de `D:\DOWNLOADS\carimbo-exemplo\`, extrair os itens da 1ª página com pdfjs legacy (mesmo formato de `carimbo-servidor.ts`: `str, x, y, w, h, pagina: 1, giro`) e guardar só os que caem no retângulo do quadro (do cabeçalho `REV`/`REV.`/`Revisão`/`Tabela de Revisão` até a última linha numerada, com as colunas) e o campo `REVISÃO:` com o valor. Trocar nome de cliente por `CLIENTE` e nomes de pessoas (coluna AUTOR/Emitido por) por `AUTOR`. Uma entrada por arquivo: `{ "arquivo": "...", "itens": [...] }`. Conferir que nenhum endereço, CNPJ ou CREA ficou.
- [ ] **Step 2: testes que falham** (`quadro-revisao.test.ts`, um `it` por fixture, `textoDaRevisao(lerQuadroDeRevisao(itens)!, rev)`):
  - PECR3-ELE-EX-009-ILU (rev 1) = `"REVISÃO ARQUITETURA TÉRREO"`; PAAUM-HID-EX-001-SAF-TER (1) = `"PRESSURIZAÇÃO AGUA FRIA"`; PAGUA-ELE-EX-003-TOM (1) = `"REV 01: ARQ"`;
  - 2525-EST-EX-DTC-433 (1) = `"ALTERAÇÃO DAS LAJES DO MEZANINO"`; 25102_EST_EX_DTC_4001 (1) começa com `"REVISÃO DA LOCAÇÃO DOS BLOCOS"`; PECR3-PCI-EX-005-DET (1) = `"ADEQUAÇÃO A ARQUITETURA"`; PEDF3-ELE-EX-003 e -004 (1) começam com `'CONFORME DOCUMENTO"'`;
  - 2382-PMP-UBS-EST-07-EMFM (2) = `"REVISÃO DE DETALHES"` e (0) = `"EMISSÃO INICIAL"`;
  - PECAR-ARQ-PE-006-CRT (1) começa com `"Mudança dos ambientes Self Velo e Self Intense."` e contém `"Realocação de luminárias"` (3 linhas juntadas com espaço);
  - 2558_HDR_EX_6001_DTC (1) = `null` e (0) = `"EMISSÃO INICIAL"`; 2558_CLM_EX_8006_DTC (1) = `"REVISÕES"`;
  - nenhum resultado contém `"AUTOR"`;
  - `lerQuadroDeRevisao([])` = `null`;
  - `descricaoGenerica`: `true` para `"REVISÕES"`, `"Revisão"`, `"ALTERAÇÕES GERAIS"`, `"REV 01 - AJUSTES"`, `"EMISSÃO INICIAL"`, `"Correções."`; `false` para `"REV 01: ARQ"`, `"REVISÃO DE DETALHES"`, `"REVISÃO ARQUITETURA TÉRREO"`, `"ALTERAÇÃO DAS LAJES DO MEZANINO"`.
- [ ] **Step 3:** `npx vitest run src/modules/uploads/ciclo/quadro-revisao.test.ts` → FAIL.
- [ ] **Step 4: implementar** no espaço de leitura (`paraEspacoDeLeitura`): achar o cabeçalho (rótulo de revisão + rótulo de descrição `DESCRIÇÃO`/`ASSUNTO`/`Descrição da Revisão` na mesma linha); as linhas são itens só-número (`^\d{1,2}$`) na coluna do rótulo de revisão, do lado do cabeçalho em que há números; o texto da linha = itens à direita do número e à esquerda da próxima coluna do cabeçalho (`AUTOR`, `Emitido por`, `DATA`, `Data`) entre o topo da linha e o topo da próxima, em ordem de leitura (y desc, x asc), juntados com espaço. `textoDaRevisao`: se uma linha tem texto que normaliza para `"EMISSAO INICIAL"`, ela é a revisão 0 e a revisão N é a linha de número `numeroDaÂncora + N`; sem âncora, a de número N. `descricaoGenerica`: sem acento, maiúsculas, tirar pontuação e prefixos `REV\.?\s*\d+`/`R\d+`, tirar `DE DA DO DAS DOS E A O`; genérico se o que sobra for vazio ou só palavras de {REVISAO, REVISOES, ALTERACAO, ALTERACOES, ATUALIZACAO, ATUALIZACOES, AJUSTE, AJUSTES, MODIFICACAO, MODIFICACOES, CORRECAO, CORRECOES, GERAL, GERAIS} ou exatamente `EMISSAO INICIAL`. Calibrar tolerâncias pelas fixtures (decisão do builder).
- [ ] **Step 5:** mesmo teste → PASS. Commit `feat(arquivos): leitura do quadro de revisão do carimbo`.

### Task 8: Descrição do carimbo no "Enviar para análise", com contestação

**Files:**
- Modify: `src/modules/uploads/ciclo/carimbo.ts` (`LeituraCarimbo` ganha `quadro`), `src/modules/uploads/ciclo/carimbo-servidor.ts`
- Modify: `src/modules/uploads/ciclo/envio-regras.ts` + `envio-regras.test.ts`
- Modify: `src/modules/uploads/ciclo/envio-analise.ts`, `src/modules/uploads/ciclo/actions.ts`
- Modify: `src/components/projetos/arquivos/ciclo-acao-dialog.tsx`, `src/modules/uploads/ciclo/acoes.ts` (`CicloDaLinha`), `src/modules/uploads/documentos-agrupados.ts`, `src/components/projetos/arquivos/painel-documento-detalhe.tsx`
- Modify: `src/modules/uploads/historico/eventos.ts` (texto do evento com contestação)

**Interfaces:**
- Consumes: `lerQuadroDeRevisao`, `textoDaRevisao`, `descricaoGenerica` (Task 7).
- Produces:
  ```ts
  // envio-regras.ts
  export type DescricaoDoCarimbo = { tipo: "lida"; texto: string } | { tipo: "vazia" } | { tipo: "generica"; texto: string } | { tipo: "sem_quadro" };
  /** `numero` = número interno da revisão (1 = R00) → `textoDaRevisao(q, numero - 1)`; `revisaoDoCarimbo` já é 0 = R00. */
  export function descricaoDoCarimbo(p: { numero: number; quadro: QuadroRevisao | null; revisaoDoCarimbo: number | null; nomenclaturaLivre: boolean }): DescricaoDoCarimbo;
  export const motivoDescricaoVazia: (rotulo: string) => string;   // "Preencha no carimbo o que mudou nesta revisão (R01)."
  export const motivoDescricaoGenerica: (texto: string) => string; // "A descrição no carimbo (REVISÕES) não diz o que mudou. Escreva no carimbo o que foi alterado."
  export const MOTIVO_DESCRICAO_DIGITADA_GENERICA = "A descrição não diz o que mudou. Escreva o que foi alterado nesta revisão.";
  // EntradaEnvio ganha: carimbo: DescricaoDoCarimbo | null (null = sem PDF); contestada: boolean
  // CicloDaLinha ganha: descricaoOrigem: "carimbo" | "digitada" | "contestada" | null; descricaoCarimbo: string | null
  ```
  Action nova `previaDoEnvio({ revisaoId })` (`audit: false`, `permissao: "enviar"`) → `{ carimbo: DescricaoDoCarimbo | null; rotulo: string }`. `enviarParaAnalise` ganha `contestarCarimbo?: boolean`.

- [ ] **Step 1: testes que falham** (`envio-regras.test.ts`):
  - `descricaoDoCarimbo` com `numero: 2` e quadro com R01 `"ALTERAÇÃO DAS LAJES"` → `{ tipo: "lida", texto: "ALTERAÇÃO DAS LAJES" }`; R01 ausente → `{ tipo: "vazia" }`; R01 `"REVISÕES"` → `{ tipo: "generica", texto: "REVISÕES" }`; quadro `null` → `{ tipo: "sem_quadro" }`; `nomenclaturaLivre: true` e `revisaoDoCarimbo: 2` → usa a linha da revisão 2; `nomenclaturaLivre: true` sem `revisaoDoCarimbo` → última linha com texto.
  - `problemasDoEnvio` (`numero: 2`): `carimbo: lida` sem descrição digitada → sem problema de descrição; `vazia` → contém `motivoDescricaoVazia("R01")`; `generica` → contém `motivoDescricaoGenerica("REVISÕES")`; `vazia` + `contestada: true` + `descricao: "Ajuste da laje L3"` → sem problema; `contestada: true` + `descricao: "Revisões"` → contém `MOTIVO_DESCRICAO_DIGITADA_GENERICA`; `sem_quadro` + `descricao` vazia → `"Descreva o que mudou nesta revisão."` (frase atual); `carimbo: null` (sem PDF) segue a regra atual + genérico; `numero: 1` nunca gera problema de descrição.
- [ ] **Step 2:** `npx vitest run src/modules/uploads/ciclo/envio-regras.test.ts` → FAIL.
- [ ] **Step 3:** Implementar as regras puras. `LeituraCarimbo.quadro: QuadroRevisao | null` preenchido em `lerCarimbo` (`LEITURA_VAZIA.quadro = null`).
- [ ] **Step 4:** `envio-analise.ts`: calcular `descricaoDoCarimbo` (revisão do carimbo = `leitura.revisao`, livre = `!nomenclatura.exigir`) e passar a `problemasDoEnvio`. Depois de passar, gravar na revisão (no `tx`): `lida` → `descricao = texto`, `descricaoOrigem = "carimbo"`; contestada → `descricao` digitada, `descricaoOrigem = "contestada"`, `descricaoCarimbo` = texto lido ou `null`; `sem_quadro`/sem PDF → `descricaoOrigem = "digitada"`. Detalhe do evento de estado ganha `descricao: { origem, lido?, digitado? }`.
- [ ] **Step 5:** Ação `previaDoEnvio` lê o PDF como `enviarParaAnalise` (fora de transação) e devolve `descricaoDoCarimbo`. `enviarParaAnalise` repassa `contestarCarimbo`; o servidor sempre relê o carimbo — nunca confia no texto do cliente.
- [ ] **Step 6:** Diálogo do envio: ao abrir chama `previaDoEnvio`. `lida` → mostra o texto (só leitura) e a caixa `"O carimbo foi lido errado"`, que abre o campo digitado; `vazia`/`generica` → mostra o motivo e a mesma caixa; `sem_quadro`/sem PDF → campo digitado como hoje. Lote "Enviar" não muda: documento barrado fica no relatório com o motivo.
- [ ] **Step 7:** Aviso à coordenação: `CicloDaLinha.descricaoOrigem/descricaoCarimbo` vindos de `documentos-agrupados.ts`; com estado `compartilhado` e origem `contestada`, a linha e o painel mostram `` `Descrição digitada pelo projetista; o carimbo dizia: ${descricaoCarimbo}` `` ou, com `descricaoCarimbo` nulo, `"Descrição digitada pelo projetista; o carimbo não tinha descrição."`. Teste puro dessa frase numa função `avisoDaDescricao(c: Pick<CicloDaLinha, "estado" | "descricaoOrigem" | "descricaoCarimbo">): string | null` em `acoes.ts` (`acoes.test.ts`: os dois textos e `null` para origem `carimbo`/`digitada` ou estado ≠ `compartilhado`).
- [ ] **Step 8:** Verificar em tela com uma revisão R01 de teste cujo PDF é um dos exemplos (cópia local, nunca commitada): lida, vazia (2558_HDR) e genérica (2558_CLM), contestar e ver o aviso como coordenador. `npm test`, `npm run lint`, `npx tsc --noEmit`, tsc do servidor e `npm run smoke:ciclo-documental` → limpos.
- [ ] **Step 9:** Commit `feat(arquivos): descrição da revisão lida do carimbo, com contestação do projetista`.

### Task 9: Manual, novidades e auditoria final

**Files:**
- Modify: `docs/manual/projetos/projetos.md`, `docs/manual/novidades.md`
- Modify: `docs/superpowers/specs/2026-10-21-ciclo-documental-revisao-cliente-design.md` (seção "Estado": o que foi feito e verificado)

- [ ] **Step 1:** Manual em linguagem de usuário: publicar já envia ao cliente (e onde desligar), "Marcar em revisão" / "Cancelar revisão", o que o projetista vê, e a descrição lida do carimbo com a contestação. Novidades: uma entrada curta.
- [ ] **Step 2:** Rodar `docs/PROTOCOLO_AUDITORIA_FINAL.md` (reler; nível pelo risco — mexe em banco e no fluxo de entrega ao cliente) com os revisores da seção 13 e o relatório em pt-BR.
- [ ] **Step 3:** Anotar no spec o estado e a lista do deploy: `npx prisma migrate deploy` (2 migrações) e reinício do serviço; nenhum `db:seed` (sem permissão nova).
- [ ] **Step 4:** Commit `docs(arquivos): manual do envio ao cliente, "Em revisão" e descrição do carimbo`.
