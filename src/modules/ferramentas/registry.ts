/**
 * Catálogo de ferramentas de engenharia.
 * Client-safe: sem imports de server-only, Prisma ou Node.js.
 * IDs estáveis — nunca renomear chaves já publicadas (quebra saves históricos).
 */

import type { Disciplina, TipoFerramenta, FormatoExport } from "./types";
import {
  ArrowLeftRight,
  Shapes,
  RectangleHorizontal,
  type LucideIcon,
} from "lucide-react";

export type FerramentaMeta = {
  /** Chave estável da ferramenta (ex.: "U01"). Igual ao entradasJson.ferramenta. */
  key: string;
  nome: string;
  descricao: string;
  disciplina: Disciplina;
  tipo: TipoFerramenta;
  /** Norma de referência (ex.: "NBR 6118:2023"). Omitir quando não aplicável. */
  norma?: string;
  /** Formatos de exportação disponíveis. Vazio na F0; preenchido na F1+. */
  exportaveis: FormatoExport[];
  icon: LucideIcon;
};

export const FERRAMENTAS: FerramentaMeta[] = [
  {
    key: "U01",
    nome: "Conversor de Unidades",
    descricao: "Converte valores entre unidades de engenharia: comprimento, área, volume, massa, força, tensão, momento, vazão e ângulo.",
    disciplina: "Universal",
    tipo: "rapida",
    exportaveis: ["pdf"],
    icon: ArrowLeftRight,
  },
  {
    key: "U02",
    nome: "Propriedades de Seção",
    descricao: "Área, centroide, momentos de inércia, módulos resistentes e raios de giração para seções retangular, circular, T e poligonal.",
    disciplina: "Universal",
    tipo: "rapida",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: Shapes,
  },
  {
    key: "E01",
    nome: "Viga de Concreto à Flexão",
    descricao: "Dimensionamento à flexão simples (ELU): armadura de tração e compressão, domínios e armadura mínima/máxima, para seções retangular e T.",
    disciplina: "Estrutural",
    tipo: "completa",
    norma: "NBR 6118:2023",
    exportaveis: ["pdf", "docx", "xlsx", "dxf"],
    icon: RectangleHorizontal,
  },
];

export function getFerramenta(key: string): FerramentaMeta | undefined {
  return FERRAMENTAS.find((f) => f.key === key);
}

export function porDisciplina(): Record<Disciplina, FerramentaMeta[]> {
  const map = {} as Record<Disciplina, FerramentaMeta[]>;
  for (const f of FERRAMENTAS) {
    if (!map[f.disciplina]) map[f.disciplina] = [];
    map[f.disciplina].push(f);
  }
  return map;
}
