# Ficha de validação — Destino final do esgoto (sumidouro)

Chave: `esgoto-infiltracao` · motor `src/modules/ferramentas/calc/soil-infiltration.ts` · versão do motor: **1**
Situação: **aguardando validação** (a calculadora só aparece para quem tem `ferramentas:gerir`).

Engenheiro responsável pela validação: ______________________  CREA/CAU: ____________  Data: ___/___/______

## Ponto de partida: qual norma vale

A NBR 7229:1993 (tanques sépticos) e a NBR 13969:1997 (tratamento complementar e disposição final) foram
**substituídas pela NBR 17076:2024**, segundo as fontes consultadas (trabalhos do IFSC e da UDESC). O texto da
NBR 17076 **não foi lido** por quem escreveu a calculadora. Tudo abaixo vem da prática de projeto e das normas
antigas. O engenheiro confere cada item contra a NBR 17076:2024 e contra a exigência do órgão sanitário local.

Fora do escopo (a calculadora não faz): vala de infiltração, filtro anaeróbio, camada impenetrável,
distâncias a poços, divisas e edificações, tanque séptico.

## O que conferir

### 1. Fórmulas

| Grandeza | Fórmula no motor | Conferido |
|---|---|---|
| Volume diário | V = pessoas × contribuição por pessoa, ou volume informado | ☐ |
| Tempo por centímetro | t = tempo do furo ÷ rebaixamento medido (min/cm) | ☐ |
| Taxa de percolação | t × 100 (min/m), só para relatório | ☐ |
| Coeficiente de infiltração por furo | Ci = 490 ÷ (t + 2,5) (L/m²·dia) | ☐ |
| Ci adotado | o **menor** dos furos (sumidouro) | ☐ |
| Área de infiltração | A = V ÷ Ci | ☐ |
| Área de uma unidade | π·D·H (só parede lateral); com a chave "contar o fundo": + π·D²/4 | ☐ |
| Profundidade útil | H = (A ÷ unidades − fundo) ÷ (π·D) | ☐ |
| Fundo | topo + H | ☐ |
| Profundidade máxima pelo lençol | H_max = nível d'água − distância mínima − topo | ☐ |
| Unidades para caber | n = ⌈A ÷ (π·D·H_max + fundo)⌉ | ☐ |

### 2. Hipóteses e valores padrão

| Item | Valor no motor | Aceito / corrigir |
|---|---|---|
| Curva Ci = 490/(t + 2,5) | de fonte que cita a NBR 7229; não conferida na NBR 17076 | |
| Furo que vale | o mais lento (menor Ci) | |
| Número mínimo de furos | o motor só avisa quando há um furo só; não há mínimo | |
| Distância mínima fundo–lençol | 1,50 m (editável) | |
| Área que conta | só a parede lateral (fundo opcional) | |
| Uso alternado das unidades | só um alerta quando há 1 unidade; o número de unidades é do projetista | |
| Contribuição por pessoa | **sem valor padrão**: o projetista digita | |
| Limite de aptidão do solo (Ci mínimo ou t máximo) | **não há**: o motor não recusa solo pouco permeável | |

### 3. Caso de teste (resultado esperado, para comparar com a tela)

Entrada: 5 pessoas × 150 L/dia · furos (10 min para 1 cm), (40 min para 2 cm), (30 min para 3 cm) · D = 1,2 m ·
2 unidades · topo a 0,5 m · nível d'água a 6 m · distância mínima 1,5 m · fundo não conta.

| Grandeza | Esperado |
|---|---|
| Ci por furo | 39,2 · 21,78 · 39,2 L/m²·dia; adotado 21,78 |
| V / A | 750 L/dia / 34,44 m² |
| Por unidade | 17,22 m²; H = 4,57 m; fundo a 5,07 m |
| Lençol | H máximo 4,0 m; **não respeitado**; 3 unidades resolvem (H = 3,05 m) |
| Contando o fundo | H = 4,27 m (0,3 m a menos) |

O mesmo caso está em `calc/soil-infiltration.test.ts`.

## Perguntas da revisão de 03/11/2026

Achados de uma revisão do código, que dependem da norma — responda junto com a ficha:

- [ ] **Uso alternado × simultâneo.** Com 2 ou mais unidades, o cálculo divide a área A entre elas (A ÷ n), o que supõe
  todas recebendo esgoto ao mesmo tempo. Se a norma exigir uso alternado, cada unidade (ou cada conjunto) precisa da
  área A inteira — no caso da ficha, H passaria de 4,57 m para cerca de 9,1 m. Qual vale? Se for alternado, o cálculo
  ganha a escolha "simultâneas × alternadas".
- [ ] **Nível do lençol.** A tela pede o "nível d'água na sondagem". A distância de 1,50 m das normas antigas conta do
  nível MÁXIMO do lençol (época de chuvas); sondagem feita na seca daria resultado do lado inseguro. Trocar o rótulo
  para "nível máximo do lençol (época de chuvas)"? A NBR 17076:2024 mantém 1,50 m?

## Resultado

☐ Validada sem ressalvas  ☐ Validada com os ajustes anotados acima  ☐ Reprovada

Ressalvas / ajustes pedidos: ________________________________________________________

## Como registrar (para quem faz o commit)

Com a ficha assinada e os ajustes feitos (se houver, incremente `versaoCalc` no registry), preencha em
`src/modules/ferramentas/registry.ts`, na entrada `esgoto-infiltracao`:

```ts
validacao: { por: "Nome — CREA", em: "AAAA-MM-DD", versaoCalc: 1, ficha: "docs/engenharia/validacao/esgoto-infiltracao.md" },
```

Se a NBR 17076:2024 trouxer outra curva de Ci, outra distância ao lençol ou outra regra de unidades, o ajuste
entra no motor e `versaoCalc` sobe para 2 antes de validar.
