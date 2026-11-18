// GERADO a partir de celesc-n3210002.json, celesc-i3210043.json (extração do PDF, conferida por texto e imagem). Não editar valores à mão.

import type { FonteNorma, TrechoNorma } from "./tipos";

/* Celesc — documentos complementares à N-321.0003 (celesc.ts): só trechos literais para aviso e relatório. */

export const N_321_0002: FonteNorma = {
  id: "celesc-n-321-0002",
  documento: "N-321.0002",
  emissor: "Celesc",
  titulo: "Fornecimento de Energia Elétrica em Tensão Primária de Distribuição — Norma Técnica N-321.0002",
  edicao: "Maio de 2016 (7ª revisão)",
  edicaoCurta: "mai/2016",
  data: "19/05/2016",
  situacao: "a_confirmar",
  arquivo: "Celesc/N-321.0002_Media-tensao.pdf",
};

export const I_321_0043: FonteNorma = {
  id: "celesc-i-321-0043",
  documento: "I-321.0043",
  emissor: "Celesc",
  titulo: "Estações de Recarga de Veículos Elétricos — Instrução Normativa I-321.0043",
  edicao: "1ª revisão — Outubro de 2025",
  edicaoCurta: "out/2025",
  data: "31/10/2025",
  situacao: "vigente",
  arquivo: "Celesc/I-321.0043_Recarga-de-veiculos-eletricos.pdf",
};

/** Trechos literais de celesc-n3210002.json (relatório e avisos). */
export const CELESC_N3210002_TRECHOS = [
  { fonte: N_321_0002, item: "capa", pagina: 1, texto: "Fornecimento de Energia Elétrica em Tensão Primária de Distribuição — Norma Técnica N-321.0002 — Edição: Maio de 2016" },
] as const satisfies readonly TrechoNorma[];

/** Trechos literais de celesc-i3210043.json (relatório e avisos). */
export const CELESC_I3210043_TRECHOS = [
  { fonte: I_321_0043, item: "5.4.3.1", pagina: 7, texto: "5.4.3.1. No empreendimento de múltiplas unidades consumidoras, com demanda provável até 300 kVA, atendido em baixa tensão de distribuição, é permitida a instalação de unidade consumidora adicional do condomínio para alimentar estações de recarga de veículo elétrico, com demanda máxima de 75 kVA, sendo recomendada a utilização de sistema de gerenciamento de demanda." },
  { fonte: I_321_0043, item: "5.4.3.2", pagina: 8, texto: "5.4.3.2. No caso de novo empreendimento de múltiplas unidades consumidoras, atendido em média tensão de distribuição, com transformador exclusivo para atendimento a unidades consumidoras do Grupo B, a estação de recarga de veículo elétrico deve ser conectada à unidade consumidora do condomínio. Caso a carga instalada total do condomínio seja superior a 75 kW, este deve possuir transformador exclusivo para atendimento à unidade consumidora." },
  { fonte: I_321_0043, item: "5.5.1", pagina: 8, texto: "5.5.1. Conforme a ABNT NBR 17019, a estação ou ponto de recarga deve ser considerada carga especial (fator de demanda igual a 1) para fins de cálculo da demanda provável, sempre que não houver gerenciador de demanda." },
  { fonte: I_321_0043, item: "5.5.2", pagina: 8, texto: "5.5.2. No caso da utilização de sistema para controle de demanda das estações de recarga, a demanda gerenciada por esse equipamento deve ser considerada carga especial para fins de cálculo da demanda provável." },
  { fonte: I_321_0043, item: "5.7.4", pagina: 10, texto: "5.7.4. Caso a solicitação seja para demanda acima de 75 kVA, deve ser apresentado projeto de entrada de energia de média tensão com demanda a ser declarada pelo projetista." },
] as const satisfies readonly TrechoNorma[];
