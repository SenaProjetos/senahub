# Ficha de validação — Bomba de piscina

Chave: `bomba-piscina` · motores `src/modules/ferramentas/calc/pool-pump.ts` e `calc/hidraulica.ts` · versão do motor: **1**
Situação: **aguardando validação** (a calculadora só aparece para quem tem `ferramentas:gerir`).

Engenheiro responsável pela validação: ______________________  CREA/CAU: ____________  Data: ___/___/______

## O que conferir

### 1. Fórmulas

| Grandeza | Fórmula no motor | Conferido |
|---|---|---|
| Volume | retangular: C × L × h médio · circular: π·D²/4 × h médio · ou volume informado | ☐ |
| Vazão de recirculação | Q = V ÷ tempo de recirculação | ☐ |
| Diâmetro da sucção | menor DN comercial com v ≤ 1,8 m/s | ☐ |
| Diâmetro do retorno | menor DN comercial com v ≤ 3,0 m/s | ☐ |
| Velocidade | v = 4·Q ÷ (π·D²), com D interno | ☐ |
| Perda unitária (Hazen-Williams) | J = 10,643 · Q^1,85 · C^-1,85 · D^-4,87 (m/m) | ☐ |
| Perda de carga do trecho | hf = J · (L real + Leq das conexões) | ☐ |
| Altura manométrica | Hm = hf sucção + hf retorno + perda nos equipamentos + pressão nos retornos | ☐ |
| Potência absorvida | P (cv) = 9810 · Q · Hm ÷ (η · 735,5) | ☐ |
| Motor | menor potência comercial ≥ P · (1 + margem) | ☐ |
| Área filtrante (só com taxa informada) | A = Q ÷ taxa de filtração | ☐ |

Circuito fechado com superfície livre: o motor **não** soma desnível geométrico. Confirmar que vale também com a bomba acima do nível da água (carga de escorva fora do escopo).

### 2. Hipóteses e valores padrão (decisão de projeto — confirmar na NBR 10339)

| Item | Valor no motor | Aceito / corrigir |
|---|---|---|
| Tempo de recirculação, uso residencial | 6 h | |
| Tempo de recirculação, uso coletivo (clube, hotel, condomínio) | 4 h | |
| Tempo de recirculação, infantil ou rasa | 2 h | |
| Limite de velocidade na sucção | 1,8 m/s | |
| Limite de velocidade no retorno | 3,0 m/s | |
| Coeficiente C (PVC novo) | 140 (aceita 60 a 160) | |
| Rendimento do conjunto | 50 % (aceita 10 % a 95 %) | |
| Perda dos equipamentos | sem padrão (0 com alerta); vem do fabricante | |
| Pressão nos retornos | sem padrão (0); vem do fabricante | |
| Taxa de filtração | sem padrão; sem ela não há área filtrante | |

### 3. Margem de potência, motores e diâmetros

Mesmas tabelas da ficha da Bomba de Recalque (margem por faixa, motores comerciais, PVC soldável NBR 5648):
conferir lá. Uma correção vale para as duas calculadoras.

### 4. Caso de teste (resultado esperado, para comparar com a tela)

Entrada: retangular 8 × 4 m, profundidade média 1,5 m · uso residencial · sucção 4 m + 6 m de Leq · retorno 10 m + 8 m de Leq · filtro 4 mca · retornos 2 mca · C = 140 · η = 50 % · DN automático.

| Grandeza | Esperado |
|---|---|
| Volume / vazão | 48 m³ / 8 m³/h = 2,222 L/s |
| Sucção | DN50 (interno 44,0 mm), v = 1,46 m/s, J = 0,0568 m/m, hf = 0,57 mca |
| Retorno | DN40 (interno 35,2 mm), v = 2,28 m/s, J = 0,1685 m/m, hf = 3,03 mca |
| Hm | 9,60 mca |
| Potência | 0,57 cv; com 50 % de margem 0,85 cv; motor de **1 cv** |
| Com taxa de 25 m³/h·m² | área filtrante 0,32 m² |

O mesmo caso está em `calc/pool-pump.test.ts`.

## Resultado

☐ Validada sem ressalvas  ☐ Validada com os ajustes anotados acima  ☐ Reprovada

Ressalvas / ajustes pedidos: ________________________________________________________

## Como registrar (para quem faz o commit)

Com a ficha assinada e os ajustes feitos (se houver, incremente `versaoCalc` no registry), preencha em
`src/modules/ferramentas/registry.ts`, na entrada `bomba-piscina`:

```ts
validacao: { por: "Nome — CREA", em: "AAAA-MM-DD", versaoCalc: 1, ficha: "docs/engenharia/validacao/bomba-piscina.md" },
```

`calc/hidraulica.ts` é compartilhado com a Bomba de Recalque: mudou fórmula ou tabela ali, incremente `versaoCalc`
das **duas** calculadoras e valide de novo.
