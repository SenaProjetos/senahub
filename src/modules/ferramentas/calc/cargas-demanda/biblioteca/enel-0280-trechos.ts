// GERADO a partir de enel-0280.json (extração do PDF, conferida por texto e imagem). Não editar valores à mão.

import type { FonteNorma, TrechoNorma } from "./tipos";

/* Enel — 0280 versão 2 (26/05/2023): trechos literais para o aviso de atendimento (limites lidos do texto) e o relatório. */

export const ENEL_0280: FonteNorma = {
  id: "enel-0280",
  documento: "CNC-OMBR-MAT-19-0280",
  emissor: "Enel",
  titulo: "Conexão de Recarga para Veículos Elétricos",
  edicao: "versão 2",
  edicaoCurta: "2",
  data: "26/05/2023",
  situacao: "vigente",
  arquivo: "Enel/0280_v02_Recarga-de-veiculos-eletricos.pdf",
};

/** Trechos literais de enel-0280.json (relatório e avisos). */
export const ENEL_0280_TRECHOS = [
  { fonte: ENEL_0280, item: "7.1.3", pagina: 13, texto: "7.1.3.Tipo de fornecimento O tipo de fornecimento, realizado em baixa ou média tensão, é definido de acordo com a carga instalada na unidade consumidora e as características de funcionamento dos equipamentos, conforme estabelece a Resolução nº 1000 de 2021 e normas de fornecimento de energia indicados na seção 4. Nota: É admitida a ligação em baixa tensão para unidades consumidoras com carga instalada acima de 75kW, desde que sujeitas a análise de viabilidade técnica da distribuidora, atendendo conforme disposto na Resolução nº1000 de 2021 e normas de conexão específica de baixa ou média tensão:\na) mais que 50% (cinquenta por cento) das unidades da edificação se enquadrem no Grupo B\nb) existência de solicitação ou concordância do consumidor; e c) a distribuidora avalie a viabilidade por meio de realização de estudo." },
  { fonte: ENEL_0280, item: "7.1.3 Nota (2.500 kW)", pagina: 14, texto: "Nota: Todo e qualquer atendimento de unidade consumidora com carga instalada superior a 75 kW e a demanda a ser contratada pelo interessado, para o fornecimento, for menor ou igual a 2.500 kW, o atendimento deve ser feito em tensão primária de distribuição inferior a 69 kV:\na) Grupo A, com tensão maior ou igual a 69 kV: se a maior demanda a ser contratada for maior que 2.500 kW." },
] as const satisfies readonly TrechoNorma[];
