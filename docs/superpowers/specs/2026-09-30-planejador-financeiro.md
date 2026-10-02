# Planejador financeiro — modelo formal (contrato da F0)

Data: 2026-09-30 · Branch: `feat/planejador-financeiro` · Plano de fases:
`C:\Users\Admin\.claude-vscode\plans\pasted-content-id-ee65-senahub-precious-pond.md` · Mockup aprovado
como contrato visual: https://claude.ai/artifact/E3kpRfB419uQGmyUjMaNqX · Vocabulário: `CONTEXT.md`,
seção Financeiro · Decisões: ADR-0007 (confiança ≠ realizado), ADR-0008 (natureza e transferência),
ADR-0009 (pró-labore recorrente projetado).

Este documento fixa as regras de caixa, caixinha, cenário e resultado **antes** do código. Cada regra
marcada com **[T]** vira teste automatizado; a lista final (§15) diz em que arquivo.

## 0. Notação

- `D0` = hoje (data civil). O servidor entrega `hoje` pronto (`inicioDoDiaUtc`, `lib/data.ts`); o motor
  só trabalha com datas `YYYY-MM-DD` em string e nunca chama `new Date("YYYY-MM-DD").getDate()`.
- Valores em **centavos inteiros**. `v(l) = valorEfetivo ?? valor` para realizado; `valor` para pendente.
- `σ(l) = +1` para receita, `−1` para despesa.
- Horizonte `H` dias: o período é `[D0, D0 + H − 1]`.

## 1. Status × confiança (nunca equivalentes)

| Pergunta | Campo | Valores | Quem lê |
|---|---|---|---|
| O dinheiro já se moveu? | `Lancamento.status` | `confirmado` = **realizado**; `previsto`, `aguardando_aprovacao`, `previsao` = **pendente**; `cancelado` | caixa, DRE, aging, motor |
| O quanto se acredita na entrada pendente? | `Lancamento.confianca` | enum `ConfiancaRecebimento { confirmada_cliente, provavel, estimada, incerta }` | **só** o motor, **só** para receita pendente |

- Nenhuma regra converte um no outro. Baixar uma receita não mexe na confiança; marcar "confirmada pelo
  cliente" não realiza nada. **[T]**
- A confiança de uma receita realizada é ignorada (o evento nem existe no motor). **[T]**
- Confiança efetiva de receita pendente (D1): `confianca ?? padrão`, com padrão = `provavel` para
  `previsto`, `estimada` para `previsao`; pendente vencida há mais de `diasParaIncerta` (30) é tratada
  como `incerta` **na projeção**, sem gravar. **[T]**
- Prioridade só existe em despesa; efetiva = `lancamento ?? categoria ?? categoria-pai ?? P3`. **[T]**
- Texto de tela: realizado aparece como **"Pago"/"Recebido"**, nunca "Confirmado". O nível de confiança
  aparece como **"Confirmada pelo cliente"**; a ação em massa é **"Marcar como confirmada pelo cliente"**.
  O identificador `confirmada` sozinho não existe no código novo.

## 2. Natureza da categoria e transferências

**Como é hoje (investigado):** não existe transferência nativa. Só o import do Meu Dinheiro
(`importacao/processar.ts:170-199`) cria transferência: duas pernas, despesa na conta de origem e
receita na de destino, em duas categorias de nível 1 chamadas "Transferência" (uma por tipo,
`commit-core.ts:93-104`), pareadas apenas pelo prefixo do `importHash` (`:out`/`:in`). Sem conta de
destino, só a perna de saída é criada. O livro caixa separa transferências pelo **nome** da categoria
(`lancamentos-view.tsx:95`). A DRE soma as duas pernas hoje (distorce receita e despesa). Não existe
conceito de aplicação/resgate: conta `tipo = investimento` é uma conta como outra qualquer.

**Regra nova:** `CategoriaFinanceira.natureza` enum `NaturezaCategoria { resultado, fora_do_resultado,
transferencia }`, padrão `resultado`. `foraDoResultado(c) ⇔ natureza(c) ≠ resultado`.
A migração A marca `transferencia` nas categorias cujo nome normalizado é "transferencia".

| Natureza | Caixa atual | DRE / KPI de despesa | DFC | Entradas e compromissos do planejador | Dias de caixa |
|---|---|---|---|---|---|
| `resultado` | sim | sim | pelo `grupoDfc` | sim | sim (saídas) |
| `fora_do_resultado` | sim | **não** | pelo `grupoDfc` (financiamento) | sim | não |
| `transferencia` | sim, cada perna na sua conta (soma zero quando pareada) | não | não | **não entram nos totais** | não |

- **Pareamento:** as pernas de uma transferência compartilham `Lancamento.transferenciaId`. A migração A
  cria a coluna e a preenche no que veio do import (prefixo do `importHash` antes de `:out`/`:in`).
  Perna de categoria `transferencia` sem `transferenciaId`, ou cujo id não tem outra perna viva
  (não cancelada, não excluída), é **perna sem contraparte**.
- **Duas regras que não conflitam:**
  1. **Saldo:** toda perna pendente dentro do horizonte muda o saldo consolidado no dia dela, com o sinal
     dela. Nenhuma perna some da projeção.
  2. **Totais:** pernas de transferência não entram em Entradas (`E`), Comprometido (`C`), barras do dia,
     "principais saídas" do alerta de déficit, P3/P4 reprogramável nem dias de caixa. Entram numa linha
     própria, `T = Σ σ·v` das pernas pendentes no horizonte, e a identidade do fim do horizonte passa a ser
     **`S_H = S0 + E − C + T`**.
- **Efeito no saldo consolidado, caso a caso** (pernas pendentes; perna realizada já está em `S0`):

| Caso | O que acontece no saldo | `T` no fim | Aviso |
|---|---|---|---|
| a) pareada, as duas pernas no mesmo dia do horizonte | −v e +v no mesmo dia: o fechamento do dia não muda | 0 | nenhum |
| b) pareada, pernas em dias diferentes do horizonte | cai no dia da saída e volta no dia da entrada ("em trânsito" entre as datas) | 0 | nenhum |
| c) uma perna sem contraparte | a perna muda o saldo no dia dela e continua mudando até o fim (dinheiro entrou ou saiu do conjunto de contas da empresa) | ±v | "Transferência sem contraparte: R$ v em dd/mm" |
| d) pareada, a outra perna depois do horizonte | a perna de dentro muda o saldo; a de fora não entra na projeção | ±v | "Contraparte fora do horizonte (dd/mm)" |
| e) pareada, a outra perna já realizada | a perna pendente muda o saldo e desfaz o desequilíbrio que a realizada deixou em `S0` | ±v | "Em trânsito desde dd/mm" |

  **[T]** para a, b, c, d (e e como extra): o saldo diário e o `T` de cada caso, e que `E` e `C` não mudam
  com a presença das pernas.
- **Aplicação e resgate:** conta de investimento cadastrada entra no caixa atual (como hoje). Mover para
  ela é transferência (neutra). Rendimento é receita `resultado`; IR/IOF, despesa `resultado`. Tirar
  aplicação de longo prazo do caixa do planejador é decisão futura (opção por conta), fora do MVP.
- **Outros movimentos não econômicos:** cancelado sai de tudo; resto de pagamento parcial é um novo
  pendente (§5); previsão de recebimento casada com cobrança manual é excluída pelo serviço existente;
  saldo inicial importado vira `saldoInicial`, não lançamento; reembolso de ART é receita `resultado`
  (entra no caixa; a margem do projeto continua tratando como abatimento).
- Transferência nativa ("Transferir entre contas", duas pernas com `transferenciaId` comum) fica para a
  F8; não é pré-requisito do motor.

## 3. Data-base do saldo

`fluxoCaixa().saldoTotal` (`caixa/queries.ts:81-129`) hoje é, exatamente:

```
S0 = Σ saldoInicial(c)  para c ∈ contas ativas
   + Σ σ(l)·v(l)        para l realizado, excluidoEm nulo, conta ativa
   + Σ σ(l)·v(l)        para l realizado, excluidoEm nulo, sem conta OU de conta inativa ("semConta")
```

sem filtro de data de realização. A F0 extrai a conta para a função pura `saldoBase(contas, realizados)`
e `fluxoCaixa` passa a chamá-la (mesmo número da Visão geral de hoje). **[T]**

Anomalias documentadas, **não corrigidas no MVP**, mostradas como aviso "o saldo pode divergir do banco":
- A1 — realizado com `dataConfirmacao > D0` já está em `S0`.
- A2 — movimento de conta inativa entra em `S0` sem o `saldoInicial` dela.
- A3 — realizado sem conta.

**Regra do motor:** parte de `S0` ("agora") e só recebe **pendentes** + programados + simulados. Um
lançamento realizado nunca vira evento; por construção nada é contado duas vezes. **[T]**
- Evento com data `D0` entra no fechamento de hoje ("hoje, ainda pendente"); `D0+1` em diante, dia a dia.
- Evento com data `< D0` vai para o grupo **Vencidos**, fora das datas; se o cenário o incluir, é aplicado
  no início de `D0`, antes dos eventos de hoje.
- Dentro do dia, saídas antes de entradas (para o "caixa antes/depois" de cada evento); o fechamento do
  dia não depende da ordem.
- Data do evento: `vencimento ?? data`. **[T]**

## 4. Caixinhas — fórmulas

Para cada caixinha `k`, na data `t`:

```
A_k(t) = Σ movimentos até t (alocação − liberação ± transferência entre caixinhas ± ajuste)
U_k(t) = Σ v(l), l realizado, caixinhaId = k, dataConfirmacao ≥ criação de k, dataConfirmacao ≤ t
R_k    = max(0, A_k − U_k)          reservado da caixinha
X_k    = max(0, U_k − A_k)          uso além do reservado (informativo: já saiu do livre)
R      = Σ R_k                      reservado
S      = S0                         caixa atual (saldo nas contas)
L*     = S − R                      livre bruto (com sinal)
L      = max(0, L*)                 dinheiro livre
Dsc    = max(0, R − S)              reserva descoberta
Identidade: S = R + L − Dsc  (sempre)                                    [T]
```

Projeção (evento pendente de saída `e` ligado à caixinha `k`, na ordem do tempo):

```
coberto(e)      = min(v(e), R_k antes de e)      R_k -= coberto(e)
semCobertura(e) = v(e) − coberto(e)
S               -= v(e)
⇒ L* cai só semCobertura(e)                                                [T]
```

- Entrada futura aumenta `S` e `L*`; não aloca em caixinha no real.
- **Alocação simulada (`ALOCAR`)** de uma entrada futura `e` com destinos `{k: a_k}`, `Σ a_k ≤ v(e)`: no dia
  de `e`, `S += v(e)` como sempre (a alocação **não** muda o caixa); `R_k += a_k` no reservado **simulado**;
  `L* += v(e) − Σ a_k`. Não cria `MovimentoCaixinha`, não muda saldo bancário nem o reservado real. Ao
  aplicar o cenário, `ALOCAR` é sempre "não aplicável": entrada ainda não recebida não se aloca no real
  (a alocação real acontece em Caixinhas depois do recebimento). **[T]** entrada futura de R$ 100 com
  alocação simulada de R$ 60: `S_H +100`, `R_H +60`, `L*_H +40`; sem a alocação, `L*_H +100`; entradas do
  motor não mudam; `validarAplicacao` marca o ajuste como não aplicável.
- Caixinha com mais reservado que o compromisso ligado: a sobra continua reservada depois do pagamento.
- Comprometido no horizonte: `C = Σ v(e)` saídas incluídas (sem transferência); `C_cob = Σ coberto`;
  `C_sem = C − C_cob`.
- Fim do horizonte: `S_H = S0 + E − C + T`; `R_H = R − C_cob + A_sim`; `L*_H = L*_0 + E − C_sem + T − A_sim`,
  onde `T` é o líquido das pernas de transferência (§2) e `A_sim` o total alocado por `ALOCAR` simulado. **[T]**

Testes obrigatórios:
- `S=100, R=40, compromisso 30 ligado`: depois do pagamento `R=10`, `S=70`, `L*=60` (livre inalterado). **[T]**
- `S=100, R=120`: `L=0`, `Dsc=20` — a tela mostra "Reservas descobertas R$ 20". **[T]**
- Com saldo negativo, `Dsc` também carrega o déficit (é o que mantém a identidade). Na tela, "Reservas
  descobertas" mostra só `min(Dsc, R)`; o que passa disso é déficit e aparece como déficit
  (F2, 2026-09-30: sem caixinhas e saldo de −R$ 700 mil, a tela dizia "Reservas descobertas R$ 700 mil").
- Compromisso 30 ligado a caixinha com 20: `coberto=20`, `semCobertura=10`, `R_k=0`, `L*` cai 10. **[T]**

### Como a F4 implementou (2026-10-01)

- **Tabelas:** `Caixinha` (`chave @unique`, regra `meta_fixa | compromissos_ligados`, meta, horizonte, ordem, ativo),
  `MovimentoCaixinha` (valor COM SINAL: soma = alocado; `Restrict` — caixinha com extrato só se arquiva) e
  `Lancamento.caixinhaId` (`SET NULL`). As 9 caixinhas iniciais nascem na migração, por `chave`.
- **Nada guardado do que se calcula:** reservado, usado e necessidade saem da leitura (`carregarCaixinhas`); o motor
  recebe `{ id, reservado }` por caixinha ativa. O `Dsc` desta spec continua sendo só o do motor.
- **Transferência** = duas pernas (−x na origem, +x no destino, mesmo `transferenciaId`), validadas contra o reservado
  da origem. Reservar nunca é recusado por falta de caixa: a tela mostra a "reserva descoberta" que resultaria.
- **`ALTERAR_CAIXINHA`** entra no cenário e no aplicar (agora `Observado.caixinhaId` participa da foto "antes";
  cenário salvo antes da F4 lê como "sem caixinha"). A caixinha-alvo é conferida (existe, ativa) antes da transação.
- **O resto de um parcial herda a caixinha** (`camposDoPlanejador`).
- Fica para a F5: regras de distribuição e "recebimentos a distribuir"; para a F6: o pró-labore ligado à caixinha.

### Como a F5 implementou (2026-10-01)

- **Regra = sugestão em basis points** (`RegraDistribuicao` + `RegraDistribuicaoItem`; `caixinhaId` nulo é a parte livre).
  A soma tem de fechar exatamente 10000; o botão Salvar só liga quando fecha ("Faltam 5% para fechar 100%").
  Nenhuma regra vem pronta: os percentuais do mock são exemplo, quem define é o dono. A primeira regra criada já nasce padrão.
- **Distribuir um recebimento** grava uma `DistribuicaoRecebimento` (única por lançamento) e uma alocação por caixinha;
  a parte livre não move nada e a distribuição nunca cria nem altera `Lancamento`. Pular também grava a linha (sai da fila).
  O resto do centavo vai para o último destino (`ratear`, soma sempre igual ao valor efetivamente recebido).
- **Fila:** receita realizada do resultado, sem a tag `reembolso-art`, recebida desde `distribuirDesde` (config
  `financeiro.liquidez`, nulo = nada é oferecido, para a fila não abrir com todo o histórico).
- **`ALOCAR`** simula a reserva de uma entrada futura pela regra escolhida (menu da entrada) e entra no motor por
  `alocacoesSimuladas`; nunca é aplicado ("a distribuição real acontece em Caixinhas, depois do recebimento").
  Teste do exemplo: entrada 100 com 60 alocados ⇒ caixa +100, reservado +60, livre bruto +40.

## 5. Pagamento × reprogramação (conservação)

Propriedade: para os mesmos valores, o saldo no fim do horizonte não depende de quando o evento se
realiza dentro dele — só o caminho muda. **[T]** para cada caso, com fotos antes/depois (`S0`, pendentes):

Todas as datas relativas a `D0`; reprogramação e vencimento são testados separados.

| Caso | Antes | Depois | Esperado |
|---|---|---|---|
| a) pendente em D+3, pago em D0 (antecipado) | `S0`, pendente em D+3 | `S0−v`, sem pendente | `S_H` igual; `S(D0..D+2)` fica `v` mais baixo |
| b) **reprogramação:** pendente em D+1 movido para D+6 | pendente em D+1 | pendente em D+6 | `S_H` igual; `S(D+1..D+5)` fica `v` mais alto; o evento aparece uma vez só |
| c) **vencimento:** pendente em D−3, pago em D0 | em Vencidos, aplicado no início de D0 | `S0−v`, sem pendente | `S(D0)` e `S_H` iguais; contado uma vez |
| d) realizado criado sem pendente | — | só em `S0` | nenhum evento; se houver pendente parecido (mesmo valor e favorecido, ±10 dias), aviso "possível duplicidade" |
| e) parcial de `p` num pendente `v` em D+2 | pendente `v` em D+2 | `S0−p` + pendente `v−p` em D+2 | `S_H` igual; o resto herda os campos do planejador que existirem (`camposDoPlanejador`: prioridade, confiança e `transferenciaId` na F0; caixinha na F4; sócio e recorrência na F6A) |

## 6. Ajustes de cenário

`AjusteCenario { id, cenarioId, ordem, tipo, alvo, antes Json, depois Json, criadoPorId, criadoEm,
aplicadoEm?, aplicadoPorId? }`, validado por união discriminada Zod.

`alvo`: `{ lancamento: id }` | `{ recorrencia: compromissoId, competencia }` (mês programado) |
`{ simulado: ajusteId }` (movimento criado por `INCLUIR`).

| Tipo | Alvo | `antes` guarda | `depois` guarda | Ao aplicar |
|---|---|---|---|---|
| `REPROGRAMAR_DATA` | lançamento ou programado | data, status, valor, `excluidoEm` | nova data | muda o vencimento se `programavel()`; programado nasce já com a data nova |
| `ALTERAR_PRIORIDADE` | despesa pendente | prioridade, status | prioridade | grava |
| `ALTERAR_CONFIANCA` | receita pendente | confiança, status | confiança | grava |
| `ALTERAR_CAIXINHA` | despesa pendente | caixinha, status | caixinha | grava |
| `ALTERAR_VALOR` | pendente ou programado | valor, status | valor | grava e **reavalia a alçada**: se o novo valor exige aprovação, vai para "aguardando aprovação" |
| `INCLUIR` | — | — | dados completos do lançamento | cria via serviço de `criarLancamento` (obrigatórios, alçada, casamento com previsão) |
| `EXCLUIR` | lançamento ou programado | status, valor | `{ efeito: "nenhum" }` (padrão) ou `"cancelar"` | "nenhum": só simulação, listado como informativo; "cancelar": regras de `cancelarLancamento` |
| `FORCAR_INCLUSAO` | lançamento fora do cenário | — | — | nunca aplicado (só simulação) |
| `ALOCAR` | entrada pendente | — | destinos e percentuais | nunca aplicado (alocação real só depois de recebido) |

- `programavel(e)` devolve o motivo quando não é: previsão do cronograma (a data segue o marco), taxa de
  ART (o sync regrava), aguardando aprovação, P1 com prazo legal (salário, imposto). Esses ficam fora do
  total "P3/P4 reprogramável". **[T]**
- Detecção de concorrência: no aplicar, compara o estado atual do alvo com `antes` nos campos
  **observados** (status, `excluidoEm`, data, valor, prioridade, confiança, caixinha). `updatedAt` não é
  usado (anexar um comprovante não pode invalidar o cenário). Para programado: continua sem lançamento e o
  compromisso tem o mesmo valor e dia. **[T]**
- Auditoria: `defineAction` audita o "aplicar cenário"; cada lançamento alterado ganha um `logAudit`
  próprio com `antes`, `depois` e `cenarioId`, gravado **depois** do commit.

## 7. Aplicar = tudo ou nada

1. Fora da transação: lê o estado atual de todos os alvos e roda `validarAplicacao(estado, ajustes)`
   (pura). Qualquer divergência ⇒ `ActionError` listando **todas** as divergentes; nada é gravado. **[T]**
2. Dentro de **um** `prisma.$transaction` interativo, com `await` em sequência (nunca `Promise.all` no
   `tx`): cada escrita é `updateMany` com `where` = id + campos de `antes` + `excluidoEm: null`; `count ≠ 1`
   ⇒ lança e desfaz tudo (corrida entre a validação e a escrita). `INCLUIR` usa
   `criarLancamentoNoTx(tx, dados, usuario)`, extraído de `criarLancamento` na F3 (a action passa a usá-lo).
3. Depois do commit: auditoria por lançamento, notificações de alçada, cenário marcado "aplicado".
- Teste obrigatório: cenário com 3 ajustes, 1 obsoleto ⇒ nenhum aplicado (puro **[T]** e no
  `smoke:planejador` com banco).
- Teste obrigatório de **falha de regra dentro da transação**: 3 ajustes válidos na validação, o 3º falha
  ao gravar (ex.: `INCLUIR` recusado pela regra de campos obrigatórios, ou o alvo realizado entre a
  validação e a escrita) ⇒ os 2 primeiros são revertidos e o banco fica como antes. Unitário com um `tx`
  falso que registra escritas e descarta tudo quando o orquestrador lança (garante que ele não engole o
  erro nem continua) **[T]**, e no `smoke:planejador` com banco real (garante o rollback).

### Como a F3 implementou (2026-10-01)

- **Escopo do aplicar (plano I7):** vão para o real `REPROGRAMAR_DATA` (grava `vencimento`),
  `ALTERAR_PRIORIDADE`, `ALTERAR_CONFIANCA` e `INCLUIR` com categoria. `ALTERAR_VALOR` não existe ainda
  (nem na simulação); `ALTERAR_CAIXINHA` chega com as caixinhas (F4) e `ALOCAR` com a distribuição (F5).
  `EXCLUIR` só tem o efeito `"nenhum"` — "cancelar ao aplicar" fica para quando houver pedido.
- **Um formato só** (`liquidez/ajustes.ts`): o ajuste de lançamento leva `antes` (campos observados, valores
  GRAVADOS) e `rotulo` (descrição ao simular). Na tabela `ajuste_cenario`: `tipo` (texto, validado pela
  união Zod), `alvo`, `antes`, `depois`, `lancamentoId` (FK `SET NULL`).
- **Vários ajustes no mesmo lançamento = uma escrita** (senão a segunda acharia a data já mudada pela
  primeira e desfaria tudo). Rascunho de antes da F3 sem `antes`: a condição é o estado lido na validação.
- **Com cenário aberto**, aplicar troca os ajustes pendentes do cenário pela lista da tela e marca
  `aplicadoEm` nos que foram, na mesma transação. Ajuste aplicado sai da simulação ao reabrir (contaria
  duas vezes) e vira histórico.
- **Categoria do `INCLUIR`** é conferida antes da transação (existe, ativa, do mesmo tipo).
- Prova no banco: `smoke:planejador` (obsoleto barra tudo; obrigatório no 3º desfaz os dois primeiros;
  corrida "pago entre validar e gravar" desfaz; caminho feliz audita por lançamento e marca o cenário).

## 8. Fora do resultado

Definição: `foraDoResultado` = **não participa do resultado econômico (DRE)**; continua sendo entrada ou
saída de caixa.

- Pró-labore (natureza `resultado`, DFC operacional) ⇒ despesa na DRE + saída de caixa + KPI de despesa. **[T]**
- Distribuição de lucros (natureza `fora_do_resultado`, DFC financiamento) ⇒ saída de caixa + DFC
  financiamento; **não** é despesa, **não** entra na DRE nem no KPI de despesa. **[T]**
- Transferência ⇒ nenhum dos dois (§2). **[T]**
- Função pura única `classificarMovimento(categoria)` em `modules/financeiro/natureza.ts`; toda consulta
  que soma receita/despesa passa por ela. Lista a revisar na F6C: `relatorioDRE` (também o KPI de
  despesa de `/financeiro` e o DRE do Estúdio), `linhasDREPeriodo`, `relatorioDREComparativo`,
  `serieMensalResultado`, `evolucaoMargemMensal`, `totaisPorCategoria`/`despesasPorCategoria`,
  `evolucaoMensalCategorias`, rateio de `rentabilidadePorProjeto`, `fechamento/queries.ts`,
  `documentos/fontes.ts`, resultados do livro caixa (`lancamentos-view.tsx:345-358`), `relatorioDFC`
  (tirar transferências), `agingReport` e `kpisHome().receitaPrevista` (tirar pernas de transferência).
  `orcamentoPorCategoria`: decidir na F6C. Teste-guarda que acusa consulta nova sem o filtro. **[T]**

### Como a F6C implementou (2026-10-01)

- **Dois pedaços de `where`** em `natureza.ts` (puro): `SO_RESULTADO` e `SEM_TRANSFERENCIA`. Aplicados em
  `relatorioDRE`, `linhasDREPeriodo`/comparativo, `serieMensalResultado`, `evolucaoMargemMensal`,
  `totaisPorCategoria`/`despesasPorCategoria`, `evolucaoMensalCategorias`, `resultadoPorProjeto`,
  `rentabilidadePorProjeto`, `orcamentoPorCategoria`, `indicadores`, `fechamento/queries.ts`,
  `documentos/fontes.ts` e nos KPIs do dashboard (`SO_RESULTADO`); em `relatorioDFC`, `agingReport` e
  `balancoGerencial` (`SEM_TRANSFERENCIA`).
- **`orcamentoPorCategoria`: decidido** — `SO_RESULTADO`. O orçamento planeja resultado; distribuição de
  lucros e transferência não são gasto a orçar.
- **Teste-guarda** `relatorios/natureza-nas-consultas.test.ts`: toda consulta de dinheiro nesses arquivos
  precisa de um dos filtros ou de um comentário `natureza-ok:` com o motivo.
- **Livro caixa** passou a separar transferência pela NATUREZA (antes era pelo nome da categoria) e mostra
  "Fora do resultado" como linha própria: entra em Entradas/Saídas, sai do Resultado.

## 9. Pró-labore recorrente × lançamento manual

- Vínculo: um lançamento está **vinculado** a um mês programado quando tem `recorrenciaOrigemId` e
  `competencia` desse compromisso (par único no banco). Mês vinculado nunca é projetado nem gerado.
- O vínculo nasce: pela geração automática; ao criar lançamento manual quando existe **exatamente um**
  candidato (mesmo sócio, mesma categoria, mesma competência, sem vínculo) — o formulário propõe, a pessoa
  confirma; ou pela ação "Vincular à recorrência".
- Com vínculo, **vale o valor do lançamento**; diferença vira aviso, nunca correção automática:

| Recorrência | Manual | Projeção conta | Aviso |
|---|---|---|---|
| 6.000 | 6.000 vinculado | 6.000 uma vez | nenhum |
| 6.000 | 5.000 vinculado | 5.000 | "R$ 1.000 abaixo da recorrência" com "Gerar complemento" ou "Está certo" |
| 6.000 | 8.000 vinculado | 8.000 | "R$ 2.000 acima da recorrência" com "Está certo" |
| 6.000 | qualquer, **sem** vínculo | os dois | "Possível pró-labore em dobro em out/2026" com "Vincular" |

Sem vínculo o motor conta os dois de propósito: superestima a saída (lado seguro) e o aviso não deixa
passar. **[T]** para as quatro linhas.

### Como a F6A implementou (2026-10-01)

- **Tabelas:** `CompromissoRecorrente` (descrição, valor, dia, competência inicial/final, categoria, sócio,
  caixinha, prioridade, antecedência, ativo) e, em `Lancamento`, `socioId`, `recorrenciaOrigemId` e
  `recorrenciaCompetencia` com `@@unique` no par — é dele que vem a idempotência, não de um lock.
- **Projeção:** `eventosProgramados` olha do 1º do mês corrente até o fim do horizonte, no teto de `⌈H/28⌉+1`
  competências. Mês vencido do mês corrente sem lançamento vai para Vencidos; mais atrás que isso é
  trabalho do gerador (que recua até 12 competências).
- **Mês programado não é lançamento:** no menu do planejador não aparecem prioridade, confiança, caixinha,
  distribuição nem "abrir"; "simular outra data" fica desabilitado com o motivo. Tirar/incluir na simulação
  continua valendo (é só simulação).
- **Geração** pelo job diário (06:00) e pelo botão "Gerar agora", com a mesma função. O lançamento nasce
  `previsto` e NÃO passa pela alçada: o valor foi aprovado ao cadastrar o compromisso.
- **Vínculo manual** por ação explícita, inclusive a partir do aviso de dobro no planejador. Candidato =
  mesma categoria, mesmo sócio, competência vigente e livre.
- Fica para a F6B: distribuição e adiantamento por sócio (a coluna `Lancamento.socioId` já existe).

### Como a F6B implementou (2026-10-01)

- **Categorias por migração, achadas pela `chave`:** `distribuicao_socios` (pai, no próximo código de
  nível 1 livre — o import do Meu Dinheiro costuma ocupar o "3"), `distribuicao_lucros` e
  `adiantamento_lucros`, todas despesa, `fora_do_resultado` e DFC `financiamento`.
- **Divisão por `Socio.percentual`** (`socios/calculo.ts`, puro): basis points, centavo que sobra no
  último sócio, e recusa quando os ativos não fecham 100% (a tela de Sócios já mostra a soma).
- **Cria uma conta a pagar PREVISTA por sócio**, com `Lancamento.socioId`, e segue o fluxo normal de
  pagamento. Nada de `RetiradaSocio` aqui — ela continua congelada como histórico (F6D).
- Entrada pela aba Sócios de Cadastros ("Distribuir lucros" e "Adiantar lucros"); o planejador continua
  simulando a distribuição sem gravar nada.

## 10. Simulação × real

- Todo evento de simulação (movimento incluído, distribuição, entrada, ajuste de data) é **virtual**: vive
  no estado da tela (rascunho em `sessionStorage`) ou num cenário salvo. **[T]** o motor puro não recebe
  cliente de banco.
- Simular **nunca** cria nem altera `Lancamento`, `MovimentoCaixinha` ou `CompromissoRecorrente`.
- Só "Aplicar ao financeiro" (F3) grava, com `financeiro:gerir`, pelas regras do §7; inclusão real passa
  pelo serviço de `criarLancamento` e todas as validações dele.

## 11. Cenário salvo

- Guarda **só a intenção**: premissas (eixos, horizonte) e ajustes. Não guarda séries, saldos nem
  indicadores.
- Ao abrir, recalcula sobre os dados de hoje + ajustes. Cada ajuste mostra um estado: válido; obsoleto
  ("vencimento mudou de 10/10 para 12/10"); alvo inexistente; já aplicado. **[T]** `estadoDoAjuste`.
- Ajuste obsoleto com alvo existente continua simulado (a intenção vale), marcado. Para aplicar, a pessoa
  revê e usa "Atualizar ajustes" (regrava o `antes`).
- `antes` só serve para validar no momento de aplicar.

## 12. Horizonte

- Opções na tela: 30 (padrão), 60, 90 e 180 dias; data final livre entre 7 e 180 dias. Sempre começa em
  `D0`. Config `financeiro.liquidez` (ConfigSistema) validada por Zod: `reservaMinima` em centavos (padrão
  0 = sem alerta até alguém configurar), `horizontePadraoDias ∈ {30, 60, 90, 180}` (padrão 30),
  `diasParaIncerta` entre 1 e 365 (padrão 30).
- Recorrência expande só meses com vencimento em `[D0, D0+H−1]`, no máximo `⌈H/28⌉ + 1` por compromisso;
  mês programado já vencido sem lançamento (gerador não rodou) vai para Vencidos com aviso. **[T]**
- Gráfico diário até 90 dias; acima disso a agenda agrupa por semana depois do 30º dia.

## 13. Dias de caixa

```
m  = Σ saídas realizadas de natureza resultado nos últimos 90 dias ÷ 90
DC = floor(S0 ÷ m)
```

Resultado é união, nunca número solto: `{ dias: n }` | `{ zero }` | `{ indisponivel, motivo }`. **[T]**
- Menos de 30 dias de histórico ⇒ indisponível, "histórico insuficiente (menos de 30 dias)".
- `m = 0` ⇒ indisponível, "sem saídas nos últimos 90 dias".
- `S0 ≤ 0` ⇒ zero, "0 dias" em destaque.
- `DC > 365` ⇒ "mais de 365 dias".
- Base é o caixa atual, não o livre: as caixinhas existem para pagar parte dessas saídas; dividir o livre
  pelo gasto total contaria a mesma saída duas vezes. Falta de livre aparece como reserva descoberta (§4).
- **Pergunta que o indicador responde:** "por quantos dias o caixa atual cobre a média histórica de
  saídas". Não responde "por quantos dias o dinheiro livre cobre as saídas". Na tela, o subtítulo diz
  isso com essas palavras, e o indicador fica sempre separado do cartão de Dinheiro livre.
- Outros números nunca exibem `NaN`/`Infinity`: impacto % do evento usa o caixa antes do evento como base
  e mostra "—" quando ele é ≤ 0; "quanto preciso receber" é acumulado por data: primeiro rompimento
  (data e valor) e total até o pior dia. **[T]**

## 14. F6 em checkpoints

A F6 (Opus) fecha em quatro commits independentes, cada um com testes verdes e relato curto:
- **F6A** recorrência e pró-labore: `CompromissoRecorrente`, projeção no motor, geração idempotente (job
  diário + botão), vínculo manual (§9).
- **F6C** fora do resultado: filtro central + teste-guarda em toda a lista do §8 (antes da F6B, para a
  distribuição nascer já fora da DRE).
- **F6B** distribuição e adiantamento: categorias com chave, criação pelo planejador e por Cadastros,
  divisão por `Socio.percentual`.
- **F6D** folha: `fecharFolha` quita o pendente da competência; `RetiradaSocio` congelada como histórico.

### F6D como ficou (2026-10-01)

- **Quem quita e quem não.** Só a folha `mensal` quita (a de 13º é outra despesa, com folha própria no
  mesmo mês) e só candidato `previsto`: quitar um `aguardando_aprovacao` pagaria por cima da aprovação, então
  ele fica em aberto e entra no aviso. Entre os candidatos, o lançamento da recorrência DAQUELA competência
  ganha; sem vínculo, um candidato sozinho é quitado; **dois sem vínculo não são adivinhados** — o fechamento
  cria o lançamento dele e o `aviso` diz o que ficou em aberto, para uma pessoa resolver.
- **Decisão pura** em `rh/folha/quitacao.ts` (`escolherPendenteDaFolha`, `avisoDaQuitacao`,
  `desfazerQuitacao`); o I/O em `rh/folha/fechamento-service.ts`, chamado pela action e pelo smoke (as
  actions exigem sessão). A gravação é `updateMany` condicionado a `status: "previsto"`: se alguém pagou ou
  cancelou a conta entre ler e gravar, nada é sobrescrito e o fechamento cria o lançamento dele.
- **Reabrir** desfaz pelo que ficou gravado na folha (`lancamentoReaproveitado`,
  `lancamentoValorPrevisto`): conta a pagar que já existia volta ao `previsto` com o valor de antes; só o
  lançamento que o fechamento criou é apagado. Apagar sempre levaria embora a conta a pagar de outra pessoa.
- **Categoria pela chave** (`despesa_folha_clt`, com `codigo: "2.03"` só como reserva): `codigo` é editável
  em Cadastros (C1).
- **`RetiradaSocio` congelada:** o formulário saiu da aba Sócios (a lista virou histórico rotulado, com
  remoção para corrigir) e `criarRetiradaSocio` recusa dizendo onde se faz agora — pró-labore em Compromissos
  recorrentes, lucros em Distribuir/Adiantar. A ação fica no lugar porque uma aba aberta de antes ainda
  poderia chamá-la.

## 14-A. F7 como ficou (2026-10-01)

- **Uma projeção só.** `projecaoCaixa` (semanal) e `FluxoProjecaoChart` foram APAGADOS: a Visão geral
  (`liquidez/torre.ts` + `torreDeControle()`) e o fluxo diário (`caixa/diario.ts` + `fluxoDiario()`) rodam
  `projetar()`. O risco nº 1 do plano (dois números de caixa em telas diferentes) deixa de existir por
  construção, não por disciplina.
- **Visão geral:** posição de hoje (caixa = reservado + livre, com a reserva mínima marcada), cinco
  indicadores, gráfico Provável × Conservador, "Precisa de atenção", caixinhas e próximos 7 dias; a DRE, o
  aging e os atalhos seguem abaixo. A previsão do cronograma fica FORA das duas linhas (I2) e aparece como
  alerta com "Incluir na simulação".
- **Fluxo diário (I14):** antes de hoje o realizado por `dataConfirmacao`, de hoje em diante o previsto do
  cenário escolhido; agrupamento por dia, semana (começando na segunda) ou mês; janela de passado de 15, 30 ou
  60 dias. O acumulado do passado é reconstruído DE TRÁS PARA A FRENTE a partir do caixa de hoje, então as
  duas metades encostam exatamente em `saldoBase()`. Perna de transferência não é entrada nem saída.
  Filtro por conta NÃO entra aqui: projeção por conta está na lista de "depois".
- **Números de destaque sem centavos** (como o mock): `brlCInteiro`. Tabela e dica do gráfico mantêm os
  centavos — uma tabela que esconde centavo não fecha com o extrato.
- **Pagamentos em lote (D2/I13):** a mesa antiga virou "Pagamentos em lote" e cada "cenário" dela virou
  "lote", só nos rótulos; rota `/financeiro/planejamento` e identificadores ficam. O planejador ganhou o
  atalho para ela (só com `financeiro:gerir`).
- **Smoke da previsão migrado:** `smoke:previsao-recebimento` não lê mais a projeção semanal — confere que a
  previsão é evento Estimada do motor, entra no cenário "estimadas", fica fora do Provável e, vencida, é
  aplicada hoje.

## 14-B. F8 como ficou (2026-10-01)

- **Cabeçalho novo e subnavegação** em Contas a pagar e receber, Lançamentos e na mesa de um lote
  (Pagamentos em lote): o título antigo saiu, `CabecalhoPagina` é o primeiro elemento e a `NavFinanceiro`
  vem logo depois. Na mesa, ficam à vista só a ação que avança o lote e Salvar; adicionar contas, voltar a
  rascunho, reabrir e cancelar foram para o `...` (cancelar com confirmação).
- **Linguagem do ADR-0007 no livro caixa:** "Confirmados" virou "Pagos e recebidos" e a coluna do painel
  por conta virou "Realizado". Contas a pagar e receber já dizia "Pago."/"Recebido.".
- **Abas dos Resultados** (`NavResultados` + `ResultadosTabs`): DRE · Rentabilidade · DFC · Balanço ·
  Orçamento como faixa de abas dentro das cinco telas, com `aria-current`. A lista vem do servidor com o
  mesmo gate da subnavegação (I11): quem não tem `financeiro:resultados` não vê aba que daria 403.
- **Menus de contexto que faltavam** (ADR-0002, descritores puros testados):
  - Aprovações (`aprovacao/acoes.ts`): aprovar, rejeitar e abrir no livro caixa; aprovar em lote. O único
    motivo de desabilitar é a alçada por faixa, com a MESMA frase de `aprovarLancamento`
    (`lancamentosAguardando(user)` calcula `semAlcada` pela regra do servidor). Nenhuma regra nova foi
    inventada na tela. Rejeitar abre diálogo com o motivo (o `window.prompt` saiu — o lote não saberia
    preenchê-lo); por isso o lote só aprova.
  - Conciliação (`conciliacao/acoes.ts`): conciliar com a sugestão (submenu quando há várias), criar
    lançamento (desabilitado sem categoria) e ignorar com confirmação — o botão "Ignorar" à vista passa pela
    mesma confirmação.
- **Já estavam feitos pela F1** (conferido, nada a mudar): gráficos com texto alternativo, cores por token,
  `aria-label` nos chevrons do período. Os hex que sobraram estão só no CSS de impressão.
- **Documentos e Cadastros (fechado depois, 2026-10-01):** Documentos ganhou menu de contexto e `...`
  (`documentos/acoes.ts`: baixar, gerar parcelas, excluir) — excluir apagava o arquivo guardado SEM
  confirmação; agora confirma e diz quantos lançamentos perdem o vínculo. Em Cadastros as listas de contas,
  fornecedores, plano de contas e nomes simples só têm editar (uma ação: sem menu, pela ADR); o que faltava
  era confirmação em Sócios — remover um sócio apagava em cascata o histórico de retiradas com um clique.

## 14-C. F9 como ficou (2026-10-01)

- **Manual** (`docs/manual/financeiro/`): Visão geral reescrita como torre de controle; páginas novas
  `planejador.md`, `fluxo-de-caixa.md`, `caixinhas.md`, `socios-e-recorrentes.md` e
  `pagamentos-em-lote.md`; Contas e aging, Aprovações, Conciliação, Lançamentos, Relatórios, Contrato por
  entrega e Folha CLT ganharam o que mudou. `search-index.json` atualizado à mão (não tem gerador): as
  entradas existentes só GANHARAM palavras, nenhuma foi perdida.
- **Novidades** com a entrada do planejador; **guia de uso** do Financeiro sem a "semana da projeção".
- **Glossário** (`CONTEXT.md`): Previsão do cronograma, Quitar o previsto e Retirada de sócio (histórico).
- Mensagens da mesa e das actions de lote falam "lote", não "plano".
- Verificação final: suíte completa, lint, tsc (app e server), build, `smoke:planejador`,
  `smoke:previsao-recebimento`, `smoke:onda2`, `smoke:onda3efg`, e as páginas novas abertas no `/ajuda`.

## 14-D. Revisão de UX da Visão geral (2026-10-02)

Pedido do dono: "os botões estão todos lá embaixo". Medido no Chrome (1366, menu aberto): a página tinha
4.067 px e a grade de 17 atalhos começava em 3.368 px. Depois: 2.451 px.

- **Grade de atalhos saiu** — o mock aprovado não tem, e repetia a barra do Financeiro. A única tela que só
  existia nos atalhos, **Produção**, entrou no "Mais" com gate próprio (`folhaPj` → `financeiro:folha_pj`),
  e a página da Produção ganhou a barra.
- **Banner vermelho de vencidos saiu** — "Precisa de atenção" já diz o mesmo, com o atalho certo.
- **Seletor de período desceu** para junto de "Resultado de …": ele só muda o resultado, e no cabeçalho
  parecia mudar o caixa. O cabeçalho ficou com duas ações (Abrir planejador, Guia de uso).
- **Resultado em um card** (Receitas, Despesas, Resultado com margem, Distribuído aos sócios) no lugar de
  quatro KPIs + o card DRE, que repetiam os mesmos três números (e um deles era o caixa de novo).
- **Defeitos corrigidos:** botões dos cards caíam numa barra larga sob o título (`CardAction` em vez de
  `flex-row` num cabeçalho em grid); a contagem de avisos parecia um campo de texto (virou selo); o valor
  em "Próximos 7 dias" era cortado fora da tela (tabela virou lista com o valor fixo à direita); "R$" e o
  número quebravam em linhas diferentes no saldo por conta; rótulos em caixa-alta espaçada quebravam em
  duas linhas (frase normal agora); "=" e "+" soltos no celular (somem abaixo de `sm`).
- **Menos ruído:** "Precisa de atenção" mostra 4 avisos e guarda o resto em "Mais N avisos" (`<details>`,
  sem JavaScript); caixinhas sem reserva nem compromisso viram uma linha de contagem; barra de progresso
  só quando há o que cobrir; sem reserva mínima, aparece "Definir no planejador".

## 15. Testes por arquivo (`src/modules/financeiro/liquidez/`)

| Arquivo | Cobre |
|---|---|
| `saldo-base.test.ts` | §3: fórmula de `S0`, semConta, conta inativa, realizado com data futura sinalizado, soft delete fora |
| `eventos.test.ts` | §1, §3, §5: só pendentes viram evento; status × confiança; confiança efetiva e `incerta` por atraso; `vencimento ?? data`; Vencidos |
| `transferencias.test.ts` | §2: duas pernas no mesmo dia; em dias diferentes; perna sem contraparte; contraparte fora do horizonte; contraparte já realizada; `E` e `C` não mudam; `S_H = S0 + E − C + T` |
| `motor.test.ts` | §3, §5, §16: D0 e dias seguintes, ordem no dia, horizonte, eixos do cenário, conservação nos casos a–e (datas relativas a D0), identidades do modelo mental (exemplo 100/40/+43/−72 ⇒ 71 e margem 41), entradas congeladas não são mutadas |
| `caixinhas.test.ts` | §4: fórmulas, 100/40/30, 100/120, compromisso maior que a caixinha, entrada futura não reserva, `ALOCAR` 60 de 100 (`S +100`, `R +60`, `L* +40`), `S = R + L − Dsc` |
| `ajustes.test.ts` | §6, §10, §11: esquema por tipo, efeito de cada tipo na projeção, `FORCAR_INCLUSAO`/`ALOCAR` só simulam, `estadoDoAjuste` |
| `aplicacao.test.ts` | §6, §7: `validarAplicacao` com 3 ajustes e 1 obsoleto ⇒ nada; `ALOCAR` não aplicável; campos observados; `programavel()`; `ALTERAR_VALOR` reavalia a alçada; orquestrador com `tx` falso lança no 3º ajuste e não segue |
| `recorrencia/calculo.test.ts` (fora de `liquidez/`) | §9, §12: expansão limitada ao horizonte, as quatro linhas de pró-labore × manual, mês vencido sem lançamento |
| `indicadores.test.ts` | §13: dias de caixa nos quatro casos, impacto %, "quanto preciso receber" acumulado, nada de `NaN`/`Infinity` |

Fora da pasta: `modules/financeiro/natureza.test.ts` (§8), teste-guarda das consultas de resultado (F6C),
`lancamentos/parcial.test.ts` (`camposDoPlanejador`, §5e), `smoke:planejador` (banco: `saldoBase` = número
da Visão geral, id excluído recusado, parcial, pareamento de transferência; a partir da F3, aplicar atômico
com ajuste obsoleto e com falha de regra no 3º ajuste).

Pilares que a F0 entrega testados (os demais arquivos entram nas fases que os usam):
1. **`S0` correto** — `saldo-base.test.ts` + smoke comparando com `fluxoCaixa().saldoTotal`.
2. **Motor determinístico** — `eventos`, `transferencias`, `motor`, `caixinhas`, `indicadores`, `natureza`:
   mesma entrada, mesma saída, com entradas, compromissos, caixinhas, confiança e prioridade.
3. **Invariantes de caixa** — nenhum realizado vira evento, nenhuma perna ou evento contado duas vezes,
   nenhuma dupla redução por caixinha (`L*` cai só `C_sem`), e o motor não tem I/O nem muta a entrada
   (teste-guarda de import: nada de `prisma`/`server-only` nos arquivos puros; entradas congeladas).
   `ajustes.test.ts` e `aplicacao.test.ts` entram na F3, com a persistência.

## 16. Modelo mental: caixa × reservado × livre

Requisito de produto. A tela nunca junta estes números numa conta só:

```
HOJE
  Caixa atual                    S0                (nas contas)
− Reservado em caixinhas         R
= Dinheiro livre hoje            L                 (+ "Reservas descobertas Dsc", se houver)

PROJEÇÃO ATÉ D0+H−1
  Caixa atual                    S0
+ Entradas                       E
− Compromissos                   C
     cobertos por caixinha       C_cob   (já estão dentro de C: não se subtraem de novo)
     sem cobertura               C_sem
± Transferências (líquido)       T       (0 quando as duas pernas estão no horizonte; linha só aparece se ≠ 0)
= Saldo projetado                S_H = S0 + E − C + T
  Reserva mínima                 Rmin              (compara com o saldo, não com o livre)
  Margem até a reserva           S_H − Rmin        (e no pior dia: min S(D) − Rmin)
  Livre projetado                L*_H = L*_0 + E − C_sem + T − A_sim   (A_sim: alocação simulada, §4)
```

- A reserva mínima compara com o **saldo nas contas**; a reserva de emergência é caixinha, está dentro de
  `R` e nunca se soma à reserva mínima (D4). Caixa 100, emergência 50, mínima 30 ⇒ piso 30, não 80. **[T]**
- O gráfico traz duas linhas: saldo nas contas e livre bruto `L*` (abaixo de zero = descoberto), mais a
  reserva mínima como referência.
- Mudanças no mock pedidas por este modelo: painel "Impacto da programação" em dois blocos (Hoje e
  Projeção, como acima), linha "Livre projetado", "Reservas descobertas" quando `R > S0`, e vocabulário do
  §1 ("Pago"/"Recebido", "Confirmada pelo cliente").
