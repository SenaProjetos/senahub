import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { carregarEntradaDaAgenda } from "./queries";
import { decidirConferencia } from "./itens-resumo";
import { marcosDaAgenda } from "./marcos";

const dataDoBanco = (d: string) => new Date(`${d}T00:00:00.000Z`);
const diaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Conferência diária da previsão dos marcos (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md,
 * "Previsão alterada"): primeiro passo da rodada do resumo diário. Compara a previsão de hoje com a última que foi vista
 * (`MarcoAgendaPortal.previsaoVista`) e, se mudou, guarda de → para e marca `ontem` como o dia da alteração (o resumo avalia
 * dias até ontem, então o aviso sai na mesma manhã). A regra é `decidirConferencia`; aqui só ficam as leituras e as escritas.
 *
 * Só a diferença líquida entre duas rodadas vira aviso. Falha em um marco é logada e a conferência segue para os outros.
 */
export async function conferirPrevisoes(projetoId: string, ontem: string): Promise<{ gravadas: number; alteradas: number }> {
  const r = { gravadas: 0, alteradas: 0 };
  const entrada = await carregarEntradaDaAgenda(projetoId);
  if (!entrada) return r;
  const marcos = marcosDaAgenda(entrada);
  if (marcos.length === 0) return r;
  const emRevisao = entrada.cronograma?.emRevisao ?? false;

  const linhas = await prisma.marcoAgendaPortal.findMany({
    where: { marcoId: { in: marcos.map((m) => m.marcoId) } },
    select: { marcoId: true, previsaoVista: true },
  });
  const vistaDoMarco = new Map(linhas.map((l) => [l.marcoId, diaIso(l.previsaoVista)]));

  for (const m of marcos) {
    try {
      const vista = vistaDoMarco.get(m.marcoId) ?? null;
      const d = decidirConferencia({ vista, atual: m.previsao, concluido: m.situacao === "entregue", emRevisao });
      if (d.acao === "gravar_vista") {
        // Só preenche o que está vazio: outra rodada que já gravou (ou já avisou uma mudança) não é sobrescrita.
        const preencheu = await prisma.marcoAgendaPortal.updateMany({ where: { marcoId: m.marcoId, previsaoVista: null }, data: { previsaoVista: dataDoBanco(m.previsao) } });
        if (preencheu.count === 1) r.gravadas += 1;
        else {
          try {
            await prisma.marcoAgendaPortal.create({ data: { projetoId, marcoId: m.marcoId, previsaoVista: dataDoBanco(m.previsao) } });
            r.gravadas += 1;
          } catch (e) {
            // Linha já existe com o valor visto (outra rodada ao mesmo tempo): nada a fazer.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
          }
        }
      } else if (d.acao === "alterou") {
        // Condicionado ao valor lido: outra rodada ao mesmo tempo não grava duas vezes.
        const gravou = await prisma.marcoAgendaPortal.updateMany({
          where: { marcoId: m.marcoId, previsaoVista: dataDoBanco(d.anterior) },
          data: { previsaoAnterior: dataDoBanco(d.anterior), previsaoVista: dataDoBanco(m.previsao), previsaoAlteradaEm: dataDoBanco(ontem) },
        });
        if (gravou.count === 1) r.alteradas += 1;
      }
    } catch (e) {
      console.error(`[agenda] conferência do marco ${m.marcoId} falhou:`, e);
    }
  }
  return r;
}
