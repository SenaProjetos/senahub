import "server-only";
import { prisma } from "@/lib/prisma";
import { diasDeAtraso } from "@/modules/projetos/atraso";
import { formatarCodigo } from "@/modules/projetos/numbering";

export async function minhasDisciplinas(userId: string) {
  const registros = await prisma.disciplinaResponsavel.findMany({
    where: {
      userId,
      disciplina: {
        projeto: { situacao: "em_andamento" },
        status: { notIn: ["aprovado"] },
      },
    },
    orderBy: [{ disciplina: { prazo: "asc" } }],
    select: {
      disciplina: {
        select: {
          id: true,
          nome: true,
          status: true,
          prazo: true,
          projeto: {
            select: {
              id: true,
              codigo: true,
              nome: true,
            },
          },
        },
      },
    },
  });

  const agora = new Date();
  return registros.map(({ disciplina: d }) => ({
    disciplinaId: d.id,
    nome: d.nome,
    status: d.status,
    prazo: d.prazo ? d.prazo.toISOString() : null,
    atraso: diasDeAtraso(d.prazo, d.status, agora),
    projetoId: d.projeto.id,
    projetoNome: d.projeto.nome,
    projetoCodigo: formatarCodigo(d.projeto.codigo),
  }));
}

export type MinhaDisciplina = Awaited<ReturnType<typeof minhasDisciplinas>>[number];
