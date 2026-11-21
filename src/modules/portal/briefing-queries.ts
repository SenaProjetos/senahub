import "server-only";
import { prisma } from "@/lib/prisma";
import {
  calcularStatusBriefing,
  progressoObrigatorios,
  type SecaoBriefing,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { formularioDoCliente, type ExtraDoFormulario } from "@/modules/inputs/formulario-cliente";
import { statusDoFormulario } from "@/modules/portal/briefing-regras";
import { situacaoPortal } from "@/modules/inputs/portal-pedido";

export type BriefingDoPortal = {
  situacao: "aberto" | "encerrado";
  status: StatusBriefing;
  progresso: { preenchidos: number; total: number };
  secoes: SecaoBriefing[];
  respostas: Record<string, unknown>;
  /** Há campo do modelo visível; falso = o projeto só tem perguntas extras (o selo e a frase vêm delas). */
  temCampoVisivel: boolean;
  extras: ExtraDoFormulario[];
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

  const { secoes, gravadas, respostas, extras } = await formularioDoCliente(projeto);
  const progresso = progressoObrigatorios(gravadas, secoes);
  // Só perguntas extras (nenhum campo do modelo visível): o selo e a frase vêm das extras.
  const temCampoVisivel = secoes.length > 0;

  return {
    situacao,
    status: statusDoFormulario({ status: calcularStatusBriefing(gravadas, secoes), temCampoVisivel, extras }),
    progresso,
    temCampoVisivel,
    secoes,
    respostas,
    extras,
    encerradoEm: projeto.briefing?.portalEncerradoEm ?? null,
  };
}
