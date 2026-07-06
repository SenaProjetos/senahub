import "server-only";
import { prisma } from "@/lib/prisma";

export type NomenclaturaResolvida = { exigir: boolean; padrao: string | null };

/** Config efetiva para um projeto: a linha do projeto sobrescreve a global. */
export async function resolverNomenclatura(projetoId: string): Promise<NomenclaturaResolvida> {
  const [proj, glob] = await Promise.all([
    prisma.nomenclaturaConfig.findUnique({ where: { projetoId }, select: { exigir: true, padrao: true } }),
    prisma.nomenclaturaConfig.findFirst({ where: { projetoId: null }, select: { exigir: true, padrao: true } }),
  ]);
  return {
    exigir: proj?.exigir ?? glob?.exigir ?? true,
    padrao: proj?.padrao ?? glob?.padrao ?? null,
  };
}

/** Config global (singleton) para a tela de Configurações. */
export async function nomenclaturaGlobal(): Promise<{ exigir: boolean; padrao: string }> {
  const g = await prisma.nomenclaturaConfig.findFirst({
    where: { projetoId: null },
    select: { exigir: true, padrao: true },
  });
  return { exigir: g?.exigir ?? true, padrao: g?.padrao ?? "" };
}

/** Config específica do projeto (definido=false → herda a global). */
export async function nomenclaturaDoProjeto(
  projetoId: string,
): Promise<{ exigir: boolean; padrao: string; definido: boolean }> {
  const p = await prisma.nomenclaturaConfig.findUnique({
    where: { projetoId },
    select: { exigir: true, padrao: true },
  });
  return p ? { exigir: p.exigir, padrao: p.padrao ?? "", definido: true } : { exigir: true, padrao: "", definido: false };
}
