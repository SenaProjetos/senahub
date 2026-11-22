/**
 * Regras puras da conversa do cliente com a coordenação (spec 2026-11-21-portal-mensagens-coordenacao).
 * Sem I/O: o serviço lê o estado e pergunta aqui; a mesma frase serve de erro da ação e de motivo na tela.
 */
import { EXTENSOES_ANEXO, extensaoDoAnexo } from "@/modules/portal/pedido-revisao/regras";

export const TEXTO_MAX = 5000;
export const RESUMO_MAX = 300;
export const ANEXOS_MAX = 5;
export const JANELA_ANEXO_MS = 15 * 60_000;
/** "5.000": o limite como a tela e as mensagens escrevem. */
export const TEXTO_MAX_ROTULO = TEXTO_MAX.toLocaleString("pt-BR");

/**
 * Evento Socket.io de "a conversa mudou" (payload só `{ projetoId }`, nunca o texto). Aqui, no arquivo puro, para o
 * servidor (`avisos.ts`) e a tela (`use-conversa-ao-vivo.ts`) usarem o mesmo nome.
 */
export const EVENTO_CONVERSA = "portal-conversa";

export const MOTIVO_NAO_ENCONTRADA = "Conversa não encontrada.";
export const MOTIVO_TEXTO_VAZIO = "Escreva a mensagem ou anexe um arquivo.";
export const MOTIVO_TEXTO_LONGO = `A mensagem passa de ${TEXTO_MAX_ROTULO} caracteres.`;
export const MOTIVO_ANEXOS_MAX = "Cada mensagem aceita até 5 anexos.";
export const MOTIVO_JANELA_ANEXO = "O prazo para anexar a esta mensagem acabou. Envie uma nova mensagem.";
export const MOTIVO_TIPO_ANEXO = "Anexe PDF, imagem (PNG ou JPG), DWG ou DXF.";
export const MOTIVO_DECISAO_JA_MARCADA = "Esta mensagem já está marcada como decisão.";
export const MOTIVO_DECISAO_NAO_MARCADA = "Esta mensagem não está marcada como decisão.";
export const ROTULO_DECISAO_PORTAL = "Registrada pela coordenação";

export type LadoMensagem = "cliente" | "equipe";

/** Texto de 0 a 5.000 caracteres após o trim; vazio só quando a mensagem leva anexos. */
export function motivoParaNaoEnviar(p: { texto: string; comAnexos: boolean }): string | null {
  const texto = p.texto.trim();
  if (texto.length > TEXTO_MAX) return MOTIVO_TEXTO_LONGO;
  if (texto.length === 0 && !p.comAnexos) return MOTIVO_TEXTO_VAZIO;
  return null;
}

/**
 * Anexo chega depois da mensagem, um por requisição: só o autor, só em mensagem que nasceu com `comAnexos`,
 * dentro da janela e até o limite. Outro autor ou mensagem sem anexos = "não encontrada" (não revela nada).
 */
export function motivoParaNaoAnexar(p: {
  autorId: string;
  userId: string;
  criadaEm: Date;
  agora: Date;
  anexos: number;
  comAnexos: boolean;
}): string | null {
  if (p.autorId !== p.userId || !p.comAnexos) return MOTIVO_NAO_ENCONTRADA;
  if (p.agora.getTime() - p.criadaEm.getTime() > JANELA_ANEXO_MS) return MOTIVO_JANELA_ANEXO;
  if (p.anexos >= ANEXOS_MAX) return MOTIVO_ANEXOS_MAX;
  return null;
}

/** Os mesmos tipos do pedido de revisão (PDF, PNG, JPG, DWG, DXF), pela extensão do nome; null = entra. */
export function motivoDoTipoDoAnexo(nome: string): string | null {
  return (EXTENSOES_ANEXO as readonly string[]).includes(extensaoDoAnexo(nome)) ? null : MOTIVO_TIPO_ANEXO;
}

/** Abre no navegador só PDF e imagem, e só quando pedido; o tipo da resposta vem da extensão, nunca do navegador de quem enviou. */
export function tipoParaAbrirNoNavegador(nome: string, pediuInline: boolean): string | null {
  if (!pediuInline) return null;
  const ext = extensaoDoAnexo(nome);
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/**
 * E-mail de "mensagem nova": um por vez até a pessoa abrir a conversa. Nunca avisada, avisa; avisada e sem ler
 * desde então, não repete; leu depois do aviso, a próxima mensagem avisa de novo.
 */
export function precisaDeEmail(l: { lidaAte: Date | null; emailAvisadoEm: Date | null }): boolean {
  if (l.emailAvisadoEm === null) return true;
  return l.lidaAte !== null && l.emailAvisadoEm <= l.lidaAte;
}

/** Quem falou por último e aguarda resposta do outro lado: o cliente espera a coordenação. */
export function aguardandoResposta(c: { ultimoLado: LadoMensagem | null }): boolean {
  return c.ultimoLado === "cliente";
}

export function ladoOposto(lado: LadoMensagem): LadoMensagem {
  return lado === "cliente" ? "equipe" : "cliente";
}

/** Não lida = mensagem do lado oposto ao meu, criada depois de `lidaAte` (nulo = nunca abri). */
export function contaNaoLida(
  m: { lado: LadoMensagem; criadaEm: Date },
  meuLado: LadoMensagem,
  lidaAte: Date | null,
): boolean {
  if (m.lado !== ladoOposto(meuLado)) return false;
  return lidaAte === null || m.criadaEm > lidaAte;
}
