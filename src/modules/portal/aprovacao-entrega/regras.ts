import { diaDeSaoPaulo } from "@/lib/data";
import { assinaturaConfere } from "@/modules/portal/pedido-revisao/regras";

/**
 * Aprovação formal da entrega (spec `docs/superpowers/specs/2026-11-22-portal-aprovacao-entrega-design.md`) — regras
 * PURAS: limites, frases de recusa (a mesma frase é o `ActionError` do servidor e o motivo de item desabilitado na tela)
 * e as decisões de "pode responder / cancelar / anular". Sem Prisma, sem Next.
 */

export type Resposta = "aprovado" | "aprovado_com_ressalvas" | "nao_aprovado";
export type StatusAprovacao = "aguardando" | "respondido" | "cancelado";

export const TITULO_MAX = 120;
export const MENSAGEM_MAX = 1000;
export const TEXTO_MAX = 2000;
export const MOTIVO_ANULACAO_MAX = 500;
export const NOME_POR_FORA_MAX = 120;
export const ITENS_MAX = 200;
export const TAMANHO_MAX_COMPROVANTE = 20 * 1024 * 1024;
export const TAMANHO_MAX_COMPROVANTE_LABEL = "20 MB";
export const EXTENSOES_COMPROVANTE = ["pdf", "png", "jpg", "jpeg", "eml", "msg"] as const;
/** Comprovante enviado e não usado em uma resposta por este tempo é apagado pelo job diário. */
export const COMPROVANTE_VALIDADE_MS = 24 * 3600_000;

export const MOTIVO_NAO_ENCONTRADO = "Pedido não encontrado.";
export const MOTIVO_JA_RESPONDIDO = "Este pedido já foi respondido.";
export const MOTIVO_CANCELADO = "Este pedido foi cancelado.";
export const MOTIVO_JA_ANULADA = "Esta resposta já foi anulada.";
export const MOTIVO_DESATUALIZADO = "Um dos arquivos foi atualizado depois do envio. A coordenação vai enviar de novo.";
export const MOTIVO_DESATUALIZADO_EQUIPE = "Um dos arquivos mudou depois do envio: cancele este pedido e envie de novo.";
export const MOTIVO_TEXTO_OBRIGATORIO = "Explique as ressalvas ou o motivo de não aprovar.";
export const MOTIVO_TEXTO_LONGO = "O texto passa de 2.000 caracteres.";
export const MOTIVO_SEM_ITENS = "Escolha ao menos um arquivo das Entregas.";
export const MOTIVO_ITEM_FORA = "Um dos arquivos escolhidos não está nas Entregas do cliente.";
export const MOTIVO_PARCELA = "Esta parcela não é de um contrato deste projeto.";
export const MOTIVO_DATA_FUTURA = "A data da resposta não pode ser depois de hoje.";
export const MOTIVO_DATA_ANTES_DO_ENVIO = "A data da resposta não pode ser antes do envio do pedido.";
export const MOTIVO_COMPROVANTE = "Anexe o comprovante da resposta antes de registrar.";
export const MOTIVO_PEDIDO_MUDOU = "Este pedido mudou. Recarregue a página.";
export const MOTIVO_TIPO_COMPROVANTE = "Anexe PDF, imagem (PNG ou JPG) ou e-mail (EML ou MSG).";
export const MOTIVO_COMPROVANTE_GRANDE = `O comprovante passa de ${TAMANHO_MAX_COMPROVANTE_LABEL}.`;
export const MOTIVO_CONTEUDO_COMPROVANTE = "O conteúdo do arquivo não corresponde à extensão.";

export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  aprovado: "Aprovado",
  aprovado_com_ressalvas: "Aprovado com ressalvas",
  nao_aprovado: "Não aprovado",
};
export const ROTULO_REGISTRADA_PELA_EQUIPE = "Registrada pela coordenação";

/** "Com ressalvas" conta como aceite (decisão 2 do dono); "não aprovo" não. */
export function contaComoAceite(r: Resposta): boolean {
  return r === "aprovado" || r === "aprovado_com_ressalvas";
}

export function motivoDoTexto(r: Resposta, texto: string | null): string | null {
  const t = (texto ?? "").trim();
  if (t.length > TEXTO_MAX) return MOTIVO_TEXTO_LONGO;
  if (r !== "aprovado" && t.length === 0) return MOTIVO_TEXTO_OBRIGATORIO;
  return null;
}

function motivoDoStatus(status: StatusAprovacao): string | null {
  if (status === "respondido") return MOTIVO_JA_RESPONDIDO;
  if (status === "cancelado") return MOTIVO_CANCELADO;
  return null;
}

export function motivoParaResponder(p: { status: StatusAprovacao; desatualizado: boolean; equipe: boolean }): string | null {
  const s = motivoDoStatus(p.status);
  if (s) return s;
  if (p.desatualizado) return p.equipe ? MOTIVO_DESATUALIZADO_EQUIPE : MOTIVO_DESATUALIZADO;
  return null;
}

export function motivoParaCancelar(status: StatusAprovacao): string | null {
  return motivoDoStatus(status);
}

export function motivoParaAnular(p: { status: StatusAprovacao; respostaAtiva: boolean }): string | null {
  return p.status === "respondido" && p.respostaAtiva ? null : MOTIVO_JA_ANULADA;
}

/** `dia` e `hoje` em "YYYY-MM-DD" (dia de São Paulo); o envio também é comparado pelo dia de São Paulo. */
export function motivoDaDataPorFora(p: { dia: string; enviadoEm: Date; hoje: string }): string | null {
  if (p.dia > p.hoje) return MOTIVO_DATA_FUTURA;
  if (p.dia < diaDeSaoPaulo(p.enviadoEm)) return MOTIVO_DATA_ANTES_DO_ENVIO;
  return null;
}

export function extensaoDoComprovante(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

export function motivoDoComprovante(p: { nome: string; tamanho: number }): string | null {
  if (!(EXTENSOES_COMPROVANTE as readonly string[]).includes(extensaoDoComprovante(p.nome))) return MOTIVO_TIPO_COMPROVANTE;
  if (p.tamanho > TAMANHO_MAX_COMPROVANTE) return MOTIVO_COMPROVANTE_GRANDE;
  return null;
}

/** O começo do arquivo corresponde à extensão? MSG = documento OLE; EML = texto (sem byte 0 no começo). */
export function conteudoDoComprovanteConfere(ext: string, inicio: Uint8Array): boolean {
  switch (ext.toLowerCase()) {
    case "msg":
      return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => inicio[i] === v);
    case "eml":
      return inicio.length > 0 && !inicio.slice(0, 512).includes(0);
    case "pdf":
    case "png":
    case "jpg":
    case "jpeg":
      return assinaturaConfere(ext, inicio);
    default:
      return false;
  }
}
