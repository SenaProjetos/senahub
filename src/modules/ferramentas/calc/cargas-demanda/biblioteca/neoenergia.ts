// GERADO a partir de neoenergia-053.json, neoenergia-030.json e neoenergia-066.json (extração do PDF, conferida por texto e imagem). Não editar valores à mão.

import type { Degrau, Faixa } from "../fd";
import type { FonteNorma, TabelaNorma } from "./tipos";

/* Neoenergia (Coelba, Pernambuco, Cosern, Elektro e Brasília). Anexo A. Método e tabelas de FD comuns às cinco. */

export const DIS_NOR_053: FonteNorma = {
  id: "neoenergia-dis-nor-053",
  documento: "DIS-NOR-053",
  emissor: "Neoenergia",
  titulo: "Fornecimento de Energia Elétrica à Edificações com Múltiplas Unidades Consumidoras até 34,5 kV",
  edicao: "Rev. 06",
  edicaoCurta: "Rev. 06",
  data: "09/09/2025",
  situacao: "vigente",
  arquivo: "Neoenergia/DIS-NOR-053_Rev06_Multiplas-unidades.pdf",
};

export const DIS_NOR_030: FonteNorma = {
  id: "neoenergia-dis-nor-030",
  documento: "DIS-NOR-030",
  emissor: "Neoenergia",
  titulo: "Fornecimento de Energia Elétrica em Tensão Secundária de Distribuição a Edificações Individuais",
  edicao: "Rev. 07",
  edicaoCurta: "Rev. 07",
  data: "17/04/2026",
  situacao: "vigente",
  arquivo: "Neoenergia/DIS-NOR-030_Rev07_Baixa-tensao-individual.pdf",
};

export const DIS_NOR_066: FonteNorma = {
  id: "neoenergia-dis-nor-066",
  documento: "DIS-NOR-066",
  emissor: "Neoenergia",
  titulo: "Fornecimento de Energia Elétrica para Conexão de Unidades Consumidoras nas Tensões de 69, 88 e 138 kV",
  edicao: "Rev. 01",
  edicaoCurta: "Rev. 01",
  data: "16/12/2025",
  situacao: "vigente",
  arquivo: "Neoenergia/DIS-NOR-066_Rev01_69-88-138kV.pdf",
};

/** Quadro 35 — Demanda do Apartamento em Função da Área Útil */
export const NEO_QUADRO_35: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_053,
  numero: "Quadro 35",
  titulo: "Demanda do Apartamento em Função da Área Útil",
  item: "Anexo I (Memorial Técnico), item 1.2",
  pagina: 107,
  linhas: [
    { de: 0, ate: 40, valor: 1 }, // Até 40
    { de: 41, ate: 45, valor: 1.05 }, // 41 – 45
    { de: 46, ate: 50, valor: 1.16 }, // 46 – 50
    { de: 51, ate: 55, valor: 1.26 }, // 51 – 55
    { de: 56, ate: 60, valor: 1.36 }, // 56 – 60
    { de: 61, ate: 65, valor: 1.47 }, // 61 – 65
    { de: 66, ate: 70, valor: 1.57 }, // 66 – 70
    { de: 71, ate: 75, valor: 1.67 }, // 71 – 75
    { de: 76, ate: 80, valor: 1.76 }, // 76 – 80
    { de: 81, ate: 85, valor: 1.86 }, // 81 – 85
    { de: 86, ate: 90, valor: 1.96 }, // 86 – 90
    { de: 91, ate: 95, valor: 2.06 }, // 91 – 95
    { de: 96, ate: 100, valor: 2.16 }, // 96 – 100
    { de: 101, ate: 110, valor: 2.35 }, // 101 – 110
    { de: 111, ate: 120, valor: 2.54 }, // 111 – 120
    { de: 121, ate: 130, valor: 2.73 }, // 121 – 130
    { de: 131, ate: 140, valor: 2.91 }, // 131 – 140
    { de: 141, ate: 150, valor: 3.06 }, // 141 – 150
    { de: 151, ate: 160, valor: 3.28 }, // 151 – 160
    { de: 161, ate: 170, valor: 3.47 }, // 161 – 170
    { de: 171, ate: 180, valor: 3.65 }, // 171 – 180
    { de: 181, ate: 190, valor: 3.83 }, // 181 – 190
    { de: 191, ate: 200, valor: 4.01 }, // 191 – 200
    { de: 201, ate: 220, valor: 4.36 }, // 201 – 220
    { de: 221, ate: 240, valor: 4.72 }, // 221 – 240
    { de: 241, ate: 260, valor: 5.07 }, // 241 – 260
    { de: 261, ate: 280, valor: 5.42 }, // 261 – 280
    { de: 281, ate: 300, valor: 5.76 }, // 281 – 300
    { de: 301, ate: 350, valor: 6.61 }, // 301 – 350
    { de: 351, ate: 400, valor: 7.45 }, // 351 – 400
    { de: 401, ate: 450, valor: 8.28 }, // 401 – 450
    { de: 451, ate: 500, valor: 9.1 }, // 451 – 500
    { de: 501, ate: 550, valor: 9.91 }, // 501 – 550
    { de: 551, ate: 600, valor: 10.71 }, // 551 – 600
    { de: 601, ate: 650, valor: 11.51 }, // 601 – 650
    { de: 651, ate: 700, valor: 12.3 }, // 651 – 700
    { de: 701, ate: 800, valor: 13.86 }, // 701 – 800
    { de: 801, ate: 900, valor: 15.4 }, // 801 – 900
    { de: 901, ate: 1000, valor: 16.93 }, // 901 – 1000
  ],
  destoantes: ["Quadro 35, 141–150 m² = 3,06 kVA: destoa da sequência (2,91 → 3,06 → 3,28; passos 0,15 e 0,22 contra ~0,18–0,19 nos vizinhos). Literal mantido; texto e imagem mostram 3,06."],
  conferencia: "a_conferir",
};

/** Quadro 36 — fator de coincidência Fc (%) pelo nº de apartamentos. */
export const NEO_QUADRO_36: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_053,
  numero: "Quadro 36",
  titulo: "Fator de Coincidência em Função do Número de Apartamentos",
  item: "Anexo I (Memorial Técnico), item 3",
  pagina: 107,
  linhas: [
    { de: 1, ate: 1, valor: 100 }, // 1
    { de: 2, ate: 2, valor: 98 }, // 2
    { de: 3, ate: 3, valor: 97.3 }, // 3
    { de: 4, ate: 4, valor: 97 }, // 4
    { de: 5, ate: 5, valor: 96.8 }, // 5
    { de: 6, ate: 6, valor: 96.6 }, // 6
    { de: 7, ate: 7, valor: 96.57 }, // 7
    { de: 8, ate: 8, valor: 96.5 }, // 8
    { de: 9, ate: 9, valor: 96.45 }, // 9
    { de: 10, ate: 10, valor: 96.4 }, // 10
    { de: 11, ate: 11, valor: 94.73 }, // 11
    { de: 12, ate: 12, valor: 93.33 }, // 12
    { de: 13, ate: 13, valor: 92.15 }, // 13
    { de: 14, ate: 14, valor: 91.14 }, // 14
    { de: 15, ate: 15, valor: 90.27 }, // 15
    { de: 16, ate: 16, valor: 89.5 }, // 16
    { de: 17, ate: 17, valor: 88.82 }, // 17
    { de: 18, ate: 18, valor: 88.22 }, // 18
    { de: 19, ate: 19, valor: 87.68 }, // 19
    { de: 20, ate: 20, valor: 87.2 }, // 20
    { de: 21, ate: 21, valor: 85.9 }, // 21
    { de: 22, ate: 22, valor: 84.77 }, // 22
    { de: 23, ate: 23, valor: 83.7 }, // 23
    { de: 24, ate: 24, valor: 82.75 }, // 24
    { de: 25, ate: 25, valor: 81.84 }, // 25
    { de: 26, ate: 26, valor: 81 }, // 26
    { de: 27, ate: 27, valor: 80.26 }, // 27
    { de: 28, ate: 28, valor: 79.54 }, // 28
    { de: 29, ate: 29, valor: 78.9 }, // 29
    { de: 30, ate: 30, valor: 78.27 }, // 30
    { de: 31, ate: 31, valor: 77.68 }, // 31
    { de: 32, ate: 32, valor: 77.16 }, // 32
    { de: 33, ate: 33, valor: 76.64 }, // 33
    { de: 34, ate: 34, valor: 76.18 }, // 34
    { de: 35, ate: 35, valor: 75.71 }, // 35
    { de: 36, ate: 36, valor: 75.28 }, // 36
    { de: 37, ate: 37, valor: 74.89 }, // 37
    { de: 38, ate: 38, valor: 74.45 }, // 38
    { de: 39, ate: 39, valor: 74.11 }, // 39
    { de: 40, ate: 40, valor: 73.8 }, // 40
    { de: 41, ate: 41, valor: 73.46 }, // 41
    { de: 42, ate: 42, valor: 73.17 }, // 42
    { de: 43, ate: 43, valor: 72.89 }, // 43
    { de: 44, ate: 44, valor: 72.6 }, // 44
    { de: 45, ate: 45, valor: 72.31 }, // 45
    { de: 46, ate: 46, valor: 71.96 }, // 46
    { de: 47, ate: 47, valor: 71.62 }, // 47
    { de: 48, ate: 48, valor: 71.29 }, // 48
    { de: 49, ate: 49, valor: 70.98 }, // 49
    { de: 50, ate: 50, valor: 70.68 }, // 50
    { de: 51, ate: 51, valor: 70.39 }, // 51
    { de: 52, ate: 52, valor: 70.17 }, // 52
    { de: 53, ate: 53, valor: 69.85 }, // 53
    { de: 54, ate: 54, valor: 69.6 }, // 54
    { de: 55, ate: 55, valor: 69.35 }, // 55
    { de: 56, ate: 56, valor: 69.11 }, // 56
    { de: 57, ate: 57, valor: 68.88 }, // 57
    { de: 58, ate: 58, valor: 68.66 }, // 58
    { de: 59, ate: 59, valor: 68.44 }, // 59
    { de: 60, ate: null, valor: 68.23 }, // 60 ou +
  ],
  notas: ["Obs.: Para condomínios tipo smart, studio, home studio e similares, deve ser considerado o fator de coincidência igual a 90%, acima de 15 unidades. (texto logo após o item 4, p. 108)"],
  destoantes: ["Quadro 36, 38 aptos = 74,45% e 39 aptos = 74,11%: passos irregulares (74,89 → 74,45 → 74,11 → 73,80; −0,44, −0,34, −0,31). Literal mantido; texto e imagem concordam.","Quadro 36, 52 aptos = 70,17%: passos irregulares (70,39 → 70,17 → 69,85; −0,22 e −0,32). Literal mantido; texto e imagem concordam."],
  conferencia: "a_conferir",
};

/** Quadro 37 — fator de segurança Fr pela demanda (limite superior inclusivo). */
export const NEO_QUADRO_37: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_053,
  numero: "Quadro 37",
  titulo: "Fator de Segurança Recomendado (Fr)",
  item: "Anexo I (Memorial Técnico), item 5",
  pagina: 108,
  linhas: [
    { de: 0, ate: 25, valor: 1.5 }, // Dr £ 25 kVA
    { de: 25, ate: 50, valor: 1.3 }, // 25 kVA < Dr £ 50 kVA
    { de: 50, ate: 100, valor: 1.2 }, // 50 kVA < Dr £ 100 kVA
    { de: 100, ate: null, valor: 1.1 }, // Dr > 100 kVA
  ],
  notas: ["Quando o fator utilizado for maior que o valor recomendado no Quadro 37, deve ser apresentada uma justificativa. (item 5)"],
  conferencia: "a_conferir",
};

/** Quadro 33 — Fator de demanda dos agrupamentos das estações de recarga veicular */
export const NEO_QUADRO_33: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_053,
  numero: "Quadro 33",
  titulo: "Fator de demanda dos agrupamentos das estações de recarga veicular",
  item: "6.26.1",
  pagina: 98,
  linhas: [
    { de: 1, ate: 10, valor: 1 }, // 1 a 10
    { de: 11, ate: 20, valor: 0.86 }, // 11 a 20
    { de: 21, ate: 30, valor: 0.8 }, // 21 a 30
    { de: 31, ate: 40, valor: 0.78 }, // 31 a 40
    { de: 41, ate: 50, valor: 0.75 }, // 41 a 50
    { de: 51, ate: 75, valor: 0.7 }, // 51 a 75
    { de: 76, ate: 100, valor: 0.65 }, // 76 a 100
    { de: 101, ate: null, valor: 0.6 }, // Acima de 100
  ],
  conferencia: "a_conferir",
};

/** 6.25.1 e obs. do Quadro 36: smart, studio, home studio acima de 15 unidades → Fc = 90%. */
export const NEO_STUDIO = { acimaDeUnidades: 15, fcPercent: 90, trecho: { item: "6.25.1", pagina: 96, texto: "6.25.1 Para o cálculo de demanda de edificações residenciais tipo Smart, Studio, Home Studio acima de 15 unidades, deverá ser utilizado o método da área útil com fator de coincidência igual a 90%, independentemente da quantidade de unidades consumidoras. Opcionalmente o projetista pode realizar o dimensionamento pelo método da carga instalada." } } as const;

/** Trechos literais (relatório). */
export const NEO_TRECHOS = {
  anexoIFormula: { item: "Anexo I – Demanda da Edificação (fórmula geral)", pagina: 106, texto: "A demanda total estimada para a edificação e considerada para o dimensionamento da entrada de serviço e câmara de transformação deve ser calculada com base na seguinte fórmula: Ded = Drf + Ds + Dc + Dve. Onde: Ded demanda total da edificação; Drf demanda total dos apartamentos residenciais, calculada pelo método da área útil; Ds demanda de serviço do condomínio, calculada pelo método da carga instalada; Dc demanda das cargas comerciais, calculada pelo método da carga instalada. Dve demanda dos carregados de veículos elétricos" },
  anexoIDr: { item: "Anexo I – itens 1 e 2 (Dr)", pagina: 106, texto: "1. A demanda para a área residencial (Dr) deve ser calculada pelo método da área útil, conforme as seguintes instruções: 1.1. Agrupa-se tipos de apartamentos de mesma área útil; 1.2. Determina-se a demanda por cada tipo de apartamento, com base no Quadro 35, 1.3. Multiplica-se a demanda de cada tipo pela sua quantidade. 2. Soma-se a demanda: Dr = Demanda(1) × N°Aptos(1) + . . . + Demanda(n) × N°Aptos(n) (p. 107)" },
  anexoIFc: { item: "Anexo I – itens 3 e 4 (Fc, Dtr)", pagina: 107, texto: "3. Determina-se o fator de coincidência (Fc) em função do número de apartamentos residenciais da edificação, com base no Quadro 36, representado a seguir: [...] 4. A demanda total residencial (Dtr) é obtida pela multiplicação da demanda do item 2 pelo fator de coincidência. Dtr = Dr × Fc. Obs.: Para condomínios tipo smart, studio, home studio e similares, deve ser considerado o fator de coincidência igual a 90%, acima de 15 unidades. (item 4 e Obs. na p. 108)" },
  anexoIFr: { item: "Anexo I – itens 5 e 6 (Fr, Drf)", pagina: 108, texto: "5. O fator de segurança (Fr) é função da demanda residencial calculada (Dr) e deve ser obtido a partir da tabela abaixo. Quando o fator utilizado for maior que o valor recomendado no Quadro 37, deve ser apresentada uma justificativa. [...] 6. Atualiza a demanda residencial final (Drf) com o fator de segurança (Fr). Drf = Dtr × Fr" },
  anexoIDs: { item: "Anexo I – itens 7 e 8 (Ds, mínimos)", pagina: 108, texto: "7. A demanda da área de serviço (Ds) deve ser calculada pelo método da carga instalada. 7.1. Em casos de cargas especiais, podem ser aceitas as potências declaradas em projeto. 7.2. A potência em kVA deve ser calculada com base nos fatores de potência específicos dos eletrodomésticos conforme DIS-NOR-030: 8. A faixa de demanda mínima em edifícios de menor porte é decorrente da tensão de fornecimento, tendo em vista sua respectiva carga instalada. Em função disso, dotar a proteção geral da seletividade necessária, assegurando que a proteção de cada unidade apresente corrente nominal inferior à da proteção geral. 8.1. Para tensão de fornecimento 220/127 V, usar Tabela 1, sendo o dimensionamento do condutor do ramal de entrada 35 mm² e disjuntor 100 A. 8.2. Para tensão de fornecimento 380/220 V, usar Tabela 2, sendo o dimensionamento do condutor do ramal de entrada 16 mm² e disjuntor 70 A. (8 continua na p. 109)" },
  anexoIBlocos: { item: "Anexo I – item 9 (mais de uma edificação)", pagina: 109, texto: "9. Demanda Total de Condomínio com mais de uma Edificação Coletiva (Torres ou Blocos). 9.1. Para empreendimentos com mais de uma edificação coletiva, o cálculo para a demanda total deve ser feito com o agrupamento das cargas residenciais, de serviços e comerciais. Dte = ADrf + ADs + ADc. Onde: Dte Demanda total do empreendimento; ADrf Agrupamento da demanda de todos os apartamentos residenciais, calculada pelo método da área útil; ADs Agrupamento da demanda acumulada das cargas de condomínio internas e externas (serviço) de todas as edificações, calculada pelo método da carga instalada; ADc Agrupamento da demanda acumulada das cargas comerciais, calculada pelo método da carga instalada. 9.2. Calcula-se inicialmente a demanda de todos os apartamentos que serão alimentados pelo transformador ou quadro geral. ADr = Demanda(1) × N°Aptos(1) + . . . + Demanda(n) × N°Aptos(n) 9.3. Com o somatório dos números de apartamentos que estão alimentados pelo transformador ou quadro geral, obtém-se o Fator de Coincidência (Fc) no Quadro 36. ADrt = ADr × Fc 9.4. Atualiza o agrupamento da demanda residencial total (ADrt) com o fator de segurança (Fr), encontrando a demanda residencial final ADrf. ADrf = ADrt × Fr" },
  anexoITrafoAereo: { item: "Anexo I – item 14 (transformador aéreo)", pagina: 110, texto: "14. O transformador pode ser aéreo quando: 14.1. A lei de ordenamento do solo do município permitir e não existir outros impedimentos legais. 14.2. Atender uma ou mais edificações com ramais de ligações aéreos dentro do mesmo terreno, sendo que o transformador deve estar instalado dentro do terreno em local de fácil acesso para substituição do transfromador, podendo ou não existir rede secundária aérea, desde que não exista cargas comerciais. 14.3. Não se aplica taxa de crescimento quando o transformador é para uso exclusivo no atendimento de cargas residenciais. 14.4. Atender até quatro edificações com ramais de ligação subterrâneo, partindo de um quadro geral de distribuição (QGD). Caso o atendimento seja para uma única edificação, o QDG pode ser dispensado. 14.4.1. O quadro geral de distribuição (QGD) deve ser fixado em muro ou mureta. Do QGD sai um ou mais ramais de entrada subterrâneo para alimentar as edificações, cujo comprimento máximo é de 40 m. Nesta condição, pode utilizar o condutor de cobre redondo até 300mm², classe 2 ou 5, isolação XLPE/HEPR, 0,6/1 kV, cobertura PVC/ST2. 14.5. O transformador pode ser instalado no limite da via pública com a propriedade, desde que seja exclusivo para o atendimento de edificações de múltiplas unidades consumidoras situada em um mesmo terreno, até a potência de 300 kVA para edificações residenciais e até 225 kVA para edificações de múltiplas unidades consumidoras comerciais ou mistas. 14.6. O transformador aéreo pode ser instalado dentro do loteamento ou condomínio em passeio com fácil acesso à caminhão tipo Munk, desde que seja exclusivo para o atendimento de até quatro edificações residências. 14.7. Não pode existir mais de uma entrada de alimentação por terreno. A regra vale tanto para ramal de conexão aéreo quanto subterrâneo. 14.8. No caso de transformadores aéreos sem rede secundária aérea incorporável pela distribuidora, o ponto de conexão — e, portanto, o limite de responsabilidade da distribuidora — é a bucha secundária do transformador. Assim, os ramais de entrada até as unidades consumidoras são de responsabilidade do empreendimento. (14.5 a 14.8 na p. 111)" },
  anexoITrafoAbrigado: { item: "Anexo I – item 15.1.3 (transformador abrigado)", pagina: 111, texto: "15. O transformador é abrigado no interior da edificação quando: [...] 15.1.3. O valor da demanda superar 300 kVA para edificações de múltiplas unidades consumidoras residenciais e 225 kVA para edificações de múltiplas unidades consumidoras comerciais ou mistas." },
  bt624: { item: "6.2.4", pagina: 19, texto: "6.2.4 A edificação de múltiplas unidades consumidoras pode ser atendida em tensão secundária de distribuição se a demanda total da edificação for menor ou igual a 300 kVA para edificações de múltiplas unidades consumidoras residenciais e 225 kVA para edificações de múltiplas unidades consumidoras comerciais ou mistas e não possuir unidades consumidoras do grupo A." },
  mt626: { item: "6.2.6", pagina: 20, texto: "6.2.6 A edificação de múltiplas unidades consumidoras deve ser atendida em tensão primária de distribuição se a demanda total da edificação for maior que 300 kVA para edificações de múltiplas unidades consumidoras residenciais e maior que 225 kVA para edificações de múltiplas unidades consumidoras comerciais ou mistas ou possuir unidades consumidoras do grupo A." },
  individual6223: { item: "6.22.3", pagina: 95, texto: "6.22.3 A demanda individual das unidades consumidoras (cada apartamento), para escolha da categoria de fornecimento, deve ser calculada seguindo o critério da carga instalada, conforme DIS-NOR-030." },
  recarga6261: { item: "6.26.1", pagina: 97, texto: "6.26.1 O quadro abaixo apresenta o fator de demanda a ser considerado para estações de recarga. (segue o Quadro 33, p. 98)" },
  calculo627: { item: "6.27", pagina: 47, texto: "6.27 Cálculo da Demanda O presente cálculo de demanda aplica-se às instalações trifásicas residenciais e comerciais. Pode ser aplicado também às pequenas indústrias atendidas em baixa tensão, quando o interessado não tiver dados mais precisos quanto a sua demanda real prevista. O valor da demanda deve ser calculado pela seguinte fórmula: D=a+b+c+d+e+f+g+h+i Sendo: D – Demanda total da instalação em kVA Demais fatores (a, b, c, d, e, f, g, h, i) conforme a seguir:" },
  recarga62641: { item: "6.26.4.1 (com Nota)", pagina: 47, texto: "6.26.4.1 Deve ser considerada como carga instalada a potência informada na placa do fabricante da estação de recarga. Nota: Para estação de recarga incorporada ao veículo, onde a potência não seja informada, deverá ser considerado a potência de 3,3 kW." },
  recarga62642: { item: "6.26.4.2", pagina: 47, texto: "6.26.4.2 A potência da estação de recarga deve ser somada com os restantes das cargas da unidade consumidora, se a potência total passar de 20 kW será necessário estudo da rede de distribuição." },
  at066: { item: "5.2", pagina: 16, texto: "5.2. Limites de demanda de potência Todo consumidor cuja demanda total contratada ou estimada seja, no mínimo, igual a 2.500 kW, conforme letra d) do inciso I do artigo 23º, Resolução Normativa Nº 1000/2021, deverá ser conectado com tensão igual ou superior a 69 kV. Entretanto, a critério exclusivo da Distribuidora, poderão ser analisados atendimentos em demandas de potência inferiores ao valor citado acima. Qualquer acréscimo definitivo de demanda além dos valores contratados só deve efetivar-se após autorização da Distribuidora. (o trecho começa na p. 16 e termina na p. 17)" },
} as const;

/** Tabela 6 — FD de tomadas e iluminação residencial pela carga instalada (kW), aplicado à faixa inteira. */
export const NEO_TABELA_6: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 6",
  titulo: "Fatores de Demanda Referentes à Tomadas e Iluminação Residencial",
  item: "Anexo II (Tabelas Gerais); usada em 6.27.1.1",
  pagina: 65,
  linhas: [
    { de: 0, ate: 1, valor: 0.86 }, // C ≤ 1
    { de: 1, ate: 2, valor: 0.75 }, // 1 < C ≤ 2
    { de: 2, ate: 3, valor: 0.66 }, // 2 < C ≤ 3
    { de: 3, ate: 4, valor: 0.59 }, // 3 < C ≤ 4
    { de: 4, ate: 5, valor: 0.52 }, // 4 < C ≤ 5
    { de: 5, ate: 6, valor: 0.45 }, // 5 < C ≤ 6
    { de: 6, ate: 7, valor: 0.4 }, // 6 < C ≤ 7
    { de: 7, ate: 8, valor: 0.35 }, // 7 < C ≤ 8
    { de: 8, ate: 9, valor: 0.31 }, // 8 < C ≤ 9
    { de: 9, ate: 10, valor: 0.27 }, // 9 < C ≤ 10
    { de: 10, ate: null, valor: 0.24 }, // C > 10
  ],
  conferencia: "a_conferir",
};

/** Tabela 7 — Fatores de Demanda de Chuveiros, Torneiras, Aquecedores de Água de Passagem e Ferros Elétricos */
export const NEO_TABELA_7: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 7",
  titulo: "Fatores de Demanda de Chuveiros, Torneiras, Aquecedores de Água de Passagem e Ferros Elétricos",
  item: "Anexo II; usada em 6.27.2.1",
  pagina: 66,
  linhas: [
    { de: 1, ate: 1, valor: 1 }, // 1
    { de: 2, ate: 2, valor: 1 }, // 2
    { de: 3, ate: 3, valor: 0.84 }, // 3
    { de: 4, ate: 4, valor: 0.76 }, // 4
    { de: 5, ate: 5, valor: 0.7 }, // 5
    { de: 6, ate: 6, valor: 0.65 }, // 6
    { de: 7, ate: 7, valor: 0.6 }, // 7
    { de: 8, ate: 8, valor: 0.57 }, // 8
    { de: 9, ate: 9, valor: 0.54 }, // 9
    { de: 10, ate: 10, valor: 0.52 }, // 10
    { de: 11, ate: 11, valor: 0.49 }, // 11
    { de: 12, ate: 12, valor: 0.48 }, // 12
    { de: 13, ate: 13, valor: 0.46 }, // 13
    { de: 14, ate: 14, valor: 0.45 }, // 14
    { de: 15, ate: 15, valor: 0.44 }, // 15
    { de: 16, ate: 16, valor: 0.43 }, // 16
    { de: 17, ate: 17, valor: 0.42 }, // 17
    { de: 18, ate: 18, valor: 0.41 }, // 18
    { de: 19, ate: 19, valor: 0.4 }, // 19
    { de: 20, ate: 20, valor: 0.4 }, // 20
    { de: 21, ate: 21, valor: 0.39 }, // 21
    { de: 22, ate: 22, valor: 0.39 }, // 22
    { de: 23, ate: 23, valor: 0.39 }, // 23
    { de: 24, ate: 24, valor: 0.38 }, // 24
    { de: 25, ate: 25, valor: 0.38 }, // 25
    { de: 26, ate: null, valor: 0.38 }, // acima de 25
  ],
  notas: ["Nota: O número de aparelhos indicado na tabela refere-se a soma das quantidades dos mesmos. Exemplo: 4 chuveiros + 2 torneiras + 1 ferro de passar roupa = 7 aparelhos, portanto, FD = 0,60."],
  conferencia: "a_conferir",
};

/** Tabela 8 — Fatores de Demanda de Aquecedor Central ou de Acumulação (Boiler) */
export const NEO_TABELA_8: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 8",
  titulo: "Fatores de Demanda de Aquecedor Central ou de Acumulação (Boiler)",
  item: "Anexo II; usada em 6.27.3",
  pagina: 66,
  linhas: [
    { de: 1, ate: 1, valor: 1 }, // 1
    { de: 2, ate: 2, valor: 0.72 }, // 2
    { de: 3, ate: 3, valor: 0.62 }, // 3
    { de: 4, ate: null, valor: 0.62 }, // acima de 3
  ],
  conferencia: "a_conferir",
};

/** Tabela 9 — Fatores de Demanda de Secadora de Roupa, Forno Elétrico, Máquina de Lavar Roupa, Lava-Louça e Forno Micro-ondas */
export const NEO_TABELA_9: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 9",
  titulo: "Fatores de Demanda de Secadora de Roupa, Forno Elétrico, Máquina de Lavar Roupa, Lava-Louça e Forno Micro-ondas",
  item: "Anexo II; usada em 6.27.4 (e citada em 6.27.5)",
  pagina: 66,
  linhas: [
    { de: 1, ate: 1, valor: 1 }, // 1
    { de: 2, ate: 4, valor: 0.7 }, // 2 a 4
    { de: 5, ate: 6, valor: 0.6 }, // 5 a 6
    { de: 7, ate: null, valor: 0.5 }, // Acima de 6
  ],
  conferencia: "a_conferir",
};

/** Tabela 10 — Fatores de Demanda de Fogões Elétricos */
export const NEO_TABELA_10: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 10",
  titulo: "Fatores de Demanda de Fogões Elétricos",
  item: "Anexo II",
  pagina: 67,
  linhas: [
    { de: 1, ate: 1, valor: 1 }, // 1
    { de: 2, ate: 2, valor: 0.6 }, // 2
    { de: 3, ate: 3, valor: 0.48 }, // 3
    { de: 4, ate: 4, valor: 0.4 }, // 4
    { de: 5, ate: 5, valor: 0.37 }, // 5
    { de: 6, ate: 6, valor: 0.35 }, // 6
    { de: 7, ate: 7, valor: 0.33 }, // 7
    { de: 8, ate: 8, valor: 0.32 }, // 8
    { de: 9, ate: 9, valor: 0.31 }, // 9
    { de: 10, ate: 11, valor: 0.3 }, // 10 a 11
    { de: 12, ate: 15, valor: 0.28 }, // 12 a 15
    { de: 16, ate: null, valor: 0.26 }, // Acima de 15
  ],
  conferencia: "a_conferir",
};

export type ArCondicionadoNeo = { btuh: number; va: number | null; w: number | null };

/** Tabela 11 — Condicionadores de Ar */
export const NEO_TABELA_11: TabelaNorma<ArCondicionadoNeo> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 11",
  titulo: "Condicionadores de Ar",
  item: "Anexo II; usada em 6.26.2.2 e 6.27.6",
  pagina: 67,
  linhas: [
    { btuh: 7500, va: 1100, w: 900 },
    { btuh: 9000, va: 1550, w: 1300 },
    { btuh: 10000, va: 1650, w: 1400 },
    { btuh: 12000, va: 1900, w: 1600 },
    { btuh: 15000, va: 2100, w: 1900 },
    { btuh: 18000, va: 2860, w: 2600 },
    { btuh: 21000, va: 3080, w: 2800 },
    { btuh: 30000, va: 4000, w: 3800 },
    { btuh: 41000, va: 5500, w: 5000 },
    { btuh: 60000, va: 9000, w: 7500 },
  ],
  notas: ["Notas: 1. Os valores de potência apresentados nesta tabela são orientativos, quando disponíveis os dados de placa ou de catálogo do fabricante, estes devem ser considerados.","2. As correntes nominais para aparelhos de 41.000 e 60.000 BTU são para ligações trifásicas em 220 V."],
  conferencia: "a_conferir",
};

/** Tabela 12 — Fatores de Demanda para Condicionadores de Ar */
export const NEO_TABELA_12: TabelaNorma<Faixa<{ comercial: number; residencial: number }>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 12",
  titulo: "Fatores de Demanda para Condicionadores de Ar",
  item: "Anexo II; usada em 6.27.6",
  pagina: 68,
  linhas: [
    { de: 1, ate: 10, valor: { comercial: 1, residencial: 1 } }, // 1 a 10
    { de: 11, ate: 20, valor: { comercial: 0.9, residencial: 0.86 } }, // 11 a 20
    { de: 21, ate: 30, valor: { comercial: 0.82, residencial: 0.8 } }, // 21 a 30
    { de: 31, ate: 40, valor: { comercial: 0.8, residencial: 0.78 } }, // 31 a 40
    { de: 41, ate: 50, valor: { comercial: 0.77, residencial: 0.75 } }, // 41 a 50
    { de: 51, ate: 75, valor: { comercial: 0.75, residencial: 0.7 } }, // 51 a 75
    { de: 76, ate: 100, valor: { comercial: 0.75, residencial: 0.65 } }, // 76 a 100
    { de: 101, ate: null, valor: { comercial: 0.75, residencial: 0.6 } }, // acima de 100
  ],
  notas: ["Nota: Quando se tratar de unidade central de condicionador de ar, deve-se considerar fator de demanda igual a 1,00."],
  conferencia: "a_conferir",
};

/** Tabela 13 — Fatores de Demanda para Estações de Recarga Individuais */
export const NEO_TABELA_13: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 13",
  titulo: "Fatores de Demanda para Estações de Recarga Individuais",
  item: "Anexo II; usada em 6.27.10",
  pagina: 68,
  linhas: [
    { de: 1, ate: 10, valor: 1 }, // 1 a 10
    { de: 11, ate: 20, valor: 0.9 }, // 11 a 20
    { de: 21, ate: 30, valor: 0.82 }, // 21 a 30
    { de: 31, ate: 40, valor: 0.8 }, // 31 a 40
    { de: 41, ate: 50, valor: 0.77 }, // 41 a 50
    { de: 51, ate: null, valor: 0.75 }, // acima de 50
  ],
  conferencia: "a_conferir",
};

/** Tabela 14 — Fatores de Demanda de Motores: o maior com 1, os demais com 0.5. */
export const NEO_TABELA_14 = {
  fonte: DIS_NOR_030,
  numero: "Tabela 14",
  titulo: "Fatores de Demanda de Motores",
  pagina: 68,
  primeiros: 1,
  fdPrimeiros: 1,
  fdDemais: 0.5,
  notas: ["Notas: 1. Se os maiores motores tiverem potências iguais, deve-se considerar apenas um como o maior.","2. Existindo motores que obrigatoriamente partam simultaneamente (mesmo sendo os de maior potência) deve-se somar suas potências e considerá-los como um só motor."],
  conferencia: "a_conferir",
} as const;

/** Tabela 15 — Fatores de Demanda de Equipamentos Especiais: o maior com 1, os demais com 0.6. */
export const NEO_TABELA_15 = {
  fonte: DIS_NOR_030,
  numero: "Tabela 15",
  titulo: "Fatores de Demanda de Equipamentos Especiais",
  pagina: 68,
  primeiros: 1,
  fdPrimeiros: 1,
  fdDemais: 0.6,
  notas: ["Nota: Se os maiores aparelhos tiverem potências iguais, deve-se considerar apenas um como o maior."],
  conferencia: "a_conferir",
} as const;

/** Tabela 16 — Fatores de Demanda de Bombas e Hidromassagem */
export const NEO_TABELA_16: TabelaNorma<Faixa<number>> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 16",
  titulo: "Fatores de Demanda de Bombas e Hidromassagem",
  item: "Anexo II; usada em 6.27.9",
  pagina: 68,
  linhas: [
    { de: 1, ate: 1, valor: 1 }, // 1
    { de: 2, ate: 2, valor: 0.56 }, // 2
    { de: 3, ate: 3, valor: 0.47 }, // 3
    { de: 4, ate: null, valor: 0.39 }, // acima de 3
  ],
  conferencia: "a_conferir",
};

export type MotorNeo = { rotulo: string; cv: number; w: number | null; va: number | null; cosPhi: number | null };

/** Tabela 18 — motores monofásicos: potência absorvida (W e VA) por cv. */
export const NEO_TABELA_18: TabelaNorma<MotorNeo> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 18",
  titulo: "Características Elétricas dos Motores Monofásicos",
  item: "Anexo II; citada em 6.26.3.1 e 6.27.7",
  pagina: 69,
  linhas: [
    { rotulo: "¼", cv: 0.25, w: 420, va: 660, cosPhi: 0.63 },
    { rotulo: "⅓", cv: 0.333333, w: 510, va: 770, cosPhi: 0.66 },
    { rotulo: "½", cv: 0.5, w: 790, va: 1180, cosPhi: 0.67 },
    { rotulo: "¾", cv: 0.75, w: 900, va: 1340, cosPhi: 0.67 },
    { rotulo: "1", cv: 1, w: 1140, va: 1560, cosPhi: 0.73 },
    { rotulo: "1½", cv: 1.5, w: 1670, va: 2350, cosPhi: 0.71 },
    { rotulo: "2", cv: 2, w: 2170, va: 2970, cosPhi: 0.73 },
    { rotulo: "3", cv: 3, w: 3220, va: 4070, cosPhi: 0.79 },
    { rotulo: "5", cv: 5, w: 5110, va: 6160, cosPhi: 0.83 },
    { rotulo: "7½", cv: 7.5, w: 7070, va: 8840, cosPhi: 0.8 },
    { rotulo: "10", cv: 10, w: 9310, va: 11640, cosPhi: 0.8 },
    { rotulo: "12 ½", cv: 12.5, w: 11580, va: 14940, cosPhi: 0.78 },
    { rotulo: "15", cv: 15, w: 13720, va: 16940, cosPhi: 0.81 },
  ],
  notas: ["Nota: As correntes nominais e de partida apresentadas na tabela acima podem ser utilizadas quando não for possível obtê-las nas placas dos motores."],
  conferencia: "a_conferir",
};

/** Tabela 19 — motores trifásicos: potência absorvida (W e VA) por cv. */
export const NEO_TABELA_19: TabelaNorma<MotorNeo> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 19",
  titulo: "Características Elétricas dos Motores Trifásicos",
  item: "Anexo II; citada em 6.26.3.1",
  pagina: 70,
  linhas: [
    { rotulo: "1/3", cv: 0.333333, w: 390, va: 650, cosPhi: 0.61 },
    { rotulo: "1/2", cv: 0.5, w: 580, va: 870, cosPhi: 0.66 },
    { rotulo: "3/4", cv: 0.75, w: 830, va: 1260, cosPhi: 0.66 },
    { rotulo: "1", cv: 1, w: 1050, va: 1520, cosPhi: 0.69 },
    { rotulo: "1.1/2", cv: 1.5, w: 1540, va: 2170, cosPhi: 0.71 },
    { rotulo: "2", cv: 2, w: 1950, va: 2700, cosPhi: 0.72 },
    { rotulo: "3", cv: 3, w: 2950, va: 4040, cosPhi: 0.73 },
    { rotulo: "4", cv: 4, w: 3720, va: 5030, cosPhi: 0.74 },
    { rotulo: "5", cv: 5, w: 4510, va: 6020, cosPhi: 0.75 },
    { rotulo: "7.1/2", cv: 7.5, w: 6570, va: 8650, cosPhi: 0.76 },
    { rotulo: "10", cv: 10, w: 8890, va: 11540, cosPhi: 0.77 },
    { rotulo: "12.1/2", cv: 12.5, w: 10850, va: 14090, cosPhi: 0.77 },
    { rotulo: "15", cv: 15, w: 12820, va: 16650, cosPhi: 0.77 },
    { rotulo: "20", cv: 20, w: 17010, va: 22100, cosPhi: 0.77 },
    { rotulo: "25", cv: 25, w: 20920, va: 25830, cosPhi: 0.81 },
    { rotulo: "30", cv: 30, w: 25030, va: 30520, cosPhi: 0.82 },
    { rotulo: "40", cv: 40, w: 33380, va: 39740, cosPhi: 0.84 },
    { rotulo: "50", cv: 50, w: 40930, va: 48730, cosPhi: 0.84 },
    { rotulo: "60", cv: 60, w: 49420, va: 58150, cosPhi: 0.85 },
    { rotulo: "75", cv: 75, w: 61440, va: 72280, cosPhi: 0.85 },
    { rotulo: "100", cv: 100, w: 81230, va: 95560, cosPhi: 0.85 },
    { rotulo: "125", cv: 125, w: 100670, va: 117050, cosPhi: 0.85 },
    { rotulo: "150", cv: 150, w: 120090, va: 141290, cosPhi: 0.85 },
    { rotulo: "200", cv: 200, w: 161650, va: 190180, cosPhi: 0.85 },
  ],
  notas: ["Nota: As correntes nominais e de partida apresentadas na tabela acima podem ser utilizadas quando não for possível obtê-las nas placas dos motores."],
  conferencia: "a_conferir",
};

export type UsoNeo = { uso: string; cargaMinimaWm2: number | null; cargaMinimaLiteral: string; literal: string; degraus: readonly Degrau[] | null };

/** Tabela 22 — carga mínima (W/m²) e FD de iluminação e TUG por tipo de uso (degraus progressivos; null = regra só em texto). */
export const NEO_TABELA_22: TabelaNorma<UsoNeo> = {
  fonte: DIS_NOR_030,
  numero: "Tabela 22",
  titulo: "Carga Mínima e Fatores de Demanda para Iluminação e Tomadas de Uso Geral",
  item: "Anexo II; usada em 6.27.1.2",
  pagina: 72,
  linhas: [
    { uso: "Auditório, salões para exposições e semelhantes", cargaMinimaWm2: 10, cargaMinimaLiteral: "10", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Bancos, lojas e semelhantes", cargaMinimaWm2: 30, cargaMinimaLiteral: "30", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Barbearia, salões de beleza e semelhantes", cargaMinimaWm2: 30, cargaMinimaLiteral: "30", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Clubes e semelhantes", cargaMinimaWm2: 20, cargaMinimaLiteral: "20", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Escolas e semelhantes", cargaMinimaWm2: 30, cargaMinimaLiteral: "30", literal: "1,00 para os primeiros 12 kW / 0,50 para o que exceder 12 kW", degraus: [{ largura: 12, fd: 1 }, { largura: null, fd: 0.5 }] },
    { uso: "Escritórios (edifícios)", cargaMinimaWm2: 30, cargaMinimaLiteral: "30", literal: "1,00 para os primeiros 20 kW / 0,70 para o que exceder 20 kW", degraus: [{ largura: 20, fd: 1 }, { largura: null, fd: 0.7 }] },
    { uso: "Administração de edifícios de uso coletivo", cargaMinimaWm2: 5, cargaMinimaLiteral: "5", literal: "1,00 da carga de iluminação mais 0,50 da carga de tomadas", degraus: null },
    { uso: "Garagens comerciais e semelhantes", cargaMinimaWm2: 5, cargaMinimaLiteral: "5", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Hospitais e semelhantes", cargaMinimaWm2: 20, cargaMinimaLiteral: "20", literal: "0,40 para os primeiros 50 kW / 0,20 para o que exceder 50 kW", degraus: [{ largura: 50, fd: 0.4 }, { largura: null, fd: 0.2 }] },
    { uso: "Hotéis e semelhantes", cargaMinimaWm2: 20, cargaMinimaLiteral: "20", literal: "0,50 para os primeiros 20 kW / 0,40 para o que exceder 20 kW", degraus: [{ largura: 20, fd: 0.5 }, { largura: null, fd: 0.4 }] },
    { uso: "Igrejas e semelhantes", cargaMinimaWm2: 10, cargaMinimaLiteral: "10", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Indústrias", cargaMinimaWm2: null, cargaMinimaLiteral: "Valor declarado pelo interessado", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
    { uso: "Restaurantes e semelhantes", cargaMinimaWm2: 20, cargaMinimaLiteral: "20", literal: "1,00", degraus: [{ largura: null, fd: 1 }] },
  ],
  notas: ["Notas: 1. A carga mínima indicada na tabela refere-se à carga recomendada para instalações de iluminação e tomadas, utilizando lâmpadas incandescentes. No caso de outros tipos de lâmpadas, consultar os catálogos de fabricantes;","2. No caso de lojas, deve-se considerar a carga adicional de 700 W/m de vitrine, medida horizontalmente ao longo de sua base;","3. Quando a unidade consumidora possuir cozinha, deve ser considerado exclusivamente para ela fator de demanda igual a 1,00, para as demais dependências da unidade consumidora, considerar os valores indicados na tabela."],
  conferencia: "a_conferir",
};
