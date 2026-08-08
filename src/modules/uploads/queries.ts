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

/**
 * Ids dos arquivos deste projeto com pedido de exclusão PENDENTE — sinal na árvore do
 * explorer (badge "exclusão solicitada" + botão de pedir desarmado). `solicitanteId`
 * restringe à visão de quem só enxerga o próprio pedido; sem ele, vêm todos (admin).
 */
export async function pedidosExclusaoPendentesDoProjeto(
  projetoId: string,
  solicitanteId?: string,
) {
  const pedidos = await prisma.solicitacaoExclusaoUpload.findMany({
    where: { projetoId, status: "pendente", ...(solicitanteId ? { solicitanteId } : {}) },
    select: { uploadId: true },
  });
  return pedidos.map((p) => p.uploadId);
}

/**
 * Fila de pedidos de exclusão pendentes (todos os projetos) — a segunda seção de
 * `/aprovacoes`, gateada a admin na page. Traz arquivo, projeto, disciplina e quem pediu.
 * Leitura ANINHADA do upload de propósito (o pedido pode apontar para um arquivo que um
 * admin já mandou pra lixeira por fora — ele precisa aparecer pra ser encerrado).
 */
export async function pedidosExclusaoPendentes() {
  const pedidos = await prisma.solicitacaoExclusaoUpload.findMany({
    where: { status: "pendente" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      justificativa: true,
      createdAt: true,
      uploadId: true,
      solicitante: { select: { name: true } },
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          versao: true,
          tamanho: true,
          excluidoEm: true,
          disciplina: {
            select: { nome: true, projetoId: true, projeto: { select: { codigo: true, nome: true } } },
          },
        },
      },
    },
  });

  return pedidos.map((p) => ({
    id: p.id,
    uploadId: p.uploadId,
    nome: p.upload.nomeArquivo,
    pacote: p.upload.pacote,
    versao: p.upload.versao,
    tamanho: p.upload.tamanho,
    // Já na lixeira: o pedido virou formalidade, a UI mostra isso e só encerra.
    jaNaLixeira: p.upload.excluidoEm !== null,
    disciplina: p.upload.disciplina.nome,
    projetoId: p.upload.disciplina.projetoId,
    projetoCodigo: p.upload.disciplina.projeto.codigo,
    projetoNome: p.upload.disciplina.projeto.nome,
    solicitante: p.solicitante.name,
    justificativa: p.justificativa,
    criadoEm: p.createdAt.toISOString(),
    href: `/projetos/${p.upload.disciplina.projetoId}/arquivos`,
    downloadUrl: `/api/uploads/${p.uploadId}/download`,
  }));
}

export type PedidoExclusaoPendente = Awaited<ReturnType<typeof pedidosExclusaoPendentes>>[number];

export type RevisaoDocumento = { uploadId: string; versao: number; excluido: boolean };

/**
 * Todas as versões (Upload) de um documento, mais recente primeiro — pro comparador de
 * revisões (itens 4/5). Leitura ANINHADA de propósito (`documentoDisciplina.findUnique` →
 * `include: { uploads }`), pra ESCAPAR do filtro de soft-delete (`lib/prisma.ts` só
 * intercepta `prisma.upload.*` top-level): uma revisão antiga jogada na lixeira continua
 * valendo pra comparação ("o que mudou desde a versão que foi descartada" é uma pergunta
 * legítima), então ela precisa aparecer no seletor — com um sinal visual de que está
 * excluída, não escondida.
 */
export type PranchaVigente = { uploadId: string; nomeArquivo: string };

/**
 * Pranchas VIGENTES (versão mais recente de cada documento) de uma disciplina, exceto a
 * informada — candidatas a destino do "replicar apontamento" (item 30). Só a versão vigente
 * faz sentido como destino, mesma regra de `criarPendencia` (apontar em versão obsoleta não
 * cabe). `prisma.upload` no topo passa pelo filtro de soft-delete (`lib/prisma.ts`) — aqui é
 * proposital: prancha excluída não deve virar destino de replicação. (Oposto de
 * `revisoesDoDocumento`, que bypassa esse filtro de propósito, pra listar histórico completo.)
 */
export async function pranchasVigentesDisciplina(disciplinaId: string, excluirUploadId: string): Promise<PranchaVigente[]> {
  const uploads = await prisma.upload.findMany({
    where: { disciplinaId, id: { not: excluirUploadId } },
    select: { id: true, nomeArquivo: true, documentoId: true, versao: true, pacote: true },
    orderBy: { versao: "desc" },
  });
  const vistos = new Set<string>();
  const vigentes: PranchaVigente[] = [];
  for (const u of uploads) {
    // Chave de "mesmo documento": documentoId quando existe; fallback pra nome+pacote em
    // linha legada sem pai (mesmo padrão de fallback usado em `criarPendencia`).
    const chave = u.documentoId ?? `${u.pacote ?? ""}/${u.nomeArquivo}`;
    if (vistos.has(chave)) continue; // já viu a versão mais recente (ordenado desc)
    vistos.add(chave);
    vigentes.push({ uploadId: u.id, nomeArquivo: u.nomeArquivo });
  }
  return vigentes;
}

export async function revisoesDoDocumento(documentoId: string): Promise<RevisaoDocumento[]> {
  const doc = await prisma.documentoDisciplina.findUnique({
    where: { id: documentoId },
    include: { uploads: { select: { id: true, versao: true, excluidoEm: true }, orderBy: { versao: "desc" } } },
  });
  if (!doc) return [];
  return doc.uploads.map((u) => ({ uploadId: u.id, versao: u.versao, excluido: u.excluidoEm != null }));
}
