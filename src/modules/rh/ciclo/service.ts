import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import type { Prisma } from "@/generated/prisma/client";
import { diaDeSaoPaulo } from "@/lib/data";
import {
  ancoraDoCiclo,
  MOTIVO_CICLO_ABERTO,
  motivoParaNaoAbrir,
  motivoParaNaoMarcar,
  prazoDoItem,
  statusAposItens,
  type TipoCiclo,
} from "./regras";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dia = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

/**
 * Abre um ciclo de entrada ou de saída a partir de uma lista-modelo. Os itens copiam
 * responsável, prazo (já resolvido em data a partir da âncora) e a marca de patrimônio — mudar a
 * lista-modelo depois não mexe nos ciclos abertos.
 *
 * Corrida entre dois cliques: o índice parcial `onboarding_processo_um_aberto` recusa o segundo
 * (P2002), e a mensagem é a mesma da checagem prévia.
 */
export async function abrirCicloNoBanco(dados: { userId: string; tipo: TipoCiclo; templateId: string }) {
  const [pessoa, modelo, existentes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dados.userId },
      select: { id: true, vinculoAtivo: { select: { id: true, dataInicio: true, dataFim: true } } },
    }),
    prisma.onboardingTemplate.findUnique({
      where: { id: dados.templateId },
      include: { itens: { orderBy: { ordem: "asc" } } },
    }),
    prisma.onboardingProcesso.findMany({ where: { userId: dados.userId }, select: { tipo: true, status: true } }),
  ]);
  if (!pessoa) throw new ActionError("Pessoa não encontrada.");
  if (!modelo) throw new ActionError("Lista-modelo não encontrada.");
  if (modelo.tipo !== dados.tipo) {
    throw new ActionError(dados.tipo === "saida" ? "Escolha uma lista de saída." : "Escolha uma lista de entrada.");
  }

  const vinculo = pessoa.vinculoAtivo
    ? { dataInicio: iso(pessoa.vinculoAtivo.dataInicio)!, dataFim: iso(pessoa.vinculoAtivo.dataFim) }
    : null;
  const motivo = motivoParaNaoAbrir(dados.tipo, existentes, vinculo?.dataFim);
  if (motivo) throw new ActionError(motivo);

  const ancora = ancoraDoCiclo(dados.tipo, vinculo, diaDeSaoPaulo());
  try {
    return await prisma.onboardingProcesso.create({
      data: {
        userId: dados.userId,
        templateId: modelo.id,
        tipo: dados.tipo,
        ancora: dia(ancora),
        vinculoId: pessoa.vinculoAtivo?.id ?? null,
        itens: {
          create: modelo.itens.map((it) => ({
            descricao: it.descricao,
            ordem: it.ordem,
            responsavel: it.responsavel,
            prazoEm: dia(prazoDoItem(ancora, it.prazoDias)),
            patrimonio: it.patrimonio,
          })),
        },
      },
      select: { id: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ActionError(MOTIVO_CICLO_ABERTO[dados.tipo]);
    throw e;
  }
}

/**
 * Marca ou desmarca um item e recalcula o status do ciclo (todos marcados = concluído; desmarcar
 * reabre). Quem pode marcar o quê: `motivoParaNaoMarcar`.
 */
export async function marcarItemNoBanco(
  dados: { id: string; concluido: boolean; evidencia?: string | null },
  quem: { id: string; ehRh: boolean; ehTi: boolean },
) {
  const item = await prisma.onboardingItem.findUnique({
    where: { id: dados.id },
    select: { id: true, responsavel: true, processo: { select: { id: true, status: true, userId: true } } },
  });
  if (!item) throw new ActionError("Item não encontrado.");
  const motivo = motivoParaNaoMarcar(item, item.processo, quem);
  if (motivo) throw new ActionError(motivo);

  return prisma.$transaction(async (tx) => {
    await tx.onboardingItem.update({
      where: { id: item.id },
      data: {
        concluido: dados.concluido,
        concluidoEm: dados.concluido ? new Date() : null,
        concluidoPorId: dados.concluido ? quem.id : null,
        ...(dados.evidencia !== undefined ? { evidencia: dados.evidencia?.trim() || null } : {}),
      },
    });
    return recalcularStatus(tx, item.processo.id);
  });
}

async function recalcularStatus(tx: Prisma.TransactionClient, processoId: string) {
  const processo = await tx.onboardingProcesso.findUniqueOrThrow({
    where: { id: processoId },
    select: { status: true, itens: { select: { concluido: true } } },
  });
  const status = statusAposItens(processo.status, processo.itens);
  if (status !== processo.status) {
    await tx.onboardingProcesso.update({
      where: { id: processoId },
      data: { status, concluidoEm: status === "concluido" ? new Date() : null },
    });
  }
  return { processoId, status };
}

/** Cancela um ciclo em andamento. O histórico fica; nada é apagado. */
export async function cancelarCicloNoBanco(id: string) {
  const r = await prisma.onboardingProcesso.updateMany({
    where: { id, status: "em_andamento" },
    data: { status: "cancelado", concluidoEm: new Date() },
  });
  if (r.count !== 1) throw new ActionError("Só um ciclo em andamento pode ser cancelado.");
  return { id };
}
