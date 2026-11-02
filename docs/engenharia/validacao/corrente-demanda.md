# Ficha de validação — Corrente e Demanda

Chave: `corrente-demanda` · motor `src/modules/ferramentas/calc/electrical-demand.ts` · versão do motor: **1**
Situação: **aguardando validação** (a calculadora só aparece para quem tem `ferramentas:gerir`).

Engenheiro responsável pela validação: ______________________  CREA/CAU: ____________  Data: ___/___/______

## O que conferir

### 1. Fórmulas (por linha de carga)

| Grandeza | Fórmula no motor | Conferido |
|---|---|---|
| Potência absorvida | P_abs = quantidade × P ÷ η | ☐ |
| Potência aparente | S = P_abs ÷ fp | ☐ |
| Corrente de projeto | Ib = P_abs ÷ (k · V · fp); k = 1 (monofásica) ou √3 (trifásica, V entre fases) | ☐ |
| Corrente corrigida | Ib′ = Ib ÷ (FCT · FCA) | ☐ |
| Carga demandada | P_dem = P_abs × fd | ☐ |
| Demanda aparente total | Σ (P_dem ÷ fp) — soma aritmética, a favor da segurança | ☐ |
| Fator de potência médio | kW ÷ kVA da demanda | ☐ |
| Corrente total da demanda | kVA ÷ (k · V) da alimentação | ☐ |

### 2. Tabelas da NBR 5410

**Tabela 40 — FCT (temperatura ambiente, base 30 °C)**

| °C | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PVC 70 °C | 1,22 | 1,17 | 1,12 | 1,06 | 1,00 | 0,94 | 0,87 | 0,79 | 0,71 | 0,61 | 0,50 | — | — | — | — |
| EPR/XLPE 90 °C | 1,15 | 1,12 | 1,08 | 1,04 | 1,00 | 0,96 | 0,91 | 0,87 | 0,82 | 0,76 | 0,71 | 0,65 | 0,58 | 0,50 | 0,41 |

Aceito / corrigir: ______________________

**Tabela 42 — FCA (condutores em feixe, embutidos ou em conduto fechado)**

| Circuitos | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9–11 | 12–15 | 16–19 | ≥ 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FCA | 1,00 | 0,80 | 0,70 | 0,65 | 0,60 | 0,57 | 0,54 | 0,52 | 0,50 | 0,45 | 0,41 | 0,38 |

Aceito / corrigir: ______________________

Só esta linha da Tabela 42 está no motor. Outro método de instalação: o projetista digita FCT/FCA à mão.
A seleção do condutor (Tabelas 36 a 39) **não** faz parte desta calculadora.

### 3. Hipóteses

| Item | Como está no motor | Aceito / corrigir |
|---|---|---|
| Fator de demanda | digitado por linha (padrão 100 %); não vem da NBR 5410, depende da concessionária | |
| Soma de kVA | aritmética (sem ângulos) | |
| Alerta | FCT × FCA < 0,5 | |
| Temperatura | só valores das tabelas (a menos que o FCT seja informado) | |

### 4. Casos de teste (resultado esperado, para comparar com a tela)

| # | Entrada | Esperado |
|---|---|---|
| 1 | Chuveiro 5 500 W, 220 V monofásico, fp 1; 30 °C, 1 circuito | Ib = 25,00 A; Ib′ = 25,00 A |
| 2 | Caso 1 com PVC, 40 °C e 3 circuitos agrupados | FCT 0,87; FCA 0,70; Ib′ = 41,05 A |
| 3 | Motor trifásico 7,5 kW, η 0,88, fp 0,85, 380 V | P_abs = 8 522,7 W; Ib = 15,23 A |
| 4 | Iluminação 2 000 W (127 V, fp 0,92, fd 0,8) + tomadas 3 000 W (127 V, fp 0,8, fd 0,5) + chuveiro 5 500 W (220 V, fd 1); alimentação trifásica 220 V | Instalada 10,5 kW; demanda 8,6 kW; kVA = 1 600/0,92 + 1 500/0,8 + 5 500 = 9,11 kVA |

Os mesmos casos estão em `calc/electrical-demand.test.ts`.

### 5. Adendo — uso do mesmo motor na aba Estudos do projeto

A aba **Estudos** (`/projetos/[id]/estudos`) roda este mesmo motor sobre o levantamento de cargas de um projeto.
Não há fórmula nova, mas há duas agregações para o engenheiro conhecer:

| Item | Como é feito | Conferir |
|---|---|---|
| Lista do estudo | os ambientes são achatados numa lista só ("Ambiente — carga"), com as mesmas condições de instalação para todas as cargas | ☐ |
| Subtotal por ambiente | o motor é rodado só nas cargas do ambiente, com as mesmas condições; potência instalada, demandada e aparente (kVA) dos ambientes somam exatamente ao total; fator de potência médio e corrente total saem dos totais | ☐ |
| Subtotal por tipo de ponto | soma das potências das linhas do motor por rótulo (iluminação, tomada de uso geral/específico, outro); o rótulo não altera a conta | ☐ |
| Fator de demanda | continua só por linha, digitado; o estudo guarda a **fonte** (tabela da concessionária) e ela sai na memória | ☐ |
| Resultado | **não é gravado**: só as entradas. Ao validar, os estudos já criados passam a mostrar números do motor validado | ☐ |

Enquanto esta calculadora estiver em validação, a aba Estudos só aparece para quem tem `ferramentas:gerir`.

## Resultado

☐ Validada sem ressalvas  ☐ Validada com os ajustes anotados acima  ☐ Reprovada

Ressalvas / ajustes pedidos: ________________________________________________________

## Como registrar (para quem faz o commit)

Com a ficha assinada e os ajustes feitos (se houver, incremente `versaoCalc` no registry), preencha em
`src/modules/ferramentas/registry.ts`, na entrada `corrente-demanda`:

```ts
validacao: { por: "Nome — CREA", em: "AAAA-MM-DD", versaoCalc: 1, ficha: "docs/engenharia/validacao/corrente-demanda.md" },
```
