import "server-only";
import { prisma } from "@/lib/prisma";
import { CLT_ROLES } from "@/lib/roles";

export async function listarFolhas() {
  const folhas = await prisma.folhaPagamento.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: { holerites: { include: { itens: true } } },
  });
  return folhas.map((f) => {
    let proventos = 0;
    let descontos = 0;
    for (const h of f.holerites) {
      for (const it of h.itens) {
        if (it.tipo === "provento") proventos += Number(it.valor);
        else descontos += Number(it.valor);
      }
    }
    return {
      id: f.id,
      ano: f.ano,
      mes: f.mes,
      status: f.status,
      fechadaEm: f.fechadaEm,
      holerites: f.holerites.length,
      proventos,
      descontos,
      liquido: proventos - descontos,
    };
  });
}

export async function obterFolha(id: string) {
  const folha = await prisma.folhaPagamento.findUnique({
    where: { id },
    include: {
      holerites: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          itens: { orderBy: { descricao: "asc" } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!folha) return null;

  const [rubricas, elegiveis] = await Promise.all([
    prisma.rubricaFolha.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
    prisma.user.findMany({
      where: { ativo: true, role: { in: CLT_ROLES } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { folha, rubricas, elegiveis };
}

export type FolhaResumo = Awaited<ReturnType<typeof listarFolhas>>[number];
export type FolhaDetalhe = NonNullable<Awaited<ReturnType<typeof obterFolha>>>;
