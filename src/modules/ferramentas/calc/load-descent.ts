/**
 * Engine E12 — Descida de cargas por área de influência (NBR 6120:2019).
 * Puro. Áreas em m², cargas distribuídas em kN/m², cargas concentradas e resultados em kN.
 *
 * Acumula, do topo à base, a carga vertical em um pilar (ou apoio) somando a contribuição de cada
 * pavimento: A · (g + q) + carga concentrada extra (peso próprio do pilar, alvenaria, vigas).
 * Permanente (g, extra) e acidental (q) são acumuladas SEPARADAMENTE.
 *
 * Sobrecargas de uso (q): devem vir da Tabela 10 da NBR 6120:2019 (entrada do usuário).
 * Redução da carga acidental: a NBR 6120:2019 (6.2.2) permite reduzir a acidental acumulada no
 * dimensionamento de pilares/fundações conforme o nº de pavimentos. Aqui é um FATOR opcional
 * informado pelo engenheiro (default 1,0 = sem redução), aplicado à acidental total na base.
 */

import { z } from "zod";

const pavimentoSchema = z.object({
  nome: z.string().min(1),
  area: z.number().min(0), // m² — área de influência neste pavimento
  g: z.number().min(0), // kN/m² — carga permanente distribuída
  q: z.number().min(0), // kN/m² — sobrecarga de uso (NBR 6120 Tab. 10)
  extra: z.number().min(0).default(0), // kN — concentrada permanente (pilar, alvenaria, vigas)
});

export const entradaSchema = z.object({
  /** Do topo (cobertura) à base (fundação). */
  pavimentos: z.array(pavimentoSchema).min(1),
  /** Fator de redução da acidental acumulada (NBR 6120 6.2.2). 1 = sem redução. */
  fatorReducaoSobrecarga: z.number().min(0).max(1).default(1),
});

export type EntradaDescida = z.infer<typeof entradaSchema>;
export type EntradaDescidaInput = z.input<typeof entradaSchema>;

export type NivelDescida = {
  nome: string;
  /** Carga só deste pavimento (permanente + acidental). */
  cargaPiso: number;
  ngPiso: number;
  nqPiso: number;
  /** Acumulado do topo até este nível (sem redução). */
  ngAcum: number;
  nqAcum: number;
  nAcum: number;
};

export type ResultadoDescida = {
  niveis: NivelDescida[];
  /** Totais na base (último nível). */
  ngTotal: number; // permanente acumulada
  nqTotal: number; // acidental acumulada (sem redução)
  nqReduzido: number; // acidental × fator
  nTotal: number; // permanente + acidental reduzida (carga de projeto na base)
  fator: number;
};

export function calcular(input: EntradaDescidaInput): ResultadoDescida {
  const v = entradaSchema.parse(input);

  let ngAcum = 0;
  let nqAcum = 0;
  const niveis: NivelDescida[] = v.pavimentos.map((p) => {
    const ngPiso = p.area * p.g + p.extra;
    const nqPiso = p.area * p.q;
    ngAcum += ngPiso;
    nqAcum += nqPiso;
    return {
      nome: p.nome,
      cargaPiso: ngPiso + nqPiso,
      ngPiso,
      nqPiso,
      ngAcum,
      nqAcum,
      nAcum: ngAcum + nqAcum,
    };
  });

  const nqReduzido = nqAcum * v.fatorReducaoSobrecarga;

  return {
    niveis,
    ngTotal: ngAcum,
    nqTotal: nqAcum,
    nqReduzido,
    nTotal: ngAcum + nqReduzido,
    fator: v.fatorReducaoSobrecarga,
  };
}
