import "server-only";
import { prisma } from "@/lib/prisma";
import type { Faixa } from "@/lib/encargos";

export type FaixaDTO = Faixa & { id: string; tipo: string; ordem: number };

export async function listarFaixas(): Promise<FaixaDTO[]> {
  const faixas = await prisma.encargoFaixa.findMany({ orderBy: [{ tipo: "asc" }, { ordem: "asc" }] });
  return faixas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    ordem: f.ordem,
    limite: Number(f.limite),
    aliquota: Number(f.aliquota),
    deduzir: Number(f.deduzir),
  }));
}

export async function faixasPorTipo(): Promise<{ inss: FaixaDTO[]; irrf: FaixaDTO[] }> {
  const todas = await listarFaixas();
  return {
    inss: todas.filter((f) => f.tipo === "inss"),
    irrf: todas.filter((f) => f.tipo === "irrf"),
  };
}
