# Ficha de validação — Reservatórios (inferior e superior)

Chave: `reservatorios` · motor `src/modules/ferramentas/calc/reservoir.ts` · versão do motor: **1**
Situação: **aguardando validação** (a calculadora só aparece para quem tem `ferramentas:gerir`).

Engenheiro responsável pela validação: ______________________  CREA/CAU: ____________  Data: ___/___/______

## O que conferir

### 1. Fórmulas

| Grandeza | Fórmula no motor | Conferido |
|---|---|---|
| Consumo diário | CD = unidades × consumo por unidade (L/dia) | ☐ |
| Reserva de consumo | V_res = CD × dias de reserva | ☐ |
| Inferior (dois reservatórios) | fração × V_res | ☐ |
| Superior (dois reservatórios) | (1 − fração) × V_res | ☐ |
| Só um reservatório | recebe todo V_res | ☐ |
| Reserva técnica de incêndio (calculada) | RTI = hidrantes × vazão (L/min) × tempo (min) | ☐ |
| Total de cada reservatório | consumo + RTI alocada | ☐ |
| Área em planta | V (m³) ÷ altura útil | ☐ |

### 2. Hipóteses e valores padrão (decisão de projeto, não da norma)

| Item | Valor no motor | Aceito / corrigir |
|---|---|---|
| Dias de reserva | 2 (aceita 0,1 a 10; avisa abaixo de 1) | |
| Parcela no inferior | 60 % (3/5 inferior, 2/5 superior); aceita 5 % a 95 % | |
| RTI no superior por padrão | sim; pode ir para o inferior | |
| RTI sem valor padrão | o projetista informa (IT do Corpo de Bombeiros do estado) | |

### 3. Tabela de consumo por unidade (L/dia)

| Ocupação | Unidade | Valor no motor | Aceito / corrigir |
|---|---|---|---|
| Residência popular | pessoa | 120 | |
| Residência de padrão médio | pessoa | 150 | |
| Residência de alto padrão | pessoa | 300 | |
| Apartamento | pessoa | 200 | |
| Hotel (sem cozinha e lavanderia) | hóspede | 120 | |
| Hospital | leito | 250 | |
| Escola — externato | aluno | 50 | |
| Escola — semi-internato | aluno | 100 | |
| Escola — internato | aluno | 150 | |
| Escritório | pessoa | 50 | |
| Restaurante | refeição | 25 | |
| Garagem e estacionamento | automóvel | 50 | |
| Shopping center | m² de área construída | 5 | |

Fonte indicada pelo agente: valores usuais da literatura de instalações prediais (Macintyre, Creder).
A NBR 5626 não fixa consumo per capita — o engenheiro confirma a fonte adotada pelo escritório.

### 4. Casos de teste (resultado esperado, para comparar com a tela)

| # | Entrada | Esperado |
|---|---|---|
| 1 | Residência média, 20 pessoas, 2 dias, inferior + superior 60 % | CD = 3 000 L; reserva = 6 000 L; inferior = 3 600 L; superior = 2 400 L |
| 2 | Caso 1 + RTI calculada 2 hidrantes × 125 L/min × 60 min, no superior | RTI = 15 000 L; superior = 17 400 L; total = 21 000 L |
| 3 | Caso 1 + alturas úteis 1,5 m (inf.) e 1,2 m (sup.) | inferior 2,40 m²; superior 2,00 m² |
| 4 | 10 pessoas, só superior, 5 m³ de RTI informada | superior = 3 000 + 5 000 = 8 000 L |

Os mesmos casos estão em `calc/reservoir.test.ts`.

## Resultado

☐ Validada sem ressalvas  ☐ Validada com os ajustes anotados acima  ☐ Reprovada

Ressalvas / ajustes pedidos: ________________________________________________________

## Como registrar (para quem faz o commit)

Com a ficha assinada e os ajustes feitos (se houver, incremente `versaoCalc` no registry), preencha em
`src/modules/ferramentas/registry.ts`, na entrada `reservatorios`:

```ts
validacao: { por: "Nome — CREA", em: "AAAA-MM-DD", versaoCalc: 1, ficha: "docs/engenharia/validacao/reservatorios.md" },
```

Um teste confere que `versaoCalc` do registro bate com a versão do motor. Mudou fórmula depois? Incremente
`versaoCalc` e valide de novo — a calculadora volta sozinha a "em validação".
