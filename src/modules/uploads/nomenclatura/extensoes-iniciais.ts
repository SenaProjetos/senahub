/**
 * Carga inicial do catálogo de extensões (§3.4 da spec `2026-09-15-motor-nomenclatura.md`).
 *
 * Só formatos confirmados: os que aparecem no acervo de produção (2026-09-15) e os softwares que
 * o escritório usa (TQS, CAD, AltoQi, CYPE, Revit, Office). Nada inventado — extensão nova se
 * cadastra na tela do catálogo depois da F2, não aqui (ADR-0003, regra 3).
 *
 * `zip`/`rar`/`7z` são CONTÊINER, nunca backup por si sós: o que decide é nome e contexto.
 */

import type { ExtensaoDef } from "./extensoes";

export const CATEGORIAS_EXTENSAO = [
  "documento",
  "planilha",
  "apresentacao",
  "imagem",
  "desenho_cad",
  "modelo_bim",
  "backup_software",
  "compactado",
  "temporario",
  "log",
] as const;

export const EXTENSOES_INICIAIS: ExtensaoDef[] = [
  { extensao: "pdf", categoria: "documento" },
  { extensao: "doc", categoria: "documento", software: "Office" },
  { extensao: "docx", categoria: "documento", software: "Office" },
  { extensao: "txt", categoria: "documento" },
  { extensao: "rtf", categoria: "documento" },
  { extensao: "xls", categoria: "planilha", software: "Office" },
  { extensao: "xlsx", categoria: "planilha", software: "Office" },
  { extensao: "xlsm", categoria: "planilha", software: "Office" },
  { extensao: "csv", categoria: "planilha" },
  { extensao: "ppt", categoria: "apresentacao", software: "Office" },
  { extensao: "pptx", categoria: "apresentacao", software: "Office" },
  { extensao: "png", categoria: "imagem" },
  { extensao: "jpg", categoria: "imagem" },
  { extensao: "jpeg", categoria: "imagem" },
  { extensao: "dwg", categoria: "desenho_cad", software: "AutoCAD" },
  { extensao: "dxf", categoria: "desenho_cad", software: "AutoCAD" },
  { extensao: "dwt", categoria: "desenho_cad", software: "AutoCAD" },
  { extensao: "dws", categoria: "desenho_cad", software: "AutoCAD" },
  { extensao: "bak", categoria: "temporario", software: "AutoCAD", ehTemporario: true },
  { extensao: "dwl", categoria: "temporario", software: "AutoCAD", ehTemporario: true },
  { extensao: "dwl2", categoria: "temporario", software: "AutoCAD", ehTemporario: true },
  { extensao: "sv$", categoria: "temporario", software: "AutoCAD", ehTemporario: true },
  { extensao: "ifc", categoria: "modelo_bim" },
  { extensao: "ifcxml", categoria: "modelo_bim" },
  { extensao: "ifczip", categoria: "modelo_bim", ehConteiner: true },
  { extensao: "rvt", categoria: "modelo_bim", software: "Revit" },
  { extensao: "rfa", categoria: "modelo_bim", software: "Revit" },
  { extensao: "rte", categoria: "modelo_bim", software: "Revit" },
  { extensao: "rft", categoria: "modelo_bim", software: "Revit" },
  // `modelo.0001.rvt`: cópia automática do Revit, não é revisão de projeto.
  { extensao: "0000.rvt", categoria: "backup_software", software: "Revit", ehBackup: true },
  { extensao: "qibzip", categoria: "backup_software", software: "AltoQi", ehBackup: true, ehConteiner: true },
  { extensao: "tqs", categoria: "backup_software", software: "TQS", ehBackup: true },
  { extensao: "ed3", categoria: "backup_software", software: "CYPE", ehBackup: true },
  { extensao: "zip", categoria: "compactado", ehConteiner: true },
  { extensao: "rar", categoria: "compactado", ehConteiner: true },
  { extensao: "7z", categoria: "compactado", ehConteiner: true },
  { extensao: "log", categoria: "log", ehTemporario: true },
];
