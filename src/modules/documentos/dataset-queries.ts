import "server-only";
import { prisma } from "@/lib/prisma";

export type DatasetListItem = {
  id: string;
  nome: string;
  nColunas: number;
  nLinhas: number;
  createdAt: Date;
};

/** Conta os elementos de um campo Json que esperamos ser um array. */
function tamanho(valor: unknown): number {
  return Array.isArray(valor) ? valor.length : 0;
}

/** Lista os datasets de CSV, mais recentes primeiro, com contagens de colunas/linhas. */
export async function listarDatasets(): Promise<DatasetListItem[]> {
  const datasets = await prisma.datasetDocumento.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, colunas: true, linhas: true, createdAt: true },
  });
  return datasets.map((d) => ({
    id: d.id,
    nome: d.nome,
    nColunas: tamanho(d.colunas),
    nLinhas: tamanho(d.linhas),
    createdAt: d.createdAt,
  }));
}
