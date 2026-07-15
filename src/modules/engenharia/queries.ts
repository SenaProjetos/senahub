import "server-only";
import { prisma } from "@/lib/prisma";

export type PadraoItem = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string | null;
  disciplinaId: string | null;
  arquivoNome: string;
  tamanho: number;
  autor: string;
  autorId: string;
  data: Date;
  downloadUrl: string;
};

export type GrupoPadroes = {
  disciplinaId: string | null;
  disciplinaNome: string;
  categoria: string | null;
  itens: PadraoItem[];
};

export type NormaItem = {
  id: string;
  numero: string;
  titulo: string;
  ano: number;
  arquivoNome: string;
  tamanho: number;
  autor: string;
  autorId: string;
  data: Date;
  downloadUrl: string;
};

/** Disciplinas do catálogo p/ o seletor do form de padrão. */
export async function disciplinasCatalogo() {
  return prisma.disciplinaCatalogo.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, categoria: true },
  });
}

/** Mapa id→nome dos autores (autorId é String livre, sem FK). */
async function nomesAutores(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Padrões técnicos agrupados por disciplina (null = "Geral"), ordenados. */
export async function listarPadroes(): Promise<GrupoPadroes[]> {
  const padroes = await prisma.padraoTecnico.findMany({
    where: { ativo: true },
    orderBy: [{ titulo: "asc" }],
    include: { disciplina: { select: { id: true, nome: true, categoria: true, ordem: true } } },
  });
  const autores = await nomesAutores(padroes.map((p) => p.autorId));

  const grupos = new Map<string, GrupoPadroes & { ordem: number }>();
  for (const p of padroes) {
    const chave = p.disciplinaId ?? "__geral";
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        disciplinaId: p.disciplina?.id ?? null,
        disciplinaNome: p.disciplina?.nome ?? "Geral",
        categoria: p.disciplina?.categoria ?? null,
        ordem: p.disciplina?.ordem ?? 9999,
        itens: [],
      });
    }
    grupos.get(chave)!.itens.push({
      id: p.id,
      titulo: p.titulo,
      descricao: p.descricao,
      tipo: p.tipo,
      disciplinaId: p.disciplinaId,
      arquivoNome: p.arquivoNome,
      tamanho: p.tamanho,
      autor: autores.get(p.autorId) ?? "—",
      autorId: p.autorId,
      data: p.createdAt,
      downloadUrl: `/api/engenharia/padroes/${p.id}/download`,
    });
  }

  // "Geral" por último; demais por ordem do catálogo e nome.
  return [...grupos.values()]
    .sort((a, b) => {
      if (a.disciplinaId === null) return 1;
      if (b.disciplinaId === null) return -1;
      return a.ordem - b.ordem || a.disciplinaNome.localeCompare(b.disciplinaNome);
    })
    .map((g): GrupoPadroes => ({
      disciplinaId: g.disciplinaId,
      disciplinaNome: g.disciplinaNome,
      categoria: g.categoria,
      itens: g.itens,
    }));
}

/** Normas catalogadas, mais recentes primeiro (busca é client-side por numero/titulo/ano). */
export async function listarNormas(): Promise<NormaItem[]> {
  const normas = await prisma.normaTecnica.findMany({
    where: { ativo: true },
    orderBy: [{ numero: "asc" }, { ano: "desc" }],
  });
  const autores = await nomesAutores(normas.map((n) => n.autorId));
  return normas.map((n) => ({
    id: n.id,
    numero: n.numero,
    titulo: n.titulo,
    ano: n.ano,
    arquivoNome: n.arquivoNome,
    tamanho: n.tamanho,
    autor: autores.get(n.autorId) ?? "—",
    autorId: n.autorId,
    data: n.createdAt,
    downloadUrl: `/api/engenharia/normas/${n.id}/download`,
  }));
}
