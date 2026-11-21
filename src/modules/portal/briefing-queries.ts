import "server-only";
import { prisma } from "@/lib/prisma";
import {
  calcularStatusBriefing,
  prePopularRespostas,
  progressoObrigatorios,
  respostasVisiveis,
  secoesDoProjeto,
  type SecaoBriefing,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";
import { situacaoPortal } from "@/modules/inputs/portal-pedido";

export type BriefingDoPortal = {
  situacao: "aberto" | "encerrado";
  status: StatusBriefing;
  progresso: { preenchidos: number; total: number };
  secoes: SecaoBriefing[];
  respostas: Record<string, unknown>;
  extras: { id: string; disciplina: string | null; pergunta: string; resposta: string }[];
  encerradoEm: Date | null;
};

/**
 * O briefing de um projeto como o cliente o vê no portal: o MESMO formulário do link público (modelo do projeto,
 * disciplinas ativas, ocultações), sem resposta de campo oculto. `null` enquanto a equipe não pediu pelo portal.
 * Projeto de outro cliente devolve `null` (e quem chama também já o validou).
 *
 * Status e progresso saem do que está GRAVADO (o mesmo que o selo da equipe mostra); as respostas do formulário
 * levam também o pré-preenchimento do cadastro do cliente, como no link.
 */
export async function briefingDoPortal(projetoId: string, clienteId: string): Promise<BriefingDoPortal | null> {
  // Defesa em profundidade: o projeto tem de ser do cliente da conta, mesmo que quem chama já tenha conferido.
  const projeto = await prisma.projeto.findFirst({
    where: { id: projetoId, clienteId },
    select: {
      id: true,
      endereco: true,
      cliente: { select: { nome: true, email: true, telefone: true } },
      disciplinas: { select: { disciplinaTextoLegado: true } },
      briefing: {
        select: {
          respostasJson: true,
          secoesOcultas: true,
          camposOcultos: true,
          modeloId: true,
          portalPedidoEm: true,
          portalEncerradoEm: true,
        },
      },
    },
  });
  if (!projeto) return null;
  const situacao = situacaoPortal(projeto.briefing);
  if (situacao === "nao_pedido") return null;

  const disciplinas = projeto.disciplinas.map((d) => d.disciplinaTextoLegado);
  const ocultos = {
    secoes: projeto.briefing?.secoesOcultas ?? [],
    campos: projeto.briefing?.camposOcultos ?? [],
  };
  const modelo = await resolverModeloDoProjeto(projeto.id, projeto.briefing?.modeloId);
  const secoes = secoesDoProjeto(modelo.secoes, disciplinas, ocultos);
  const gravadas = (projeto.briefing?.respostasJson as Record<string, unknown> | null) ?? {};
  // Resposta de campo oculto (ou de disciplina que o projeto não tem) não sai do servidor.
  const respostas = respostasVisiveis(
    prePopularRespostas(
      gravadas,
      {
        nome: projeto.cliente?.nome,
        email: projeto.cliente?.email,
        telefone: projeto.cliente?.telefone,
        endereco: projeto.endereco ?? undefined,
      },
      modelo.secoes,
    ),
    secoes,
  );

  const extras = await prisma.inputProjeto.findMany({
    where: { projetoId: projeto.id, removidoEm: null },
    orderBy: [{ disciplina: "asc" }, { ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true, disciplina: true, pergunta: true, resposta: true },
  });

  return {
    situacao,
    status: calcularStatusBriefing(gravadas, secoes),
    progresso: progressoObrigatorios(gravadas, secoes),
    secoes,
    respostas,
    extras: extras.map((e) => ({ id: e.id, disciplina: e.disciplina, pergunta: e.pergunta, resposta: e.resposta ?? "" })),
    encerradoEm: projeto.briefing?.portalEncerradoEm ?? null,
  };
}
