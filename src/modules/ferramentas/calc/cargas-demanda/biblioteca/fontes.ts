import type { FonteNorma } from "./tipos";

/**
 * Normas e catálogos usados pela calculadora — **puro**. Edição e data conforme a capa de cada PDF (lida na
 * extração) e a spec §1. Situação "a_confirmar" = a tela mostra o aviso de edição (spec §6); "futura" = o aviso de
 * vigência futura.
 */

export const NBR_5410: FonteNorma = {
  id: "nbr-5410",
  documento: "ABNT NBR 5410",
  emissor: "ABNT",
  titulo: "Instalações elétricas de baixa tensão",
  // Capa: "Segunda edição 30.09.2004 · Válida a partir de 31.03.2005 · Versão Corrigida 17.03.2008".
  edicao: "2004 (2ª edição, versão corrigida de 17/03/2008)",
  edicaoCurta: "2004",
  data: "30/09/2004",
  situacao: "a_confirmar",
  arquivo: "ABNT/NBR-5410_2004.pdf",
};
