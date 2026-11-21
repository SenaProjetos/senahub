/**
 * Regras puras do pedido do briefing pelo portal do cliente. Sem Prisma, sem
 * `server-only`, sem Next: a tela e o serviço usam as mesmas frases.
 */

export type SituacaoPortalBriefing = "nao_pedido" | "aberto" | "encerrado";
export type CanalBriefing = "equipe" | "link" | "portal";

export const MOTIVO_ENCERRADO = "A equipe encerrou o preenchimento deste formulário.";
export const MOTIVO_NAO_PEDIDO = "A equipe ainda não pediu este formulário pelo portal.";
export const MOTIVO_SEM_CLIENTE = "O projeto não tem cliente.";
export const MOTIVO_CLIENTE_INATIVO = "O cliente está inativo.";
export const MOTIVO_SEM_CONTA_PORTAL = "O cliente não tem conta ativa no portal. Use o link.";
export const MOTIVO_NADA_A_PREENCHER = "Não há nada para o cliente preencher neste projeto.";
export const MOTIVO_JA_PEDIDO = "Já foi pedido.";
export const MOTIVO_PEDIDO_NAO_ABERTO = "O pedido não está aberto.";

export function situacaoPortal(
  b: { portalPedidoEm: Date | null; portalEncerradoEm: Date | null } | null,
): SituacaoPortalBriefing {
  if (!b || !b.portalPedidoEm) return "nao_pedido";
  if (b.portalEncerradoEm) return "encerrado";
  return "aberto";
}

export function motivoParaNaoGravar(situacao: SituacaoPortalBriefing, canal: CanalBriefing): string | null {
  if (canal === "equipe") return null;
  if (canal === "link") return situacao === "encerrado" ? MOTIVO_ENCERRADO : null;
  if (situacao === "nao_pedido") return MOTIVO_NAO_PEDIDO;
  if (situacao === "encerrado") return MOTIVO_ENCERRADO;
  return null;
}

export function motivoParaNaoPedir(e: {
  temCliente: boolean;
  clienteAtivo: boolean;
  contasAtivas: number;
  temAlgoAPreencher: boolean;
  situacao: SituacaoPortalBriefing;
}): string | null {
  if (!e.temCliente) return MOTIVO_SEM_CLIENTE;
  if (!e.clienteAtivo) return MOTIVO_CLIENTE_INATIVO;
  if (e.situacao === "aberto") return MOTIVO_JA_PEDIDO;
  if (e.contasAtivas <= 0) return MOTIVO_SEM_CONTA_PORTAL;
  if (!e.temAlgoAPreencher) return MOTIVO_NADA_A_PREENCHER;
  return null;
}

export function motivoParaNaoEncerrar(situacao: SituacaoPortalBriefing): string | null {
  return situacao === "aberto" ? null : MOTIVO_PEDIDO_NAO_ABERTO;
}

export function textoPedidoBriefing(p: { projetoNome: string; projetoCodigo: string; reaberto: boolean }): {
  titulo: string;
  corpo: string;
} {
  return {
    titulo: p.reaberto ? "A equipe reabriu o briefing do projeto" : "A equipe pediu o briefing do projeto",
    corpo: `${p.projetoCodigo} — ${p.projetoNome}: preencha as informações para iniciarmos os projetos.`,
  };
}

export function textoPreenchimento(p: {
  motivo: "parcial" | "completo";
  canal: "link" | "portal";
  projetoNome: string;
  codigo: string;
}): { titulo: string; corpo: string } {
  const concluido = p.motivo === "completo";
  const titulo = concluido ? "Formulário do cliente concluído" : "Cliente preencheu o formulário";
  const via = p.canal === "portal" ? "pelo portal" : "pelo link público";
  const corpo = concluido
    ? `${p.projetoNome} (${p.codigo}) — briefing completo ${via}.`
    : `${p.projetoNome} (${p.codigo}) — novas respostas ${via}.`;
  return { titulo, corpo };
}
