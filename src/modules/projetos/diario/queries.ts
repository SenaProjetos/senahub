import "server-only";
import { prisma } from "@/lib/prisma";
import { podeEscreverNoDiario, podeGerirEntrada, ehGlobal } from "./acesso";
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

export type UltimaEntradaDiario = {
  id: string;
  data: string; // ISO YYYY-MM-DD
  texto: string;
  autorNome: string;
  criadoEm: string;
  editado: boolean;
};

/** Últimas N entradas de UMA disciplina (mais recente primeiro) — para o atalho fora do painel. */
export async function ultimasEntradasDisciplina(disciplinaId: string, n = 5): Promise<UltimaEntradaDiario[]> {
  const entradas = await prisma.diarioEntrada.findMany({
    where: { disciplinaId },
    orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    take: n,
    select: { id: true, data: true, texto: true, createdAt: true, updatedAt: true, autor: { select: { name: true } } },
  });
  return entradas.map((e) => ({
    id: e.id,
    data: e.data.toISOString().slice(0, 10),
    texto: e.texto,
    autorNome: e.autor.name,
    criadoEm: e.createdAt.toISOString(),
    editado: e.updatedAt.getTime() - e.createdAt.getTime() > 1000,
  }));
}

export type DisciplinaEscrevivel = { id: string; nome: string };

/**
 * Disciplinas do projeto em que o usuário PODE escrever no diário: perfil
 * global vê todas (mesma regra de `podeEscreverNoDiario`); demais só as que
 * são responsáveis. Base do atalho no ponto — projeto sem nenhuma disciplina
 * elegível devolve lista vazia (o caller esconde o atalho).
 */
export async function disciplinasEscreviveisNoProjeto(user: SessionUser, projetoId: string): Promise<DisciplinaEscrevivel[]> {
  const disciplinas = await prisma.disciplina.findMany({
    where: {
      projetoId,
      ...(ehGlobal(user.role) ? {} : { responsaveis: { some: { userId: user.id } } }),
    },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
  return disciplinas;
}
