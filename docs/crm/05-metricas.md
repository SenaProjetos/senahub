# 05 — Dicionário de métricas do Comercial

**Data:** 2026-08-22 · **Tarefa:** F6.1 (bloqueante da Fase 6) · **Modelo:** Opus · **Branch:** `dev`

Este arquivo é a **fonte única** das fórmulas do módulo Comercial. Toda tela de métrica
(F6.5 Home, F6.7 Inteligência) e o módulo puro `metricas.ts` (F6.3) implementam o que está aqui —
não o contrário. **Métrica que não está definida aqui não vai para a tela**: se faltar, o caminho
é acrescentar aqui primeiro, não inventar na query.

> **Por que isto vem antes de qualquer gráfico.** Dashboard sobre fórmula ambígua não erra
> ruidosamente — erra em silêncio, e alguém decide com base no número errado. As seis ambiguidades
> do §2 são todas casos em que duas leituras defensáveis dão respostas diferentes para a mesma
> pergunta de negócio.

---

## §1 — Regras transversais

Valem para **todos** os indicadores. Onde um indicador diverge, ele diz explicitamente.

### 1.1 Soft delete é responsabilidade da query

A extensão do Prisma (`lib/prisma.ts`) filtra `excluidoEm: null` automaticamente **só no client do
Prisma**. Todo SQL de referência deste documento roda cru — e SQL cru **não passa pela extensão**.
Por isso todo `FROM cliente|lead|negociacao` aqui carrega `AND x."excluidoEm" IS NULL` escrito à
mão. Omitir faz o número do relatório divergir do número da tela, no documento cuja função é ser
o árbitro entre os dois.

`Proposta` e `Projeto` **não têm** soft delete — não levam o filtro.

### 1.2 Empresa fundida resolve para a sobrevivente

`Cliente.fundidoEmId` aponta para a empresa sobrevivente de uma fusão (§4 de `03-migracao.md`). A
linha fundida **continua existindo** — a fusão arquiva, não apaga. Qualquer métrica **por empresa**
(ticket por empresa, novo × recorrente, recompra) precisa resolver para a sobrevivente antes de
contar, senão a mesma empresa entra duas vezes:

```sql
COALESCE(c."fundidoEmId", c.id) AS empresa_id
```

Métricas por **negociação/proposta/contrato** não precisam disso — a fusão não duplica esses
registros.

### 1.3 Período: cada indicador declara o campo de data que o governa

Não existe "o campo de data do CRM". Um contrato fechado em março a partir de uma prospecção de
janeiro entra em março ou em janeiro conforme a pergunta. Cada bloco do §3 nomeia o seu campo, e
o §2.1 (coorte × eventos) explica a consequência de leitura.

Todo intervalo é **fechado no início, aberto no fim** — `>= inicio AND < fim`. Evita o clássico
buraco/duplicata de fim de mês com `DateTime`.

### 1.4 Nulos: ausência nunca vira zero

Regra do P17 item 9, promovida a regra geral: **métrica sem base de cálculo devolve `null`, e a
tela mostra estado vazio explicando o motivo** — jamais `0`, `0%` ou uma estimativa. `0%` de
conversão e "não houve nenhuma proposta no período" são fatos diferentes, e a tela que os confunde
faz o time desconfiar de tudo.

Na prática, para F6.3: toda função de taxa/média devolve `number | null`, com `null` quando o
denominador é zero.

### 1.5 O relógio entra por parâmetro

Nenhuma função de `metricas.ts` (F6.3) lê `new Date()` — a data de referência é argumento. É o que
torna o teste possível com valores fixos calculados à mão, e é o mesmo padrão já usado em
`validade.ts` (F5.6) e exigido de novo em `regras.ts` (F7.1).

### 1.6 Datas civis são de Recife

Quando uma métrica compara "hoje" com uma data (follow-up atrasado, proposta vencendo), a
comparação usa `America/Recife` via `validade.ts` (F5.6) — nunca o fuso do servidor nem um offset
`-3` fixo.

---

## §2 — As ambiguidades, resolvidas

As seis que o P15 mandou resolver, mais três que apareceram ao conferir contra o schema real.

### 2.1 Conversão: por **coorte de criação** ✅

**Escolhido: coorte.** Uma negociação criada em janeiro que fecha em março conta **em janeiro**,
tanto no numerador quanto no denominador.

**O efeito na leitura, que precisa ser dito na tela:** a coorte do mês corrente é sempre
**pessimista** — parte dela ainda não teve tempo de fechar. A conversão de janeiro só estabiliza
quando toda a coorte de janeiro tiver desfecho. Uma coorte recente aparecendo pior que a antiga é
o comportamento **esperado**, não uma queda de desempenho.

**Por que não por eventos:** contar "propostas enviadas em março ÷ negociações criadas em março"
divide dois conjuntos que não se referem às mesmas oportunidades. Num mês de pico de prospecção a
taxa despenca sem nada ter piorado; num mês de seca ela dispara. É a métrica que engana com mais
frequência.

**Consequência para a tela (F6.7):** toda taxa de conversão exibe a janela da coorte e uma marca
de "coorte ainda aberta" enquanto houver registro da coorte sem desfecho.

### 2.2 Ticket médio: **por contrato**, com o "por empresa" ao lado ✅

**Escolhido: por contrato** — `valor contratado ÷ nº de contratos`. É o número que responde
"quanto vale um negócio nosso", que é o uso real (dimensionar proposta, comparar canal).

O **por empresa** (`valor contratado ÷ nº de empresas distintas`) é uma métrica diferente, de
concentração de carteira, e fica na análise novo × recorrente do §3.14 — onde importa saber que
uma empresa com 4 contratos não é o mesmo que 4 empresas com 1.

Os dois divergem exatamente na medida em que há recompra; exibir só o primeiro esconde
concentração, exibir só o segundo esconde o tamanho típico do negócio.

### 2.3 Cliente novo × recorrente: marco = **1º contrato**, janela = **retroativa infinita** ✅

- **Marco:** a empresa vira "cliente" no **primeiro contrato fechado** (`Negociacao.estagio =
  CONTRATADO`), não na criação do cadastro nem na primeira proposta. É o marco que o próprio
  sistema já materializa: `calcularStatusComercial(temPropostaAceita, override)` leva
  `Cliente.status` a `CLIENTE` no aceite (ADR-08, F5.9).
- **Janela:** **infinita para trás**. Um contrato é "de cliente novo" se **nenhum** contrato
  anterior existir para aquela empresa (resolvida pela fusão, §1.2) — não "nenhum nos últimos 24
  meses". Escritório de engenharia tem ciclo longo: um cliente de 2019 que volta em 2026 é
  recorrente, não novo. Tratá-lo como novo inflaria "conquistas" com quem já era da casa.
- **Consequência conhecida e aceita:** a base começou em 2026 dentro deste sistema. Contratos
  anteriores que não estão no banco fazem alguns recorrentes parecerem novos. É limitação de
  dados, não de definição — registrada no §5.

### 2.4 Canceladas e em espera **entram** no denominador da conversão ✅

**Escolhido: entram.** O denominador da conversão de uma coorte é **toda** a coorte —
`CONTRATADO`, `PERDIDO`, `CANCELADO`, `EM_ESPERA` e as ainda ativas.

Tirar `CANCELADO`/`EM_ESPERA` do denominador é escolher não contar os desfechos incômodos: a taxa
sobe sem nada ter melhorado, e o número perde a única propriedade que interessa — ser comparável
entre períodos e entre canais. Um canal que gera muito cancelamento **é** um canal pior, e a
métrica tem que dizer isso.

`EM_ESPERA` e as ativas ficam no denominador como **coorte ainda aberta** (§2.1) — contam, e a
tela marca que o número ainda vai mudar.

### 2.5 Pipeline aberto **inclui** `EM_ESPERA` ✅

**Escolhido: inclui**, e é o que o código já diz. `ESTAGIOS_ENCERRADOS` é `[PERDIDO, CANCELADO]` —
`EM_ESPERA` não está lá; e `probabilidadeDe` **preserva** a probabilidade em `EM_ESPERA` com o
comentário "pausar não é perder" (ADR-12). O dicionário alinha com o código em vez de criar uma
terceira definição.

Pipeline aberto = estágio ∈ (`LEVANTAMENTO`, `ORCAMENTO`, `PROPOSTA_ENVIADA`, `NEGOCIACAO`,
`EM_ESPERA`). Fora: `CONTRATADO` (virou receita), `PERDIDO`, `CANCELADO`.

**A tela separa as duas parcelas.** "Pipeline aberto: R$ X, dos quais R$ Y em espera" — juntar sem
distinguir faz um pipeline parado parecer saudável.

### 2.6 Valor contratado = **`Negociacao.valorNegociado`** ✅ (e um bug corrigido no caminho)

**Escolhido: `Negociacao.valorNegociado`.**

Desde a F5.9/F5.12, o aceite grava o **mesmo** número em três lugares na mesma transação:
`PropostaVersao.valorVersao` (da versão aceita), `Negociacao.valorNegociado` e
`Projeto.valorContrato`. A ambiguidade do P15 ("negociado final **ou** o da versão aceita?") é
portanto falsa **no momento do aceite** — são iguais por construção. Ela é real **depois**, porque
os três divergem por caminhos diferentes:

| Campo | Pode mudar depois? | O que passa a significar |
|---|---|---|
| `PropostaVersao.valorVersao` (aceita) | **Não** — proposta aceita é imutável (F5.5/F5.9) | O preço do documento que o cliente assinou |
| `Negociacao.valorNegociado` | Só por edição comercial deliberada | **O valor comercial do fechamento** |
| `Projeto.valorContrato` | Sim — aditivos, reajustes, o módulo de Projetos | O valor **corrente** da obra |

Métrica **comercial** usa `Negociacao.valorNegociado`: é o valor do negócio que o time fechou, e
não se move quando a obra ganha aditivo três meses depois. Receita **de obra** (que é assunto do
Financeiro, não deste dicionário) usa `Projeto.valorContrato`.

> ⚠️ **Bug encontrado ao escrever este documento e corrigido na hora (F6.1a).** O aceite calculava
> `valorFinal` como a **soma crua dos itens**, ignorando `PropostaVersao.desconto` — e sobrescrevia
> com ela o `valorVersao` que `salvarProposta` já tinha gravado corretamente com o abatimento.
> Efeito: um desconto justificado, auditado e registrado na timeline (F5.8) **sumia de todo número
> de receita**, e a versão ficava internamente inconsistente (`valorOriginal = 10000`,
> `desconto = 2000`, `valorVersao = 10000`), violando o invariante que `versoes.ts` documenta.
> Reproduzido contra o banco, corrigido em `aceitarProposta`, e coberto por 4 checks novos em
> `smoke-crm-fase5.ts` — nenhum cenário de smoke aceitava proposta **com** desconto, que é por
> isso que passou batido pela F5.8, F5.9 e F5.12.
>
> **Consequência para as métricas:** valor contratado é sempre **líquido de desconto**. Não existe
> "valor contratado bruto" no dicionário — o bruto é `valorOriginal` da versão, e só aparece na
> métrica de desconto (§3.13).

### 2.7 (extra) `Negociacao.desconto` é coluna morta — não usar

`Negociacao.desconto` existe no schema (`Decimal`, percentual 0–100) e **não tem um único
escritor** em todo o código. Desconto real vive em `PropostaVersao.desconto`, em **valor absoluto
(R$)**, gravado pela F5.8.

Toda métrica de desconto deste dicionário lê `PropostaVersao`. Ler `Negociacao.desconto` devolveria
`NULL` em 100% das linhas e um "desconto médio de 0%" convincente e falso.

### 2.8 (extra) Desconto médio = **ponderado**, não média de percentuais

Sub-ambiguidade que o P15 não listou, e que muda o número: o percentual de desconto é **derivado**
(`percentualDesconto` = `desconto ÷ valorOriginal`), nunca armazenado. Existem duas médias:

- **Média dos percentuais** — `AVG(desconto/valorOriginal)`: uma proposta de R$ 5 mil com 30% pesa
  igual a uma de R$ 500 mil com 2%.
- **Desconto ponderado** — `SUM(desconto) ÷ SUM(valorOriginal)`: responde "de cada R$ 100 de tabela,
  quanto abrimos mão".

**Escolhido: o ponderado**, porque a pergunta de negócio é sobre dinheiro cedido, não sobre hábito
de negociar. A média simples entra como métrica secundária na análise por disciplina (§3.13), onde
o interesse é justamente comportamental.

### 2.9 (extra) Negociação sem prospecção de origem fica **fora** do funil ponta a ponta

Nem toda `Negociacao` nasce de um `Lead`: `leadId` é nullable, negociação pode ser criada direto, e
as sintéticas da migração F5.2 (`needsReview: true`) nasceram sem origem real.

- No funil **ponta a ponta** (prospecção → contrato, §3.11) essas negociações **não entram** — não
  há prospecção para ser o denominador. Entram elas no denominador seria dividir por um número que
  não as contém.
- No funil de **negociação** (proposta → contrato) e em todo indicador de valor elas **entram**
  normalmente. São negócios reais.
- A tela informa quantas ficaram de fora e por quê. Um funil ponta a ponta que cobre 40% dos
  negócios sem avisar é pior que não ter funil.

---

## §3 — O dicionário

Cada bloco traz: **definição** · **fórmula** · **campo de data** · **entra / fica de fora** ·
**nulos** · **granularidade** · **SQL de referência** · **entrada para F6.3** (o formato de linha
que a função pura recebe, para que query e função não divirjam).

### 3.1 Novos prospects

**Definição:** prospecções criadas no período.
**Fórmula:** `COUNT(lead)`.
**Campo de data:** `Lead.createdAt`.
**Entra/fica de fora:** entram todos os status, inclusive `DESCARTADO` e `SEM_OPORTUNIDADE` — foram
prospectados de fato. Fica de fora o soft-deletado.
**Nulos:** n/a. **Granularidade:** dia/semana/mês; recortes do §4.

```sql
SELECT COUNT(*) AS novos_prospects
FROM lead l
WHERE l."excluidoEm" IS NULL
  AND l."createdAt" >= $inicio AND l."createdAt" < $fim;
```

### 3.2 Contatos realizados

**Definição:** interações registradas com uma pessoa no período — o esforço de contato, não o nº de
pessoas.
**Fórmula:** `COUNT(atividade)` com `tipo` de contato humano.
**Campo de data:** `Atividade.createdAt`.
**Entra/fica de fora:** entram `LIGACAO`, `WHATSAPP`, `EMAIL`, `LINKEDIN`, `REUNIAO`. **Ficam de
fora `SISTEMA`** (evento automático — não é contato), `NOTA` e `ANEXO` (registro interno).
**Nulos:** n/a. **Granularidade:** dia/semana/mês; por responsável (`autorId`).

> Contar `SISTEMA` aqui faria "contatos realizados" subir toda vez que alguém arrastasse um card.

```sql
SELECT COUNT(*) AS contatos_realizados
FROM atividade a
WHERE a.tipo IN ('LIGACAO','WHATSAPP','EMAIL','LINKEDIN','REUNIAO')
  AND a."createdAt" >= $inicio AND a."createdAt" < $fim;
```

### 3.3 Oportunidades criadas (negociações)

**Definição:** negociações abertas no período.
**Fórmula:** `COUNT(negociacao)`.
**Campo de data:** `Negociacao.createdAt`.
**Entra/fica de fora:** entram todas, com ou sem `leadId` (§2.9). Fica de fora o soft-deletado.
**Nulos:** n/a. **Granularidade:** dia/semana/mês; recortes do §4.

```sql
SELECT COUNT(*) AS oportunidades_criadas
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n."createdAt" >= $inicio AND n."createdAt" < $fim;
```

### 3.4 Propostas enviadas

**Definição:** propostas que chegaram ao cliente no período.
**Fórmula:** `COUNT(proposta)` com `enviadaEm` no período.
**Campo de data:** `Proposta.enviadaEm` — **não** `createdAt`. Proposta em rascunho não foi
enviada; usar `createdAt` contaria trabalho interno como esforço comercial.
**Entra/fica de fora:** entram todas com `enviadaEm` preenchido, inclusive as que depois viraram
`recusada` ou `aceita`. Ficam de fora as que nunca saíram do rascunho (`enviadaEm IS NULL`).
**Nulos:** `enviadaEm IS NULL` = não enviada, não entra.
**Granularidade:** dia/semana/mês; recortes do §4 via `negociacaoId`.

> `enviadaEm` é reescrito a cada novo envio (`mudarStatusProposta` para `enviada`). A métrica conta
> **propostas**, não envios: uma proposta reenviada 3× conta 1, na data do último envio.

```sql
SELECT COUNT(*) AS propostas_enviadas
FROM proposta p
WHERE p."enviadaEm" >= $inicio AND p."enviadaEm" < $fim;
```

### 3.5 Contratos fechados

**Definição:** negociações que chegaram a `CONTRATADO` no período.
**Fórmula:** `COUNT(negociacao WHERE estagio = 'CONTRATADO')`.
**Campo de data:** `Negociacao.dataFechamento`.
**Entra/fica de fora:** entram todas as `CONTRATADO`, com ou sem proposta por trás (o estágio é
alcançável manualmente a partir de `PROPOSTA_ENVIADA`/`NEGOCIACAO`, além do aceite).
**Nulos:** `dataFechamento IS NULL` com `estagio = CONTRATADO` não deveria existir
(`aplicarMovimentoEstagio` carimba sempre) — se aparecer, é dado a investigar, e a métrica o
**exclui e reporta a contagem**, nunca o coloca num período arbitrário.

> **`dataFechamento` é confiável para contrato, e só para contrato.** `CONTRATADO` é irreversível —
> não está em `ESTAGIOS_ATIVOS` nem em `ESTAGIOS_ENCERRADOS`, e nenhuma transição sai dele. Já em
> `PERDIDO`/`CANCELADO` a reabertura (F5.11) **limpa** `dataFechamento`: para perdas, esse campo
> mostra só a última, e coorte de perda sobre ele perde os reabertos. Métrica de perda usa a
> timeline (§3.16).

```sql
SELECT COUNT(*) AS contratos_fechados
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio = 'CONTRATADO'
  AND n."dataFechamento" >= $inicio AND n."dataFechamento" < $fim;
```

### 3.6 Valor contratado

**Definição:** soma do valor comercial dos contratos fechados no período, **líquido de desconto**
(§2.6).
**Fórmula:** `SUM(Negociacao.valorNegociado)`.
**Campo de data:** `Negociacao.dataFechamento`.
**Entra/fica de fora:** mesmo conjunto de §3.5.
**Nulos:** `valorNegociado IS NULL` num `CONTRATADO` significa contrato fechado sem valor
registrado (possível na transição manual, que não passa por `aceitarProposta`). **Conta na
quantidade, não na soma**, e a tela informa quantos contratos ficaram sem valor — silenciar isso
faz o ticket médio mentir para cima.
**Granularidade:** mês; recortes do §4.

```sql
SELECT COALESCE(SUM(n."valorNegociado"), 0) AS valor_contratado,
       COUNT(*) FILTER (WHERE n."valorNegociado" IS NULL) AS contratos_sem_valor
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio = 'CONTRATADO'
  AND n."dataFechamento" >= $inicio AND n."dataFechamento" < $fim;
```

### 3.7 Pipeline aberto

**Definição:** valor total dos negócios vivos **hoje** — foto, não período.
**Fórmula:** `SUM(COALESCE(valorNegociado, valorProposto, valorEstimado))`.
**Campo de data:** **nenhum.** É estado atual. Filtrar pipeline por período é erro conceitual: o
pipeline de março não existe, existe o pipeline de hoje.
**Entra/fica de fora:** estágio ∈ (`LEVANTAMENTO`, `ORCAMENTO`, `PROPOSTA_ENVIADA`, `NEGOCIACAO`,
`EM_ESPERA`) — §2.5. Fora: `CONTRATADO`, `PERDIDO`, `CANCELADO`.
**Nulos:** a cascata `valorNegociado → valorProposto → valorEstimado` pega o valor mais firme
disponível. Negociação com os três nulos **conta na quantidade e não na soma**, e a tela mostra
"N negócios sem valor estimado" — é acionável (alguém tem que preencher).
**Granularidade:** foto; sempre exibido **separando a parcela `EM_ESPERA`** (§2.5).

```sql
SELECT
  COALESCE(SUM(COALESCE(n."valorNegociado", n."valorProposto", n."valorEstimado")), 0) AS pipeline_aberto,
  COALESCE(SUM(COALESCE(n."valorNegociado", n."valorProposto", n."valorEstimado"))
           FILTER (WHERE n.estagio = 'EM_ESPERA'), 0) AS parcela_em_espera,
  COUNT(*) FILTER (WHERE COALESCE(n."valorNegociado", n."valorProposto", n."valorEstimado") IS NULL) AS sem_valor
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio IN ('LEVANTAMENTO','ORCAMENTO','PROPOSTA_ENVIADA','NEGOCIACAO','EM_ESPERA');
```

### 3.8 Pipeline ponderado

**Definição:** pipeline aberto multiplicado pela probabilidade de cada negócio — a expectativa,
não o teto.
**Fórmula:** `SUM(valor × probabilidade ÷ 100)`, com o mesmo `valor` em cascata do §3.7.
**Campo de data:** nenhum (foto, como §3.7).
**Entra/fica de fora:** idêntico ao §3.7.
**Nulos:** `probabilidade` é `Int @default(0)` — nunca nula. Vale notar que `0` é legítimo e zera a
contribuição da linha.
**Granularidade:** foto; recortes do §4.

> `probabilidade` vem de `ProbabilidadeEstagio` (configurável) e respeita `probabilidadeOverride`
> (ADR-12): quando alguém digitou o número à mão, a transição não recalcula. O ponderado herda isso
> de graça — é o objetivo do ADR-12.

```sql
SELECT COALESCE(SUM(
         COALESCE(n."valorNegociado", n."valorProposto", n."valorEstimado") * n.probabilidade / 100.0
       ), 0) AS pipeline_ponderado
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio IN ('LEVANTAMENTO','ORCAMENTO','PROPOSTA_ENVIADA','NEGOCIACAO','EM_ESPERA');
```

### 3.9 Ticket médio (por contrato)

**Definição:** valor típico de um contrato fechado no período.
**Fórmula:** `valor contratado (§3.6) ÷ contratos COM valor`.
**Campo de data:** `Negociacao.dataFechamento`.
**Entra/fica de fora:** só contratos **com** `valorNegociado`. O denominador aqui **não** é o §3.5:
incluir os sem valor puxaria a média para baixo por ausência de dado, não por negócio pequeno.
**Nulos:** sem nenhum contrato com valor no período → **`null`**, e a tela diz "sem contratos com
valor no período" (§1.4).
**Granularidade:** mês; recortes do §4. O **ticket por empresa** é outra métrica, no §3.14.

```sql
SELECT AVG(n."valorNegociado") AS ticket_medio_contrato
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio = 'CONTRATADO' AND n."valorNegociado" IS NOT NULL
  AND n."dataFechamento" >= $inicio AND n."dataFechamento" < $fim;
```

### 3.10 Conversão entre etapas (funil de negociação)

**Definição:** de uma coorte de negociações, que fração alcançou cada etapa seguinte.
**Fórmula:** por etapa, `nº da coorte que ALCANÇOU a etapa ÷ tamanho da coorte`.
**Campo de data:** `Negociacao.createdAt` — é a data da **coorte** (§2.1), não a da etapa.
**Entra/fica de fora:** toda a coorte no denominador, inclusive `CANCELADO`, `EM_ESPERA` e ainda
ativas (§2.4).

> **"Alcançou" ≠ "está".** Uma negociação hoje em `CONTRATADO` passou por `PROPOSTA_ENVIADA` e
> conta nas duas etapas. Ler o estágio **atual** subestimaria toda etapa intermediária. Como não há
> coluna de carimbo por estágio, "alcançou" se lê na timeline: existe `Atividade` com
> `metadata->>'evento' = 'ESTAGIO_ALTERADO'` e `metadata->>'para' = <etapa>` para aquela negociação.
> É exatamente para isso que `de`/`para` são gravados **crus** no metadata (`atividade-eventos.ts`).

**Nulos:** coorte vazia → **`null`** em todas as taxas.
**Granularidade:** coorte mensal; recortes do §4.

> ⚠️ **Limite conhecido:** negociações anteriores à F3.2 (quando a timeline nasceu) e as sintéticas
> da F5.2 não têm `ESTAGIO_ALTERADO` nenhum. Para elas, "alcançou" só é observável pelo estágio
> atual. A tela **exclui** da conversão as coortes anteriores à timeline e informa o corte, em vez
> de misturar dois métodos de medição no mesmo número.

```sql
WITH coorte AS (
  SELECT n.id FROM negociacao n
  WHERE n."excluidoEm" IS NULL
    AND n."createdAt" >= $inicio AND n."createdAt" < $fim
),
alcancou AS (
  SELECT DISTINCT a."negociacaoId", a.metadata->>'para' AS etapa
  FROM atividade a
  WHERE a."negociacaoId" IN (SELECT id FROM coorte)
    AND a.metadata->>'evento' = 'ESTAGIO_ALTERADO'
)
SELECT
  (SELECT COUNT(*) FROM coorte) AS coorte_total,
  COUNT(*) FILTER (WHERE etapa = 'ORCAMENTO')        AS ate_orcamento,
  COUNT(*) FILTER (WHERE etapa = 'PROPOSTA_ENVIADA') AS ate_proposta,
  COUNT(*) FILTER (WHERE etapa = 'NEGOCIACAO')       AS ate_negociacao,
  COUNT(*) FILTER (WHERE etapa = 'CONTRATADO')       AS ate_contrato
FROM alcancou;
```

### 3.11 Conversão ponta a ponta (prospecção → contrato)

**Definição:** de uma coorte de **prospecções**, que fração terminou em contrato.
**Fórmula:** `prospecções da coorte cuja negociação chegou a CONTRATADO ÷ tamanho da coorte`.
**Campo de data:** `Lead.createdAt`.
**Entra/fica de fora:** denominador = todas as prospecções da coorte, inclusive `DESCARTADO`.
Numerador = as que têm `Negociacao` (via `Negociacao.leadId`) em `CONTRATADO`. **Negociação sem
`leadId` não entra em nenhum dos dois lados** (§2.9), e a tela informa quantos contratos ficaram
fora por isso.
**Nulos:** coorte vazia → `null`.
**Granularidade:** coorte mensal; recortes do §4.

```sql
SELECT
  COUNT(*) AS prospeccoes_coorte,
  COUNT(*) FILTER (WHERE n.estagio = 'CONTRATADO') AS viraram_contrato
FROM lead l
LEFT JOIN negociacao n ON n."leadId" = l.id AND n."excluidoEm" IS NULL
WHERE l."excluidoEm" IS NULL
  AND l."createdAt" >= $inicio AND l."createdAt" < $fim;
```

### 3.12 Tempo médio de fechamento

**Definição:** dias entre a abertura da negociação e o contrato.
**Fórmula:** `AVG(dataFechamento − createdAt)`, em dias.
**Campo de data:** coorte por `Negociacao.createdAt` (§2.1).
**Entra/fica de fora:** só as que fecharam (`CONTRATADO`). As perdidas têm "tempo até a perda", que
é outra métrica e entra no §3.16. As ainda abertas **não entram** — incluí-las com o tempo até hoje
misturaria "fechou rápido" com "ainda não fechou".
**Nulos:** nenhum fechamento na coorte → `null`.
**Granularidade:** mediana **também** exibida — a média é sensível ao negócio de 2 anos, e a
diferença entre as duas é informação (se divergem muito, há cauda longa).

> ⚠️ **Duração negativa é dado inválido, não um número.** Rodando este SQL contra o dev, a média
> veio **−7,75 dias**: o seed de demonstração fabrica `dataFechamento` e `createdAt` sem relação
> causal entre si. Em produção não acontece (o carimbo é `new Date()` na transição, sempre depois
> da criação), mas a função da F6.3 **descarta linhas com duração < 0 e reporta quantas descartou**
> — nunca as inclui na média. Média negativa numa tela é o tipo de número que destrói a confiança
> no painel inteiro.

```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (n."dataFechamento" - n."createdAt")) / 86400.0) AS dias_medio,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (n."dataFechamento" - n."createdAt")) / 86400.0
  ) AS dias_mediana
FROM negociacao n
WHERE n."excluidoEm" IS NULL
  AND n.estagio = 'CONTRATADO' AND n."dataFechamento" IS NOT NULL
  AND n."createdAt" >= $inicio AND n."createdAt" < $fim;
```

### 3.13 Desconto médio

**Definição:** quanto do preço de tabela foi cedido.
**Fórmula (principal, ponderada — §2.8):** `SUM(desconto) ÷ SUM(valorOriginal) × 100`.
**Fórmula (secundária, comportamental):** `AVG(desconto ÷ valorOriginal) × 100`.
**Campo de data:** `PropostaVersao.createdAt` da **versão vigente/aceita**, conforme o recorte.
**Entra/fica de fora:** só versões com `valorOriginal > 0`. Versão **sem** desconto entra com
`desconto = 0` — excluí-la mediria "desconto médio entre quem deu desconto", que é outra pergunta.
**Fonte:** `PropostaVersao`, **nunca** `Negociacao.desconto` (§2.7).
**Nulos:** `desconto IS NULL` = sem desconto = `0`. Nenhuma versão elegível → `null`.
**Granularidade:** por disciplina (via `PropostaItem`), por canal, por responsável.

> Desconto **por disciplina** é aproximação: o desconto é da proposta inteira, não do item. O rateio
> é proporcional ao valor do item — e a tela diz que é rateio, não medição.

```sql
SELECT
  SUM(COALESCE(v.desconto, 0)) / NULLIF(SUM(v."valorOriginal"), 0) * 100 AS desconto_ponderado_pct,
  AVG(COALESCE(v.desconto, 0) / NULLIF(v."valorOriginal", 0)) * 100      AS desconto_medio_simples_pct
FROM proposta_versao v
WHERE v."valorOriginal" > 0
  AND v."createdAt" >= $inicio AND v."createdAt" < $fim;
```

### 3.14 Novos × recorrentes, e ticket por empresa

**Definição:** quantos contratos vieram de empresa que nunca tinha fechado, quantos de quem já era
cliente, e quanto vale cada grupo.
**Fórmula:** contrato é "de novo" se é o **1º contrato** daquela empresa (§2.3, empresa resolvida
pela fusão §1.2). Ticket por empresa = `valor contratado ÷ empresas distintas`.
**Campo de data:** `Negociacao.dataFechamento`.
**Entra/fica de fora:** todos os contratos do período; a classificação olha **todo** o histórico
anterior, não só o período.
**Nulos:** sem contratos → `null`.
**Granularidade:** mês; recortes do §4.

```sql
WITH contratos AS (
  SELECT COALESCE(c."fundidoEmId", c.id) AS empresa_id,
         n."dataFechamento", n."valorNegociado",
         ROW_NUMBER() OVER (PARTITION BY COALESCE(c."fundidoEmId", c.id)
                            ORDER BY n."dataFechamento") AS ordem_da_empresa
  FROM negociacao n
  JOIN cliente c ON c.id = n."clienteId" AND c."excluidoEm" IS NULL
  WHERE n."excluidoEm" IS NULL AND n.estagio = 'CONTRATADO' AND n."dataFechamento" IS NOT NULL
)
SELECT
  COUNT(*) FILTER (WHERE ordem_da_empresa = 1)  AS contratos_de_clientes_novos,
  COUNT(*) FILTER (WHERE ordem_da_empresa > 1)  AS contratos_de_recorrentes,
  SUM("valorNegociado") FILTER (WHERE ordem_da_empresa = 1) AS receita_novos,
  SUM("valorNegociado") FILTER (WHERE ordem_da_empresa > 1) AS receita_recorrentes,
  SUM("valorNegociado") / NULLIF(COUNT(DISTINCT empresa_id), 0) AS ticket_por_empresa
FROM contratos
WHERE "dataFechamento" >= $inicio AND "dataFechamento" < $fim;
```

### 3.15 Taxa de recompra em 6 / 12 / 24 meses

**Definição:** das empresas que fecharam o **1º** contrato numa coorte, que fração fechou **outro**
dentro de 6, 12 ou 24 meses.
**Fórmula:** `empresas da coorte com 2º contrato até N meses ÷ empresas da coorte`.
**Campo de data:** coorte pela data do **1º** contrato da empresa; a janela conta a partir dela.
**Entra/fica de fora:** empresa resolvida pela fusão (§1.2). **Coorte só é elegível quando a janela
já fechou**: a taxa de 24 meses de uma coorte de 2026 não existe até 2028 — e o valor devolvido é
`null`, não `0%`. É o erro mais fácil de cometer nesta métrica, e o mais convincente quando cometido.
**Nulos:** janela incompleta ou coorte vazia → `null`, com o motivo na tela.
**Granularidade:** coorte trimestral ou anual (mensal dá base pequena demais).

```sql
WITH primeiro AS (
  SELECT COALESCE(c."fundidoEmId", c.id) AS empresa_id,
         MIN(n."dataFechamento") AS primeira_data
  FROM negociacao n
  JOIN cliente c ON c.id = n."clienteId" AND c."excluidoEm" IS NULL
  WHERE n."excluidoEm" IS NULL AND n.estagio = 'CONTRATADO' AND n."dataFechamento" IS NOT NULL
  GROUP BY 1
),
coorte AS (
  SELECT * FROM primeiro WHERE primeira_data >= $inicio AND primeira_data < $fim
)
SELECT
  COUNT(*) AS empresas_coorte,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM negociacao n2
    JOIN cliente c2 ON c2.id = n2."clienteId"
    WHERE COALESCE(c2."fundidoEmId", c2.id) = coorte.empresa_id
      AND n2."excluidoEm" IS NULL AND n2.estagio = 'CONTRATADO'
      AND n2."dataFechamento" > coorte.primeira_data
      AND n2."dataFechamento" <= coorte.primeira_data + ($meses || ' months')::interval
  )) AS recompraram
FROM coorte;
```

### 3.16 Perdas: taxa e motivo

**Definição:** que fração da coorte foi perdida, e por quê.
**Fórmula:** `perdidas da coorte ÷ coorte`; agrupamento por `MotivoPerda.nome`.
**Campo de data:** coorte por `Negociacao.createdAt`. **Não** usar `dataFechamento` — a reabertura
(F5.11) o limpa, e a perda reaberta some da coorte (§3.5).
**Entra/fica de fora:** `PERDIDO` (perda comercial). `CANCELADO` conta separado — desistência sem
disputa não é derrota, e misturar os dois esconde qual dos dois problemas se tem.
**Nulos:** `motivoPerdaId` é obrigatório em `PERDIDO` desde a F5.10; linhas anteriores podem tê-lo
nulo e aparecem como "sem motivo registrado (anterior à F5.10)", nunca redistribuídas.
**Granularidade:** coorte mensal; por motivo, canal, concorrente.

> A perda **atual** se lê no estágio; o **histórico** de perdas (incluindo as reabertas) se lê na
> timeline, por `NEGOCIACAO_PERDIDA` — evento próprio justamente para isso (F3.2/F5.10).

### 3.17 Follow-ups: hoje e atrasados

**Definição:** próximas ações comerciais com vencimento hoje, e as vencidas não concluídas.
**Fórmula:** `COUNT(compromisso)` com `entidadeTipo` comercial e `concluidoEm IS NULL`.
**Campo de data:** `Compromisso.inicio`, comparado em `America/Recife` (§1.6).
**Entra/fica de fora:** só `entidadeTipo` comercial (`LEAD`/`NEGOCIACAO`) e não concluído.
Concluído sai da conta no instante em que é concluído — é uma fila de trabalho, não um histórico.
**Nulos:** n/a. **Granularidade:** foto, por responsável.

```sql
SELECT
  COUNT(*) FILTER (WHERE cp.inicio::date = $hoje_recife) AS follow_ups_hoje,
  COUNT(*) FILTER (WHERE cp.inicio::date < $hoje_recife) AS follow_ups_atrasados
FROM compromisso cp
WHERE cp."entidadeTipo" IS NOT NULL AND cp."concluidoEm" IS NULL;
```

### 3.18 Forecast

**Definição:** receita esperada no horizonte, somando o que já fechou com a expectativa do que está
aberto.
**Fórmula:** `valor contratado no período (§3.6) + pipeline ponderado com previsão de fechamento
dentro do horizonte (§3.8)`.
**Campo de data:** `dataFechamento` para a parte fechada; `Negociacao.previsaoFechamento` para a
aberta.
**Entra/fica de fora:** na parte aberta, só negociações **com** `previsaoFechamento` dentro do
horizonte. Negociação sem previsão **não entra**, e a tela mostra o valor ponderado que ficou de
fora por falta de previsão — é acionável, e escondê-lo faria o forecast parecer completo quando não
é.
**Nulos:** ver acima. Forecast nunca é `null` (a parte fechada existe), mas vem **sempre** com as
duas parcelas separadas e a cobertura declarada.
**Granularidade:** mês/trimestre corrente.

> `probabilidade` é `0` em `PERDIDO`/`CANCELADO` mesmo com override (ADR-12), então essas linhas se
> anulam sozinhas — mas o filtro de estágio do §3.8 continua explícito, para não depender disso.

---

## §4 — Recortes de análise

Todo indicador do §3 aceita estes recortes, salvo onde o bloco disser o contrário. Combinam entre
si e são persistidos na URL (F6.7).

| Recorte | Campo | Observação |
|---|---|---|
| Canal | `Lead.canalId` / `Negociacao.canalId` | Julgar canal por **taxa**, não por contagem (P17 item 4) |
| Campanha | `Lead.campaignId` / `Negociacao.campaignId` | |
| Tipo de empreendimento | `Negociacao.tipoEmpreendimentoId` | |
| Disciplina | `NegociacaoDisciplina` / `PropostaItem.disciplinaId` | Item sem FK cai no texto legado (F1.19) |
| Segmento | `Cliente.segmentoId` | |
| **Região** | **`Cliente.uf`** | **Não existe campo `regiao`** — o recorte é por UF; `cidade` fica como detalhe |
| Responsável | `Lead.responsavelId` / `Negociacao.responsavelId` | Atribuição, **nunca** gate de permissão (ADR-15) |
| Novo × recorrente | derivado, §3.14 | |
| Parceiro | `Lead.parceiroId` / `Negociacao.parceiroId` | F1.23a |

**Regra de recorte vazio:** recorte sem nenhuma linha mostra "sem dados para este recorte", nunca
`0`/`0%` (§1.4). Um canal sem contrato **nenhum** e um canal com 50 propostas e 0 contratos são
situações opostas com a mesma aparência se a tela não distinguir.

---

## §5 — O que este dicionário **não** consegue medir hoje

Honestidade sobre limites vale mais que uma métrica bonita e falsa. Nenhum destes é bug — são
consequências do dado que existe.

1. **Histórico anterior ao sistema.** Novo × recorrente e recompra (§3.14/§3.15) só enxergam
   contratos registrados aqui. Cliente antigo que volta pode aparecer como "novo".
2. **Coortes anteriores à F3.2 não têm timeline**, então conversão entre etapas (§3.10) não as
   cobre. A tela corta essas coortes explicitamente em vez de medi-las por outro método.
3. **Tempo por etapa** (quanto tempo parado em `ORCAMENTO`) é derivável da timeline, mas custa uma
   varredura de `Atividade` por negociação. Fica **fora da Fase 6** — entra como regra de "parada
   há Z dias" na F7.1, onde a pergunta é operacional e não analítica.
4. **Desconto por disciplina é rateio**, não medição (§3.13) — o desconto é da proposta.
5. **Contatos realizados conta registros, não pessoas** (§3.2). Depende de o time registrar; um
   número baixo pode significar pouco contato **ou** pouco registro, e a distinção não é observável
   pelo sistema.
6. **`Negociacao.desconto` é coluna morta** (§2.7). Candidata a remoção numa fase futura — não foi
   removida aqui porque o playbook proíbe apagar coluna sem migração dedicada.

---

## §6 — Contrato com o `metricas.ts` (F6.3)

`metricas.ts` é **puro**: sem `import` de Prisma, sem relógio, sem I/O. Recebe linhas já lidas e
devolve números. Para que a query (§3) e a função não divirjam, cada função declara o **formato de
linha** que consome, e é esse formato que a query precisa produzir.

```ts
// Formatos de entrada — o que a camada de leitura precisa entregar.
type LinhaNegociacao = {
  id: string;
  estagio: EstagioNegociacao;
  criadoEm: Date;
  dataFechamento: Date | null;
  previsaoFechamento: Date | null;
  valorNegociado: number | null;
  valorProposto: number | null;
  valorEstimado: number | null;
  probabilidade: number;      // 0-100
  empresaId: string;          // JÁ resolvido pela fusão (§1.2)
  leadId: string | null;      // null = fora do funil ponta a ponta (§2.9)
};

type LinhaVersaoProposta = {
  valorOriginal: number;
  desconto: number | null;    // R$, não percentual (§2.7/§2.8)
  criadoEm: Date;
};

type EtapaAlcancada = { negociacaoId: string; etapa: EstagioNegociacao };
```

**Regras que os testes da F6.3 têm de provar:**

1. Toda taxa/média devolve `null` — nunca `0` — quando o denominador é zero (§1.4).
2. `agora`/`hoje` sempre entra por parâmetro (§1.5).
3. Pipeline aberto e ponderado incluem `EM_ESPERA` e devolvem a parcela em espera separada (§2.5).
4. Valor contratado é líquido de desconto (§2.6).
5. Desconto médio ponderado ≠ média de percentuais — as duas funções existem e têm teste com
   valores em que **divergem** (§2.8).
6. Negociação com `leadId: null` fica fora do funil ponta a ponta e dentro dos demais (§2.9).
7. Recompra com janela ainda aberta devolve `null` (§3.15).
8. Duração negativa (fechamento antes da criação) é descartada e contada à parte, nunca somada na
   média (§3.12).

---

## §7 — Verificação desta tarefa (F6.1)

Documento de planejamento não roda lint nem teste — mas o SQL de referência **foi executado**, um a
um, contra o banco de dev, porque dicionário com query que não roda é decoração:

| | |
|---|---|
| Queries do §3 executadas | **14 de 14 verdes** |
| Achado 1 | Tempo de fechamento **−7,75 dias** no seed → virou a regra de descarte do §3.12 |
| Achado 2 | **2 contratos sem `valorNegociado`** → confirma que a regra de nulos do §3.6 não é hipotética |
| Achado 3 | Funil (§3.10) devolve 0 em coorte de 17 → confirma o limite "coorte anterior à timeline" do §5.2 |
| Achado 4 | **Bug do desconto no aceite** (§2.6) — reproduzido, corrigido e coberto por smoke |

As 6 ambiguidades do P15 estão resolvidas em §2.1–§2.6, com 3 extras encontradas contra o schema
real em §2.7–§2.9.
