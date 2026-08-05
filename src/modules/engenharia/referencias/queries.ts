import "server-only";
import { prisma } from "@/lib/prisma";

export type ReferenciaItem = {
  id: string;
  titulo: string;
  tipo: string;
  autorObra: string | null;
  ano: number | null;
  tags: string[];
  descricao: string | null;
  linkExterno: string | null;
  arquivoNome: string | null;
  mime: string | null;
  tamanho: number | null;
  autor: string;
  autorId: string;
  data: Date;
  downloadUrl: string | null;
};

/** Mapa id→nome dos autores (autorId é String livre, sem FK). */
async function nomesAutores(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (unicos.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Referências catalogadas, mais recentes primeiro (busca/filtro são client-side). */
export async function listarReferencias(): Promise<ReferenciaItem[]> {
  const refs = await prisma.referenciaTecnica.findMany({
    where: { ativo: true },
    orderBy: [{ createdAt: "desc" }],
  });
  const autores = await nomesAutores(refs.map((r) => r.autorId));
  return refs.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    tipo: r.tipo,
    autorObra: r.autorObra,
    ano: r.ano,
    tags: r.tags,
    descricao: r.descricao,
    linkExterno: r.linkExterno,
    arquivoNome: r.arquivoNome,
    mime: r.mime,
    tamanho: r.tamanho,
    autor: autores.get(r.autorId) ?? "—",
    autorId: r.autorId,
    data: r.createdAt,
    downloadUrl: r.arquivoPath ? `/api/engenharia/referencias/${r.id}/download` : null,
  }));
}
