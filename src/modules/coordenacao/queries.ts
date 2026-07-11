import "server-only";

import { prisma } from "@/lib/prisma";

export type ModeloCoordenacao = {
  disciplinaId: string;
  disciplinaNome: string;
  uploadId: string;
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  enviadoEm: Date;
  conversao: {
    status: string;
    caminhoFrag: string | null;
    tamanhoFrag: number | null;
    erro: string | null;
    concluidoEm: Date | null;
  } | null;
};

/**
 * Federação derivada (não persistida): para cada disciplina do projeto, a última
 * versão de cada arquivo .ifc enviado, com o estado da conversão para Fragments.
 * O acesso ao projeto (escopo) é validado pela página antes de chamar.
 */
export async function modelosCoordenacao(projetoId: string): Promise<ModeloCoordenacao[]> {
  const uploads = await prisma.upload.findMany({
    where: {
      disciplina: { projetoId },
      nomeArquivo: { endsWith: ".ifc", mode: "insensitive" },
    },
    orderBy: [{ versao: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      nomeArquivo: true,
      versao: true,
      tamanho: true,
      createdAt: true,
      disciplina: { select: { id: true, nome: true } },
      conversao: {
        select: {
          status: true,
          caminhoFrag: true,
          tamanhoFrag: true,
          erro: true,
          concluidoEm: true,
        },
      },
    },
  });

  // Última versão por (disciplina, nomeArquivo) — mesmo agrupamento do versionamento de uploads.
  const vistos = new Set<string>();
  const modelos: ModeloCoordenacao[] = [];
  for (const u of uploads) {
    const chave = `${u.disciplina.id}::${u.nomeArquivo.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    modelos.push({
      disciplinaId: u.disciplina.id,
      disciplinaNome: u.disciplina.nome,
      uploadId: u.id,
      nomeArquivo: u.nomeArquivo,
      versao: u.versao,
      tamanho: u.tamanho,
      enviadoEm: u.createdAt,
      conversao: u.conversao,
    });
  }
  return modelos.sort(
    (a, b) =>
      a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") ||
      a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"),
  );
}

export type ApontamentoView = {
  id: string;
  numero: number;
  disciplinaId: string;
  disciplinaNome: string;
  uploadId: string;
  titulo: string;
  texto: string;
  guids: string[];
  camera: { position: [number, number, number]; target: [number, number, number] };
  snapshotPath: string | null;
  status: string;
  autorId: string;
  autor: string;
  tarefaId: string | null;
  createdAt: string;
};

/**
 * Apontamentos 3D de um projeto (todas as disciplinas), ordenados por número.
 * `disciplinaId`/`autorId` são denormalizados (sem FK, como Pendencia) — os
 * nomes são resolvidos aqui em lote, não via `include`.
 */
export async function apontamentosDoProjeto(projetoId: string): Promise<ApontamentoView[]> {
  const rows = await prisma.apontamentoCoordenacao.findMany({
    where: { projetoId },
    orderBy: { numero: "asc" },
  });
  const autorIds = [...new Set(rows.map((r) => r.autorId))];
  const disciplinaIds = [...new Set(rows.map((r) => r.disciplinaId))];
  const [users, disciplinas] = await Promise.all([
    autorIds.length
      ? prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    disciplinaIds.length
      ? prisma.disciplina.findMany({ where: { id: { in: disciplinaIds } }, select: { id: true, nome: true } })
      : Promise.resolve([]),
  ]);
  const nome = new Map(users.map((u) => [u.id, u.name]));
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.nome]));
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    disciplinaId: r.disciplinaId,
    disciplinaNome: nomeDisciplina.get(r.disciplinaId) ?? "—",
    uploadId: r.uploadId,
    titulo: r.titulo,
    texto: r.texto,
    guids: Array.isArray(r.guids) ? (r.guids as string[]) : [],
    camera: r.camera as ApontamentoView["camera"],
    snapshotPath: r.snapshotPath,
    status: r.status,
    autorId: r.autorId,
    autor: nome.get(r.autorId) ?? "—",
    tarefaId: r.tarefaId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Para um conjunto de TarefaItem, resolve o deep-link do apontamento de
 * coordenação vinculado (via `tarefaItemId`). Usado para pôr um atalho "ver no
 * 3D" em cada item de checklist de tarefas geradas por apontamentos.
 */
export async function hrefsApontamentoPorItem(itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  const rows = await prisma.apontamentoCoordenacao.findMany({
    where: { tarefaItemId: { in: itemIds } },
    select: { tarefaItemId: true, projetoId: true, numero: true },
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.tarefaItemId) m.set(r.tarefaItemId, `/projetos/${r.projetoId}/coordenacao?apontamento=${r.numero}`);
  }
  return m;
}
