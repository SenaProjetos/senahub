/**
 * Rentabilidade por projeto (DRE por projeto), puro e testável.
 *
 * Custos indiretos (despesas confirmadas SEM projeto vinculado) são rateados entre
 * os projetos na proporção da receita confirmada de cada um (decisão aprovada).
 *   lucroBruto   = receita − custos diretos
 *   lucroLiquido = lucroBruto − indireto rateado
 *   ROI          = lucroLiquido / (diretos + indireto rateado)
 */

export type ProjetoEntrada = {
  projetoId: string;
  codigo: string;
  nome: string;
  cliente: string | null;
  receita: number;
  diretos: number;
};

export type ProjetoRentab = ProjetoEntrada & {
  indiretoRateado: number;
  lucroBruto: number;
  lucroLiquido: number;
  margemBruta: number | null;
  margemLiquida: number | null;
  roi: number | null;
};

export type TotaisRentab = {
  receita: number;
  diretos: number;
  indireto: number;
  lucroBruto: number;
  lucroLiquido: number;
  margemLiquida: number | null;
};

export type ResultadoRentab = {
  projetos: ProjetoRentab[];
  totais: TotaisRentab;
  alertas: ProjetoRentab[];
};

const cent = (v: number) => Math.round(v * 100) / 100;
const pct = (num: number, den: number): number | null => (den !== 0 ? Math.round((num / den) * 1000) / 10 : null);

export function calcularRentabilidade(
  projetos: ProjetoEntrada[],
  totalIndireto: number,
  margemMinima = 0,
): ResultadoRentab {
  const receitaTotal = projetos.reduce((s, p) => s + p.receita, 0);

  const calculados: ProjetoRentab[] = projetos.map((p) => {
    const indiretoRateado = receitaTotal > 0 ? cent(totalIndireto * (p.receita / receitaTotal)) : 0;
    const lucroBruto = cent(p.receita - p.diretos);
    const lucroLiquido = cent(lucroBruto - indiretoRateado);
    return {
      ...p,
      indiretoRateado,
      lucroBruto,
      lucroLiquido,
      margemBruta: pct(lucroBruto, p.receita),
      margemLiquida: pct(lucroLiquido, p.receita),
      roi: pct(lucroLiquido, p.diretos + indiretoRateado),
    };
  });

  calculados.sort((a, b) => b.lucroLiquido - a.lucroLiquido);

  const diretos = cent(projetos.reduce((s, p) => s + p.diretos, 0));
  const lucroBruto = cent(receitaTotal - diretos);
  const lucroLiquido = cent(lucroBruto - totalIndireto);

  return {
    projetos: calculados,
    totais: {
      receita: cent(receitaTotal),
      diretos,
      indireto: cent(totalIndireto),
      lucroBruto,
      lucroLiquido,
      margemLiquida: pct(lucroLiquido, receitaTotal),
    },
    alertas: calculados.filter((p) => p.margemLiquida != null && p.margemLiquida < margemMinima),
  };
}

export type ClienteRentab = { cliente: string; receita: number; lucroLiquido: number; projetos: number };

/** Agrega a rentabilidade por cliente (para o ranking de clientes mais lucrativos). */
export function rentabilidadePorCliente(projetos: ProjetoRentab[]): ClienteRentab[] {
  const mapa = new Map<string, ClienteRentab>();
  for (const p of projetos) {
    const k = p.cliente ?? "Sem cliente";
    const cur = mapa.get(k) ?? { cliente: k, receita: 0, lucroLiquido: 0, projetos: 0 };
    cur.receita = cent(cur.receita + p.receita);
    cur.lucroLiquido = cent(cur.lucroLiquido + p.lucroLiquido);
    cur.projetos += 1;
    mapa.set(k, cur);
  }
  return [...mapa.values()].sort((a, b) => b.lucroLiquido - a.lucroLiquido);
}

export type CoordenadorRentab = { coordenador: string; receita: number; lucroLiquido: number; projetos: number };

/** Agrega a rentabilidade por coordenador do projeto (mapeamento projetoId → nome). */
export function agruparPorCoordenador(
  projetos: ProjetoRentab[],
  coordPorProjeto: Record<string, string>,
): CoordenadorRentab[] {
  const mapa = new Map<string, CoordenadorRentab>();
  for (const p of projetos) {
    const c = coordPorProjeto[p.projetoId] ?? "Sem coordenador";
    const cur = mapa.get(c) ?? { coordenador: c, receita: 0, lucroLiquido: 0, projetos: 0 };
    cur.receita = cent(cur.receita + p.receita);
    cur.lucroLiquido = cent(cur.lucroLiquido + p.lucroLiquido);
    cur.projetos += 1;
    mapa.set(c, cur);
  }
  return [...mapa.values()].sort((a, b) => b.lucroLiquido - a.lucroLiquido);
}
