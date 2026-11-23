# Portal do cliente — agenda (contrato e reuniões) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente do portal vê, num cartão "Agenda", as datas de contrato (assinatura, marcos de entrega com "Combinado × Previsão atual" e nota de motivo, prazo do projeto, fim da vigência) e as reuniões que a coordenação agenda; avisos entram no resumo diário que já existe.

**Architecture:** Módulo novo `src/modules/portal/agenda/` no molde de `portal/atas` e `portal/aprovacao-entrega`: regras puras testadas (`marcos.ts`, `reunioes.ts`, `itens-resumo.ts`) → `queries.ts` (DTO por lado, allow-list) → `service.ts` (único escritor) → `actions.ts` (`defineAction`). Duas tabelas novas (`MarcoAgendaPortal`: nota + última previsão vista; `ReuniaoAgendada`: agendamento, ligado à ata por `reuniaoId`). O resumo diário ganha uma etapa de conferência de previsão e itens novos; o fluxo de atas só aceita ligar a ata à reunião agendada.

**Tech Stack:** Next.js 15 / React 19, Prisma 7 (`@/generated/prisma/client`), Zod, vitest (node), pg-boss (job `portal-resumo-diario` já existente), base-ui shadcn.

**Spec:** `docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md` (aprovada em 2026-11-23). Ler junto: `docs/superpowers/specs/2026-11-22-portal-atas-reuniao-design.md` e `2026-11-19-portal-resumo-diario-design.md`.

## Global Constraints

- Código em inglês; **UI, mensagens de erro e commits em pt-BR**. Commits semânticos com o trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Branch `feat/portal-agenda` (já existe); nunca trabalhar em `dev`/`master`.
- Importar o Prisma de `@/generated/prisma/client`. Nunca `migrate dev` nem `prisma format`; **nunca `sed` global no `schema.prisma`** (editar com âncora única + assert; o arquivo é CRLF). Migração: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → ler o SQL inteiro (só objetos novos) → `npx prisma migrate deploy` → `npm run db:generate`.
- vitest **só pelo PowerShell**: `npx vitest run <arquivo>` / `npx vitest run --maxWorkers=6`. Nunca `next build` com `dev`/`dev:server` desta pasta no ar. Não ler o `.env`.
- Toda mutação por `defineAction` (`@/lib/with-action`); texto digitado que sai ao cliente vai em `redact`. Equipe = `interno: true` + `podeVerConversaDoProjeto(userId, projetoId)` (`@/modules/portal/mensagens/service`); cliente = `contaPodeVerConversa(userId, projetoId)`. Recusa uniforme `"Agenda não encontrada."`.
- Troca de estado = `updateMany` condicionado ao estado lido (count ≠ 1 → `"A reunião mudou. Atualize a página."`). Dentro de `$transaction`: nada de `Promise.all`, nada de `select/include` aninhado de relação — leituras planas e em sequência.
- Datas = dia de São Paulo (`diaDeSaoPaulo()` de `@/lib/data`), colunas `@db.Date`; `Projeto.prazoContrato` e `DocumentoJuridico.assinadoEm` são `DateTime` com hora → passar por `diaDeSaoPaulo(d)` antes de virar dia. Escrever dia em coluna com `new Date(\`${dia}T00:00:00.000Z\`)`.
- DTO do cliente por **allow-list**: nunca valor/percentual da parcela, nome de linha da EAP, id de EAP, nome de pessoa da equipe, hora de nota. Marco do cliente é identificado pelo **id da parcela** do contrato.
- Valores do spec: nota 1–500 caracteres; título da reunião 1–120; local ≤ 200; pauta ≤ 1.000; motivo de cancelamento ≤ 300; duração 5–600 min; link só `https://` ≤ 500 sem credenciais; hora `HH:mm`; "Marco próximo" = item com `dia` = previsão − 8 (sai na manhã de previsão − 7); lembrete de reunião = `dia` = dia da reunião − 2; contratos válidos = `tipo = "contrato"`, `statusContrato` ∈ {`assinado`, `vencido`}, `formaCobranca = por_entrega` (marcos), `vinculoId` nulo, `clienteId` = cliente da conta.
- Componentes de lista com menu seguem o ADR-0002: descritor puro `itensDe…` (`AcaoItem[]`), o MESMO array no menu de contexto e no `...`; item proibido pelo estado fica desabilitado com a mesma frase do servidor; linha com uma ação só não ganha menu de contexto; nunca escrever `contextmenu` na mão. Cabeçalho/telas: 390×844 sem rolagem horizontal; 1366×768 com o menu aberto.
- Novo smoke entra no `package.json` e na lista do `CLAUDE.md`. Manual (`docs/manual/...`) e `novidades.md` atualizados.
- Stage **por caminho** (nunca `git add -A`/`.`); conferir `git show --stat` depois de cada commit.
- Correção ao spec (achada na leitura do código): aditivo de cliente **não** carrega nova vigência (`vigenciaNova` só existe em `AditivoEquipe`), então o item "Fim da vigência" usa `DocumentoJuridico.dataVencimento` direto, sem `vencimentoEfetivo`.

## Review Focus

Entradas que o spec implica mas as tarefas principais não testam sozinhas; cada uma tem o teste no dono do código:

1. **Data perto da meia-noite**: `assinadoEm = 2026-12-01T02:30Z` é 30/11 em São Paulo; `prazoContrato` idem. (Task 2, teste de `itensFixos`.)
2. **Marco sem `BL-00`, marco apagado, duas parcelas no mesmo marco, parcela "na assinatura"**: nunca inventar "Combinado", nunca duplicar, nunca mostrar a parcela sem marco. (Task 2.)
3. **Link `javascript:`/`http:`/com credenciais e hora `24:00`/`9:5`** na reunião. (Task 3.)
4. **Texto da coordenação com Markdown/HTML** (`*`, `[x](y)`, `<b>`) chegando ao e-mail do resumo: sai escapado. (Task 4.)
5. **Dois cliques ao mesmo tempo** em editar/cancelar a reunião e **duas atas ligadas à mesma reunião**; **outro cliente, cliente inativo e projetista** lendo ou escrevendo. (Tasks 6, 7 e 11, smoke.)

---

### Task 1: Schema e migração

**Files:**
- Modify: `prisma/schema.prisma` (enums novos; `MarcoAgendaPortal`, `ReuniaoAgendada`; campos de relação inversa em `Projeto`, `EapTarefa`, `User`, `ReuniaoProjeto`)
- Create: `prisma/migrations/20261123180000_agenda_portal/migration.sql`

**Interfaces:**
- Produces: modelos Prisma `marcoAgendaPortal` e `reuniaoAgendada`; enums `EstadoReuniaoAgendada { agendada cancelada }` e `MudancaReuniaoAgendada { remarcada cancelada }`.

- [ ] **Step 1: Adicionar os modelos ao fim da seção das atas (depois de `ReuniaoProjeto`/`AtaVersao`).** Campos exatamente como no spec ("Modelo de dados"): `MarcoAgendaPortal` (`id`, `projetoId` cascade + `@@index`, `marcoId @unique` → `EapTarefa` cascade, `nota String? @db.Text`, `notaPorId` → `User` SetNull, `notaEm DateTime?`, `previsaoVista/previsaoAnterior/previsaoAlteradaEm DateTime? @db.Date`, `createdAt`, `updatedAt`) e `ReuniaoAgendada` (`id`, `projetoId` cascade, `titulo`, `dia @db.Date`, `horaInicio String`, `duracaoMinutos Int?`, `link/local/pauta/motivoCancelamento String?`, `estado EstadoReuniaoAgendada @default(agendada)`, `canceladaEm DateTime?`, `diaAnterior @db.Date?`, `horaAnterior String?`, `mudancaEm @db.Date?`, `mudancaTipo MudancaReuniaoAgendada?`, `criadaPorId` → `User` SetNull, `criadaEm DateTime @default(now())`, `reuniaoId String? @unique` → `ReuniaoProjeto` SetNull, `createdAt`, `updatedAt`, `@@index([projetoId, dia])`). `@@map("marco_agenda_portal")` / `@@map("reuniao_agendada")`. Relações nomeadas para `User` (`"MarcoAgendaNotaPor"`, `"ReuniaoAgendadaCriadaPor"`).
- [ ] **Step 2: Relações inversas** nos models existentes, cada uma com âncora única verificada (`assert count == 1`) num script Node/Python — `Projeto.marcosAgenda MarcoAgendaPortal[]`, `Projeto.reunioesAgendadas ReuniaoAgendada[]`, `EapTarefa.agendaPortal MarcoAgendaPortal?`, `User.marcosAgendaNotas MarcoAgendaPortal[] @relation("MarcoAgendaNotaPor")`, `User.reunioesAgendadas ReuniaoAgendada[] @relation("ReuniaoAgendadaCriadaPor")`, `ReuniaoProjeto.agendada ReuniaoAgendada?`. Preservar CRLF.
- [ ] **Step 3: Gerar o SQL** (`migrate diff … --script`), gravar em `migration.sql`, **ler inteiro**: só `CREATE TYPE/TABLE/INDEX` e FKs novos; nenhum `ALTER`/`DROP` de objeto existente (se houver, voltar ao Step 2 — algo foi editado por engano).
- [ ] **Step 4: Aplicar.** Run: `npx prisma migrate deploy` e `npm run db:generate`. Expected: migração aplicada, client gerado sem erro.
- [ ] **Step 5: Conferir.** Run: `npx prisma migrate status`. Expected: "Database schema is up to date".
- [ ] **Step 6: Commit** — `git add prisma/schema.prisma prisma/migrations/20261123180000_agenda_portal/migration.sql` / `feat(portal): tabelas da agenda (marco e reunião agendada)`.

---

### Task 2: Regras puras dos marcos e itens fixos

**Files:**
- Create: `src/modules/portal/agenda/marcos.ts`
- Test: `src/modules/portal/agenda/marcos.test.ts`

**Interfaces:**
- Produces (todos puros, sem Prisma/`server-only`; datas como `YYYY-MM-DD`):
  - `type ContratoEntrada = { id: string; titulo: string; tipo: string; statusContrato: string | null; formaCobranca: "por_data" | "por_entrega"; clienteId: string | null; projetoId: string | null; vinculoId: string | null; assinadoEm: Date | null; dataVencimento: Date | null; parcelas: { id: string; descricao: string; ordem: number; naAssinatura: boolean; marcoId: string | null }[] }`
  - `type MarcoEntrada = { id: string; projetoId: string; status: string; fimPrevisto: string; fimReal: string | null }`
  - `type EntradaDaAgenda = { projetoId: string; clienteId: string; prazoContrato: Date | null; cronograma: { aprovado: boolean; emRevisao: boolean } | null; contratos: ContratoEntrada[]; marcos: ReadonlyMap<string, MarcoEntrada>; combinado: ReadonlyMap<string, string> /* marcoId → fim na BL-00 */ }`
  - `type MarcoDaAgenda = { parcelaId: string; marcoId: string; titulo: string; combinado: string | null; previsao: string; diferencaDias: number | null; situacao: "no_prazo" | "alterada" | "entregue" | "sem_combinado"; entregueEm: string | null }`
  - `type ItemFixo = { tipo: "assinatura" | "prazo" | "vigencia"; dia: string; contratoTitulo?: string }`
  - `marcosDaAgenda(e: EntradaDaAgenda): MarcoDaAgenda[]` — aplica as 4 regras de entrada do spec (contrato válido; parcela não `naAssinatura` com `marcoId` e marco do mesmo projeto; cronograma `aprovado`; marco existente), **uma linha por marco** (primeira parcela por `ordem`, depois `id`), ordenados por data (previsão, ou entrega para os entregues).
  - `itensFixos(e: EntradaDaAgenda): ItemFixo[]` — assinatura (`assinadoEm`), prazo (`prazoContrato`), vigência (`dataVencimento`), cada um só se existir, todos via `diaDeSaoPaulo`.
  - `diferencaEmDiasCorridos(de: string, ate: string): number`; `rotuloDiferenca(n: number): string` (`+18 dias`, `+1 dia`, `2 dias antes`, `1 dia antes`, `no dia`).
  - `situacaoDoMarco(m: { concluido: boolean; combinado: string | null; previsao: string }): MarcoDaAgenda["situacao"]`.
  - Constantes de mensagem: `MOTIVO_AGENDA_NAO_ENCONTRADA = "Agenda não encontrada."`, `MOTIVO_MARCO_ENTREGUE = "Este marco já foi entregue — a nota não aparece mais para o cliente."`, `MOTIVO_SEM_NOTA = "Este marco não tem nota."`, `NOTA_MAX = 500`, `MOTIVO_NOTA_VAZIA = "Escreva a nota."`, `MOTIVO_NOTA_LONGA = "A nota passa de 500 caracteres."`.
- Marco "concluído" = `status === "con"`; data entregue = `fimReal ?? fimPrevisto`; previsão de marco não entregue = `fimPrevisto`.

- [ ] **Step 1: Escrever `marcos.test.ts` (falhando)** com, pelo menos: (a) contrato `aditivo`/`proposta`, status `rascunho`/`rescindido`, `por_data`, `vinculoId` preenchido ou cliente diferente → nenhum marco; (b) cronograma `null` ou `aprovado: false` → nenhum marco (mas `itensFixos` continua devolvendo assinatura/prazo/vigência); (c) parcela `naAssinatura` e parcela com `marcoId: null` não entram; (d) marco de outro projeto não entra; (e) duas parcelas (dois contratos) no mesmo marco → uma linha, descrição da de menor `ordem`; (f) `combinado` ausente no mapa → `situacao: "sem_combinado"`, `diferencaDias: null`; (g) previsão 18 dias depois → `alterada`, `diferencaDias: 18`; previsão igual/antes → `no_prazo`; (h) marco `con` → `entregue`, `entregueEm = fimReal`, combinado mantido; (i) **Review Focus 1**: `assinadoEm = new Date("2026-12-01T02:30:00Z")` → `itensFixos` dá `2026-11-30`; idem `prazoContrato`; (j) `rotuloDiferenca(18) === "+18 dias"`, `(-2) === "2 dias antes"`, `(0) === "no dia"`, `(1) === "+1 dia"`.
- [ ] **Step 2: Rodar e ver falhar.** Run (PowerShell): `npx vitest run src/modules/portal/agenda/marcos.test.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `marcos.ts`** com as assinaturas acima. Sem imports de Prisma; `diaDeSaoPaulo` de `@/lib/data` é puro e pode ser importado.
- [ ] **Step 4: Rodar e ver passar.** Run: o mesmo comando. Expected: PASS, todos os casos.
- [ ] **Step 5: Commit** — `git add src/modules/portal/agenda/marcos.ts src/modules/portal/agenda/marcos.test.ts` / `feat(portal): regras puras dos marcos da agenda`.

---

### Task 3: Regras puras das reuniões agendadas

**Files:**
- Create: `src/modules/portal/agenda/reunioes.ts`
- Test: `src/modules/portal/agenda/reunioes.test.ts`

**Interfaces:**
- Produces (puros):
  - Constantes de limite: `TITULO_MAX = 120`, `LOCAL_MAX = 200`, `PAUTA_MAX = 1000`, `MOTIVO_CANCELAR_MAX = 300`, `DURACAO_MIN = 5`, `DURACAO_MAX = 600`, `LINK_MAX = 500`.
  - Mensagens: `MOTIVO_REUNIAO_PASSADA = "Reunião já realizada."`, `MOTIVO_REUNIAO_CANCELADA = "Reunião cancelada."`, `MOTIVO_ATA_ANTES_DO_DIA = "A ata só pode ser importada a partir do dia da reunião."`, `MOTIVO_JA_TEM_ATA = "Esta reunião já tem ata."`, `MOTIVO_REUNIAO_MUDOU = "A reunião mudou. Atualize a página."`, `MOTIVO_DIA_PASSADO = "Escolha o dia de hoje ou um dia futuro."`.
  - `type CamposReuniao = { titulo: string; dia: string; horaInicio: string; duracaoMinutos: number | null; link: string | null; local: string | null; pauta: string | null }`
  - `validarReuniao(c: CamposReuniao, hoje: string): { ok: true; valor: CamposReuniao } | { ok: false; erro: string }` — aplica `trim`, vazio→`null`, título 1–120, `dia` `YYYY-MM-DD` real e ≥ `hoje`, `horaInicio` `^([01]\d|2[0-3]):[0-5]\d$`, duração 5–600 ou nula, `link` via `linkValido`, local/pauta nos limites.
  - `linkValido(s: string): boolean` — só `https:`; ≤ 500; recusa `username`/`password` na URL, `http:`, `javascript:`, `data:`.
  - `type EstadoDaReuniao = { estado: "agendada" | "cancelada"; dia: string; diaAnterior: string | null; horaAnterior: string | null }`; `situacaoDaReuniao(r: EstadoDaReuniao, hoje: string): "agendada" | "remarcada" | "cancelada" | "realizada"` (ordem do spec: cancelada → realizada se `dia < hoje` → remarcada se há anterior → agendada).
  - `mudouDiaOuHora(antes: { dia: string; horaInicio: string }, depois: { dia: string; horaInicio: string }): boolean`.
  - `motivoParaNaoEditar(r: EstadoDaReuniao, hoje: string): string | null` (cancelada → `MOTIVO_REUNIAO_CANCELADA`; passada → `MOTIVO_REUNIAO_PASSADA`), `motivoParaNaoImportarAta(r: EstadoDaReuniao & { reuniaoId: string | null }, hoje: string): string | null` (cancelada; já tem ata → `MOTIVO_JA_TEM_ATA`; `dia > hoje` → `MOTIVO_ATA_ANTES_DO_DIA`).

- [ ] **Step 1: Escrever `reunioes.test.ts` (falhando):** `linkValido("https://meet.google.com/abc-defg-hij")` true; falso para `http://x.com`, `javascript:alert(1)`, `data:text/html,x`, `https://user:pw@x.com`, `"https://" + "a".repeat(500)`; `validarReuniao` recusa `horaInicio` `"24:00"`, `"9:5"`, `"09:60"` (**Review Focus 3**) e aceita `"00:00"`, `"23:59"`; recusa `dia` anterior a `hoje` (`MOTIVO_DIA_PASSADO`) e `"2026-02-30"`; aceita `dia === hoje`; recusa duração 4 e 601, aceita 5, 600 e `null`; título só espaços → erro; campos vazios viram `null`; `situacaoDaReuniao`: cancelada com dia passado → `cancelada`; remarcada cujo dia já passou → `realizada`; com `diaAnterior` e dia futuro → `remarcada`; `motivoParaNaoImportarAta` nos quatro casos do spec (futura, cancelada, já com ata, hoje/passada → `null`); `mudouDiaOuHora` falso quando só link/local/pauta mudam (o teste passa só dia+hora, então basta cobrir igual/diferente).
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/modules/portal/agenda/reunioes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `reunioes.ts`.** Link: `new URL()` em `try/catch`, conferir `protocol`, `username`, `password`.
- [ ] **Step 4: Rodar e ver passar.** Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/modules/portal/agenda/reunioes.ts src/modules/portal/agenda/reunioes.test.ts` / `feat(portal): regras puras das reuniões agendadas`.

---

### Task 4: Itens do resumo diário (puro) e decisão da conferência

**Files:**
- Create: `src/modules/portal/agenda/itens-resumo.ts`
- Test: `src/modules/portal/agenda/itens-resumo.test.ts`
- Modify: `src/modules/portal/resumo-diario.ts` (tipo `ItemDoResumo`; `itensDosDias`, `listaEmMarkdown`, `textoDoSino` passam a aceitar `ItemDoResumo`)
- Test: `src/modules/portal/resumo-diario.test.ts` (um caso novo)

**Interfaces:**
- Consumes: `somarDiasIso`, `escaparMarkdown` de `resumo-diario.ts`; `MarcoDaAgenda` de `marcos.ts`.
- Produces:
  - Em `resumo-diario.ts`: `export type ItemDoResumo = { dia: string; disciplina: string; texto: string }` (`ItemLinhaDoTempo` continua atribuível a ele; nada mais muda no cartão "Linha do tempo").
  - Em `itens-resumo.ts`:
    - `type MarcoParaAviso = { titulo: string; combinado: string | null; previsao: string; concluido: boolean; nota: string | null; previsaoAnterior: string | null; previsaoAlteradaEm: string | null }`
    - `type ReuniaoParaAviso = { titulo: string; dia: string; horaInicio: string; link: string | null; local: string | null; estado: "agendada" | "cancelada"; criadaDia: string; mudancaEm: string | null; mudancaTipo: "remarcada" | "cancelada" | null; diaAnterior: string | null; horaAnterior: string | null; motivoCancelamento: string | null }`
    - `itensDosMarcos(marcos: MarcoParaAviso[]): ItemDoResumo[]` (marco próximo com `dia = previsão − 8`; previsão alterada com `dia = previsaoAlteradaEm`; ambos só se `!concluido`; sem trecho `(combinado: …)` quando `combinado` é nulo; nota na linha seguinte, escapada).
    - `itensDasReunioes(rs: ReuniaoParaAviso[]): ItemDoResumo[]` (marcada, remarcada/cancelada, lembrete — regras do spec "Avisos no resumo diário"; lembrete some se `max(criadaDia, mudancaEm)` ≥ `dia − 2`).
    - `type DecisaoConferencia = { acao: "nada" } | { acao: "gravar_vista" } | { acao: "alterou"; anterior: string }`; `decidirConferencia(p: { vista: string | null; atual: string; concluido: boolean; emRevisao: boolean }): DecisaoConferencia` (em revisão ou concluído → `nada`; sem vista → `gravar_vista`; igual → `nada`; diferente → `alterou` com `anterior = vista`).
  - `disciplina` dos itens = `"Agenda"`; textos exatos do spec: `Entrega do projeto básico prevista para 15/03/2026.`; `Entrega do projeto básico: previsão alterada de 02/04 para 20/04 (combinado: 15/03)`; `Reunião agendada: <título>, 12/12/2026 às 14:00.` (+ ` Link: …` ou ` Local: …`); `Reunião remarcada: <título>, de 10/12 às 14:00 para 12/12 às 15:00.`; `Reunião cancelada: <título> (12/12/2026).` (+ motivo); `Lembrete: <título>, 12/12/2026 às 14:00.` Datas dd/mm/aaaa; "de/para" sem ano quando o mesmo ano.

- [ ] **Step 1: Escrever `itens-resumo.test.ts` (falhando):** marco próximo com previsão `2026-03-15` tem `dia === "2026-03-07"`; marco concluído não gera nada; alterada: texto com e sem `(combinado: …)` e nota na linha seguinte; **Review Focus 4**: nota `"*urgente* [x](http://a) <b>oi</b>"` sai com os caracteres escapados (`\*`, `\[`, `\<`), e o título da reunião também; reunião: marcada tem `dia = criadaDia`; criada e cancelada no mesmo dia → nenhum item; remarcada no mesmo dia da criação → só "marcada" (com os valores atuais); remarcada em dia posterior → item com `dia = mudancaEm`; cancelada com motivo; lembrete `dia = dia − 2`, ausente para cancelada e para reunião marcada com menos de 2 dias de antecedência; `decidirConferencia` nos 5 casos (`emRevisao: true` → `nada`; `concluido` → `nada`; `vista: null` → `gravar_vista`; igual → `nada`; diferente → `alterou`).
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/modules/portal/agenda/itens-resumo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `itens-resumo.ts`** reaproveitando `escaparMarkdown` (exportada de `resumo-diario.ts`). Atenção: `listaEmMarkdown` já escapa `i.disciplina` e `i.texto` — para a nota (linha seguinte), o texto do item pode conter `\n`; **escapar só o que é do banco** (título, nota, link, local, motivo) dentro de `itens-resumo.ts` e passar `texto` já seguro; ajustar `linhaDoItem` em `resumo-diario.ts` para NÃO escapar `texto` duas vezes **somente** para itens da agenda (usar `disciplina === "Agenda"` não — usar um campo opcional `seguro?: true` em `ItemDoResumo`; itens da linha do tempo continuam escapados como hoje).
- [ ] **Step 4: Ajustar `resumo-diario.ts`**: tipo `ItemDoResumo` (com `seguro?: boolean`), parâmetros de `itensDosDias/listaEmMarkdown/textoDoSino`; adicionar um caso em `resumo-diario.test.ts` provando que item `seguro` não é escapado duas vezes e item comum continua escapado.
- [ ] **Step 5: Rodar tudo do módulo.** Run: `npx vitest run src/modules/portal/agenda src/modules/portal/resumo-diario.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** — `git add src/modules/portal/agenda/itens-resumo.ts src/modules/portal/agenda/itens-resumo.test.ts src/modules/portal/resumo-diario.ts src/modules/portal/resumo-diario.test.ts` / `feat(portal): itens da agenda no resumo diário (regras puras)`.

---

### Task 5: Leituras (DTO do cliente e da equipe)

**Files:**
- Create: `src/modules/portal/agenda/queries.ts` (`import "server-only"`)

**Interfaces:**
- Consumes: Task 2 (`marcosDaAgenda`, `itensFixos`, `EntradaDaAgenda`), Task 3 (`situacaoDaReuniao`), `contaPodeVerConversa`/`podeVerConversaDoProjeto`.
- Produces:
  - `carregarEntradaDaAgenda(projetoId: string): Promise<EntradaDaAgenda | null>` (lê o projeto e seu `clienteId`, `prazoContrato`, `CronogramaProjeto {aprovado, emRevisao}`, contratos do projeto com `parcelasEntrega`, os `EapTarefa` dos `marcoId` (`id, projetoId, status, fimPrevisto, fimReal`), e `EapBaselineLinha` da baseline `numero: 0` do projeto casada por `tarefaId` → mapa `combinado`; consultas **planas**, sem `Promise.all` não é exigido fora de transação mas manter simples). Aprovação ausente → `combinado` vazio.
  - `type ItemAgendaCliente` = união discriminada por `tipo`: `{ tipo: "assinatura" | "prazo" | "vigencia"; dia: string }`; `{ tipo: "marco"; chave: string /* parcelaId */; titulo: string; combinado: string | null; previsao: string; diferencaDias: number | null; situacao: MarcoDaAgenda["situacao"]; entregueEm: string | null; nota: string | null }`; `{ tipo: "reuniao"; id: string; titulo: string; dia: string; horaInicio: string; duracaoMinutos: number | null; link: string | null; local: string | null; pauta: string | null; situacao: "agendada" | "remarcada" | "cancelada" | "realizada"; diaAnterior: string | null; horaAnterior: string | null; motivoCancelamento: string | null; temAta: boolean }`.
  - `agendaParaCliente(projetoId: string, userId: string): Promise<ItemAgendaCliente[] | null>` — `null` se `!(await contaPodeVerConversa(userId, projetoId))`; nota só quando marco não entregue.
  - `type MarcoParaEquipe = MarcoDaAgenda & { contratoTitulo: string; nota: string | null; notaPorNome: string | null; notaEm: string | null }`; `type ReuniaoParaEquipe` (campos da reunião + `criadaPorNome`, `reuniaoId`, `situacao`, `podeImportarAta: string | null /* motivo ou null */`, `motivoNaoEditar: string | null`); `agendaParaEquipe(projetoId: string, userId: string): Promise<{ marcos: MarcoParaEquipe[]; reunioes: ReuniaoParaEquipe[]; semMarcosPorque: string | null } | null>` (`null` se `!podeVerConversaDoProjeto`; `semMarcosPorque` = motivo de o contrato por entrega não aparecer: cronograma em rascunho / contrato não assinado / parcela sem marco).
  - `temAta` = `ReuniaoProjeto` ligada, sem `retiradaEm`, com ao menos uma `AtaVersao` `publicada`.

- [ ] **Step 1: Implementar `queries.ts`.** Reuniões em ordem de `dia` e `horaInicio`; no DTO do cliente `situacao` via `situacaoDaReuniao(…, diaDeSaoPaulo())`; ordenar a lista final do cliente por data com os passados/entregues no fim (a ordenação de itens finais é função pura `ordenarAgenda(itens, hoje)` exportada de `marcos.ts`? **Não** — fica em `queries.ts` como função local simples, coberta pelo smoke).
- [ ] **Step 2: Verificar tipos.** Run: `npx tsc --noEmit -p tsconfig.json` com `NODE_OPTIONS=--max-old-space-size=8192`. Expected: sem erro novo em `agenda/`.
- [ ] **Step 3: Commit** — `git add src/modules/portal/agenda/queries.ts` / `feat(portal): leituras da agenda para cliente e equipe`.

---

### Task 6: Nota de motivo (serviço, schema, ações)

**Files:**
- Create: `src/modules/portal/agenda/schemas.ts`, `service.ts`, `actions.ts` (as reuniões entram na Task 7 nos mesmos arquivos)

**Interfaces:**
- Consumes: Task 2 (constantes `NOTA_MAX`, mensagens), Task 5 (`carregarEntradaDaAgenda`, `marcosDaAgenda`).
- Produces:
  - `schemas.ts`: `salvarNotaSchema = z.object({ projetoId, marcoId, nota })` (nota string, mensagem pt-BR; o teto do schema é o dobro, como em `portal/atas/schemas.ts`), `removerNotaSchema = z.object({ projetoId, marcoId })`.
  - `service.ts`: `salvarNota(p: { projetoId: string; marcoId: string; nota: string; userId: string }): Promise<void>` e `removerNota(p: { projetoId: string; marcoId: string; userId: string }): Promise<void>`. Ambos: `podeVerConversaDoProjeto` senão `ActionError(MOTIVO_AGENDA_NAO_ENCONTRADA)`; o `marcoId` tem de estar entre os marcos de `marcosDaAgenda` do projeto (senão `MOTIVO_AGENDA_NAO_ENCONTRADA`); marco entregue → `MOTIVO_MARCO_ENTREGUE`; nota aparada 1–500 (`MOTIVO_NOTA_VAZIA` / `MOTIVO_NOTA_LONGA`); `remover` sem nota → `MOTIVO_SEM_NOTA`. Escrita: `upsert` por `marcoId` (cria a linha sob demanda, `previsaoVista` nulo) gravando `nota`, `notaPorId`, `notaEm`.
  - `actions.ts` (`"use server"`): `salvarNotaDoMarco` e `removerNotaDoMarco` — `defineAction({ modulo: "portal", acao: "agenda-nota-salvar"|"agenda-nota-remover", entidade: "MarcoAgendaPortal", interno: true, schema, redact: ["nota"] }, …)`; `revalidatePath` de `/projetos/${projetoId}/cliente` e `/portal/${projetoId}`.

- [ ] **Step 1: Escrever os schemas** (pt-BR em toda mensagem; ver `portal/atas/schemas.ts` como molde).
- [ ] **Step 2: Implementar `service.ts` (nota).** Sem `Promise.all`; leitura plana.
- [ ] **Step 3: Implementar `actions.ts` (nota).**
- [ ] **Step 4: Verificar tipos.** Run: `npx tsc --noEmit` (mesmo `NODE_OPTIONS`). Expected: limpo. (Comportamento provado pelo smoke da Task 11.)
- [ ] **Step 5: Commit** — `git add src/modules/portal/agenda/schemas.ts src/modules/portal/agenda/service.ts src/modules/portal/agenda/actions.ts` / `feat(portal): nota de motivo por marco da agenda`.

---

### Task 7: Reuniões agendadas (serviço, ações) e ligação com a ata

**Files:**
- Modify: `src/modules/portal/agenda/schemas.ts`, `service.ts`, `actions.ts`
- Modify: `src/modules/portal/atas/service.ts` (`criarReuniaoComRascunho` aceita `agendadaId`), `src/modules/portal/atas/schemas.ts` (`criarAtaDeTextoSchema.agendadaId` opcional), `src/modules/portal/atas/actions.ts` (repassa), `src/app/api/portal/atas/importar/route.ts` (lê `?agendadaId=`)

**Interfaces:**
- Consumes: Task 3 (`validarReuniao`, `motivoParaNaoEditar`, `motivoParaNaoImportarAta`, mensagens).
- Produces:
  - `schemas.ts`: `agendarReuniaoSchema` (`projetoId` + `CamposReuniao`), `editarReuniaoSchema` (`reuniaoAgendadaId` + campos), `cancelarReuniaoSchema` (`reuniaoAgendadaId`, `motivo` opcional).
  - `service.ts`: `agendarReuniao(p: CamposReuniao & { projetoId: string; userId: string }): Promise<{ id: string }>`; `editarReuniao(p: CamposReuniao & { id: string; userId: string }): Promise<{ projetoId: string }>`; `cancelarReuniao(p: { id: string; motivo: string | null; userId: string }): Promise<{ projetoId: string }>`; `projetoDaReuniaoAgendada(id: string): Promise<string | null>`.
  - Em `atas/service.ts`: `criarReuniaoComRascunho` ganha `agendadaId?: string | null`. Quando presente, **dentro da transação**, depois de criar a `ReuniaoProjeto`: `updateMany` em `ReuniaoAgendada` com `where { id: agendadaId, projetoId, estado: "agendada", reuniaoId: null }` → `data { reuniaoId }`; `count === 0` → `throw new ActionError(MOTIVO_JA_TEM_ATA)` (a transação desfaz a ata). Antes da transação: `motivoParaNaoImportarAta` com o estado lido (reunião de outro projeto/inexistente → `MOTIVO_NAO_ENCONTRADA` de atas). `data`/`titulo` default vêm da reunião agendada quando o chamador não os passou.
- Regras de escrita: `agendar` → `podeVerConversaDoProjeto`, `validarReuniao(…, diaDeSaoPaulo())`, cria com `criadaPorId`; `editar` → lê, `motivoParaNaoEditar`, `validarReuniao`, `updateMany where { id, estado: "agendada", dia: { gte: hoje } }`; se `mudouDiaOuHora` grava `diaAnterior`/`horaAnterior` (valores de antes), `mudancaEm = hoje`, `mudancaTipo = "remarcada"`; senão nada disso; `count ≠ 1` → `MOTIVO_REUNIAO_MUDOU`; `cancelar` → mesma trava, grava `estado: "cancelada"`, `canceladaEm`, `motivoCancelamento` (≤ 300), `mudancaEm = hoje`, `mudancaTipo = "cancelada"`. Dia gravado: `new Date(\`${dia}T00:00:00.000Z\`)`.
- Ações: `agendarReuniaoDoProjeto`, `editarReuniaoAgendada`, `cancelarReuniaoAgendada` — `defineAction` `interno: true`, `entidade: "ReuniaoAgendada"`, `redact: ["pauta", "motivo"]`, `capturarAntes` no editar/cancelar, `revalidatePath` dos dois lados.

- [ ] **Step 1: Schemas das reuniões** (pt-BR; limites do spec, dobro no teto do schema).
- [ ] **Step 2: Implementar `agendar/editar/cancelar` em `service.ts`.**
- [ ] **Step 3: Ligar a ata.** Alterar `criarReuniaoComRascunho` (+ schema, ação e rota `importar` lendo `agendadaId` do query string como o `projetoId`) como descrito; o retorno não muda. Não tocar em mais nada de `atas/`.
- [ ] **Step 4: Implementar as três ações.**
- [ ] **Step 5: Rodar o que já existe de atas.** Run (PowerShell): `npx vitest run src/modules/portal/atas`. Expected: PASS (nada de atas mudou de comportamento sem `agendadaId`).
- [ ] **Step 6: Verificar tipos** (`tsc` com heap maior). Expected: limpo.
- [ ] **Step 7: Commit** — `git add src/modules/portal/agenda/schemas.ts src/modules/portal/agenda/service.ts src/modules/portal/agenda/actions.ts src/modules/portal/atas/service.ts src/modules/portal/atas/schemas.ts src/modules/portal/atas/actions.ts src/app/api/portal/atas/importar/route.ts` / `feat(portal): agendar, remarcar e cancelar reunião; ata ligada à reunião`.

---

### Task 8: Conferência de previsão e itens no resumo diário

**Files:**
- Create: `src/modules/portal/agenda/conferencia.ts` (`import "server-only"`)
- Modify: `src/modules/portal/resumo-service.ts` (`resumirProjeto`/`rodarResumoDiario`)
- Modify: `src/modules/portal/agenda/queries.ts` (`itensDoResumoDaAgenda`)

**Interfaces:**
- Consumes: Task 4 (`decidirConferencia`, `itensDosMarcos`, `itensDasReunioes`, `ItemDoResumo`), Task 5 (`carregarEntradaDaAgenda`).
- Produces:
  - `conferirPrevisoes(projetoId: string, ontem: string): Promise<{ gravadas: number; alteradas: number }>` — para cada marco de `marcosDaAgenda`: `decidirConferencia({ vista, atual: previsao, concluido: situacao === "entregue", emRevisao: cronograma.emRevisao })`; `gravar_vista` → `upsert` (`previsaoVista = atual`); `alterou` → `updateMany` por `marcoId` condicionado a `previsaoVista` igual ao lido: `previsaoAnterior = vista`, `previsaoVista = atual`, `previsaoAlteradaEm = ontem`. Não lança por marco (loga e segue).
  - `itensDoResumoDaAgenda(projetoId: string): Promise<ItemDoResumo[]>` (em `queries.ts`): lê marcos (com a linha `MarcoAgendaPortal`) e reuniões do projeto e devolve `[...itensDosMarcos(...), ...itensDasReunioes(...)]`. **Mesmo filtro de "quais marcos entram"** da tela (reusa `marcosDaAgenda`).
  - `resumo-service.ts`: `resumirProjeto` recebe `ontem: string`; no começo, dentro do `try` do projeto, `await conferirPrevisoes(p.id, ontem).catch(log)`; monta `linha = [...(await andamentoDoPortal(p)).linha, ...(await itensDoResumoDaAgenda(p.id))]`; o resto não muda (reserva por conta/projeto/dia/canal, opt-out, sino).

- [ ] **Step 1: Implementar `conferencia.ts` e `itensDoResumoDaAgenda`.**
- [ ] **Step 2: Integrar em `resumirProjeto`** conforme acima (assinatura `resumirProjeto(p, r, o, app, ontem)`).
- [ ] **Step 3: Rodar a regressão do resumo.** Run: `npm run smoke:portal-resumo`. Expected: todos `[OK]` (o smoke existente não pode mudar de resultado).
- [ ] **Step 4: Verificar tipos.** Expected: limpo.
- [ ] **Step 5: Commit** — `git add src/modules/portal/agenda/conferencia.ts src/modules/portal/agenda/queries.ts src/modules/portal/resumo-service.ts` / `feat(portal): conferência de previsão e avisos da agenda no resumo diário`.

---

### Task 9: Cartão "Agenda" do cliente

**Files:**
- Create: `src/components/portal/agenda-card.tsx` (client)
- Modify: `src/app/(dashboard)/portal/[projetoId]/page.tsx` (novo bloco `AgendaDoProjeto` com `LimiteErroEntregas` + `Suspense fallback={null}`, âncora `id="agenda"`, **acima** do bloco "Andamento e entregas" e depois do bloco de Contratos)

**Interfaces:**
- Consumes: `agendaParaCliente`, `ItemAgendaCliente` (Task 5); `rotuloDiferenca` (Task 2).
- Produces: `AgendaCard({ itens }: { itens: ItemAgendaCliente[] })` — `Card` "Agenda"; lista cronológica; passados/entregues recolhidos sob um botão "Ver passadas (N)"; marco mostra `Combinado` e `Previsão atual`, `rotuloDiferenca`, selo de situação com **texto** (não só cor), a nota (rótulo "Coordenação"); reunião mostra título, dia e hora ("horário de Brasília"), botão "Entrar" (`<a href target="_blank" rel="noopener noreferrer">`) só com link `https`, local, pauta, selo Agendada/Remarcada/Cancelada/Realizada, "Remarcada: era 10/12 às 14:00", motivo de cancelamento, atalho "Ver ata" (`href="#atas"`) quando `temAta`. Sem itens → o bloco inteiro não renderiza (a página trata `null`/vazio).

- [ ] **Step 1: Implementar o componente** com `EmptyState` não usado (cartão some quando vazio), `formatarData` de `@/lib/utils`, cores só por tokens do design system (nada de hex).
- [ ] **Step 2: Plugar na página** com leitura própria: `agendaParaCliente(projeto.id, user.id)`; erro isolado pelo `LimiteErroEntregas` (título "Agenda", mensagem "Não foi possível carregar a agenda agora. Tente de novo; se continuar, fale com a coordenação.").
- [ ] **Step 3: Verificar tipos e lint.** Run: `npx tsc --noEmit` e `npm run lint`. Expected: limpo nos arquivos tocados.
- [ ] **Step 4: Commit** — `git add src/components/portal/agenda-card.tsx "src/app/(dashboard)/portal/[projetoId]/page.tsx"` / `feat(portal): cartão Agenda do cliente`.

---

### Task 10: Seção "Agenda" da equipe

**Files:**
- Create: `src/modules/portal/agenda/acoes.ts` (puro), `src/modules/portal/agenda/acoes.test.ts`
- Create: `src/components/agenda-equipe/agenda-equipe.tsx`, `reuniao-dialog.tsx`, `nota-dialog.tsx`
- Modify: `src/app/(dashboard)/projetos/[id]/cliente/page.tsx` (carrega `agendaParaEquipe` e renderiza `<AgendaEquipe>` abaixo de `ReunioesEquipe`)
- Modify: `src/components/atas/nova-ata-dialog.tsx` e `src/components/atas/reunioes-equipe.tsx` (aceitar `agendadaId` opcional e repassar à ação/rota)

**Interfaces:**
- Consumes: DTOs da Task 5; ações das Tasks 6 e 7.
- Produces:
  - `acoes.ts`: `itensDeMarcoAgenda(m: { situacao: MarcoDaAgenda["situacao"]; nota: string | null }): AcaoItem[]` — ids `escrever-nota` (rótulo "Escrever nota" / "Editar nota" conforme `nota`), `remover-nota` (destrutiva); `entregue` → ambos desabilitados com `MOTIVO_MARCO_ENTREGUE`; `remover-nota` sem nota desabilitado com `MOTIVO_SEM_NOTA`. `itensDeReuniaoAgendada(r: { situacao: ReuniaoParaEquipe["situacao"]; motivoNaoEditar: string | null; podeImportarAta: string | null; temAta: boolean }): AcaoItem[]` — ids `editar-reuniao` ("Editar / remarcar"), `cancelar-reuniao` (destrutiva), `importar-ata` ("Importar ata"), desabilitados com o motivo do servidor; reunião com ata ligada não oferece `importar-ata` e ganha link "Ver ata". Seguir `portal/atas/acoes.ts` (ícones `lucide-react`, `AcaoItem` de `@/components/ui/acoes`).
  - `AgendaEquipe({ projetoId, dados }: { projetoId: string; dados: NonNullable<Awaited<ReturnType<typeof agendaParaEquipe>>> })`: dois blocos "Reuniões agendadas" (botão "Agendar reunião", linhas com `LinhaComMenu` + `BotaoAcoes` do **mesmo array**, linha com uma ação só sem menu de contexto) e "Marcos do contrato" (mesma estrutura; aviso `semMarcosPorque` quando houver). `reuniao-dialog.tsx` = formulário (título, dia, hora, duração, link, local, pauta) para agendar e editar, em `DialogBody` com `CollapsibleSection` para link/local/pauta, erros por campo; cancelar usa `MotivoDialog` de `components/atas/motivo-dialog.tsx` (`max={MOTIVO_CANCELAR_MAX}`, `destrutivo`, motivo opcional → ajustar o componente com a prop `obrigatorio?: boolean` mantendo o padrão atual `true`); `nota-dialog.tsx` = textarea com contador 500; "Importar ata" abre `NovaAtaDialog` com `agendadaId`.

- [ ] **Step 1: Escrever `acoes.test.ts` (falhando):** marco entregue → dois itens desabilitados com a frase exata; sem nota → "Escrever nota" habilitado e "Remover nota" desabilitado com `MOTIVO_SEM_NOTA`; com nota → "Editar nota" e "Remover nota" habilitados; reunião cancelada/realizada → editar e cancelar desabilitados com `MOTIVO_REUNIAO_CANCELADA` / `MOTIVO_REUNIAO_PASSADA`; importar ata futura → desabilitado com `MOTIVO_ATA_ANTES_DO_DIA`; reunião com ata → sem `importar-ata`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `npx vitest run src/modules/portal/agenda/acoes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `acoes.ts`.**
- [ ] **Step 4: Rodar e ver passar.** Expected: PASS.
- [ ] **Step 5: Implementar os componentes** e plugar na página; `MotivoDialog` ganha `obrigatorio` (default `true`, nenhum chamador atual muda); `NovaAtaDialog` aceita `agendadaId?: string` (vai na ação e como `?agendadaId=` na rota).
- [ ] **Step 6: Verificar tipos e lint** (`tsc` com heap maior; `npm run lint`). Expected: limpo.
- [ ] **Step 7: Commit** — `git add src/modules/portal/agenda/acoes.ts src/modules/portal/agenda/acoes.test.ts src/components/agenda-equipe src/components/atas/nova-ata-dialog.tsx src/components/atas/reunioes-equipe.tsx src/components/atas/motivo-dialog.tsx "src/app/(dashboard)/projetos/[id]/cliente/page.tsx"` / `feat(portal): seção Agenda da equipe`.

---

### Task 11: Smoke `smoke:portal-agenda`

**Files:**
- Create: `scripts/smoke-portal-agenda.ts`
- Modify: `package.json` (script `"smoke:portal-agenda": "tsx --tsconfig tsconfig.server.json scripts/smoke-portal-agenda.ts"`), `CLAUDE.md` (linha na lista de smokes + um parágrafo curto "Agenda do portal" em Architecture, no molde das atas)

**Interfaces:**
- Consumes: serviços/queries das Tasks 5–8; molde `scripts/smoke-portal-atas.ts` (cenário próprio com sufixo, apagado no fim; helper `check`/`motivoDe`; `somenteProjetos` no resumo com `enviar`/`notificar` falsos como em `smoke-portal-resumo.ts`; guarda e devolve `portal.resumoDiario`).

- [ ] **Step 1: Escrever o smoke** cobrindo (cada item = um `check`): cronograma em rascunho → sem marco, mas itens fixos; aprovado → marco com combinado (BL-00) × previsão; marco fora da `BL-00` → `sem_combinado`; marco `con` → `entregue` sem nota; marco apagado → some; contrato `por_data`, `aditivo` e `rascunho` → sem marcos; outro cliente e cliente inativo → `null`; **allow-list** do JSON do cliente (nenhum `valor`, `percentual`, `marcoId`, nome de pessoa, nome de linha da EAP); nota: coordenadora salva, projetista recusa (`MOTIVO_AGENDA_NAO_ENCONTRADA`), 501 caracteres recusa, entregue recusa, remover sem nota recusa; **dois salvamentos simultâneos** da nota terminam com uma linha; reuniões: agendar (válida; `http://`; hora `24:00`; dia passado), editar só o link não remarca, editar dia/hora remarca e guarda o anterior, cancelar é final e o motivo aparece ao cliente, **editar e cancelar ao mesmo tempo** (um vence, o outro `MOTIVO_REUNIAO_MUDOU`), reunião de dia passado recusa; importar ata: antes do dia recusa, no dia liga, **segunda ata na mesma reunião recusa e desfaz** (nenhum `ReuniaoProjeto` sobra), `temAta` vira verdadeiro e some com ata retirada; **conferência**: primeira vez grava sem avisar; mudança de `fimPrevisto` → um aviso; volta ao mesmo valor antes da rodada → nenhum; `emRevisao` segura; adiantar também avisa; **resumo**: `rodarResumoDiario` com `somenteProjetos` envia sino+e-mail com "previsão alterada" e a nota escapada, `Reunião agendada`, `remarcada`/`cancelada`, `Lembrete` e `Marco` próximo; segunda rodada no mesmo dia = zero (reserva).
- [ ] **Step 2: Rodar.** Run: `npm run smoke:portal-agenda`. Expected: todos `[OK]`, saída final sem `[FALHA]`, cenário apagado.
- [ ] **Step 3: Regressão.** Run: `npm run smoke:portal-atas` e `npm run smoke:portal-resumo`. Expected: todos `[OK]`.
- [ ] **Step 4: `package.json` e `CLAUDE.md`** (linha `npm run smoke:portal-agenda # …` na lista; parágrafo "Agenda do portal" resumindo: tabelas, `Combinado` = `BL-00`, conferência dentro do resumo diário, ata ligada por `agendadaId`).
- [ ] **Step 5: Commit** — `git add scripts/smoke-portal-agenda.ts package.json CLAUDE.md` / `test(portal): smoke da agenda`. (Se `CLAUDE.md` aparecer modificado por outra pessoa no `git status`, fazer o stage pelo método de índice por HEAD descrito nas regras do dono.)

---

### Task 12: Manual e novidades

**Files:**
- Modify: `docs/manual/inicio/portal-cliente.md` (seção "Agenda"), `docs/manual/novidades.md`, e a página do manual do projeto/aba Cliente que descreve as atas (achar com `Grep "Reuniões e atas" docs/manual`) para a equipe: como agendar, remarcar, cancelar, importar ata, escrever nota de motivo.

- [ ] **Step 1: Escrever** em linguagem de usuário (pt-BR, sem jargão): o que o cliente vê; "Combinado × Previsão atual"; como a coordenação escreve a nota; reuniões e avisos no resumo diário.
- [ ] **Step 2: Conferir** que cada afirmação bate com a tela (feito na Task 13).
- [ ] **Step 3: Commit** — `git add docs/manual/inicio/portal-cliente.md docs/manual/novidades.md <página do manual achada>` / `docs(portal): agenda no manual`.

---

### Task 13: Auditoria final (nível 4)

**Files:** nenhum arquivo de produto; prints em `prints-auditoria/2026-11-23_agenda-portal/` (gitignored) com `LEIAME.md`.

- [ ] **Step 1: Ler `docs/PROTOCOLO_AUDITORIA_FINAL.md` de novo** e seguir o nível 4.
- [ ] **Step 2: Checks.** Run: `npx vitest run --maxWorkers=6` (suíte inteira, PowerShell), `npm run lint`, `npx tsc --noEmit` e `npx tsc -p tsconfig.server.json --noEmit` (ambos com `NODE_OPTIONS=--max-old-space-size=8192`), `npm run build` (sem dev no ar), `npm run smoke:portal-agenda`, `smoke:portal-atas`, `smoke:portal-resumo`, `smoke:portal-mensagens`. Expected: tudo verde.
- [ ] **Step 3: Revisores** por área do diff: `action-guardian` (agenda/actions, atas/actions), `prisma-migration-reviewer` (migração), `upload-storage-auditor` (rota `importar`), `a11y-auditor`, `ui-state-linter`, `design-system-guardian`, `client-boundary-auditor`, `test-coverage-scout`, e um revisor geral em modelo capaz. Corrigir o que estiver no escopo; reportar o resto.
- [ ] **Step 4: Verificação em tela** com puppeteer (copiar roteiros de `prints-auditoria/2026-11-23_atas-reuniao/`): usuários demo senha `Demo@2026` (helena coordenadora; bruno projetista; `cliente.portal@demo.senahub`; projeto demo `cmwnmvmyd0004bor54z8sg3mr`), um login por script. Prints a 390×844 (`document.documentElement.scrollWidth === 390`) e 1366×768 com o menu aberto: cartão do cliente (marco "alterada" com nota, reunião agendada/remarcada/cancelada), seção da equipe (menu de contexto e `...` iguais), diálogos. Encerrar o servidor (`taskkill /T` no processo pai) e apagar o cenário de teste.
- [ ] **Step 5: Relatório final em pt-BR** (o que foi feito, o que foi verificado, o que o dono deve conferir, pendências de deploy: `npx prisma migrate deploy` aplica `20261123180000_agenda_portal`) e a pergunta: 1) mesclar em `dev` localmente (fast-forward), 2) push + PR, 3) manter a branch.
