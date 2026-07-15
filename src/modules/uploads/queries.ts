import "server-only";
import { prisma } from "@/lib/prisma";
import { diasRestantesLixeira, DIAS_LIXEIRA } from "./lixeira";

export async function listarUploadsDisciplina(disciplinaId: string) {
  const uploads = await prisma.upload.findMany({
    where: { disciplinaId },
    orderBy: [{ pacote: "asc" }, { createdAt: "desc" }],
    include: { autor: { select: { name: true } }, validadoPor: { select: { name: true } } },
  });
  return uploads;
}

/** Indica se cada pacote obrigatório (A e B) tem ao menos um arquivo. */
export async function pacotesCompletos(disciplinaId: string) {
  const grupos = await prisma.upload.groupBy({
    by: ["pacote"],
    where: { disciplinaId },
    _count: { _all: true },
  });
  const mapa = new Map(grupos.map((g) => [g.pacote, g._count._all]));
  return {
    a: (mapa.get("A") ?? 0) > 0,
    b: (mapa.get("B") ?? 0) > 0,
    outros: mapa.get("OUTROS") ?? 0,
  };
}

export type UploadItem = Awaited<ReturnType<typeof listarUploadsDisciplina>>[number];

/**
 * Lixeira do projeto: arquivos (Upload) na lixeira, mais recentes primeiro. Passa
 * `excluidoEm: { not: null }` explícito para ESCAPAR do filtro global (lib/prisma.ts).
 * Só admin usa isto (a page gateia). Resolve nome de quem excluiu e dias até a purga.
 */
export async function lixeiraDoProjeto(projetoId: string) {
  const uploads = await prisma.upload.findMany({
    where: { disciplina: { projetoId }, excluidoEm: { not: null } },
    orderBy: { excluidoEm: "desc" },
    select: {
      id: true,
      nomeArquivo: true,
      pacote: true,
      versao: true,
      tamanho: true,
      excluidoEm: true,
      excluidoPorId: true,
      disciplinaId: true,
      disciplina: { select: { nome: true } },
    },
  });

  const autorIds = [...new Set(uploads.map((u) => u.excluidoPorId).filter((v): v is string => !!v))];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomePor = new Map(autores.map((u) => [u.id, u.name]));

  return uploads.map((u) => ({
    id: u.id,
    nome: u.nomeArquivo,
    pacote: u.pacote,
    versao: u.versao,
    tamanho: u.tamanho,
    disciplinaId: u.disciplinaId,
    disciplina: u.disciplina.nome,
    excluidoEm: u.excluidoEm!.toISOString(),
    excluidoPor: u.excluidoPorId ? nomePor.get(u.excluidoPorId) ?? null : null,
    diasRestantes: diasRestantesLixeira(u.excluidoEm!),
  }));
}

export type LixeiraItem = Awaited<ReturnType<typeof lixeiraDoProjeto>>[number];
export { DIAS_LIXEIRA };
