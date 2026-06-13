import "server-only";
import { prisma } from "@/lib/prisma";
import { docSchemaZ, docVazio, type DocSchema } from "@/modules/documentos/schema";

export async function listarModelos() {
  return prisma.documentoModelo.findMany({
    where: { ativo: true },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { versoes: true } } },
  });
}

export async function obterModelo(id: string) {
  const m = await prisma.documentoModelo.findUnique({
    where: { id },
    include: {
      versoes: {
        orderBy: { numero: "desc" },
        take: 20,
        include: { autor: { select: { name: true } } },
      },
    },
  });
  if (!m) return null;
  const parsed = docSchemaZ.safeParse(m.schemaJson);
  return { ...m, schema: parsed.success ? parsed.data : docVazio() };
}

/** Opções para os parâmetros das fontes (selects do preview). */
export async function opcoesParametros() {
  const [projetos, usuarios, propostas, clientes, licitacoes, holerites] = await Promise.all([
    prisma.projeto.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: { ativo: true, role: { in: ["projetista_pj", "freelancer", "clt", "estagiario"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.proposta.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, numero: true, titulo: true },
      take: 100,
    }),
    prisma.cliente.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
      take: 200,
    }),
    prisma.licitacao.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, titulo: true },
      take: 100,
    }),
    prisma.holerite.findMany({
      orderBy: { folha: { ano: "desc" } },
      select: { id: true, user: { select: { name: true } }, folha: { select: { ano: true, mes: true } } },
      take: 100,
    }),
  ]);
  return { projetos, usuarios, propostas, clientes, licitacoes, holerites };
}

export type ModeloListItem = Awaited<ReturnType<typeof listarModelos>>[number];
export type ModeloDetalhe = NonNullable<Awaited<ReturnType<typeof obterModelo>>> & {
  schema: DocSchema;
};
