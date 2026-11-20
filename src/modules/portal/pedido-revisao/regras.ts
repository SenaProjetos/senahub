import type { AcaoItem } from "@/components/ui/acoes";
import { escaparMarkdown } from "@/modules/portal/resumo-diario";

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
export const MOTIVO_PRANCHA_RETIRADA =
  "A prancha deste pedido saiu das Entregas do cliente. Recuse com uma resposta explicando ao cliente.";
export const MOTIVO_CONTEUDO_DO_ANEXO = "O conteúdo do arquivo não corresponde à extensão. Envie o arquivo original.";
export const MOTIVO_SEM_VALIDAR = "Só quem valida arquivos pode aceitar: os apontamentos ficam em rascunho com você.";
export const MOTIVO_RECUSA_SEM_RESPOSTA = "Escreva a resposta ao cliente.";

export const EXTENSOES_ANEXO = ["pdf", "png", "jpg", "jpeg", "dwg", "dxf"] as const;
export const MAX_ANEXOS = 5;
/** Pedidos aguardando a equipe por conta e projeto — acima disso, o cliente espera uma resposta antes de pedir mais. */
export const MAX_PEDIDOS_AGUARDANDO = 20;

/** Teto por anexo: o Cloudflare Tunnel corta requisição acima de 100 MB na borda (mesmo teto do anexo do suporte). */
export const TAMANHO_MAX_ANEXO = 100 * 1024 * 1024;
export const TAMANHO_MAX_ANEXO_LABEL = "100 MB";

export const LIMITE_COMENTARIO = 4000;
/** Cabe no texto do apontamento (1000) com "Cliente (Nome): " e "(ver pedido do cliente)". */
export const LIMITE_TEXTO_MARCACAO = 900;
export const MAX_MARCACOES = 50;
export const LIMITE_RESPOSTA = 2000;
export const LIMITE_MOTIVO_EM_REVISAO = 500;

/**
 * O que o aceite precisa saber da revisão do pedido. `participa` = dentro do ciclo documental (ISO 19650);
 * `nasPastasDoCliente` = a revisão ainda é a "Compartilhado" ou a "Liberado para obra" do documento;
 * `outraNasPastas` = outra revisão do documento ocupa uma dessas pastas.
 */
export type EstadoDaRevisao = {
  estado: string | null;
  participa: boolean;
  uploadSubstituido: boolean;
  uploadExcluido: boolean;
  arquivada: boolean;
  nasPastasDoCliente: boolean;
  outraNasPastas: boolean;
};

/** A revisão nas pastas do cliente (ponteiros do documento): ela mesma, ou outra no lugar. */
export function revisaoNasPastas(
  doc: { revisaoCompartilhadaId: string | null; revisaoLiberadaObraId: string | null } | null,
  revisaoId: string,
): { nasPastasDoCliente: boolean; outraNasPastas: boolean } {
  const ponteiros = [doc?.revisaoCompartilhadaId ?? null, doc?.revisaoLiberadaObraId ?? null];
  return {
    nasPastasDoCliente: ponteiros.includes(revisaoId),
    outraNasPastas: ponteiros.some((p) => p !== null && p !== revisaoId),
  };
}

export type SituacaoDaRevisao = "nas_entregas" | "substituida" | "retirada";

/**
 * Onde está a revisão do pedido: ainda nas Entregas, substituída por uma revisão nova, ou retirada (arquivo na
 * lixeira, ou fora das pastas do cliente sem outra no lugar). Só "nas_entregas" pode ser aceita.
 */
export function situacaoDaRevisao(r: EstadoDaRevisao): SituacaoDaRevisao {
  if (r.uploadExcluido) return "retirada";
  if (r.uploadSubstituido) return "substituida";
  if (r.participa) {
    if (r.arquivada) return "substituida";
    return r.estado === "publicado" ? "nas_entregas" : "retirada";
  }
  if (r.nasPastasDoCliente) return "nas_entregas";
  return r.outraNasPastas ? "substituida" : "retirada";
}

/**
 * A revisão em que o cliente pediu ainda é a das Entregas? No ciclo, só a publicada (não arquivada); fora dele, a
 * revisão ainda numa pasta do cliente. Nos dois, o arquivo do pedido não pode ter sido substituído. Rascunho nunca cai
 * em outra revisão.
 */
export function revisaoAindaNasEntregas(r: EstadoDaRevisao): boolean {
  return situacaoDaRevisao(r) === "nas_entregas";
}

export function motivoParaNaoAceitar(p: { status: StatusPedido; podeValidar: boolean; revisao: EstadoDaRevisao }): string | null {
  if (p.status !== "aguardando") return MOTIVO_JA_RESPONDIDO;
  if (!p.podeValidar) return MOTIVO_SEM_VALIDAR;
  const situacao = situacaoDaRevisao(p.revisao);
  if (situacao === "substituida") return MOTIVO_REVISAO_SUBSTITUIDA;
  if (situacao === "retirada") return MOTIVO_PRANCHA_RETIRADA;
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

// ─────────────────────────────────────────────────────────────
// Avisos (sino e e-mail)
// ─────────────────────────────────────────────────────────────

/** Sino da coordenação quando o cliente pede revisão. */
export function textoPedidoNovo(p: { projetoCodigo: string; autorNome: string; prancha: string; tipo?: "prancha" | "modelo" }): {
  titulo: string;
  corpo: string;
} {
  return { titulo: "Pedido de revisão do cliente", corpo: `${p.projetoCodigo} — ${p.autorNome} pediu revisão ${doQue(p)}.` };
}

/** "de ARQ-3001.pdf" (prancha) ou "no modelo 3D" (pedido no modelo). */
function doQue(p: { prancha: string; tipo?: "prancha" | "modelo" }): string {
  return p.tipo === "modelo" ? "no modelo 3D" : `de ${p.prancha}`;
}

/** "aceito" | "recusado" — como a situação entra na frase do e-mail ("foi **aceito** pela equipe"). */
export function situacaoDaResposta(status: "aceito" | "recusado"): string {
  return status;
}

/** Sino de quem pediu quando a equipe responde. */
export function textoResposta(p: { status: "aceito" | "recusado"; prancha: string; tipo?: "prancha" | "modelo" }): {
  titulo: string;
  corpo: string;
} {
  return p.status === "aceito"
    ? { titulo: "Pedido de revisão aceito", corpo: `A equipe aceitou seu pedido de revisão ${doQue(p)}.` }
    : { titulo: "Pedido de revisão recusado", corpo: `A equipe respondeu seu pedido de revisão ${doQue(p)}.` };
}

/** A resposta da equipe no e-mail (Markdown escapado); sem resposta, linha vazia. */
export function linhaRespostaEmail(resposta: string | null): string {
  return resposta?.trim() ? `Resposta da equipe: ${escaparMarkdown(resposta.trim())}` : "";
}

/** Limite de pedidos aguardando por conta no projeto; null = pode pedir. */
export function motivoDoLimiteDePedidos(aguardandoDaConta: number): string | null {
  return aguardandoDaConta >= MAX_PEDIDOS_AGUARDANDO
    ? `Você já tem ${MAX_PEDIDOS_AGUARDANDO} pedidos aguardando a equipe neste projeto. Espere uma resposta ou cancele algum.`
    : null;
}

/**
 * O começo do arquivo corresponde à extensão? (A extensão vem do nome, que o navegador manda.) PDF, PNG, JPG e DWG têm
 * assinatura; DXF de texto começa com o código de grupo 0 (espaços e "0"), o binário com "AutoCAD Binary DXF".
 */
export function assinaturaConfere(ext: string, inicio: Uint8Array): boolean {
  const comeca = (...bytes: number[]) => bytes.every((v, i) => inicio[i] === v);
  const texto = new TextDecoder("latin1").decode(inicio.slice(0, 32));
  switch (ext.toLowerCase()) {
    case "pdf":
      return texto.startsWith("%PDF-");
    case "png":
      return comeca(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
    case "jpeg":
      return comeca(0xff, 0xd8, 0xff);
    case "dwg":
      return /^AC\d{4}/.test(texto);
    case "dxf":
      return texto.startsWith("AutoCAD Binary DXF") || /^\s*0\s*\r?\n/.test(texto) || /^\s*999\s*\r?\n/.test(texto);
    default:
      return false;
  }
}
