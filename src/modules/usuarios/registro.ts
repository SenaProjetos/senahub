/**
 * Registro profissional (CREA/CAU/CFT) do usuário: catálogos e formatação do rótulo.
 * Puro e client-safe — usado pela UI de cadastro, pelo cadastro de ARTs e pelo cabeçalho
 * do memorial de cálculo.
 */

/** Conselhos aceitos. "Outro" cobre conselhos regionais menos comuns (CRQ, CRMV, …). */
export const CONSELHOS = ["CREA", "CAU", "CFT", "Outro"] as const;
export type Conselho = (typeof CONSELHOS)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS)[number];

type DadosRegistro = {
  conselho?: string | null;
  registroProfissional?: string | null;
  registroUf?: string | null;
};

const limpo = (v?: string | null) => v?.trim() || "";

/**
 * Rótulo do registro profissional: `"CREA-SP 123456"`, ou `"CAU A99"` sem UF.
 * `null` quando falta conselho ou número — quem exibe decide o fallback.
 */
export function formatarRegistro(dados: DadosRegistro | null | undefined): string | null {
  const conselho = limpo(dados?.conselho);
  const numero = limpo(dados?.registroProfissional);
  if (!conselho || !numero) return null;
  const uf = limpo(dados?.registroUf).toUpperCase();
  return `${conselho}${uf ? `-${uf}` : ""} ${numero}`;
}
