import "server-only";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";
import { lerContexto, temAlgoAPreencher } from "@/modules/inputs/portal-pedido-service";
import { motivoParaNaoEncerrar, motivoParaNaoPedir, type SituacaoPortalBriefing } from "@/modules/inputs/portal-pedido";

/** Templates de inputs padrão (catálogo por disciplina). */
export async function listarInputTemplates() {
  return prisma.inputTemplate.findMany({ orderBy: [{ disciplina: "asc" }, { ordem: "asc" }] });
}

/** Perguntas extras ATIVAS do projeto (as removidas ficam fora da tela e do link). */
export async function listarInputs(projetoId: string) {
  return prisma.inputProjeto.findMany({
    where: { projetoId, removidoEm: null },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
  });
}

/** Perguntas extras removidas do formulário — para restaurar. */
export async function listarInputsRemovidos(projetoId: string) {
  return prisma.inputProjeto.findMany({
    where: { projetoId, removidoEm: { not: null } },
    orderBy: { removidoEm: "desc" },
    select: { id: true, disciplina: true, pergunta: true, resposta: true, removidoEm: true },
  });
}

export async function linkInput(projetoId: string) {
  return prisma.linkPublicoInput.findUnique({ where: { projetoId } });
}

/** Briefing de Start do projeto (ou null se ainda não iniciado). */
export async function obterBriefing(projetoId: string) {
  return prisma.briefingProjeto.findUnique({ where: { projetoId } });
}

/** Progresso de preenchimento (respondidas / total). */
export async function progressoInputs(projetoId: string) {
  const [total, respondidas] = await Promise.all([
    prisma.inputProjeto.count({ where: { projetoId, removidoEm: null } }),
    prisma.inputProjeto.count({ where: { projetoId, removidoEm: null, NOT: { resposta: null } } }),
  ]);
  return { total, respondidas };
}

/** Carrega o projeto + inputs + briefing pelo token público (só link vigente). */
export async function inputsPorToken(token: string) {
  const link = await prisma.linkPublicoInput.findUnique({
    where: { token },
    include: {
      projeto: {
        select: {
          id: true,
          nome: true,
          codigo: true,
          endereco: true,
          inputs: {
            where: { removidoEm: null },
            orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
          },
          disciplinas: { select: { disciplinaTextoLegado: true } },
          briefing: {
            select: {
              respostasJson: true,
              status: true,
              secoesOcultas: true,
              camposOcultos: true,
              modeloId: true,
              portalPedidoEm: true,
              portalEncerradoEm: true,
            },
          },
          cliente: { select: { nome: true, email: true, telefone: true } },
        },
      },
    },
  });
  if (!link || !linkVigente(link)) return null;
  return link.projeto;
}

export type InputItem = Awaited<ReturnType<typeof listarInputs>>[number];

export type ResumoPortalBriefing = {
  situacao: SituacaoPortalBriefing;
  pedidoEm: Date | null;
  pedidoPor: string | null;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  contasAtivas: number;
  motivoPedir: string | null;
  motivoEncerrar: string | null;
};

/** Leitura para a tela da equipe: estado do pedido, quem fez, e os motivos (mesmas frases do serviço) dos botões. */
export async function resumoPortalBriefing(projetoId: string): Promise<ResumoPortalBriefing> {
  const ctx = await lerContexto(projetoId);
  const briefing = await prisma.briefingProjeto.findUnique({
    where: { projetoId },
    select: { portalPedidoPorId: true, portalEncerradoPorId: true },
  });
  const ids = [briefing?.portalPedidoPorId, briefing?.portalEncerradoPorId].filter((x): x is string => !!x);
  const nomes = new Map(
    ids.length > 0 ? (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : [],
  );
  const situacao = ctx?.situacao ?? "nao_pedido";
  const algo = ctx ? await temAlgoAPreencher(projetoId, ctx.briefing) : false;
  return {
    situacao,
    pedidoEm: ctx?.briefing?.portalPedidoEm ?? null,
    pedidoPor: briefing?.portalPedidoPorId ? (nomes.get(briefing.portalPedidoPorId) ?? null) : null,
    encerradoEm: ctx?.briefing?.portalEncerradoEm ?? null,
    encerradoPor: briefing?.portalEncerradoPorId ? (nomes.get(briefing.portalEncerradoPorId) ?? null) : null,
    contasAtivas: ctx?.contas.length ?? 0,
    motivoPedir: motivoParaNaoPedir({
      temCliente: !!ctx?.projeto.clienteId,
      clienteAtivo: ctx?.projeto.cliente?.ativo ?? false,
      contasAtivas: ctx?.contas.length ?? 0,
      temAlgoAPreencher: algo,
      situacao,
    }),
    motivoEncerrar: motivoParaNaoEncerrar(situacao),
  };
}
