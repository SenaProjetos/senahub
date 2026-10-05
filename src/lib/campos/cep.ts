import { soDigitos } from "@/lib/documento";
import { ehDigito, limpoPor, SO_NUMERO_E_MASCARA, type TipoCampo } from "./tipo";

export function mascararCep(texto: string): string {
  const d = soDigitos(texto).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

const limpo = limpoPor((v) => SO_NUMERO_E_MASCARA.test(v), mascararCep);
const valido = (t: string) => limpo(t) && soDigitos(t).length === 8;

export const cep: TipoCampo = {
  mascarar: mascararCep,
  normalizar: (t) => (valido(t) ? mascararCep(t) : t.trim()),
  validar: (t) => t.trim() === "" || valido(t),
  limpo,
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CEP inválido. São 8 dígitos, ex.: 01310-100.",
  inputMode: "numeric",
  autoComplete: "postal-code",
  placeholder: "00000-000",
};
