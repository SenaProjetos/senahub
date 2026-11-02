# Lote 5b — Bombas: recalque de edifício e recirculação de piscina

Parte do [Lote 5](2026-11-02-lote5-calculadoras-instalacoes-design.md). O dono pulou as perguntas em
02/11/2026; as decisões abaixo são do agente. O que depende do engenheiro está marcado **[validar]**.
Mesma trava do 5a: as duas calculadoras nascem `exigeValidacao: true` e só `ferramentas:gerir` as vê.

## Escopo

Duas calculadoras em `Ferramentas`, disciplina Hidrossanitário, sobre um módulo hidráulico comum.

| Chave | Nome | Norma |
|---|---|---|
| `bomba-recalque` | Bomba de Recalque | NBR 5626 |
| `bomba-piscina` | Bomba de Piscina | NBR 10339 |

**Não-objetivos:** curva da bomba e ponto de operação; NPSH disponível (a tela avisa e manda conferir com a
curva do fabricante); tabela de comprimentos equivalentes por conexão (o projetista digita o Leq total do
trecho); tubo que não seja PVC soldável; várias bombas em paralelo; aquecimento e tratamento químico.
**Anti-objetivo:** número sem fonte virar padrão. Valor que a norma não fixa e o escritório não definiu
(perda do filtro, taxa de filtração) **não tem padrão**: fica em branco com alerta.

## Módulo comum — `calc/hidraulica.ts` (puro)

- Hazen-Williams `J = 10,643·Q^1,85·C^-1,85·D^-4,87`; velocidade; perda do trecho = `J·(L + Leq)`.
- Forchheimer `D = 1,3·(h/24)^¼·√Q` para o recalque.
- Tabela de PVC soldável marrom (NBR 5648): DN → diâmetro interno **[validar]**. A perda usa o interno; o
  diâmetro adotado é o menor DN cujo **interno** é ≥ ao calculado (lado da segurança).
- Potência `P(cv) = 9810·Q·Hm/(η·735,5)`; margem por faixa (Macintyre: 50/30/20/15/10 %) e motor comercial
  como o menor da lista ≥ `P·(1+margem)` **[validar]**.
- DN: o campo aceita "Automático" (o cálculo adota) ou um DN digitado; a tela mostra o adotado.

## Bomba de recalque (H02)

Consumo diário por **ocupação** (reaproveita `OCUPACOES` do reservatório, fonte única) ou **informado**
(o `CD` da calculadora de Reservatórios; não há ligação automática entre cálculos salvos). `Q = CD/h`,
`h` padrão 6 h/dia **[validar]**. Recalque por Forchheimer; sucção = DN logo acima. `Hg = h_sucção + h_recalque`
(sucção negativa se a bomba é afogada). `Hm = Hg + hf_recalque + hf_sucção`. Padrões **[validar]**: C = 140,
η = 60 %, velocidade ≤ 3,0 m/s no recalque e ≤ 2,0 m/s na sucção (alerta), alerta de NPSH com a bomba a mais
de 5 m da água.

## Bomba de piscina (H03)

Volume por forma (retangular, circular, informado). Tempo de recirculação por uso: residencial 6 h, coletivo
4 h, infantil 2 h, ou digitado **[validar contra a NBR 10339]**. `Q = V/t`. DN automático = menor com
`v ≤ 1,8 m/s` na sucção e `v ≤ 3,0 m/s` no retorno **[validar]**. Circuito fechado com superfície livre:
`Hm = hf_sucção + hf_retorno + perda dos equipamentos + pressão nos retornos`, sem desnível. Perda dos
equipamentos e pressão nos retornos: do catálogo do fabricante, **sem padrão** (0 com alerta). Taxa de
filtração opcional: com ela sai a área filtrante. η padrão 50 % **[validar]**.

## Fora do 5b

Guia ilustrado e manual: só depois da validação, como no 5a. Sem migração, sem seed, sem permissão nova.

## Verificação

Motor com teste de valores conferidos à mão (script independente, mesma fórmula), `service`/`savefile`/
`registry` cobertos, tela verificada pelo agente (galeria, as duas calculadoras, memória em PDF), auditoria nível 3.
