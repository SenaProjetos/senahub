import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { avisarSeDisciplinaEntregue, recalcularStatusDisciplina, travarDisciplina } from "./status-pelas-fases-service";
import { MOTIVO_NAO_RESPONSAVEL, STATUS_AO_DESFAZER, motivoParaDesfazerEnvio, motivoParaEnviar } from "./envio-etapa";

/**
 * "Enviei os documentos desta etapa para análise" — o lado com I/O de `envio-etapa.ts`.
 *
 * Escrita condicionada ao status lido (`updateMany`): dois cliques, ou a coordenação aprovando no
 * mesmo instante, não passam um por cima do outro. Avisa a coordenação do projeto (`ProjetoMembro`
 * com papel de coordenador) e os responsáveis da disciplina, categoria `aprovacao_disciplina`.
 * `notificar` entra como parâmetro para o smoke rodar sem disparar notificação.
 */
const MOTIVO_MUDOU = "A etapa mudou enquanto você olhava. Recarregue a página e tente de novo.";

async function lerEtapa(etapaId: string) {
  const e = await prisma.disciplinaEtapa.findUnique({
    where: { id: etapaId },
    select: {
      id: true,
      status: true,
      disciplinaId: true,
      etapa: { select: { nome: true } },
      disciplina: {
        select: {
          disciplinaTextoLegado: true,
          projetoId: true,
          projeto: { select: { codigo: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!e) throw new ActionError("Etapa não encontrada.");
  return e;
}

async function destinatarios(projetoId: string, responsaveis: readonly string[], autorId: string) {
  const coord = await prisma.projetoMembro.findMany({
    where: { projetoId, papel: { contains: "coord", mode: "insensitive" } },
    select: { userId: true },
  });
  // Quem enviou (ou desfez) não é avisado do que ele mesmo fez.
  return [...new Set([...responsaveis, ...coord.map((c) => c.userId)])].filter((id) => id !== autorId);
}

type Opcoes = { etapaId: string; userId: string; notificar?: typeof notificarMuitos };

export async function enviarEtapaParaAnalise({ etapaId, userId, notificar = notificarMuitos }: Opcoes) {
  const e = await lerEtapa(etapaId);
  const responsaveis = e.disciplina.responsaveis.map((r) => r.userId);
  if (!responsaveis.includes(userId)) throw new ActionError(MOTIVO_NAO_RESPONSAVEL);
  const motivo = motivoParaEnviar(e.status);
  if (motivo) throw new ActionError(motivo);

  // A fase e o status da disciplina (que vem das fases, spec 2026-11-13) confirmam juntos.
  const recalculo = await prisma.$transaction(async (tx) => {
    await travarDisciplina(tx, e.disciplinaId);
    const r = await tx.disciplinaEtapa.updateMany({
      where: { id: etapaId, status: e.status },
      data: { status: "entregue", entregueEm: new Date() },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    return recalcularStatusDisciplina(tx, e.disciplinaId, { autorId: userId, motivo: `fase ${e.etapa.nome} enviada para análise` });
  });
  await avisarSeDisciplinaEntregue(recalculo, e.disciplinaId, { autorId: userId, notificar });

  const nome = `${e.disciplina.disciplinaTextoLegado} · ${e.etapa.nome}`;
  await notificar(
    await destinatarios(e.disciplina.projetoId, responsaveis, userId),
    {
      titulo: `Etapa enviada para análise: ${nome}`,
      corpo: `${formatarCodigo(e.disciplina.projeto.codigo)} — o projetista sinalizou que enviou todos os documentos desta etapa.`,
      href: `/projetos/${e.disciplina.projetoId}`,
      tag: `etapa-enviada-${etapaId}`,
    },
    { categoria: "aprovacao_disciplina" },
  );
  return { projetoId: e.disciplina.projetoId, statusAnterior: e.status };
}

export async function desfazerEnvioEtapa({ etapaId, userId, notificar = notificarMuitos }: Opcoes) {
  const e = await lerEtapa(etapaId);
  const responsaveis = e.disciplina.responsaveis.map((r) => r.userId);
  if (!responsaveis.includes(userId)) throw new ActionError(MOTIVO_NAO_RESPONSAVEL);
  const motivo = motivoParaDesfazerEnvio(e.status);
  if (motivo) throw new ActionError(motivo);

  await prisma.$transaction(async (tx) => {
    await travarDisciplina(tx, e.disciplinaId);
    const r = await tx.disciplinaEtapa.updateMany({
      where: { id: etapaId, status: "entregue" },
      data: { status: STATUS_AO_DESFAZER, entregueEm: null },
    });
    if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);
    await recalcularStatusDisciplina(tx, e.disciplinaId, { autorId: userId, motivo: `envio da fase ${e.etapa.nome} desfeito` });
  });

  const nome = `${e.disciplina.disciplinaTextoLegado} · ${e.etapa.nome}`;
  await notificar(
    await destinatarios(e.disciplina.projetoId, responsaveis, userId),
    {
      titulo: `Envio desfeito: ${nome}`,
      corpo: `${formatarCodigo(e.disciplina.projeto.codigo)} — o projetista desfez o envio desta etapa para análise.`,
      href: `/projetos/${e.disciplina.projetoId}`,
      tag: `etapa-enviada-${etapaId}`,
    },
    { categoria: "aprovacao_disciplina" },
  );
  return { projetoId: e.disciplina.projetoId };
}
