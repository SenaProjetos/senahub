# Anexo F — Enel (Ceará, Rio de Janeiro e São Paulo)

As normas da Enel Grids são unificadas, com notas por distribuidora. Valores literais, "a conferir".

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| GRI-EDBR-CNC-GRI-0018 | v02, 08/09/2025 | Conexão coletiva em tensão secundária |
| GRI-EDBR-CNC-GRI-0017 | v02, 06/03/2025 | Conexão individual em tensão secundária |
| GRI-EDBR-CNC-GRI-0004 | v05, 20/12/2024 | Tensão primária até 34,5 kV |
| CNC-OMBR-MAT-19-0280-EDBR | v02, 26/05/2023 | Conexão de recarga de veículos elétricos |

Cancelados e fora da especificação: LIG BT de São Paulo (12ª edição, 2014), CNC-18-0165-EDRJ (Enel Rio), CNC-18-0126-EDCE (Enel Ceará).

## 2. Método de demanda
As normas vigentes **não prescrevem método de demanda nem tabelas de fator de demanda**. A 0018 manda determinar os componentes da entrada "em função da soma das demandas, conforme cálculo de demanda"; a 0017 deixa a demanda trifásica a critério do projetista, limitada a 75 kW de carga instalada; a 0280 atribui o cálculo ao responsável técnico. Todos os fatores da Enel ficam em branco ("sem padrão") para o projetista digitar.

## 3. Estrutura de cálculo mantida por decisão do usuário (IT 263, v01, 02/03/2018)
A WKI-OMBR-MAT-18-0263-INBR foi cancelada pela 0017 (29/01/2024). Por decisão do usuário, só a **estrutura lógica** é mantida, **sem nenhum valor**, marcada "prática informada pelo usuário; fonte histórica cancelada".
- Residencial individual: a = soma dos módulos por cômodo (tipo × quantidade × módulo kVA) ÷ divisor por nº de quartos × fator de localização; b = aquecimento (potência × FD); c = motores (por potência e quantidade, com diversidade); d = iluminação especial. DC = a + 100% da maior entre b, c, d + percentual das demais.
- Comercial e industrial: DCOM = aquecimento + refrigeração + iluminação e tomadas + motores + solda a transformador (maior, 2º, 3º e demais com percentuais).
- Agrupada residencial: DDI por nº de clientes e tipo de ligação; DTC = nº de unidades × DDI; DSERV = 100% da maior entre aquecimento, motores, iluminação e tomadas, refrigeração + percentual das demais; DR = (DTC + DSERV) × fator. Ligações diferentes no mesmo prédio usam o total de clientes do prédio para consultar o DDI.
- Comercial ou industrial: DR = (DCOM + DSERV) × fator. Misto: DAG = (DRES + DCOM) × fator e DR = (DRES + DCOM + DSERV) × fator.
- Não entram: as tabelas de dimensionamento da IT 263.

## 4. Parâmetros por distribuidora
- Estudo de viabilidade da rede (0017, 7.10.2): potência instalada acima de 15 kW (Enel SP e RJ) ou 20 kW (Enel CE), ou igual ou superior a 50% da potência do transformador.
- Passa a conexão coletiva a partir de 2 medições (SP); 3 bifásicas ou 2 trifásicas (RJ e CE).
- São Paulo: baixa tensão acima de 75 kW com demanda calculada pelo cliente de até 225 kVA; coletiva radial de 75 kW a 225 kVA pode ser Grupo B; medição indireta e sistema delta exclusivos de SP.
- Ceará: acima de 70 kW de carga instalada, consultar a Enel Ceará sobre a caixa de medição.

## 5. Atendimento (0018, 7.8.2; 0280)
Por unidade consumidora: baixa tensão até 75 kW de carga instalada; média tensão acima de 75 kW com demanda contratada abaixo de 2.500 kW; acima de 2.500 kW, tensão de 69 kV ou mais. Coletiva acima de 75 kW pode ser Grupo B se mais de 50% das unidades forem do Grupo B, com solicitação e estudo. Centro de transformação de superfície compacto em sistema radial: demanda total até 630 kVA (7.11.3).

## 6. Recarga (0280)
Sem FD tabelado; cálculo da corrente de demanda é do responsável técnico. Potências de referência (Tabela 4): lenta 7 kW, semirrápida 22 kW, rápida 50 kW. Ponto de medição novo exclusivo para recarga é admitido (nota 3).
