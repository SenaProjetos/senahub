import { NBR_5410 } from "./fontes";

/**
 * NBR 5410:2004, item 9.5.2 (locais de habitação) — **puro**. Lido no PDF (págs. 191–192 do arquivo; 183–184
 * impressas) e na spec §4.3. Vale para habitação, incluindo flats e apart-hotéis (9.5.1).
 *
 * São critérios em texto (não tabelas): ficam aqui como constantes com a fonte, e as contas em `habitacao.ts`.
 */

export const FONTE_HABITACAO = NBR_5410;

/** 9.5.2.1.2 — iluminação (alternativa à NBR 5413): por cômodo, carga mínima. Pág. 191 do PDF. */
export const ILUMINACAO_HABITACAO = {
  item: "9.5.2.1.2",
  pagina: 191,
  /** a) área igual ou inferior a 6 m²: 100 VA. */
  areaBaseM2: 6,
  cargaBaseVA: 100,
  /** b) acima de 6 m²: + 60 VA para cada aumento de 4 m² inteiros. */
  passoM2: 4,
  acrescimoVA: 60,
  nota: "Os valores apurados correspondem à potência destinada a iluminação para efeito de dimensionamento dos circuitos, e não necessariamente à potência nominal das lâmpadas.",
} as const;

/** Tipos de cômodo da habitação, na ordem e com os nomes da spec §3.3. */
export const TIPOS_COMODO = ["banheiro", "cozinha", "varanda", "sala", "dormitorio", "demais"] as const;
export type TipoComodo = (typeof TIPOS_COMODO)[number];

export const TIPO_COMODO_ROTULO: Record<TipoComodo, string> = {
  banheiro: "Banheiro",
  cozinha: "Cozinha, copa, copa-cozinha, área de serviço, lavanderia e análogos",
  varanda: "Varanda",
  sala: "Sala",
  dormitorio: "Dormitório",
  demais: "Demais cômodos",
};

/** 9.5.2.2.1 — número mínimo de pontos de tomada. Pág. 191 do PDF. */
export const TOMADAS_HABITACAO = {
  item: "9.5.2.2.1",
  pagina: 191,
  /** a) banheiro: pelo menos 1, próximo ao lavatório. */
  banheiro: 1,
  /** b) cozinha e análogos: 1 para cada 3,5 m, ou fração, de perímetro; no mínimo 2 tomadas acima da bancada. */
  cozinhaPerimetroM: 3.5,
  cozinhaMinimoBancada: 2,
  /** c) varanda: pelo menos 1. */
  varanda: 1,
  /** d) sala e dormitório: 1 para cada 5 m, ou fração, de perímetro. */
  salaPerimetroM: 5,
  /** e) demais cômodos: até 6 m² (inclusive), 1; acima de 6 m², 1 para cada 5 m, ou fração, de perímetro. */
  demaisAreaLimiteM2: 6,
  demaisAteLimite: 1,
  demaisPerimetroM: 5,
} as const;

/** 9.5.2.2.2 — potências mínimas atribuíveis aos pontos de tomada. Pág. 192 do PDF. */
export const POTENCIA_TOMADAS_HABITACAO = {
  item: "9.5.2.2.2",
  pagina: 192,
  /** a) banheiros, cozinhas e análogos: 600 VA por ponto até 3 pontos, 100 VA nos excedentes, por ambiente. */
  grupoVA: 600,
  grupoAtePontos: 3,
  excedenteVA: 100,
  /** Conjunto desses ambientes com mais de 6 pontos: admite-se 600 VA até 2 pontos (escolha do projetista). */
  alternativaConjuntoAcimaDe: 6,
  alternativaAtePontos: 2,
  /** b) demais cômodos: 100 VA por ponto. */
  demaisVA: 100,
} as const;

/** Cômodos do grupo de 600 VA (9.5.2.2.2 a). */
export function noGrupoDe600(tipo: TipoComodo): boolean {
  return tipo === "banheiro" || tipo === "cozinha";
}
