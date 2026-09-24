"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { prazoEtapaValido, transicaoEtapaPermitida, validarPercentuais, type EtapaParaTela } from "./etapas";
import { sincronizarPrazoDisciplina } from "./etapas-service";
import { can, podeVerFinanceiro } from "@/lib/permissions";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { liberarPagamentosDaFase } from "@/modules/uploads/pagamento";
import { bloqueioValorDisciplina, ehPagavel } from "@/modules/uploads/rateio";
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
  prazo: z
    .string()
    .nullable()
    .optional()
    .refine((p) => !p || prazoEtapaValido(p), "Data do prazo inválida."),
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
      select: { id: true, status: true, liberadaEm: true, percentual: true },
    });
    if (!existente && !fase.ativo) {
      throw new ActionError(`A fase "${fase.nome}" está inativa — não pode receber etapa nova.`);
    }
    // F7.4: o pool da fase foi congelado na liberação. Mudar o percentual depois não mudaria o
    // pagamento — só faria a tela mentir sobre de onde ele veio.
    if (existente?.liberadaEm && Math.round(Number(existente.percentual) * 100) !== Math.round(input.percentual * 100)) {
      throw new ActionError("O pagamento desta fase já foi liberado — o percentual dela está fixado.");
    }
    if (existente && input.status && !transicaoEtapaPermitida(existente.status, input.status)) {
      throw new ActionError(
        input.status === "aprovado"
          ? "Etapa não é aprovada por aqui: use \"Aprovar fase\" (quem aprova disciplinas) ou a aprovação da disciplina."
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
      select: { disciplinaId: true, liberadaEm: true, disciplina: { select: { projetoId: true } } },
    });
    if (!etapa) throw new ActionError("Etapa não encontrada.");
    // F7.4: fase com pagamento liberado é história de dinheiro — o banco também recusa (FK).
    if (etapa.liberadaEm) {
      throw new ActionError("Esta fase já teve o pagamento liberado — não pode ser removida.");
    }

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
  async (input, { user }) => {
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
            liberadaEm: true,
            valorPagamento: true,
            etapa: { select: { sigla: true, nome: true } },
          },
        },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");
    const [verValor, podeAprovarFase] = await Promise.all([
      podeVerFinanceiro(user),
      can(user, "aprovacoes", "disciplina"),
    ]);

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
      liberada: e.liberadaEm != null,
      valorPagamento: verValor && e.valorPagamento != null ? Number(e.valorPagamento) : null,
    }));
    return {
      etapas,
      fases,
      prazoDisciplina: dia(disciplina.prazo),
      prazoPlanejado: dia(disciplina.projeto.prazoPlanejado),
      /** Quem aprova disciplina aprova fase — a tela só mostra o botão para quem pode. */
      podeAprovarFase,
    };
  },
);

/**
 * Aprova UMA fase e libera o pagamento dela (F7.4 — D31): "Básico de Fundação entregue → libera
 * o pagamento da etapa Básica". Mesma permissão de quem aprova a disciplina inteira
 * (`aprovacoes:disciplina`) — é o mesmo ato, só que por fase.
 *
 * Aprovar e pagar continuam atos distintos (Q15): esta action não recebe nem devolve valor. O
 * pool da fase sai da regra (`poolsDasFasesPendentes`), e quem quiser mudá-lo ajusta o valor da
 * disciplina ANTES (com permissão de financeiro) ou o pagamento na Produção depois.
 *
 * Disciplina 100% CLT: a fase é aprovada sem pagamento e sem congelar pool — não há o que
 * repartir, e percentual que não fecha não pode travar uma aprovação que não mexe em dinheiro.
 */
export const aprovarEtapaDisciplina = defineAction(
  {
    modulo: "projetos",
    acao: "aprovar-etapa-disciplina",
    recurso: "aprovacoes",
    permissao: "disciplina",
    entidade: "DisciplinaEtapa",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: (input) =>
      prisma.disciplinaEtapa.findUnique({
        where: { id: input.id },
        select: { status: true, liberadaEm: true, percentual: true },
      }),
  },
  async (input, { user }) => {
    const etapa = await prisma.disciplinaEtapa.findUnique({
      where: { id: input.id },
      select: { id: true, status: true, liberadaEm: true, disciplinaId: true, etapa: { select: { sigla: true } } },
    });
    if (!etapa) throw new ActionError("Fase não encontrada.");
    if (etapa.liberadaEm || etapa.status === "aprovado") {
      throw new ActionError("Esta fase já foi aprovada.");
    }
    if (etapa.status !== "entregue" && etapa.status !== "em_revisao") {
      throw new ActionError("A fase precisa estar entregue para ser aprovada.");
    }

    const disciplina = await prisma.disciplina.findUnique({
      where: { id: etapa.disciplinaId },
      select: {
        id: true,
        disciplinaTextoLegado: true,
        valor: true,
        responsaveis: { select: { userId: true, user: { select: { id: true, name: true, role: true } } } },
        projeto: { select: { id: true, codigo: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    const temPagavel = disciplina.responsaveis.some(ehPagavel);
    const agora = new Date();
    let pagaveis: { userId: string }[] = [];
    if (temPagavel) {
      const bloqueio = bloqueioValorDisciplina(
        disciplina.responsaveis,
        disciplina.valor == null ? null : Number(disciplina.valor),
      );
      if (bloqueio) throw new ActionError(bloqueio);
      const r = await prisma.$transaction((tx) =>
        liberarPagamentosDaFase(tx, { disciplina, faseId: etapa.id, autorId: user.id, agora }),
      );
      pagaveis = r.pagaveis;
    } else {
      const marcada = await prisma.disciplinaEtapa.updateMany({
        where: { id: etapa.id, liberadaEm: null, status: { in: ["entregue", "em_revisao"] } },
        data: { status: "aprovado", entregueEm: agora },
      });
      if (marcada.count === 0) throw new ActionError("A fase mudou enquanto a tela estava aberta — atualize e tente de novo.");
    }

    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const href = `/projetos/${disciplina.projeto.id}`;
    if (pagaveis.length > 0) {
      await notificarMuitos(
        pagaveis.map((p) => p.userId),
        {
          titulo: "Pagamento liberado",
          corpo: `Fase ${etapa.etapa.sigla} de ${disciplina.disciplinaTextoLegado} (${codigo}) aprovada. Pagamento liberado.`,
          href,
          // Por FASE: com a tag da disciplina, o aviso do Executivo substituiria o do Básico.
          tag: `pagto-fase-${etapa.id}`,
        },
        { categoria: "pagamento" },
      );
    }
    const gestores = await prisma.user.findMany({
      where: { ...whereAudiencia("gestao_operacional"), id: { not: user.id } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Fase aprovada",
        corpo:
          pagaveis.length > 0
            ? `Fase ${etapa.etapa.sigla} de ${disciplina.disciplinaTextoLegado} (${codigo}) aprovada — pagamento de projetista criado.`
            : `Fase ${etapa.etapa.sigla} de ${disciplina.disciplinaTextoLegado} (${codigo}) aprovada — sem pagamento.`,
        href,
        tag: `aprovacao-fase-${etapa.id}`,
      },
      { categoria: "aprovacao_disciplina" },
    );

    revalidatePath(href);
    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/contas-a-pagar");
    return { id: etapa.id, pagamentos: pagaveis.length };
  },
);
