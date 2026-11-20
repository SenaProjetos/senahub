import type { AcaoItem } from "@/components/ui/acoes";

/**
 * Regras puras do pedido de revisão do cliente (spec 2026-11-19-portal-pedido-revisao-design.md). O pedido nasce
 * `aguardando` e termina uma vez só: aceito pela coordenação, recusado com resposta ou cancelado pelo cliente. Toda
 * troca de status no banco é `updateMany` condicionado a `aguardando`; estas funções dão a mesma frase à tela e ao
 * servidor.
 */

export const STATUS_PEDIDO = ["aguardando", "aceito", "recusado", "cancelado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  aguardando: "Aguardando a equipe",
  aceito: "Aceito",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export const MOTIVO_JA_RESPONDIDO = "Este pedido já foi respondido ou cancelado.";
export const MOTIVO_REVISAO_SUBSTITUIDA =
  "A prancha ganhou revisão nova depois deste pedido. Recuse com uma resposta e peça ao cliente que confira a revisão nova.";
export const MOTIVO_SEM_VALIDAR = "Só quem valida arquivos pode aceitar: os apontamentos ficam em rascunho com você.";
export const MOTIVO_RECUSA_SEM_RESPOSTA = "Escreva a resposta ao cliente.";

export const EXTENSOES_ANEXO = ["pdf", "png", "jpg", "jpeg", "dwg", "dxf"] as const;
export const MAX_ANEXOS = 5;

export const LIMITE_COMENTARIO = 4000;
/** Cabe no texto do apontamento (1000) com "Cliente (Nome): " e "(ver pedido do cliente)". */
export const LIMITE_TEXTO_MARCACAO = 900;
export const MAX_MARCACOES = 50;
export const LIMITE_RESPOSTA = 2000;
export const LIMITE_MOTIVO_EM_REVISAO = 500;

/** O que o aceite precisa saber da revisão do pedido. `participa` = dentro do ciclo documental (ISO 19650). */
export type EstadoDaRevisao = { estado: string | null; participa: boolean; uploadSubstituido: boolean; arquivada: boolean };

/**
 * A revisão em que o cliente pediu ainda é a das Entregas? No ciclo, só a publicada (não arquivada); fora dele, o
 * arquivo do pedido não pode ter sido substituído. Rascunho nunca cai em outra revisão.
 */
export function revisaoAindaNasEntregas(r: EstadoDaRevisao): boolean {
  if (r.uploadSubstituido) return false;
  if (r.participa) return r.estado === "publicado" && !r.arquivada;
  return true;
}

export function motivoParaNaoAceitar(p: { status: StatusPedido; podeValidar: boolean; revisao: EstadoDaRevisao }): string | null {
  if (p.status !== "aguardando") return MOTIVO_JA_RESPONDIDO;
  if (!p.podeValidar) return MOTIVO_SEM_VALIDAR;
  if (!revisaoAindaNasEntregas(p.revisao)) return MOTIVO_REVISAO_SUBSTITUIDA;
  return null;
}

export function motivoParaNaoRecusar(p: { status: StatusPedido; resposta: string }): string | null {
  if (p.status !== "aguardando") return MOTIVO_JA_RESPONDIDO;
  if (!p.resposta.trim()) return MOTIVO_RECUSA_SEM_RESPOSTA;
  return null;
}

export function motivoParaNaoCancelar(p: { status: StatusPedido }): string | null {
  return p.status === "aguardando" ? null : MOTIVO_JA_RESPONDIDO;
}

/** Motivo do controle "Em revisão" aplicado no aceite: "Pedido do cliente: …", no máximo 500 caracteres. */
export function motivoEmRevisao(comentario: string): string {
  const texto = `Pedido do cliente: ${comentario.trim()}`;
  if (texto.length <= LIMITE_MOTIVO_EM_REVISAO) return texto;
  return `${texto.slice(0, LIMITE_MOTIVO_EM_REVISAO - 1)}…`;
}

/** Texto do rascunho de apontamento que uma marcação vira: "Cliente (Primeiro): texto" (+ menção aos anexos). */
export function textoDoRascunho(p: { nomeAutor: string; texto: string; temAnexos: boolean }): string {
  const primeiro = p.nomeAutor.trim().split(/\s+/)[0] ?? "";
  const quem = primeiro ? `Cliente (${primeiro})` : "Cliente";
  const sufixo = p.temAnexos ? " (ver pedido do cliente)" : "";
  return `${quem}: ${p.texto.trim()}${sufixo}`;
}

export function extensaoDoAnexo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

/** Por que este anexo não entra (extensão fora da lista ou limite de 5); null = entra. */
export function motivoDoAnexo(p: { nome: string; jaTem: number }): string | null {
  if (p.jaTem >= MAX_ANEXOS) return `O pedido aceita no máximo ${MAX_ANEXOS} anexos.`;
  const ext = extensaoDoAnexo(p.nome);
  if (!(EXTENSOES_ANEXO as readonly string[]).includes(ext)) {
    return "Anexe PDF, imagem (PNG ou JPG), DWG ou DXF.";
  }
  return null;
}

/**
 * Itens do menu de um pedido na fila da coordenação (ADR-0002). `podeAceitar` é o MOTIVO para não aceitar (null =
 * pode); o perfil já passou pelo gate da tela. Pedido respondido não tem ação.
 */
export function itensDoPedido(p: { status: StatusPedido; podeAceitar: string | null; podeRecusar: boolean }): AcaoItem[] {
  if (p.status !== "aguardando") return [];
  const itens: AcaoItem[] = [
    { tipo: "acao", id: "aceitar", rotulo: "Aceitar…", ...(p.podeAceitar ? { desabilitado: p.podeAceitar } : {}) },
  ];
  if (p.podeRecusar) itens.push({ tipo: "acao", id: "recusar", rotulo: "Recusar…" });
  return itens;
}
