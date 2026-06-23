import "server-only";
import { prisma } from "@/lib/prisma";

export type CompromissoResumo = {
  id: string;
  titulo: string;
  local: string | null;
  inicio: string;
  fim: string | null;
  /** null = pendente, true = confirmado, false = recusou (do próprio usuário) */
  confirmado: boolean | null;
};

/**
 * Compromissos de HOJE do usuário (como criador ou participante), em ordem cronológica.
 * Usado pelo resumo da agenda no relógio do header.
 */
export async function resumoAgendaHoje(userId: string): Promise<CompromissoResumo[]> {
  const agora = new Date();
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimDia = new Date(inicioDia);
  fimDia.setDate(fimDia.getDate() + 1);

  const compromissos = await prisma.compromisso.findMany({
    where: {
      inicio: { gte: inicioDia, lt: fimDia },
      OR: [{ criadorId: userId }, { participantes: { some: { userId } } }],
    },
    orderBy: { inicio: "asc" },
    select: {
      id: true,
      titulo: true,
      local: true,
      inicio: true,
      fim: true,
      participantes: { where: { userId }, select: { confirmado: true } },
    },
  });

  return compromissos.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    local: c.local,
    inicio: c.inicio.toISOString(),
    fim: c.fim?.toISOString() ?? null,
    confirmado: c.participantes[0]?.confirmado ?? null,
  }));
}
