# Banco de horas com saldo incorreto — Auditoria (Etapa 1)

**Data:** 2026-07-31 · **Status:** diagnóstico entregue, aguardando aprovação para Etapa 2
**Escopo:** `modules/ponto` + `modules/rh/banco` (nada fora disso)

---

## 1. Modelos e campos envolvidos

### Registro de ponto

| Model | Arquivo | Campos usados no cálculo |
|---|---|---|
| `Batida` | `prisma/schema.prisma:1695` | `userId`, `dia` (`@db.Date`, dia LOCAL da entrada), `tipo` (`entrada`/`inicio_descanso`/`fim_descanso`/`saida`), `horario` |
| `SessaoTrabalho` | `prisma/schema.prisma:1612` | `userId`, `inicio`, `fim` — fonte legada (pré-cutover) e base do rateio por projeto |
| `BancoHorasMensal` | `prisma/schema.prisma:1652` | `userId`, `ano`, `mes`, `saldoMinutos`, `acumuladoMinutos`, `fechadoEm` |
| `EscalaRole` / `EscalaUsuario` | `prisma/schema.prisma:1732` / `1754` | `diaSemana`, `ativo`, `horasDia`, `entrada`, `toleranciaMin` |
| `Feriado` / `FeriadoRecorrente` | — | `data` / `dia`+`mes` |
| `Ferias` | — | `inicio`, `fim`, `status: "aprovado"` |

### Vínculo / contrato

| Model | Arquivo | Campos relevantes (hoje **não** usados no cálculo) |
|---|---|---|
| `Vinculo` | `prisma/schema.prisma:269` | `contratacao` (`clt`/`estagio`/`pj`/`autonomo_rpa`/`pro_labore`), **`dataInicio`** (`@db.Date`), `dataFim`, `ativo`, `cargaSemanal` |
| `User` | `prisma/schema.prisma:62` | `role`, **`dataAdmissao`**, `contratacao` (cache denormalizado), `vinculoAtivoId`, `ativo` |

> `Vinculo.dataInicio` e `User.dataAdmissao` existem no schema e **nenhum dos dois é lido** por qualquer função de cálculo de saldo.

---

## 2. Onde o saldo é calculado

**Função única de cálculo:** [`espelhoMes()`](../../../src/modules/ponto/queries.ts#L313) — `src/modules/ponto/queries.ts:313-399`.

Linhas decisivas:

| Linha | O que faz |
|---|---|
| `queries.ts:361-362` | Resolve `horasDia` do usuário (`horasDiaPadrao`) |
| `queries.ts:372-382` | Monta `esperadoPorDia` **de 1 até o último dia do mês** |
| `queries.ts:387-390` | Soma o esperado só até `hoje` (corta mês futuro) |
| `queries.ts:396` | `saldoMinutos = totalMin − esperadoMin` |

**Consumidores (todos gravam/exibem o mesmo número):**

- [`fecharBancoMesEquipe`](../../../src/modules/rh/banco/actions.ts#L14) — `rh/banco/actions.ts:14-51` (botão "Fechar mês")
- [`fecharBancoHorasMesAnterior`](../../../src/lib/jobs-handlers.ts#L1121) — `lib/jobs-handlers.ts:1121-1150` (cron `0 2 1 * *`, `lib/jobs.ts:222`)
- [`espelhoDetalhado`](../../../src/modules/ponto/queries.ts#L547) — `queries.ts:557-558`, reexporta `saldoMinutos`
- `/ponto` (`app/(dashboard)/ponto/page.tsx:34`), ficha 360 (`modules/rh/pessoas/queries.ts:234`)

**Card da tela:** [`BancoHorasAdmin`](../../../src/components/rh/banco-horas-admin.tsx) lê **só linhas já fechadas** via [`fechamentosDoMes`](../../../src/modules/rh/banco/queries.ts#L5).

---

## 3. Origem da data inicial de apuração e da jornada esperada

### Data inicial

`espelhoMes` **não tem data inicial por usuário**. `queries.ts:375`:

```ts
for (let d = 1; d <= ultimoDiaMes; d++) { ... }
```

A apuração começa **sempre no dia 1 do mês**, para todo mundo. Não há referência a `Vinculo.dataInicio`, `User.dataAdmissao`, `User.createdAt` nem à primeira batida do usuário.

### Jornada esperada

`horasDiaPadrao(userId, role)` → `modules/rh/escalas/queries.ts:89`:

1. `EscalaUsuario` ativa (override) → senão `EscalaRole` do `role` → senão fallback 8h
2. Reduz a semana ao **maior** `horasDia` entre os dias ativos (`horasDiaDaSemana`, `escalas/queries.ts:84-87`)
3. `espelhoMes:381` aplica esse escalar a **todo dia seg–sex** (`wd !== 0 && wd !== 6`) que não seja feriado nem férias

Fallback de role quando o usuário não existe: `user?.role ?? "freelancer"` (`queries.ts:362`).

---

## 4. Reprodução numérica

### Colaborador A — saldo **−176h00**

```
jun/2026 tem 22 dias úteis (seg–sex): 01–05, 08–12, 15–19, 22–26, 29, 30
esperadoDiaMin = 8h × 60 = 480 min          (EscalaRole clt = 8h)
feriados subtraídos = 0                      ← ver §5, causa C
férias subtraídas   = 0
esperadoMin = 22 × 480 = 10.560 min = 176h00
totalMin    = 0                              ← nenhuma batida/sessão em jun
saldo       = 0 − 10.560 = −10.560 min = −176h00   ✔
```

**−132h00** é o mesmo cálculo para estagiário: `22 × 6h × 60 = 7.920 min = 132h00`. ✔
O fato de 176h e 132h serem *exatamente* a jornada cheia prova que `totalMin = 0` — nenhuma hora entrou.

### Colaborador B — saldo **−23h10**

```
−23h10 = −1.390 min
Se CLT (esperado 10.560): totalMin = 10.560 − 1.390 = 9.170 min = 152h50 trabalhadas
Se estagiário (esperado 7.920): totalMin = 7.920 − 1.390 = 6.530 min = 108h50 trabalhadas
```

Esse colaborador **tem** registro; o saldo dele é o único plausível da tela. Ele é o contraste que confirma o diagnóstico: quem registrou tem saldo pequeno, quem não registrou leva a jornada cheia negativa.

### Evidência empírica no banco de dev

Rodei uma leitura read-only no banco de dev (script temporário, já removido). Resultado:

```
Carla Dias  [clt]         vinculoInicio=2026-07-04  criadoEm=2026-07-04  batidas=0
Diego Melo  [estagiario]  vinculoInicio=2026-07-04  criadoEm=2026-07-04  batidas=0
```

…e ambos têm linhas de `BancoHorasMensal` com saldo negativo para **fev, mar, abr, mai e jun/2026** — meses em que o vínculo **ainda não existia**. O cálculo cobra horas esperadas de período anterior ao vínculo. Causa A reproduzida localmente.

(O banco de dev está com o dataset `seed:demo`, então os números não são os da tela de produção — mas o mecanismo é o mesmo.)

---

## 5. Diagnóstico — causa raiz

São **quatro** causas independentes. A (A) sozinha já explica o sintoma; as outras aparecem juntas.

### A — `espelhoMes` não tem piso por usuário (causa raiz principal)

`queries.ts:375` varre o mês inteiro sem consultar `Vinculo.dataInicio` / `User.dataAdmissao` / início do ponto. Quem foi admitido dia 20 leva 19 dias de débito; quem não existia no mês leva o mês inteiro. Viola diretamente os alvos 1 e 2.

### B — Sem registro ≠ saldo negativo, mas o código não distingue

`totalMin = 0` + `esperadoMin = mês cheio` → o saldo vira "todo o mês em falta". Isso **não é bug do cálculo em si** — é a consequência de A somada ao fato de as batidas (Ponto v2) só existirem a partir de jul/2026 (`schema.prisma:1670-1674`). Mas o efeito no card é indistinguível de um erro.

**Ponto que não consigo resolver daqui:** se os vínculos de produção **forem anteriores** a junho, `dataInicio` sozinha não corrige nada — é preciso um piso composto `max(dataInicio, início do registro de ponto)`. O alvo 2 já autoriza exatamente isso ("data de admissão / data de início do registro de ponto"). Preciso saber qual dos dois casos é o de vocês.

### C — Feriados não são semeados; ninguém importou 2026 em produção

`Feriado`/`FeriadoRecorrente` só são preenchidos por ação manual do admin (`modules/rh/feriados/actions.ts:75` — "Importar feriados nacionais"). **Nem `prisma/seed.ts` nem `scripts/seed-demo.ts` criam feriados.** Se a importação de 2026 não foi feita, Corpus Christi (04/06/2026) não é descontado — e é exatamente por isso que jun/2026 fecha em 22 dias úteis (176h) em vez de 21 (168h). Infla o esperado de todo mundo, todo mês com feriado.

### D — O gate CLT/estagiário usa `role`, não `contratacao`

- `banco/actions.ts:27` e `jobs-handlers.ts:1130`: `where: { role: { in: CLT_ROLES } }`, com `CLT_ROLES = ["clt","estagiario"]` (`lib/roles.ts:48`)
- `queries.ts:706`: `controlaJornada: CLT_ROLES.includes(user.role)`

Com o eixo novo `Contratacao` (`schema.prisma:45`), isso erra nos dois sentidos: `role: administrativo` + `contratacao: clt` fica **de fora** do banco de horas; `role: clt` + `contratacao: pj` entra.

Pior para o alvo 3: **`espelhoMes` calcula `esperado`/`saldo` para todo mundo**, inclusive PJ e freelancer (fallback `role ?? "freelancer"` → 8h/dia), e `espelhoDetalhado:654` carimba `status = "falta"` sem olhar `controlaJornada`. A UI apenas *esconde* a coluna (`espelho-view.tsx:171`) — o número continua sendo calculado e exposto no retorno. O alvo 3 diz "em nenhum cálculo de saldo", então a correção tem que chegar em `espelhoMes`, não só nas views.

---

## 6. 🛑 Condição de parada atingida — decisão sua

Você pediu para eu parar se **"a lógica de jornada esperada estiver duplicada em mais de um lugar"**. Está — em **três**, e duas discordam entre si:

| Local | Como calcula o esperado |
|---|---|
| `ponto/queries.ts:373-382` (`espelhoMes`) | escalar `horasDiaPadrao` (= **máximo** entre dias ativos) × todo seg–sex, menos feriado/férias |
| `ponto/queries.ts:639` (`espelhoDetalhado`) | `devidasMin` do dia da semana **real** (`grade.ativo`, `grade.horasDia`) |
| `rh/rateio/queries.ts:7-15` (`diasUteis`) | contagem de dias úteis **sem feriado e sem férias** × `horasDiaPadraoEmLote` |

Consequências reais: quem faz 8h seg–qui + 4h sex tem sexta cobrada como 8h por `espelhoMes`; quem tem sábado ativo na escala é ignorado por `espelhoMes` e cobrado por `espelhoDetalhado`. O comentário em `queries.ts:543-545` afirma que ambos vêm da "mesma fonte" — verdade para o total do mês, falso para o detalhe por dia.

**Preciso da sua decisão antes da Etapa 2:** unificar as três em um helper puro único (`esperadoDoMes(escala, feriados, ferias, pisoData, hoje)`, testável, sem I/O — no padrão de `encargos.ts`/`aging.ts`), ou corrigir só `espelhoMes` e deixar a divergência para depois?

---

## 7. Divergência jun/2026 × 31/07/2026 — **não é bug de cálculo**

Verificado:

- `app/(dashboard)/rh/admin/page.tsx:28-31` escolhe o mês **anterior** ao atual como alvo do fechamento — deliberado, comentado no código. Em 31/07 → jun/2026. ✔
- `components/rh/banco-horas-admin.tsx:21-25` calcula `prazoFechamento(hoje)` = último dia útil do mês **corrente**, a partir de `hoje` — não do mês de referência. Em 31/07 → 31/07/2026, "vence hoje". ✔

A política é coerente ("fechar junho até o fim de julho"). O problema é **o texto**: o banner nunca diz de qual mês é o prazo, então "jun/2026" e "31/07/2026" parecem contradição. Correção sugerida (cosmética): `"Fechamento de jun/2026 até 31/07/2026"`.

**Achado adicional, mais relevante:** o cron `fechar-banco-horas` (`lib/jobs.ts:222`, dia 1 às 02:00) **já fechou junho automaticamente em 01/07**. O banner de urgência e o botão "Refechar mês" são resíduo de um fluxo manual que a automação tornou desnecessário.

---

## 7-bis. Causa E — falta o **teto** do período (`Vinculo.dataFim`)

Simétrica à causa A e não listada antes: quem sai no dia 10 continua acumulando horas esperadas até o fim do mês. `schema.prisma:287-289` diz explicitamente que `dataFim` é o mecanismo previsto e alerta que desativar o usuário no lugar disso "remove a pessoa da folha do próprio mês da saída" — que é exatamente o que `where: { ativo: true }` faz hoje em `banco/actions.ts:27` e `jobs-handlers.ts:1130`. O alvo 1 ("período em que o colaborador já estava ativo") cobre as duas pontas.

---

## 8. Perguntas abertas antes da Etapa 2

1. **Piso de apuração:** os vínculos afetados em produção começaram **antes ou depois** de jun/2026? Define se basta `Vinculo.dataInicio` ou se preciso do piso composto com o início do registro de ponto.
2. **Duplicação (§6):** unificar as três implementações ou corrigir só `espelhoMes`?
3. **Histórico:** as linhas já gravadas em `BancoHorasMensal` **não** se corrigem sozinhas. Quer que eu **refeche** (recalcule via `fecharBancoMesEquipe`, que é upsert idempotente — recálculo, não escrita manual de valores) os meses passados, ou deixo o histórico como está e corrijo só o caminho corrente? Note que `acumulado = prev.acumuladoMinutos + saldo` (`actions.ts:40`) só lê o mês imediatamente anterior — um mês não fechado zera a cadeia silenciosamente.
4. **Alvo 4 (saldo corrente no card):** hoje `fechamentosDoMes` lê só linhas fechadas e mostra "Mês ainda não fechado." quando vazio. Exibir o saldo ao vivo exige rodar `espelhoMes` para a equipe no render da página — confirma que quer isso?
5. **Feriados (causa C):** posso incluir a importação dos feriados nacionais no `db:seed` (idempotente, não é migration), ou prefere manter como ação manual do admin?

---

## 9. Recomendações (respostas propostas às 5 perguntas)

### Q1 — Piso e teto: buscar o vínculo que **cobre o mês**, não o vínculo ativo

Isso **elimina a pergunta** — não dependo mais de saber quando os vínculos de produção começaram.

```ts
// vínculo vigente NAQUELE mês (não o `vinculoAtivo` de hoje)
where: { userId, dataInicio: { lte: fimMes }, OR: [{ dataFim: null }, { dataFim: { gte: iniMes } }] }
```

Piso do dia a apurar = `max(vinculo.dataInicio, primeiro registro de ponto do usuário)`
Teto = `min(vinculo.dataFim ?? fimMes, hoje, fimMes)`

Por que não `User.vinculoAtivo`: estagiário jan–jun → CLT a partir de julho. Calculando junho, `vinculoAtivo.dataInicio` = julho → piso julho → esperado de junho = 0. Errado: em junho a pessoa era estagiária e devia 6h/dia. A mesma consulta por data devolve de brinde a `contratacao` e a `cargaSemanal` corretas daquele mês — que é o que o helper da Q2 precisa.

Efeito colateral desejado: trocar `where: { ativo: true }` por "vínculo cobre o mês" nos dois writers corrige quem foi desligado no meio do mês (causa E) e para de sumir com quem saiu.

Ressalva honesta: quem tem vínculo antigo e **nunca** bateu ponto continua com saldo cheio negativo — o piso não inventa registro. Isso está certo, mas a UI precisa distinguir "sem nenhum registro" de "saldo devedor real".

### Q2 — Unificar, mas só dentro de `ponto`

**Unificar `espelhoMes` + `espelhoDetalhado`** num helper puro (`esperado.ts`, padrão `encargos.ts`/`aging.ts`) que devolve o **mapa por dia**; o total do mês vira um fold sobre ele e `devidasMin` lê o mesmo mapa. Assim os dois concordam por construção, não por convenção — `esperadoPorDia` já é contrato público (`queries.ts:364-365`, base do filtro por período no cliente).

**Não tocar em `rh/rateio/queries.ts`** — está fora da cerca que você desenhou e alimenta custo/hora → margem de projeto. Documento a divergência e trato depois, com aprovação separada.

Aviso: unificar **muda silenciosamente totais existentes** de quem tem escala não-uniforme (`max(horasDia)` × seg–sex vira `horasDia` real por dia da semana). É intencional — e é mais um motivo para a Q3 não ser opcional.

De carona: `espelhoMes:377` usa `getDay()` (fuso do servidor) e `espelhoDetalhado:626` usa `getUTCDay()`. Concordam numa máquina em SP; `engine.ts:227-231` manda não fazer nem um nem outro.

### Q3 — Refechar o histórico, com dois ajustes

**Recomendo refechar.** Sem isso o card segue mostrando o número errado e o `acumulado` carrega o erro para sempre. É recálculo idempotente (upsert), não escrita manual de valor — não cai na proibição.

1. Ação nova `recalcularBancoHistorico(anoIni, mesIni)` iterando **em ordem cronológica** (o acumulado depende do mês anterior).
2. Trocar `findUnique` do mês exatamente anterior (`banco/actions.ts:36`, `jobs-handlers.ts:1137`) por [`acumuladoAte()`](../../../src/modules/rh/banco/queries.ts#L36), que já faz `findFirst` desc sobre **todos** os meses anteriores. Duas linhas, dentro do escopo, e torna o recálculo imune a mês não fechado.

**Eu construo, você clica.** Não rodo em produção.

**Dependência de ordem: Q5 antes de Q3.** Recalcular antes de existirem feriados re-cozinha a mesma inflação.

### Q4 — Sim, mas em lote e com o mês explícito

N× `espelhoMes` = ~8 queries por usuário. A maior parte é constante por request (`listarFeriados`, grades de escala) e sai do loop. `saldoCorrenteEquipe(ano, mes, userIds)` batendo uma vez cada: `batida.findMany` + `sessaoTrabalho.findMany` + `listarFeriados` + [`horasDiaPadraoEmLote`](../../../src/modules/rh/escalas/queries.ts#L96) (já existe) + `ferias.findMany` → **~5 queries no total**.

Decidir explicitamente **qual** mês: saldo corrente de **junho** (referência, ao vivo se não fechado) ou de **julho** (mês atual, parcial)? Recomendo **duas colunas** — "Saldo fechado (jun)" e "Saldo corrente (jul, até hoje)" — e o banner passando a nomear o mês (§7). Um número de julho embaixo de "Fechamento de jun/2026" só piora o problema de rótulo.

### Q5 — Semear feriados nacionais, **precisa da sua liberação de escopo**

Toca `prisma/seed.ts` e `modules/rh/feriados` — fora da cerca `ponto`/`banco`. Peço autorização explícita.

Recomendo semear no `db:seed` (idempotente, sem migration) usando [`feriadosNacionais(ano)`](../../../src/modules/rh/feriados/queries.ts#L101), que já é puro e calcula os móveis pela Páscoa. **Ano corrente + próximo** — só o corrente reintroduz o bug em 1º de janeiro.

Alternativa mais robusta: fallback dentro de `listarFeriados(ano)` — se não houver linha `tipo: "nacional"` daquele ano, computa `feriadosNacionais(ano)` na hora. Não tem como desatualizar e cobre mês retroativo. Importação manual do admin continua, para estadual/municipal.

---

---

## 10. Etapa 2 — implementação (aprovada em 2026-07-31, "siga o recomendado em tudo")

### Arquivos novos

| Arquivo | Papel |
|---|---|
| `src/modules/ponto/esperado.ts` | **Puro.** Fonte única do esperado: `esperadoPorDiaMes` (mapa por dia), `somarEsperadoAte`, `pisoApuracao`. Sem I/O. |
| `src/modules/ponto/esperado.test.ts` | 20 testes: mês cheio, feriado/férias, admissão no meio do mês, mês anterior ao vínculo, desligamento, não-CLT, escala não-uniforme, sábado ativo. |
| `src/modules/ponto/apuracao.ts` | `contextoApuracao` / `contextoApuracaoEmLote` — vínculo **que cobre o mês**, piso/teto, `controlaJornada`. |
| `src/modules/ponto/apuracao.test.ts` | 11 testes com Prisma mockado: troca estágio→CLT, PJ/autônomo/pró-labore, sem vínculo no mês, piso composto, fallback por `role`. |
| `src/modules/rh/banco/service.ts` | `fecharBancoDoMes` + `recalcularHistoricoBanco`, compartilhados por action e cron. |

### Alterações

- **`ponto/queries.ts`** — `espelhoMes` monta o esperado pelo helper com piso/teto/`controlaJornada` e passa a devolver `controlaJornada`; `espelhoDetalhado` lê `devidasMin` **do mesmo mapa** e ganha o status `fora_vinculo`; dia sem batida de quem não tem jornada controlada deixa de ser `falta`.
- **`minha-ficha/page.tsx` + `rh/pessoas/[id]/page.tsx`** — `controlaJornada`, o histórico do banco e as solicitações deixam de ser gated por `CLT_ROLES.includes(role)` e passam por `contextoApuracao`. Sem isso, `Paulo Ramos` (role `administrativo`, contratação `clt`) apareceria no card do banco de horas mas teria a aba de jornada escondida na própria ficha — a mesma causa D em dois arquivos.
- **`ponto/engine.ts`** — nova `trabalhadoPorDia` (pura): a agregação híbrida batida/sessão agora tem UMA implementação, usada pelo espelho individual e pelo saldo em lote.
- **`rh/banco/queries.ts`** — `usuariosComJornadaNoMes` (vínculo cobre o mês, com fallback por `role` para quem ainda não tem vínculo); `fechamentosDoMes` filtra fechamentos antigos de quem não tem jornada; **`saldoCorrenteEquipe`** em lote (~10 queries fixas, não 12×N).
- **`rh/banco/actions.ts`** — `fecharBancoMesEquipe` enxuto sobre o service; nova `recalcularBancoHistorico(ano, mes)` (auditada por `defineAction`), com janela de no máximo `MAX_MESES_RECALCULO = 6` meses por chamada. Sem o teto, 24 meses × 15 CLT seriam ~4.300 queries sequenciais numa única Server Action — timeout provável e cadeia de acumulado pela metade. O botão avança em blocos e avisa quando ainda falta histórico.
- **`lib/jobs-handlers.ts`** — `fecharBancoHorasMesAnterior` virou 2 linhas sobre o service; sai o `findUnique` do mês exatamente anterior, entra `acumuladoAte` (imune a mês não fechado).
- **`rh/escalas/queries.ts`** — `gradesEmLote` (2 queries) extraído; `horasDiaPadraoEmLote` reescrito em cima dele.
- **`rh/feriados/queries.ts`** — nova `feriadosParaCalculo(ano)`: se o ano não tem nenhum feriado `nacional` cadastrado, calcula os nacionais na hora. Separada de `listarFeriados` de propósito — a tela `/configuracoes/feriados` e a agenda editam/excluem por `id`, e linhas sintéticas ali virariam botões apontando para registros inexistentes. Só `ponto` e `banco` usam a versão calculada.
- **`prisma/seed.ts`** — semeia feriados nacionais do ano corrente **e do próximo** (`update: {}` para não sobrescrever ajuste manual do admin).
- **UI** — card com 4 colunas (fechado / corrente / acumulado), banner nomeando o mês (`"Fechamento de jun/2026 até 31/07/2026"`), botão **Recalcular histórico**, `EmptyState` textual correto; `/ponto` usa `espelho.controlaJornada` em vez de `CLT_ROLES`.
- **Manual** — `docs/manual/rh-ponto/rh-admin.md` + `search-index.json`.

### Verificação

- `npx vitest run` → **1469 testes, 159 arquivos, tudo passando** (31 novos).
- `npx tsc --noEmit` limpo · `npx eslint src prisma` limpo · `npm run build` OK.
  (O build imprime `A "use server" file can only export async functions, found number` —
  **pré-existente e fora do escopo**: vem de `modules/perfis/actions.ts:115`,
  `export { LIMITE_AVISO_PERFIS }`. Não bloqueia o build; não mexi por estar fora da cerca.)
- `npm run db:seed` no dev: `✔ 24 feriados nacionais garantidos (2026, 2027)`.
- Leitura read-only no banco de dev (script temporário, removido), com os vínculos demo iniciando em 04/07/2026:

```
=== 6/2026 — 0 com jornada controlada ===          ← antes: −176h/−132h para todos
=== 7/2026 — 3 com jornada controlada ===
Carla Dias  [clt]            piso=2026-07-04  trabalhado=25h10  esperado=152h00  saldo=−126h50
Diego Melo  [estagiario]     piso=2026-07-04  trabalhado=19h46  esperado=114h00  saldo=−94h14
Paulo Ramos [administrativo] piso=2026-07-04  trabalhado=0h00   esperado=152h00  saldo=−152h00
[PJ] Ana Silva: esperado=0h00  controlaJornada=false
```

`Paulo Ramos` é `role: administrativo` com `contratacao: clt` — entrou no banco de horas
pela primeira vez (causa D). `Ana Silva` (PJ) deixou de acumular esperado (causa A/alvo 3).
jun/2026 não gera mais débito nenhum, porque nenhum vínculo cobria o mês (causa A/alvo 2).

### ⚠️ O que essa verificação NÃO prova — leia antes de dar por encerrado

No banco de dev os vínculos começam em 04/07/2026, então junho caiu no ramo
"**nenhum vínculo cobre o mês**". Produção quase certamente cai no **outro** ramo: o
vínculo cobre junho, `controlaJornada` é `true`, e o piso sai de
`max(início do vínculo, primeiro registro de ponto)`. Aí existem dois desfechos:

| Situação em produção | Resultado depois da correção |
|---|---|
| Os colaboradores **têm** batidas/sessões, a partir de jul/2026 | piso = jul/2026 → jun/2026 zera. **Corrigido.** |
| Os colaboradores **nunca** bateram ponto (zero registros) | piso = início do vínculo (ex.: 2020) → jun/2026 **continua −176h** |

O segundo caso não é bug do cálculo — sem nenhum registro, "início do registro de ponto"
não tem valor por usuário, e o alvo 2 proíbe uma data global fixa como substituto. Se for
esse o caso de vocês, a decisão é de processo: registrar a data real de início do ponto de
cada pessoa (`Vinculo` novo ou `dataAdmissao`), ou aceitar que meses pré-ponto fiquem
negativos.

**Como descobrir qual é o caso:** na tela do espelho de qualquer colaborador com −176h,
veja se junho/julho têm alguma batida. Ou, no banco: `SELECT MIN(dia) FROM batida WHERE
"userId" = ...` e `SELECT MIN(inicio) FROM sessao_trabalho WHERE "userId" = ...`. Vazio nos
dois = segundo caso.

### O que ficou de fora, de propósito

- **`rh/rateio/queries.ts`** (terceira cópia da jornada esperada) — fora da cerca `ponto`/`banco` e alimenta custo/hora → margem de projeto. Divergência documentada em §6, correção precisa de aprovação separada.
- **Nada rodado em produção.** `recalcularBancoHistorico` está pronta e auditada, mas quem clica é você. Ordem correta no deploy: `npm run db:seed` (feriados) → **depois** Recalcular histórico.
- **Schema intacto**, nenhuma migration.

### Pendência de deploy

`npm run db:seed` é **obrigatório** no deploy — sem ele os feriados nacionais não existem em
produção e o esperado continua inflado nos meses com feriado (o fallback de `listarFeriados`
cobre o cálculo, mas a tela de feriados segue vazia).
