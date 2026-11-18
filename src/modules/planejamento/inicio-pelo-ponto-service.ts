import "server-only";
import { prisma } from "@/lib/prisma";
import { diaDeSaoPaulo } from "@/lib/data";
import { diaLocal } from "@/modules/ponto/engine";
import { paraDataUtc } from "./agenda";
import { inicioPeloPonto } from "./inicio-pelo-ponto";

/**
 * Grava o início real das linhas da EAP ligadas aos cards dados, pela PRIMEIRA hora apontada no ponto em qualquer card da
 * linha (regra em `inicio-pelo-ponto.ts`). Devolve os projetos que mudaram — quem chama reagenda cada um (`aposMudarEap`
 * nas actions; o motor precisa ler o estado já gravado, fora desta transação).
 *
 * Pela primeira hora de TODAS, não pela sessão que acabou de abrir: se uma chamada anterior falhou (ou a hora veio de
 * antes desta regra existir), a próxima acerta o dia. Idempotente: linha com início real não é tocada, e a escrita é
 * condicionada ao estado lido — dois pontos ao mesmo tempo na mesma linha gravam uma vez só.
 *
 * Sem Next/HTTP: o script de carga (`scripts/inicio-real-pelo-ponto.ts`) usa o mesmo caminho.
 */
export async function preencherInicioPeloPonto(
  alvo: { cardIds: readonly string[] } | { linhaIds: readonly string[] },
  autorId: string | null,
  hoje: string = diaDeSaoPaulo(),
): Promise<string[]> {
  let linhaIds: string[];
  if ("cardIds" in alvo) {
    const ids = [...new Set(alvo.cardIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const cards = await prisma.tarefa.findMany({
      where: { id: { in: ids }, eapTarefaId: { not: null } },
      select: { eapTarefaId: true },
    });
    linhaIds = cards.map((c) => c.eapTarefaId).filter((id): id is string => id != null);
  } else {
    linhaIds = [...new Set(alvo.linhaIds)];
  }
  if (linhaIds.length === 0) return [];

  const linhas = await prisma.eapTarefa.findMany({
    where: { id: { in: linhaIds }, inicioReal: null, fimReal: null },
    select: { id: true, projetoId: true, tipoEap: true, status: true, progresso: true, _count: { select: { filhas: true } } },
  });

  const projetos = new Set<string>();
  for (const l of linhas) {
    const primeira = await prisma.sessaoTrabalho.findFirst({
      where: { tarefa: { eapTarefaId: l.id } },
      orderBy: { inicio: "asc" },
      select: { inicio: true },
    });
    if (!primeira) continue;
    const dia = diaLocal(primeira.inicio);
    const r = inicioPeloPonto(
      { tipoEap: l.tipoEap, ehResumo: l._count.filhas > 0, status: l.status, progresso: l.progresso, inicioReal: null, fimReal: null },
      dia,
      hoje,
    );
    if (!r) continue;
    const gravou = await prisma.$transaction(async (tx) => {
      const g = await tx.eapTarefa.updateMany({
        where: { id: l.id, inicioReal: null, fimReal: null, status: l.status },
        data: { inicioReal: paraDataUtc(r.inicioReal), status: r.status },
      });
      if (g.count !== 1) return false;
      // Dentro da transação: a trilha some junto se a escrita desfizer. Mesmo formato do "Atualizar tarefa"
      // (`fotoDaExecucao`), com a origem dita.
      await tx.auditLog.create({
        data: {
          userId: autorId,
          modulo: "planejamento",
          acao: "inicio-real-pelo-ponto",
          entidade: "EapTarefa",
          entidadeId: l.id,
          detalhe: {
            antes: { status: l.status, inicioReal: null },
            novo: { status: r.status, inicioReal: r.inicioReal, origem: "primeira hora apontada no ponto" },
          },
        },
      });
      return true;
    });
    if (gravou) projetos.add(l.projetoId);
  }
  return [...projetos];
}
