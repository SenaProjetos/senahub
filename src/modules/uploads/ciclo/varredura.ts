import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { EstadoRevisao } from "./estados";
import { encontrarViolacoes, type RevisaoVarrida, type Violacao } from "./integridade";
import { aplicarDispensas, type DispensaAtiva, type ItemPendencia, type TipoPendencia } from "./pendencias";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A leitura do job A7 e da tela de pendências: UMA só, para os dois nunca divergirem. Lê só o que importa
 * (revisões vivas, controles de pasta ativos, em análise, arquivadas com arquivo na lixeira). `extra`
 * estreita a busca (um projeto no smoke, uma revisão ou um documento ao dispensar).
 */
export async function carregarRevisoesVarridas(db: Db, extra?: Prisma.DocumentoRevisaoWhereInput): Promise<RevisaoVarrida[]> {
  const linhas = await db.documentoRevisao.findMany({
    where: {
      AND: [
        {
          documento: { substituidoPorId: null },
          OR: [
            { estado: { in: ["publicado", "compartilhado"] } },
            { controles: { some: { removidoEm: null, tipo: { in: ["liberado_obra", "enviado_cliente"] } } } },
            { estado: "arquivado", uploads: { some: { excluidoEm: { not: null } } } },
          ],
        },
        ...(extra ? [extra] : []),
      ],
    },
    select: {
      id: true,
      documentoId: true,
      numero: true,
      estado: true,
      estadoEm: true,
      documento: { select: { nomeArquivo: true, titulo: true, disciplina: { select: { projetoId: true } } } },
      controles: { where: { removidoEm: null, tipo: { in: ["liberado_obra", "enviado_cliente"] } }, select: { id: true, tipo: true } },
      _count: { select: { uploads: { where: { excluidoEm: { not: null } } } } },
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    documentoId: l.documentoId,
    projetoId: l.documento.disciplina.projetoId,
    documentoNome: l.documento.titulo ?? l.documento.nomeArquivo,
    numero: l.numero,
    estado: l.estado as EstadoRevisao,
    estadoEm: l.estadoEm,
    controlesDePasta: l.controles,
    qtdNaLixeira: l._count.uploads,
  }));
}

export async function violacoesDoCiclo(db: Db, agora: Date, extra?: Prisma.DocumentoRevisaoWhereInput): Promise<Violacao[]> {
  const revisoes = await carregarRevisoesVarridas(db, extra);
  const configs = await db.configDocumentosProjeto.findMany({ select: { projetoId: true, diasAlertaCompartilhado: true } });
  const dias = new Map(configs.map((c) => [c.projetoId, c.diasAlertaCompartilhado]));
  return encontrarViolacoes(revisoes, { agora, diasAlertaPorProjeto: (p) => dias.get(p) ?? 7 });
}

export async function dispensasAtivas(db: Db): Promise<DispensaAtiva[]> {
  const linhas = await db.dispensaPendenciaCiclo.findMany({ where: { desfeitaEm: null } });
  return linhas.map((l) => ({
    id: l.id,
    alvoId: l.alvoId,
    tipo: l.tipo as TipoPendencia,
    chave: l.chave,
    motivo: l.motivo,
    criadaPorId: l.criadaPorId,
    criadaEm: l.criadaEm,
  }));
}

/** Violações + dispensas ativas → abertas e dispensadas. É o que o job avisa e a tela lista. */
export async function pendenciasAbertasDoCiclo(
  db: Db,
  agora: Date,
  extra?: Prisma.DocumentoRevisaoWhereInput,
): Promise<{ violacoes: Violacao[]; dispensas: DispensaAtiva[]; abertas: ItemPendencia[]; dispensadas: ItemPendencia[] }> {
  const violacoes = await violacoesDoCiclo(db, agora, extra);
  const dispensas = await dispensasAtivas(db);
  return { violacoes, dispensas, ...aplicarDispensas(violacoes, dispensas) };
}
