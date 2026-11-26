import "server-only";

import { prisma } from "@/lib/prisma";
import { ENCERRADA, type StatusLinha } from "../recursos";

export type ParceiroNaLista = {
  id: string;
  nome: string;
  disciplinaId: string | null;
  disciplina: string | null;
  ativo: boolean;
  /** Tarefas do cronograma com este parceiro (todas) e as que ainda não terminaram. */
  tarefas: number;
  abertas: number;
};

/** A lista da aba Parceiros externos de Recursos: ativos primeiro, por nome. */
export async function parceirosExternos(): Promise<ParceiroNaLista[]> {
  const parceiros = await prisma.parceiroExterno.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      ativo: true,
      disciplinaId: true,
      disciplina: { select: { nome: true } },
      atribuicoes: { select: { tarefa: { select: { status: true } } } },
    },
  });
  return parceiros.map((p) => ({
    id: p.id,
    nome: p.nome,
    disciplinaId: p.disciplinaId,
    disciplina: p.disciplina?.nome ?? null,
    ativo: p.ativo,
    tarefas: p.atribuicoes.length,
    abertas: p.atribuicoes.filter((a) => !ENCERRADA.has(a.tarefa.status as StatusLinha)).length,
  }));
}

/** O que a EAP oferece para nomear a etapa de terceiro: os ativos, por nome. */
export async function parceirosParaEscolha(): Promise<{ id: string; nome: string; disciplina: string | null }[]> {
  const ps = await prisma.parceiroExterno.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, disciplina: { select: { nome: true } } },
  });
  return ps.map((p) => ({ id: p.id, nome: p.nome, disciplina: p.disciplina?.nome ?? null }));
}

/** O catálogo de disciplinas ativas, para o campo Disciplina do cadastro. */
export async function disciplinasDoCatalogo(): Promise<{ id: string; nome: string }[]> {
  return prisma.disciplinaCatalogo.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } });
}
