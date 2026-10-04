import "server-only";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";

/**
 * Leitura na Compatibilização (decisão do dono, 2026-10-04): quem tem `coordenacao:ver` e enxerga
 * o projeto vê TODOS os modelos dele — de qualquer disciplina e os recebidos do cliente. É a mesma
 * regra que abre a página (`projetoVisivel`), então a lista e o download nunca discordam: antes,
 * o responsável de uma disciplina que não era membro do projeto via a lista e levava 403 nos
 * outros modelos. Escrita (realinhar, georreferenciar, resolver apontamento) segue por disciplina.
 */
export async function veModelosDoProjeto(
  user: Parameters<typeof escopoProjeto>[0],
  projetoId: string,
): Promise<boolean> {
  const projeto = await prisma.projeto.findFirst({
    where: { AND: [{ id: projetoId }, escopoProjeto(user)] },
    select: { id: true },
  });
  return projeto !== null;
}

/** Textos das rotas do visualizador: dizem o motivo e o que fazer, nunca só "Sem permissão". */
export const MENSAGEM_ACESSO_MODELO = {
  semSessao: "Sua sessão expirou. Entre de novo para ver o modelo.",
  semPermissao:
    "Seu perfil de acesso não libera a Compatibilização. Peça ao administrador para incluir \"Ver maquete federada\" no seu perfil.",
  foraDoProjeto:
    "Você não participa deste projeto. Peça ao coordenador para incluir você como membro do projeto.",
  naoEncontrado: "Este modelo não existe mais — ele pode ter sido excluído. Recarregue a página.",
  naoConvertido:
    "Este modelo ainda não foi convertido para o visualizador. Aguarde a conversão ou peça a quem gerencia a compatibilização para converter.",
  arquivoSumiu:
    "O arquivo convertido deste modelo não está mais no servidor. Peça para reconverter o IFC na lista de modelos.",
  semSnapshot: "Este apontamento não tem imagem.",
  snapshotSumiu: "A imagem deste apontamento não está mais no servidor.",
} as const;
