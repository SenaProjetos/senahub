# Anexo E — Copel

Valores literais das normas, "a conferir" até a validação.

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| NTC 900600 | edição não identificada; enviada pelo usuário como a mais atual localizada; base: Relatório SCSC 43.02 do CODI | Método de demanda de edifícios residenciais de uso coletivo |
| NTC 901110 | jul/2026 (rev. 15/07/2026) | Edificações de uso coletivo: faixas de atendimento; sem método de demanda (4.24: do projetista, sem conferência da Copel) |
| NTC 901100 | jul/2020 | Baixa tensão; agrupamentos de medição por soma de correntes (Tabela 3) |
| NTC 903100 | abr/2018 | Média tensão: 75 kW e 2.500 kW |
| NTC 902210 | rev. 13/12/2025 | Recarga de veículos elétricos |
| NTC 841001 | 3ª edição, 12/1999 (considerada vigente pelo usuário) | Anexo 7: fatores de demanda (ar-condicionado, chuveiros, motores, bombas, elevadores, iluminação) |

## 2. Método de demanda (NTC 900600)
- DT = D1 + D2. D1 = a × f, com a = demanda por apartamento pela área útil (Tabela 1, aplicável a partir de 20 m²; de 20 a 42 m², 1,0 kVA) e f = diversidade pelo nº de apartamentos (Tabela 2, até 300). Acima de 400 m²: Y = 0,034939 × X^0,895075.
- Apartamentos de áreas diferentes: média ponderada (ex.: 12 de 97 m² e 18 de 121 m² = 111,4 m², usar 111).
- D2 = soma de: iluminação (100% nos 10 kW iniciais, 25% acima, FP do projeto); tomadas (20%, FP do projeto); elevadores e bombas (Tabela 3, diversidade 1,0 por grupo); outras cargas motrizes (Tabela 3, diversidade 1,0); cargas não motrizes (FD pela característica de uso, diversidade 1,0, FP do projeto).
- Fator multiplicador (item 4): a Copel recomenda 1,0 no dimensionamento dos seus materiais; o projetista usa 1,2 sobre a demanda total, ou superior se julgar conveniente. Critério diferente só vale se a demanda não for inferior à do critério × 1,2.
- Recomendação (3.3.3): dimensionar com corrente não inferior à correspondente a 26 kVA mais a demanda do condomínio.
- Tabela 3: potência do motor × quantidade de motores do mesmo tipo de instalação, em kVA, para trifásicos e monofásicos; a coluna de 1 motor é média de fabricantes. Motores de reserva não entram (exemplo: 4 bombas, 2 de reserva, valem 2).
- Exemplo (item 5): 30 apartamentos (12 de 97 m² e 18 de 121 m²): Da = 2,37; F = 23,48; D1 = 55,65; condomínio = 48,58; total 104,23 kVA (sem o fator 1,2).

## 3. Agrupamentos de medição em baixa tensão (NTC 901100, 5.5.2 e Tabela 3)
Sem projeto, a categoria e o disjuntor geral saem da soma das correntes dos disjuntores por fase (mínimo de 50 A por unidade): até 126 A, corrente 100 A, categoria 41; 127 a 150 A, 125 A, 42; 151 a 176 A, 150 A, 43; 177 a 200 A, 175 A, 44; 201 a 300 A, 200 A, 45. Acima de 300 A ou outro FD: disjuntor geral limitado a 200 A, com formulário e ART. Acima de 75 kVA: projeto.

## 4. Atendimento (NTC 901110, 5.1 a 5.3; NTC 903100, 4.1)
- Até 76 kVA (disjuntor geral até 200 A): baixa tensão, 220/127 V, direta da rede.
- De 76 a 300 kVA (disjuntor geral até 800 A): baixa tensão, com transformador da Copel na rede e ramal subterrâneo; projeto obrigatório.
- Acima de 300 kVA: média tensão, transformador da Copel em cabine; projeto obrigatório; ramal subterrâneo de média tensão de até 50 m.
- Individual: média tensão com carga instalada acima de 75 kW e demanda até 2.500 kW.

## 5. Recarga (NTC 902210)
FD definido pelo projetista (8.1). Potências típicas (Tabela 2): lenta bifásica 3,6 e 7,4 kW; semirrápida trifásica 11 kW (220/127 V) e 22 kW (380/220 V); rápida 43 kW ou mais. Baixa tensão acima de 75 kVA e até 300 kVA, com viabilidade (4.3). Categoria especial, disjuntor bifásico de 32 A, 7 kVA e 6 mm², só para recarga em centro de medição de condomínio (4.10). Gerenciamento de carga é citado como alternativa (8.4 e 8.5), sem fator.

## 6. Fatores de demanda da carga instalada (NTC 841001, anexo 7)
A norma é de projeto de redes de distribuição urbana, mas o anexo 7 traz os fatores típicos por tipo de carga. O usuário considera a 3ª edição (dezembro/1999) a vigente. Esses valores são os FD sugeridos para a Copel nos cálculos por carga instalada.

| Tabela | Chave | Resultado |
|---|---|---|
| 02 | eletrodoméstico | potência aproximada (valores mínimos considerados pela Copel) |
| 03 | capacidade do ar-condicionado tipo janela (8.500 a 30.000 BTU/h) e tensão | corrente (A), potência (W) e potência aparente (VA); ex.: 12.000 BTU/h = 1.600 W, 1.900 VA em 127 V e 2.100 VA em 220 V |
| 04 | nº de ar-condicionado tipo janela, uso comercial | FD: 1 a 10 = 1,00; 11 a 20 = 0,90; 21 a 30 = 0,82; 31 a 40 = 0,80; 41 a 50 = 0,77; acima de 50 = 0,75. Unidade central = 1,00. Residencial = 1,00 |
| 05 | nº de chuveiros, torneiras, aquecedores de água e ferros elétricos (cada tipo contado à parte) | FD: 1 e 2 = 1,00; 3 = 0,84; 4 = 0,76 … 20 = 0,40 … 61 ou mais = 0,33 (tabela completa no PDF) |
| 06 e 07 | potência do motor (monofásicos e trifásicos) | corrente e corrente de partida |
| 08 | raios X; máquinas de solda | FD: o 1º aparelho 1,00 e os restantes 0,60 |
| 09 | bombas d'água | 1ª bomba 1,00; restantes 0,50 |
| 10 | elevadores | até dois 1,00; restantes 0,60 |
| 11 | nº total de motores | FD: 1 = 1,0; 2 = 0,90; 3 a 5 = 0,80; mais de 5 = 0,70 |
| 12 | tipo de uso (iluminação) | FD por faixa de kW: escolas 1,00 nos 12 kW iniciais e 0,50 acima; escritórios 1,00 nos 20 kW iniciais e 0,70 acima; hospitais 0,40 nos 50 kW iniciais e 0,20 acima; auditórios, bancos, lojas, barbearias, clubes, garagens comerciais e igrejas 1,00 |

Regras das notas: equipamentos iguais contam um como o maior e os outros como segundos; equipamentos que partem juntos somam como um só motor. Na Tabela 12, a Copel pode aceitar outros valores se o projeto de iluminação seguir a norma de iluminância.
Dividir por FP e multiplicar pelo FD: PD = (N × P ÷ FP) × FD, como no anexo 3 (levantamento de cargas) da NTC 841001.
