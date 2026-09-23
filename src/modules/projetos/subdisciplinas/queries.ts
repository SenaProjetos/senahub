import "server-only";
import { prisma } from "@/lib/prisma";

/** Subs de UM card, ativas e arquivadas, com a sigla oficial atual (qualquer faixa em aberto). */
export async function subdisciplinasDoCard(disciplinaCatalogoId: string) {
  const subs = await prisma.subdisciplinaCatalogo.findMany({
    where: { disciplinaCatalogoId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    include: { siglas: { orderBy: { versaoDesde: "asc" } } },
  });
  return subs.map((s) => ({
    ...s,
    siglaAtual: s.siglas.find((sig) => sig.oficial && sig.versaoAte === null)?.sigla ?? s.siglas.find((sig) => sig.oficial)?.sigla ?? null,
  }));
}

export type SubdisciplinaAdmin = Awaited<ReturnType<typeof subdisciplinasDoCard>>[number];
