import { limpoPor, type TipoCampo } from "./tipo";

const alfanum = (t: string) => t.toUpperCase().replace(/[^0-9A-Z]/g, "");
const digitosOuX = (t: string) => t.toUpperCase().replace(/[^0-9X]/g, "");

const mascararRg = (t: string) => alfanum(t).slice(0, 14);
/** Só letras e números (o formato gravado) ou dígitos com . e -, com um X opcional no fim. */
const limpoRg = limpoPor((v) => /^[0-9A-Za-z]*$/.test(v) || /^[0-9.-]*[0-9][.-]?[Xx]?$/.test(v), mascararRg);

const rgValido = (t: string) => {
  if (!limpoRg(t)) return false;
  const l = alfanum(t);
  return l.length >= 5 && l.length <= 14 && /\d/.test(l);
};

/** RG: sem dígito verificador nacional (a regra muda por estado) — só forma e tamanho. */
export const rg: TipoCampo = {
  mascarar: mascararRg,
  normalizar: (t) => (rgValido(t) ? alfanum(t) : t.trim()),
  validar: (t) => t.trim() === "" || rgValido(t),
  limpo: limpoRg,
  essencia: alfanum,
  significativo: (c) => /[0-9a-zA-Z]/.test(c),
  mensagem: "RG inválido. Use de 5 a 14 letras e números, sem pontos.",
  inputMode: "text",
  placeholder: "Só letras e números",
};

/** Agência/conta: dígitos e ., no máximo um -, X só como último caractere. */
const AGENCIA_CONTA = /^[0-9.]*(-[0-9.]*)?[Xx]?$/;

function mascararAgencia(t: string): string {
  const e = digitosOuX(t).slice(0, 5);
  return e.length <= 4 ? e : `${e.slice(0, 4)}-${e[4]}`;
}
const limpoAgencia = limpoPor((v) => AGENCIA_CONTA.test(v), mascararAgencia);
const agenciaValida = (t: string) => limpoAgencia(t) && /^\d{4}[0-9X]?$/.test(digitosOuX(t));

export const agencia: TipoCampo = {
  mascarar: mascararAgencia,
  normalizar: (t) => (agenciaValida(t) ? mascararAgencia(t) : t.trim()),
  validar: (t) => t.trim() === "" || agenciaValida(t),
  limpo: limpoAgencia,
  essencia: digitosOuX,
  significativo: (c) => /[0-9xX]/.test(c),
  mensagem: "Agência inválida. São 4 dígitos, com ou sem dígito, ex.: 1234-5.",
  inputMode: "text",
  placeholder: "0000-0",
};

function mascararConta(t: string): string {
  const e = digitosOuX(t).slice(0, 13);
  return e.length < 2 ? e : `${e.slice(0, -1)}-${e.slice(-1)}`;
}
const limpoConta = limpoPor((v) => AGENCIA_CONTA.test(v), mascararConta);
const contaValida = (t: string) => limpoConta(t) && /^\d{1,12}[0-9X]$/.test(digitosOuX(t));

export const conta: TipoCampo = {
  mascarar: mascararConta,
  normalizar: (t) => (contaValida(t) ? mascararConta(t) : t.trim()),
  validar: (t) => t.trim() === "" || contaValida(t),
  limpo: limpoConta,
  essencia: digitosOuX,
  significativo: (c) => /[0-9xX]/.test(c),
  mensagem: "Conta inválida. Informe o número e o dígito, ex.: 12345-6.",
  inputMode: "text",
  placeholder: "00000-0",
};
