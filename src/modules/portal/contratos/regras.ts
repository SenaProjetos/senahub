// Regras puras do pedido de assinatura de contrato pelo portal do cliente.
// Sem Prisma, sem server-only: a tela da equipe e o serviço leem as MESMAS frases.
// Spec: docs/superpowers/specs/2026-11-21-portal-assinatura-contrato-design.md
import type { StatusContratual } from "@/modules/juridico/contrato/estado";

export type { StatusContratual };

export type StatusPedido = "aguardando" | "assinado" | "cancelado";
export type SituacaoPedido = "aguardando" | "assinado" | "cancelado" | "versao_substituida" | "encerrado";

export const MOTIVO_NAO_CONTRATUAL = "Só contrato ou aditivo pode ser assinado pelo portal.";
export const MOTIVO_CONTRATO_EQUIPE = "Contrato de equipe não vai para o portal.";
export const MOTIVO_SEM_CLIENTE = "O documento não tem cliente.";
export const MOTIVO_CLIENTE_INATIVO = "O cliente está inativo; o portal dele está fechado.";
export const MOTIVO_PROJETO_OUTRO_CLIENTE = "O projeto do documento é de outro cliente.";
export const MOTIVO_SEM_CONTA = "O cliente não tem conta ativa no portal.";
export const MOTIVO_VERSAO_NAO_VIGENTE = "Só a versão mais recente pode ir para assinatura.";
export const MOTIVO_NAO_PDF = "Só arquivo PDF pode ser assinado pelo portal.";
export const MOTIVO_ENCERRADO = "Contrato vencido ou rescindido não vai para assinatura.";
export const MOTIVO_JA_PEDIDO = "Já há um pedido de assinatura aguardando neste documento.";
export const MOTIVO_JA_ASSINADO = "Este contrato já foi assinado.";
export const MOTIVO_CANCELADO = "A equipe cancelou este pedido de assinatura.";
export const MOTIVO_VERSAO_SUBSTITUIDA = "A equipe enviou uma versão nova deste documento; aguarde o novo pedido.";
export const MOTIVO_CONTRATO_ENCERRADO = "Este contrato foi encerrado e não aceita mais assinatura.";
export const MOTIVO_NAO_AGUARDANDO = "O pedido não está mais aguardando assinatura.";
export const MOTIVO_MUDOU = "O pedido mudou enquanto você agia. Recarregue a página.";
export const MOTIVO_NAO_ENCONTRADO = "Pedido não encontrado.";
export const MOTIVO_EXTERNO_NO_JURIDICO = "Assine pelo portal, no pedido de assinatura.";

/** Situação lida do banco: o pedido guardado + o estado atual do documento. */
export function situacaoDoPedido(
  p: { status: StatusPedido; versaoNumero: number },
  d: { versaoVigenteNumero: number; statusContrato: StatusContratual | null },
): SituacaoPedido {
  if (p.status === "assinado") return "assinado";
  if (p.status === "cancelado") return "cancelado";
  if (p.versaoNumero !== d.versaoVigenteNumero) return "versao_substituida";
  if (d.statusContrato === "vencido" || d.statusContrato === "rescindido") return "encerrado";
  return "aguardando";
}

export function visivelNoPortal(s: SituacaoPedido): boolean {
  return s === "aguardando" || s === "assinado";
}

export function rotuloSituacaoEquipe(s: SituacaoPedido): string {
  switch (s) {
    case "aguardando":
      return "Aguardando o cliente";
    case "assinado":
      return "Assinado pelo cliente";
    case "cancelado":
      return "Cancelado";
    case "versao_substituida":
      return "Versão substituída";
    case "encerrado":
      return "Contrato encerrado";
  }
}

export function rotuloTipoDocumento(tipo: string): string {
  if (tipo === "contrato") return "Contrato";
  if (tipo === "aditivo") return "Aditivo";
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

export type EntradaPedir = {
  tipo: string;
  vinculoId: string | null;
  clienteId: string | null;
  clienteAtivo: boolean;
  /** undefined = documento sem projeto. */
  projetoClienteId: string | null | undefined;
  contasAtivas: number;
  versaoNumero: number;
  versaoVigenteNumero: number;
  arquivoNome: string;
  statusContrato: StatusContratual | null;
  /** Pedido "aguardando" cuja versão É a vigente (o de versão substituída não conta: o serviço o cancela ao pedir de novo). */
  temPedidoAguardandoNaVigente: boolean;
};

/** Primeira razão que impede de pedir a assinatura, ou null. A ordem é a da lista de motivos. */
export function motivoParaNaoPedir(e: EntradaPedir): string | null {
  if (e.tipo !== "contrato" && e.tipo !== "aditivo") return MOTIVO_NAO_CONTRATUAL;
  if (e.vinculoId) return MOTIVO_CONTRATO_EQUIPE;
  if (!e.clienteId) return MOTIVO_SEM_CLIENTE;
  if (!e.clienteAtivo) return MOTIVO_CLIENTE_INATIVO;
  if (e.projetoClienteId !== undefined && e.projetoClienteId !== e.clienteId) return MOTIVO_PROJETO_OUTRO_CLIENTE;
  if (e.contasAtivas < 1) return MOTIVO_SEM_CONTA;
  if (e.versaoNumero !== e.versaoVigenteNumero) return MOTIVO_VERSAO_NAO_VIGENTE;
  if (!e.arquivoNome.toLowerCase().endsWith(".pdf")) return MOTIVO_NAO_PDF;
  if (e.statusContrato === "vencido" || e.statusContrato === "rescindido") return MOTIVO_ENCERRADO;
  if (e.temPedidoAguardandoNaVigente) return MOTIVO_JA_PEDIDO;
  return null;
}

export function motivoParaNaoAssinar(s: SituacaoPedido): string | null {
  switch (s) {
    case "aguardando":
      return null;
    case "assinado":
      return MOTIVO_JA_ASSINADO;
    case "cancelado":
      return MOTIVO_CANCELADO;
    case "versao_substituida":
      return MOTIVO_VERSAO_SUBSTITUIDA;
    case "encerrado":
      return MOTIVO_CONTRATO_ENCERRADO;
  }
}

export function motivoParaNaoCancelar(status: StatusPedido): string | null {
  return status === "aguardando" ? null : MOTIVO_NAO_AGUARDANDO;
}

export function textoPedidoAssinatura(e: {
  documentoTitulo: string;
  tipo: string;
  projetoNome: string | null;
  porNome: string;
}): { titulo: string; corpo: string } {
  const projeto = e.projetoNome ? ` do projeto ${e.projetoNome}` : "";
  return {
    titulo: "Contrato para assinar",
    corpo: `${e.porNome} pediu sua assinatura no ${e.tipo.toLowerCase()} "${e.documentoTitulo}"${projeto}.`,
  };
}

export function textoAssinadoNoPortal(e: {
  documentoTitulo: string;
  versaoNumero: number;
  contaNome: string;
}): { titulo: string; corpo: string } {
  return {
    titulo: "Contrato assinado pelo portal",
    corpo: `${e.contaNome} assinou "${e.documentoTitulo}" (v${e.versaoNumero}) pelo portal.`,
  };
}
