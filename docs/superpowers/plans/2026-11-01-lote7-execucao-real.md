# Lote 7 — Execução real no Gantt de controle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (7.1) "Atualizar tarefa" passa a registrar o % concluído sem concluir a linha, por quem tem `cronograma:executado`; (7.2) o Gantt de controle ganha Iníc. real, Térm. real, Dur. real, Dur. rest., Trab. real e Custo real; (7.3) tarefa de terceiro ganha um valor digitado (`custoRealTerceiro`) que é o Custo real dela; (7.4) um modo "Variação" ao lado de Gantt/Controle, só com as colunas de comparação com a base.

**Architecture:** 7.1/7.3 estendem o caminho que já existe (`aplicarExecucao` puro → `registrarExecucaoNaLinha` → action `registrarExecucao` → `ExecucaoDialog`), com uma coluna nova em `EapTarefa`. 7.2 calcula tudo no servidor (`eapDoProjeto`), com regras puras num arquivo novo `execucao-real.ts`, e só desenha em `plano-gantt.tsx`. 7.4 é uma lista de colunas a mais em `plano-gantt.tsx` (prop `colunas`) e um botão a mais em `eap-workspace.tsx`; as barras e o tipo `ModoGantt` não mudam.

**Tech Stack:** Next.js 15 / React 19, Server Actions via `defineAction`, Prisma 7 (PostgreSQL 17), vitest (env node), tsx para o smoke.

**Spec:** [2026-10-26-lote7-execucao-real-design.md](../specs/2026-10-26-lote7-execucao-real-design.md)

## Global Constraints

- UI, mensagens e commits em pt-BR; este módulo usa nomes em português — seguir.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage só os arquivos da tarefa (nunca `git add -A`/`.`); conferir com `git show --stat HEAD`. Sem push, merge nem deploy (o dono faz depois de TODOS os lotes).
- Na raiz há arquivos não rastreados com nome quebrado (`C\357\200\272Users…claude-notify-signals…`): não commitar nem apagar.
- Arquivos puros (`execucao.ts`, o novo `execucao-real.ts`, `visao-sem-datas.ts`) não importam Prisma, `server-only` nem Next. `lib/calendario-trabalho.ts` é puro e pode ser importado.
- Valor em R$ só sai do servidor para quem `podeVerFinanceiro` (o `verCusto` que a página já passa a `eapDoProjeto`). Esconder na tela não basta.
- Data real nunca no futuro; "hoje" no servidor = `paraDia(inicioDoDiaUtc())` (mesma da action e da página).
- `"use server"` exporta só funções assíncronas. Sem `Promise.all` em cliente de transação. `await confirm()` SEMPRE antes de `startTransition`/`start`.
- shadcn é base-ui (`render={…}`, nunca `asChild`). Dinheiro na tela com `InputMoeda` (`components/ui/input-moeda.tsx`).
- Dev server só na porta 3001 (banco `senahub_remake_vscode`); nunca a 3000. Não rodar `next build` com `next dev` ativo. Nunca ler/imprimir `.env`. Depois da migração e do `db:generate`, reiniciar o dev server (o `next dev` segura o client Prisma antigo).
- `tsc` do servidor: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.server.json --noEmit`.
- Auditoria final obrigatória (Task 8): `docs/PROTOCOLO_AUDITORIA_FINAL.md`, nível 3.

## Review Focus

1. Linha concluída e reaberta (fica com 100% guardado): salvar o diálogo sem tocar no % não pode ser recusado por "Para marcar 100%…" — o diálogo só envia `progresso` quando a pessoa o mudou. Teste na Task 1 (`progresso` ausente com 100 guardado passa) e verificação em tela na Task 5.
2. Quem não vê financeiro salva o diálogo de uma linha de terceiro: o valor já gravado continua lá (campo ausente = não muda) e, se o campo vier mesmo assim, o servidor recusa. Smoke na Task 2.
3. Pessoa que apontou horas sem custo/hora cadastrado: o Custo real mostra o que sabe e marca "parcial" — nunca some nem zera a linha inteira. Teste na Task 3, smoke na Task 4.
4. Linha não concluída com término previsto já passado: Dur. rest. dá 0 e a célula sai em vermelho (não pode parecer "pronta"). Teste na Task 3, tela na Task 6.
5. Linha criada depois da aprovação (sem base) e projeto sem linha de base: no Variação as colunas de base e de variação mostram "—"; sem base nenhuma, o botão Variação nem aparece. Teste na Task 3 (`diasDeVariacao` com nulo), tela na Task 7.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/planejamento/execucao.ts` (+ `.test.ts`) | Modifica: `EntradaExecucao.progresso` e as regras do % em `aplicarExecucao` |
| `prisma/schema.prisma` + `prisma/migrations/20261101120000_eap_custo_real_terceiro/migration.sql` | Cria a coluna `EapTarefa.custoRealTerceiro` |
| `src/modules/planejamento/execucao-service.ts` | Modifica: `registrarExecucaoNaLinha` grava % e valor de terceiro |
| `src/modules/planejamento/actions.ts` | Modifica: schema e gate de `registrarExecucao` |
| `scripts/smoke-progresso-historico.ts` | Modifica: cenários do % e do valor de terceiro pelo serviço |
| `src/components/planejamento/execucao-dialog.tsx`, `src/components/planejamento/eap-workspace.tsx`, `src/modules/planejamento/acoes-eap.ts` | Modifica: campos novos no diálogo, prop `podeVerCusto`, rótulo do menu |
| `src/modules/planejamento/execucao-real.ts` (+ `.test.ts`) | Cria: regras puras de Dur. real/rest., Custo real, soma na árvore e variação em dias |
| `src/modules/planejamento/queries.ts`, `visao-sem-datas.ts` (+ `.test.ts`), `modelos/gantt-modelo.ts` | Modifica: campos novos do DTO |
| `scripts/smoke-execucao-real.ts`, `package.json`, `CLAUDE.md` | Cria/registra o smoke do realizado por linha |
| `src/components/planejamento/plano-gantt.tsx` | Modifica: colunas do Controle e do Variação |
| `docs/manual/projetos/planejamento.md`, `docs/manual/novidades.md` | Modifica: manual |

---

### Task 1: % na execução — regra pura (7.1)

**Files:**
- Modify: `src/modules/planejamento/execucao.ts`
- Test: `src/modules/planejamento/execucao.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EntradaExecucao = {
    inicioReal: Dia | null;
    fimReal: Dia | null;
    /** Ausente = o % não muda. Só vale sem término real; com término real é sempre 100. */
    progresso?: number;
  };
  ```
  `aplicarExecucao(linha, entrada, hoje)` mantém a assinatura e o tipo de retorno.
- Regras (na ordem, depois das recusas que já existem):
  - Marco com `progresso !== undefined` → `falha("Marco não tem percentual: informe a data em que aconteceu.")`.
  - `progresso` não inteiro, < 0 ou > 100 → `falha("Percentual inválido.")`.
  - Término real presente → `progresso` ignorado (100, como hoje).
  - Sem término real e `progresso === 100` → `falha("Para marcar 100%, informe o término real.")`.
  - Sem término real e `progresso` em 0–99 → o resultado leva esse `progresso`. O **status continua decidido só pelas datas reais** (um % > 0 sem início real não vira `and` — o verificador acusa "em andamento sem início real").

- [ ] **Step 1: Escrever os testes que falham** em `execucao.test.ts`, bloco novo `describe("aplicarExecucao — percentual")`, com a linha `atv` em `nin`, 0%, `hoje = "2026-11-01"`:
  - `"% parcial sem datas grava o % e não muda o status"`: `{ inicioReal: null, fimReal: null, progresso: 40 }` → `ok`, `progresso: 40`, `status: "nin"`.
  - `"% parcial com início real deixa em andamento"`: `{ inicioReal: "2026-10-20", fimReal: null, progresso: 40 }` → `progresso: 40`, `status: "and"`.
  - `"término real ignora o % digitado"`: `{ inicioReal: "2026-10-20", fimReal: "2026-10-30", progresso: 40 }` → `progresso: 100`, `status: "con"`.
  - `"100 sem término real é recusado"`: `progresso: 100` sem término → `ok: false`, `motivo: "Para marcar 100%, informe o término real."`.
  - `"percentual fora de 0–100 ou fracionado é recusado"`: `-1`, `101`, `12.5` → `motivo: "Percentual inválido."`.
  - `"sem progresso o % fica como estava (reabrir mantém 100)"`: linha `con` com 100%, entrada `{ inicioReal: "2026-10-20", fimReal: null }` → `ok`, `progresso: 100`, `status: "and"`.
  - `"marco não aceita percentual"`: linha `mrc`, `{ inicioReal: null, fimReal: null, progresso: 50 }` → `motivo: "Marco não tem percentual: informe a data em que aconteceu."`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/modules/planejamento/execucao.test.ts` → FAIL nos testes novos.
- [ ] **Step 3: Implementar** as regras acima em `aplicarExecucao` e atualizar o comentário do topo da função (o % agora tem um caminho próprio).
- [ ] **Step 4: Rodar e ver passar** o mesmo comando → PASS (os testes antigos também).
- [ ] **Step 5: Commit**
  ```bash
  git add src/modules/planejamento/execucao.ts src/modules/planejamento/execucao.test.ts
  git commit -m "feat(planejamento): percentual na execução da linha sem concluir"
  ```

---

### Task 2: Execução no servidor — %, valor de terceiro e migração (7.1, 7.3)

**Files:**
- Modify: `prisma/schema.prisma` (model `EapTarefa`, perto de `progresso`)
- Create: `prisma/migrations/20261101120000_eap_custo_real_terceiro/migration.sql`
- Modify: `src/modules/planejamento/execucao-service.ts`, `src/modules/planejamento/actions.ts` (`registrarExecucao`, ~linha 1294)
- Test: `scripts/smoke-progresso-historico.ts`

**Interfaces:**
- Consumes: `aplicarExecucao` com `progresso` (Task 1); `ehEtapaDeTerceiro` (`recursos.ts`); `podeVerFinanceiro` (`lib/permissions.ts`).
- Produces:
  ```prisma
  /// Lote 7: o que a tarefa de TERCEIRO custou (recurso "Externo"), digitado em "Atualizar tarefa".
  /// É o Custo real dessa linha; nulo = nada digitado. Linha interna ignora este campo.
  custoRealTerceiro Decimal? @db.Decimal(12, 2)
  ```
  ```ts
  // execucao-service.ts — parâmetros novos de registrarExecucaoNaLinha (retorno inalterado):
  progresso?: number;                 // ausente = não muda
  custoRealTerceiro?: number | null;  // ausente = não muda; null = apaga
  verCusto?: boolean;                 // quem chama diz se a pessoa vê financeiro; padrão false
  // actions.ts — schema de registrarExecucao ganha:
  progresso: z.number().optional(),
  custoRealTerceiro: z.number().min(0).max(9_999_999_999).nullable().optional(),
  ```
- Regras do serviço: `custoRealTerceiro !== undefined` com `verCusto` falso → `ActionError("Sem permissão para informar valores.")`; com a linha fora de terceiro (atribuições sem papel `ext`) → `ActionError("Valor de terceiro só vale em tarefa com o recurso Externo.")`. As duas checagens antes de qualquer gravação. O valor entra no MESMO `tx.eapTarefa.update` da transação existente; o `registrarProgresso` já existente recebe o % resultante (`origem: "execucao"`).

- [ ] **Step 1: Escrever a migração e o schema.** `migration.sql`: `ALTER TABLE "eap_tarefa" ADD COLUMN "custoRealTerceiro" DECIMAL(12,2);`. Campo no schema como acima. Aplicar no banco de dev com `npx prisma migrate deploy` (NÃO `migrate dev`: o histórico tem drift antigo e ele pediria reset) e depois `npm run db:generate`. Esperado: "1 migration applied" e client gerado.
- [ ] **Step 2: Escrever os cenários do smoke (falham antes de implementar)** em `scripts/smoke-progresso-historico.ts`, seção nova "Lote 7", chamando `registrarExecucaoNaLinha` direto:
  - linha interna, `{ inicioReal: null, fimReal: null, progresso: 35, hoje }` → linha com 35%, status `nin`, e um `EapProgressoRegistro` novo com `progresso: 35`, `origem: "execucao"`.
  - `progresso: 100` sem término → erro "Para marcar 100%, informe o término real." e nada gravado.
  - linha de terceiro (criar `EapAtribuicao` com `papel: "ext"`, `userId: null`, `horasPrevistas: 0`): `custoRealTerceiro: 1250.5, verCusto: true` → gravado `1250.50`.
  - a mesma linha, chamada sem `custoRealTerceiro` → o valor continua `1250.50`.
  - `custoRealTerceiro: 10, verCusto: false` → erro "Sem permissão para informar valores." e valor intacto.
  - `custoRealTerceiro: null, verCusto: true` → valor apagado.
  - linha interna com `custoRealTerceiro: 10, verCusto: true` → erro "Valor de terceiro só vale em tarefa com o recurso Externo.".
- [ ] **Step 3: Rodar e ver falhar:** `npm run smoke:progresso-historico` → FALHA nas verificações novas.
- [ ] **Step 4: Implementar** os parâmetros e as regras em `registrarExecucaoNaLinha` (incluir `atribuicoes: { select: { papel: true } }` e `custoRealTerceiro` no `findUnique`; passar `progresso` para `aplicarExecucao`).
- [ ] **Step 5: Ligar na action:** schema como na interface; `capturarAntes` passa a selecionar também `custoRealTerceiro`; o handler passa `progresso`, `custoRealTerceiro` e `verCusto: await podeVerFinanceiro(user)` ao serviço. A permissão da action continua `cronograma:executado`.
- [ ] **Step 6: Rodar e ver passar:** `npm run smoke:progresso-historico`, `npm run smoke:pagamento-fase`, `npm run smoke:eap-integracao` → todas `ok` (os dois últimos chamam o serviço sem os campos novos e não podem mudar); `npx vitest run src/modules/planejamento` PASS; `tsc` do servidor sem erros.
- [ ] **Step 7: Commit**
  ```bash
  git add prisma/schema.prisma prisma/migrations/20261101120000_eap_custo_real_terceiro/migration.sql src/modules/planejamento/execucao-service.ts src/modules/planejamento/actions.ts scripts/smoke-progresso-historico.ts
  git commit -m "feat(planejamento): execução grava percentual e valor da tarefa de terceiro"
  ```

---

### Task 3: Realizado por linha — regras puras (7.2, 7.4)

**Files:**
- Create: `src/modules/planejamento/execucao-real.ts`
- Test: `src/modules/planejamento/execucao-real.test.ts`

**Interfaces:**
- Consumes: `diasUteisEntre`, `type Calendario`, `type Dia` (`lib/calendario-trabalho.ts`); `type StatusEap`.
- Produces:
  ```ts
  /** Um número realizado e se ele está incompleto. `valor: null` = não se mede (mostra "—"). */
  export type ValorReal = { valor: number | null; parcial: boolean };

  export function duracaoReal(p: { marco: boolean; inicioReal: Dia | null; fimReal: Dia | null; hoje: Dia }, cal: Calendario): number | null;
  export function duracaoRestante(p: { marco: boolean; status: StatusEap; progresso: number; fimPrevisto: Dia; hoje: Dia }, cal: Calendario): number | null;
  export function custoRealDaFolha(p: {
    deTerceiro: boolean;
    custoRealTerceiro: number | null;
    minutosPorPessoa: ReadonlyMap<string, number>;
    custoHora: ReadonlyMap<string, number>;
  }): ValorReal;
  export function trabalhoRealDaFolha(p: { deTerceiro: boolean; minutos: number }): ValorReal;
  export function somaNaArvore(linhas: readonly { id: string; parentId: string | null }[], folhas: ReadonlyMap<string, ValorReal>): Map<string, ValorReal>;
  /** Dias corridos de `base` até `atual` (positivo = depois da base); nulo se faltar um dos dois. */
  export function diasDeVariacao(base: string | null, atual: string | null): number | null;
  ```
- Regras:
  - `duracaoReal`: marco ou sem início real → `null`; senão `diasUteisEntre(inicioReal, fimReal ?? hoje, cal)`.
  - `duracaoRestante`: marco ou status `sus`/`can`/`arq` → `null`; `status === "con"` ou `progresso >= 100` → `0`; senão `diasUteisEntre(hoje, fimPrevisto, cal)` (0 quando o término previsto já passou).
  - `custoRealDaFolha`: terceiro → `{ valor: custoRealTerceiro, parcial: false }`; interna → soma, em centavos, de `minutos/60 × taxa` de quem tem taxa; quem apontou minutos > 0 sem taxa deixa `parcial: true` e não soma; sem apontamento → `{ valor: 0, parcial: false }`.
  - `trabalhoRealDaFolha`: terceiro → `{ valor: null, parcial: false }`; interna → horas com 1 casa (`Math.round(minutos / 6) / 10`).
  - `somaNaArvore`: folha = o mapa; agrupamento = soma (em centésimos) dos filhos com valor; `null` se nenhum filho tem valor; `parcial` se algum filho é parcial. Recursivo por `parentId`, com memória e proteção contra ciclo (como `custosComResumo` em `custo.ts`).
  - `diasDeVariacao`: mesma conta de `diasEntre` (`gantt-escala.ts`), que a coluna Desvio já usa.

- [ ] **Step 1: Escrever os testes que falham** (calendário seg–sex sem feriado; `hoje = "2026-11-04"` quarta):
  - `duracaoReal`: início `2026-11-02` sem término → `3`; início `2026-11-02` e término `2026-11-03` → `2`; sem início → `null`; marco → `null`.
  - `duracaoRestante`: término previsto `2026-11-06` → `3`; concluída → `0`; progresso 100 com status `and` → `0`; término previsto `2026-11-03` (passou) → `0`; marco → `null`; cancelada → `null`.
  - `custoRealDaFolha`: interna com `u1` 90 min a R$ 100/h e `u2` 30 min a R$ 50/h → `{ valor: 175, parcial: false }`; com `u3` 60 min sem taxa → `{ valor: 175, parcial: true }`; sem apontamento → `{ valor: 0, parcial: false }`; terceiro com 1250.5 → `{ valor: 1250.5, parcial: false }`; terceiro sem valor → `{ valor: null, parcial: false }`; terceiro ignora minutos e taxas; interna com `custoRealTerceiro: 999` (sobra de quando era de terceiro) ignora o valor e soma só as horas.
  - `trabalhoRealDaFolha`: 125 min → `2.1`; terceiro → `null`.
  - `somaNaArvore`: `R › {A, B, S › {C}}` com A=10, B=null, C=2.5 (parcial) → `S = { 2.5, parcial }`, `R = { 12.5, parcial }`; agrupamento só com filhos nulos → `null`; ciclo de `parentId` termina.
  - `diasDeVariacao`: `("2026-11-02", "2026-11-05")` → `3`; `("2026-11-05", "2026-11-02")` → `-3`; base nula → `null`; atual vazio (`""`) → `null`.
- [ ] **Step 2: Rodar e ver falhar:** `npx vitest run src/modules/planejamento/execucao-real.test.ts` → FAIL (arquivo não existe).
- [ ] **Step 3: Implementar** `execucao-real.ts` (puro; comentário de topo curto citando o Lote 7 e a diferença do previsto: o realizado mostra o que sabe e marca "parcial").
- [ ] **Step 4: Rodar e ver passar** o mesmo comando → PASS; e `npx vitest run src/modules/planejamento` PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/modules/planejamento/execucao-real.ts src/modules/planejamento/execucao-real.test.ts
  git commit -m "feat(planejamento): regras puras do realizado por linha da EAP"
  ```

---

### Task 4: Realizado no DTO da EAP + smoke (7.2, 7.3)

**Files:**
- Modify: `src/modules/planejamento/queries.ts` (`ApoioDaLinha`, `carregarApoioDasLinhas`, `mapearTarefaDTO`, `eapDoProjeto`)
- Modify: `src/modules/planejamento/visao-sem-datas.ts` (+ `visao-sem-datas.test.ts`), `src/modules/planejamento/modelos/gantt-modelo.ts`
- Create: `scripts/smoke-execucao-real.ts`; Modify: `package.json` (script `smoke:execucao-real`), `CLAUDE.md` (linha do smoke na lista de comandos)

**Interfaces:**
- Consumes: tudo da Task 3; `plano.calendario` (`PlanoDoProjeto`); `custoRealTerceiro` (Task 2).
- Produces — campos novos em `EapTarefaDTO` (via `mapearTarefaDTO`):
  ```ts
  duracaoReal: number | null;        // dias úteis
  duracaoRestante: number | null;    // dias úteis
  trabalhoReal: number | null;       // horas; agrupamento = soma dos filhos; terceiro = null
  custoReal: number | null;          // null para quem não vê financeiro
  custoRealParcial: boolean;
  custoRealTerceiro: number | null;  // o digitado; null para quem não vê financeiro
  ```
  `horasApontadas` fica como está (o painel da linha o usa).
- Notas:
  - `ApoioDaLinha` ganha `apontadoPorPessoa: Map<linhaId, Map<userId, minutos>>`; a leitura de sessões passa a selecionar `userId`. `SEM_APOIO` ganha o mapa vazio.
  - Em `eapDoProjeto`: `hoje = paraDia(inicioDoDiaUtc())`; Dur. real/rest. com `plano.calendario` (sem plano → `null` nas duas); Trab. real e Custo real por folha com as funções da Task 3 e `somaNaArvore` para os agrupamentos. Para o Custo real, só quando `verCusto`: carregar `Recurso.custoHora` de quem APONTOU (não só de quem está atribuído), numa leitura em lote.
  - `mapearTarefaDTO` recebe os valores prontos por um parâmetro opcional novo; sem ele (caso de `cronogramaProjetosAtivos`) todos saem `null`/`false`.
  - `semDatasDaLinha` zera `duracaoReal` e `duracaoRestante` (são datas reais ditas de outro jeito); o teste dela cobre os dois.
  - `gantt-modelo.ts` preenche os seis campos com `null`/`false`.

- [ ] **Step 1: Teste de `semDatasDaLinha`** (`visao-sem-datas.test.ts`): `"tira a duração real e a restante"` → `duracaoReal` e `duracaoRestante` nulos. Rodar → FAIL.
- [ ] **Step 2: Escrever o smoke (falha antes de implementar)** `scripts/smoke-execucao-real.ts`, no molde de `smoke-progresso-historico.ts` (cria cliente/projeto com tag, limpa no `finally`): agrupamento `R` com a interna `A` (card `Tarefa` com `eapTarefaId = A`, sessões fechadas de 90 min de `u1` com `Recurso.custoHora` 100 e de 60 min de `u2` sem custo/hora) e a de terceiro `T` (atribuição `ext`, `custoRealTerceiro` 500). Chamar `eapDoProjeto(projetoId, { verCusto: true, verDatas: true })` e conferir: `A.trabalhoReal = 2.5`, `A.custoReal = 150`, `A.custoRealParcial = true`; `T.trabalhoReal = null`, `T.custoReal = 500`, `T.custoRealTerceiro = 500`; `R.trabalhoReal = 2.5`, `R.custoReal = 650`, `R.custoRealParcial = true`; `A` com início real 7 dias corridos antes de hoje e sem término → `duracaoReal` igual a `diasUteisEntre(inícioReal, hoje, calendário do plano)` e maior que 0 (não fixar o número: o calendário do banco tem feriados). Com `verCusto: false` → `custoReal` e `custoRealTerceiro` nulos em todas. Com `verDatas: false` → `duracaoReal`/`duracaoRestante` nulos. Registrar `"smoke:execucao-real": "tsx --tsconfig tsconfig.server.json scripts/smoke-execucao-real.ts"` no `package.json`. Rodar `npm run smoke:execucao-real` → FALHA.
- [ ] **Step 3: Implementar** os campos em `queries.ts`, `visao-sem-datas.ts` e `gantt-modelo.ts` conforme as notas.
- [ ] **Step 4: Rodar e ver passar:** `npm run smoke:execucao-real` → todas `ok`; `npx vitest run src/modules/planejamento` PASS; `tsc` do servidor sem erros.
- [ ] **Step 5: CLAUDE.md:** na lista de comandos, logo depois da linha de `smoke:eap-integracao`, a linha `npm run smoke:execucao-real   # realizado por linha da EAP: Trab./Custo real (parcial sem custo/hora, terceiro digitado, soma no agrupamento), Dur. real/rest., quem não vê financeiro/datas`.
- [ ] **Step 6: Commit**
  ```bash
  git add src/modules/planejamento/queries.ts src/modules/planejamento/visao-sem-datas.ts src/modules/planejamento/visao-sem-datas.test.ts src/modules/planejamento/modelos/gantt-modelo.ts scripts/smoke-execucao-real.ts package.json CLAUDE.md
  git commit -m "feat(planejamento): realizado por linha no DTO da EAP"
  ```

---

### Task 5: Diálogo "Atualizar tarefa" com % e valor de terceiro (7.1, 7.3)

**Files:**
- Modify: `src/components/planejamento/execucao-dialog.tsx`, `src/components/planejamento/eap-workspace.tsx` (render do diálogo ~linha 985; botão da coluna Ações ~linha 961), `src/modules/planejamento/acoes-eap.ts` (rótulo de `ACAO_ATUALIZAR`)

**Interfaces:**
- Consumes: `registrarExecucao({ id, inicioReal, fimReal, progresso?, custoRealTerceiro? })` (Task 2); `EapTarefaDTO.custoRealTerceiro: number | null` (Task 4) e `deTerceiro` (já existe); `InputMoeda`.
- Produces: `ExecucaoDialog` ganha a prop `podeVerCusto: boolean`; `eap-workspace.tsx` passa `podeVerCusto={custoTotal != null}`.

- [ ] **Step 1: Campo de %** (só em linha que não é marco): `Input` numérico 0–100, rótulo "% concluído", começa com `linha.progresso`. Com "Término real" preenchido, o campo fica desabilitado mostrando 100 e a dica "O término real conclui a tarefa (100%).". `gravar` envia `progresso` **só quando o valor digitado difere de `linha.progresso`** e não há término real; senão manda ausente. "Reabrir" nunca envia `progresso`.
- [ ] **Step 2: Valor de terceiro** (só com `linha.deTerceiro && podeVerCusto`): `InputMoeda` rotulado "Quanto custou (terceiro)", começa com `linha.custoRealTerceiro`, dica "Entra como Custo real desta tarefa.". Envia `custoRealTerceiro` só quando mudou (`null` = apagou); senão ausente. Sem a permissão o campo não aparece e nada é enviado.
- [ ] **Step 3: Textos.** Atualizar a dica do rodapé (datas reais concluem; o % registra avanço sem concluir). Rótulo do menu (`acoes-eap.ts`) e do botão da coluna Ações (`aria-label`/`title`) passam a "Atualizar tarefa (datas reais e %)"; no marco o `title` continua "Concluir o marco (data real)".
- [ ] **Step 4: Verificar:** `npx vitest run src/modules/planejamento/acoes-eap.test.ts` PASS; `npx eslint` nos três arquivos sem avisos novos (sem `--quiet`); `tsc` do servidor sem erros.
- [ ] **Step 5: Verificar em tela** (Chrome, 3001, usuário de teste do worktree; um perfil SÓ com `cronograma:executado` e outro com financeiro): informar 40% numa linha sem datas → a grade mostra 40% e o status não muda; preencher término real → o % trava em 100; reabrir uma linha concluída e salvar sem mexer no % → não dá erro; linha de terceiro com financeiro → campo de valor aparece e grava; sem financeiro → campo some e salvar não apaga o valor; 390×844 sem rolagem horizontal no diálogo. Prints em `prints-auditoria/2026-11-01_lote7-execucao-real/`.
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/planejamento/execucao-dialog.tsx src/components/planejamento/eap-workspace.tsx src/modules/planejamento/acoes-eap.ts
  git commit -m "feat(planejamento): Atualizar tarefa informa percentual e valor do terceiro"
  ```

---

### Task 6: Colunas de execução no Gantt de controle (7.2)

**Files:**
- Modify: `src/components/planejamento/plano-gantt.tsx` (definição das colunas ~linhas 600-790; `diasDeDesvio` ~linha 176)

**Interfaces:**
- Consumes: campos novos do DTO (Task 4); `diasDeVariacao` (Task 3).
- Produces: colunas com ids `inicioReal`, `fimReal`, `duracaoReal`, `duracaoRestante`, `trabalhoReal`, `custoReal` (as larguras escolhidas pelo usuário são guardadas por id).

- [ ] **Step 1: Colunas novas** (todas só leitura, "—" quando nulo, `font-mono text-xs` como as vizinhas): "Iníc. real" e "Térm. real" (`dataCurta`), "Dur. real" e "Dur. rest." (`3d`, alinhadas à direita; Dur. rest. em `text-destructive` quando é 0 e a linha não está concluída — `status !== "con"` e `progresso < 100`), "Trab. real" (`2,5 h`, pt-BR, `secundaria`), "Custo real" (`brl`, `secundaria`, com o sufixo discreto "parcial" em `text-warning` e `title` "Alguém apontou horas nesta linha sem custo/hora cadastrado em Recursos" quando `custoRealParcial`).
- [ ] **Step 2: Ordem do Controle:** `codigo, nome, progresso, inicioReal, fimReal, duracaoReal, duracaoRestante, trabalhoReal, custoReal (só com mostrarCusto), inicio, termino, inicioBase, terminoBase, desvio`. Planejamento e visão sem datas não mudam. `diasDeDesvio` passa a ser `diasDeVariacao(t.fimBaseline, t.fimPrevisto)`.
- [ ] **Step 3: Verificar:** `npx eslint src/components/planejamento/plano-gantt.tsx` sem avisos novos; `tsc` do servidor sem erros.
- [ ] **Step 4: Verificar em tela** (Chrome, 3001, projeto com cronograma aprovado e apontamento; `npm run ensaio:eap` dá um): modo Controle com as colunas na ordem, valores batendo com o smoke, linha atrasada com Dur. rest. 0 em vermelho, terceiro com "—" no Trab. real e o valor digitado no Custo real, "parcial" com a dica; sem financeiro a coluna Custo real some; 1366×768 com menu aberto sem sobrepor o cabeçalho (a grade rola na horizontal dentro dela); 390×844 `scrollWidth` = 390. Prints em `prints-auditoria/2026-11-01_lote7-execucao-real/`.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/planejamento/plano-gantt.tsx
  git commit -m "feat(planejamento): colunas de execução real no Gantt de controle"
  ```

---

### Task 7: Modo Variação (7.4)

**Files:**
- Modify: `src/components/planejamento/plano-gantt.tsx` (props, `camposDaVisao` ~linha 318, montagem das colunas ~linha 783), `src/components/planejamento/eap-workspace.tsx` (`VisaoTela` ~linha 101, `visoes` ~linha 661, "Comparar com" ~linha 692, `modo=` ~linha 917)

**Interfaces:**
- Consumes: `diasDeVariacao` (Task 3).
- Produces: `PlanoGanttProps.colunas?: "padrao" | "variacao"` (padrão `"padrao"`); `VisaoTela = ModoGantt | "variacao" | "indicadores"`. `ModoGantt` e `gantt-barra.tsx` não mudam.

- [ ] **Step 1: `plano-gantt.tsx`:** com `colunas === "variacao"` (e `verDatas`), montar `codigo, nome, inicio, termino, inicioBase, terminoBase, varInicio, varTermino` — "Var. início" = `diasDeVariacao(t.inicioBaseline, t.inicioPrevisto)`, "Var. término" = o mesmo número da coluna Desvio; as duas com o mesmo selo de cor/sinal do Desvio (extrair a célula numa função de render compartilhada, fora do componente). `camposDaVisao` vazio no Variação (só leitura). Coluna Ações continua. A barra recebe o `modo` que vier (o workspace manda `"controle"`).
- [ ] **Step 2: `eap-workspace.tsx`:** botão "Variação" depois de "Controle", só com `verDatas && temLinhaBase`; `modo={modo === "controle" || modo === "variacao" ? "controle" : "planejamento"}` e `colunas={modo === "variacao" ? "variacao" : "padrao"}`; "Comparar com" aparece também no Variação.
- [ ] **Step 3: Verificar:** `npx eslint` nos dois arquivos sem avisos novos; `tsc` do servidor sem erros; `npx vitest run src/components src/modules/planejamento` PASS.
- [ ] **Step 4: Verificar em tela** (Chrome, 3001): alternar Gantt → Controle → Variação mantém filtro, seleção e linha aberta; Variação mostra só as oito colunas, barras iguais às do Controle, Var. início/término com sinal e cor do Desvio, linha criada depois da aprovação com "—"; "Comparar com" muda as colunas de base; projeto sem linha de base não mostra o botão; 1366×768 com menu aberto e 390×844 sem rolagem horizontal da página. Prints em `prints-auditoria/2026-11-01_lote7-execucao-real/`.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/planejamento/plano-gantt.tsx src/components/planejamento/eap-workspace.tsx
  git commit -m "feat(planejamento): modo Variação no cronograma do projeto"
  ```

---

### Task 8: Manual e auditoria final

**Files:**
- Modify: `docs/manual/projetos/planejamento.md` (trecho de "Atualizar tarefa" e do Gantt de controle), `docs/manual/novidades.md`, `docs/manual/search-index.json` se a entrada da página precisar de resumo novo.
- Create (git-ignorado): `prints-auditoria/2026-11-01_lote7-execucao-real/LEIAME.md`.

- [ ] **Step 1: Atualizar o manual** em linguagem de usuário: "Atualizar tarefa" registra o % sem concluir (e quem pode: quem acompanha o cronograma); término real conclui em 100%; valor da tarefa de terceiro (só quem vê financeiro); as colunas novas do Controle e o que cada uma conta (Trab. real = horas do ponto; Custo real = horas × custo/hora ou o valor do terceiro; "parcial"); o modo Variação. Entrada nova em `novidades.md`.
- [ ] **Step 2: Rodar o protocolo** `docs/PROTOCOLO_AUDITORIA_FINAL.md` (reler, é mutável) no nível 3: `npm test`, `npm run lint`, `tsc` do servidor, `npm run smoke:progresso-historico`, `npm run smoke:execucao-real`, `npm run smoke:eap-integracao`, `npm run smoke:pagamento-fase`, `npm run smoke:previsao-recebimento`, `npm run smoke:desfazer-eap`. Reviewers por área (subagentes de leitura): `prisma-migration-reviewer` na migração, `action-guardian` na action/serviço (gate financeiro do valor de terceiro), `client-boundary-auditor` + `a11y-auditor` + `ui-state-linter` + `i18n-convention-reviewer` na UI, `design-system-guardian` nas colunas. Corrigir o que estiver no escopo e rodar de novo.
- [ ] **Step 3: Evidência em tela:** prints das Tasks 5, 6 e 7 em `prints-auditoria/2026-11-01_lote7-execucao-real/` com `LEIAME.md` (o que cada print prova e como reproduzir).
- [ ] **Step 4: Relatório final em pt-BR** nas seções do protocolo, com as decisões minhas do desenho (execução sem exigir plano aprovado; valor do terceiro na linha; realizado "parcial"; Variação reusa as barras; 100% só pelo término real) e o lembrete de deploy: `npx prisma migrate deploy` no servidor (coluna nova, sem script).
- [ ] **Step 5: Commit**
  ```bash
  git add docs/manual/projetos/planejamento.md docs/manual/novidades.md
  git commit -m "docs(manual): percentual na execução, colunas reais e modo Variação do cronograma"
  ```
  Conferir `git show --stat HEAD`: só arquivos desta tarefa.
