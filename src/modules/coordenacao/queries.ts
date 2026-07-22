import "server-only";

import { prisma } from "@/lib/prisma";
import { refDocumento } from "@/modules/coordenacao/modelo-ref";

/** Rótulo do "grupo" onde os IFCs recebidos do cliente aparecem no painel. */
export const GRUPO_RECEBIDOS = "Recebido do cliente";

export type ModeloCoordenacao = {
  /** Origem: `upload` (IFC de disciplina) ou `documento` (IFC recebido do cliente). */
  tipo: "upload" | "documento";
  /** Vazio para recebidos (não têm disciplina). */
  disciplinaId: string;
  disciplinaNome: string;
  /** Chave do modelo: uploadId cru (disciplina) ou `d:<documentoVersaoId>` (recebido). */
  uploadId: string;
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  enviadoEm: Date;
  conversao: {
    status: string;
    progresso: number | null;
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
          progresso: true,
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
      tipo: "upload",
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

  // IFCs recebidos do cliente (repositório Documento, origem != interno) ancorados ao
  // projeto ou à sua proposta. Cada Documento entra com a versão MAIS RECENTE.
  modelos.push(...(await recebidosIfc(projetoId)));

  return modelos.sort(
    (a, b) =>
      a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") ||
      a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"),
  );
}

/**
 * IFCs recebidos do cliente (Documento origem != interno) do projeto/proposta, com a
 * versão mais recente e o estado da conversão para Fragments. Cada um vira um
 * ModeloCoordenacao com chave `d:<versaoId>` e sem disciplina.
 */
async function recebidosIfc(projetoId: string): Promise<ModeloCoordenacao[]> {
  const proposta = await prisma.proposta.findUnique({ where: { projetoId }, select: { id: true } });
  const ancoras = [{ projetoId }, ...(proposta ? [{ propostaId: proposta.id }] : [])];
  const docs = await prisma.documento.findMany({
    where: { origem: { not: "interno" }, OR: ancoras },
    select: {
      versoes: {
        orderBy: { numero: "desc" },
        take: 1,
        select: {
          id: true,
          numero: true,
          nomeArquivo: true,
          tamanho: true,
          createdAt: true,
          conversao: {
            select: {
              status: true,
              progresso: true,
              caminhoFrag: true,
              tamanhoFrag: true,
              erro: true,
              concluidoEm: true,
            },
          },
        },
      },
    },
  });

  const modelos: ModeloCoordenacao[] = [];
  for (const d of docs) {
    const v = d.versoes[0];
    if (!v || !/\.ifc$/i.test(v.nomeArquivo)) continue;
    modelos.push({
      tipo: "documento",
      disciplinaId: "",
      disciplinaNome: GRUPO_RECEBIDOS,
      uploadId: refDocumento(v.id),
      nomeArquivo: v.nomeArquivo,
      versao: v.numero,
      tamanho: v.tamanho,
      enviadoEm: v.createdAt,
      conversao: v.conversao,
    });
  }
  return modelos;
}

export type ApontamentoView = {
  id: string;
  numero: number;
  /** Null quando o apontamento é sobre um IFC recebido do cliente (sem disciplina). */
  disciplinaId: string | null;
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
  const disciplinaIds = [...new Set(rows.map((r) => r.disciplinaId).filter((x): x is string => !!x))];
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
    disciplinaNome: r.disciplinaId ? (nomeDisciplina.get(r.disciplinaId) ?? "—") : GRUPO_RECEBIDOS,
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

// ── Dashboard de coordenação ─────────────────────────────────
// Agregação pura fica em dashboard.ts; aqui só a I/O (busca + resolve nomes de
// disciplina em lote, mesmo padrão de apontamentosDoProjeto).

export async function dashboardApontamentos(
  projetoId: string,
): Promise<{ createdAt: string; resolvidoEm: string | null; fechadoEm: string | null; status: string; disciplinaNome: string }[]> {
  const rows = await prisma.apontamentoCoordenacao.findMany({
    where: { projetoId },
    select: { createdAt: true, resolvidoEm: true, fechadoEm: true, status: true, disciplinaId: true },
  });
  const disciplinaIds = [...new Set(rows.map((r) => r.disciplinaId).filter((x): x is string => !!x))];
  const disciplinas = disciplinaIds.length
    ? await prisma.disciplina.findMany({ where: { id: { in: disciplinaIds } }, select: { id: true, nome: true } })
    : [];
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.nome]));
  return rows.map((r) => ({
    createdAt: r.createdAt.toISOString(),
    resolvidoEm: r.resolvidoEm?.toISOString() ?? null,
    fechadoEm: r.fechadoEm?.toISOString() ?? null,
    status: r.status,
    disciplinaNome: r.disciplinaId ? (nomeDisciplina.get(r.disciplinaId) ?? "—") : GRUPO_RECEBIDOS,
  }));
}

// ── Vistas salvas ─────────────────────────────────────────────
// Shapes de câmera/corte espelham CameraApontamento/CorteConfig do viewer/engine.ts,
// mas NÃO importam de lá — engine.ts é client-only (three/@thatopen/fragments).

export type VistaView = {
  id: string;
  nome: string;
  camera: { position: [number, number, number]; target: [number, number, number] };
  modelosVisiveis: string[];
  corte: { eixo: "x" | "y" | "z"; posicao: number; invertido: boolean } | null;
  autorId: string;
  autor: string;
  createdAt: string;
};

/** Vistas salvas de um projeto (câmera + modelos visíveis + corte), mais recentes primeiro. */
export async function vistasDoProjeto(projetoId: string): Promise<VistaView[]> {
  const rows = await prisma.vistaCoordenacao.findMany({
    where: { projetoId },
    orderBy: { createdAt: "desc" },
  });
  const autorIds = [...new Set(rows.map((r) => r.autorId))];
  const users = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nome = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    camera: r.camera as VistaView["camera"],
    modelosVisiveis: r.modelosVisiveis as string[],
    corte: (r.corte as VistaView["corte"]) ?? null,
    autorId: r.autorId,
    autor: nome.get(r.autorId) ?? "—",
    createdAt: r.createdAt.toISOString(),
  }));
}
