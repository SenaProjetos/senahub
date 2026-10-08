import "server-only";
import { prisma } from "@/lib/prisma";

/** Catálogo publicado (o que a matriz de Recursos e as pessoas enxergam). */
export async function listarHabilidades() {
  return prisma.habilidade.findMany({ where: { publicada: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
}

export type HabilidadeDePessoa = { id: string; nome: string; nivel: number | null; validado: boolean };

/** Habilidades por usuário (mapa userId → [{id, nome, nivel, validado}]). */
export async function habilidadesDeUsuarios(userIds: string[]): Promise<Record<string, HabilidadeDePessoa[]>> {
  const vinc = await prisma.userHabilidade.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, nivel: true, validadoEm: true, habilidade: { select: { id: true, nome: true } } },
  });
  const mapa: Record<string, HabilidadeDePessoa[]> = {};
  for (const v of vinc) {
    (mapa[v.userId] ??= []).push({ ...v.habilidade, nivel: v.nivel, validado: v.validadoEm != null });
  }
  return mapa;
}

/** Aba Competências da ficha / Minha conta: o que a pessoa tem e o catálogo publicado para declarar. */
export async function competenciasDaPessoa(userId: string) {
  const [minhas, catalogo] = await Promise.all([
    prisma.userHabilidade.findMany({
      where: { userId },
      select: {
        nivel: true, observacao: true, declaradoEm: true, validadoEm: true, validadoPorId: true,
        habilidade: { select: { id: true, nome: true, categoria: true } },
      },
      orderBy: { habilidade: { nome: "asc" } },
    }),
    prisma.habilidade.findMany({ where: { publicada: true }, select: { id: true, nome: true, categoria: true }, orderBy: { nome: "asc" } }),
  ]);
  const validadores = await prisma.user.findMany({
    where: { id: { in: [...new Set(minhas.map((m) => m.validadoPorId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const nome = new Map(validadores.map((v) => [v.id, v.name]));
  return {
    competencias: minhas.map((m) => ({
      habilidadeId: m.habilidade.id,
      nome: m.habilidade.nome,
      categoria: m.habilidade.categoria,
      nivel: m.nivel,
      observacao: m.observacao,
      validadoEm: m.validadoEm?.toISOString() ?? null,
      validadoPor: m.validadoPorId ? (nome.get(m.validadoPorId) ?? null) : null,
    })),
    catalogo,
  };
}
export type CompetenciasDaPessoa = Awaited<ReturnType<typeof competenciasDaPessoa>>;

/** Catálogo inteiro para o RH: publicadas e propostas, com quantas pessoas e projetos usam. */
export async function catalogoCompetencias() {
  const hs = await prisma.habilidade.findMany({
    orderBy: [{ publicada: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, categoria: true, publicada: true, propostaPorId: true, _count: { select: { usuarios: true, necessidades: true } } },
  });
  const autores = await prisma.user.findMany({
    where: { id: { in: [...new Set(hs.map((h) => h.propostaPorId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const nome = new Map(autores.map((a) => [a.id, a.name]));
  return hs.map((h) => ({
    id: h.id,
    nome: h.nome,
    categoria: h.categoria,
    publicada: h.publicada,
    propostaPor: h.propostaPorId ? (nome.get(h.propostaPorId) ?? null) : null,
    pessoas: h._count.usuarios,
    projetos: h._count.necessidades,
  }));
}
export type CompetenciaCatalogo = Awaited<ReturnType<typeof catalogoCompetencias>>[number];

/** Necessidades de todos os projetos e, para cada competência pedida, o nível de cada pessoa. */
export async function necessidadesDeHabilidade() {
  const necessidades = await prisma.necessidadeHabilidade.findMany({
    select: { id: true, projetoId: true, nivelMinimo: true, observacao: true, habilidade: { select: { id: true, nome: true } } },
    orderBy: { habilidade: { nome: "asc" } },
  });
  const ids = [...new Set(necessidades.map((n) => n.habilidade.id))];
  const niveis = ids.length
    ? await prisma.userHabilidade.findMany({
        where: { habilidadeId: { in: ids } },
        select: { userId: true, habilidadeId: true, nivel: true, validadoEm: true },
      })
    : [];
  const porHabilidade: Record<string, Record<string, { nivel: number | null; validadoEm: string | null }>> = {};
  for (const n of niveis) (porHabilidade[n.habilidadeId] ??= {})[n.userId] = { nivel: n.nivel, validadoEm: n.validadoEm?.toISOString() ?? null };
  return {
    necessidades: necessidades.map((n) => ({
      id: n.id,
      projetoId: n.projetoId,
      habilidadeId: n.habilidade.id,
      habilidade: n.habilidade.nome,
      nivelMinimo: n.nivelMinimo,
      observacao: n.observacao,
    })),
    niveisPorHabilidade: porHabilidade,
  };
}
export type NecessidadesHabilidade = Awaited<ReturnType<typeof necessidadesDeHabilidade>>;
