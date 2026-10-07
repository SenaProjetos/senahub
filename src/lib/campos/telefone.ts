import { soDigitos } from "@/lib/documento";
import { ehDigito, limpoPor, type TipoCampo } from "./tipo";

/**
 * Dígitos nacionais: descarta o código do país (+55) quando o número vem colado com ele. Sem
 * isto, "+55 81 99999-9999" (13 dígitos) seria cortado em 11 e viraria "(55) 81999-9999".
 */
export function digitosNacionais(valor: string): string {
  const d = soDigitos(valor);
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

/** (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular), enquanto a pessoa digita. */
function mascararTelefone(valor: string): string {
  const d = digitosNacionais(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Forma de telefone, o texto inteiro: +55 opcional (só com o "+"), DDD opcional com ou sem
 * parênteses, 9 opcional, 4 dígitos, separador opcional, 4 dígitos. Ramal, nome, segundo número ou
 * "55" sem "+" ficam fora — os dígitos sozinhos dariam outro número.
 */
const FORMA = /^(\+\s*55\s*)?(\(?\d{2}\)?\s*)?9?\s*\d{4}[\s.-]?\d{4}$/;
const limpo = limpoPor((v) => FORMA.test(v), mascararTelefone);

/**
 * DDD (11–99) + 8 dígitos (fixo, começa em 2–5) ou + 9 dígitos (celular, começa em 9). Não
 * confirma que o número existe — só que tem cara de telefone.
 */
function telefoneValido(valor: string): boolean {
  if (!limpo(valor)) return false;
  const d = digitosNacionais(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]/.test(d)) return false;
  const local = d.slice(2);
  return local.length === 9 ? local.startsWith("9") : /^[2-5]/.test(local);
}

export const telefone: TipoCampo = {
  mascarar: mascararTelefone,
  normalizar: (t) => (t.trim() !== "" && telefoneValido(t) ? mascararTelefone(t) : t.trim()),
  validar: (t) => t.trim() === "" || telefoneValido(t),
  limpo,
  essencia: digitosNacionais,
  significativo: ehDigito,
  mensagem: "Telefone inválido. Informe o DDD e o número, ex.: (81) 99999-9999.",
  inputMode: "tel",
  autoComplete: "tel",
  placeholder: "(00) 00000-0000",
};
