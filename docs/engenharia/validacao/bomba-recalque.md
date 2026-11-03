# Ficha de validação — Bomba de recalque

Chave: `bomba-recalque` · motores `src/modules/ferramentas/calc/pump-recalque.ts` e `calc/hidraulica.ts` · versão do motor: **1**
Situação: **aguardando validação** (a calculadora só aparece para quem tem `ferramentas:gerir`).

Engenheiro responsável pela validação: ______________________  CREA/CAU: ____________  Data: ___/___/______

## O que conferir

### 1. Fórmulas

| Grandeza | Fórmula no motor | Conferido |
|---|---|---|
| Consumo diário (por ocupação) | CD = unidades × consumo por unidade (mesma tabela da ficha de Reservatórios) | ☐ |
| Vazão de recalque | Q = CD ÷ horas de funcionamento | ☐ |
| Diâmetro de Forchheimer | D = 1,3 · (h/24)^¼ · √Q (Q em m³/s, D em m) | ☐ |
| Diâmetro do recalque | menor DN comercial de PVC soldável com diâmetro **interno** ≥ D de Forchheimer | ☐ |
| Diâmetro da sucção | DN comercial imediatamente acima do recalque | ☐ |
| Velocidade | v = 4·Q ÷ (π·D²), com D interno | ☐ |
| Perda unitária (Hazen-Williams) | J = 10,643 · Q^1,85 · C^-1,85 · D^-4,87 (m/m) | ☐ |
| Perda de carga do trecho | hf = J · (L real + Leq das conexões) | ☐ |
| Altura geométrica | Hg = altura de sucção + altura de recalque (sucção negativa se afogada) | ☐ |
| Altura manométrica | Hm = Hg + hf recalque + hf sucção | ☐ |
| Potência absorvida | P (cv) = 9810 · Q · Hm ÷ (η · 735,5) | ☐ |
| Motor | menor potência comercial ≥ P · (1 + margem) | ☐ |

### 2. Hipóteses e valores padrão (decisão de projeto, não da norma)

| Item | Valor no motor | Aceito / corrigir |
|---|---|---|
| Funcionamento da bomba | 6 h/dia (aceita até 24) | |
| Coeficiente C (PVC novo) | 140 (aceita 60 a 160) | |
| Rendimento do conjunto | 60 % (aceita 10 % a 95 %) | |
| Limite de velocidade no recalque | 3,0 m/s (alerta acima) | |
| Limite de velocidade na sucção | 2,0 m/s (alerta acima) | |
| Alerta de NPSH | bomba mais de 5 m acima da água | |
| Perdas localizadas | comprimento equivalente digitado, sem tabela de conexões | |
| NPSH disponível | **não calculado** | |

### 3. Margem de potência (Macintyre) e motores comerciais

| Potência absorvida | Margem | Aceito / corrigir |
|---|---|---|
| até 2 cv | 50 % | |
| de 2 a 5 cv | 30 % | |
| de 5 a 10 cv | 20 % | |
| de 10 a 20 cv | 15 % | |
| acima de 20 cv | 10 % | |

Motores (cv): 0,25 · 0,33 · 0,5 · 0,75 · 1 · 1,5 · 2 · 3 · 4 · 5 · 6 · 7,5 · 10 · 12,5 · 15 · 20 · 25 · 30 · 40 · 50 · 60 · 75 · 100 · 125 · 150 · 200 — aceito / corrigir: ______

### 4. Diâmetros do PVC soldável marrom (NBR 5648)

| DN (mm) | Polegadas | Interno (mm) | Aceito / corrigir |
|---|---|---|---|
| 20 | 1/2″ | 17,0 | |
| 25 | 3/4″ | 21,6 | |
| 32 | 1″ | 27,8 | |
| 40 | 1 1/4″ | 35,2 | |
| 50 | 1 1/2″ | 44,0 | |
| 60 | 2″ | 53,4 | |
| 75 | 2 1/2″ | 66,6 | |
| 85 | 3″ | 75,6 | |
| 110 | 4″ | 97,8 | |

Fonte indicada pelo agente: tabelas usuais de fabricantes de PVC soldável. O engenheiro confirma as medidas do fabricante que o escritório adota.

### 5. Caso de teste (resultado esperado, para comparar com a tela)

Entrada: consumo diário informado 30 000 L/dia · 6 h/dia · altura de sucção 2 m · altura de recalque 18 m · sucção 3 m + 5 m de Leq · recalque 25 m + 15 m de Leq · C = 140 · η = 60 % · DN automático.

| Grandeza | Esperado |
|---|---|
| Vazão | 5 m³/h = 1,389 L/s |
| Forchheimer | 34,26 mm |
| Recalque | DN40 (interno 35,2 mm), v = 1,43 m/s, J = 0,0706 m/m, hf = 2,83 mca |
| Sucção | DN50 (interno 44,0 mm), v = 0,91 m/s, J = 0,0238 m/m, hf = 0,19 mca |
| Hg / Hm | 20,00 m / 23,02 mca |
| Potência | 0,71 cv; com 50 % de margem 1,07 cv; motor de **1,5 cv** |

O mesmo caso está em `calc/pump-recalque.test.ts`.

## Perguntas da revisão de 03/11/2026

- [ ] **Fórmula de perda de carga.** O cálculo usa Hazen-Williams (C = 140 para PVC). Para PVC de diâmetro pequeno a
  NBR 5626:1998 recomendava Fair-Whipple-Hsiao: em DN25 com 0,3 L/s, HW dá J = 0,0447 m/m e FWH dá 0,0494 (HW ≈ 10 %
  menos perda). Nos casos desta ficha a diferença é menor que 1 %. Mantém HW?
- [ ] **Velocidade máxima na sucção.** O limite está em 2,0 m/s; a literatura costuma usar 1,0–1,5 m/s. Qual adotar?
- [ ] **Horas de funcionamento.** Não há aviso para bomba ligada mais de 6,67 h/dia (vazão abaixo de 15 % do consumo
  diário por hora, NB-92/Creder). Incluir o aviso? E qual edição da NBR 5626 a ficha deve citar (2020)?

## Resultado

☐ Validada sem ressalvas  ☐ Validada com os ajustes anotados acima  ☐ Reprovada

Ressalvas / ajustes pedidos: ________________________________________________________

## Como registrar (para quem faz o commit)

Com a ficha assinada e os ajustes feitos (se houver, incremente `versaoCalc` no registry), preencha em
`src/modules/ferramentas/registry.ts`, na entrada `bomba-recalque`:

```ts
validacao: { por: "Nome — CREA", em: "AAAA-MM-DD", versaoCalc: 1, ficha: "docs/engenharia/validacao/bomba-recalque.md" },
```

`calc/hidraulica.ts` é compartilhado com a Bomba de Piscina: mudou fórmula ou tabela ali, incremente `versaoCalc`
das **duas** calculadoras e valide de novo.
