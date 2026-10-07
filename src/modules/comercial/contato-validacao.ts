import { email } from "@/lib/campos/email";
import { telefone } from "@/lib/campos/telefone";

/**
 * Regras de e-mail e telefone do formulário de entrada comercial. A fonte é o catálogo de campos
 * (`lib/campos/`, spec 2026-10-04): estes nomes ficam por compatibilidade com quem já importa daqui.
 */
export const MENSAGEM_EMAIL = email.mensagem;
export const MENSAGEM_TELEFONE = telefone.mensagem;

/** Vazio é válido: e-mail é opcional. Só recusa quando há texto e ele não é um e-mail. */
export const emailValido = (valor: string): boolean => email.validar(valor);

/** E-mail é caixa-baixa e sem espaço nas pontas — o que se grava e o que se deduplica. */
export const normalizarEmail = (valor: string): string => email.normalizar(valor);

/** (00) 0000-0000 ou (00) 00000-0000, enquanto a pessoa digita. */
export const formatarTelefoneEntrada = (valor: string): string => telefone.mascarar(valor);

/** Telefone brasileiro com DDD. Vazio é válido. */
export const telefoneValido = (valor: string): boolean => telefone.validar(valor);

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
