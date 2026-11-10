# Anexo A — Neoenergia (Coelba, Pernambuco, Cosern, Elektro e Brasília)

Valores literais das normas, todos "a conferir" até a validação de um engenheiro. Um conjunto de regras serve às cinco distribuidoras; os parâmetros próprios de cada uma estão no item 2.

## 1. Documentos e edições
| Documento | Edição | Conteúdo usado |
|---|---|---|
| DIS-NOR-053 | Rev. 06, 09/09/2025 | Múltiplas unidades até 34,5 kV; Anexo I (método de demanda) |
| DIS-NOR-030 | Rev. 07, 17/04/2026 | Tensão secundária, edificações individuais; carga instalada e fatores de demanda (Anexo II) |
| DIS-NOR-036 | Rev. 06 | Média tensão, edificação individual (lida só em parte) |
| DIS-NOR-066 | Rev. 01, 16/12/2025 | 69, 88 e 138 kV: demanda de 2.500 kW ou mais |
| DIS-NOR-063 | Rev. 00, 16/05/2022 | Medição por pavimento com barramento blindado (só limites) |

Fora da especificação: NTD 6.07 (Brasília, 2014), por a DIS-NOR-053 cobrir Brasília; DIS-ETE-145 e 146 (construtivos).

## 2. Parâmetros por distribuidora
- DIS-NOR-030: Tabela 1 (Coelba), Tabela 2 (Pernambuco, Cosern e Brasília), Tabela 3 (Elektro), Tabela 4 (clientes rurais da Elektro). São tabelas de dimensionamento de ramal e entrada, com chave carga instalada (kW) ou demanda (kVA).
- DIS-NOR-053: tensão padrão 13,8 kV e 380/220 V para Brasília, Cosern e Pernambuco; outras para Coelba e Elektro. Brasília: cubículos de 80 A e faixa de condutores própria.
- O método de demanda e as tabelas de FD são comuns às cinco.

## 3. Método de demanda — múltiplas unidades residenciais (DIS-NOR-053, Anexo I)
1. Agrupar os apartamentos por área útil; Dr = Σ (Dapto do tipo × nº de aptos). Dapto: Quadro 35.
2. Dtr = Dr × Fc. Fc: Quadro 36, pelo **nº total de apartamentos** (não por tipo).
3. Fr: Quadro 37, escolhido pela demanda já com Fc: até 25 kVA = 1,5; mais de 25 a 50 = 1,3; mais de 50 a 100 = 1,2; mais de 100 = 1,1. Fator acima do recomendado exige justificativa.
4. Drf = Dtr × Fr.
5. Demanda total da edificação: Ded = Drf + Ds + Dc + Dve (Ds = serviço do condomínio, Dc = comercial, ambos por carga instalada; Dve = recarga).
6. Mais de um bloco (item 9): Fc pelo total de apartamentos atendidos pelo transformador ou QGD; Dte = ADrf + ADs + ADc.
7. Studio, smart e home studio acima de 15 unidades: Fc = 90%, independente da quantidade (opcionalmente, carga instalada) (6.25.1).
8. Demanda individual de cada apartamento: carga instalada (6.22.3). Mínimos: 380/220 V, 46 kVA, 16 mm², disjuntor de 70 A (Tabela 2); 220/127 V, Tabela 1, 35 mm², disjuntor de 100 A.
9. Condomínio e comercial: carga instalada, conforme DIS-NOR-030, 6.27: D = a+b+c+d+e+f+g+h+i.

## 4. Tabelas (estrutura; valores no PDF da norma)
| Tabela | Chave | Resultado |
|---|---|---|
| 053, Quadro 35 | faixa de área útil (até 40 … 901–1000 m²) | kVA por apartamento |
| 053, Quadro 36 | nº de apartamentos (1 … 60 ou mais) | Fc em % |
| 053, Quadro 37 | faixa de Dtr | Fr |
| 053, Quadro 33 | quantidade de estações de recarga | FD (1 a 10 = 1,00 … acima de 100 = 0,60) |
| 030, Tabela 5 | área construída | nº mínimo de tomadas e W (residencial) |
| 030, Tabela 6 | carga instalada (kW) em faixas | FD aplicado à faixa inteira (0,86 … 0,24) |
| 030, Tabelas 7, 8, 9, 10 | nº de aparelhos (chuveiro, torneira, aquecedor de passagem e ferro somam; boiler; secadora, forno, lavadoras, micro-ondas; fogões) | FD |
| 030, Tabelas 11 e 12 | potência de ar-condicionado; nº de aparelhos, comercial ou residencial | VA/W; FD |
| 030, Tabelas 14, 15, 16 | motores, equipamentos especiais, bombas e hidromassagem | maior 1,00 e demais 0,50 (motores); maior 1,00 e demais 0,60 (especiais); por nº (bombas) |
| 030, Tabela 22 | tipo de uso | carga mínima (W/m²) e FD, com faixas progressivas (escolas 1,00 nos 12 kW iniciais e 0,50 acima; escritórios 1,00 e 0,70 em 20 kW; hospitais 0,40 e 0,20 em 50 kW; hotéis 0,50 e 0,40 em 20 kW) |

FP (030, 6.27): residencial 1,00; outros tipos, iluminação fluorescente 0,95 e LED ou fluorescente compacta 0,80, tomadas 1,00; chuveiros e aquecimento 1,00; secadora, lavadoras e micro-ondas 0,92 (ou do fabricante); fogões e fornos 1,00. O exemplo 1 da 053 usa 0,80 para iluminação e tomadas do condomínio: divergência a conferir.

## 5. Atendimento (avisos)
- Baixa tensão com demanda até 300 kVA (residencial) e 225 kVA (comercial ou misto); acima, tensão primária com câmara de transformação (053, 6.2.4 e 6.2.6).
- Transformador aéreo apenas nas condições do Anexo I, item 14.
- 2.500 kW ou mais: 69 kV ou mais (066).
- Medição totalizadora em média tensão acima de 300 kVA (063, 6.9.3). Barramento blindado: disjuntor de 63 a 400 A, ramal até 240 mm², queda de tensão de 2% ou 1% (063).

## 6. Recarga
053, 6.26: FD pelo Quadro 33; demanda de serviço mais recarga até 50% da potência do transformador; limitação de carga aceita com acordo. 030: potência de placa; 3,3 kW se não informada; estudo de rede acima de 20 kW.

## 7. Divergências de tabela a conferir
Quadro 35, 141–150 m²: 3,06 (as demais trazem 3,10). Quadro 36: 38, 39 e 52 apartamentos diferem 0,02 a 0,03 do f equivalente.

## 8. Exemplos resolvidos na norma
053, Anexo I, exemplos 1 a 5; 030, exemplos de carga instalada. Exemplo 1 (20 apartamentos de 40 m²): Dr = 17,44; Dr × 1,5 = 26,16; Ds = 6,21; total 32,37 kVA.
