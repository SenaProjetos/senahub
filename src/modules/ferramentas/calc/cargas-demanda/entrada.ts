/**
 * Entrada (cabo e proteção) — **puro**. Spec §5, passos 20, 22 a 24, e §4.1: FCT (Tabela 40, e Tabela 41 na linha
 * enterrada), FCA (Tabelas 42 a 45), seção pela capacidade de condução (Tabelas 36 a 39), seção mínima (Tabela 47),
 * neutro (Tabela 48) e condutor de proteção (Tabela 58), todos lidos de `biblioteca/nbr5410.ts`.
 *
 * Regras da spec §4.1: entre dois valores não interpola; a seção sugerida é a menor com capacidade ≥ Ib′; o FCT usa só
 * valores da tabela (ou o projetista digita); temperatura fora da tabela é recusada; no método D vale a coluna do solo.
 * Fator sem valor na tabela sai `sugerido = null` (a tela pede o valor digitado), nunca um número inventado.
 */

import {
  NBR5410_TABELA_33,
  NBR5410_TABELA_36,
  NBR5410_TABELA_37,
  NBR5410_TABELA_38,
  NBR5410_TABELA_39,
  NBR5410_TABELA_40,
  NBR5410_TABELA_41,
  NBR5410_TABELA_42,
  NBR5410_TABELA_43,
  NBR5410_TABELA_44,
  NBR5410_TABELA_45,
  NBR5410_TABELA_47,
  NBR5410_TABELA_48,
  NBR5410_TABELA_58,
  type MetodoReferencia,
} from "./biblioteca/nbr5410";
import { referenciaDe, type TabelaNorma } from "./biblioteca/tipos";
import { fator, type Ajustes, type FatorDoMetodo } from "./concessionarias/tipos";
import { MSG, type Mensagem } from "./mensagens";

export type Isolacao = "PVC" | "EPR_XLPE";
export type Material = "cobre" | "aluminio";
export type CondutoresCarregados = 2 | 3;
export type Meio = "ambiente" | "solo";

const EPS = 1e-9;
const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

// ─── Método de instalação (Tabela 33) ────────────────────────────────────────────────────────────────────────────

/** Métodos de referência que a Tabela 33 dá para um método de instalação (com a condição, quando a tabela traz). */
export function metodosDeReferencia(metodoInstalacao: string): { metodo: MetodoReferencia; condicao: string | null }[] {
  const linha = NBR5410_TABELA_33.linhas.find((l) => l.metodo_instalacao === metodoInstalacao);
  return (linha?.metodo_referencia ?? []).map((m) => ({ metodo: m.metodo as MetodoReferencia, condicao: m.condicao }));
}

/** Linha enterrada (método D) usa a coluna do solo da Tabela 40 (spec §4.1). */
export function meioDoMetodo(metodo: MetodoReferencia): Meio {
  return metodo === "D" ? "solo" : "ambiente";
}

// ─── Tabelas de capacidade (36 a 39) ─────────────────────────────────────────────────────────────────────────────

type TabelaCapacidade =
  | typeof NBR5410_TABELA_36
  | typeof NBR5410_TABELA_37
  | typeof NBR5410_TABELA_38
  | typeof NBR5410_TABELA_39;
const TABELAS_CAPACIDADE: readonly TabelaCapacidade[] = [NBR5410_TABELA_36, NBR5410_TABELA_37, NBR5410_TABELA_38, NBR5410_TABELA_39];

/** Isolação da tabela pelas condições de referência impressas nela ("PVC" ou "EPR ou XLPE"). */
function isolacaoDaTabela(t: TabelaCapacidade): Isolacao | null {
  const i = t.condicoesDeReferencia.isolacao;
  if (i === "PVC") return "PVC";
  if (i === "EPR ou XLPE") return "EPR_XLPE";
  return null;
}

/** Colunas da tabela que correspondem ao método e ao nº de condutores carregados. */
function colunasDe(t: TabelaCapacidade, metodo: MetodoReferencia, carregados: CondutoresCarregados): string[] {
  const chaves = Object.keys(t.linhas[0]).filter((k) => k !== "material" && k !== "secao_mm2");
  // Tabelas 36/37: "<método>_<n>". Tabelas 38/39: "<método>_<disposição>_<n>c[_<disposição>]".
  return chaves.filter((k) => k === `${metodo}_${carregados}` || (k.startsWith(`${metodo}_`) && k.includes(`_${carregados}c`)));
}

export type ColunaCapacidade = { tabela: TabelaCapacidade; coluna: string };

/**
 * Coluna consultada para método, isolação e nº de condutores carregados. Nas Tabelas 38/39 o método F com 3 condutores
 * e o método G têm mais de uma disposição: a lista traz todas e a escolha é do projetista (`disposicao` = nome da coluna).
 */
export function colunasDeCapacidade(
  metodo: MetodoReferencia,
  isolacao: Isolacao,
  carregados: CondutoresCarregados,
): ColunaCapacidade[] {
  return TABELAS_CAPACIDADE.filter((t) => isolacaoDaTabela(t) === isolacao).flatMap((t) =>
    colunasDe(t, metodo, carregados).map((coluna) => ({ tabela: t, coluna })),
  );
}

/** Seções da tabela para o material, em ordem crescente. */
export function secoesDaTabela(material: Material, tabela: TabelaCapacidade = NBR5410_TABELA_36): number[] {
  return tabela.linhas
    .filter((l) => l.material === material)
    .map((l) => l.secao_mm2)
    .sort((a, b) => a - b);
}

export type EntradaSecao = {
  metodo: MetodoReferencia;
  isolacao: Isolacao;
  material: Material;
  carregados: CondutoresCarregados;
  /** Nome da coluna nas Tabelas 38/39 quando há mais de uma disposição; sem ela, usa a primeira. */
  disposicao?: string;
  ibCorrigidaA: number;
};

export type ResultadoSecao = {
  /** Menor seção com capacidade ≥ Ib′. `null` = nenhuma seção da tabela atende (ou não há coluna). */
  secaoMm2: number | null;
  capacidadeA: number | null;
  /** Só no relatório: "ABNT NBR 5410 2004, Tabela 36, coluna B1_2". */
  referencia: string | null;
  /** Colunas possíveis (para a tela oferecer a disposição). */
  colunas: string[];
};

/** Passo 22 — menor seção com capacidade maior ou igual a Ib′, sem interpolação. */
export function secaoPelaCapacidade(e: EntradaSecao): ResultadoSecao {
  const opcoes = colunasDeCapacidade(e.metodo, e.isolacao, e.carregados);
  const escolhida = opcoes.find((o) => o.coluna === e.disposicao) ?? opcoes[0];
  const colunas = opcoes.map((o) => o.coluna);
  if (!escolhida) return { secaoMm2: null, capacidadeA: null, referencia: null, colunas };
  const linhas = escolhida.tabela.linhas
    .filter((l) => l.material === e.material)
    .slice()
    .sort((a, b) => a.secao_mm2 - b.secao_mm2);
  const referencia = `${referenciaDe(escolhida.tabela)}, coluna ${escolhida.coluna}`;
  for (const l of linhas) {
    const cap = l[escolhida.coluna];
    if (ehNumero(cap) && cap >= e.ibCorrigidaA - EPS) return { secaoMm2: l.secao_mm2, capacidadeA: cap, referencia, colunas };
  }
  return { secaoMm2: null, capacidadeA: null, referencia, colunas };
}

// ─── FCT (Tabela 40) e resistividade do solo (Tabela 41) ─────────────────────────────────────────────────────────

/**
 * Temperaturas de referência: as das condições impressas nas Tabelas 36 e 37 ("30°C (ar), 20°C (solo)"), que são as
 * temperaturas que a Tabela 40 não lista (o título dela diz "diferentes de 30ºC … e de 20ºC"). Nelas o FCT é 1.
 */
export function temperaturaDeReferencia(meio: Meio): number {
  const c = NBR5410_TABELA_36.condicoesDeReferencia;
  return meio === "solo" ? c.solo_C : c.ambiente_ar_C;
}

export type EntradaFct = { isolacao: Isolacao; meio: Meio; temperaturaC: number };

export type ResultadoFator = {
  fator: FatorDoMetodo;
  avisos: Mensagem[];
  /** Recusa (spec §6): temperatura fora da tabela e nenhum FCT digitado. */
  recusa: Mensagem | null;
};

/** FCT sugerido pela Tabela 40 (`null` = célula "–" ou temperatura que a tabela não tem). */
export function fctDaTabela(e: EntradaFct): number | null {
  if (Math.abs(e.temperaturaC - temperaturaDeReferencia(e.meio)) <= EPS) return 1;
  const linha = NBR5410_TABELA_40.linhas.find((l) => l.meio === e.meio && Math.abs(l.temperatura_C - e.temperaturaC) <= EPS);
  return linha?.[e.isolacao] ?? null;
}

/** Passo 20 — FCT: valor da tabela ou o digitado (`ajustes.fct`). Fora da tabela e sem digitado: recusa. */
export function fatorDeTemperatura(e: EntradaFct, ajustes?: Ajustes): ResultadoFator {
  const sugerido = fctDaTabela(e);
  const f = fator("fct", "Fator de temperatura", sugerido, referenciaDe(NBR5410_TABELA_40), ajustes, { simbolo: "FCT" });
  const avisos = e.meio === "solo" ? [MSG.linhaEnterrada()] : [];
  return { fator: f, avisos, recusa: f.adotado == null ? MSG.temperaturaForaTabela() : null };
}

/** Resistividade de referência da Tabela 41, lida do título ("… diferente de 2,5 K.m/W"). */
export function resistividadeDeReferencia(): number | null {
  const m = /diferente de ([\d,]+) K\.m\/W/.exec(NBR5410_TABELA_41.titulo);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Fator da Tabela 41 (linha enterrada). Resistividade de referência → 1; valor que a tabela não tem → `null`. */
export function fatorDeResistividade(resistividadeKmW: number, ajustes?: Ajustes): FatorDoMetodo {
  const ref = resistividadeDeReferencia();
  const sugerido =
    ref != null && Math.abs(resistividadeKmW - ref) <= EPS
      ? 1
      : (NBR5410_TABELA_41.linhas.find((l) => Math.abs(l.resistividade_K_m_W - resistividadeKmW) <= EPS)?.fator ?? null);
  return fator("frs", "Fator de resistividade do solo", sugerido, referenciaDe(NBR5410_TABELA_41), ajustes);
}

// ─── FCA (Tabelas 42 a 45) ───────────────────────────────────────────────────────────────────────────────────────

/** A chave da coluna ("3", "9 a 11", "4 ou 5", "≥20", "9 e mais") contém `n`? */
export function chaveContem(chave: string, n: number): boolean {
  const c = chave.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)$/.exec(c))) return n === Number(m[1]);
  if ((m = /^(\d+) (?:a|ou) (\d+)$/.exec(c))) return n >= Number(m[1]) && n <= Number(m[2]);
  if ((m = /^≥\s*(\d+)$/.exec(c)) || (m = /^(\d+) e mais$/.exec(c))) return n >= Number(m[1]);
  return false;
}

function valorPorChave(colunas: Readonly<Record<string, number | null>>, n: number): number | null {
  const k = Object.keys(colunas).find((x) => chaveContem(x, n));
  return k == null ? null : (colunas[k] ?? null);
}

const ORDEM_METODOS: readonly MetodoReferencia[] = ["A1", "A2", "B1", "B2", "C", "D", "E", "F", "G"];

/** Métodos citados na coluna "tabelas dos métodos de referência" da Tabela 42 ("(métodos A a F)", "(método C)"…). */
export function metodosDaLinha42(texto: string | undefined): MetodoReferencia[] {
  const m = /\(m[ée]todos? ([^)]+)\)/.exec(texto ?? "");
  if (!m) return [];
  const faixa = /^([A-G])\d? a ([A-G])\d?$/.exec(m[1].trim());
  if (faixa) {
    const i = ORDEM_METODOS.findIndex((x) => x.startsWith(faixa[1]));
    const j = ORDEM_METODOS.length - 1 - [...ORDEM_METODOS].reverse().findIndex((x) => x.startsWith(faixa[2]));
    return ORDEM_METODOS.slice(i, j + 1);
  }
  const letras = m[1].split(/\s*(?:,|\be\b)\s*/).map((s) => s.trim()).filter(Boolean);
  return ORDEM_METODOS.filter((x) => letras.some((l) => x.startsWith(l)));
}

/** Forma de agrupamento escolhida (uma linha/parte de uma das Tabelas 42 a 45). */
export type FormaAgrupamento =
  | { tabela: "42"; ref: number }
  | { tabela: "43" }
  | { tabela: "44"; distancia: string }
  | { tabela: "45"; parte: string; espacamento: string };

/**
 * Formas oferecidas para o método. Tabela 42: as linhas cuja coluna de métodos inclui o método (a primeira é a
 * sugestão, spec §3.3 "linha do método"). Tabela 43: métodos C, E e F (título dela). Tabelas 44 e 45: linha enterrada
 * (método D; títulos "diretamente enterrados" e "eletrodutos enterrados").
 */
export function formasDoMetodo(metodo: MetodoReferencia): FormaAgrupamento[] {
  const formas: FormaAgrupamento[] = NBR5410_TABELA_42.linhas
    .filter((l) => metodosDaLinha42(l.tabelas_dos_metodos_de_referencia).includes(metodo))
    .map((l) => ({ tabela: "42", ref: l.ref }));
  if (metodo === "C" || metodo === "E" || metodo === "F") formas.push({ tabela: "43" });
  if (metodo === "D") {
    for (const d of Object.keys(NBR5410_TABELA_44.linhas[0].fatores_por_distancia_entre_cabos)) formas.push({ tabela: "44", distancia: d });
    const partes = [...new Set(NBR5410_TABELA_45.linhas.map((l) => l.parte))];
    for (const parte of partes) {
      const linha = NBR5410_TABELA_45.linhas.find((l) => l.parte === parte)!;
      for (const esp of Object.keys(linha.fatores_por_espacamento_entre_eletrodutos)) formas.push({ tabela: "45", parte, espacamento: esp });
    }
  }
  return formas;
}

export type EntradaFca = {
  forma: FormaAgrupamento;
  /** Nº de circuitos agrupados (Tabelas 42, 44, 45) ou nº de circuitos por camada (Tabela 43). */
  circuitos: number;
  /** Só Tabela 43: nº de camadas. */
  camadas?: number;
};

const TABELA_DA_FORMA: Record<FormaAgrupamento["tabela"], TabelaNorma<unknown>> = {
  "42": NBR5410_TABELA_42,
  "43": NBR5410_TABELA_43,
  "44": NBR5410_TABELA_44,
  "45": NBR5410_TABELA_45,
};

/** FCA sugerido pela forma e pela contagem; `null` = a tabela não tem a contagem (ex.: Tabela 44 com 1 ou 7 circuitos). */
export function fcaDaTabela(e: EntradaFca): number | null {
  const n = e.circuitos;
  switch (e.forma.tabela) {
    case "42": {
      const ref = e.forma.ref;
      const linha = NBR5410_TABELA_42.linhas.find((l) => l.ref === ref);
      return linha ? valorPorChave(linha.fatores, n) : null;
    }
    case "43": {
      const camadas = e.camadas ?? 0;
      const linha = NBR5410_TABELA_43.linhas.find(
        (l) => camadas >= l.quantidade_de_camadas.de && (l.quantidade_de_camadas.ate == null || camadas <= l.quantidade_de_camadas.ate),
      );
      return linha ? valorPorChave(linha.fatores_por_circuitos_por_camada, n) : null;
    }
    case "44": {
      const d = e.forma.distancia;
      return NBR5410_TABELA_44.linhas.find((l) => l.numero_de_circuitos === n)?.fatores_por_distancia_entre_cabos[d] ?? null;
    }
    case "45": {
      const { parte, espacamento } = e.forma;
      return (
        NBR5410_TABELA_45.linhas.find((l) => l.parte === parte && l.numero_de_circuitos === n)?.fatores_por_espacamento_entre_eletrodutos[
          espacamento
        ] ?? null
      );
    }
  }
}

/** Passo 20 — FCA: valor da tabela ou o digitado (`ajustes.fca`). */
export function fatorDeAgrupamento(e: EntradaFca, ajustes?: Ajustes): FatorDoMetodo {
  return fator("fca", "Fator de agrupamento", fcaDaTabela(e), referenciaDe(TABELA_DA_FORMA[e.forma.tabela]), ajustes, {
    simbolo: "FCA",
  });
}

// ─── Seção mínima (Tabela 47) ────────────────────────────────────────────────────────────────────────────────────

/** Uso do circuito em instalação fixa com condutores e cabos isolados (Tabela 47; tomadas = força, nota 2). */
export type UsoDoCircuito = "iluminacao" | "forca" | "sinalizacao";

const PREFIXO_USO: Record<UsoDoCircuito, string> = {
  iluminacao: "Circuitos de iluminação",
  forca: "Circuitos de força",
  sinalizacao: "Circuitos de sinalização",
};

/** Seção mínima do uso, em mm². `null` = a tabela não traz valor para o material. */
export function secaoMinima(uso: UsoDoCircuito, material: Material): number | null {
  const linha = NBR5410_TABELA_47.linhas.find(
    (l) =>
      l.tipo_de_linha === "Instalações fixas em geral" &&
      l.subtipo === "Condutores e cabos isolados" &&
      l.utilizacao_do_circuito.startsWith(PREFIXO_USO[uso]),
  );
  if (!linha) return null;
  return material === "cobre" ? linha.cobre_mm2 : linha.aluminio_mm2;
}

export type ResultadoSecaoFinal = {
  /** Passo 23 — maior entre a seção pela capacidade e a mínima do uso. */
  sugeridaMm2: number | null;
  adotadaMm2: number | null;
  avisos: Mensagem[];
};

/** Passo 23 e alertas de seção da spec §6 (digitada menor que a calculada; abaixo da mínima). */
export function secaoAdotada(calculadaMm2: number | null, minimaMm2: number | null, digitadaMm2?: number): ResultadoSecaoFinal {
  const sugeridaMm2 = calculadaMm2 == null ? null : minimaMm2 == null ? calculadaMm2 : Math.max(calculadaMm2, minimaMm2);
  const digitada = ehNumero(digitadaMm2) ? digitadaMm2 : undefined;
  const adotadaMm2 = digitada ?? sugeridaMm2;
  const avisos: Mensagem[] = [];
  if (digitada != null && calculadaMm2 != null && digitada < calculadaMm2 - EPS) avisos.push(MSG.secaoDigitadaMenor());
  if (adotadaMm2 != null && minimaMm2 != null && adotadaMm2 < minimaMm2 - EPS) avisos.push(MSG.secaoAbaixoMinima(minimaMm2));
  return { sugeridaMm2, adotadaMm2, avisos };
}

// ─── Neutro (Tabela 48) e proteção (Tabela 58) ───────────────────────────────────────────────────────────────────

/** Valor literal da tabela ("S", "S/2" ou número) aplicado à seção da fase. */
function literalDaSecao(v: number | string, s: number): number | null {
  if (typeof v === "number") return v;
  const t = v.replace(/\s/g, "");
  if (t === "S") return s;
  const m = /^S\/(\d+)$/.exec(t);
  return m ? s / Number(m[1]) : null;
}

/** Menor seção da série (Tabela 36, material) maior ou igual a `x`. */
function secaoComercialAcima(x: number, material: Material): number | null {
  return secoesDaTabela(material).find((s) => s >= x - EPS) ?? null;
}

export type SugestaoCondutor = {
  /** Valor da tabela aplicado à fase (pode não ser seção comercial: "S/2"). */
  minimoMm2: number | null;
  /** Menor seção da série ≥ mínimo. */
  sugeridaMm2: number | null;
  referencia: string;
};

/** Passo 24 — neutro pela Tabela 48 (condições de uso em 6.2.6.2.6, nota da tabela). `null` = seção fora da tabela. */
export function neutroSugerido(secaoFaseMm2: number, material: Material): SugestaoCondutor {
  const linha = NBR5410_TABELA_48.linhas.find((l) => {
    const f = l.secao_fase_mm2;
    if (typeof f === "number") return Math.abs(f - secaoFaseMm2) <= EPS;
    return (f.de == null || secaoFaseMm2 >= f.de - EPS) && (f.ate == null || secaoFaseMm2 <= f.ate + EPS);
  });
  const minimoMm2 = linha ? literalDaSecao(linha.secao_neutro_mm2, secaoFaseMm2) : null;
  return {
    minimoMm2,
    sugeridaMm2: minimoMm2 == null ? null : secaoComercialAcima(minimoMm2, material),
    referencia: referenciaDe(NBR5410_TABELA_48),
  };
}

/** Passo 24 — condutor de proteção pela Tabela 58 ("S", 16, "S/2"), arredondado para a seção da série acima. */
export function protecaoSugerida(secaoFaseMm2: number, material: Material): SugestaoCondutor {
  const s = secaoFaseMm2;
  const linha = NBR5410_TABELA_58.linhas.find(({ secao_fase_S_mm2: f }) => {
    const acimaDe = f.de == null || (f.inclui_de === false ? s > f.de + EPS : s >= f.de - EPS);
    const abaixoDe = f.ate == null || (f.inclui_ate === false ? s < f.ate - EPS : s <= f.ate + EPS);
    return acimaDe && abaixoDe;
  });
  const minimoMm2 = linha ? literalDaSecao(linha.secao_minima_protecao_mm2, s) : null;
  return {
    minimoMm2,
    sugeridaMm2: minimoMm2 == null ? null : secaoComercialAcima(minimoMm2, material),
    referencia: referenciaDe(NBR5410_TABELA_58),
  };
}
