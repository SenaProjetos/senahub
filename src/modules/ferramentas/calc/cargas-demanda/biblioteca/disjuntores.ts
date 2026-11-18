import type { FonteNorma } from "./tipos";

/**
 * Série de correntes nominais de disjuntores (A) — **puro**. Spec §4.5: união das correntes de três linhas de
 * catálogo (Schneider Acti9 12/2025; WEG DWB e DWA 06/2025, só disjuntores de distribuição; Schneider Easy9 via
 * distribuidoras). Valores de gerador e de motor não entram. A série só alimenta a SUGESTÃO; o disjuntor adotado é
 * digitado. Pendência (spec §11): disponibilidade comercial e polos de cada valor não verificados.
 */

export const CATALOGO_ACTI9: FonteNorma = {
  id: "schneider-acti9",
  documento: "Schneider Electric Acti9",
  emissor: "Schneider Electric",
  titulo: "Catálogo Acti9",
  edicao: "12/2025",
  edicaoCurta: "12/2025",
  data: "12/2025",
  situacao: "vigente",
  arquivo: "Catalogos/Schneider_Acti9_catalogo_dez-2025.pdf",
};

export const CATALOGO_WEG_DWB_DWA: FonteNorma = {
  id: "weg-dwb-dwa",
  documento: "WEG DWB e DWA",
  emissor: "WEG",
  titulo: "Catálogo 50009825 — disjuntores em caixa moldada DWB e DWA",
  edicao: "06/2025",
  edicaoCurta: "06/2025",
  data: "06/2025",
  situacao: "vigente",
  arquivo: "Catalogos/WEG_DWB-DWA_catalogo-50009825_jun-2025.pdf",
};

export const CATALOGO_EASY9: FonteNorma = {
  id: "schneider-easy9",
  documento: "Schneider Electric Easy9",
  emissor: "Schneider Electric",
  titulo: "Série Easy9 (páginas de distribuidoras; sem PDF no pacote)",
  edicao: "páginas de distribuidoras",
  edicaoCurta: "—",
  data: null,
  situacao: "vigente",
  arquivo: "—",
};

export const FONTES_DISJUNTORES = [CATALOGO_ACTI9, CATALOGO_WEG_DWB_DWA, CATALOGO_EASY9] as const;

/** Spec §4.5, literal, em ordem crescente. */
export const SERIE_DISJUNTORES_A = [
  0.5, 1, 2, 3, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 90, 100, 110, 125, 150, 160, 200, 250, 320, 400, 500,
  630, 650, 800, 1000, 1250, 1600,
] as const;

export const MAIOR_DISJUNTOR_A = SERIE_DISJUNTORES_A[SERIE_DISJUNTORES_A.length - 1];
