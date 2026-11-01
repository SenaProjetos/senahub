# Lote 6 — Refinos da EAP e do Gantt de controle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (6a) a disciplina de um agrupamento da EAP passa para as linhas de dentro; (6b) as datas Início/Término da grade aceitam máscara `DD/MM/AAAA`, colagem e calendário; (6c) no Gantt de controle a base e a execução têm a mesma espessura (opção B).

**Architecture:** 6a = função pura de propagação + gravação na MESMA transação do `editarLinhaNoBanco`, confirmada na tela com a contagem que o servidor revalida. 6b = máscara pura + ícone de calendário na `CelulaEditavel` usando o `<input type="date">` nativo. 6c = geometria das barras em arquivo puro testado, aplicada em `gantt-barra.tsx`. Nada muda no banco.

**Tech Stack:** Next.js 15 / React 19, Server Actions via `defineAction`, Prisma 7, vitest (env node), tsx para o smoke.

**Spec:** [2026-10-29-lote6-refinos-eap-design.md](../specs/2026-10-29-lote6-refinos-eap-design.md)

## Global Constraints

- UI, mensagens e commits em pt-BR; código em inglês só onde o arquivo já é assim (este módulo usa nomes em português).
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage só os arquivos da tarefa (nunca `git add -A`/`.`); conferir com `git show --stat HEAD`. Sem push, merge nem deploy.
- A árvore tem mudanças NÃO relacionadas de outra frente (formatos exigidos: `prisma/schema.prisma`, `prisma/seed-catalogos.ts`, `src/modules/uploads/ciclo/*`, `src/modules/projetos/nomenclatura/catalogo/*`, `src/components/configuracoes/catalogo*`, `scripts/smoke-ciclo-documental.ts`, a spec do ciclo, a migração `20261028100000_*`, o plano do WhatsApp, e hunks de `docs/manual/novidades.md` e `docs/manual/projetos/projetos.md`). Nunca commitar nem reverter. Em arquivo com hunks alheios, stage só o seu (`git diff -U0 <arq>` + `git apply --cached --unidiff-zero`).
- Arquivos puros (`disciplina-linha.ts`, `datas-linha.ts`, o novo `gantt-geometria.ts`) não importam Prisma, `server-only` nem Next.
- `"use server"` exporta só funções assíncronas. Sem `Promise.all` em cliente de transação. `await confirm()` SEMPRE antes de `startTransition`/`start`.
- shadcn é base-ui (`render={…}`, nunca `asChild`). Tamanho de toque é automático; não sobrescrever.
- Dev server só na porta 3001 (banco `senahub_remake_vscode`); nunca a 3000. Não rodar `next build` com `next dev` ativo. Nunca ler/imprimir `.env`.
- `tsc` do servidor: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`.
- Auditoria final obrigatória (Task 7): `docs/PROTOCOLO_AUDITORIA_FINAL.md`, nível 3.

## Review Focus

1. Agrupamento sem descendentes, ou com todas as descendentes já na disciplina nova: não pergunta, não erra, não grava a mais.
2. `parentId` em ciclo ou apontando para fora da lista: a propagação termina e não pega linha de outro ramo.
3. Texto colado ou parcial na célula de data (`5/11`, `2026-11-05`, letras) não é corrompido pela máscara.
4. Clicar no ícone do calendário não grava a célula por perda de foco e não deixa a edição presa.
5. Plano aprovado ou contagem desatualizada: a troca do agrupamento é recusada INTEIRA (nem o agrupamento nem as descendentes gravam).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/planejamento/disciplina-linha.ts` (+ `.test.ts`) | Modifica: `propagacaoDeDisciplina` (pura) |
| `src/modules/planejamento/disciplina-linha-service.ts` | Modifica: `propagarDisciplinaNoTx` (I/O dentro da transação) |
| `src/modules/planejamento/linha-service.ts` | Modifica: `EdicaoLinha.propagarDisciplina`, chamada na transação do `editarLinhaNoBanco` |
| `src/modules/planejamento/actions.ts` | Modifica: campo `propagarDisciplina` no schema de `salvarLinhaEap` |
| `src/components/planejamento/eap-linha-painel.tsx` | Modifica: confirmação com contagem antes de salvar |
| `scripts/smoke-disciplina-eap.ts` | Modifica: cenários da propagação |
| `src/modules/planejamento/datas-linha.ts` (+ `.test.ts`) | Modifica: `mascaraDataDigitando` (pura) |
| `src/components/planejamento/plano-gantt.tsx` | Modifica: `CelulaEditavel` (máscara + calendário), títulos das colunas, `Legenda` |
| `src/modules/planejamento/gantt-geometria.ts` (+ `.test.ts`) | Cria: geometria pura das barras |
| `src/components/planejamento/gantt-barra.tsx` | Modifica: usa a geometria; comentário de decisão |
| `docs/manual/**`, `docs/manual/novidades.md` | Modifica: manual dos três refinos |

---

### Task 1: Propagação da disciplina — regra pura (6a)

**Files:**
- Modify: `src/modules/planejamento/disciplina-linha.ts`
- Test: `src/modules/planejamento/disciplina-linha.test.ts`

**Interfaces:**
- Consumes: `NoDisciplina`, `faseQueAcompanha` (mesmo arquivo).
- Produces:
  ```ts
  export type MudancaDePropagacao = { tarefaId: string; atualId: string | null; etapaId: string | null };
  export function propagacaoDeDisciplina(
    nos: readonly NoDisciplina[],
    agrupamentoId: string,
    nova: { disciplinaId: string; etapaId: string | null }, // etapaId = a fase que o agrupamento terá DEPOIS de salvar
    fasesDaNova: ReadonlySet<string>,                        // etapaIds cadastrados na disciplina nova
  ): MudancaDePropagacao[];
  ```
  Devolve, na ordem de entrada, só as descendentes (qualquer nível, inclusive subagrupamentos e linhas sem disciplina) cuja `disciplinaId` ≠ `nova.disciplinaId`. `etapaId` de cada uma = `faseQueAcompanha([etapa própria, nova.etapaId], fasesDaNova)`.

- [ ] **Step 1: Escrever os testes que falham** em `disciplina-linha.test.ts`, bloco `describe("propagacaoDeDisciplina")`, árvore `F › G(hid, bs) › {M(hid), V(ele, ex), S(sem disciplina), SG(ele) › Y(ele)}` e `F › X(ele)`; `nova = { disciplinaId: "estr", etapaId: "bs" }`, `fasesDaNova = new Set(["bs"])`:
  - `"leva filhas, netas e subagrupamentos para a disciplina nova"`: ids devolvidos para `G` = `["M","V","S","SG","Y"]`.
  - `"não toca linhas fora do agrupamento"`: `X` não aparece.
  - `"ignora quem já está na disciplina nova"`: com `M` já em `estr`, `M` não aparece.
  - `"inclui a linha que estava sem disciplina"`: `S` vem com `atualId: null`.
  - `"fase: mantém a própria se a nova disciplina a tem; senão a do agrupamento; senão nenhuma"`: `V` (fase `ex`, nova só tem `bs`) → `etapaId: "bs"`; com `nova.etapaId = null` → `null`; linha com fase própria `bs` mantém `bs`.
  - `"agrupamento sem descendentes devolve lista vazia"`.
  - `"ciclo de parentId e pai fora da lista não travam"`: dois nós que apontam um para o outro e um com `parentId` inexistente; a chamada termina e não os devolve.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/modules/planejamento/disciplina-linha.test.ts` → FAIL (`propagacaoDeDisciplina` não existe).
- [ ] **Step 3: Implementar `propagacaoDeDisciplina`** em `disciplina-linha.ts`. Abordagem: índice `Map<parentId, ids>`, busca em largura a partir de `agrupamentoId` com conjunto de visitados (ciclo não repete), preservando a ordem de `nos` na saída.
- [ ] **Step 4: Rodar e ver passar** o mesmo comando → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/modules/planejamento/disciplina-linha.ts src/modules/planejamento/disciplina-linha.test.ts
  git commit -m "feat(planejamento): regra pura da propagação de disciplina do agrupamento"
  ```

---

### Task 2: Propagação — gravação no servidor e smoke (6a)

**Files:**
- Modify: `src/modules/planejamento/disciplina-linha-service.ts`, `src/modules/planejamento/linha-service.ts`, `src/modules/planejamento/actions.ts`
- Test: `scripts/smoke-disciplina-eap.ts`

**Interfaces:**
- Consumes: `propagacaoDeDisciplina` (Task 1); `MAX_LINHAS` (já em `disciplina-linha-service.ts`); `herdarResponsaveisNoProjeto`.
- Produces:
  ```ts
  // disciplina-linha-service.ts
  export async function propagarDisciplinaNoTx(
    tx: Prisma.TransactionClient,
    p: { projetoId: string; agrupamentoId: string; disciplinaId: string; etapaId: string | null; esperadas: number },
  ): Promise<string[]>; // ids gravados
  // linha-service.ts — EdicaoLinha ganha:
  propagarDisciplina?: { esperadas: number };
  // actions.ts — schema de salvarLinhaEap ganha:
  propagarDisciplina: z.object({ esperadas: z.number().int().min(0).max(500) }).optional()
  ```

- [ ] **Step 1: Escrever os cenários do smoke (falham antes de implementar)** em `scripts/smoke-disciplina-eap.ts`, nova seção "6a — propagação", chamando `salvarLinhaNoBanco` (de `linha-service.ts`) com `propagarDisciplina: { esperadas }`. Árvore: agrupamento `A` (Hidro) com `a1` (Hidro, com responsável), `a2` (Elétrica de propósito), `a3` (sem disciplina) e subagrupamento `A.sub` (Hidro) › `a4`. Verificações:
  - trocar `A` para outra disciplina com `esperadas` certa: `a1..a4` e `A.sub` passam a ela; `a1` mantém o responsável antigo; `a3` (sem ninguém) recebe o responsável da disciplina nova; fase de cada linha conforme a regra (mantém a própria se a nova a tem, senão a do agrupamento, senão nula).
  - `esperadas` errada → recusa com "A EAP mudou enquanto você confirmava; confira e tente de novo." e NADA mudou (nem `A`, nem as filhas).
  - sem `propagarDisciplina` → só `A` muda (comportamento antigo).
  - limpar a disciplina de `A` com `propagarDisciplina` presente → só `A` muda, filhas ficam.
  - plano aprovado (cronograma com baseline) → recusa com `MOTIVO_PLANO_TRAVADO` e nada mudou.
  - desfazer: `fotoDoPlano` antes e `voltarAFoto` depois restauram as disciplinas e fases de todas as linhas.
  - mais de 500 descendentes que mudam → recusa com mensagem que cita 500 (cria linhas em lote só nesse cenário).
- [ ] **Step 2: Rodar e ver falhar:** `npm run smoke:disciplina-eap` → FALHA nas novas verificações.
- [ ] **Step 3: Implementar `propagarDisciplinaNoTx`** em `disciplina-linha-service.ts`: relê as linhas do projeto dentro da transação, calcula com `propagacaoDeDisciplina` (fases da disciplina nova vêm de `disciplinaEtapa`), lança `ActionError("A EAP mudou enquanto você confirmava; confira e tente de novo.")` se `mudancas.length !== esperadas` e `ActionError` citando o teto se passar de `MAX_LINHAS`, e grava com `updateMany({ where: { id, disciplinaId: atualId }, data: { disciplinaId, etapaId } })` por linha (`count !== 1` → mesma mensagem de EAP mudada). Um `updateMany` por linha, em sequência (sem `Promise.all`). Usar `{ timeout: 30_000 }` na transação de quem chama, como o `alinharDisciplinasNoBanco` já faz.
- [ ] **Step 4: Ligar em `editarLinhaNoBanco`** (`linha-service.ts`): quando `i.propagarDisciplina && mudouDisciplina && i.disciplinaId && antes._count.filhas > 0`, chamar `propagarDisciplinaNoTx` dentro do `prisma.$transaction` existente, depois do `update` do agrupamento, com `etapaId` = a fase que o agrupamento ficou (`etapaId !== undefined ? etapaId : antes.etapaId`, com `null` quando a disciplina mudou e a fase foi limpa). Aumentar o `timeout` da transação para 30 s. Depois da transação, `herdarResponsaveisNoProjeto(prisma, projetoId, [i.id, ...idsPropagados])`. `mudaCampoDoPlano`/`exigirPlanoEditavel` já recusam com o plano aprovado antes de qualquer gravação; não mexer nisso.
- [ ] **Step 5: Aceitar o campo na action** (`actions.ts`, schema de `salvarLinhaEap`, que estende `editarSchema`): adicionar `propagarDisciplina` opcional como na interface. `salvarLinhaNoBanco` já repassa `...i` ao `editarLinhaNoBanco`; conferir que o campo chega.
- [ ] **Step 6: Rodar e ver passar:** `npm run smoke:disciplina-eap` → todas as verificações `ok`; `npx vitest run src/modules/planejamento` → PASS; `tsc` do servidor sem erros.
- [ ] **Step 7: Commit**
  ```bash
  git add src/modules/planejamento/disciplina-linha-service.ts src/modules/planejamento/linha-service.ts src/modules/planejamento/actions.ts scripts/smoke-disciplina-eap.ts
  git commit -m "feat(planejamento): trocar a disciplina do agrupamento leva as linhas de dentro"
  ```

---

### Task 3: Confirmação com contagem no painel da linha (6a)

**Files:**
- Modify: `src/components/planejamento/eap-linha-painel.tsx` (função `salvar`, ~linhas 216-278)

**Interfaces:**
- Consumes: `propagacaoDeDisciplina` (Task 1, módulo puro importável no cliente); `salvarLinhaEap({ …, propagarDisciplina })` (Task 2); `useConfirm()` já usado no arquivo (`excluir`).
- Produces: nenhum símbolo novo exportado.

- [ ] **Step 1: Calcular a lista no cliente.** Em `salvar`, quando `linha && ehResumo && form.disciplinaId` e `form.disciplinaId !== (linha.disciplinaId ?? "")`, montar os nós a partir de `tarefas` (`id`, `parentId`, `disciplinaId`, `etapaId`) e chamar `propagacaoDeDisciplina(nos, linha.id, { disciplinaId: form.disciplinaId, etapaId: form.etapaId || null }, new Set(fases.map((f) => f.etapaId)))` (`fases` já é a lista da disciplina escolhida).
- [ ] **Step 2: Perguntar ANTES do `start`.** Transformar `salvar` em função `async` que, havendo `n > 0` mudanças, faz `await confirm({ title: "Mudar a disciplina das linhas de dentro?", description: "<n> linha(s) de dentro vão para <nome da disciplina>. Responsáveis, ponto e horas já lançados ficam; a linha que ficar sem ninguém recebe o responsável da disciplina nova. Dá para voltar com Ctrl+Z.", confirmLabel: "Mudar disciplina" })` (singular/plural corretos) e só então chamar `start(...)`. Cancelar retorna sem gravar. Sem mudanças (`n === 0`), não pergunta.
- [ ] **Step 3: Enviar a contagem.** Passar `propagarDisciplina: n > 0 ? { esperadas: n } : undefined` ao `salvarLinhaEap`. O erro "A EAP mudou…" do servidor já aparece pelo `toast.error` existente. No sucesso com `n > 0`, o toast diz quantas linhas de dentro mudaram.
- [ ] **Step 4: Verificar:** `npx eslint src/components/planejamento/eap-linha-painel.tsx` sem avisos novos; `tsc` do servidor sem erros.
- [ ] **Step 5: Verificar em tela** (dev server na 3001; usuário de teste do worktree): agrupamento com filhas em outra disciplina → mudar a disciplina → o diálogo mostra a contagem certa → Cancelar não grava → Confirmar grava, as filhas mudam e Ctrl+Z na EAP desfaz tudo num passo; agrupamento sem filhas e troca para "sem disciplina" não perguntam. Registrar prints em `prints-auditoria/2026-10-29_lote6-refinos-eap/`.
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/planejamento/eap-linha-painel.tsx
  git commit -m "feat(planejamento): painel da linha confirma a troca de disciplina das linhas de dentro"
  ```

---

### Task 4: Máscara de data digitada — regra pura (6b)

**Files:**
- Modify: `src/modules/planejamento/datas-linha.ts`
- Test: `src/modules/planejamento/datas-linha.test.ts`

**Interfaces:**
- Produces: `export function mascaraDataDigitando(texto: string): string`. Regras: se `texto` tem qualquer caractere que não seja dígito ou `/`, devolve igual; se tem `/` fora das posições canônicas (índice 2 e 5), devolve igual (é colagem ou texto parcial como `5/11`); senão pega só os dígitos (máx. 8) e insere `/` antes do 3º e do 5º dígito.

- [ ] **Step 1: Escrever os testes que falham** (`describe("mascaraDataDigitando")`): `""`→`""`; `"0"`→`"0"`; `"05"`→`"05"`; `"051"`→`"05/1"`; `"05112"`→`"05/11/2"`; `"05112026"`→`"05/11/2026"`; `"051120261"`→`"05/11/2026"`; `"05/1"`→`"05/1"`; `"05/11/"`→`"05/11"`; `"5/11"`→`"5/11"` (barra fora da posição: não mexe); `"2026-11-05"`→`"2026-11-05"`; `"abc"`→`"abc"`; `"/"`→`"/"`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/modules/planejamento/datas-linha.test.ts` → FAIL.
- [ ] **Step 3: Implementar `mascaraDataDigitando`** em `datas-linha.ts` (função pura, sem dependências novas).
- [ ] **Step 4: Rodar e ver passar** o mesmo comando → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/modules/planejamento/datas-linha.ts src/modules/planejamento/datas-linha.test.ts
  git commit -m "feat(planejamento): máscara dd/mm/aaaa para a data digitada na grade"
  ```

---

### Task 5: Calendário e máscara na célula de data (6b)

**Files:**
- Modify: `src/components/planejamento/plano-gantt.tsx` (`CelulaEditavel` ~linha 1179, `envolver` ~441, colunas `inicio`/`termino` ~610-623)

**Interfaces:**
- Consumes: `mascaraDataDigitando` (Task 4); `lerDataDigitada` (já usado); ícone `CalendarDays` do `lucide-react`.
- Produces: `CelulaEditavel` ganha a prop opcional `data?: { iso: string | null }`. Presente = célula de data: aplica a máscara ao digitar e mostra o ícone de calendário. `envolver` passa `data={{ iso: l.t.inicioPrevisto }}` para `inicio` e `{ iso: l.t.fimPrevisto }` para `termino`.

- [ ] **Step 1: Máscara ao digitar.** No `onChange` do `<input>` da célula (hoje `onChange={aoDigitar}`), quando `data` está presente e o evento nativo é digitação (`inputType` começa com `insert` e não é `insertFromPaste`/`insertFromDrop`) com o cursor no fim do texto, trocar `e.currentTarget.value` por `mascaraDataDigitando(valor)`. Apagar e colar não passam pela máscara. Continuar chamando `aoDigitar()`.
- [ ] **Step 2: Ícone e seletor nativo.** Com `data` presente, no modo de edição renderizar o campo dentro de um `div relative` com um botão de ícone (`aria-label="Abrir calendário"`, `onMouseDown={(e) => e.preventDefault()}` para o campo de texto não perder o foco) e um `<input type="date" tabIndex={-1} aria-hidden>` invisível (`pointer-events-none absolute inset-0 opacity-0`, dentro do contêiner `relative`, NÃO `sr-only`) com `value={data.iso ?? ""}`. O clique do botão chama `showPicker()` desse input. Ao escolher o dia (`onChange` do input de data), chamar `confirmar(valorIso, "fica")` (o ISO já é aceito por `lerDataDigitada`).
- [ ] **Step 3: Foco.** Marcar uma ref `seletorAberto` ao abrir o calendário e ignorá-la no `onBlur` do campo de texto enquanto o seletor está aberto; limpar a ref ao escolher o dia, ao fechar o seletor sem escolher (`onBlur`/`cancel` do input de data) e no Esc. Resultado esperado: abrir e fechar o calendário sem escolher não grava nada e a célula continua em edição.
- [ ] **Step 4: Títulos.** Trocar os `title` das colunas Início e Término por textos que citem as três formas ("Digite, cole ou escolha no calendário. …" mantendo o resto da frase atual sobre o alfinete e a duração).
- [ ] **Step 5: Verificar:** `npx vitest run src/modules/planejamento/datas-linha.test.ts` PASS; `npx eslint src/components/planejamento/plano-gantt.tsx` sem avisos novos; `tsc` do servidor sem erros.
- [ ] **Step 6: Verificar em tela** (Chrome, porta 3001, 1366×768 com menu aberto e 390×844): nas colunas Início e Término, digitar `05112026` vira `05/11/2026`; colar `5/11`, `5/11/26` e `2026-11-05` funciona; o ícone abre o calendário com a data atual marcada; escolher o dia grava e as regras de término/duração e de alfinete seguem iguais; abrir e fechar o calendário não grava; agrupamento e marco continuam recusando; `document.documentElement.scrollWidth` = 390 no celular. Prints em `prints-auditoria/2026-10-29_lote6-refinos-eap/`.
- [ ] **Step 7: Commit**
  ```bash
  git add src/components/planejamento/plano-gantt.tsx
  git commit -m "feat(planejamento): datas da grade da EAP com máscara e calendário"
  ```

---

### Task 6: Barras do Gantt de controle com a mesma espessura (6c)

**Files:**
- Create: `src/modules/planejamento/gantt-geometria.ts`
- Test: `src/modules/planejamento/gantt-geometria.test.ts`
- Modify: `src/components/planejamento/gantt-barra.tsx` (bloco do controle, linhas ~100-124; comentário da decisão de 29/09), `src/components/planejamento/plano-gantt.tsx` (`Legenda`, ~linha 1292)

**Interfaces:**
- Produces (puro, sem importar de `components/`):
  ```ts
  export type ModoBarra = "planejamento" | "controle";
  export type GeometriaDaBarra = { execTop: number; execAltura: number; baseTop: number | null; baseAltura: number | null };
  export function geometriaDasBarras(modo: ModoBarra, rowH: number): GeometriaDaBarra;
  ```
  `planejamento`: `{ execTop: 7, execAltura: 14, baseTop: null, baseAltura: null }` (como hoje, para `rowH` 28). `controle`: duas barras de 9 px, 2 px entre elas, folga igual acima e abaixo — para `rowH` 28: `execTop` 4, `baseTop` 15, ambas `9`. A espessura do controle é a MESMA em toda linha, tenha ou não base (decisão minha: não alternar 9/14 px entre linhas).
- Consumes em `gantt-barra.tsx`: `ROW_H`, `ModoGantt`.

- [ ] **Step 1: Escrever os testes que falham:** `geometriaDasBarras("planejamento", 28)` → `{ execTop: 7, execAltura: 14, baseTop: null, baseAltura: null }`; `geometriaDasBarras("controle", 28)` → `{ execTop: 4, execAltura: 9, baseTop: 15, baseAltura: 9 }`; e que `baseTop + baseAltura` não passa de `rowH` e `execTop + execAltura + 2 === baseTop` no controle.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/modules/planejamento/gantt-geometria.test.ts` → FAIL.
- [ ] **Step 3: Implementar `geometriaDasBarras`** em `gantt-geometria.ts`.
- [ ] **Step 4: Aplicar em `BarraDaLinha`.** A barra de atividade usa `execTop`/`execAltura` da geometria do modo; a base (só `controle`, só linha com datas de base, nunca marco) usa `baseTop`/`baseAltura`, cinza cheio (`bg-muted-foreground`), `rounded-sm`, com `title` "Linha de base: dd/mm a dd/mm". O agrupamento no controle mantém a barra preta com as pontas, **encaixada na faixa da execução (y 4–13) sem invadir a faixa da base (y 15–24)** — ajustar altura da barra e das pontas para isso. Marco não muda. O modo `planejamento` fica idêntico ao de hoje. Trocar o comentário que registra a decisão de 29/09 ("fininha sob a barra grossa") por um que registre a decisão de 29/10/2026 (opção B) e que ela reverte aquela.
- [ ] **Step 5: Legenda.** Em `Legenda` (`plano-gantt.tsx`), o item da linha de base passa a ter o mesmo tamanho do item da tarefa, e o texto diz que base e execução têm a mesma espessura.
- [ ] **Step 6: Conferir o Cronograma geral.** `gantt-mini.tsx` também usa `BarraDaLinha`: confirmar o resultado nessa tela e que o que não é modo controle ficou igual.
- [ ] **Step 7: Verificar:** `npx vitest run src/modules/planejamento` PASS; `npx eslint` nos dois arquivos sem avisos novos; `tsc` do servidor sem erros.
- [ ] **Step 8: Verificar em tela** (Chrome, 3001): projeto com cronograma aprovado, modo Controle — conferir linhas em dia, atrasada, adiantada, crítica, concluída, agrupamento, marco e uma linha criada depois da aprovação (sem base: mesma espessura 9 px, faixa da base vazia); modo Planejamento igual ao anterior; o título da base mostra as datas; 1366×768 com menu aberto sem sobreposição do cabeçalho; 390×844 sem rolagem horizontal nova. Prints em `prints-auditoria/2026-10-29_lote6-refinos-eap/`.
- [ ] **Step 9: Commit**
  ```bash
  git add src/modules/planejamento/gantt-geometria.ts src/modules/planejamento/gantt-geometria.test.ts src/components/planejamento/gantt-barra.tsx src/components/planejamento/plano-gantt.tsx
  git commit -m "feat(planejamento): base e execução com a mesma espessura no Gantt de controle"
  ```

---

### Task 7: Manual e auditoria final

**Files:**
- Modify: página do manual que descreve a EAP/painel da linha/Gantt (localizar com `grep -rl "Gantt de controle\|alfinete" docs/manual`), `docs/manual/novidades.md`, `docs/manual/search-index.json` se a entrada da página precisar de resumo novo.
- Create (git-ignorado): `prints-auditoria/2026-10-29_lote6-refinos-eap/LEIAME.md`.

- [ ] **Step 1: Atualizar o manual** em linguagem de usuário: (a) trocar a disciplina de um agrupamento leva as linhas de dentro, com confirmação, Ctrl+Z e o que fica (pessoas, ponto, horas); tirar a disciplina não leva; (b) datas da grade: digitar com máscara, colar ou calendário; (c) Gantt de controle: base e execução na mesma espessura. Entrada nova em `novidades.md`. **`novidades.md` e `projetos.md` têm hunks de outra frente: stage só os seus** (`git diff -U0` + `git apply --cached --unidiff-zero`).
- [ ] **Step 2: Rodar o protocolo** `docs/PROTOCOLO_AUDITORIA_FINAL.md` (reler, é mutável) no nível 3: `npm test`, `npm run lint`, `tsc` do servidor, `npm run smoke:disciplina-eap`, `npm run smoke:salvar-linha-eap`, `npm run smoke:eap-datas`, `npm run smoke:desfazer-eap`, `npm run smoke:eap-lote`. Reviewers por área (subagentes de leitura): `action-guardian` na action/serviço, `client-boundary-auditor` + `a11y-auditor` + `ui-state-linter` na UI, `design-system-guardian` no Gantt. Corrigir o que estiver no escopo e rodar de novo.
- [ ] **Step 3: Evidência em tela:** prints das Tasks 3, 5 e 6 reunidos em `prints-auditoria/2026-10-29_lote6-refinos-eap/` com `LEIAME.md` (o que cada print prova e como reproduzir).
- [ ] **Step 4: Relatório final em pt-BR** nas seções do protocolo, com as decisões minhas do desenho (limpar disciplina não propaga; contagem revalidada; espessura constante no controle).
- [ ] **Step 5: Commit**
  ```bash
  git add <páginas do manual alteradas> docs/manual/novidades.md
  git commit -m "docs(manual): disciplina do agrupamento, datas com calendário e barras do Gantt de controle"
  ```
  Conferir `git show --stat HEAD`: só arquivos desta tarefa.
