import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
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

async function destinatarios(projetoId: string, responsaveis: readonly string[]) {
  const coord = await prisma.projetoMembro.findMany({
    where: { projetoId, papel: { contains: "coord", mode: "insensitive" } },
    select: { userId: true },
  });
  return [...new Set([...responsaveis, ...coord.map((c) => c.userId)])];
}

type Opcoes = { etapaId: string; userId: string; notificar?: typeof notificarMuitos };

export async function enviarEtapaParaAnalise({ etapaId, userId, notificar = notificarMuitos }: Opcoes) {
  const e = await lerEtapa(etapaId);
  const responsaveis = e.disciplina.responsaveis.map((r) => r.userId);
  if (!responsaveis.includes(userId)) throw new ActionError(MOTIVO_NAO_RESPONSAVEL);
  const motivo = motivoParaEnviar(e.status);
  if (motivo) throw new ActionError(motivo);

  const r = await prisma.disciplinaEtapa.updateMany({
    where: { id: etapaId, status: e.status },
    data: { status: "entregue", entregueEm: new Date() },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);

  const nome = `${e.disciplina.disciplinaTextoLegado} · ${e.etapa.nome}`;
  await notificar(
    await destinatarios(e.disciplina.projetoId, responsaveis),
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

  const r = await prisma.disciplinaEtapa.updateMany({
    where: { id: etapaId, status: "entregue" },
    data: { status: STATUS_AO_DESFAZER, entregueEm: null },
  });
  if (r.count !== 1) throw new ActionError(MOTIVO_MUDOU);

  const nome = `${e.disciplina.disciplinaTextoLegado} · ${e.etapa.nome}`;
  await notificar(
    await destinatarios(e.disciplina.projetoId, responsaveis),
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
