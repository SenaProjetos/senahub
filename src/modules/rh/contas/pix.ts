/**
 * Validação e normalização de chave PIX por tipo. **Puro, sem I/O** — como `encargos.ts` e
 * `aquisitivo.ts`. Server Actions e formulário usam a mesma função, para a mensagem de erro
 * ser idêntica nos dois lados.
 *
 * Reusa `validarCPF`/`validarCNPJ` de `lib/documento.ts` — os dígitos verificadores já estavam
 * implementados e testados lá.
 *
 * A chave é guardada **normalizada** (só dígitos no CPF/CNPJ, `+55DDDNNNNNNNNN` no telefone,
 * minúscula no e-mail): é o formato que o banco espera e o que evita duplicata por formatação.
 */
import { validarCPF, validarCNPJ } from "@/lib/documento";

export const TIPOS_PIX = ["cpf", "cnpj", "email", "telefone", "aleatoria"] as const;
export type TipoPix = (typeof TIPOS_PIX)[number];

export const TIPO_PIX_LABELS: Record<TipoPix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

export type ResultadoPix = { ok: true; chave: string } | { ok: false; erro: string };

/** Limite do BACEN para chave de e-mail. */
const MAX_EMAIL = 77;

// Simples de propósito: e-mail de PIX é validado de verdade pelo banco no cadastro da chave.
// Aqui só barramos o obviamente errado, sem inventar uma RFC 5322 caseira.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const digitos = (s: string) => s.replace(/\D/g, "");

/**
 * Valida a chave para o tipo informado e devolve a forma normalizada a persistir.
 * Chave vazia é tratada como "não informada" pelo chamador — aqui ela é erro explícito.
 */
export function validarChavePix(tipo: TipoPix, valor: string): ResultadoPix {
  const bruto = valor.trim();
  if (!bruto) return { ok: false, erro: "Informe a chave PIX." };

  switch (tipo) {
    case "cpf": {
      const d = digitos(bruto);
      if (d.length !== 11) return { ok: false, erro: "CPF deve ter 11 dígitos." };
      if (!validarCPF(d)) return { ok: false, erro: "CPF inválido." };
      return { ok: true, chave: d };
    }
    case "cnpj": {
      const d = digitos(bruto);
      if (d.length !== 14) return { ok: false, erro: "CNPJ deve ter 14 dígitos." };
      if (!validarCNPJ(d)) return { ok: false, erro: "CNPJ inválido." };
      return { ok: true, chave: d };
    }
    case "email": {
      const e = bruto.toLowerCase();
      if (e.length > MAX_EMAIL) return { ok: false, erro: `E-mail deve ter no máximo ${MAX_EMAIL} caracteres.` };
      if (!RE_EMAIL.test(e)) return { ok: false, erro: "E-mail inválido." };
      return { ok: true, chave: e };
    }
    case "telefone": {
      // Aceita "(31) 99999-8888", "31999998888" e "+5531999998888" — normaliza p/ +55DDD…
      let d = digitos(bruto);
      if (d.startsWith("55") && d.length > 11) d = d.slice(2);
      if (d.length !== 10 && d.length !== 11) {
        return { ok: false, erro: "Telefone deve ter DDD + 8 ou 9 dígitos." };
      }
      const ddd = Number(d.slice(0, 2));
      if (ddd < 11 || ddd > 99) return { ok: false, erro: "DDD inválido." };
      if (d.length === 11 && d[2] !== "9") return { ok: false, erro: "Celular com 9 dígitos deve começar com 9." };
      return { ok: true, chave: `+55${d}` };
    }
    case "aleatoria": {
      const u = bruto.toLowerCase();
      if (!RE_UUID.test(u)) {
        return { ok: false, erro: "Chave aleatória deve ser um UUID (36 caracteres com hífens)." };
      }
      return { ok: true, chave: u };
    }
  }
}

/** Exibição: devolve a chave com máscara amigável. Nunca usar para persistir. */
export function formatarChavePix(tipo: TipoPix, chave: string): string {
  switch (tipo) {
    case "cpf":
      return chave.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    case "cnpj":
      return chave.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    case "telefone":
      return chave.replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
    default:
      return chave;
  }
}
