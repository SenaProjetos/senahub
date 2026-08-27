import "server-only";
import { prisma } from "@/lib/prisma";
import { verificarCadeia, type ResultadoVerificacao } from "./cadeia";

export type EventoTrilha = {
  id: string;
  sequencia: number;
  tipo: "visualizado" | "autenticado" | "assinado";
  ocorridoEm: string;
  atorNome: string;
  ip: string | null;
  userAgent: string | null;
  hash: string;
};

export type TrilhaAssinatura = {
  eventos: EventoTrilha[];
  verificacao: ResultadoVerificacao;
};

/**
 * Lê a trilha de assinatura de uma versão E confere a integridade da cadeia (Fase D).
 *
 * A verificação roda na LEITURA, não na escrita: adulteração acontece direto no banco, depois do
 * fato, então conferir no momento de gravar não provaria nada. É aqui que `verificarCadeia()`
 * ganha utilidade — quem abrir a trilha vê na hora se ela ainda fecha.
 */
export async function trilhaAssinatura(versaoId: string): Promise<TrilhaAssinatura> {
  const eventos = await prisma.eventoAssinatura.findMany({
    where: { versaoId },
    orderBy: { sequencia: "asc" },
  });

  return {
    verificacao: verificarCadeia(eventos),
    eventos: eventos.map((e) => ({
      id: e.id,
      sequencia: e.sequencia,
      tipo: e.tipo,
      ocorridoEm: e.ocorridoEm.toISOString(),
      atorNome: e.atorNome,
      ip: e.ip,
      userAgent: e.userAgent,
      hash: e.hash,
    })),
  };
}
