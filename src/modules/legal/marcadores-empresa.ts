/**
 * Marcadores `[ ... ]` do Termo de Uso que vêm de Configurações → Empresa.
 *
 * Módulo puro e SEM o texto dos termos: a tela de Empresa (cliente) importa daqui para avisar o
 * que falta preencher, sem puxar os termos inteiros para o bundle. `termos.ts` usa o mesmo mapa
 * para preencher o texto exibido e hasheado no aceite.
 *
 * Campo vazio mantém o marcador visível no termo — é o sinal honesto de que falta dado, em vez
 * de um texto genérico que passaria despercebido.
 */

export type EmpresaTermo = {
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  /** Nome e e-mail do Encarregado pelo tratamento de dados pessoais (DPO — LGPD). */
  encarregadoDados: string | null;
  /** Foro eleito: comarca e UF. */
  foro: string | null;
};

type Marcador = { marcador: string; campo: keyof EmpresaTermo; rotulo: string };

export const MARCADORES_EMPRESA: readonly Marcador[] = [
  { marcador: "[RAZÃO SOCIAL COMPLETA]", campo: "razaoSocial", rotulo: "Razão social" },
  { marcador: "[CNPJ]", campo: "cnpj", rotulo: "CNPJ" },
  { marcador: "[ENDEREÇO COMPLETO — CIDADE/UF]", campo: "endereco", rotulo: "Endereço" },
  { marcador: "[ENDEREÇO — CIDADE/UF]", campo: "endereco", rotulo: "Endereço" },
  { marcador: "[NOME/E-MAIL DO ENCARREGADO (DPO)]", campo: "encarregadoDados", rotulo: "Encarregado de dados (DPO)" },
  { marcador: "[COMARCA — CIDADE/UF]", campo: "foro", rotulo: "Foro (comarca/UF)" },
];

function valor(empresa: EmpresaTermo | null, campo: keyof EmpresaTermo): string | null {
  const v = empresa?.[campo];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Substitui cada marcador pelo dado da empresa; o que estiver vazio continua como marcador. */
export function preencherMarcadoresEmpresa(texto: string, empresa: EmpresaTermo | null): string {
  let saida = texto;
  for (const m of MARCADORES_EMPRESA) {
    const v = valor(empresa, m.campo);
    // Endereço em texto livre pode ter quebra de linha — no termo vira uma linha só.
    if (v) saida = saida.split(m.marcador).join(v.replace(/\s*\n\s*/g, ", "));
  }
  return saida;
}

/** Rótulos (sem repetição) dos dados que o Termo de Uso usa e ainda estão vazios. */
export function camposTermoPendentes(empresa: EmpresaTermo | null): string[] {
  const pendentes = MARCADORES_EMPRESA.filter((m) => !valor(empresa, m.campo)).map((m) => m.rotulo);
  return [...new Set(pendentes)];
}
