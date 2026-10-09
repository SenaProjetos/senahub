import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { encontrarViolacoes, MOTIVO_CORRECAO_INTEGRIDADE, type RevisaoVarrida } from "./integridade";
import { carregarRevisao, removerControleNoTx } from "./service";
import type { EstadoRevisao } from "./estados";

export type ResultadoIntegridade = { verificadas: number; corrigidas: number; relatadas: number };

/**
 * A7 — varredura diária (pg-boss). Lê só o que importa (revisões vivas, controles de pasta ativos,
 * em análise), corrige a violação de I5 pelo serviço do ciclo (com o evento "Correção automática de
 * integridade") e relata o resto aos administradores numa notificação só.
 */
export async function verificarIntegridadeCiclo(agora: Date = new Date()): Promise<ResultadoIntegridade> {
  const linhas = await prisma.documentoRevisao.findMany({
    where: {
      documento: { substituidoPorId: null },
      OR: [
        { estado: { in: ["publicado", "compartilhado"] } },
        { controles: { some: { removidoEm: null, tipo: { in: ["liberado_obra", "enviado_cliente"] } } } },
        { estado: "arquivado", uploads: { some: { excluidoEm: { not: null } } } },
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
      uploads: { where: { excluidoEm: { not: null } }, select: { id: true }, take: 1 },
    },
  });
  const revisoes: RevisaoVarrida[] = linhas.map((l) => ({
    id: l.id,
    documentoId: l.documentoId,
    projetoId: l.documento.disciplina.projetoId,
    documentoNome: l.documento.titulo ?? l.documento.nomeArquivo,
    numero: l.numero,
    estado: l.estado as EstadoRevisao,
    estadoEm: l.estadoEm,
    controlesDePasta: l.controles,
    arquivoNaLixeira: l.uploads.length > 0,
  }));

  const configs = await prisma.configDocumentosProjeto.findMany({ select: { projetoId: true, diasAlertaCompartilhado: true } });
  const dias = new Map(configs.map((c) => [c.projetoId, c.diasAlertaCompartilhado]));
  const violacoes = encontrarViolacoes(revisoes, { agora, diasAlertaPorProjeto: (p) => dias.get(p) ?? 7 });

  let corrigidas = 0;
  for (const v of violacoes) {
    if (v.tipo !== "controle_fora_de_publicada") continue;
    try {
      await prisma.$transaction(async (tx) => {
        const r = await carregarRevisao(tx, v.revisaoId);
        const c = r.controles.find((x) => x.id === v.controleId);
        if (!c) return; // alguém já resolveu entre a leitura e agora
        await removerControleNoTx(tx, r, c, { quem: null, motivo: MOTIVO_CORRECAO_INTEGRIDADE });
        corrigidas++;
      });
    } catch (err) {
      console.error(`[ciclo-integridade] não corrigiu ${v.controleId}:`, err);
    }
  }

  const relatar = violacoes.filter((v) => v.tipo !== "controle_fora_de_publicada");
  if (relatar.length > 0 || corrigidas > 0) {
    const admins = await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } });
    const linhasTexto = [
      ...(corrigidas > 0 ? [`${corrigidas} liberação(ões) indevida(s) revogada(s) automaticamente.`] : []),
      ...relatar.slice(0, 10).map((v) => v.texto),
      ...(relatar.length > 10 ? [`… e mais ${relatar.length - 10}.`] : []),
    ];
    await notificarMuitos(
      admins.map((a) => a.id),
      { titulo: "Ciclo dos documentos: verificação diária", corpo: linhasTexto.join(" "), href: "/arquivos" },
      { categoria: "ciclo_documental" },
    );
  }
  return { verificadas: revisoes.length, corrigidas, relatadas: relatar.length };
}
