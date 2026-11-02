# Lote 5 — Calculadoras de instalações e aba Estudos

Origem: reunião de 26/10/2026 (ver [roadmap](2026-10-26-reuniao-hub-roadmap.md), Lote 5).
O dono pulou as perguntas do desenho em 02/11/2026 ("siga direto, qualquer alteração fazemos
depois"): as decisões abaixo são do agente, marcadas com **[decisão do agente]**. Tudo que depende
do engenheiro está marcado com **[validar]**.

## Intenção

A equipe de instalações faz hoje reservatório, corrente e levantamento de cargas em planilhas
soltas. O pedido é ter isso dentro do Hub, com memória de cálculo, e (depois) o levantamento de
cargas vivo por projeto. **Nenhum cálculo vai ao ar sem um engenheiro da casa validar fórmulas e
tabelas.**

## Objetivos / não-objetivos

- Objetivo: calculadoras em `Ferramentas` (disciplinas Hidrossanitário e Elétrico), no mesmo padrão
  das estruturais (motor puro + teste, formulário, memória em PDF/Word/Excel, arquivo `.shcalc`).
- Objetivo: **trava de validação** — calculadora sem validação registrada não aparece para a equipe.
- Objetivo (lote 5c): Estudos por projeto reaproveitando o motor de demanda.
- Não-objetivo: escolher seção de cabo ou disjuntor (o pedido é corrente, corrente corrigida e
  carga demandada). Tabelas de capacidade de condução ficam para depois.
- Anti-objetivo: um número "plausível" de fórmula não conferida chegar a um projeto. Por isso a
  trava, e por isso cada hipótese vira linha da memória de cálculo.

## Divisão em sublotes **[decisão do agente]**

| Sublote | Conteúdo | Por que nesta ordem |
|---|---|---|
| **5a** | Trava de validação + **Reservatórios** (NBR 5626 + reserva de incêndio) + **Corrente e demanda** (NBR 5410) | Reservatório é a mais simples e a mais pedida; corrente/demanda alimenta o Estudos |
| 5b | Bomba de recalque, bomba de piscina (perda de carga, altura manométrica, potência) — usa o volume do 5a | Depende do consumo diário do reservatório |
| 5c | Destino final de esgoto (sumidouro/filtro): teste de percolação + sondagem (NBR 7229/13969) | Exige tabela de percolação → área de infiltração e a leitura da sondagem; mais risco de norma |
| 5d | Aba **Estudos**: levantamento de cargas por projeto | Precisa do motor de demanda do 5a e de tabela nova no banco |

Só o 5a é desenhado em detalhe agora (método do dono: desenho completo só do lote da vez). 5b–5d
ficam no roadmap com as decisões já tomadas abaixo.

## Onde vive a aba Estudos **[decisão do agente]**

**Dentro do projeto** (`/projetos/[id]/estudos`), não em Ferramentas: o levantamento é um dado do
projeto (ambientes, pontos, potências), muda ao longo do tempo e precisa de escopo de projeto,
auditoria e histórico — o oposto de uma calculadora avulsa. O **motor** (`calc/electrical-demand.ts`)
é compartilhado: a calculadora "Corrente e demanda" e o Estudos rodam o mesmo código.
Exige migração (tabelas do estudo) — por isso fica para o 5d.

## Quem valida e como se registra **[decisão do agente; confirmar nome do engenheiro]**

- Cada calculadora nasce **em validação**: `exigeValidacao: true` e sem `validacao` no registry.
- Em validação: só quem tem `ferramentas:gerir` vê na galeria e abre; salvar cálculo é recusado pelo
  servidor para os demais; a memória sai com o selo **"EM VALIDAÇÃO — não usar em projeto"**.
- O engenheiro revisa a **ficha de validação** (`docs/engenharia/validacao/<chave>.md`: fórmulas,
  tabelas, hipóteses, casos de teste com resultado esperado). Aprovada a ficha, um commit preenche
  `validacao: { por, em, versaoCalc, ficha }` no registry. O registro fica no git (autoria, data,
  revisão do commit).
- A validação vale para **uma versão do motor**: se `versaoCalc` muda depois, a calculadora volta
  para "em validação" (teste automático garante).
- Aceitar nova versão de fórmula = incrementar `versaoCalc` + nova validação. Mesmo princípio que as
  estruturais já seguem para não reinterpretar snapshots antigos.
- Sem permissão nova: reaproveita `ferramentas:gerir` (a permissão nova exigiria migration por par
  novo no seed de perfis). Se a equipe quiser um papel "validador" separado, vira pedido à parte.

## Desenho do 5a

### Trava de validação (pura, `registry.ts`)

`FerramentaMeta` ganha `exigeValidacao?: boolean` e `validacao?: { por; em; versaoCalc; ficha }`.
`situacaoValidacao(meta)` → `"nao_exige" | "validada" | "em_validacao"`. A galeria recebe
`podeVerEmValidacao` (derivado de `can(ferramentas, gerir)` no servidor), a página da ferramenta
devolve 404 e `salvarCalculo` recusa quando `em_validacao` e o usuário não gere. Cálculos já
salvos de uma ferramenta que voltou para validação continuam abrindo (são do autor) mas a memória
traz o selo.

### Reservatórios (`calc/reservoir.ts`, chave `reservatorios`) **[validar tudo]**

Entradas: ocupação (tabela de consumo per capita editável ou valor próprio), quantidade de
unidades (pessoas, leitos, m²…), dias de reserva (padrão **2**), sistema (inferior + superior |
só superior | só inferior), fração no inferior (padrão **60 %**, a regra 3/5–2/5 da prática),
reserva técnica de incêndio (nenhuma | volume informado | calculada = hidrantes × vazão × minutos) e
onde ela fica, altura útil de cada reservatório (opcional, para a área em planta).

Fórmulas: `CD = unidades × consumo`; `V_reserva = CD × dias`; inferior = `fração × V_reserva`,
superior = `(1 − fração) × V_reserva` (um só reservatório recebe tudo); `V_total = consumo + RTI`;
área em planta `= V(m³) / h`.

Hipóteses que a memória mostra e o engenheiro confere: tabela de consumo (valores usuais de
Macintyre/Creder, não da NBR 5626 — a norma não fixa per capita), 2 dias, 60/40, e que a RTI é
dado do Corpo de Bombeiros do estado (NBR 13714 dá a vazão mínima por tipo de hidrante, mas tempo
e número de hidrantes simultâneos vêm da IT estadual) — por isso a RTI não tem valor padrão.

### Corrente e demanda (`calc/electrical-demand.ts`, chave `corrente-demanda`) **[validar tudo]**

Entrada: lista de cargas (descrição, quantidade, potência unitária W, fator de potência,
rendimento, fator de demanda, tensão, ligação monofásica/trifásica) + condições de instalação
(isolação PVC/EPR, temperatura ambiente, nº de circuitos agrupados, FCT/FCA manuais opcionais) +
alimentação (tensão e ligação para a corrente total).

Fórmulas por linha: `P_abs = qtd × P / η`; `S = P_abs / fp`; `Ib = P_abs / (k · V · fp)` com
`k = 1` (mono) ou `√3` (tri); `Ib' = Ib / (FCT · FCA)` (corrente corrigida, a comparar com a
capacidade de condução da NBR 5410); demanda `P_dem = P_abs × fd`. Totais: potência instalada,
demanda em kW e kVA (soma aritmética das potências aparentes — a favor da segurança; a soma
vetorial exigiria ângulos), fator de potência médio e corrente total da demanda.

FCT = Tabela 40 (PVC 70 °C e EPR/XLPE 90 °C, base 30 °C); FCA = Tabela 42, linha de condutores
em feixe/conduto fechado (1 a ≥ 20 circuitos). Fatores de demanda **não** vêm da NBR 5410: são da
concessionária e variam, então são digitados por linha (padrão 100 %).

### Fora do 5a

Guia ilustrado (`guia-meta.ts` + desenho SVG): as duas ferramentas novas saem sem guia — a tela
já tem cabeçalho próprio quando não há guia. Fica para depois da validação.

## Verificação

Motores com teste (valores conferidos à mão no arquivo de teste), `savefile`/`service`/`registry`
cobertos, tela verificada pelo agente (galeria como gestor e como usuário comum, as duas
calculadoras, memória em PDF), auditoria nível 3.
