import "server-only";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { MOTIVO_CORRECAO_INTEGRIDADE } from "./integridade";
import { dispensasObsoletas, resumoDoAviso } from "./pendencias";
import { encerrarDispensasObsoletasNoBanco } from "./pendencias-service";
import { carregarRevisao, removerControleNoTx } from "./service";
import { pendenciasAbertasDoCiclo } from "./varredura";

export type ResultadoIntegridade = { violacoes: number; corrigidas: number; relatadas: number; encerradas: number };

/**
 * A7 — varredura diária (pg-boss). Corrige a violação de I5 pelo serviço do ciclo (com o evento
 * "Correção automática de integridade"), encerra as dispensas que já não casam com nenhuma pendência
 * (para uma ocorrência nova não herdar a dispensa velha) e avisa os administradores com um RESUMO das
 * pendências ABERTAS, com link para /arquivos/pendencias. As dispensadas não entram no aviso.
 */
export async function verificarIntegridadeCiclo(agora: Date = new Date()): Promise<ResultadoIntegridade> {
  const { violacoes, dispensas, abertas } = await pendenciasAbertasDoCiclo(prisma, agora);

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

  const encerradas = await encerrarDispensasObsoletasNoBanco(dispensasObsoletas(violacoes, dispensas).map((d) => d.id));

  const corpo = resumoDoAviso({ abertas, corrigidas });
  if (corpo) {
    const admins = await prisma.user.findMany({ where: whereAudiencia("global"), select: { id: true } });
    await notificarMuitos(
      admins.map((a) => a.id),
      { titulo: "Ciclo dos documentos: verificação diária", corpo, href: "/arquivos/pendencias" },
      { categoria: "ciclo_documental" },
    );
  }
  return { violacoes: violacoes.length, corrigidas, relatadas: abertas.length, encerradas };
}
