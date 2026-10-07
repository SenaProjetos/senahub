import { soDigitos } from "@/lib/documento";
import { ehDigito, limpoPor, SO_NUMERO_E_MASCARA, type TipoCampo, vazio } from "./tipo";

/**
 * Documentos de quem é CLT (cadastro do colaborador): PIS/NIS, CTPS, título de eleitor e CNH.
 * Todos opcionais — só o CLT precisa deles. Vazio é válido; a obrigatoriedade, quando houver, é do schema.
 */

const soNumero = (v: string) => SO_NUMERO_E_MASCARA.test(v);
const todosIguais = (d: string) => /^(\d)\1+$/.test(d);

// ── PIS/PASEP/NIS: 11 dígitos, o último é DV (módulo 11, pesos 3298765432) ───────────────────
export function mascararPis(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 8) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`;
}

export function validarPis(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 11 || todosIguais(d)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  let dv = 11 - (soma % 11);
  if (dv >= 10) dv = 0;
  return dv === Number(d[10]);
}

const limpoPis = limpoPor(soNumero, mascararPis);
const pisOk = (t: string) => limpoPis(t) && validarPis(t);

export const pis: TipoCampo = {
  mascarar: mascararPis,
  normalizar: (t) => (!vazio(t) && pisOk(t) ? mascararPis(t) : t.trim()),
  validar: (t) => vazio(t) || pisOk(t),
  limpo: limpoPis,
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "PIS/NIS inválido. Confira os 11 dígitos.",
  inputMode: "numeric",
  placeholder: "000.00000.00-0",
};

// ── CTPS: número (até 7 dígitos) e série (até 5), em campos separados ────────────────────────
function ctps(max: number, rotulo: string, placeholder: string): TipoCampo {
  const mascarar = (t: string) => soDigitos(t).slice(0, max);
  const limpo = limpoPor((v) => /^[0-9]*$/.test(v), mascarar);
  const ok = (t: string) => limpo(t) && soDigitos(t).length >= 1 && soDigitos(t).length <= max;
  return {
    mascarar,
    normalizar: (t) => (!vazio(t) && ok(t) ? mascarar(t) : t.trim()),
    validar: (t) => vazio(t) || ok(t),
    limpo,
    essencia: soDigitos,
    significativo: ehDigito,
    mensagem: `${rotulo} inválido. Use só números, até ${max} dígitos.`,
    inputMode: "numeric",
    placeholder,
  };
}

export const ctpsNumero = ctps(7, "Número da CTPS", "0000000");
export const ctpsSerie = ctps(5, "Série da CTPS", "0000");

// ── Título de eleitor: 12 dígitos; posições 9-10 = UF (01–28). Sem conferir os DVs: a regra
//    muda para SP/MG e um título válido recusado trava o cadastro — mesma escolha do RG. ─────
export function mascararTitulo(texto: string): string {
  const d = soDigitos(texto).slice(0, 12);
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
}

const limpoTitulo = limpoPor((v) => /^[0-9\s]*$/.test(v), mascararTitulo);

function tituloValido(t: string): boolean {
  if (!limpoTitulo(t)) return false;
  const d = soDigitos(t);
  if (d.length !== 12 || todosIguais(d)) return false;
  const uf = Number(d.slice(8, 10));
  return uf >= 1 && uf <= 28;
}

export const tituloEleitor: TipoCampo = {
  mascarar: mascararTitulo,
  normalizar: (t) => (!vazio(t) && tituloValido(t) ? mascararTitulo(t) : t.trim()),
  validar: (t) => vazio(t) || tituloValido(t),
  limpo: limpoTitulo,
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "Título de eleitor inválido. Confira os 12 dígitos.",
  inputMode: "numeric",
  placeholder: "0000 0000 0000",
};

// ── CNH: 11 dígitos, os dois últimos são DVs ─────────────────────────────────────────────────
export function validarCnh(texto: string): boolean {
  const d = soDigitos(texto);
  if (d.length !== 11 || todosIguais(d)) return false;
  const n = [...d].map(Number);
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += n[i] * (9 - i);
  let dv1 = soma % 11;
  let desconto = 0;
  if (dv1 >= 10) {
    dv1 = 0;
    desconto = 2;
  }
  soma = 0;
  for (let i = 0; i < 9; i++) soma += n[i] * (i + 1);
  const x = soma % 11;
  let dv2 = x >= 10 ? 0 : x - desconto;
  if (dv2 < 0) dv2 += 11;
  if (dv2 >= 10) dv2 = 0;
  return dv1 === n[9] && dv2 === n[10];
}

const mascararCnh = (t: string) => soDigitos(t).slice(0, 11);
const limpoCnh = limpoPor((v) => /^[0-9\s]*$/.test(v), mascararCnh);
const cnhOk = (t: string) => limpoCnh(t) && validarCnh(t);

export const cnh: TipoCampo = {
  mascarar: mascararCnh,
  normalizar: (t) => (!vazio(t) && cnhOk(t) ? mascararCnh(t) : t.trim()),
  validar: (t) => vazio(t) || cnhOk(t),
  limpo: limpoCnh,
  essencia: soDigitos,
  significativo: ehDigito,
  mensagem: "CNH inválida. Confira os 11 dígitos do número de registro.",
  inputMode: "numeric",
  placeholder: "00000000000",
};
