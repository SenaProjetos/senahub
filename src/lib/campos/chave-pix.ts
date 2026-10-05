import { TIPO_PIX_LABELS, validarChavePix, type ResultadoPix, type TipoPix } from "@/modules/rh/contas/pix";
import { cnpj, cpf } from "./cpf-cnpj";
import { email } from "./email";
import { telefone } from "./telefone";
import type { TipoCampo } from "./tipo";

const BASE: Record<Exclude<TipoPix, "aleatoria">, TipoCampo> = { cpf, cnpj, email, telefone };

/**
 * Chave PIX por tipo. A gravação segue o formato do BACEN (`validarChavePix`): só dígitos no
 * CPF/CNPJ, +55DDD… no telefone, minúscula no e-mail e na aleatória. A máscara é só de exibição.
 */
export function campoPix(tipo: TipoPix): TipoCampo {
  const aleatoria = tipo === "aleatoria";
  const base = aleatoria ? null : BASE[tipo];
  // CPF, CNPJ e telefone: a forma do tipo base. E-mail e aleatória: a gravação só apara e põe em
  // minúscula, então nada se perde.
  const limpo = base ? base.limpo : () => true;
  const r = (t: string): ResultadoPix =>
    limpo(t) ? validarChavePix(tipo, t) : { ok: false, erro: `Informe só a chave PIX (${TIPO_PIX_LABELS[tipo]}), sem outro texto.` };
  return {
    mascarar: aleatoria ? (t) => t.toLowerCase().replace(/[^0-9a-f-]/g, "").slice(0, 36) : base!.mascarar,
    normalizar: (t) => {
      const x = r(t);
      return x.ok ? x.chave : t.trim();
    },
    validar: (t) => t.trim() === "" || r(t).ok,
    limpo,
    motivo: (t) => {
      const x = r(t);
      return x.ok ? "" : x.erro;
    },
    essencia: (t) => {
      const x = r(t);
      return x.ok ? x.chave : t.trim();
    },
    significativo: aleatoria ? (c) => /[0-9a-fA-F-]/.test(c) : base!.significativo,
    mensagem: `Chave PIX (${TIPO_PIX_LABELS[tipo]}) inválida.`,
    inputMode: aleatoria ? "text" : base!.inputMode,
    placeholder: aleatoria ? "00000000-0000-0000-0000-000000000000" : base!.placeholder,
  };
}
