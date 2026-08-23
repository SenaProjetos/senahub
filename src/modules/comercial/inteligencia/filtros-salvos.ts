export const CHAVE_FILTROS_SALVOS = "comercial_filtros_inteligencia";
export const LIMITE_FILTROS_SALVOS = 20;

export const CHAVES_PARAM_INTELIGENCIA = [
  "resp",
  "camp",
  "canal",
  "empresa",
  "temp",
  "periodo",
  "disc",
  "segmento",
  "tipo",
  "uf",
  "perfil",
  "parceiro",
  "foco",
] as const;

export type ChaveParamInteligencia = (typeof CHAVES_PARAM_INTELIGENCIA)[number];
export type ParamsInteligencia = Partial<Record<ChaveParamInteligencia, string>>;

export type FiltroInteligenciaSalvo = {
  id: string;
  nome: string;
  params: ParamsInteligencia;
};

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo && limpo.length <= max ? limpo : null;
}

/** Leitura defensiva do JSON de preferência: item inválido é ignorado, nunca derruba a página. */
export function parseFiltrosSalvos(valor: unknown): FiltroInteligenciaSalvo[] {
  if (!Array.isArray(valor)) return [];
  const saida: FiltroInteligenciaSalvo[] = [];
  const ids = new Set<string>();
  for (const bruto of valor) {
    if (typeof bruto !== "object" || bruto == null) continue;
    const item = bruto as Record<string, unknown>;
    const id = texto(item.id, 80);
    const nome = texto(item.nome, 60);
    if (!id || !nome || ids.has(id) || typeof item.params !== "object" || item.params == null) {
      continue;
    }
    const params: ParamsInteligencia = {};
    const origem = item.params as Record<string, unknown>;
    for (const chave of CHAVES_PARAM_INTELIGENCIA) {
      const valorParam = texto(origem[chave], 150);
      if (valorParam) params[chave] = valorParam;
    }
    ids.add(id);
    saida.push({ id, nome, params });
    if (saida.length === LIMITE_FILTROS_SALVOS) break;
  }
  return saida;
}

/** Mantém somente chaves conhecidas antes de persistir ou reconstruir a URL. */
export function normalizarParams(params: Record<string, string>): ParamsInteligencia {
  const normalizados: ParamsInteligencia = {};
  for (const chave of CHAVES_PARAM_INTELIGENCIA) {
    const valor = texto(params[chave], 150);
    if (valor) normalizados[chave] = valor;
  }
  return normalizados;
}
