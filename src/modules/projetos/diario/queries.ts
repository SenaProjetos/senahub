import "server-only";
import { prisma } from "@/lib/prisma";
import { podeEscreverNoDiario, podeGerirEntrada } from "./acesso";
import type { SessionUser } from "@/lib/session";

export type EntradaDiario = {
  id: string;
  disciplinaId: string;
  data: string; // ISO YYYY-MM-DD
  texto: string;
  autorId: string;
  autorNome: string;
  editado: boolean;
  criadoEm: string;
  podeGerir: boolean;
};

export type DiarioDisciplina = {
  disciplinaId: string;
  disciplinaNome: string;
  podeEscrever: boolean;
  entradas: EntradaDiario[];
};

/**
 * Diário do projeto agrupado por disciplina, na ótica de um usuário interno.
 * A visibilidade do projeto já é garantida pelo caller (aba dentro do projeto);
 * aqui montamos as flags finas: quem pode escrever em cada disciplina e quem
 * pode editar/excluir cada entrada.
 */
export async function diarioDoProjeto(user: SessionUser, projetoId: string): Promise<DiarioDisciplina[]> {
  const disciplinas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      nome: true,
      responsaveis: { select: { userId: true } },
      diarioEntradas: {
        orderBy: [{ data: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          disciplinaId: true,
          data: true,
          texto: true,
          autorId: true,
          createdAt: true,
          updatedAt: true,
          autor: { select: { name: true } },
        },
      },
    },
  });

  return disciplinas.map((d) => {
    const ehResp = d.responsaveis.some((r) => r.userId === user.id);
    return {
      disciplinaId: d.id,
      disciplinaNome: d.nome,
      podeEscrever: podeEscreverNoDiario({ role: user.role, ehResponsavelDaDisciplina: ehResp }),
      entradas: d.diarioEntradas.map((e) => ({
        id: e.id,
        disciplinaId: e.disciplinaId,
        data: e.data.toISOString().slice(0, 10),
        texto: e.texto,
        autorId: e.autorId,
        autorNome: e.autor.name,
        editado: e.updatedAt.getTime() - e.createdAt.getTime() > 1000,
        criadoEm: e.createdAt.toISOString(),
        podeGerir: podeGerirEntrada({ userId: user.id, role: user.role, autorId: e.autorId }),
      })),
    };
  });
}
