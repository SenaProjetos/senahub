# Anexo G — Energisa

Norma de Distribuição Unificada do Grupo Energisa. Valores literais, "a conferir".

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| NDU-003 | v8.1, fev/2025 | Múltiplas unidades: método de demanda e atendimento |
| NDU-001 | v7.0, nov/2024 | Edificações individuais em tensão secundária (identificada; tabelas de FD não lidas) |
| NDU-042 | v2.1, vigência a partir de jan/2027 (edição futura, usada por decisão do usuário) | Recarga |

NDU-042: a versão atual, válida até o fim de 2026, não entra. A ferramenta mostra aviso de vigência futura.

## 2. Método de demanda (NDU-003, item 9), em kW com FP 0,92 embutido
- Critério da demanda (9.1): D (kVA) = d (kW) ÷ 0,92; d = d1 + d2 + d3 + d4 + d5: iluminação e tomadas (Tabela 8); aquecimento de água (Tabela 9); secadora, micro-ondas, lava-louça e hidromassagem (Tabela 10); fogões e fornos (Tabela 11); ar-condicionado (Tabelas 13 e 14).
- Critério da área útil (9.2): d = f × a, com f da Tabela 6 e a da Tabela 7, em **kW**.
- Apartamentos "tipo" iguais: D = (d1 + d2) × 1,3 + dce. d2 = condomínio em kW por carga instalada; dce = cargas especiais, como motores, em kVA (Tabelas 15 a 17), fora do multiplicador.
- Apartamentos "tipo" e "duplex": D = (d1 + d2 + d3) × 1,52 + dce, com d2 = (f × a) + (nº de duplex × b) e b = aquecimento e ar-condicionado por apartamento.
- Misto: D = D1 + D2 + dce, com D1 pela fórmula residencial e D2 = nº de lojas × d3 × 1,1.
- Apartamentos de metragens distintas: calcular por conjunto de mesma área. Previsão de aumento de carga: não aplicar a constante; converter direto com FP 0,92. Até 3 unidades: carga instalada pela NDU-001 (9.3).
- O método é mínimo; outro método exige apresentar os dois cálculos e justificar. A Energisa pode exigir outro a qualquer momento.

## 3. Tabelas (estrutura)
| Tabela | Chave | Resultado |
|---|---|---|
| 6 | nº de unidades habitacionais | f (mesmo f das demais; 51 = 35,9) |
| 7 | faixa de área útil | kW por unidade (até 40 m² = 0,92; 96–100 m² = 1,99; 56–60 m² = 1,25) |
| 8 a 14 | tipo de carga | FD (não lidas) |
| 15 a 17 | motores e equipamentos | kVA (não lidas) |

A Tabela 7 equivale à tabela do CODI em kVA × 0,92 (2,16 kVA = 1,99 kW).

## 4. Atendimento (NDU-003, 6.7)
- Unidade com carga acima de 75 kW em edifício de múltiplas unidades: transformador particular na propriedade do cliente, em média tensão (6.7.6).
- Edificação a partir de 4 unidades com demanda de 276 a 2.500 kW: subestação aérea (transformadores de até 300 kVA, no máximo dois, sem paralelismo, na calçada) ou abrigada (6.7.4). Acima de 2.500 kW: projeto especial (6.7.5). A faixa de 75 a 275 kW não foi lida a fundo.
- Mais de uma entrada: no máximo duas, com condições de separação física (6.7.3).

## 5. Recarga (NDU-042)
Sem sistema de gerenciamento inteligente (SGIR) comprovado, FD = 1; com SGIR, dimensiona-se pelo maior entre o limite do SGIR e a maior demanda resultante. Carga perturbadora: estação acima de 22 kW, ou soma de estações igual ou superior a 22 kW; com isso e potência instalada total de 50 kW ou mais, o atendimento é em média tensão. Potências típicas: até 3,7 kW; 3,7 a 7,4 kW; 11 a 22 kW; 43 a 100 kW; 150 kW ou mais.
