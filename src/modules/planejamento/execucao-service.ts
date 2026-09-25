import "server-only";
import type { StatusEap } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { paraDataUtc } from "./agenda";
import { aplicarExecucao } from "./execucao";

/** Fase ligada a um marco que acabou de ser concluído — o que a tela oferece aprovar (D31). */
export type FaseDoMarco = { id: string; sigla: string; nome: string; disciplina: string; aprovavel: boolean };

/**
 * Grava a execução de uma linha (F7.0) — regras em `execucao.ts` — e, se ela CONCLUIU agora um
 * marco ligado a uma fase da disciplina que ainda não foi liberada, devolve essa fase.
 *
 * Não libera pagamento nenhum: quem aprova a fase é `aprovarEtapaDisciplina`, com a permissão e a
 * confirmação dela. Separado da action para o smoke alcançar a regra sem sessão.
 */
export async function registrarExecucaoNaLinha(p: {
  id: string;
  inicioReal: string | null;
  fimReal: string | null;
  /** Dia local de hoje (`YYYY-MM-DD`) — real é o que já aconteceu. */
  hoje: string;
}): Promise<{ projetoId: string; nome: string; status: StatusEap; fase: FaseDoMarco | null }> {
  const linha = await prisma.eapTarefa.findUnique({
    where: { id: p.id },
    select: {
      nome: true,
      projetoId: true,
      tipoEap: true,
      status: true,
      progresso: true,
      disciplinaId: true,
      etapaId: true,
      _count: { select: { filhas: true } },
    },
  });
  if (!linha) throw new ActionError("Tarefa não encontrada.");

  const r = aplicarExecucao(
    { tipoEap: linha.tipoEap, ehResumo: linha._count.filhas > 0, status: linha.status, progresso: linha.progresso },
    { inicioReal: p.inicioReal, fimReal: p.fimReal },
    p.hoje,
  );
  if (!r.ok) throw new ActionError(r.motivo);

  await prisma.eapTarefa.update({
    where: { id: p.id },
    data: {
      inicioReal: r.inicioReal ? paraDataUtc(r.inicioReal) : null,
      fimReal: r.fimReal ? paraDataUtc(r.fimReal) : null,
      status: r.status,
      progresso: r.progresso,
    },
  });

  let fase: FaseDoMarco | null = null;
  if (r.concluiu && linha.tipoEap === "mrc" && linha.disciplinaId && linha.etapaId) {
    const de = await prisma.disciplinaEtapa.findUnique({
      where: { disciplinaId_etapaId: { disciplinaId: linha.disciplinaId, etapaId: linha.etapaId } },
      select: {
        id: true,
        status: true,
        liberadaEm: true,
        etapa: { select: { sigla: true, nome: true } },
        disciplina: { select: { disciplinaTextoLegado: true } },
      },
    });
    if (de && !de.liberadaEm && de.status !== "aprovado") {
      fase = {
        id: de.id,
        sigla: de.etapa.sigla,
        nome: de.etapa.nome,
        disciplina: de.disciplina.disciplinaTextoLegado,
        // Mesma regra de `aprovarEtapaDisciplina`: só fase entregue se aprova.
        aprovavel: de.status === "entregue" || de.status === "em_revisao",
      };
    }
  }
  return { projetoId: linha.projetoId, nome: linha.nome, status: r.status, fase };
}
