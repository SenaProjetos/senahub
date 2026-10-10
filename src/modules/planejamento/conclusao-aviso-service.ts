import "server-only";

import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { destinatariosDaConclusao, textoConclusao } from "./conclusao-aviso";

/**
 * Avisa quem valida quando o responsável conclui o card de uma atividade da EAP — o lado com I/O de
 * `conclusao-aviso.ts`. Só vale para card nascido da EAP (`eapTarefaId`) cuja linha ainda não está em
 * 100% (se o gestor já validou, não há o que avisar). Chamado SÓ na transição para "concluído": quem
 * reabre e conclui de novo avisa de novo, de propósito — é outra entrega.
 *
 * Falhar o aviso nunca desfaz a conclusão: a pessoa terminou o trabalho, e o verde na EAP segue valendo.
 * `notificar` entra como parâmetro para o smoke rodar sem disparar notificação.
 */
export async function avisarCardConcluido(
  p: { tarefaId: string; autorId: string; autorNome: string },
  notificar: typeof notificarMuitos = notificarMuitos,
): Promise<{ avisados: number }> {
  try {
    const card = await prisma.tarefa.findUnique({
      where: { id: p.tarefaId },
      select: { titulo: true, eapTarefaId: true, projetoId: true, projeto: { select: { codigo: true } } },
    });
    if (!card?.eapTarefaId || !card.projetoId || !card.projeto) return { avisados: 0 };
    const linha = await prisma.eapTarefa.findUnique({ where: { id: card.eapTarefaId }, select: { progresso: true } });
    if (!linha || linha.progresso >= 100) return { avisados: 0 };

    const [coord, gestores] = await Promise.all([
      prisma.projetoMembro.findMany({
        where: { projetoId: card.projetoId, papel: { contains: "coord", mode: "insensitive" } },
        select: { userId: true },
      }),
      prisma.user.findMany({ where: { ativo: true, role: { in: ["admin", "supervisor"] } }, select: { id: true } }),
    ]);
    const destino = destinatariosDaConclusao({
      coordenadores: coord.map((c) => c.userId),
      gestores: gestores.map((g) => g.id),
      autorId: p.autorId,
    });
    if (destino.length === 0) return { avisados: 0 };

    const texto = textoConclusao({ atividade: card.titulo, autorNome: p.autorNome, projetoCodigo: formatarCodigo(card.projeto.codigo) });
    await notificar(
      destino,
      { ...texto, href: `/planejamento/${card.projetoId}`, tag: `atividade-concluida-${p.tarefaId}` },
      { categoria: "atividade_concluida" },
    );
    return { avisados: destino.length };
  } catch (e) {
    console.error("[tarefas] aviso de atividade concluída falhou:", e);
    return { avisados: 0 };
  }
}
