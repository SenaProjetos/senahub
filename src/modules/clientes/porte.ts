/** Opções padronizadas de porte — compatíveis com a classificação pública do CNPJ. */
export const PORTES_CLIENTE = [
  { valor: "microempresa", rotulo: "Microempresa" },
  { valor: "empresa_pequeno_porte", rotulo: "Empresa de pequeno porte" },
  { valor: "demais_portes", rotulo: "Demais portes" },
] as const;

export type PorteCliente = (typeof PORTES_CLIENTE)[number]["valor"];

export function porteDoCnpj(porte: string | null | undefined, codigo: number | null | undefined): PorteCliente | undefined {
  if (codigo === 1 || porte?.toUpperCase() === "MICRO EMPRESA") return "microempresa";
  if (codigo === 3 || porte?.toUpperCase() === "EMPRESA DE PEQUENO PORTE") return "empresa_pequeno_porte";
  if (codigo === 5 || porte?.toUpperCase() === "DEMAIS") return "demais_portes";
  return undefined;
}
