import "server-only";
import { prisma } from "@/lib/prisma";
import { wherePermissao } from "@/lib/audiencias";
import type { EscopoDeDados } from "@/lib/roles";
import { coordenaProjeto, ehPerfilCoordenador, PERFIL_COORDENADOR } from "./coordenacao";

/**
 * A coordenação de cada projeto (regra em `coordenacao.ts`), só pessoas ATIVAS. Quem participa do
 * projeto vem antes de quem só o enxerga pelo escopo global — quem lê "o coordenador" (relatório de
 * rentabilidade) pega o primeiro. Projeto sem ninguém fica fora do mapa.
 */
export async function coordenadoresPorProjeto(projetoIds: readonly string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(projetoIds)];
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;
  const doProjeto = { projetoId: { in: ids } };
  const participantes = await prisma.user.findMany({
    where: {
      ativo: true,
      tipo: "interno",
      perfil: { chave: PERFIL_COORDENADOR },
      OR: [{ projetosMembro: { some: doProjeto } }, { disciplinasResponsavel: { some: { disciplina: doProjeto } } }],
    },
    select: {
      id: true,
      projetosMembro: { where: doProjeto, select: { projetoId: true } },
      disciplinasResponsavel: { where: { disciplina: doProjeto }, select: { disciplina: { select: { projetoId: true } } } },
    },
    orderBy: { name: "asc" },
  });
  const globais = await prisma.user.findMany({
    where: { tipo: "interno", perfil: { chave: PERFIL_COORDENADOR }, ...wherePermissao("escopo", "global") },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const incluir = (projetoId: string, userId: string) => {
    const lista = mapa.get(projetoId) ?? [];
    if (!lista.includes(userId)) lista.push(userId);
    mapa.set(projetoId, lista);
  };
  for (const u of participantes) {
    for (const m of u.projetosMembro) incluir(m.projetoId, u.id);
    for (const r of u.disciplinasResponsavel) incluir(r.disciplina.projetoId, u.id);
  }
  for (const id of ids) for (const g of globais) incluir(id, g.id);
  return mapa;
}

export async function coordenadoresDoProjeto(projetoId: string): Promise<string[]> {
  return (await coordenadoresPorProjeto([projetoId])).get(projetoId) ?? [];
}

type Coordenador = { id: string; perfilChave: string | null } & EscopoDeDados;

/** Dos projetos pedidos, os que esta pessoa coordena. */
export async function projetosQueCoordeno(viewer: Coordenador, projetoIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(projetoIds)];
  if (ids.length === 0 || !ehPerfilCoordenador(viewer.perfilChave)) return new Set();
  if (coordenaProjeto({ ...viewer, participa: false })) return new Set(ids);
  if (viewer.tipo !== "interno") return new Set();
  const doProjeto = { projetoId: { in: ids } };
  const membros = await prisma.projetoMembro.findMany({ where: { userId: viewer.id, ...doProjeto }, select: { projetoId: true } });
  const responsavel = await prisma.disciplinaResponsavel.findMany({
    where: { userId: viewer.id, disciplina: doProjeto },
    select: { disciplina: { select: { projetoId: true } } },
  });
  return new Set([...membros.map((m) => m.projetoId), ...responsavel.map((r) => r.disciplina.projetoId)]);
}

export async function coordenoOProjeto(viewer: Coordenador, projetoId: string): Promise<boolean> {
  return (await projetosQueCoordeno(viewer, [projetoId])).has(projetoId);
}
