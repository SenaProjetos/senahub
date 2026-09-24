"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { transicaoEtapaPermitida, validarPercentuais, type EtapaParaTela } from "./etapas";
import { sincronizarPrazoDisciplina } from "./etapas-service";
import { mensagemTransicaoDisciplina } from "./status";

/**
 * Etapas de disciplina (F4 — par disciplina × fase, D30/D37). Mesma permissão de quem
 * edita a disciplina: a etapa é um detalhe dela, não um recurso à parte.
 */
const base = {
  modulo: "projetos",
  recurso: "projetos",
  permissao: "gerir",
  entidade: "DisciplinaEtapa",
} as const;

const statusEtapa = z.enum(["aguardando", "em_andamento", "em_revisao", "entregue", "aprovado"]);

const salvarSchema = z.object({
  disciplinaId: z.string().min(1),
  etapaId: z.string().min(1),
  /** `YYYY-MM-DD`. Vazio/nulo = etapa ainda sem prazo, que é estado normal. */
  prazo: z.string().nullable().optional(),
  percentual: z.number().finite().min(0, "O percentual não pode ser negativo.").max(100, "O percentual não passa de 100%."),
  status: statusEtapa.optional(),
  ordem: z.number().int().optional(),
});

/** Resumo que a tela mostra depois de salvar: o prazo que a disciplina ficou e se o rateio fecha. */
type ResultadoEtapa = {
  id: string;
  prazoDisciplina: string | null;
  percentuais: { ok: boolean; soma: number; mensagem?: string };
};

async function resumoPercentuais(disciplinaId: string) {
  const etapas = await prisma.disciplinaEtapa.findMany({
    where: { disciplinaId },
    select: { percentual: true },
  });
  const r = validarPercentuais(etapas.map((e) => ({ percentual: Number(e.percentual) })));
  return r.ok ? { ok: true, soma: r.soma } : { ok: false, soma: r.soma, mensagem: r.mensagem };
}

/**
 * Cria ou atualiza a etapa de uma disciplina (a fase é a chave: uma disciplina não tem dois
 * "Projeto Básico"). Recalcula o prazo da disciplina na mesma transação.
 *
 * Soma de percentuais diferente de 100 NÃO é recusada aqui — o editor salva rascunho que
 * ainda não fecha (igual `PropostaParcela`). Ela volta no resultado para a tela avisar, e a
 * F7, que é quem reparte dinheiro, recusa de verdade.
 */
export const salvarEtapaDisciplina = defineAction(
  {
    ...base,
    acao: "salvar-etapa-disciplina",
    schema: salvarSchema,
    capturarAntes: (input) =>
      prisma.disciplinaEtapa.findUnique({
        where: { disciplinaId_etapaId: { disciplinaId: input.disciplinaId, etapaId: input.etapaId } },
        select: { prazo: true, percentual: true, status: true },
      }),
  },
  async (input): Promise<ResultadoEtapa> => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: { projetoId: true, projeto: { select: { prazoPlanejado: true } } },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    // A fase tem de ser do catálogo de fase de verdade, global ou deste projeto. Sem isso um
    // id forjado de "folha" ou de outro projeto viraria etapa (mesmo papel de `disciplinasValidas`).
    const fase = await prisma.pranchaCatalogo.findFirst({
      where: {
        id: input.etapaId,
        categoria: "fase",
        OR: [{ projetoId: null }, { projetoId: disciplina.projetoId }],
      },
      select: { id: true, ativo: true, nome: true },
    });
    if (!fase) throw new ActionError("Fase não encontrada no catálogo.");

    // P-08 na ETAPA: se só o formulário da disciplina checasse, uma etapa levaria o prazo
    // consolidado além do planejado por um caminho que nunca passa pela regra.
    if (input.prazo && disciplina.projeto.prazoPlanejado) {
      if (new Date(`${input.prazo}T00:00:00.000Z`) > disciplina.projeto.prazoPlanejado) {
        throw new ActionError("O prazo da etapa não pode ultrapassar o prazo planejado do projeto.");
      }
    }

    const existente = await prisma.disciplinaEtapa.findUnique({
      where: { disciplinaId_etapaId: { disciplinaId: input.disciplinaId, etapaId: input.etapaId } },
      select: { id: true, status: true },
    });
    if (!existente && !fase.ativo) {
      throw new ActionError(`A fase "${fase.nome}" está inativa — não pode receber etapa nova.`);
    }
    if (existente && input.status && !transicaoEtapaPermitida(existente.status, input.status)) {
      throw new ActionError(
        input.status === "aprovado"
          ? "Etapa não é aprovada por aqui: a aprovação vem da validação da disciplina."
          : mensagemTransicaoDisciplina(existente.status, input.status),
      );
    }

    const prazo = input.prazo ? new Date(`${input.prazo}T00:00:00.000Z`) : null;
    const { etapa, prazoDisciplina } = await prisma.$transaction(async (tx) => {
      const ordem =
        input.ordem ??
        (existente
          ? undefined
          : ((await tx.disciplinaEtapa.aggregate({
              where: { disciplinaId: input.disciplinaId },
              _max: { ordem: true },
            }))._max.ordem ?? -1) + 1);
      const etapa = await tx.disciplinaEtapa.upsert({
        where: { disciplinaId_etapaId: { disciplinaId: input.disciplinaId, etapaId: input.etapaId } },
        create: {
          disciplinaId: input.disciplinaId,
          etapaId: input.etapaId,
          prazo,
          percentual: input.percentual,
          status: input.status ?? "aguardando",
          ordem: ordem ?? 0,
        },
        update: {
          prazo,
          percentual: input.percentual,
          ...(input.status ? { status: input.status } : {}),
          ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
        },
        select: { id: true },
      });
      return { etapa, prazoDisciplina: await sincronizarPrazoDisciplina(tx, input.disciplinaId) };
    });

    revalidatePath(`/projetos/${disciplina.projetoId}`);
    revalidatePath(`/planejamento/${disciplina.projetoId}`);
    return { id: etapa.id, prazoDisciplina, percentuais: await resumoPercentuais(input.disciplinaId) };
  },
);

/**
 * Remove a etapa e reconsolida. Remover a ÚLTIMA etapa devolve a disciplina ao comportamento
 * de sempre: o prazo dela fica como estava (a consolidação sem etapa mantém o atual), e daí
 * em diante volta a ser editado direto.
 */
export const excluirEtapaDisciplina = defineAction(
  {
    ...base,
    acao: "excluir-etapa-disciplina",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: (input) =>
      prisma.disciplinaEtapa.findUnique({
        where: { id: input.id },
        select: { disciplinaId: true, etapaId: true, prazo: true, percentual: true, status: true },
      }),
  },
  async (input): Promise<ResultadoEtapa> => {
    const etapa = await prisma.disciplinaEtapa.findUnique({
      where: { id: input.id },
      select: { disciplinaId: true, disciplina: { select: { projetoId: true } } },
    });
    if (!etapa) throw new ActionError("Etapa não encontrada.");

    const prazoDisciplina = await prisma.$transaction(async (tx) => {
      await tx.disciplinaEtapa.delete({ where: { id: input.id } });
      return sincronizarPrazoDisciplina(tx, etapa.disciplinaId);
    });

    revalidatePath(`/projetos/${etapa.disciplina.projetoId}`);
    revalidatePath(`/planejamento/${etapa.disciplina.projetoId}`);
    return { id: input.id, prazoDisciplina, percentuais: await resumoPercentuais(etapa.disciplinaId) };
  },
);

/**
 * Dados do editor de etapas, carregados quando o diálogo abre — em vez de viajarem pela
 * página → lista → card de toda disciplina do projeto a cada render. Leitura: sem auditoria,
 * como `carregarDocumentosPorIds`.
 */
export const carregarEtapasDisciplina = defineAction(
  {
    ...base,
    acao: "ver-etapas-disciplina",
    schema: z.object({ disciplinaId: z.string().min(1) }),
    audit: false,
  },
  async (input) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      select: {
        projetoId: true,
        prazo: true,
        projeto: { select: { prazoPlanejado: true } },
        etapas: {
          orderBy: [{ ordem: "asc" }, { id: "asc" }],
          select: {
            id: true,
            etapaId: true,
            prazo: true,
            status: true,
            percentual: true,
            ordem: true,
            etapa: { select: { sigla: true, nome: true } },
          },
        },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    const fases = await prisma.pranchaCatalogo.findMany({
      where: { categoria: "fase", ativo: true, OR: [{ projetoId: null }, { projetoId: disciplina.projetoId }] },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, sigla: true, nome: true },
    });

    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const etapas: EtapaParaTela[] = disciplina.etapas.map((e) => ({
      id: e.id,
      etapaId: e.etapaId,
      sigla: e.etapa.sigla,
      nome: e.etapa.nome,
      prazo: dia(e.prazo),
      status: e.status,
      percentual: Number(e.percentual),
      ordem: e.ordem,
    }));
    return {
      etapas,
      fases,
      prazoDisciplina: dia(disciplina.prazo),
      prazoPlanejado: dia(disciplina.projeto.prazoPlanejado),
    };
  },
);
