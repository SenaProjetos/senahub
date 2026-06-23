/**
 * Catálogo de ferramentas de engenharia.
 * Client-safe: sem imports de server-only, Prisma ou Node.js.
 * IDs estáveis — nunca renomear chaves já publicadas (quebra saves históricos).
 */

import type { Disciplina, TipoFerramenta, FormatoExport } from "./types";
import {
  ArrowLeftRight,
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
    exportaveis: [],
    icon: ArrowLeftRight,
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
