import { z } from "zod";

/**
 * Regras de e-mail, telefone e canal do formulário de entrada comercial. Puro (sem I/O): o
 * diálogo usa para máscara e erro sob o campo, e o schema do servidor usa para recusar payload
 * fora do padrão — a mesma regra nos dois lados, para a tela nunca aceitar o que a action recusa.
 */

export const MENSAGEM_EMAIL = "E-mail inválido. Use o formato nome@empresa.com.br.";
export const MENSAGEM_TELEFONE = "Telefone inválido. Informe o DDD e o número, ex.: (81) 99999-9999.";

const esquemaEmail = z.string().email();

/** Vazio é válido: e-mail é opcional. Só recusa quando há texto e ele não é um e-mail. */
export function emailValido(valor: string): boolean {
  const v = valor.trim();
  return v === "" || esquemaEmail.safeParse(v).success;
}

/** E-mail é caixa-baixa e sem espaço nas pontas — o que se grava e o que se deduplica. */
export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Dígitos nacionais do telefone: descarta o código do país (+55) quando o número vem colado com
 * ele. Sem isto, "+55 81 99999-9999" (13 dígitos) seria cortado em 11 pela máscara e viraria o
 * número errado "(55) 81999-9999".
 */
function digitosNacionais(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

/** (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular), enquanto a pessoa digita. */
export function formatarTelefoneEntrada(valor: string): string {
  const d = digitosNacionais(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Telefone brasileiro: DDD (11–99) + 8 dígitos (fixo, começa em 2–5) ou + 9 dígitos (celular,
 * começa em 9). Vazio é válido. Não confirma que o número existe — só que tem cara de telefone.
 */
export function telefoneValido(valor: string): boolean {
  if (valor.trim() === "") return true;
  const d = digitosNacionais(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]/.test(d)) return false;
  const local = d.slice(2);
  return local.length === 9 ? local.startsWith("9") : /^[2-5]/.test(local);
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O canal é o de indicação? Decide se "Quem indicou" aparece no formulário. Por nome — o catálogo
 * (`CANAIS_AQUISICAO` no seed) não tem um campo próprio para isso — e por "contém", para valer
 * também se alguém renomear para "Indicação de parceiro". Se o canal for renomeado para algo sem
 * a palavra, o campo some: nesse caso o ajuste é aqui.
 */
export function canalEhIndicacao(nome: string | null | undefined): boolean {
  return nome != null && semAcento(nome).includes("indicacao");
}
