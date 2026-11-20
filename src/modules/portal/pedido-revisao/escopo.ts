import type { Prisma } from "@/generated/prisma/client";

/**
 * Quais pedidos a coordenação enxerga na fila, no detalhe e na bolinha do menu — a MESMA muralha de aceitar e recusar
 * (`exigirEscopoDaRevisao`: `projetos:ver` + projeto visível + responsável da disciplina ou `ver_todas_disciplinas`).
 * Senão a pessoa veria "Aceitar" e tomaria erro ao clicar. Puro: quem chama resolve as permissões.
 */
export function whereDaFila(p: {
  podeVerProjetos: boolean;
  escopoProjeto: Prisma.ProjetoWhereInput;
  userId: string;
  veTodas: boolean;
}): Prisma.PedidoRevisaoClienteWhereInput {
  if (!p.podeVerProjetos) return { id: { in: [] } };
  if (p.veTodas) return { projeto: p.escopoProjeto };
  return { projeto: p.escopoProjeto, documento: { disciplina: { responsaveis: { some: { userId: p.userId } } } } };
}
